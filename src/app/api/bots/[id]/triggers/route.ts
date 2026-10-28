import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceResource, getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const actor = await getAuthenticatedWorkspaceResource(req, 'bots', params.id, 'bots')
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase
    .from('trigger_rules')
    .select('*')
    .eq('bot_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const actor = await getAuthenticatedWorkspaceResource(req, 'bots', params.id, 'bots', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json()
    const { name, description, conditions, actions, frequency_per_session, frequency_per_day, min_gap_minutes, trigger_event, message, action_type } = body

    const { data: trigger, error } = await supabase
      .from('trigger_rules')
      .insert({
        bot_id: params.id,
        client_id: actor.workspaceId,
        name: name || 'New Trigger Rule',
        description: description || '',
        status: 'active',
        trigger_event: trigger_event || 'page_view',
        conditions: conditions || [],
        actions: actions || [],
        message: message || '',
        action_type: action_type || 'popup',
        frequency_per_session: frequency_per_session || 1,
        frequency_per_day: frequency_per_day || 3,
        min_gap_minutes: min_gap_minutes || 5,
        channels: body.channels || ['web_chat'],
        tone: body.tone || 'casual',
        popup_style: body.popup_style || 'callout',
        delay_seconds: body.delay_seconds || 0,
        auto_dismiss_seconds: body.auto_dismiss_seconds || 0,
        cta_text: body.cta_text || null,
        cta_url: body.cta_url || null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(trigger, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const actor = await getAuthenticatedWorkspaceUser(req, 'bots', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json()
    const { id, client_id: _ignoredClientId, bot_id: _ignoredBotId, ...updates } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const { data: trigger, error } = await supabase
      .from('trigger_rules')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('client_id', actor.workspaceId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(trigger)
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const actor = await getAuthenticatedWorkspaceUser(req, 'bots', true)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const triggerId = req.nextUrl.searchParams.get('triggerId')
  if (!triggerId) return NextResponse.json({ error: 'triggerId required' }, { status: 400 })

  const { error } = await supabase.from('trigger_rules').delete().eq('id', triggerId).eq('client_id', actor.workspaceId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
