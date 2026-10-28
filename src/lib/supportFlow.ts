import { supabase } from '@/lib/supabase'
import { redis } from '@/lib/redis'
import { createTicket } from '@/lib/ticketing'
import { persistResolvedOrder, resolveConnectedOrder } from '@/lib/orderResolver'
import { handleInteractiveReturnFlow, type FlowInteraction, type FlowMessage, type FlowMeta } from '@/lib/interactiveReturnFlow'
import { handleBookingFlow } from '@/lib/bookingFlow'
import { handleCommerceFlow } from '@/lib/commerceFlow'
import { handleOrderTrackingFlow } from '@/lib/orderTrackingFlow'
import { isOrderTrackingRequest } from '@/lib/orderTrackingFlow'
import { isPotentialCommerceRequest } from '@/lib/commerceIntent'
import { isPotentialBookingRequest } from '@/lib/bookingIntent'
import { RETURN_FLOW_RETENTION_SECONDS } from '@/lib/retention'
import { getEffectiveEntitlements, featureAllowed } from '@/lib/saas/entitlements'
import type { ChatRequestContext } from '@/lib/chat/requestContext'
import { handleAuthoritativeFactQuestion, isAuthoritativeFactRequest } from '@/lib/chat/factCardFlow'
import type { BotJourneyPolicy } from '@/lib/botJourney'

type KnownContact = { name?: string | null; email?: string | null; phone?: string | null }
type FlowState = { kind: 'return' | 'ticket_status'; step: string; orderId?: string; orderNumber?: string;
  orderItemId?: string; itemName?: string; reason?: string; resolution?: string; ticketNumber?: string; attempts?: number }
type SupportResult = { answer: string; source: string; ticketId?: string; orderId?: string; messages?: FlowMessage[]; flow?: FlowMeta | null; _stateCommit?:Promise<unknown> }
type StrictSupportState={step:'phone'|'order'|'verified';phone?:string;orderId?:string;orderNumber?:string;source?:'commerce'|'support'|'connector';attempts?:number}

const normalizePhone = (value?: string | null) => String(value || '').replace(/\D/g, '').slice(-10)
const normalizeEmail = (value?: string | null) => String(value || '').trim().toLowerCase()

function extractEmail(text: string) { return text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() }
function extractPhone(text: string) { return text.match(/(?:\+?\d[\d\s()-]{8,}\d)/)?.[0] }
function extractOrder(text: string) {
  const candidates = text.match(/\b(?:ORD[-_ ]?)?[A-Z0-9-]{4,24}\b/gi) || []
  return candidates.find(value => /\d/.test(value))?.replace(/\s/g, '')
}
function extractTicket(text: string) { return text.match(/\bTKT-?\d{3,12}\b/i)?.[0]?.toUpperCase().replace(/^TKT(\d)/, 'TKT-$1') }
export const isPotentialSupportFlowRequest=(text:string)=>isOrderTrackingRequest(text)||isPotentialCommerceRequest(text)||isPotentialBookingRequest(text)||isAuthoritativeFactRequest(text)||/\b(?:return|refund|exchange|replace|complaint|ticket(?:\s+status)?|damaged|wrong item|missing parts)\b/i.test(text)

async function strictSupportBot(clientId:string,botId:string){
 const key=`strict_support_bot:${botId}`,cached=await redis.get<boolean>(key).catch(()=>null);if(cached!=null)return cached
 const [botResult,settingsResult]=await Promise.all([supabase.from('bots').select('bot_flow').eq('client_id',clientId).eq('id',botId).maybeSingle(),supabase.from('bot_settings').select('support_config').eq('client_id',clientId).eq('bot_id',botId).maybeSingle()]),bot=botResult.data,strict=bot?.bot_flow?.type==='support'||settingsResult.data?.support_config?.strict_support_mode===true
 await redis.set(key,strict,{ex:300}).catch(()=>{});return strict
}
const journeyMessage=(policy:BotJourneyPolicy|undefined,type:keyof BotJourneyPolicy['nodeMessages'],fallback:string,variables:Record<string,string>={})=>{
 const template=policy?.nodeMessages?.[type]||fallback
 return template.replace(/\{(order_id|phone)\}/g,(_,key)=>variables[key]||'')
}
async function strictSupportGate(input:{clientId:string;botId:string;sessionId:string;text:string;knownContact?:KnownContact;journeyPolicy?:BotJourneyPolicy}){
 const key=`strict_support_identity:${input.clientId}:${input.botId}:${input.sessionId}`,state=await redis.get<StrictSupportState>(key).catch(()=>null),save=(value:StrictSupportState)=>redis.set(key,value,{ex:RETURN_FLOW_RETENTION_SECONDS}),lower=input.text.trim().toLowerCase()
 if(/\b(?:use|try|verify) (?:a )?(?:different|another) (?:order|phone)|start over\b/i.test(lower)){await save({step:'phone'});return{result:{answer:'Of course. Please enter the registered phone number for the order.',source:'strict_support'},state:null}}
 if(!state){await save({step:'phone'});return{result:{answer:journeyMessage(input.journeyPolicy,'verify_phone','Welcome to support. To protect your details, please enter the registered phone number first.'),source:'strict_support'},state:null}}
 if(state.step==='phone'){
  const phone=extractPhone(input.text)||(/^\+?[0-9\s()-]{8,20}$/.test(input.text.trim())?input.text.trim():undefined),normalized=normalizePhone(phone)
  if(normalized.length<8){const attempts=(state.attempts||0)+1;await save({...state,attempts});const config=input.journeyPolicy?.nodeConfigs?.verify_phone;return{result:{answer:config?.invalidMessage||((attempts>=Number(config?.maxAttempts||3))?'That number still does not look valid. You can try again or ask for a human agent.':'Please enter a valid registered phone number, including the country or area code.'),source:'strict_support'},state:null}}
  if(input.journeyPolicy?.supportOnly&&input.journeyPolicy.requireOrder===false){
   const [contact,commerce,support]=await Promise.all([
    supabase.from('contacts').select('id').eq('client_id',input.clientId).or(`phone.eq.${phone},phone.eq.${normalized}`).limit(1).maybeSingle(),
    supabase.from('commerce_orders').select('id').eq('client_id',input.clientId).or(`customer_phone.eq.${phone},customer_phone.eq.${normalized}`).limit(1).maybeSingle(),
    supabase.from('support_orders').select('id').eq('client_id',input.clientId).or(`customer_phone.eq.${phone},customer_phone.eq.${normalized}`).limit(1).maybeSingle(),
   ])
   if(!contact.data&&!commerce.data&&!support.data)return{result:{answer:"I couldn't match that phone number to a customer record. Please check it and try again.",source:'strict_support'},state:null}
   const verified:StrictSupportState={step:'verified',phone:normalized};await save(verified)
   return{result:{answer:journeyMessage(input.journeyPolicy,'support','Thanks, your phone number is verified. How can I help?',{phone:normalized}),source:'strict_support'},state:verified}
  }
  const next:StrictSupportState={step:'order',phone:normalized,attempts:0};await save(next);const success=input.journeyPolicy?.nodeConfigs?.verify_phone?.successMessage;return{result:{answer:[success,journeyMessage(input.journeyPolicy,'verify_order','Thanks. Now enter the order ID from your confirmation, for example `ORD-10234`.')].filter(Boolean).join('\n\n'),source:'strict_support'},state:null}
 }
 if(state.step==='order'){
  const orderNumber=extractOrder(input.text);if(!orderNumber){const attempts=(state.attempts||0)+1;await save({...state,attempts});return{result:{answer:input.journeyPolicy?.nodeConfigs?.verify_order?.invalidMessage||'Please enter a valid order ID exactly as shown in the confirmation.',source:'strict_support'},state:null}}
  let order:any=(await supabase.from('commerce_orders').select('id,reference,customer_phone').eq('client_id',input.clientId).ilike('reference',orderNumber).maybeSingle()).data,source:StrictSupportState['source']='commerce'
  if(!order){const support=(await supabase.from('support_orders').select('*').eq('client_id',input.clientId).ilike('order_number',orderNumber).maybeSingle()).data;if(support){order={id:support.id,reference:support.order_number,customer_phone:support.customer_phone};source='support'}}
  if(!order){try{const resolved=await resolveConnectedOrder({clientId:input.clientId,botId:input.botId,orderNumber});if(resolved.status==='found'&&resolved.order){const stored=await persistResolvedOrder(input.clientId,resolved.order);order={id:stored.id,reference:stored.order_number,customer_phone:stored.customer_phone};source='connector'}}catch(error){console.error('[strict support order resolution]',error)}}
  if(!order||!normalizePhone(order.customer_phone)||normalizePhone(order.customer_phone)!==state.phone){const attempts=(state.attempts||0)+1;await save({...state,attempts});return{result:{answer:input.journeyPolicy?.nodeConfigs?.verify_order?.invalidMessage||"I couldn't verify that order and phone together. Check both details, or ask a team member for help without sharing sensitive order information.",source:'strict_support'},state:null}}
  const verified:StrictSupportState={...state,step:'verified',orderId:order.id,orderNumber:order.reference,source,attempts:0};await save(verified);return{result:{answer:[input.journeyPolicy?.nodeConfigs?.verify_order?.successMessage,journeyMessage(input.journeyPolicy,'support',`Order **${order.reference}** is verified. How can I help with it?`,{order_id:order.reference,phone:state.phone||''})].filter(Boolean).join('\n\n'),source:'strict_support',orderId:order.id},state:verified}
 }
 return{result:null,state}
}

export async function handleSupportFlow(input: {
  clientId: string; botId: string; sessionId: string; text: string; knownContact?: KnownContact; mediaUrl?: string | null; interaction?: FlowInteraction; channel?: string; requestContext?: ChatRequestContext; routeHints?:any[]; journeyPolicy?: BotJourneyPolicy
}): Promise<SupportResult | null> {
  const { clientId, botId, sessionId, text } = input
  // One cache round-trip determines whether a deterministic flow owns this
  // turn. Ordinary knowledge questions should not serially probe every order,
  // commerce, booking, return and support handler before reaching RAG.
  const routeKeys=[
    `strict_support_bot:${botId}`,
    `order_tracking_flow:${clientId}:${botId}:${sessionId}`,
    `commerce_flow:${clientId}:${botId}:${sessionId}`,
    `booking_flow:${clientId}:${botId}:${sessionId}`,
    `return_flow:${botId}:${sessionId}`,
    `support_flow:${botId}:${sessionId}`,
  ]
  const routeHints=input.routeHints||await redis.mget<any[]>(...routeKeys).catch(()=>[])
  const strict=input.journeyPolicy?.supportOnly===true||(typeof routeHints[0]==='boolean'?routeHints[0]:await strictSupportBot(clientId,botId))
  let routedInput=input
  if(strict){const gate=await strictSupportGate(input);if(gate.result)return gate.result;const verified=gate.state!;routedInput={...input,knownContact:{...input.knownContact,phone:verified.phone},text:/\b(?:return|refund|exchange|replace|track|status|cancel|change)\b/i.test(text)&&verified.orderNumber&&!extractOrder(text)?`${text} ${verified.orderNumber}`:text}}
  const trackingActive=!!routeHints[1]
  if(strict||trackingActive||isOrderTrackingRequest(routedInput.text)){
    const tracking = await handleOrderTrackingFlow(routedInput)
    if (tracking) return tracking
  }
  // Explicit transactional intents must not wait behind the authoritative
  // fact/RAG probe. Those queries are useful for informational turns, but add
  // a remote database hop before a booking or commerce card can be rendered.
  if(!strict){
   if(input.journeyPolicy?.allowCommerce!==false&&(routeHints[2]||isPotentialCommerceRequest(text))){
    const commerce = await handleCommerceFlow(input)
    if (commerce) return commerce
   }
   if(input.journeyPolicy?.allowBooking!==false&&(routeHints[3]||isPotentialBookingRequest(text))){
    const booking = await handleBookingFlow({...input,prefetchedState:input.routeHints?(routeHints[3]??null):undefined})
    if (booking) return booking
   }
  }
  const fact = await handleAuthoritativeFactQuestion({ clientId, botId, sessionId, text })
  if (fact) return fact
  const supportIntent=/\b(?:return|refund|exchange|replace|complaint|ticket(?:\s+status)?|damaged|wrong item|missing parts)\b/i.test(text)
  if(!strict&&!routeHints[4]&&!routeHints[5]&&!supportIntent)return null
  const cacheKey = `support_config:${botId}`
  let config: any = await redis.get(cacheKey).catch(() => null)
  if (!config) {
    config = (await supabase.from('bot_settings').select('support_config').eq('bot_id', botId).maybeSingle()).data?.support_config
    if (!config&&strict)config={returns_refunds:true,exchanges:true,price_lookup:true,stock_lookup:true,ticket_status:true,csat:true,photo_uploads:true,return_window_days:30,require_order_verification:true,allow_unverified_complaints:true,allowed_resolutions:['refund','exchange','store_credit']}
    if (!config) return null
    redis.set(cacheKey, config, { ex: 300 }).catch(() => {})
  }
  if (!Object.values(config).some(value => value === true)) return null
  const supportAllowed=featureAllowed(await (input.requestContext?.getEntitlements()||getEffectiveEntitlements(clientId)),'support.enabled')
  if(!supportAllowed) config={...config,returns_refunds:false,allow_unverified_complaints:false}

  // The card-based return workflow owns return requests. The older text flow
  // below remains as a compatibility fallback for sessions already in flight.
  if (config.returns_refunds) {
    const interactive = await handleInteractiveReturnFlow({ ...routedInput, config })
    if (interactive) return interactive
  }

  const stateKey = `support_flow:${botId}:${sessionId}`
  const state = await redis.get<FlowState>(stateKey).catch(() => null)
  const saveState = (next: FlowState) => redis.set(stateKey, next, { ex: RETURN_FLOW_RETENTION_SECONDS })
  const clearState = () => redis.del(stateKey)
  const lower = text.toLowerCase().trim()
  if (state && /^(cancel|stop|never mind|nevermind)$/i.test(lower)) {
    await clearState(); return { answer: 'No problem — I cancelled that support flow. How else can I help?', source: 'support_flow' }
  }

  if (state?.kind === 'return') {
    if (state.step === 'order') {
      if (/^complaint$/i.test(lower) && (state.attempts || 0) >= 2 && config.allow_unverified_complaints) {
        const result = await createTicket({ client_id: clientId, bot_id: botId, customer_name: input.knownContact?.name,
          customer_email: input.knownContact?.email, subject: 'Unverified order complaint',
          description: 'Customer could not verify an order number through the automated support flow.',
          type: 'complaint', source: 'bot_flow', verification_status: 'unverified',
          metadata: { support_flow: true, verification_failed: true }, allow_duplicate: true }, { type: 'bot' })
        await clearState()
        return { answer: `I created complaint **${result.ticket.ticket_number}**. Our team will review it without disclosing order details.`, source: 'support_flow', ticketId: result.ticket.id }
      }
      const orderNumber = extractOrder(text)
      if (!orderNumber) return { answer: 'Please enter the order number exactly as shown in your confirmation, for example `ORD-10234`.', source: 'support_flow' }
      let order = (await supabase.from('support_orders').select('*').eq('client_id', clientId).ilike('order_number', orderNumber).maybeSingle()).data
      const connectorSnapshotAge = order?.metadata?.connector && order?.synced_at
        ? Date.now() - new Date(order.synced_at).getTime() : 0
      const shouldRefreshConnector = !order || connectorSnapshotAge > 5 * 60_000
      if (shouldRefreshConnector) {
        try {
          const resolution = await resolveConnectedOrder({ clientId, botId, orderNumber })
          if (resolution.status === 'found' && resolution.order) {
            order = await persistResolvedOrder(clientId, resolution.order)
          } else if (resolution.status === 'unconfigured') {
            if (!order) {
              await saveState({ ...state, attempts: 2 })
              return { answer: 'Order verification is not configured for this support bot yet. I can still create an unverified complaint if you reply **complaint**.', source: 'support_flow' }
            }
          } else if (resolution.status === 'not_found' && order?.metadata?.connector) {
            order = null
          }
        } catch (err) {
          console.error('[supportFlow resolveConnectedOrder]', err)
        }
      }
      if (!order) {
        const attempts = (state.attempts || 0) + 1
        await saveState({ ...state, attempts })
        return { answer: attempts >= 2 && config.allow_unverified_complaints
          ? "I couldn't verify that order. Recheck the number, or reply **complaint** and I’ll create an unverified case without exposing order details."
          : "I couldn't verify that order. Please check the number and try again.", source: 'support_flow' }
      }
      await saveState({ ...state, step: 'identity', orderId: order.id, orderNumber: order.order_number, attempts: 0 })
      if (!order.customer_email && !order.customer_phone) {
        await saveState({ ...state, step: 'identity', orderId: order.id, orderNumber: order.order_number, attempts: 2 })
        return { answer: 'I found the order, but its connected data source does not include a mapped customer email or phone, so I cannot verify ownership safely. Reply **complaint** to create an unverified case.', source: 'support_flow' }
      }
      return { answer: 'For security, reply with the email address or phone number used on the order.', source: 'support_flow' }
    }
    if (state.step === 'identity') {
      if (/^complaint$/i.test(lower) && config.allow_unverified_complaints) {
        const result = await createTicket({ client_id: clientId, bot_id: botId, customer_name: input.knownContact?.name,
          customer_email: input.knownContact?.email, subject: 'Unverified order complaint', description: `Customer could not verify order ${state.orderNumber || ''}.`,
          type: 'complaint', source: 'bot_flow', verification_status: 'unverified', order_number: state.orderNumber,
          metadata: { support_flow: true, verification_failed: true }, allow_duplicate: true }, { type: 'bot' })
        await clearState(); return { answer: `I created complaint **${result.ticket.ticket_number}**. Our team will review it without disclosing any order details.`, source: 'support_flow', ticketId: result.ticket.id }
      }
      const { data: order } = await supabase.from('support_orders').select('*').eq('id', state.orderId).eq('client_id', clientId).single()
      const email = extractEmail(text)
      const phone = extractPhone(text)
      const matches = (email && normalizeEmail(email) === normalizeEmail(order?.customer_email)) || (phone && normalizePhone(phone) === normalizePhone(order?.customer_phone))
      if (!matches) {
        const attempts = (state.attempts || 0) + 1; await saveState({ ...state, attempts })
        return { answer: attempts >= 2 && config.allow_unverified_complaints
          ? "Those details don't match the order. Try once more, or reply **complaint** to create an unverified case."
          : "Those details don't match the order. Please use the email or phone from the order confirmation.", source: 'support_flow' }
      }
      const { data: items } = await supabase.from('support_order_items').select('*').eq('order_id', state.orderId).order('name')
      if (!items?.length) {
        await saveState({ ...state, step: 'reason' })
        return { answer: 'Order verified. Briefly tell me what went wrong with the item.', source: 'support_flow' }
      }
      await saveState({ ...state, step: 'item', attempts: 0 })
      return { answer: `Order verified. Which item is affected?\n${items.map((item, index) => `${index + 1}. ${item.name}${item.quantity > 1 ? ` (qty ${item.quantity})` : ''}`).join('\n')}`, source: 'support_flow' }
    }
    if (state.step === 'item') {
      const { data: items } = await supabase.from('support_order_items').select('*').eq('order_id', state.orderId).order('name')
      const index = Number(text.trim()) - 1
      const item = Number.isInteger(index) ? items?.[index] : items?.find((row: any) => lower.includes(row.name.toLowerCase()))
      if (!item) return { answer: 'Please reply with the number beside the affected item.', source: 'support_flow' }
      await saveState({ ...state, step: 'reason', orderItemId: item.id, itemName: item.name })
      return { answer: `What went wrong with **${item.name}**? For example: damaged, wrong item, missing parts, or changed my mind.`, source: 'support_flow' }
    }
    if (state.step === 'reason') {
      if (text.trim().length < 3) return { answer: 'Please add a short reason so our support team has enough context.', source: 'support_flow' }
      const allowed = (config.allowed_resolutions || ['refund']).filter((item: string) => item !== 'exchange' || config.exchanges)
      await saveState({ ...state, step: 'resolution', reason: text.trim() })
      return { answer: `What outcome would you prefer?\n${allowed.map((item: string, index: number) => `${index + 1}. ${item.replace('_', ' ')}`).join('\n')}`, source: 'support_flow' }
    }
    if (state.step === 'resolution') {
      const allowed = (config.allowed_resolutions || ['refund']).filter((item: string) => item !== 'exchange' || config.exchanges)
      const index = Number(text.trim()) - 1
      const resolution = allowed[index] || allowed.find((item: string) => lower.includes(item.replace('_', ' ')))
      if (!resolution) return { answer: 'Please choose one of the listed resolutions.', source: 'support_flow' }
      await saveState({ ...state, step: 'confirm', resolution })
      return { answer: `Please confirm: create a **${resolution.replace('_', ' ')}** request for **${state.itemName || 'the order item'}** from order **${state.orderNumber}**? Reply **yes** to create the ticket or **cancel**.`, source: 'support_flow' }
    }
    if (state.step === 'confirm') {
      if (!/^(yes|y|confirm|create|proceed)$/i.test(lower)) return { answer: 'Reply **yes** to create the ticket, or **cancel** to stop.', source: 'support_flow' }
      const { data: session } = await supabase.from('sessions').select('id, contact_id').eq('session_id', sessionId).eq('client_id', clientId).maybeSingle()
      const { data: order } = await supabase.from('support_orders').select('*').eq('id', state.orderId).single()
      const delivered = order?.delivered_at ? new Date(order.delivered_at).getTime() : null
      const ageDays = delivered ? Math.floor((Date.now() - delivered) / 86_400_000) : null
      const eligible = ageDays === null || ageDays <= Number(config.return_window_days || 30)
      const result = await createTicket({ client_id: clientId, bot_id: botId, contact_id: session?.contact_id,
        session_id: session?.id, customer_name: input.knownContact?.name, customer_email: input.knownContact?.email,
        subject: `${state.resolution === 'exchange' ? 'Exchange' : 'Return'} request: ${state.itemName || state.orderNumber}`,
        description: state.reason, type: state.resolution === 'exchange' ? 'exchange' : 'return', source: 'bot_flow',
        verification_status: 'verified', order_id: state.orderId, order_number: state.orderNumber,
        metadata: { support_flow: true, evidence_url: input.mediaUrl || null, return_eligible: eligible }, allow_duplicate: true }, { type: 'bot' })
      if (!result.duplicate) await supabase.from('ticket_returns').insert({ ticket_id: result.ticket.id,
        order_item_id: state.orderItemId || null, reason_code: 'customer_reported', reason_detail: state.reason,
        requested_resolution: state.resolution, status: eligible ? 'requested' : 'manual_review',
        eligibility_snapshot: { eligible, delivered_at: order?.delivered_at, age_days: ageDays, return_window_days: config.return_window_days } })
      await clearState()
      return { answer: `${result.duplicate ? 'Your existing ticket is' : 'Done — I created'} **${result.ticket.ticket_number}**. ${eligible ? 'Our team will review it and send the next steps.' : 'It is outside the standard return window, so a specialist will review it manually.'}`, source: 'support_flow', ticketId: result.ticket.id }
    }
  }

  if (state?.kind === 'ticket_status') {
    const number = extractTicket(text) || state.ticketNumber
    if (!number) return { answer: 'Please enter your ticket number, for example `TKT-000123`.', source: 'support_flow' }
    const { data: ticket } = await supabase.from('tickets').select('*').eq('client_id', clientId).eq('ticket_number', number).maybeSingle()
    if (!ticket) { await clearState(); return { answer: "I couldn't verify that ticket. Check the number and try again.", source: 'support_flow' } }
    const email = extractEmail(text)
    const matches = email && normalizeEmail(email) === normalizeEmail(ticket.customer_email)
    if (!matches) {
      await saveState({ kind: 'ticket_status', step: 'identity', ticketNumber: number })
      return { answer: 'For security, reply with the email address used when the ticket was created.', source: 'support_flow' }
    }
    await clearState()
    return { answer: `**${ticket.ticket_number}** is **${String(ticket.status).replace('_', ' ')}**${ticket.sub_status ? ` (${ticket.sub_status})` : ''}. Last updated ${new Date(ticket.updated_at).toLocaleDateString()}.`, source: 'support_flow' }
  }

  const returnIntent = /\b(return|refund|exchange|replace|damaged item|wrong item)\b/i.test(text)
  if (returnIntent && config.returns_refunds) {
    await saveState({ kind: 'return', step: 'order' })
    if (extractOrder(text)) {
      // The customer may provide the order number in the same message as the
      // return request. Re-enter the deterministic flow so it is looked up
      // immediately instead of asking for information we already have.
      return handleSupportFlow(input)
    }
    return { answer: `I can help with that. Please enter your order number. Returns are normally eligible within ${config.return_window_days || 30} days of delivery.`, source: 'support_flow' }
  }
  const statusIntent = /\b(ticket status|check (?:my )?ticket|support ticket|TKT-?\d+)\b/i.test(text)
  if (statusIntent && config.ticket_status) {
    const number = extractTicket(text)
    await saveState({ kind: 'ticket_status', step: number ? 'identity' : 'number', ticketNumber: number })
    return { answer: number ? 'For security, reply with the email address used when the ticket was created.' : 'Please enter your ticket number, for example `TKT-000123`.', source: 'support_flow' }
  }
  const priceIntent = /\b(price|cost|how much|pricing)\b/i.test(text)
  const stockIntent = /\b(in stock|stock|available|availability|inventory)\b/i.test(text)
  if ((priceIntent && config.price_lookup) || (stockIntent && config.stock_lookup)) {
    const terms = text.replace(/\b(what|is|the|price|cost|of|how|much|does|in|stock|available|availability|inventory|for|a|an)\b/gi, ' ').replace(/[^a-z0-9 -]/gi, ' ').replace(/\s+/g, ' ').trim()
    if (terms.length < 2) return { answer: `Which product would you like me to ${priceIntent ? 'price' : 'check stock for'}? Share its name or SKU.`, source: 'support_flow' }
    const safeTerms = terms.replace(/[%_,()]/g, ' ')
    const { data: products } = await supabase.from('support_products').select('*').eq('client_id', clientId)
      .or(`name.ilike.%${safeTerms}%,sku.ilike.%${safeTerms}%`).limit(3)
    if (!products?.length) return { answer: `I couldn't find a verified catalog match for “${terms}”. Try the exact product name or SKU.`, source: 'support_flow' }
    return { answer: products.map(product => {
      const parts = [`**${product.name}**${product.sku ? ` (${product.sku})` : ''}`]
      if (priceIntent && config.price_lookup) parts.push(product.price == null ? 'Price unavailable' : `${product.currency || 'INR'} ${Number(product.price).toFixed(2)}`)
      if (stockIntent && config.stock_lookup) parts.push(product.inventory_status === 'in_stock' ? `In stock${product.inventory_quantity != null ? ` (${product.inventory_quantity})` : ''}` : product.inventory_status.replace('_', ' '))
      return parts.join(' — ')
    }).join('\n'), source: 'support_flow' }
  }
  return null
}
