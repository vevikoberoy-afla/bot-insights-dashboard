import { NextRequest, NextResponse } from 'next/server'
import {normalizeE164Phone} from '@/lib/phone'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'
import {logConsent} from '@/lib/leadCapture/consentLog'

const editable = ['name','email','phone','avatar_url','source_channel','tags','opt_in_web','opt_in_whatsapp','opt_in_whatsapp_marketing','opt_in_whatsapp_utility','opt_in_email','opt_in_sms'] as const
const profileFields = ['company','job_title','birthday','preferred_language','timezone','address','city','state','postal_code','country','notes','lifecycle_stage'] as const

async function auth(req: NextRequest) {
  const user = await getAuthenticatedWorkspaceUser(req,'contacts',req.method!=='GET')
  if (!user) return null
  return { userId: user.workspaceId, isAdmin: false }
}

const digits = (value: unknown) => String(value || '').replace(/\D/g, '')
const sameIdentity = (contact: any, record: any) => {
  if (record?.contact_id === contact.id) return true
  const email = String(contact.email || '').trim().toLowerCase()
  const recordEmail = String(record.customer_email || record.email || '').trim().toLowerCase()
  if (email && recordEmail && email === recordEmail) return true
  const phone = digits(contact.phone).slice(-10)
  const recordPhone = digits(record.customer_phone || record.phone).slice(-10)
  return Boolean(phone.length >= 7 && recordPhone && phone === recordPhone)
}

async function relatedRows(table: string, contact: any, options: { email?: boolean, phone?: boolean } = {}) {
  const queries = [supabase.from(table).select('*').eq('client_id', contact.client_id).eq('contact_id', contact.id).order('created_at', { ascending: false }).limit(250)]
  if (options.email && contact.email) queries.push(supabase.from(table).select('*').eq('client_id', contact.client_id).ilike('customer_email', String(contact.email).trim()).order('created_at', { ascending: false }).limit(250))
  if (options.phone && contact.phone) queries.push(supabase.from(table).select('*').eq('client_id', contact.client_id).eq('customer_phone', contact.phone).order('created_at', { ascending: false }).limit(250))
  const results = await Promise.all(queries)
  const unique = new Map<string, any>()
  for (const result of results) for (const row of result.error ? [] : (result.data || [])) if (sameIdentity(contact, row)) unique.set(row.id, row)
  return Array.from(unique.values())
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const access = await auth(req)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let query = supabase.from('contacts').select('*').eq('id', params.id)
  if (!access.isAdmin) query = query.eq('client_id', access.userId)
  const { data: contact, error } = await query.maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const clientId = contact.client_id
  const [commerceRows, supportRows, bookingRows, ticketRows, sessionResult, consentResult, membershipResult, communicationResult] = await Promise.all([
    relatedRows('commerce_orders', contact, { email: true, phone: true }), relatedRows('support_orders', contact, { email: true, phone: true }), relatedRows('feature_bookings', contact, { email: true, phone: true }), relatedRows('tickets', contact, { email: true }),
    supabase.from('sessions').select('*').eq('client_id', clientId).eq('contact_id', contact.id).order('last_message_at', { ascending: false }).limit(100),
    supabase.from('consent_log').select('*').eq('contact_id', contact.id).order('created_at', { ascending: false }).limit(100),
    supabase.from('contact_segment_members').select('assignment_source,contact_segments(id,name,color,is_system,segment_type)').eq('contact_id',contact.id),
    supabase.from('contact_communications').select('*').eq('client_id',clientId).eq('contact_id',contact.id).order('created_at',{ascending:false}).limit(100),
  ])
  const commerceOrders = commerceRows
  const supportOrders = supportRows
  const bookings = bookingRows
  const tickets = ticketRows
  const sessions = sessionResult.error ? [] : (sessionResult.data || [])
  const consent = consentResult.error ? [] : (consentResult.data || [])
  const segmentDetails = membershipResult.error ? [] : (membershipResult.data || []).map((membership:any) => {
    const segment = Array.isArray(membership.contact_segments) ? membership.contact_segments[0] : membership.contact_segments
    return segment ? {...segment,assignment_source:membership.assignment_source} : null
  }).filter(Boolean)
  const communications=communicationResult.error?[]:(communicationResult.data||[])
  const orderIds = commerceOrders.map(order => order.id)
  const { data: orderItems } = orderIds.length ? await supabase.from('commerce_order_items').select('*').in('order_id', orderIds) : { data: [] as any[] }
  const ticketIds = tickets.map(ticket => ticket.id)
  const { data: ticketReturns } = ticketIds.length ? await supabase.from('ticket_returns').select('*').in('ticket_id', ticketIds) : { data: [] as any[] }
  const serviceIds = Array.from(new Set(bookings.map(booking => booking.service_id).filter(Boolean)))
  const { data: services } = serviceIds.length ? await supabase.from('booking_services').select('id,name').eq('client_id', clientId).in('id', serviceIds) : { data: [] as any[] }
  const serviceNames = new Map((services || []).map(service => [service.id, service.name]))

  const orders = [
    ...commerceOrders.map(order => ({ ...order, record_source: 'commerce', items: (orderItems || []).filter(item => item.order_id === order.id) })),
    ...supportOrders.map(order => ({ ...order, reference: order.order_number, record_source: 'connected_source', items: [] })),
  ].sort((a, b) => Date.parse(b.created_at || b.placed_at || '') - Date.parse(a.created_at || a.placed_at || ''))
  const totalSpend = orders.filter(order => !['cancelled','refunded'].includes(order.status)).reduce((sum, order) => sum + Number(order.total || order.total_amount || 0), 0)
  const activity = [
    ...orders.map(order => ({ id: `order-${order.id}`, kind: 'order', title: `Order ${order.reference || order.order_number || ''}`, status: order.status, at: order.created_at || order.placed_at })),
    ...bookings.map(booking => ({ id: `booking-${booking.id}`, kind: 'booking', title: `Booking ${booking.reference || ''}`, status: booking.status, at: booking.created_at })),
    ...tickets.map(ticket => ({ id: `ticket-${ticket.id}`, kind: 'ticket', title: ticket.ticket_number || ticket.subject || 'Ticket', status: ticket.status, at: ticket.created_at })),
    ...sessions.map(session => ({ id: `conversation-${session.id}`, kind: 'conversation', title: `${session.channel || 'Web'} conversation`, status: session.mode || 'ai', at: session.last_message_at || session.created_at })),
    ...communications.map(message=>({id:`communication-${message.id}`,kind:message.channel,title:`${message.channel==='email'?'Email':'WhatsApp'}: ${message.subject||message.body.slice(0,80)}`,status:message.status,at:message.created_at})),
  ].filter(item => item.at).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 100)

  return NextResponse.json({
    ...contact, profile: contact.custom_fields || {}, segments: segmentDetails.map((segment:any)=>segment.name), segment_details: segmentDetails, orders, bookings: bookings.map(booking => ({ ...booking, service_name: serviceNames.get(booking.service_id) || null })),
    tickets: tickets.map(ticket => ({ ...ticket, returns: (ticketReturns || []).filter(item => item.ticket_id === ticket.id) })),
    conversations: sessions, communications, consent, activity,
    stats: { orders: orders.length, total_spend: totalSpend, bookings: bookings.length, tickets: tickets.length, open_tickets: tickets.filter(ticket => !['resolved','solved','closed'].includes(ticket.status)).length, conversations: sessions.length || Number(contact.conversation_count || 0) },
  })
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const access = await auth(req)
    if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json()
    let existingQuery = supabase.from('contacts').select('custom_fields').eq('id', params.id)
    if (!access.isAdmin) existingQuery = existingQuery.eq('client_id', access.userId)
    const { data: existing } = await existingQuery.maybeSingle()
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const updates: Record<string, unknown> = Object.fromEntries(editable.filter(key => body[key] !== undefined).map(key => [key, body[key]]))
    if(body.phone!==undefined)updates.phone_e164=normalizeE164Phone(body.phone)
    const incomingProfile = typeof body.profile === 'object' && body.profile ? body.profile : {}
    const profile = { ...(existing.custom_fields || {}) } as Record<string, unknown>
    for (const key of profileFields) {
      const value = incomingProfile[key] ?? body[key]
      if (value !== undefined) profile[key] = typeof value === 'string' ? value.trim().slice(0, key === 'notes' ? 4000 : 500) : value
    }
    if (body.custom_fields && typeof body.custom_fields === 'object') Object.assign(profile, body.custom_fields)
    updates.custom_fields = profile
    let updateQuery = supabase.from('contacts').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', params.id)
    if (!access.isAdmin) updateQuery = updateQuery.eq('client_id', access.userId)
    const { data, error } = await updateQuery.select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await Promise.all((['email','sms','web'] as const).flatMap(channel=>{const key=`opt_in_${channel}`;return body[key]===undefined?[]:[logConsent({contactId:params.id,channel,optedIn:body[key]===true,source:'manual'})]}))
    return NextResponse.json(data)
  } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const access = await auth(req)
  if (!access) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let query = supabase.from('contacts').delete().eq('id', params.id)
  if (!access.isAdmin) query = query.eq('client_id', access.userId)
  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
