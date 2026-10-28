import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireStaff, saasError } from '@/lib/saas/context'

export const dynamic = 'force-dynamic'

export async function GET() {
  try { await requireStaff() } catch(error) { return saasError(error) }
  const started = Date.now()
  const { error } = await supabase.from('clients').select('id', { head: true, count: 'exact' }).limit(1)
  return NextResponse.json({
    supabase: { status: error ? 'degraded' : 'operational', latency_ms: Date.now() - started },
    redis: { status: process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? 'configured' : 'disabled' },
    gemini: { status: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY ? 'configured' : 'disabled' },
    firecrawl: { status: process.env.FIRECRAWL_API_KEY ? 'configured' : 'disabled' },
    meta_api: { status: process.env.META_APP_SECRET ? 'configured' : 'disabled' },
    chatwoot: { status: process.env.CHATWOOT_WEBHOOK_SECRET ? 'configured' : 'disabled' },
  }, { status: error ? 503 : 200 })
}
