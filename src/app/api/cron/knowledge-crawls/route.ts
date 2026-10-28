import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { supabase } from '@/lib/supabase'
import { pollKnowledgeCrawl } from '@/lib/knowledgeCrawler'
import { processDocumentSource } from '@/lib/knowledge/documentIngestion'

export const maxDuration = 60
export async function GET(req: NextRequest) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`)
  const actual = Buffer.from(req.headers.get('authorization') || '')
  if (!process.env.CRON_SECRET || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.from('dataset_sources').select('id').eq('status', 'processing')
    .eq('source_type', 'website_crawl').not('crawl_state->>job_id', 'is', null)
    .order('crawl_lease_until', { ascending: true, nullsFirst: true }).limit(2)
  if (error) return NextResponse.json({ error: 'Could not load website import jobs' }, { status: 503 })
  const results = await Promise.allSettled((data || []).map(source => pollKnowledgeCrawl(source.id)))
  const documents = await supabase.from('dataset_sources').select('id').eq('status','processing').eq('document_state->>scan_status','passed').order('crawl_lease_until',{ascending:true,nullsFirst:true}).limit(1)
  if(documents.error)return NextResponse.json({error:'Could not load document import jobs. Apply migration 106.'},{status:503})
  const documentResults = await Promise.allSettled((documents.data||[]).map(source=>processDocumentSource(source.id)))
  return NextResponse.json({ checked: results.length+documentResults.length, failed: [...results,...documentResults].filter(result => result.status === 'rejected').length })
}
