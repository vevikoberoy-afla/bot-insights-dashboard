import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'
import { encryptConfigSecrets } from '@/lib/security/secretVault'
import { redactSecretsForBrowser } from '@/lib/security/redactSecrets'

export async function GET(req: NextRequest) {
  const actor = await getAuthenticatedWorkspaceUser(req,'bots')
  if (!actor) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const client_id = actor.workspaceId

  try {
    const { data, error } = await supabase
        .from('channel_integrations')
        .select('*')
        .eq('client_id', client_id)

    if (error) throw error
    return NextResponse.json(redactSecretsForBrowser(data || []))
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await getAuthenticatedWorkspaceUser(req,'bots',true)
    if (!actor) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    const body = await req.json()
    const { channel, credentials, display_name } = body
    const client_id = actor.workspaceId

    if (!client_id || !channel) {
      return NextResponse.json({ error: 'client_id and channel required' }, { status: 400 })
    }

    const { data, error } = await supabase.from('channel_integrations').upsert({
      client_id,
      channel,
      display_name: display_name || channel,
      status: 'active',
      credentials: encryptConfigSecrets(client_id, credentials || {}),
    }, { onConflict: 'client_id,channel' }).select().single()

    if (error) throw error

    return NextResponse.json(redactSecretsForBrowser(data), { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const actor = await getAuthenticatedWorkspaceUser(req,'bots',true)
    if (!actor) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    const body = await req.json()
    const { id, client_id: _ignored, ...updates } = body
    const client_id = actor.workspaceId
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    if (updates.credentials) updates.credentials = encryptConfigSecrets(client_id, updates.credentials)

    const { data, error } = await supabase
        .from('channel_integrations')
        .update(updates)
        .eq('id', id)
        .eq('client_id', client_id)
        .select()
        .single()

    if (error) throw error
    return NextResponse.json(redactSecretsForBrowser(data))
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const actor = await getAuthenticatedWorkspaceUser(req,'bots',true)
  if (!actor) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const client_id = actor.workspaceId
  const id = req.nextUrl.searchParams.get('id')
  if (!client_id || !id) return NextResponse.json({ error: 'client_id and id required' }, { status: 400 })

  try {
    await supabase.from('channel_integrations').update({ status: 'disconnected' })
      .eq('client_id', client_id).eq('id', id)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
