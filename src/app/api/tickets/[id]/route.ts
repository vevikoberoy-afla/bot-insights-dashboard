import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireWorkspace,saasError } from '@/lib/saas/context'
import { isClosedStatus, recordTicketEvent, TICKET_PRIORITIES, TICKET_STATUSES } from '@/lib/ticketing'

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
 try{
  const ctx=await requireWorkspace(null,'tickets')
  const params = await props.params;
  const { data: ticket, error } = await supabase.from('tickets')
    .select('*, bots(id, name), contacts(id, name, email, phone, avatar_url), support_orders(*), ticket_tag_mappings(ticket_tags(id, name, color))')
    .eq('id', params.id).eq('client_id',ctx.workspaceId).single()
  if (error || !ticket) return NextResponse.json({ error: error?.message || 'Ticket not found' }, { status: 404 })
  const [events, messages, notes, attachments, returns, csat] = await Promise.all([
    supabase.from('ticket_events').select('*').eq('ticket_id', params.id).order('created_at'),
    supabase.from('ticket_messages').select('*').eq('ticket_id', params.id).order('created_at'),
    supabase.from('ticket_notes').select('*').eq('ticket_id', params.id).order('created_at'),
    supabase.from('ticket_attachments').select('*').eq('ticket_id', params.id).order('created_at'),
    supabase.from('ticket_returns').select('*, support_order_items(*)').eq('ticket_id', params.id),
    supabase.from('csat_responses').select('*').eq('ticket_id', params.id).maybeSingle(),
  ])
  const attachmentRows = await Promise.all((attachments.data || []).map(async file => {
    const { data } = await supabase.storage.from('chat-media').createSignedUrl(file.storage_path, 60 * 15)
    return { ...file, signed_url: data?.signedUrl || null }
  }))
  return NextResponse.json({ ...ticket, events: events.data || [], messages: messages.data || [],
    notes: notes.data || [], attachments: attachmentRows, returns: returns.data || [], csat: csat.data || null })
 }catch(error){return saasError(error)}
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx=await requireWorkspace(null,'tickets',true)
    const body = await req.json()
    const { data: before } = await supabase.from('tickets').select('*').eq('id', params.id).eq('client_id',ctx.workspaceId).single()
    if (!before) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    if (body.status && !TICKET_STATUSES.includes(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    if (body.priority && !TICKET_PRIORITIES.includes(body.priority)) return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
    const allowed = ['status', 'priority', 'assignee_id', 'subject', 'description', 'type', 'sub_status', 'verification_status', 'order_number']
    const updates = Object.fromEntries(Object.entries(body).filter(([key]) => allowed.includes(key)))
    const now = new Date().toISOString()
    if (isClosedStatus(body.status)) {
      updates.resolved_at = before.resolved_at || now
      if (body.status === 'closed') updates.closed_at = now
    }
    if (body.status === 'pending' || body.status === 'waiting' || body.status === 'on_hold') updates.sla_paused_at = now
    if (body.status === 'open' || body.status === 'in_progress') updates.sla_paused_at = null
    updates.updated_at = now
    const { data, error } = await supabase.from('tickets').update(updates).eq('id', params.id).eq('client_id',ctx.workspaceId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const changed = Object.keys(updates).filter(key => key !== 'updated_at' && JSON.stringify(before[key]) !== JSON.stringify(data[key]))
    await recordTicketEvent({ ticketId: params.id, clientId: before.client_id, actorId: ctx.user.id, actorType: 'agent',
      eventType: changed.length === 1 ? `${changed[0]}_changed` : 'ticket_updated', fromValue: before, toValue: data,
      metadata: { changed_fields: changed } })
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Invalid request' }, { status: 400 })
  }
}
