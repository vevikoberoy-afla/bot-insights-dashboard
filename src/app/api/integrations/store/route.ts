import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function GET(req: NextRequest) {
  const actor = await getAuthenticatedWorkspaceUser(req, 'settings')
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const clientId = actor.workspaceId

  const { data, error } = await supabase
    .from('store_integrations')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getAuthenticatedWorkspaceUser(req, 'settings', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json()
    const { platform = 'custom_snippet', connection_type = 'js_snippet', shop_domain, webhook_secret, settings } = body
    const client_id = actor.workspaceId

    const { data, error } = await supabase
      .from('store_integrations')
      .upsert(
        {
          client_id,
          platform,
          connection_type,
          shop_domain: shop_domain || null,
          webhook_secret: webhook_secret || null,
          settings: settings || {},
          status: 'active',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'client_id,platform' }
      )
      .select()
      .maybeSingle()

    if (error) {
      // Fallback without onConflict if index constraint is different
      const { data: inserted, error: insertErr } = await supabase
        .from('store_integrations')
        .insert({
          client_id,
          platform,
          connection_type,
          shop_domain: shop_domain || null,
          webhook_secret: webhook_secret || null,
          settings: settings || {},
          status: 'active',
        })
        .select()
        .maybeSingle()

      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })
      return NextResponse.json(inserted)
    }

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
