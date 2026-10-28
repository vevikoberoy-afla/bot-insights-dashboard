import { supabase } from '@/lib/supabase'

export const TICKET_STATUSES = ['open', 'in_progress', 'pending', 'waiting', 'on_hold', 'resolved', 'solved', 'closed'] as const
export const TICKET_PRIORITIES = ['low', 'normal', 'medium', 'high', 'urgent'] as const
export const TICKET_TYPES = ['general', 'return', 'refund', 'exchange', 'order_issue', 'complaint', 'technical'] as const

export type TicketPriority = typeof TICKET_PRIORITIES[number]

const SLA_HOURS: Record<string, { first: number; resolve: number }> = {
  urgent: { first: 1, resolve: 4 }, high: { first: 4, resolve: 12 },
  medium: { first: 8, resolve: 24 }, normal: { first: 12, resolve: 48 },
  low: { first: 24, resolve: 72 },
}

export function normalizePriority(value?: string): TicketPriority {
  return TICKET_PRIORITIES.includes(value as TicketPriority) ? value as TicketPriority : 'medium'
}

export function inferPriority(input: { type?: string; subject?: string; description?: string; priority?: string }): TicketPriority {
  if (input.priority && input.priority !== 'auto') return normalizePriority(input.priority)
  const text = `${input.type || ''} ${input.subject || ''} ${input.description || ''}`.toLowerCase()
  if (/fraud|charged twice|duplicate charge|unsafe|security|cannot access/.test(text)) return 'urgent'
  if (/refund|missing|damaged|wrong item|not delivered/.test(text)) return 'high'
  if (/return|exchange|order/.test(text)) return 'medium'
  return 'normal'
}

export function slaDates(priority: TicketPriority) {
  const now = Date.now()
  const rule = SLA_HOURS[priority] || SLA_HOURS.medium
  return {
    first_response_due_at: new Date(now + rule.first * 3_600_000).toISOString(),
    resolution_due_at: new Date(now + rule.resolve * 3_600_000).toISOString(),
    sla_deadline: new Date(now + rule.resolve * 3_600_000).toISOString(),
  }
}

export async function recordTicketEvent(input: {
  ticketId: string; clientId: string; actorId?: string | null
  actorType?: 'agent' | 'customer' | 'bot' | 'system'; eventType: string
  fromValue?: unknown; toValue?: unknown; metadata?: Record<string, unknown>
}) {
  const { error } = await supabase.from('ticket_events').insert({
    ticket_id: input.ticketId, client_id: input.clientId, actor_id: input.actorId || null,
    actor_type: input.actorType || 'system', event_type: input.eventType,
    from_value: input.fromValue ?? null, to_value: input.toValue ?? null,
    metadata: input.metadata || {},
  })
  if (error) console.error('[ticket event]', error.message)
}

async function resolveContact(clientId: string, input: any) {
  if (input.contact_id) {
    const { data } = await supabase.from('contacts').select('*').eq('id', input.contact_id).eq('client_id', clientId).maybeSingle()
    return data
  }
  const email = String(input.customer_email || '').trim().toLowerCase()
  const phone = String(input.customer_phone || '').replace(/[^+\d]/g, '')
  let contact: any = null
  if (email) contact = (await supabase.from('contacts').select('*').eq('client_id', clientId).ilike('email', email).limit(1).maybeSingle()).data
  if (!contact && phone) contact = (await supabase.from('contacts').select('*').eq('client_id', clientId).eq('phone', phone).limit(1).maybeSingle()).data
  if (!contact && (email || phone || input.customer_name)) {
    const { data, error } = await supabase.from('contacts').insert({
      client_id: clientId, name: String(input.customer_name || email || phone || 'Customer').trim(),
      email: email || null, phone: phone || null, source_channel: input.channel || input.source || 'web',
    }).select().single()
    if (error) throw new Error(error.message)
    contact = data
  }
  return contact
}

export async function createTicket(input: any, actor?: { id?: string | null; type?: 'agent' | 'customer' | 'bot' | 'system' }) {
  const clientId = String(input.client_id || '')
  if (!clientId || !String(input.subject || '').trim()) throw new Error('client_id and subject are required')
  const contact = await resolveContact(clientId, input)
  const type = TICKET_TYPES.includes(input.type) ? input.type : 'general'

  if (contact?.id && input.allow_duplicate !== true) {
    let query = supabase.from('tickets').select('*').eq('client_id', clientId).eq('contact_id', contact.id)
      .eq('type', type).in('status', ['open', 'in_progress', 'pending', 'waiting', 'on_hold'])
      .order('created_at', { ascending: false }).limit(1)
    if (input.order_number) query = query.eq('order_number', input.order_number)
    const { data: duplicate } = await query.maybeSingle()
    if (duplicate) return { ticket: duplicate, duplicate: true }
  }

  const priority = inferPriority({ ...input, type })
  const sla = slaDates(priority)
  const resolutionDue = input.due_date ? new Date(input.due_date).toISOString() : sla.resolution_due_at
  const initialStatus = input.status && TICKET_STATUSES.includes(input.status) ? input.status : 'open'
  const { data: ticket, error } = await supabase.from('tickets').insert({
    client_id: clientId, bot_id: input.bot_id || null, contact_id: contact?.id || null,
    session_id: input.session_id || null, customer_name: input.customer_name || contact?.name || null,
    customer_email: input.customer_email || contact?.email || null, subject: String(input.subject).trim(),
    description: String(input.description || '').trim() || null, type, status: initialStatus, priority,
    assignee_id: input.assignee_id || null, source: input.source || 'manual',
    verification_status: input.verification_status || 'unverified', order_id: input.order_id || null,
    order_number: input.order_number || null, metadata: input.metadata || {},
    first_response_due_at: sla.first_response_due_at,
    resolution_due_at: resolutionDue,
    sla_deadline: resolutionDue,
  }).select().single()
  if (error) throw new Error(error.message)

  if (input.internal_notes && String(input.internal_notes).trim()) {
    await supabase.from('ticket_notes').insert({
      ticket_id: ticket.id,
      client_id: clientId,
      author_id: actor?.id || null,
      body: String(input.internal_notes).trim(),
    })
  }

  await recordTicketEvent({ ticketId: ticket.id, clientId, actorId: actor?.id,
    actorType: actor?.type || 'agent', eventType: 'ticket_created',
    toValue: { status: ticket.status, priority, type } })
  return { ticket, duplicate: false }
}

export const isClosedStatus = (status?: string) => ['resolved', 'solved', 'closed'].includes(status || '')
