import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createTicket, isClosedStatus, recordTicketEvent, TICKET_PRIORITIES, TICKET_STATUSES } from '@/lib/ticketing'
import { requireWorkspace,saasError } from '@/lib/saas/context'

export async function GET(req: NextRequest) {
 try{
  const ctx=await requireWorkspace(req.nextUrl.searchParams.get('client_id'),'tickets')
  const clientId = ctx.workspaceId
  const ticketId = req.nextUrl.searchParams.get('id')
  if (ticketId) {
    const { data, error } = await supabase.from('tickets')
      .select('*, bots(name), contacts(id, name, email, phone), ticket_tag_mappings(ticket_tags(id, name, color))')
      .eq('id', ticketId).eq('client_id',clientId).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }
  const page = Math.max(1, Number(req.nextUrl.searchParams.get('page') || 1))
  const pageSize = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('page_size') || 25)))
  let query = supabase.from('tickets')
    .select('*, bots(name), contacts(id, name, email, phone), ticket_tag_mappings(ticket_tags(id, name, color))', { count: 'exact' })
    .eq('client_id', clientId).order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)
  for (const key of ['status', 'assignee_id', 'priority', 'type', 'verification_status']) {
    const value = req.nextUrl.searchParams.get(key)
    if (value) query = query.eq(key, value)
  }
  const search = req.nextUrl.searchParams.get('search')?.trim().replace(/[%_,()]/g, ' ')
  if (search) query = query.or(`ticket_number.ilike.%${search}%,subject.ilike.%${search}%,customer_email.ilike.%${search}%,customer_name.ilike.%${search}%,order_number.ilike.%${search}%`)
  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (req.nextUrl.searchParams.get('paginated') === 'true') {
    return NextResponse.json({ data: data || [], count: count || 0, page, page_size: pageSize })
  }
  return NextResponse.json(data || [], { headers: { 'x-total-count': String(count || 0) } })
 }catch(error){return saasError(error)}
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const ctx=await requireWorkspace(body.client_id,'tickets',true)
    const result = await createTicket({...body,client_id:ctx.workspaceId}, { id: ctx.user.id, type: 'agent' })
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Invalid request' }, { status: 400 })
  }
}

// Kept for backwards compatibility. New clients use PATCH /api/tickets/:id.
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, status, ...rawUpdates } = body
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    if (status && !TICKET_STATUSES.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    if (rawUpdates.priority && !TICKET_PRIORITIES.includes(rawUpdates.priority)) return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })
    const allowed = ['priority', 'assignee_id', 'subject', 'description', 'type', 'sub_status', 'verification_status', 'order_number']
    const updates = Object.fromEntries(Object.entries(rawUpdates).filter(([key]) => allowed.includes(key)))
    const ctx=await requireWorkspace(null,'tickets',true)
    const { data: before } = await supabase.from('tickets').select('*').eq('id', id).eq('client_id',ctx.workspaceId).single()
    if (!before) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    const now = new Date().toISOString()
    const { data, error } = await supabase.from('tickets').update({
      ...updates, ...(status ? { status } : {}),
      ...(isClosedStatus(status) ? { resolved_at: now, ...(status === 'closed' ? { closed_at: now } : {}) } : {}),
      updated_at: now,
    }).eq('id', id).eq('client_id',ctx.workspaceId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await recordTicketEvent({ ticketId: id, clientId: before.client_id, actorId: ctx.user.id,
      actorType: 'agent', eventType: status && status !== before.status ? 'status_changed' : 'ticket_updated',
      fromValue: before, toValue: data })
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Invalid request' }, { status: 400 })
  }
}
