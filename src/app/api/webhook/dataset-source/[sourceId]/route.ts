import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifySha256Signature } from '@/lib/webhookSecurity'
import { pollKnowledgeCrawl } from '@/lib/knowledgeCrawler'

export const maxDuration = 60
// Optional wake-up only. Read pages from the saved provider job instead of
// embedding unfiltered callback payloads.
export async function POST(req: NextRequest, props: { params: Promise<{ sourceId: string }> }) {
  const raw = await req.text()
  if (!verifySha256Signature(raw, req.headers.get('x-firecrawl-signature'), process.env.FIRECRAWL_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { sourceId } = await props.params
  const { data: source } = await supabase.from('dataset_sources').select('id,status,crawl_state').eq('id', sourceId).maybeSingle()
  if (!source || source.status !== 'processing') return NextResponse.json({ discarded: true })
  if (!source.crawl_state?.job_id) {
    await supabase.from('dataset_sources').update({ status: 'error', error_msg: 'This import used an older crawler. Please retry the source.' }).eq('id', sourceId)
    return NextResponse.json({ discarded: true })
  }
  try { await pollKnowledgeCrawl(sourceId); return NextResponse.json({ ok: true }) }
  catch { return NextResponse.json({ error: 'Could not refresh website import' }, { status: 503 }) }
}
