import { randomUUID } from 'crypto'
import { RETURN_FLOW_RETENTION_SECONDS } from '@/lib/retention'
import { redis } from '@/lib/redis'
import { supabase } from '@/lib/supabase'
import { createTicket } from '@/lib/ticketing'
import { persistResolvedOrder, resolveConnectedOrder } from '@/lib/orderResolver'
import { upsertCustomerContact } from '@/lib/customerContacts'
import { FRIENDLY_RETRY_MESSAGE } from '@/lib/customerErrorMessage'

export type FlowMessageType = 'text' | 'quick_replies' | 'order_card' | 'order_status_card' | 'item_picker' | 'photo_request' | 'summary_card' | 'ticket_card' | 'csat' | 'booking_card' | 'product_search' | 'product_catalog' | 'product_grid' | 'product_detail' | 'commerce_offer_picker' | 'cart_card' | 'checkout_form' | 'saved_address' | 'payment_method' | 'payment_checkout' | 'order_summary' | 'order_receipt' | 'order_confirmation' | 'order_quantity' | 'service_picker' | 'staff_picker' | 'branch_picker' | 'location_form' | 'date_picker' | 'slot_picker' | 'addon_picker' | 'quantity_stepper' | 'contact_form' | 'booking_note' | 'custom_question_form' | 'booking_summary' | 'booking_confirmation' | 'offer_card' | 'claim_confirmation' | 'waitlist_card' | 'reschedule_picker' | 'cancellation_confirm'
export type FlowMessage = { id: string; role: 'bot'; type: FlowMessageType; flowId: string; stepId: string; interactive: boolean; payload: any }
export type FlowMeta = { id: string; name: 'return' | 'booking' | 'order'; step: number; totalSteps: number; canGoBack: boolean }
export type FlowInteraction = { kind?: string; value?: any; label?: string; flowId?: string; stepId?: string; clientMsgId?: string }

type Config = { return_window_days?: number; photo_uploads?: boolean; exchanges?: boolean; allowed_resolutions?: string[]; allow_unverified_complaints?: boolean }
type Step = 'order' | 'identity' | 'item' | 'reason' | 'photos' | 'outcome' | 'review'
type Collected = { orderNumber?: string; orderId?: string; contact?: string; itemId?: string; itemName?: string; maxQty?: number; qty?: number; unitPrice?: number | null; currency?: string; reason?: string; photos?: Array<{ url: string; path?: string; sizeBytes?: number }>; resolution?: string }
type State = { kind: 'interactive_return'; flowId: string; stepId: string; step: Step; attempts: number; collected: Collected; history: Array<{ step: Step; collected: Collected }> }
type ReturnTicket = { id: string; ticket_number: string; status: string; sub_status?: string | null; type: string; order_number?: string | null; updated_at?: string | null; created_at?: string | null }
export type InteractiveResult = { answer: string; source: 'support_flow'; messages: FlowMessage[]; flow: FlowMeta | null; ticketId?: string }

const keyFor = (botId: string, sessionId: string) => `return_flow:${botId}:${sessionId}`
const normalizeEmail = (v?: string | null) => String(v || '').trim().toLowerCase()
const normalizePhone = (v?: string | null) => String(v || '').replace(/\D/g, '').slice(-10)
const extractEmail = (text: string) => text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]
const extractPhone = (text: string) => text.match(/(?:\+?\d[\d\s()-]{8,}\d)/)?.[0]
const extractOrder = (text: string) => (text.match(/\b(?:ORD[-_ ]?)?[A-Z0-9-]{4,24}\b/gi) || []).find(v => /\d/.test(v))?.replace(/\s/g, '')
const safeCustomerName = (value?: string | null) => value && !/^(confirm|cancel|back|damaged|refund|exchange|store credit)$/i.test(value.trim()) ? value.trim() : undefined
const msg = (state: State, type: FlowMessageType, payload: any, interactive = false): FlowMessage => ({ id: randomUUID(), role: 'bot', type, flowId: state.flowId, stepId: state.stepId, interactive, payload })
const textMessage = (state: State, text: string) => msg(state, 'text', { text })
const answerOf = (messages: FlowMessage[]) => messages.map(m => m.payload?.text || m.payload?.title).filter(Boolean).join('\n') || 'Please continue with your request.'
const visibleStep = (step: Step) => step === 'order' || step === 'identity' ? 1 : step === 'item' ? 2 : step === 'reason' || step === 'photos' ? 3 : step === 'outcome' ? 4 : 5
const result = (state: State, messages: FlowMessage[], flow: FlowMeta | null = { id: state.flowId, name: 'return', step: visibleStep(state.step), totalSteps: 5, canGoBack: state.history.length > 0 }): InteractiveResult => ({ answer: answerOf(messages), source: 'support_flow', messages, flow })
const freshStep = (state: State, step: Step, collected = state.collected): State => ({ ...state, step, stepId: randomUUID(), collected })
const withHistory = (state: State, step: Step, collected: Collected): State => freshStep({ ...state, history: [...state.history, { step: state.step, collected: state.collected }] }, step, collected)

async function findOrder(clientId: string, botId: string, number: string) {
  let order = (await supabase.from('support_orders').select('*').eq('client_id', clientId).ilike('order_number', number).maybeSingle()).data
  const stale = order?.metadata?.connector && order?.synced_at && Date.now() - new Date(order.synced_at).getTime() > 300_000
  if (!order || stale) {
    try {
      const resolved = await resolveConnectedOrder({ clientId, botId, orderNumber: number })
      if (resolved.status === 'found' && resolved.order) {
        order = await persistResolvedOrder(clientId, resolved.order)
      } else if (resolved.status === 'not_found' && order?.metadata?.connector) {
        order = null
      }
    } catch (err) {
      console.error('[interactiveReturnFlow findOrder]', err)
    }
  }
  return { unavailable: false, order }
}

const inactiveReturnStatuses = new Set(['rejected', 'cancelled', 'canceled'])

async function orderAvailability(clientId: string, orderId: string) {
  const { data: order } = await supabase.from('support_orders').select('*').eq('id', orderId).eq('client_id', clientId).single()
  let { data: items } = await supabase.from('support_order_items').select('id,external_id,name,sku,quantity,unit_price').eq('order_id', orderId).order('name')
  // Some feeds expose only order-level data. Persist a stable synthetic line so
  // duplicate protection still works at the same granularity as a normal item.
  if (!items?.length && order) {
    const snapshot = order.metadata?.source_snapshot || {}
    const fallbackName = String(snapshot.item_name || snapshot.product_name || snapshot.product || snapshot.title || 'Entire order')
    const { data: fallback } = await supabase.from('support_order_items').upsert({
      order_id: orderId, external_id: '__whole_order__', name: fallbackName.slice(0, 300),
      quantity: 1, unit_price: order.total_amount ?? null, metadata: { generated_from_order_level_record: true },
    }, { onConflict: 'order_id,external_id' }).select('id,external_id,name,sku,quantity,unit_price').single()
    if (fallback) items = [fallback]
  }

  const { data: tickets } = await supabase.from('tickets')
    .select('id,ticket_number,status,sub_status,type,order_number,updated_at,created_at')
    .eq('client_id', clientId).eq('order_id', orderId).in('type', ['return', 'exchange', 'refund'])
    .order('created_at', { ascending: false })
  const typedTickets = (tickets || []) as ReturnTicket[]
  const ticketById = new Map(typedTickets.map(ticket => [ticket.id, ticket]))
  const { data: returns } = typedTickets.length
    ? await supabase.from('ticket_returns').select('ticket_id,order_item_id,status').in('ticket_id', typedTickets.map(ticket => ticket.id))
    : { data: [] as any[] }
  const claimedByItem = new Map<string, ReturnTicket>()
  for (const itemReturn of returns || []) {
    if (!itemReturn.order_item_id || inactiveReturnStatuses.has(String(itemReturn.status || '').toLowerCase())) continue
    const ticket = ticketById.get(itemReturn.ticket_id)
    if (ticket && !claimedByItem.has(itemReturn.order_item_id)) claimedByItem.set(itemReturn.order_item_id, ticket)
  }
  const availableItems = (items || []).filter(item => !claimedByItem.has(item.id))
  return { order, items: items || [], availableItems, claimedByItem, latestTicket: typedTickets[0] || null }
}

async function mirrorNativeCommerceReturn(input:{clientId:string;ticketId:string;supportOrder:any;supportItem:any;quantity:number;reason:string;resolution:string}) {
  const nativeOrderId=String(input.supportOrder?.external_id||'').match(/^commerce:([0-9a-f-]{36})$/i)?.[1]
  const nativeItemId=String(input.supportItem?.external_id||'')
  if(!nativeOrderId||!/^[0-9a-f-]{36}$/i.test(nativeItemId))return
  try{
    const order=(await supabase.from('commerce_orders').select('id,status').eq('client_id',input.clientId).eq('id',nativeOrderId).maybeSingle()).data
    const item=(await supabase.from('commerce_order_items').select('id,quantity').eq('order_id',nativeOrderId).eq('id',nativeItemId).maybeSingle()).data
    if(!order||!item)return
    const existing=(await supabase.from('commerce_returns').select('id').eq('client_id',input.clientId).eq('ticket_id',input.ticketId).maybeSingle()).data
    if(existing)return
    const kind=input.resolution==='exchange'?'exchange':'return'
    const created=await supabase.from('commerce_returns').insert({client_id:input.clientId,order_id:nativeOrderId,ticket_id:input.ticketId,kind,status:'requested',reason_code:input.reason,customer_note:'Created from verified chatbot return flow'}).select('id,reference').single()
    if(created.error||!created.data)throw new Error(created.error?.message||'Commerce return could not be created')
    const line=await supabase.from('commerce_return_items').insert({return_id:created.data.id,order_item_id:nativeItemId,quantity:Math.min(Number(item.quantity),Math.max(1,input.quantity))})
    if(line.error){await supabase.from('commerce_returns').delete().eq('id',created.data.id).eq('client_id',input.clientId);throw new Error(line.error.message)}
    const ticket=(await supabase.from('tickets').select('metadata').eq('client_id',input.clientId).eq('id',input.ticketId).maybeSingle()).data
    await Promise.all([
      supabase.rpc('transition_commerce_order',{p_client:input.clientId,p_order:nativeOrderId,p_status:'return_requested',p_note:`${created.data.reference} opened by verified customer`,p_actor:null}),
      supabase.from('tickets').update({metadata:{...(ticket?.metadata||{}),commerce_order_id:nativeOrderId,commerce_return_id:created.data.id,support_flow:true}}).eq('client_id',input.clientId).eq('id',input.ticketId),
    ])
  }catch(error:any){
    // Migration rollouts must never break the established customer ticket flow.
    console.warn('[return flow commerce mirror]',error?.message||error)
  }
}

function existingTicketCard(state: State, ticket: ReturnTicket, text = 'A return ticket has already been raised for this item.') {
  return [
    textMessage(state, text),
    msg(state, 'ticket_card', {
      ticketId: ticket.id, ticketNumber: ticket.ticket_number, status: ticket.status,
      subStatus: ticket.sub_status || ticket.status, type: ticket.type,
      orderNumber: ticket.order_number, updatedAt: ticket.updated_at,
      nextStep: 'This item is already linked to this ticket. No duplicate ticket was created.',
    }),
  ]
}

async function render(state: State, config: Config, clientId: string): Promise<FlowMessage[]> {
  if (state.step === 'order') return [
    msg(state, 'text', { text: `I can help with a return. Enter the order ID from your confirmation. Returns are normally eligible within ${config.return_window_days || 30} days of delivery.` }, true),
  ]
  if (state.step === 'identity') return [msg(state, 'text', { text: 'For security, enter the email address or phone number used on the order.' }, true)]
  if (state.step === 'item') {
    const { order, availableItems, claimedByItem, latestTicket } = await orderAvailability(clientId, state.collected.orderId!)
    const days = order?.delivered_at ? Math.max(0, Math.ceil((Number(config.return_window_days || 30) * 86400000 - (Date.now() - new Date(order.delivered_at).getTime())) / 86400000)) : null
    const claimedTicket = Array.from(claimedByItem.values())[0] || latestTicket
    if (!availableItems.length && claimedTicket) return existingTicketCard(state, claimedTicket, 'A return ticket has already been raised for every item in this order.')
    return [
      ...(claimedByItem.size ? [textMessage(state, `${claimedByItem.size} item${claimedByItem.size === 1 ? '' : 's'} already ${claimedByItem.size === 1 ? 'has' : 'have'} a return ticket. Choose from the remaining items.`)] : []),
      msg(state, 'order_card', { verified: true, orderNumber: order?.order_number, status: order?.status, deliveredAt: order?.delivered_at, daysLeft: days }),
      msg(state, 'item_picker', { title: 'Which item do you want to return?', currency: order?.currency || 'INR', items: availableItems }, true),
    ]
  }
  if (state.step === 'reason') return [
    msg(state, 'quick_replies', { title: 'What went wrong?', choices: [
      { value: 'damaged', label: 'Damaged' }, { value: 'wrong_item', label: 'Wrong item' },
      { value: 'missing_parts', label: 'Missing parts' }, { value: 'defective', label: 'Defective' },
      { value: 'changed_mind', label: 'Changed my mind' },
    ] }, true),
  ]
  if (state.step === 'photos') return [msg(state, 'photo_request', {
    title: 'Sorry about that. Add at least one photo of the damaged product.', max: 4, min: 1, canSkip: false,
  }, true)]
  if (state.step === 'outcome') {
    const allowed = (config.allowed_resolutions?.length ? config.allowed_resolutions : ['refund']).filter(v => v !== 'exchange' || config.exchanges)
    const amount = Number(state.collected.unitPrice || 0) * Number(state.collected.qty || 1)
    return [msg(state, 'quick_replies', { title: 'Choose your preferred outcome', choices: allowed.map(v => ({ value: v, label: v === 'refund' && amount ? `Refund ${state.collected.currency || 'INR'} ${amount.toLocaleString()}` : v.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) })) }, true)]
  }
  const amount = Number(state.collected.unitPrice || 0) * Number(state.collected.qty || 1)
  return [msg(state, 'summary_card', { title: 'Review your request', rows: [
    ['Item', `${state.collected.itemName} × ${state.collected.qty || 1}`], ['Order', state.collected.orderNumber],
    ['Reason', `${String(state.collected.reason || '').replace(/_/g, ' ')}${state.collected.photos?.length ? ` · ${state.collected.photos.length} photo${state.collected.photos.length > 1 ? 's' : ''}` : ''}`],
    ['Outcome', `${String(state.collected.resolution || '').replace(/_/g, ' ')}${amount && state.collected.resolution === 'refund' ? ` ${state.collected.currency || 'INR'} ${amount.toLocaleString()}` : ''}`],
  ], actions: [{ value: 'confirm', label: 'Confirm', primary: true }, { value: 'edit', label: 'Edit' }, { value: 'cancel', label: 'Cancel' }] }, true)]
}

function choiceValue(interaction: FlowInteraction | undefined, text: string) {
  const value = interaction?.value
  if (typeof value === 'string') return value.toLowerCase().trim()
  return text.toLowerCase().trim()
}

export async function handleInteractiveReturnFlow(input: { clientId: string; botId: string; sessionId: string; text: string; knownContact?: { name?: string | null; email?: string | null; phone?: string | null }; config: Config; interaction?: FlowInteraction; channel?: string }): Promise<InteractiveResult | null> {
  const stateKey = keyFor(input.botId, input.sessionId)
  let state = await redis.get<State>(stateKey).catch(() => null)
  const lower = input.text.toLowerCase().trim()
  const isIntent = /\b(return|refund|exchange|replace|damaged item|wrong item)\b/i.test(input.text)
  if (!state && !isIntent && !input.interaction?.flowId) return null
  if (!state) state = { kind: 'interactive_return', flowId: randomUUID(), stepId: randomUUID(), step: 'order', attempts: 0, collected: {}, history: [] }
  const save = async (next: State) => { state = next; await redis.set(stateKey, next, { ex: RETURN_FLOW_RETENTION_SECONDS }) }
  const clear = () => redis.del(stateKey)

  if (input.interaction?.flowId && (input.interaction.flowId !== state.flowId || input.interaction.stepId !== state.stepId)) {
    const messages = [textMessage(state, 'That option has expired because the request moved forward. Use the current choices below.'), ...(await render(state, input.config, input.clientId))]
    return result(state, messages)
  }
  const kind = input.interaction?.kind
  if (kind === 'cancel' || /^(cancel|stop|never ?mind|cancel request)$/i.test(lower)) {
    await clear(); const messages = [textMessage(state, 'Your return request was cancelled. No ticket was created.')]
    return result(state, messages, null)
  }
  if (kind === 'back') {
    const previous = state.history.at(-1)
    if (previous) await save(freshStep({ ...state, history: state.history.slice(0, -1) }, previous.step, previous.collected))
    return result(state, await render(state, input.config, input.clientId))
  }

  if (state.step === 'order') {
    const orderNumber = extractOrder(input.text)
    if (!orderNumber) { await save(state); return result(state, await render(state, input.config, input.clientId)) }
    findOrder(input.clientId, input.botId, orderNumber).catch(() => {})
    await save(withHistory(state, 'identity', { ...state.collected, orderNumber }))
    return result(state, await render(state, input.config, input.clientId))
  }
  if (state.step === 'identity') {
    const rawDigits = input.text.replace(/\D/g, '')
    const contact = extractEmail(input.text) || (rawDigits.length >= 7 ? rawDigits : extractPhone(input.text))
    if (!contact) return result(state, [msg(state, 'text', { text: 'Enter the email address or phone number used on the order.' }, true)])
    const lookup = await findOrder(input.clientId, input.botId, state.collected.orderNumber!)
    const order = lookup.order
    const contactStr = String(contact)
    const emailMatch = extractEmail(contactStr) && order?.customer_email && normalizeEmail(contactStr) === normalizeEmail(order.customer_email)
    const phoneMatch = order?.customer_phone && (
      (rawDigits.length >= 7 && normalizePhone(contactStr) === normalizePhone(order.customer_phone)) ||
      (extractPhone(contactStr) && normalizePhone(contactStr) === normalizePhone(order.customer_phone))
    )
    const matches = Boolean(order && (emailMatch || phoneMatch))
    if (!matches) {
      const next = { ...state, attempts: state.attempts + 1, stepId: randomUUID() }; await save(next)
      const messages = [msg(next, 'text', { text: "We couldn't match those details. Check the order ID and contact information, then try again." }, true)]
      if (next.attempts >= 3) messages.push(msg(next, 'quick_replies', { choices: [{ value: 'agent', label: 'Talk to an agent' }] }, true))
      return result(next, messages)
    }
    const sourceSnapshot=order.metadata?.source_snapshot||{}
    await upsertCustomerContact({clientId:input.clientId,botId:input.botId,sessionId:input.sessionId,name:sourceSnapshot.customer_name||sourceSnapshot.full_name||input.knownContact?.name,email:order.customer_email||extractEmail(contactStr),phone:order.customer_phone||extractPhone(contactStr),channel:input.channel,source:'support_flow',customFields:{last_verified_order:order.order_number}})
    const delivered = order.delivered_at ? new Date(order.delivered_at).getTime() : null
    const eligible = !delivered || Date.now() - delivered <= Number(input.config.return_window_days || 30) * 86400000
    if (!eligible) { await clear(); const messages = [textMessage(state, 'This order is outside the standard return window. I can connect you with an agent for a manual review.')]; return result(state, messages, null) }
    const availability = await orderAvailability(input.clientId, order.id)
    if (availability.items.length && !availability.availableItems.length) {
      const existing = Array.from(availability.claimedByItem.values())[0] || availability.latestTicket
      await clear()
      if (existing) {
        const ticketState = freshStep(state, 'item', { ...state.collected, orderId: order.id, orderNumber: order.order_number })
        return { ...result(ticketState, existingTicketCard(ticketState, existing, 'A return ticket has already been raised for this order.'), null), ticketId: existing.id }
      }
    }
    await save(withHistory(state, 'item', { ...state.collected, orderId: order.id, orderNumber: order.order_number, contact: String(contact), currency: order.currency }))
    return result(state, await render(state, input.config, input.clientId))
  }
  if (state.step === 'item') {
    const availability = await orderAvailability(input.clientId, state.collected.orderId!)
    const raw = input.interaction?.value
    let itemId = typeof raw === 'object' ? raw?.orderItemId || raw?.itemId : undefined
    const requestedQty = Math.max(1, Number(typeof raw === 'object' ? raw?.qty : 1) || 1)
    if (!itemId) {
      const numbered = Number(input.text.trim()) - 1
      itemId = Number.isInteger(numbered) && numbered >= 0 ? availability.availableItems[numbered]?.id : availability.availableItems.find((candidate: any) => lower.includes(candidate.name.toLowerCase()))?.id
    }
    const claimedTicket = itemId ? availability.claimedByItem.get(itemId) : undefined
    if (claimedTicket) {
      if (!availability.availableItems.length) {
        await clear()
        return { ...result(state, existingTicketCard(state, claimedTicket), null), ticketId: claimedTicket.id }
      }
      return result(state, [...existingTicketCard(state, claimedTicket), ...(await render(state, input.config, input.clientId))])
    }
    const item = availability.availableItems.find(candidate => candidate.id === itemId)
    if (!item || requestedQty > item.quantity) return result(state, [textMessage(state, 'Choose an item and a valid quantity from the order.'), ...(await render(state, input.config, input.clientId))])
    await save(withHistory(state, 'reason', { ...state.collected, itemId: item.id, itemName: item.name, maxQty: item.quantity, qty: requestedQty, unitPrice: item.unit_price }))
    return result(state, await render(state, input.config, input.clientId))
  }
  if (state.step === 'reason') {
    const aliases: Record<string, string> = { damaged: 'damaged', damage: 'damaged', 'wrong item': 'wrong_item', wrong_item: 'wrong_item', 'missing parts': 'missing_parts', missing_parts: 'missing_parts', defective: 'defective', 'changed my mind': 'changed_mind', changed_mind: 'changed_mind' }
    const selectedReason = choiceValue(input.interaction, input.text)
    const reason = aliases[selectedReason] || Object.entries(aliases).find(([key]) => selectedReason.includes(key))?.[1]
    if (!reason) return result(state, [textMessage(state, 'Choose one of the reasons below.'), ...(await render(state, input.config, input.clientId))])
    // Evidence is required for physical-condition claims. This is part of the
    // return workflow itself, independent of the general chat attachment toggle.
    const needsPhoto = ['damaged', 'wrong_item', 'missing_parts', 'defective'].includes(reason)
    await save(withHistory(state, needsPhoto ? 'photos' : 'outcome', { ...state.collected, reason }))
    return result(state, await render(state, input.config, input.clientId))
  }
  if (state.step === 'photos') {
    const raw = input.interaction?.value || {}
    const photos = Array.isArray(raw?.photos) ? raw.photos.slice(0, 4) : []
    if (!raw?.skipped && photos.length < 1) return result(state, [textMessage(state, 'Add at least one photo, or choose Skip for now.'), ...(await render(state, input.config, input.clientId))])
    await save(withHistory(state, 'outcome', { ...state.collected, photos }))
    return result(state, await render(state, input.config, input.clientId))
  }
  if (state.step === 'outcome') {
    const allowed = (input.config.allowed_resolutions?.length ? input.config.allowed_resolutions : ['refund']).filter(v => v !== 'exchange' || input.config.exchanges)
    const resolution = allowed.find(v => choiceValue(input.interaction, input.text).includes(v.replace(/_/g, ' ')))
    if (!resolution) return result(state, [textMessage(state, 'Choose one of the available outcomes.'), ...(await render(state, input.config, input.clientId))])
    await save(withHistory(state, 'review', { ...state.collected, resolution }))
    return result(state, await render(state, input.config, input.clientId))
  }
  const action = choiceValue(input.interaction, input.text)
  if (action === 'edit') { await save(freshStep(state, 'item')); return result(state, await render(state, input.config, input.clientId)) }
  if (!['confirm', 'yes', 'create'].includes(action)) return result(state, await render(state, input.config, input.clientId))
  try {
    // Re-read the source-backed order and item claims at confirmation time. This
    // prevents a stale browser/session from creating a second ticket.
    const availability = await orderAvailability(input.clientId, state.collected.orderId!)
    const claimedTicket = state.collected.itemId ? availability.claimedByItem.get(state.collected.itemId) : undefined
    if (claimedTicket) {
      await clear()
      const ticketState = freshStep(state, 'review')
      return { ...result(ticketState, existingTicketCard(ticketState, claimedTicket), null), ticketId: claimedTicket.id }
    }
    const selectedItemId = state.collected.itemId
    const sourceItem = availability.availableItems.find(item => item.id === selectedItemId)
    if (!availability.order || !sourceItem) {
      const itemState = freshStep(state, 'item', { ...state.collected, itemId: undefined, itemName: undefined, qty: undefined, unitPrice: undefined })
      await save(itemState)
      return result(itemState, [textMessage(itemState, 'That item is no longer available for a new return. Choose from the remaining items.'), ...(await render(itemState, input.config, input.clientId))])
    }
    const { data: session } = await supabase.from('sessions').select('id,contact_id').eq('session_id', input.sessionId).eq('client_id', input.clientId).maybeSingle()
    const sourceOrder = availability.order
    const sourceSnapshot = sourceOrder.metadata?.source_snapshot || {}
    const customerName = safeCustomerName(sourceOrder.metadata?.customer_name || sourceSnapshot.customer_name || sourceSnapshot.full_name || sourceSnapshot.billing_name || sourceSnapshot.contact_name || input.knownContact?.name)
    const customerEmail = sourceOrder.customer_email || extractEmail(state.collected.contact || '') || input.knownContact?.email
    const customerPhone = sourceOrder.customer_phone || extractPhone(state.collected.contact || '') || input.knownContact?.phone
    const ticketResult = await createTicket({ client_id: input.clientId, bot_id: input.botId, session_id: session?.id, contact_id: sourceOrder.contact_id || session?.contact_id,
      customer_name: customerName, customer_email: customerEmail, customer_phone: customerPhone,
      subject: `${state.collected.resolution === 'exchange' ? 'Exchange' : 'Return'} request: ${state.collected.itemName}`,
      description: `Verified return request.\nOrder: ${sourceOrder.order_number}\nItem: ${sourceItem.name}\nQuantity: ${state.collected.qty || 1}\nReason: ${String(state.collected.reason).replace(/_/g, ' ')}\nRequested outcome: ${String(state.collected.resolution).replace(/_/g, ' ')}\nEvidence photos: ${state.collected.photos?.length || 0}.`,
      type: state.collected.resolution === 'exchange' ? 'exchange' : 'return', source: 'bot_flow', verification_status: 'verified',
      order_id: sourceOrder.id, order_number: sourceOrder.order_number, metadata: {
        support_flow: true, photo_count: state.collected.photos?.length || 0,
        order_item_id: sourceItem.id, item_name: sourceItem.name, quantity: state.collected.qty || 1,
        reason: state.collected.reason, requested_resolution: state.collected.resolution,
        order_source: sourceOrder.metadata?.connector?.sourceType,
        source_database_id: sourceOrder.metadata?.connector?.databaseId,
        source_record_id: sourceOrder.external_id,
      }, allow_duplicate: true }, { type: 'bot' })

    const { data: existingReturn } = await supabase.from('ticket_returns').select('id').eq('ticket_id', ticketResult.ticket.id).maybeSingle()
    if (!existingReturn) {
      const { error: returnError } = await supabase.from('ticket_returns').insert({ ticket_id: ticketResult.ticket.id, order_item_id: state.collected.itemId, reason_code: state.collected.reason, requested_resolution: state.collected.resolution, quantity: state.collected.qty || 1, status: 'requested', eligibility_snapshot: { eligible: true, return_window_days: input.config.return_window_days || 30 } })
      if (returnError) throw new Error(returnError.message)
    }
    await mirrorNativeCommerceReturn({clientId:input.clientId,ticketId:ticketResult.ticket.id,supportOrder:sourceOrder,supportItem:sourceItem,quantity:state.collected.qty||1,reason:String(state.collected.reason||'other'),resolution:String(state.collected.resolution||'refund')})

    const photos = (state.collected.photos || []).filter(photo => photo.path)
    for (let index = 0; index < photos.length; index++) {
      const photo = photos[index]
      const { data: existing } = await supabase.from('ticket_attachments').select('id').eq('ticket_id', ticketResult.ticket.id).eq('storage_path', photo.path!).maybeSingle()
      if (!existing) {
        const { error: attachmentError } = await supabase.from('ticket_attachments').insert({ ticket_id: ticketResult.ticket.id, client_id: input.clientId, storage_path: photo.path!, file_name: `return-photo-${index + 1}.webp`, mime_type: 'image/webp', size_bytes: photo.sizeBytes || null, scan_status: 'pending' })
        if (attachmentError) throw new Error(attachmentError.message)
      }
    }

    await clear()
    const ticketState = freshStep(state, 'review')
    const outcome = state.collected.resolution === 'refund' ? 'refund' : String(state.collected.resolution || 'return').replace(/_/g, ' ')
    const messages = [
      msg(ticketState, 'ticket_card', { ticketId: ticketResult.ticket.id, ticketNumber: ticketResult.ticket.ticket_number, status: ticketResult.ticket.status, subStatus: ticketResult.ticket.sub_status || 'review', type: ticketResult.ticket.type, orderNumber: ticketResult.ticket.order_number, updatedAt: ticketResult.ticket.updated_at, nextStep: `Your ${outcome} request was raised successfully. We’ll notify you as soon as it is reviewed.` }),
      msg(ticketState, 'csat', { ticketId: ticketResult.ticket.id, title: 'How was your experience?' }, true),
    ]
    return { ...result(ticketState, messages, null), ticketId: ticketResult.ticket.id }
  } catch (error) {
    console.error('[return flow confirmation]', error)
    const retryState = freshStep(state, 'review')
    await save(retryState)
    return result(retryState, [
      textMessage(retryState, FRIENDLY_RETRY_MESSAGE),
      ...(await render(retryState, input.config, input.clientId)),
    ])
  }
}
