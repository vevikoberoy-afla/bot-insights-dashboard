import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { runCommerceSync } from '@/lib/integrations/commerceConnector'

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET || ''
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(req.headers.get('authorization') || '')
  return !!secret && expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const staleBefore = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase.from('commerce_store_connections').select('id,client_id')
    .in('status', ['active', 'error']).or(`last_reconciled_at.is.null,last_reconciled_at.lt.${staleBefore}`).limit(3)
  if (error) return NextResponse.json({ error: 'Connector storage unavailable' }, { status: 503 })
  const results: Array<Record<string, unknown>> = []
  for (const connection of data || []) {
    try { results.push({ id: connection.id, ...(await runCommerceSync(connection.id, connection.client_id, 'reconcile')) }) }
    catch (syncError: any) { results.push({ id: connection.id, status: 'failed', error: String(syncError?.message || 'Sync failed').slice(0, 200) }) }
  }
  return NextResponse.json({ processed: results.length, results })
}
