import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { embed, hashText } from '@/lib/embeddings'
import { getAuthenticatedWorkspaceResource } from '@/lib/requestAuth'
import { discoverKnowledgePages, knowledgeCrawlPolicy, KnowledgeCrawlError, pollKnowledgeCrawl, startKnowledgeCrawl } from '@/lib/knowledgeCrawler'
import { crawlRateLimit, documentImportRateLimit } from '@/lib/ratelimit'
import { acquireDocumentImport, documentPolicy, DocumentImportError } from '@/lib/knowledge/documentPolicy'
import { fetchDocumentLink } from '@/lib/knowledge/documentLinks'
import { ingestDocumentBuffer, processDocumentSource } from '@/lib/knowledge/documentIngestion'

export const maxDuration = 60

// ─── Helper: chunk text into ~500 char segments ───────────────────
function chunkText(text: string, maxChars = 500): string[] {
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 20)
  const chunks: string[] = []
  let current = ''
  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > maxChars && current.length > 0) {
      chunks.push(current.trim())
      current = para
    } else {
      current = current ? current + '\n\n' + para : para
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

// ─── Helper: embed + insert chunks ───────────────────────────────
async function embedAndInsert(chunks: string[], dataset_id: string, source_id: string, client_id: string) {
  const embedded: any[] = []
  for (const text of chunks) {
    try {
      const embeddingValues = await embed(text)
      if (embeddingValues && embeddingValues.length > 0) {
        embedded.push({ 
          dataset_id, 
          dataset_source_id: source_id, 
          text: text,
          chunk_hash: hashText(text),
          embedding: JSON.stringify(embeddingValues), 
          active: true 
        })
      }
    } catch (err) { 
      console.error('[Embedding Error]:', err)
    }
  }
  
  if (embedded.length > 0) {
    for (let i = 0; i < embedded.length; i += 50) {
      await supabase.from('chunks').insert(embedded.slice(i, i + 50))
    }
  }
  return embedded.length
}

// ─── Helper: recalculate dataset status ──────────────────────────
async function recalcDataset(dataset_id: string) {
  const { count: totalChunks } = await supabase.from('chunks').select('id', { count: 'exact', head: true }).eq('dataset_id', dataset_id).eq('active', true)
  const { count: totalSources } = await supabase.from('dataset_sources').select('id', { count: 'exact', head: true }).eq('dataset_id', dataset_id)
  const { count: readySources } = await supabase.from('dataset_sources').select('id', { count: 'exact', head: true }).eq('dataset_id', dataset_id).eq('status', 'ready')
  const { count: errorSources } = await supabase.from('dataset_sources').select('id', { count: 'exact', head: true }).eq('dataset_id', dataset_id).eq('status', 'error')
  const { count: processingSources } = await supabase.from('dataset_sources').select('id', { count: 'exact', head: true }).eq('dataset_id', dataset_id).in('status', ['pending', 'processing'])

  let status = 'draft'
  if (processingSources && processingSources > 0) status = 'processing'
  if (readySources && readySources > 0) status = 'ready'
  if (totalSources === errorSources && errorSources && errorSources > 0) status = 'error'

  await supabase.from('datasets').update({
    chunk_count: totalChunks || 0,
    source_count: totalSources || 0,
    status
  }).eq('id', dataset_id)
}

// ═══════════════════════════════════════════════════════════════
// POST /api/datasets/[id]/sources
// ═══════════════════════════════════════════════════════════════
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const { id: dataset_id } = params
    const actor = await getAuthenticatedWorkspaceResource(req, 'datasets', dataset_id, 'knowledge', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json()
    const { source_type, source_ref, source_name, content } = body

    if (!source_type) return NextResponse.json({ error: 'source_type is required' }, { status: 400 })

    // ── Get dataset to retrieve client_id ────────────────────────
    const client_id = actor.workspaceId

    // ════════════════════════════════════
    // SOURCE TYPE: website_crawl (Firecrawl — deep multi-page crawl)
    // ════════════════════════════════════
    if (source_type === 'website_crawl') {
      const rate = await crawlRateLimit.limit(`knowledge:${client_id}`)
      if (!rate.success) return NextResponse.json({ error: 'Please wait before starting another website import.' }, { status: 429 })
      if (body.action === 'discover') return NextResponse.json(await discoverKnowledgePages(client_id, source_ref))
      const source = await startKnowledgeCrawl(dataset_id, client_id, body)
      return NextResponse.json({ source }, { status: 201 })
    }

    // ════════════════════════════════════
    // SOURCE TYPE: document_link (Jina Reader — single doc extraction)
    // Works for: Google Docs, Notion, articles, PDFs, GitHub READMEs
    // ════════════════════════════════════
    if (source_type === 'document_link') {
      if (!source_ref?.trim()) return NextResponse.json({ error: 'URL is required' }, { status: 400 })
      const policy = await documentPolicy(client_id)
      if (!policy.maxBytes) throw new DocumentImportError('Document imports are disabled for your workspace.', 403)
      const rate = await documentImportRateLimit.limit(`documents:${client_id}`)
      if (!rate.success) throw new DocumentImportError('Too many document imports. Please try again later.', 429)
      const release = acquireDocumentImport()
      try {
        const document = await fetchDocumentLink(source_ref, policy.maxBytes)
        const result = await ingestDocumentBuffer({
          datasetId: dataset_id, clientId: client_id, buffer: document.buffer, extension: document.extension,
          filename: typeof source_name === 'string' && source_name.trim() ? source_name.trim().slice(0,200) : document.title,
          sourceUrl: document.sourceUrl,
        })
        return NextResponse.json({ ...result, chunks_added: result.duplicate ? 0 : result.source.chunk_count || 0 }, { status: 201 })
      } finally { release() }
    }

    // ════════════════════════════════════
    // SOURCE TYPE: text (direct paste)
    // ════════════════════════════════════
    if (source_type === 'text') {
      if (!content?.trim()) return NextResponse.json({ error: 'content is required' }, { status: 400 })

      const { data: source, error: srcErr } = await supabase.from('dataset_sources').insert({
        dataset_id,
        source_type: 'text',
        source_name: source_name?.trim() || 'Text block',
        status: 'processing'
      }).select().single()

      if (srcErr) return NextResponse.json({ error: srcErr.message }, { status: 500 })

      const rawChunks = chunkText(content)
      const chunkCount = await embedAndInsert(rawChunks, dataset_id, source.id, client_id)

      await supabase.from('dataset_sources').update({ status: 'ready', chunk_count: chunkCount }).eq('id', source.id)
      await recalcDataset(dataset_id)

      return NextResponse.json({ source: { ...source, status: 'ready', chunk_count: chunkCount }, chunks_added: chunkCount }, { status: 201 })
    }

    // ════════════════════════════════════
    // SOURCE TYPE: file
    // ════════════════════════════════════
    if (source_type === 'file') {
      return NextResponse.json({ error: 'Choose Upload Documents and select the actual file.' }, { status: 400 })
    }

    return NextResponse.json({ error: `Unsupported source_type: ${source_type}` }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e instanceof KnowledgeCrawlError || e instanceof DocumentImportError ? e.message : 'Could not import this source. Please try again.' }, { status: e instanceof KnowledgeCrawlError || e instanceof DocumentImportError ? e.status : 400 })
  }
}

// GET /api/datasets/[id]/sources — list sources for a dataset
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const actor = await getAuthenticatedWorkspaceResource(req, 'datasets', params.id, 'knowledge')
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (req.nextUrl.searchParams.get('crawl_policy') === '1') {
    try { return NextResponse.json(await knowledgeCrawlPolicy(actor.workspaceId)) }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not load import settings' }, { status: error instanceof KnowledgeCrawlError ? error.status : 503 }) }
  }
  // Poll only this tenant's active jobs, once per lease. Works on localhost
  // without public callbacks or long-running background processes.
  const pending = await supabase.from('dataset_sources').select('id,status,source_type,crawl_state,created_at').eq('dataset_id', params.id).in('status', ['processing','pending']).in('source_type', ['website_crawl','url']).order('created_at').limit(2)
  try { for (const source of pending.data || []) {
    if (source.crawl_state?.job_id) { await pollKnowledgeCrawl(source.id); break }
    if (source.status === 'processing' || Date.now() - Date.parse(source.created_at) > 120_000) {
      await supabase.from('dataset_sources').update({ status: 'error', error_msg: 'This website import was interrupted. Please retry the source.' }).eq('id', source.id).eq('dataset_id', params.id)
    }
  } }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not refresh import progress' }, { status: 503 }) }
  const documents = await supabase.from('dataset_sources').select('id,status,document_state,created_at').eq('dataset_id', params.id).in('status', ['pending','processing']).in('source_type', ['file','document_link']).limit(2)
  try { for (const source of documents.data || []) {
    if (source.document_state?.scan_status === 'passed') { await processDocumentSource(source.id); break }
    if (source.document_state?.scan_status === 'quarantine' && Date.now()-Date.parse(source.created_at)>120_000) await supabase.from('dataset_sources').update({status:'error',error_msg:'The upload was interrupted. Please upload the document again.',document_state:{...source.document_state,scan_status:'rejected'}}).eq('id',source.id).eq('dataset_id',params.id)
  } } catch { return NextResponse.json({error:'Could not refresh document import progress.'},{status:503}) }
  const { data, error } = await supabase
    .from('dataset_sources')
    .select('id,dataset_id,source_type,source_ref,source_name,status,error_msg,chunk_count,created_at')
    .eq('dataset_id', params.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}
