import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { supabase } from '@/lib/supabase'
import { checked } from '@/lib/booking'
import { resolveSmtpCredentials, sendEmailReply } from '@/lib/email'
import { sendWhatsAppTemplate } from '@/lib/whatsapp'
import { createHmac } from 'crypto'
import { safeOutboundFetch } from '@/lib/urlSecurity'
import { decryptConfigSecrets } from '@/lib/security/secretVault'

async function whatsapp(clientId:string,phone:string,templateKey:string,values:string[]){
 const row=checked(await supabase.from('channel_integrations').select('config').eq('client_id',clientId).eq('channel','whatsapp').eq('status','active').order('created_at',{ascending:false}).limit(1).maybeSingle()),c=decryptConfigSecrets(clientId,row?.config)
 if(!c?.api_key||!c?.phone_number_id||!c?.[templateKey])throw new Error(`Configure WhatsApp ${templateKey} in Workspace Integrations`)
 const result=await sendWhatsAppTemplate(c.phone_number_id,c.api_key,phone,c[templateKey],values,c.template_language||'en_US');if(!result.success)throw new Error(result.error)
}

export async function GET(req:NextRequest) {
 const expected=Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`), actual=Buffer.from(req.headers.get('authorization') || '')
 if(!process.env.CRON_SECRET || expected.length!==actual.length || !timingSafeEqual(expected,actual))return NextResponse.json({error:'Unauthorized'},{status:401})
 try {
  const jobs=checked(await supabase.from('booking_notifications').select('*').in('status',['pending','failed']).lt('attempts',5).lte('due_at',new Date().toISOString()).order('due_at').limit(50)) || []
  let sent=0,failed=0
  for(const job of jobs) {
   // Compare-and-set keeps two concurrent workers from sending the same job.
   const claimed=checked(await supabase.from('booking_notifications').update({status:'sending',attempts:job.attempts+1,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status',job.status).eq('attempts',job.attempts).select('id'))
   if(!claimed?.length)continue
   try {
    const booking=checked(await supabase.from('feature_bookings').select('*').eq('id',job.booking_id).eq('client_id',job.client_id).single())
    if(job.kind==='reminder' && (booking.status!=='confirmed' || Date.parse(booking.slot_start)<Date.now())) {checked(await supabase.from('booking_notifications').update({status:'cancelled'}).eq('id',job.id));continue}
    const content=`${booking.customer_name}, your booking ${booking.reference} is ${booking.status}.\n${booking.slot_start?'Time: '+new Date(booking.slot_start).toISOString():''}\nQuantity: ${booking.quantity}.\nKeep this reference to manage your booking in chat.`
    if(job.channel==='whatsapp')await whatsapp(job.client_id,booking.customer_phone,job.kind==='reminder'?'booking_reminder_template':'booking_confirmation_template',[booking.customer_name,booking.reference,booking.slot_start?new Date(booking.slot_start).toISOString():booking.status])
    else {const credentials=await resolveSmtpCredentials(job.client_id);if(!credentials)throw new Error('Configure SMTP in channel settings');const result=await sendEmailReply(credentials,{operationId:`booking-notification:${job.id}`,to:booking.customer_email,subject:`Booking ${booking.reference}: ${job.kind}`,body:content});if(!result.success)throw new Error(result.error || 'Delivery failed')}
    checked(await supabase.from('booking_notifications').update({status:'sent',last_error:null,updated_at:new Date().toISOString()}).eq('id',job.id));sent++
   }catch(e:any){checked(await supabase.from('booking_notifications').update({status:'failed',last_error:String(e.message).slice(0,1000),updated_at:new Date().toISOString()}).eq('id',job.id));failed++}
  }
  checked(await supabase.rpc('expire_feature_holds_and_flows'))
  const deliveries=checked(await supabase.from('automation_deliveries').select('*').in('status',['pending','failed']).lt('attempts',5).lte('due_at',new Date().toISOString()).order('due_at').limit(50))||[]
  for(const job of deliveries){
   const claimed=checked(await supabase.from('automation_deliveries').update({status:'sending',attempts:job.attempts+1,updated_at:new Date().toISOString()}).eq('id',job.id).eq('status',job.status).eq('attempts',job.attempts).select('id'));if(!claimed?.length)continue
   try{
    if(job.channel==='webhook'){
     const hooks=checked(await supabase.from('channel_integrations').select('config').eq('client_id',job.client_id).eq('channel','booking_webhook').eq('status','active'))||[]
     for(const hook of hooks){const config=decryptConfigSecrets(job.client_id,hook.config),body=JSON.stringify({id:job.id,event:job.event_type,created_at:job.created_at,data:job.payload}),signature=createHmac('sha256',config.signing_secret).update(body).digest('hex'),res=await safeOutboundFetch(config.endpoint_url,{method:'POST',headers:{'Content-Type':'application/json','X-Vittain-Signature':`sha256=${signature}`,'X-Vittain-Event':job.event_type},body,signal:AbortSignal.timeout(10000)});if(!res.ok)throw new Error(`Webhook returned ${res.status}`)}
    }else if(job.entity_type==='order'){
     const order=checked(await supabase.from('commerce_orders').select('*,commerce_order_items(*)').eq('id',job.entity_id).eq('client_id',job.client_id).single()),status=String(order.status||'updated').replace(/_/g,' '),eventStatus=String(job.event_type||'').startsWith('return_')?`return ${String(job.event_type).slice(7).replace(/_/g,' ')}`:status,custom=String(job.payload?.custom_message||'').trim(),tracking=[order.carrier,order.tracking_number].filter(Boolean).join(' · '),returnLine=job.payload?.return_reference?`Return: ${job.payload.return_reference}\n`:'',body=custom||`Hi ${order.customer_name},\n\nYour order ${order.reference} update: ${eventStatus}.\n${returnLine}${tracking?`Tracking: ${tracking}\n`:''}${order.estimated_delivery_at?`Estimated delivery: ${new Date(order.estimated_delivery_at).toLocaleString()}\n`:''}\nItems\n${order.commerce_order_items.map((x:any)=>`${x.name} × ${x.quantity}`).join('\n')}\n\nTotal ${order.currency} ${order.total}`
     if(job.channel==='whatsapp')await whatsapp(job.client_id,order.customer_phone,job.event_type==='receipt'?'order_receipt_template':'order_status_template',job.event_type==='receipt'?[order.customer_name,order.reference,order.receipt_number,`${order.currency} ${order.total}`]:[order.customer_name,order.reference,eventStatus,tracking||String(job.payload?.return_reference||'No tracking number yet')]);else{const c=await resolveSmtpCredentials(job.client_id);if(!c)throw new Error('Configure SMTP');const result=await sendEmailReply(c,{operationId:`order-notification:${job.id}`,to:order.customer_email,subject:`Order ${order.reference}: ${eventStatus}`,body});if(!result.success)throw new Error(result.error)}
    }else if(job.event_type==='abandoned_recovery'){
     const c=await resolveSmtpCredentials(job.client_id);if(!c)throw new Error('Configure SMTP');const result=await sendEmailReply(c,{operationId:`recovery:${job.id}`,category:'marketing',to:job.destination,subject:'Complete your request',body:`You left your ${job.payload.flow_type} at ${job.payload.step}. Return to the chatbot to continue.`});if(!result.success)throw new Error(result.error)
    }
    checked(await supabase.from('automation_deliveries').update({status:'sent',last_error:null,updated_at:new Date().toISOString()}).eq('id',job.id));sent++
   }catch(e:any){checked(await supabase.from('automation_deliveries').update({status:'failed',last_error:String(e.message).slice(0,1000),updated_at:new Date().toISOString()}).eq('id',job.id));failed++}
  }
  return NextResponse.json({sent,failed})
 }catch(e:any){return NextResponse.json({error:e.message},{status:500})}
}
