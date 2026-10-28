import { randomUUID } from 'node:crypto'
import { supabase } from '@/lib/supabase'
import { assertSafeOutboundUrl, safeOutboundFetchBuffer } from '@/lib/urlSecurity'
import { getEffectiveEntitlements, dashboardWriteAllowed } from '@/lib/saas/entitlements'
import { chunkText } from '@/lib/chunker'
import { embedBatch, hashText } from '@/lib/embeddings'
import { allowedKnowledgeUrl, canonicalKnowledgeUrl, crawlPolicyFromEntitlements, CRAWL_EXCLUDE_PATHS, selectKnowledgeUrls, type CrawlMode } from '@/lib/knowledgeCrawlPolicy'

const API = 'https://api.firecrawl.dev/v1'
export class KnowledgeCrawlError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}
async function provider(path: string, body?: unknown) {
  if (!process.env.FIRECRAWL_API_KEY) throw new KnowledgeCrawlError('Website import is not configured. Ask your administrator to connect the website crawler.', 503)
  // All provider URLs are assembled here; provider pagination may not change the host.
  const url = new URL(path, `${API}/`)
  if (url.origin !== 'https://api.firecrawl.dev' || !url.pathname.startsWith('/v1/')) throw new Error('Invalid crawl pagination URL')
  const { response, buffer } = await safeOutboundFetchBuffer(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(35_000), maxBytes: 12 * 1024 * 1024,
  })
  if (!response.ok) throw new KnowledgeCrawlError(response.status === 429 ? 'The website crawler is busy. Please try again shortly.' : `Website import provider rejected the request (${response.status}).`, 502)
  const result = JSON.parse(buffer.toString('utf8'))
  if (result.success === false) throw new KnowledgeCrawlError('The website could not be imported. Check that it is public and permits crawling.', 502)
  return result
}
export async function knowledgeCrawlPolicy(clientId: string) {
  const e = await getEffectiveEntitlements(clientId)
  if (!dashboardWriteAllowed(e) || !e.features['knowledge.enabled']) throw new KnowledgeCrawlError('Knowledge imports are unavailable for this workspace.', 403)
  return { ...crawlPolicyFromEntitlements(e), configured: !!process.env.FIRECRAWL_API_KEY }
}
async function rootUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2048 || !allowedKnowledgeUrl(value)) throw new KnowledgeCrawlError('Enter a public HTTPS website page suitable for your knowledge base.')
  try { await assertSafeOutboundUrl(value) } catch { throw new KnowledgeCrawlError('Enter a public HTTPS website address.') }
  return canonicalKnowledgeUrl(value)
}
export async function discoverKnowledgePages(clientId: string, value: unknown) {
  const policy = await knowledgeCrawlPolicy(clientId)
  if (!policy.configured) throw new KnowledgeCrawlError('Website import is not configured. Ask your administrator to connect the website crawler.', 503)
  if (!policy.modes.includes('selected')) throw new KnowledgeCrawlError('Page discovery is not enabled for your workspace.', 403)
  const url = await rootUrl(value)
  const reservation = await supabase.rpc('knowledge_reserve_crawl', { p_client: clientId, p_source: randomUUID(), p_amount: 1, p_mode: 'map' })
  if (reservation.error || !reservation.data?.allowed) throw new KnowledgeCrawlError(reservation.error?.message || 'Website discovery allowance reached.', 403)
  const result = await provider('map', { url, includeSubdomains: false, limit: 500 })
  const pages = [...new Set<string>((result.links || []).map((link: any) => typeof link === 'string' ? link : link.url)
    .filter((link: any) => typeof link === 'string' && allowedKnowledgeUrl(link, url)).map(canonicalKnowledgeUrl))].slice(0, 500)
  if (!pages.includes(url)) pages.unshift(url)
  return { pages, policy }
}
export async function startKnowledgeCrawl(datasetId: string, clientId: string, input: { source_ref?: unknown; mode?: unknown; selected_urls?: unknown; source_name?: unknown }) {
  const policy = await knowledgeCrawlPolicy(clientId)
  if (!policy.configured) throw new KnowledgeCrawlError('Website import is not configured. Ask your administrator to connect the website crawler.', 503)
  const mode = (input.mode || 'single') as CrawlMode
  if (!policy.modes.includes(mode)) throw new KnowledgeCrawlError('This website import mode is not enabled by your administrator.', 403)
  const url = await rootUrl(input.source_ref)
  const urls = mode === 'selected' ? selectKnowledgeUrls(input.selected_urls, url, policy.maxPages) : [url]
  for (const selected of urls) await assertSafeOutboundUrl(selected)
  const budget = mode === 'deep' ? policy.maxPages : urls.length
  const state: any = { mode, root: url, budget, selected: mode === 'selected' ? urls : undefined, seen: [], started_at: new Date().toISOString() }
  const { data: source, error } = await supabase.from('dataset_sources').insert({
    dataset_id: datasetId, source_type: 'website_crawl', source_ref: url,
    source_name: typeof input.source_name === 'string' ? input.source_name.trim().slice(0, 200) || new URL(url).hostname : new URL(url).hostname,
    status: 'pending', crawl_state: state,
  }).select().single()
  if (error) throw new KnowledgeCrawlError(error.code === 'PGRST204' || error.code === '42703' ? 'Apply supabase/105_knowledge_crawl_guardrails.sql to enable website imports.' : 'Could not save the website source.', 503)
  let reserved = false
  try {
    const reservation = await supabase.rpc('knowledge_reserve_crawl', { p_client: clientId, p_source: source.id, p_amount: budget, p_mode: mode })
    if (reservation.error || !reservation.data?.allowed) throw new KnowledgeCrawlError(reservation.error?.message || 'Website page allowance reached.', 403)
    reserved = true
    const scrapeOptions = { formats: ['markdown'], onlyMainContent: true, excludeTags: ['nav', 'footer', 'header', 'aside', 'script', 'style'], timeout: 25_000 }
    if (mode === 'single') {
      const result = await provider('scrape', { url, ...scrapeOptions })
      const page = result.data
      if (!page?.markdown) throw new KnowledgeCrawlError('No readable content was found on this page.')
      state.job_id = 'single'
      // Persist just one bounded page so an interrupted ingestion can resume locally.
      state.page = { markdown: String(page.markdown).slice(0, 20_000), metadata: page.metadata }
    } else {
      const result = await provider(mode === 'selected' ? 'batch/scrape' : 'crawl', mode === 'selected' ? { urls, ...scrapeOptions } : {
        url, limit: budget, maxDepth: policy.maxDepth,
        allowExternalLinks: false, allowBackwardLinks: false, ignoreQueryParameters: true,
        excludePaths: CRAWL_EXCLUDE_PATHS, scrapeOptions,
      })
      if (!result.id || !/^[a-zA-Z0-9_-]{1,150}$/.test(result.id)) throw new KnowledgeCrawlError('Website import did not return a valid job. Please try again.', 502)
      state.job_id = result.id
    }
    const updated = await supabase.from('dataset_sources').update({ status: 'processing', crawl_state: state, error_msg: null }).eq('id', source.id).select().single()
    if (updated.error) throw new Error('Could not save website import progress.')
    await supabase.from('datasets').update({ status: 'processing' }).eq('id', datasetId).eq('client_id', clientId)
    return updated.data
  } catch (error) {
    const message = error instanceof KnowledgeCrawlError ? error.message : 'Website import was interrupted. Please retry the source.'
    await supabase.from('dataset_sources').update({ status: 'error', error_msg: message }).eq('id', source.id)
    // A provider timeout can still spend credits; preserve the reservation rather
    // than refunding an unknown external outcome and enabling runaway retries.
    if (reserved) console.warn('[knowledge crawl] Reserved job did not start successfully', source.id)
    throw error
  }
}

export async function pollKnowledgeCrawl(sourceId: string) {
  const token = randomUUID()
  const claim = await supabase.rpc('knowledge_claim_crawl', { p_source: sourceId, p_token: token })
  if (claim.error) throw new KnowledgeCrawlError('Website import storage is unavailable. Apply migration 105.', 503)
  if (!claim.data) return
  const source = claim.data, state = { ...source.crawl_state }
  try {
    if (Date.now() - Date.parse(state.started_at) > 7 * 24 * 60 * 60_000) { state.restart_required = true; throw new KnowledgeCrawlError('Website import expired. Please retry the source.') }
    const endpoint = state.mode === 'selected' ? 'batch/scrape' : 'crawl'
    const result = state.mode === 'single' ? { status: 'completed', data: [state.page] } : await provider(state.cursor || `${endpoint}/${encodeURIComponent(state.job_id)}`)
    if (['failed', 'cancelled'].includes(result.status)) { state.restart_required = true; throw new KnowledgeCrawlError('The website import could not finish. Please retry the source.') }
    const seen = new Set<string>(state.seen || [])
    const candidates: { url: string; page: any }[] = []
    for (const page of Array.isArray(result.data) ? result.data : []) {
      if ([page?.metadata?.sourceURL, page?.metadata?.url, page?.url].some(value => value && !allowedKnowledgeUrl(value, state.root))) continue
      const raw = page?.metadata?.sourceURL || page?.metadata?.url || page?.url || (state.mode === 'single' ? state.root : '')
      if (!allowedKnowledgeUrl(raw, state.root)) continue
      const url = canonicalKnowledgeUrl(raw)
      if (state.mode === 'single' && url !== state.root) continue
      if (state.mode === 'selected' && !state.selected?.includes(url)) continue
      if (!seen.has(url) && !candidates.some(item => item.url === url)) candidates.push({ url, page })
    }
    const remaining = Math.max(0, Math.min(500, state.budget) - seen.size)
    // One page per lease keeps memory and embedding concurrency bounded.
    const candidate = remaining > 0 ? candidates[0] : undefined
    const chunks: any[] = []
    if (candidate) {
      const texts = await chunkText(String(candidate.page.markdown || '').slice(0, 20_000))
      const vectors = texts.length ? await embedBatch(texts) : []
      if (vectors.length !== texts.length || vectors.some(v => !Array.isArray(v) || v.length !== 768 || v.some(n => !Number.isFinite(n)))) throw new Error('Embedding failed')
      for (let i = 0; i < texts.length; i++) chunks.push({ text: texts[i], chunk_hash: hashText(texts[i]), embedding: JSON.stringify(vectors[i]), source_url: candidate.url, title: String(candidate.page.metadata?.title || candidate.url).slice(0, 300) })
      seen.add(candidate.url)
    }
    state.seen = [...seen]
    const batchFinished = candidates.length <= (candidate ? 1 : 0)
    let done = seen.size >= state.budget
    if (batchFinished) {
      if (result.next) {
        const next = new URL(result.next)
        if (next.origin !== 'https://api.firecrawl.dev' || !next.pathname.startsWith(`/v1/${endpoint}/${state.job_id}`)) throw new Error('Invalid pagination')
        state.cursor = next.toString()
      } else {
        delete state.cursor
        done = done || result.status === 'completed'
      }
    }
    if (done) delete state.page
    const commit = await supabase.rpc('knowledge_commit_crawl', { p_source: sourceId, p_token: token, p_chunks: chunks, p_state: state, p_done: done, p_error: null })
    if (commit.error) throw new Error('Could not save imported website content')
  } catch (error) {
    const message = error instanceof KnowledgeCrawlError ? error.message : 'Website import could not finish. Retry the source to continue.'
    const failed = await supabase.rpc('knowledge_commit_crawl', { p_source: sourceId, p_token: token, p_chunks: [], p_state: { ...source.crawl_state, ...(state.restart_required ? { restart_required: true } : {}) }, p_done: true, p_error: message })
    if (failed.error) throw new Error('Could not save website import status')
  }
}
