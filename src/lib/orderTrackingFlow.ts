import { randomUUID } from 'crypto'
import { redis } from '@/lib/redis'
import { supabase } from '@/lib/supabase'
import { persistResolvedOrder,resolveConnectedOrder } from '@/lib/orderResolver'
import { releaseInventoryHolds } from '@/lib/commerce'
import type { FlowInteraction,FlowMessage,FlowMeta } from '@/lib/interactiveReturnFlow'
import { upsertCustomerContact } from '@/lib/customerContacts'

type Item={id?:string;name:string;sku?:string|null;quantity:number;unitPrice?:number|null}
type TrackedOrder={id:string;reference:string;source:'commerce'|'sales'|'connected';customerName?:string|null;customerEmail?:string|null;customerPhone?:string|null;status:string;fulfillmentStatus?:string|null;total?:number|null;currency:string;placedAt?:string|null;updatedAt?:string|null;deliveredAt?:string|null;trackingNumber?:string|null;trackingUrl?:string|null;carrier?:string|null;estimatedDeliveryAt?:string|null;timeline?:Array<{label:string;createdAt:string}>;items:Item[]}
type State={id:string;stepId:string;step:'reference'|'verify';attempts:number;order?:TrackedOrder}
type Input={clientId:string;botId:string;sessionId:string;text:string;knownContact?:{name?:string|null;email?:string|null;phone?:string|null};interaction?:FlowInteraction;channel?:string}

const intent=/\b(?:track|tracking|where\s+is|check|view|show|find|details\s+for|tell\s+me\s+about)\s+(?:the\s+|my\s+)?order\b|\border\s+(?:status|tracking|details|update|information)\b|\b(?:delivery|shipping|fulfillment)\s+status\b/i
export const isOrderTrackingRequest=(text:string)=>intent.test(text)
const reference=(text:string)=>text.match(/\b(?:ORD[-_ ]?)?[A-Z0-9][A-Z0-9_-]{2,24}\b/gi)?.find(value=>/\d/.test(value))?.replace(/\s/g,'').toUpperCase()
const email=(text:string)=>text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase()
const phone=(text:string)=>text.match(/(?:\+?\d[\d\s()-]{8,}\d)/)?.[0]
const normalizedPhone=(value?:string|null)=>String(value||'').replace(/\D/g,'').slice(-10)
const identityMatches=(order:TrackedOrder,input:Input,text:string)=>{
 const suppliedEmail=email(text),suppliedPhone=phone(text)
 return !!((suppliedEmail&&order.customerEmail&&suppliedEmail===order.customerEmail.toLowerCase())||(suppliedPhone&&order.customerPhone&&normalizedPhone(suppliedPhone)===normalizedPhone(order.customerPhone)))
}
const rawValue=(value:any,...keys:string[])=>{for(const key of keys){const wanted=key.toLowerCase().replace(/[^a-z0-9]/g,''),found=Object.entries(value||{}).find(([name])=>{const normalized=name.toLowerCase().replace(/[^a-z0-9]/g,'');return normalized===wanted||normalized.endsWith(wanted)});if(found?.[1])return String(found[1])}return null}

async function mirrorInternalOrder(input:Input,order:any,items:Item[],source:'commerce'|'sales'){
 try{
  const {data:support,error}=await supabase.from('support_orders').upsert({client_id:input.clientId,external_id:`${source}:${order.id}`,order_number:order.reference||order.order_number,customer_email:order.customer_email||order.contacts?.email||null,customer_phone:order.customer_phone||order.contacts?.phone||null,status:order.status||'processing',fulfillment_status:order.fulfillment_status||order.status||null,total_amount:order.total??order.total_amount??null,currency:order.currency||'INR',placed_at:order.created_at||order.order_date||null,delivered_at:['fulfilled','delivered','completed'].includes(String(order.status).toLowerCase())?(order.updated_at||null):null,metadata:{source:`internal_${source}`,customer_name:order.customer_name||order.contacts?.name||null},synced_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'client_id,order_number'}).select('id').single()
  if(error||!support?.id)return
  for(let index=0;index<items.length;index++){const item=items[index];await supabase.from('support_order_items').upsert({order_id:support.id,external_id:item.id||`${source}-${order.id}-${index}`,sku:item.sku||null,name:item.name,quantity:item.quantity,unit_price:item.unitPrice??null,metadata:{}},{onConflict:'order_id,external_id'})}
 }catch(error){console.warn('[order tracking] internal support mirror failed',error)}
}

async function findOrder(input:Input,orderNumber:string):Promise<{order?:TrackedOrder;lookupStatus?:string}> {
 // Query independent internal stores in one wave. External connectors are used
 // only when every internal source misses (or the connector mirror is stale).
 const [nativeRefResult,nativeReceiptResult,salesResult,connectedResult]=await Promise.all([
  supabase.from('commerce_orders').select('*').eq('client_id',input.clientId).ilike('reference',orderNumber).maybeSingle(),
  supabase.from('commerce_orders').select('*').eq('client_id',input.clientId).ilike('receipt_number',orderNumber).maybeSingle(),
  supabase.from('sales_orders').select('*,contacts(name,email,phone)').eq('client_id',input.clientId).ilike('order_number',orderNumber).maybeSingle(),
  supabase.from('support_orders').select('*').eq('client_id',input.clientId).ilike('order_number',orderNumber).maybeSingle(),
 ])
 let native=nativeRefResult.data||nativeReceiptResult.data
 const nativeError=nativeRefResult.error||nativeReceiptResult.error
 if(nativeError)console.warn('[order tracking] commerce lookup failed',nativeError.message)
 if(native){
  const [lineResult,eventResult]=await Promise.all([supabase.from('commerce_order_items').select('*').eq('order_id',native.id),supabase.from('commerce_order_events').select('label,created_at').eq('order_id',native.id).order('created_at',{ascending:true})])
  const items=(lineResult.data||[]).map((item:any)=>({id:item.id,name:item.name,sku:item.sku,quantity:Number(item.quantity)||1,unitPrice:item.unit_price==null?null:Number(item.unit_price)}))
  await mirrorInternalOrder(input,native,items,'commerce')
  return {order:{id:native.id,reference:native.reference,source:'commerce',customerName:native.customer_name,customerEmail:native.customer_email,customerPhone:native.customer_phone,status:native.status,fulfillmentStatus:native.status,total:Number(native.total),currency:native.currency||'INR',placedAt:native.created_at,updatedAt:native.updated_at,deliveredAt:native.delivered_at||(['fulfilled','delivered'].includes(native.status)?native.updated_at:null),trackingNumber:native.tracking_number,trackingUrl:native.tracking_url,carrier:native.carrier,estimatedDeliveryAt:native.estimated_delivery_at,timeline:(eventResult.data||[]).map((event:any)=>({label:event.label,createdAt:event.created_at})),items}}
 }

 // 2. Older ERP/campaign orders created inside this product.
 const {data:sales,error:salesError}=salesResult
 if(salesError)console.warn('[order tracking] ERP lookup failed',salesError.message)
 if(sales){
  const rawItems=Array.isArray(sales.items)?sales.items:[]
  const items:Item[]=rawItems.map((item:any,index:number)=>({id:String(item.id||item.sku||index+1),name:String(item.name||item.product_name||item.description||item.title||`Item ${index+1}`),sku:item.sku||null,quantity:Math.max(1,Number(item.quantity||item.qty)||1),unitPrice:item.unit_price==null&&item.price==null?null:Number(item.unit_price??item.price)}))
  await mirrorInternalOrder(input,sales,items,'sales')
  return {order:{id:sales.id,reference:sales.order_number,source:'sales',customerName:sales.contacts?.name||null,customerEmail:sales.contacts?.email||null,customerPhone:sales.contacts?.phone||null,status:sales.status||'processing',fulfillmentStatus:sales.status,total:sales.total_amount==null?null:Number(sales.total_amount),currency:sales.currency||'INR',placedAt:sales.order_date||sales.created_at,deliveredAt:['completed','fulfilled','delivered'].includes(String(sales.status).toLowerCase())?(sales.updated_at||null):null,items}}
 }

 // 3. Previously synchronized support orders.
 let connected=connectedResult.data
 const stale=connected?.metadata?.connector&&connected?.synced_at&&Date.now()-new Date(connected.synced_at).getTime()>5*60_000
 if(!connected||stale){
  const resolved=await resolveConnectedOrder({clientId:input.clientId,botId:input.botId,orderNumber})
  if(resolved.status==='found'&&resolved.order){await persistResolvedOrder(input.clientId,resolved.order);connected=(await supabase.from('support_orders').select('*').eq('client_id',input.clientId).ilike('order_number',resolved.order.orderNumber).maybeSingle()).data}
  else if(!connected)return {lookupStatus:resolved.status}
 }
 if(!connected)return {lookupStatus:'not_found'}
 const supportItems=(await supabase.from('support_order_items').select('*').eq('order_id',connected.id)).data||[]
 const snapshot=connected.metadata?.source_snapshot||{}
 return {order:{id:connected.id,reference:connected.order_number,source:'connected',customerName:rawValue(snapshot,'customer_name','full_name','billing_name','contact_name'),customerEmail:connected.customer_email,customerPhone:connected.customer_phone,status:connected.status||'unknown',fulfillmentStatus:connected.fulfillment_status,total:connected.total_amount==null?null:Number(connected.total_amount),currency:connected.currency||'INR',placedAt:connected.placed_at,deliveredAt:connected.delivered_at,trackingNumber:rawValue(snapshot,'tracking_number','tracking_id','awb','waybill'),trackingUrl:rawValue(snapshot,'tracking_url','tracking_link'),carrier:rawValue(snapshot,'carrier','shipping_carrier','courier'),items:supportItems.map((item:any)=>({id:item.id,name:item.name,sku:item.sku,quantity:item.quantity,unitPrice:item.unit_price==null?null:Number(item.unit_price)}))}}
}

export async function handleOrderTrackingFlow(input:Input){
 const key=`order_tracking_flow:${input.clientId}:${input.botId}:${input.sessionId}`
 let state=await redis.get<State>(key)
 if(!state&&!isOrderTrackingRequest(input.text))return null
 if(!state){
  // An explicit tracking request is a deliberate context switch. Clear any
  // unfinished workflow so it cannot replay an old cart/catalogue response.
  await Promise.all([
   releaseInventoryHolds(input.clientId,`order:${input.clientId}:${input.sessionId}`).catch(()=>null),
   redis.del(`commerce_flow:${input.clientId}:${input.botId}:${input.sessionId}`),
   redis.del(`return_flow:${input.botId}:${input.sessionId}`),
   redis.del(`booking_flow:${input.clientId}:${input.botId}:${input.sessionId}`),
  ])
 }
 state=state||{id:'tracking-'+randomUUID(),stepId:randomUUID(),step:'reference',attempts:0}
 const respond=async(text:string,done=false,order?:TrackedOrder)=>{
  const message:FlowMessage={id:randomUUID(),role:'bot',type:order?'order_status_card':'text',flowId:state!.id,stepId:state!.stepId,interactive:!done,payload:order?{title:'Order details',...order}:{text}}
  if(done)await redis.del(key);else await redis.set(key,state!,{ex:86400})
  const flow:FlowMeta|null=done?null:{id:state!.id,name:'order',step:state!.step==='reference'?1:2,totalSteps:2,canGoBack:false}
  return {answer:text,source:'order_tracking',messages:[message],flow}
 }
 const remember=async(order:TrackedOrder)=>upsertCustomerContact({clientId:input.clientId,botId:input.botId,sessionId:input.sessionId,name:order.customerName||input.knownContact?.name,email:order.customerEmail||input.knownContact?.email,phone:order.customerPhone||input.knownContact?.phone,channel:input.channel,source:'support_flow',customFields:{last_verified_order:order.reference}})
 if(input.interaction?.flowId&&(input.interaction.flowId!==state.id||input.interaction.stepId!==state.stepId))return respond(state.step==='verify'?'Enter the email address or phone number used for this order.':'Enter your order ID.')
 if(input.interaction?.kind==='cancel'||/^(cancel|stop|never ?mind)$/i.test(input.text)){await redis.del(key);return respond('Order lookup cancelled.',true)}
 if(state.step==='reference'){
  const orderNumber=reference(input.text)
  if(!orderNumber)return respond('Please enter the order ID from your confirmation, for example ORD-001.')
  const found=await findOrder(input,orderNumber)
  if(!found.order){await redis.del(key);return respond(found.lookupStatus==='unavailable'?'The connected order source is temporarily unavailable. Please try again shortly.':found.lookupStatus==='unconfigured'?'Order tracking is not connected for this bot yet. Please contact support.':`I couldn't find ${orderNumber} in the native or connected order systems. Check the ID and try again.`,true)}
  state={...state,step:'verify',stepId:randomUUID(),order:found.order}
  if(identityMatches(found.order,input,input.text)){await remember(found.order);return respond(summary(found.order),true,found.order)}
  if(!found.order.customerEmail&&!found.order.customerPhone){await redis.del(key);return respond(`I found ${found.order.reference}, but its source has no mapped customer email or phone, so I cannot disclose its details safely. Please contact support.`,true)}
  return respond('Order found. For security, enter the email address or phone number used for this order.')
 }
 if(!state.order){await redis.del(key);return respond('This lookup expired. Ask me to track the order again.',true)}
 if(!identityMatches(state.order,input,input.text)){
  state.attempts++
  if(state.attempts>=3){await redis.del(key);return respond('Those details did not match the order. The lookup was closed for security.',true)}
  return respond('Those details did not match. Enter the email address or phone number from the order confirmation.')
 }
 await remember(state.order)
 return respond(summary(state.order),true,state.order)
}

function summary(order:TrackedOrder){
 const lines=[`Order ${order.reference}`,`Status: ${order.status}${order.fulfillmentStatus&&order.fulfillmentStatus!==order.status?` · ${order.fulfillmentStatus}`:''}`]
 if(order.trackingNumber)lines.push(`Tracking: ${order.trackingNumber}${order.carrier?` · ${order.carrier}`:''}`)
 if(order.items.length)lines.push(`Items: ${order.items.map(item=>`${item.name} × ${item.quantity}`).join(', ')}`)
 if(order.total!=null)lines.push(`Total: ${order.currency} ${order.total.toLocaleString()}`)
 return lines.join('\n')
}
