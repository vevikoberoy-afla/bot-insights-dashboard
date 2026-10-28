import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'
import { supabase } from '@/lib/supabase'
import { runCommerceSync } from '@/lib/integrations/commerceConnector'

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedWorkspaceUser(req, 'settings', true)
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  let query = supabase.from('commerce_store_connections').select('id').eq('client_id', user.workspaceId)
  query = body.connection_id ? query.eq('id', body.connection_id) : query.eq('integration_id', body.integration_id || '')
  const { data: connection, error } = await query.maybeSingle()
  if (error?.code === '42P01') return NextResponse.json({ error: 'Apply supabase/104_ecommerce_store_connectors.sql first' }, { status: 503 })
  if (!connection) return NextResponse.json({ error: 'Store connection not found' }, { status: 404 })
  try {
    return NextResponse.json(await runCommerceSync(connection.id, user.workspaceId, body.initial ? 'initial' : 'manual'))
  } catch (syncError: any) {
    return NextResponse.json({ error: syncError?.message || 'Store sync failed' }, { status: 502 })
  }
}

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedWorkspaceUser(req, 'settings')
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const integrationId = req.nextUrl.searchParams.get('integration_id') || ''
  const { data, error } = await supabase.from('commerce_store_connections')
    .select('id,integration_id,platform,store_domain,store_name,currency,status,last_synced_at,last_sync_error')
    .eq('client_id', user.workspaceId).eq('integration_id', integrationId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || null)
}
