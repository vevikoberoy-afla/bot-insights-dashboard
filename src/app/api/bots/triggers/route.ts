import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

/**
 * GET /api/bots/triggers
 *
 * Fetches proactive trigger rules.
 * Query parameters:
 *   client_id: string (required)
 *   bot_id: string (optional, filter by specific bot or null for client-wide)
 */
export async function GET(req: NextRequest) {
  const actor = await getAuthenticatedWorkspaceUser(req, 'bots')
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const clientId = actor.workspaceId
  const botId = req.nextUrl.searchParams.get('bot_id')

  if (!clientId) {
    return NextResponse.json({ error: 'client_id required' }, { status: 400 })
  }

  let query = supabase
    .from('trigger_rules')
    .select('*, bots(id, name)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(250)

  if (botId) {
    // If botId provided, fetch rules explicitly for this bot OR shared/unassigned rules
    query = query.or(`bot_id.eq.${botId},bot_id.is.null`)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data || [])
}

/**
 * POST /api/bots/triggers
 *
 * Creates a new proactive trigger rule in the trigger_rules table.
 */
export async function POST(req: NextRequest) {
  try {
    const actor = await getAuthenticatedWorkspaceUser(req, 'bots', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json()
    const {
      bot_id,
      name,
      description,
      status = 'active',
      conditions = [],
      actions = [],
      frequency_per_session = 1,
      frequency_per_day = 3,
      min_gap_minutes = 5,
    } = body

    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      )
    }
    if (bot_id) {
      const { data: ownedBot } = await supabase.from('bots').select('id').eq('id', bot_id).eq('client_id', actor.workspaceId).maybeSingle()
      if (!ownedBot) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: trigger, error } = await supabase
      .from('trigger_rules')
      .insert({
        client_id: actor.workspaceId,
        bot_id: bot_id || null,
        name,
        description: description || '',
        status,
        conditions,
        actions,
        frequency_per_session,
        frequency_per_day,
        min_gap_minutes,
        channels: body.channels || ['web_chat'],
        tone: body.tone || 'casual',
        popup_style: body.popup_style || 'callout',
        delay_seconds: body.delay_seconds || 0,
        auto_dismiss_seconds: body.auto_dismiss_seconds || 0,
        cta_text: body.cta_text || null,
        cta_url: body.cta_url || null,
      })
      .select('*, bots(id, name)')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(trigger, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Invalid request' }, { status: 400 })
  }
}

/**
 * PUT /api/bots/triggers
 *
 * Updates an existing trigger rule.
 */
export async function PUT(req: NextRequest) {
  try {
    const actor = await getAuthenticatedWorkspaceUser(req, 'bots', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json()
    const { id, client_id: _ignoredClientId, ...updates } = body

    if (!id) {
      return NextResponse.json({ error: 'id required' }, { status: 400 })
    }
    if (updates.bot_id) {
      const { data: ownedBot } = await supabase.from('bots').select('id').eq('id', updates.bot_id).eq('client_id', actor.workspaceId).maybeSingle()
      if (!ownedBot) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: trigger, error } = await supabase
      .from('trigger_rules')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('client_id', actor.workspaceId)
      .select('*, bots(id, name)')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(trigger)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Invalid request' }, { status: 400 })
  }
}

/**
 * DELETE /api/bots/triggers?id=...
 *
 * Deletes a trigger rule.
 */
export async function DELETE(req: NextRequest) {
  const actor = await getAuthenticatedWorkspaceUser(req, 'bots', true)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id parameter required' }, { status: 400 })
  }

  const { error } = await supabase.from('trigger_rules').delete().eq('id', id).eq('client_id', actor.workspaceId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
