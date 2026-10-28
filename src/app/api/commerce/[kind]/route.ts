import { NextRequest,NextResponse } from 'next/server'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'
import { supabase } from '@/lib/supabase'
import { checked } from '@/lib/booking'
import { adjustInventory,changeOrder,holdInventory,normalizeProductImportRow,orderWithItems,placeOrder,validateProduct } from '@/lib/commerce'
import { queueOfferingEnrichment } from '@/lib/offeringEnrichment'
import { createTicket } from '@/lib/ticketing'

const ORDER_STATUSES=['placed','confirmed','processing','packed','fulfilled','shipped','out_for_delivery','delivered','delivery_failed','return_requested','return_in_transit','returned','partially_returned','exchanged','cancelled']
const RETURN_STATUSES=['under_review','approved','rejected','pickup_scheduled','in_transit','received','refunded','exchanged','closed','cancelled']
// commerce_returns has both order_id and exchange_order_id foreign keys back to
// commerce_orders. Always name the original-order relationship so PostgREST
// does not reject the list query as an ambiguous embed.
const ORDER_LIST_SELECT='*,commerce_order_items(*),commerce_shipments(id,status,carrier,tracking_number,estimated_delivery_at),commerce_returns!order_id(id,reference,status,kind)'
const clean=(value:unknown,max=500)=>String(value||'').trim().slice(0,max)

async function handler(req:NextRequest,kind:string){
 const area=kind==='products'?'products':kind==='inventory'||kind==='hold'?'inventory':'orders'
 const user=await getAuthenticatedWorkspaceUser(req,area,req.method!=='GET');if(!user)return NextResponse.json({error:'You do not have access to this commerce area'},{status:403})
 try{
  if(req.method==='GET'){
   if(kind==='products')return NextResponse.json(checked(await supabase.from('catalog_product_availability').select('*').eq('client_id',user.workspaceId).order('created_at',{ascending:false}).limit(1000))||[])
   if(kind==='orders'){
    const id=req.nextUrl.searchParams.get('id'),data=id?[await orderWithItems(user.workspaceId,id)]:(checked(await supabase.from('commerce_orders').select(ORDER_LIST_SELECT).eq('client_id',user.workspaceId).order('created_at',{ascending:false}).limit(1000))||[])
    if(id&&data[0]){
     const [events,shipments,returns,movements,notifications,tickets]=await Promise.all([
      supabase.from('commerce_order_events').select('*').eq('client_id',user.workspaceId).eq('order_id',id).order('created_at',{ascending:true}),
      supabase.from('commerce_shipments').select('*,commerce_shipment_items(*),commerce_shipment_events(*)').eq('client_id',user.workspaceId).eq('order_id',id).order('created_at',{ascending:false}),
      supabase.from('commerce_returns').select('*,commerce_return_items(*)').eq('client_id',user.workspaceId).eq('order_id',id).order('created_at',{ascending:false}),
      supabase.from('inventory_movements').select('*,catalog_products(name,sku)').eq('client_id',user.workspaceId).eq('order_id',id).order('created_at',{ascending:false}),
      supabase.from('automation_deliveries').select('id,event_type,channel,destination,status,attempts,last_error,created_at,updated_at').eq('client_id',user.workspaceId).eq('entity_type','order').eq('entity_id',id).order('created_at',{ascending:false}),
      supabase.from('tickets').select('id,ticket_number,type,status,priority,subject,created_at').eq('client_id',user.workspaceId).eq('order_number',data[0].reference).order('created_at',{ascending:false}),
     ])
     for(const result of [events,shipments,returns,movements,notifications,tickets])if(result.error)throw new Error(result.error.message)
     Object.assign(data[0],{events:events.data||[],shipments:shipments.data||[],returns:returns.data||[],inventory_movements:movements.data||[],notifications:notifications.data||[],tickets:tickets.data||[]})
    }
    const compatible=data.map((order:any)=>({...order,sales_order_items:order.commerce_order_items||[]}))
    return NextResponse.json(id?compatible[0]:compatible)
   }
   if(kind==='inventory')return NextResponse.json(checked(await supabase.from('inventory_movements').select('*,catalog_products(name,sku)').eq('client_id',user.workspaceId).order('created_at',{ascending:false}).limit(1000))||[])
  }
  const body=await req.json()
  if(kind==='products'){
   if(Array.isArray(body.products)){
    const saved:any[]=[],errors:Array<{row:number;name?:string;error:string}>=[]
    for(const [index,row] of body.products.slice(0,1000).entries())try{const normalized=normalizeProductImportRow(row,index),data=validateProduct(normalized),product=checked(await supabase.from('catalog_products').upsert({...data,client_id:user.workspaceId},{onConflict:'client_id,sku'}).select('*').single());saved.push(product);void queueOfferingEnrichment(req.nextUrl.origin,'product',product.id,user.workspaceId).catch(error=>console.error('[queue product enrichment]',error))}catch(error:any){errors.push({row:index+2,name:String(normalizeProductImportRow(row,index).name||''),error:String(error.message||error)})}
    return NextResponse.json({products:saved,imported:saved.length,failed:errors.length,errors,total:Math.min(body.products.length,1000)})
   }
   if(req.method==='DELETE'){
    const ids=Array.isArray(body.ids)?body.ids.map(String).filter(Boolean).slice(0,500):body.id?[String(body.id)]:[]
    if(!ids.length)throw new Error('Select at least one product')
    const removed:string[]=[],archived:string[]=[]
    for(const id of ids)try{const rows=checked(await supabase.from('catalog_products').delete().eq('client_id',user.workspaceId).eq('id',id).select('id'))||[];if(rows.length)removed.push(id)}catch{const row=checked(await supabase.from('catalog_products').update({status:'archived',updated_at:new Date().toISOString()}).eq('client_id',user.workspaceId).eq('id',id).select('id').maybeSingle());if(row)archived.push(id)}
    return NextResponse.json({deleted:removed.length,archived:archived.length,ids:[...removed,...archived]})
   }
   if(req.method==='PATCH'&&body.action==='bulk_update'){
    const ids=Array.isArray(body.ids)?body.ids.map(String).filter(Boolean).slice(0,500):[]
    if(!ids.length)throw new Error('Select at least one product')
    const changes:any={updated_at:new Date().toISOString()}
    if(body.changes?.status!=null){if(!['draft','active','archived'].includes(body.changes.status))throw new Error('Invalid product status');changes.status=body.changes.status}
    if(body.changes?.category!=null)changes.category=String(body.changes.category).trim().slice(0,100)||null
    if(body.changes?.track_inventory!=null)changes.track_inventory=body.changes.track_inventory===true
    if(Object.keys(changes).length===1)throw new Error('Choose a field to update')
    const updated=checked(await supabase.from('catalog_products').update(changes).eq('client_id',user.workspaceId).in('id',ids).select('id'))||[]
    for(const product of updated)void queueOfferingEnrichment(req.nextUrl.origin,'product',product.id,user.workspaceId).catch(error=>console.error('[queue product enrichment]',error))
    return NextResponse.json({updated:updated.length,ids:updated.map((row:any)=>row.id)})
   }
   const data=validateProduct(body),saved=checked(await(body.id?supabase.from('catalog_products').update(data).eq('id',body.id).eq('client_id',user.workspaceId):supabase.from('catalog_products').insert({...data,client_id:user.workspaceId})).select('*').single());void queueOfferingEnrichment(req.nextUrl.origin,'product',saved.id,user.workspaceId).catch(error=>console.error('[queue product enrichment]',error));return NextResponse.json(saved)
  }
  if(kind==='hold')return NextResponse.json(await holdInventory(user.workspaceId,body))
  if(kind==='orders'){
   if(req.method==='POST')return NextResponse.json(await placeOrder(user.workspaceId,{...body,channel:'dashboard'}))
   if(body.action==='transition'){
    if(!ORDER_STATUSES.includes(body.status))throw new Error('Invalid order status')
    return NextResponse.json(checked(await supabase.rpc('transition_commerce_order',{p_client:user.workspaceId,p_order:body.id,p_status:body.status,p_note:clean(body.note),p_actor:user.id})))
   }
   if(body.action==='shipment'){
    const order=checked(await supabase.from('commerce_orders').select('id,status,customer_email,customer_phone').eq('client_id',user.workspaceId).eq('id',body.id).single()) as any
    if(['cancelled','returned'].includes(order.status))throw new Error('This order cannot be shipped')
    const status=['pending','label_created','picked_up','in_transit','out_for_delivery','delivered','delivery_failed','returned','cancelled'].includes(body.status)?body.status:'label_created'
    const payload={client_id:user.workspaceId,order_id:body.id,status,carrier:clean(body.carrier,150)||null,service_level:clean(body.service_level,100)||null,tracking_number:clean(body.tracking_number,200)||null,tracking_url:/^https:\/\//i.test(clean(body.tracking_url,1500))?clean(body.tracking_url,1500):null,package_count:Math.min(100,Math.max(1,Number(body.package_count)||1)),estimated_delivery_at:body.estimated_delivery_at||null,shipped_at:['picked_up','in_transit','out_for_delivery','delivered'].includes(status)?new Date().toISOString():null,delivered_at:status==='delivered'?new Date().toISOString():null,updated_at:new Date().toISOString()}
    const shipment=checked(await(body.shipment_id?supabase.from('commerce_shipments').update(payload).eq('client_id',user.workspaceId).eq('order_id',body.id).eq('id',body.shipment_id):supabase.from('commerce_shipments').insert(payload)).select('*').single()) as any
    checked(await supabase.from('commerce_orders').update({carrier:payload.carrier,tracking_number:payload.tracking_number,tracking_url:payload.tracking_url,estimated_delivery_at:payload.estimated_delivery_at,updated_at:new Date().toISOString()}).eq('client_id',user.workspaceId).eq('id',body.id))
    if(Array.isArray(body.items)){
     const orderItems=(checked(await supabase.from('commerce_order_items').select('id,quantity').eq('order_id',body.id))||[]) as any[],allowed=new Map<string,number>(orderItems.map((item:any)=>[item.id,Number(item.quantity)]))
     const items=body.items.map((item:any)=>({shipment_id:shipment.id,order_item_id:String(item.item_id),quantity:Number(item.quantity)})).filter((item:any)=>{const maximum=allowed.get(item.order_item_id);return maximum!==undefined&&Number.isInteger(item.quantity)&&item.quantity>0&&item.quantity<=maximum})
     if(items.length){checked(await supabase.from('commerce_shipment_items').upsert(items,{onConflict:'shipment_id,order_item_id'}))}
    }
    checked(await supabase.from('commerce_shipment_events').insert({client_id:user.workspaceId,shipment_id:shipment.id,status,label:clean(body.label,200)||`Shipment ${status.replace(/_/g,' ')}`,location:clean(body.location,200)||null,details:{actor_id:user.id}}))
    const mapped=status==='in_transit'?'shipped':status==='out_for_delivery'?'out_for_delivery':status==='delivered'?'delivered':status==='delivery_failed'?'delivery_failed':null
    if(mapped&&order.status!==mapped){const transition=await supabase.rpc('transition_commerce_order',{p_client:user.workspaceId,p_order:body.id,p_status:mapped,p_note:`Shipment ${shipment.reference}`,p_actor:user.id});if(transition.error&&!/Invalid order transition/.test(transition.error.message))throw new Error(transition.error.message)}
    return NextResponse.json(shipment)
   }
   if(body.action==='return_create'){
    if(!['return','exchange','replacement'].includes(body.kind))throw new Error('Invalid return type')
    const order=checked(await supabase.from('commerce_orders').select('*,commerce_order_items(*)').eq('client_id',user.workspaceId).eq('id',body.id).single()) as any
    if(!['delivered','return_requested','partially_returned'].includes(order.status))throw new Error('Returns can only be opened after delivery')
    const existingCases=(checked(await supabase.from('commerce_returns').select('commerce_return_items(order_item_id,quantity)').eq('client_id',user.workspaceId).eq('order_id',body.id).not('status','in','(rejected,cancelled)'))||[]) as any[],reserved=new Map<string,number>()
    for(const activeCase of existingCases)for(const line of activeCase.commerce_return_items||[])reserved.set(line.order_item_id,(reserved.get(line.order_item_id)||0)+Number(line.quantity||0))
    const quantities=new Map<string,number>(order.commerce_order_items.map((item:any)=>[item.id,Number(item.quantity)])),items=(Array.isArray(body.items)?body.items:[]).map((item:any)=>({order_item_id:String(item.item_id),quantity:Number(item.quantity)})).filter((item:any)=>{const maximum=(quantities.get(item.order_item_id)||0)-(reserved.get(item.order_item_id)||0);return Number.isInteger(item.quantity)&&item.quantity>0&&item.quantity<=maximum})
    if(!items.length)throw new Error('Select at least one item to return')
    const created=checked(await supabase.from('commerce_returns').insert({client_id:user.workspaceId,order_id:order.id,kind:body.kind,status:'requested',reason_code:clean(body.reason_code,100)||'other',customer_note:clean(body.note,1000)||null}).select('*').single()) as any
    try{
     checked(await supabase.from('commerce_return_items').insert(items.map((item:any)=>({...item,return_id:created.id}))))
     const ticketResult=await createTicket({client_id:user.workspaceId,customer_name:order.customer_name,customer_email:String(order.customer_email||'').endsWith('@order.invalid')?null:order.customer_email,customer_phone:order.customer_phone,subject:`${body.kind==='return'?'Return':body.kind==='exchange'?'Exchange':'Replacement'} request for ${order.reference}`,description:clean(body.note,1000)||`${items.length} order item(s) requested`,type:body.kind==='return'?'return':'exchange',priority:'medium',source:'order_operations',verification_status:'verified',order_number:order.reference,allow_duplicate:true,metadata:{commerce_order_id:order.id,commerce_return_id:created.id}}, {id:user.id,type:'agent'})
     checked(await supabase.from('commerce_returns').update({ticket_id:ticketResult.ticket.id}).eq('client_id',user.workspaceId).eq('id',created.id))
     const transition=await supabase.rpc('transition_commerce_order',{p_client:user.workspaceId,p_order:order.id,p_status:'return_requested',p_note:`${created.reference} opened`,p_actor:user.id});if(transition.error&&!/Invalid order transition/.test(transition.error.message))throw new Error(transition.error.message)
     return NextResponse.json({...created,ticket:ticketResult.ticket})
    }catch(error){await supabase.from('commerce_returns').delete().eq('client_id',user.workspaceId).eq('id',created.id);throw error}
   }
   if(body.action==='return_update'){
    if(!RETURN_STATUSES.includes(body.status))throw new Error('Invalid return status')
    const result=checked(await supabase.rpc('process_commerce_return',{p_client:user.workspaceId,p_return:body.return_id,p_status:body.status,p_items:Array.isArray(body.items)?body.items:[],p_note:clean(body.note,1000),p_actor:user.id}))
    const current=checked(await supabase.from('commerce_returns').select('ticket_id,reference,order_id').eq('client_id',user.workspaceId).eq('id',body.return_id).single()) as any
    if(current.ticket_id){await supabase.from('tickets').update({status:['refunded','exchanged','closed','rejected','cancelled'].includes(body.status)?'resolved':'in_progress',sub_status:`return_${body.status}`,updated_at:new Date().toISOString()}).eq('client_id',user.workspaceId).eq('id',current.ticket_id)}
    return NextResponse.json(result)
   }
   if(body.action==='notify'){
    if(!['email','whatsapp'].includes(body.channel))throw new Error('Choose email or WhatsApp')
    const order=checked(await supabase.from('commerce_orders').select('*').eq('client_id',user.workspaceId).eq('id',body.id).single()),destination=body.channel==='email'?order.customer_email:order.customer_phone
    if(!destination||String(destination).endsWith('@order.invalid'))throw new Error(`Customer ${body.channel} is unavailable`)
    const eventType=clean(body.event_type,100)||'order_update',dueAt=new Date(Date.now()+Math.max(0,Math.min(10080,Number(body.delay_minutes)||0))*60000).toISOString()
    const delivery=checked(await supabase.from('automation_deliveries').insert({client_id:user.workspaceId,entity_type:'order',entity_id:order.id,event_type:eventType,channel:body.channel,destination,due_at:dueAt,payload:{reference:order.reference,custom_message:clean(body.message,1000),actor_id:user.id}}).select('*').single())
    checked(await supabase.from('commerce_order_events').insert({client_id:user.workspaceId,order_id:order.id,kind:'notification_queued',label:`${body.channel==='email'?'Email':'WhatsApp'} update queued`,details:{event_type:eventType,delivery_id:delivery.id,due_at:dueAt},actor_id:user.id}))
    return NextResponse.json(delivery)
   }
   if(body.action==='note'){
    const note=clean(body.note,1000);if(!note)throw new Error('Enter an internal note')
    return NextResponse.json(checked(await supabase.from('commerce_order_events').insert({client_id:user.workspaceId,order_id:body.id,kind:'internal_note',label:'Internal note',details:{note},actor_id:user.id}).select('*').single()))
   }
   if(body.action==='refund')return NextResponse.json(checked(await supabase.rpc('record_commerce_refund',{p_client:user.workspaceId,p_order:body.id,p_amount:Number(body.amount),p_note:String(body.note||'')})))
   if(body.action==='fulfil_item')return NextResponse.json(checked(await supabase.rpc('fulfil_commerce_item',{p_client:user.workspaceId,p_order:body.id,p_item:body.item_id,p_quantity:Number(body.quantity)})))
   if(body.action==='tracking')return NextResponse.json(checked(await supabase.from('commerce_orders').update({carrier:String(body.carrier||'').slice(0,150)||null,tracking_number:String(body.tracking_number||'').slice(0,200)||null,tracking_url:/^https:\/\//i.test(String(body.tracking_url||''))?body.tracking_url:null,estimated_delivery_at:body.estimated_delivery_at||null,updated_at:new Date().toISOString()}).eq('id',body.id).eq('client_id',user.workspaceId).select('*').single()));
   return NextResponse.json(await changeOrder(user.workspaceId,body.id,body.status))
  }
  if(kind==='inventory')return NextResponse.json(await adjustInventory(user.workspaceId,body.product_id,body.quantity_delta,body.note))
  return NextResponse.json({error:'Not found'},{status:404})
 }catch(e:any){return NextResponse.json({error:e.message},{status:400})}
}
export const GET=async (r:NextRequest, props:{params: Promise<{kind:string}>}) => {
 const params = await props.params;
 return handler(r,params.kind);
}
export const POST=GET
export const PATCH=GET
export const DELETE=GET
