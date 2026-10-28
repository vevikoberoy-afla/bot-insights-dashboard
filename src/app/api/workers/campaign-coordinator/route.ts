import {NextRequest,NextResponse} from 'next/server'
import {verifySignatureAppRouter} from '@upstash/qstash/dist/nextjs'
import {supabase} from '@/lib/supabase'
import {qstash} from '@/lib/qstash'
import {redis} from '@/lib/redis'
import {verifyWebhookSecret} from '@/lib/webhookSecurity'
import {featureAllowed,getEffectiveEntitlements} from '@/lib/saas/entitlements'

const chunk=<T,>(rows:T[],size:number)=>Array.from({length:Math.ceil(rows.length/size)},(_,index)=>rows.slice(index*size,index*size+size))

async function handler(req:NextRequest){
 if(!process.env.QSTASH_CURRENT_SIGNING_KEY&&!verifyWebhookSecret(req,process.env.EMAIL_WEBHOOK_SECRET))return NextResponse.json({error:'Unauthorized'},{status:401})
 const body=await req.json(),campaignId=String(body.campaignId||''),workspaceId=String(body.workspaceId||''),cursor=body.cursor?String(body.cursor):null,stage=body.stage==='full_fanout'?'full_fanout':'canary'
 if(!campaignId||!workspaceId)return NextResponse.json({error:'Invalid coordinator job'},{status:400})
 if(await redis.get(`campaign:${campaignId}:paused`).catch(()=>null))return NextResponse.json({skipped:true,reason:'Campaign paused'})
 if(!featureAllowed(await getEffectiveEntitlements(workspaceId),'campaigns.enabled'))return NextResponse.json({skipped:true,reason:'Campaign service is paused'})

 let campaign=(await supabase.from('campaigns').select('*,clients(name,website_url)').eq('id',campaignId).eq('client_id',workspaceId).maybeSingle()).data
 if(!campaign||['cancelled','completed','paused_circuit_breaker'].includes(campaign.status))return NextResponse.json({skipped:true})
 if(campaign.status==='scheduled'){
  const transition=await supabase.from('campaigns').update({status:'sending',updated_at:new Date().toISOString()}).eq('id',campaignId).eq('client_id',workspaceId).eq('status','scheduled').select('*,clients(name,website_url)').maybeSingle()
  if(transition.data)campaign=transition.data
 }
 if(campaign.status!=='sending')return NextResponse.json({skipped:true,reason:'Campaign not sending'})

 if(!campaign.materialized_at){
  await supabase.from('campaigns').update({materialization_started_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',campaignId).eq('client_id',workspaceId).is('materialized_at',null)
  const materialized=await supabase.rpc('bulk_email_materialize',{p_client:workspaceId,p_campaign:campaignId})
  if(materialized.error){await supabase.from('campaigns').update({failure_reason:'Audience materialization failed',updated_at:new Date().toISOString()}).eq('id',campaignId);return NextResponse.json({error:'Audience materialization failed'},{status:503})}
  const count=Number((await supabase.from('campaign_recipients').select('id',{count:'exact',head:true}).eq('campaign_id',campaignId)).count||0)
  if(count===0){await supabase.from('campaigns').update({status:'completed',recipients_count:0,materialized_at:new Date().toISOString(),completed_at:new Date().toISOString(),failure_reason:'No eligible opted-in recipients',updated_at:new Date().toISOString()}).eq('id',campaignId);await redis.hset(`campaign:${campaignId}:metrics`,{status:'completed',total:0}).catch(()=>{});return NextResponse.json({complete:true,recipients:0})}
  if(campaign.transport_mode==='smtp'&&count>500){
   const reason='SMTP safety limit exceeded: audiences over 500 require AWS SES.'
   await redis.set(`campaign:${campaignId}:paused`,'smtp_limit',{ex:86400*30}).catch(()=>{})
   await redis.hset(`campaign:${campaignId}:metrics`,{status:'paused_circuit_breaker',total:count}).catch(()=>{})
   await supabase.from('campaigns').update({status:'paused_circuit_breaker',recipients_count:count,materialized_at:new Date().toISOString(),paused_at:new Date().toISOString(),failure_reason:reason,updated_at:new Date().toISOString()}).eq('id',campaignId)
   await supabase.from('email_campaign_events').insert({client_id:workspaceId,campaign_id:campaignId,event_type:'circuit_paused',metadata:{reason:'smtp_audience_limit',limit:500,recipients:count}})
   return NextResponse.json({paused:true,reason},{status:200})
  }
  const materializedAt=new Date().toISOString()
  await supabase.from('campaigns').update({recipients_count:count,materialized_at:materializedAt,failure_reason:null,updated_at:materializedAt}).eq('id',campaignId)
  campaign={...campaign,recipients_count:count,materialized_at:materializedAt}
  await redis.hset(`campaign:${campaignId}:metrics`,{status:'sending',total:count}).catch(()=>{})
 }

 const products=campaign.featured_product_ids?.length?(await supabase.from('catalog_products').select('id,name,description,image_url,price,currency').eq('client_id',workspaceId).in('id',campaign.featured_product_ids)).data||[]:[]
 const snapshot={campaign:{id:campaign.id,client_id:campaign.client_id,bot_id:campaign.bot_id,name:campaign.name,subject:campaign.subject,preview_text:campaign.preview_text,from_name:campaign.from_name,from_email:campaign.from_email,reply_to_email:campaign.reply_to_email,content_json:campaign.content_json,coupon_code:campaign.coupon_code,transport_mode:campaign.transport_mode,clients:campaign.clients},products}
 await redis.set(`campaign:${campaignId}:snapshot`,snapshot,{ex:7200}).catch(()=>{})

 const origin=(process.env.NEXT_PUBLIC_APP_URL||req.nextUrl.origin).replace(/\/$/,''),headers=process.env.EMAIL_WEBHOOK_SECRET?{'x-webhook-secret':process.env.EMAIL_WEBHOOK_SECRET}:undefined
 const configuredSesRate=Math.max(1,Number(process.env.EMAIL_OUTBOUND_RATE)||50),sesPeriod=Math.max(1,Math.ceil(100/(configuredSesRate*.7)))
 const flowControl=campaign.transport_mode==='smtp'?{key:`bulk-email-smtp-${workspaceId}`,parallelism:1,rate:1,period:'60s' as const}:{key:'bulk-email-ses-global',parallelism:1,rate:1,period:sesPeriod}
 const job=(recipientIds:string[],deduplicationId:string)=>({url:`${origin}/api/workers/campaign-send-batch`,body:{campaignId,workspaceId,recipientIds},flowControl,retries:5,headers,deduplicationId})

 if(stage==='canary'&&!cursor){
  const result=await supabase.from('campaign_recipients').select('id').eq('campaign_id',campaignId).order('id').limit(200)
  if(result.error)return NextResponse.json({error:'Recipient queue unavailable'},{status:503})
  const rows=result.data||[];if(!rows.length)return NextResponse.json({enqueued:0,complete:true})
  const batchSize=campaign.transport_mode==='smtp'?10:100
  await qstash.batchJSON(chunk(rows,batchSize).map((group,index)=>job(group.map(row=>row.id),`canary_${campaignId}_${index+1}`)))
  if(Number(campaign.recipients_count||0)>rows.length){
   await qstash.publishJSON({url:`${origin}/api/workers/campaign-coordinator`,body:{campaignId,workspaceId,cursor:rows[rows.length-1].id,stage:'full_fanout'},delay:180,retries:5,headers,deduplicationId:`fanout_${campaignId}_page_0`})
  }
  return NextResponse.json({stage:'canary',enqueued:rows.length,batches:Math.ceil(rows.length/batchSize)})
 }

 let query=supabase.from('campaign_recipients').select('id').eq('campaign_id',campaignId).order('id').limit(1000)
 if(cursor)query=query.gt('id',cursor)
 const result=await query;if(result.error)return NextResponse.json({error:'Recipient queue unavailable'},{status:503})
 const rows=result.data||[];if(!rows.length)return NextResponse.json({stage:'full_fanout',enqueued:0,complete:true})
 const pageKey=cursor||'page_0',jobs=chunk(rows,campaign.transport_mode==='smtp'?10:100).map((group,index)=>job(group.map(row=>row.id),`fanout_${campaignId}_${pageKey}_batch_${index+1}`));await qstash.batchJSON(jobs)
 if(rows.length===1000)await qstash.publishJSON({url:`${origin}/api/workers/campaign-coordinator`,body:{campaignId,workspaceId,cursor:rows[rows.length-1].id,stage:'full_fanout'},delay:campaign.transport_mode==='smtp'?60:5,retries:5,headers,deduplicationId:`fanout_${campaignId}_page_${rows[rows.length-1].id}`})
 return NextResponse.json({stage:'full_fanout',enqueued:rows.length,batches:jobs.length})
}

export const POST=process.env.QSTASH_CURRENT_SIGNING_KEY&&process.env.QSTASH_NEXT_SIGNING_KEY?verifySignatureAppRouter(handler):handler
