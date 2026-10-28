import { NextRequest, NextResponse } from 'next/server'
import FirecrawlApp from '@mendable/firecrawl-js'
import { supabase } from '@/lib/supabase'
import { chunkText } from '@/lib/chunker'
import { embedBatch, hashText } from '@/lib/embeddings'
import { getAuthContext } from '@/lib/auth'
import { extractGoogleDocOrSheet } from '@/lib/gdocs'
import { allowedKnowledgeUrl, CRAWL_EXCLUDE_PATHS } from '@/lib/knowledgeCrawlPolicy'
import { assertSafeOutboundUrl } from '@/lib/urlSecurity'

const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY! })

// Vercel max duration — allows longer processing for embedding step
export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req)
    if (!auth.authorized) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { url } = await req.json()
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }
    if (!allowedKnowledgeUrl(url)) return NextResponse.json({ error: 'Choose a public website page suitable for your knowledge base.' }, { status: 400 })
    await assertSafeOutboundUrl(url)

    // 1. Create a context row with status "crawling"
    const { data: context, error: ctxError } = await supabase
      .from('contexts')
      .insert({ site_url: url, crawl_status: 'crawling' })
      .select()
      .single()

    if (ctxError || !context) {
      throw new Error('Failed to create context: ' + ctxError?.message)
    }

    const contextId = context.id

    // Check if it's a Google Doc or Sheet
    const gDocResult = await extractGoogleDocOrSheet(url)
    
    if (gDocResult.success) {
      // Process synchronously and bypass Firecrawl
      const markdown = gDocResult.text
      const chunks = await chunkText(markdown)
      
      let totalChunks = 0
      if (chunks.length > 0) {
        const hashes = chunks.map(c => hashText(c))
        const embeddings = await embedBatch(chunks)
        const rows = chunks.map((chunkText, i) => ({
          context_id: contextId,
          text: chunkText,
          chunk_hash: hashes[i],
          embedding: JSON.stringify(embeddings[i]),
          source_url: url,
          source_type: 'crawl',
          active: true,
        }))
        await supabase.from('chunks').insert(rows)
        totalChunks = rows.length
      }

      await supabase
        .from('contexts')
        .update({ crawl_status: 'complete', chunk_count: totalChunks })
        .eq('id', contextId)

      return NextResponse.json({
        context_id: contextId,
        status: 'crawling', // Return crawling so frontend poll immediately catches complete
        manage_url: `${process.env.NEXT_PUBLIC_APP_URL}/manage/${contextId}`,
      })
    }

    // 2. Fire async crawl — returns immediately with a crawl job ID
    const crawlResult = await firecrawl.asyncCrawlUrl(url, {
      limit: 50,           // max 50 pages (free tier)
      maxDepth: 2,
      allowExternalLinks: false,
      excludePaths: CRAWL_EXCLUDE_PATHS,
      scrapeOptions: {
        formats: ['markdown'], // markdown only — clean text, no HTML noise
        onlyMainContent: true, // skip nav, footer, ads
        excludeTags: ['nav', 'footer', 'header', 'aside', 'script', 'style'],
      },
    })

    if (!crawlResult.success || !crawlResult.id) {
      await supabase
        .from('contexts')
        .update({ crawl_status: 'failed' })
        .eq('id', contextId)
      throw new Error('Firecrawl failed to start crawl')
    }

    // 3. Store the Firecrawl job ID so we can poll it from the GET handler
    await supabase
      .from('contexts')
      .update({ firecrawl_job_id: crawlResult.id })
      .eq('id', contextId)

    // 4. Return context_id immediately — frontend polls for status
    return NextResponse.json({
      context_id: contextId,
      status: 'crawling',
      manage_url: `${process.env.NEXT_PUBLIC_APP_URL}/manage/${contextId}`,
      embed_snippet: buildEmbedSnippet(contextId),
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/crawl]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// GET — poll crawl status
// This now checks Firecrawl directly (no webhook needed)
export async function GET(req: NextRequest) {
  const contextId = req.nextUrl.searchParams.get('context_id')
  if (!contextId) {
    return NextResponse.json({ error: 'context_id required' }, { status: 400 })
  }

  const { data: ctx } = await supabase
    .from('contexts')
    .select('crawl_status, page_count, chunk_count, firecrawl_job_id')
    .eq('id', contextId)
    .single()

  if (!ctx) {
    return NextResponse.json({ crawl_status: 'not_found' })
  }

  // If already complete or failed, just return the status
  if (ctx.crawl_status === 'complete' || ctx.crawl_status === 'failed') {
    return NextResponse.json({
      crawl_status: ctx.crawl_status,
      page_count: ctx.page_count,
      chunk_count: ctx.chunk_count,
    })
  }

  // If we have a Firecrawl job ID, poll Firecrawl directly
  // Also handle 'embedding' status in case a previous attempt failed mid-embedding
  if (ctx.firecrawl_job_id && (ctx.crawl_status === 'crawling' || ctx.crawl_status === 'embedding')) {
    try {
      const status = await firecrawl.checkCrawlStatus(ctx.firecrawl_job_id)

      if ('status' in status && status.status === 'completed') {
        // Crawl is done — process the data now
        await supabase
          .from('contexts')
          .update({
            crawl_status: 'embedding',
            page_count: status.data?.length ?? 0,
          })
          .eq('id', contextId)

        // Process pages in the background-ish manner
        // (this runs within the same request but that's OK for local dev)
        let totalChunks = 0
        const pages = status.data ?? []

        for (const page of pages) {
          const text = page.markdown?.trim()
          const sourceUrl = page.metadata?.sourceURL ?? page.metadata?.url ?? null

          if (!text || text.length < 50 || !sourceUrl || !allowedKnowledgeUrl(sourceUrl)) continue

          // Split page text into chunks
          const chunks = await chunkText(text)
          if (!chunks.length) continue

          // Check which chunks already exist (by hash) to avoid re-embedding
          const hashes = chunks.map(hashText)
          const { data: existingHashes } = await supabase
            .from('chunks')
            .select('chunk_hash')
            .eq('context_id', contextId)
            .in('chunk_hash', hashes)

          const existingSet = new Set((existingHashes ?? []).map((r: { chunk_hash: string }) => r.chunk_hash))
          const newChunks = chunks.filter((_, i) => !existingSet.has(hashes[i]))
          const newHashes = hashes.filter(h => !existingSet.has(h))

          if (!newChunks.length) continue

          // Embed all new chunks in one batch call
          const embeddings = await embedBatch(newChunks)

          // Build rows for insert
          const rows = newChunks.map((chunkText, i) => ({
            context_id: contextId,
            text: chunkText,
            chunk_hash: newHashes[i],
            embedding: JSON.stringify(embeddings[i]),
            source_url: sourceUrl,
            source_type: 'crawl',
            active: true,
          }))

          await supabase.from('chunks').insert(rows)
          totalChunks += rows.length
        }

        // Mark as complete
        await supabase
          .from('contexts')
          .update({ crawl_status: 'complete', chunk_count: totalChunks })
          .eq('id', contextId)

        return NextResponse.json({
          crawl_status: 'complete',
          page_count: pages.length,
          chunk_count: totalChunks,
        })
      }

      if ('status' in status && status.status === 'failed') {
        await supabase
          .from('contexts')
          .update({ crawl_status: 'failed' })
          .eq('id', contextId)

        return NextResponse.json({
          crawl_status: 'failed',
          page_count: 0,
          chunk_count: 0,
        })
      }

      // Still crawling — return current progress info
      return NextResponse.json({
        crawl_status: 'crawling',
        page_count: 'completed' in status ? status.completed : 0,
        chunk_count: 0,
      })

    } catch (err) {
      console.error('[/api/crawl GET] Processing error:', err)
      // Mark as failed so the frontend stops polling
      await supabase
        .from('contexts')
        .update({ crawl_status: 'failed' })
        .eq('id', contextId)

      return NextResponse.json({
        crawl_status: 'failed',
        page_count: ctx.page_count ?? 0,
        chunk_count: ctx.chunk_count ?? 0,
      })
    }
  }

  // Fallback — return DB status
  return NextResponse.json({
    crawl_status: ctx.crawl_status,
    page_count: ctx.page_count ?? 0,
    chunk_count: ctx.chunk_count ?? 0,
  })
}

function buildEmbedSnippet(contextId: string): string {
  return `<script src="${process.env.NEXT_PUBLIC_APP_URL}/widget.js?v=7" data-ctx="${contextId}" defer></script>`
}
