import { NextRequest, NextResponse } from 'next/server'
import { allowedKnowledgeUrl } from '@/lib/knowledgeCrawlPolicy'
import { supabase } from '@/lib/supabase'
import { chunkText } from '@/lib/chunker'
import { embedBatch, hashText } from '@/lib/embeddings'
import { verifySha256Signature } from '@/lib/webhookSecurity'

// Vercel max duration for webhook — set to 60s on free tier (background route)
export const maxDuration = 60

interface FirecrawlPage {
  markdown?: string
  metadata?: {
    sourceURL?: string
    url?: string
  }
}

interface FirecrawlWebhookPayload {
  type: string   // 'crawl.completed' | 'crawl.failed' | 'crawl.page'
  data?: FirecrawlPage[]
  error?: string
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    if (!verifySha256Signature(rawBody, req.headers.get('x-firecrawl-signature'), process.env.FIRECRAWL_WEBHOOK_SECRET)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const contextId = req.nextUrl.searchParams.get('context_id')
    if (!contextId) {
      return NextResponse.json({ error: 'context_id missing' }, { status: 400 })
    }

    const payload: FirecrawlWebhookPayload = JSON.parse(rawBody)

    // Handle failed crawl
    if (payload.type === 'crawl.failed') {
      await supabase
        .from('contexts')
        .update({ crawl_status: 'failed' })
        .eq('id', contextId)
      return NextResponse.json({ ok: true })
    }

    // Only process completed crawls
    if (payload.type !== 'crawl.completed' || !payload.data?.length) {
      return NextResponse.json({ ok: true })
    }

    // Update status to embedding
    await supabase
      .from('contexts')
      .update({ crawl_status: 'embedding', page_count: payload.data.length })
      .eq('id', contextId)

    let totalChunks = 0

    for (const page of payload.data) {
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
      const rows = newChunks.map((text, i) => ({
        context_id: contextId,
        text,
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

    return NextResponse.json({ ok: true, chunks_created: totalChunks })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/webhook/firecrawl]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
