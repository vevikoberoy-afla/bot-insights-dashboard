import { NextRequest, NextResponse } from 'next/server'
import FirecrawlApp from '@mendable/firecrawl-js'
import { supabase } from '@/lib/supabase'
import { chunkText } from '@/lib/chunker'
import { embedBatch, hashText } from '@/lib/embeddings'
import { crawlRateLimit, getIP } from '@/lib/ratelimit'
import { extractGoogleDocOrSheet } from '@/lib/gdocs'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'
import { startKnowledgeCrawl, pollKnowledgeCrawl, KnowledgeCrawlError } from '@/lib/knowledgeCrawler'
import { allowedKnowledgeUrl } from '@/lib/knowledgeCrawlPolicy'
import { assertSafeOutboundUrl } from '@/lib/urlSecurity'

const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY! })

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const actor = await getAuthenticatedWorkspaceUser(req, 'knowledge', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const ip = getIP(req)
    const { success, remaining } = await crawlRateLimit.limit(ip)
    
    if (!success) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a while before crawling again.' },
        { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
      )
    }

    const { context_id, dataset_id, url } = await req.json()
    if ((!context_id && !dataset_id) || !url) {
      return NextResponse.json({ error: 'context_id/dataset_id and url are required' }, { status: 400 })
    }

    // Verify ownership
    if (dataset_id) {
      const { data: dataset } = await supabase.from('datasets').select('client_id').eq('id', dataset_id).eq('client_id', actor.workspaceId).single()
      if (!dataset) return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
      const source = await startKnowledgeCrawl(dataset_id, actor.workspaceId, { source_ref: url, mode: 'single' })
      await pollKnowledgeCrawl(source.id)
      const { data: complete } = await supabase.from('dataset_sources').select('id,status,chunk_count,error_msg').eq('id', source.id).single()
      return NextResponse.json({ success: complete?.status !== 'error', source: complete, chunks_added: complete?.chunk_count || 0 }, { status: complete?.status === 'error' ? 502 : 200 })
    } else {
      const { data: client } = await supabase.from('clients').select('id').eq('id', actor.workspaceId).eq('context_id', context_id).maybeSingle()
      if (!client) return NextResponse.json({ error: 'Context not found' }, { status: 404 })
    }

    if (!allowedKnowledgeUrl(url)) return NextResponse.json({ error: 'Choose a public website page suitable for your knowledge base.' }, { status: 400 })
    await assertSafeOutboundUrl(url)

    // Check if it's a Google Doc or Sheet
    const gDocResult = await extractGoogleDocOrSheet(url)
    
    let markdown = ''
    if (gDocResult.success) {
      markdown = gDocResult.text
    } else {
      // Crawl the URL synchronously for a single page
      const scrapeResult = await firecrawl.scrapeUrl(url, { formats: ['markdown'], onlyMainContent: true })
      
      if (!scrapeResult.success || !scrapeResult.markdown) {
        return NextResponse.json({ error: 'Failed to scrape the URL' }, { status: 500 })
      }
      markdown = scrapeResult.markdown
    }

    const chunks = await chunkText(markdown)
    
    if (!chunks.length) {
      return NextResponse.json({ error: 'No text extracted from URL' }, { status: 400 })
    }

    const newChunks: any[] = []
    
    for (const chunk of chunks) {
      const hash = hashText(chunk)
      const { data: existing } = await supabase
        .from('chunks')
        .select('id')
        .eq(dataset_id ? 'dataset_id' : 'context_id', dataset_id || context_id)
        .eq('chunk_hash', hash)
        .single()
        
      if (!existing) newChunks.push({ chunk, hash })
    }

    if (newChunks.length > 0) {
      const embeddings = await embedBatch(newChunks.map(c => c.chunk))
      
      const inserts = newChunks.map((c, i) => {
        const payload: any = {
          text: c.chunk,
          chunk_hash: c.hash,
          embedding: JSON.stringify(embeddings[i]),
          source_url: url,
          title: url,
          source_type: 'crawl',
          active: true
        }
        if (dataset_id) payload.dataset_id = dataset_id
        else if (context_id) payload.context_id = context_id
        return payload
      })
      
      const { error: insertError } = await supabase.from('chunks').insert(inserts)
      if (insertError) throw insertError
    }

    return NextResponse.json(
      { success: true, chunks_added: newChunks.length },
      { headers: { 'X-RateLimit-Remaining': String(remaining) } }
    )

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: err instanceof KnowledgeCrawlError ? err.message : 'Could not import this website page.' }, { status: err instanceof KnowledgeCrawlError ? err.status : 500 })
  }
}
