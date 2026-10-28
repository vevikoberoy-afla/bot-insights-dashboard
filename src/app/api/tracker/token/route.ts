import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { issueWidgetSessionToken } from '@/lib/security/widgetSessionToken'

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('client_id') || ''
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return NextResponse.json({ error: 'Tracker not found' }, { status: 404 })
  const { data: client } = await supabase.from('clients').select('id').eq('id', clientId).maybeSingle()
  if (!client) return NextResponse.json({ error: 'Tracker not found' }, { status: 404 })
  const { data: bot } = await supabase.from('bots').select('id').eq('client_id', clientId).eq('status', 'active').limit(1).maybeSingle()
  const capability = issueWidgetSessionToken({ workspaceId: clientId, botId: bot?.id || 'tracker', purpose: 'tracker', ttlSeconds: 86400 })
  return NextResponse.json({ token: capability.token, expiresAt: capability.expiresAt }, { headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } })
}
