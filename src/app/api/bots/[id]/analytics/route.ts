import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceResource } from '@/lib/requestAuth'

// GET /api/bots/[id]/analytics — bot performance metrics
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const actor = await getAuthenticatedWorkspaceResource(req, 'bots', params.id, 'analytics')
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const days = parseInt(req.nextUrl.searchParams.get('days') || '30')

  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - days)

  const { data, error } = await supabase
    .from('bot_analytics')
    .select('*')
    .eq('bot_id', params.id)
    .gte('date', fromDate.toISOString().split('T')[0])
    .order('date', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Aggregate totals
  const totals = (data || []).reduce((acc: any, row: any) => ({
    conversations_total: (acc.conversations_total || 0) + (row.conversations_total || 0),
    conversations_resolved: (acc.conversations_resolved || 0) + (row.conversations_resolved || 0),
    conversations_handoff: (acc.conversations_handoff || 0) + (row.conversations_handoff || 0),
    contacts_data_collected: (acc.contacts_data_collected || 0) + (row.contacts_data_collected || 0),
    mcp_actions_fired: (acc.mcp_actions_fired || 0) + (row.mcp_actions_fired || 0),
    triggers_fired: (acc.triggers_fired || 0) + (row.triggers_fired || 0),
    coupons_sent: (acc.coupons_sent || 0) + (row.coupons_sent || 0),
    coupons_converted: (acc.coupons_converted || 0) + (row.coupons_converted || 0),
  }), {})

  const resolution_rate = totals.conversations_total > 0
    ? Math.round((totals.conversations_resolved / totals.conversations_total) * 100)
    : 0

  const coupon_conversion_rate = totals.coupons_sent > 0
    ? Math.round((totals.coupons_converted / totals.coupons_sent) * 100)
    : 0

  return NextResponse.json({
    totals: { ...totals, resolution_rate, coupon_conversion_rate },
    daily: data || [],
  })
}

// POST /api/bots/[id]/analytics — record analytics event (called by bot system)
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const actor = await getAuthenticatedWorkspaceResource(req, 'bots', params.id, 'analytics', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json()
    const today = new Date().toISOString().split('T')[0]

    const updates: any = {}
    if (body.type === 'conversation_started')  updates.conversations_total = 1
    if (body.type === 'resolved')             updates.conversations_resolved = 1
    if (body.type === 'handoff')              updates.conversations_handoff = 1
    if (body.type === 'data_collected')       updates.contacts_data_collected = 1
    if (body.type === 'mcp_fired')            updates.mcp_actions_fired = 1
    if (body.type === 'trigger_fired')        updates.triggers_fired = 1
    if (body.type === 'coupon_sent')          updates.coupons_sent = 1
    if (body.type === 'coupon_converted')     updates.coupons_converted = 1

    // Upsert daily analytics row
    const { error } = await supabase.rpc('increment_bot_analytics', {
      p_bot_id: params.id,
      p_client_id: actor.workspaceId,
      p_date: today,
      p_updates: updates,
    })

    if (error) {
      // Fallback: simple insert
      await supabase.from('bot_analytics').upsert({
        bot_id: params.id,
        client_id: actor.workspaceId,
        date: today,
        ...updates,
      }, { onConflict: 'bot_id,date', ignoreDuplicates: false })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}
