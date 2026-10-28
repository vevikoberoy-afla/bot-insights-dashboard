import {NextRequest,NextResponse} from 'next/server'
import {verifySignatureAppRouter} from '@upstash/qstash/dist/nextjs'
import {supabase} from '@/lib/supabase'
import {redis} from '@/lib/redis'
import {verifyWebhookSecret} from '@/lib/webhookSecurity'
import {compileBulkEmailTemplate,personalizeCompiledBulkEmail} from '@/lib/email/bulkRenderer'
import {sendBulkCampaignEmail} from '@/lib/email/bulkTransport'
import {classifyBulkEmailTransportError} from '@/lib/email/transportErrors'
import {resolveSmtpCredentials} from '@/lib/email'

type Outcome={recipient_id:string;status:'sent'|'failed'|'unknown'|'suppressed'|'rejected';provider_message_id?:string;error?:string}
type Snapshot={campaign:any;products:any[]}
type Prepared={recipient:any;subject:string;rendered:{html:string;text:string;unsubscribeUrl:string}}
function validSite(value:unknown){try{const url=new URL(String(value));return url.protocol==='https:'&&url.hostname?url.origin:null}catch{return null}}
const wait=(milliseconds:number)=>new Promise(resolve=>setTimeout(resolve,milliseconds))

async function loadSnapshot(campaignId:string,workspaceId:string):Promise<Snapshot|null>{
 const cached=await redis.get<Snapshot|string>(`campaign:${campaignId}:snapshot`).catch(()=>null)
 if(cached){try{return typeof cached==='string'?JSON.parse(cached):cached}catch{}}
 const campaign=(await supabase.from('campaigns').select('*,clients(name,website_url)').eq('id',campaignId).eq('client_id',workspaceId).maybeSingle()).data
 if(!campaign)return null
 const products=campaign.featured_product_ids?.length?(await supabase.from('catalog_products').select('id,name,description,image_url,price,currency').eq('client_id',workspaceId).in('id',campaign.featured_product_ids)).data||[]:[]
 const value={campaign,products};await redis.set(`campaign:${campaignId}:snapshot`,value,{ex:7200}).catch(()=>{});return value
}

async function handler(req:NextRequest){
 if(!process.env.QSTASH_CURRENT_SIGNING_KEY&&!verifyWebhookSecret(req,process.env.EMAIL_WEBHOOK_SECRET))return NextResponse.json({error:'Unauthorized'},{status:401})
 const body=await req.json(),campaignId=String(body.campaignId||''),workspaceId=String(body.workspaceId||''),ids=Array.isArray(body.recipientIds)?body.recipientIds.map(String).slice(0,100):[]
 if(!campaignId||!workspaceId||!ids.length)return NextResponse.json({error:'Invalid batch job'},{status:400})
 if(await redis.get(`campaign:${campaignId}:paused`).catch(()=>null))return NextResponse.json({skipped:true,reason:'Campaign paused'})

 const snapshot=await loadSnapshot(campaignId,workspaceId);if(!snapshot)return NextResponse.json({skipped:true,reason:'Campaign unavailable'})
 const {campaign,products}=snapshot,leaseSeconds=campaign.transport_mode==='smtp'?300:60
 const claimed=await supabase.rpc('bulk_email_claim_batch_with_quota',{p_campaign:campaignId,p_ids:ids,p_lease_seconds:leaseSeconds})
 if(claimed.error)return NextResponse.json({error:'Could not claim recipient batch'},{status:503})
 const recipients=claimed.data||[]
 if(!recipients.length){
  const processing=Number((await supabase.from('campaign_recipients').select('id',{count:'exact',head:true}).eq('campaign_id',campaignId).in('id',ids).eq('status','processing')).count||0)
  return processing?NextResponse.json({error:'Recipient leases are still active'},{status:503}):NextResponse.json({duplicate:true})
 }

 const origin=(process.env.NEXT_PUBLIC_APP_URL||req.nextUrl.origin).replace(/\/$/,''),site=validSite(campaign.clients?.website_url)
 const smtp=campaign.transport_mode==='smtp'?await resolveSmtpCredentials(workspaceId,campaign.bot_id):null,concurrency=campaign.transport_mode==='smtp'?2:20,outcomes:Outcome[]=[]
 const productCards=products.map((product:any)=>({...product,url:site?`${site}/products/${encodeURIComponent(product.id)}`:undefined}))
 const compiled=compileBulkEmailTemplate({origin,content:campaign.content_json,products:productCards,constants:{coupon_code:campaign.coupon_code||'',store_name:campaign.from_name||campaign.clients?.name||'Updates'},previewText:campaign.preview_text})
 const dispatchKey=`campaign:${campaignId}:dispatched_ids`,stale=recipients.filter((recipient:any)=>recipient.delivery_state==='stale_sending')
 if(stale.length){let flags:(0|1)[];try{flags=await redis.smismember(dispatchKey,stale.map((recipient:any)=>recipient.recipient_id))}catch{return NextResponse.json({error:'Dispatch recovery state is temporarily unavailable'},{status:503})}const sentBefore=new Set(stale.filter((_:any,index:number)=>flags[index]===1).map((recipient:any)=>recipient.recipient_id));for(const recipient of stale)recipient.delivery_state=sentBefore.has(recipient.recipient_id)?'unknown':'reserved'}

 async function deliver(item:Prepared):Promise<Outcome>{
  const send=()=>sendBulkCampaignEmail({fromName:campaign.from_name||campaign.clients?.name||'Updates',fromEmail:campaign.from_email||undefined,replyTo:campaign.reply_to_email,to:item.recipient.email,subject:item.subject,html:item.rendered.html,text:item.rendered.text,unsubscribeUrl:item.rendered.unsubscribeUrl,campaignId,workspaceId},smtp)
  try{const result=await send();return{recipient_id:item.recipient.recipient_id,status:'sent',provider_message_id:result.messageId}}
  catch(first){let failure=classifyBulkEmailTransportError(first);if(failure.retryable){await wait(500+Math.floor(Math.random()*500));try{const result=await send();return{recipient_id:item.recipient.recipient_id,status:'sent',provider_message_id:result.messageId}}catch(second){failure=classifyBulkEmailTransportError(second)}}return{recipient_id:item.recipient.recipient_id,status:failure.outcome,error:`${failure.code}: ${failure.message}`.slice(0,500)}}
 }

 let breadcrumbFailure=false
 for(let offset=0;offset<recipients.length;offset+=concurrency){
  if(offset>0&&await redis.get(`campaign:${campaignId}:paused`).catch(()=>null)){
   for(const recipient of recipients.slice(offset)){const state=recipient.delivery_state;outcomes.push(state==='accepted'?{recipient_id:recipient.recipient_id,status:'sent',provider_message_id:recipient.provider_message_id}:state==='unknown'?{recipient_id:recipient.recipient_id,status:'unknown',error:recipient.claim_error||'Previous delivery outcome is ambiguous'}:state==='suppressed'?{recipient_id:recipient.recipient_id,status:'suppressed',error:recipient.claim_error||'Address suppressed'}:state==='rejected'?{recipient_id:recipient.recipient_id,status:'rejected',error:recipient.claim_error||'Email allowance unavailable'}:{recipient_id:recipient.recipient_id,status:'failed',error:recipient.claim_error||'Campaign paused before dispatch'})}
   break
  }
  const wave=recipients.slice(offset,offset+concurrency)
  const prepared:Prepared[]=[]
  for(const recipient of wave){
   if(recipient.delivery_state==='unknown'){outcomes.push({recipient_id:recipient.recipient_id,status:'unknown',error:'Previous delivery outcome is ambiguous; not retried'});continue}
   if(recipient.delivery_state==='suppressed'){outcomes.push({recipient_id:recipient.recipient_id,status:'suppressed',error:recipient.claim_error||'Address suppressed before dispatch'});continue}
   if(recipient.delivery_state==='rejected'){outcomes.push({recipient_id:recipient.recipient_id,status:'rejected',error:recipient.claim_error||'Email allowance unavailable'});continue}
   if(recipient.delivery_state==='failed'){outcomes.push({recipient_id:recipient.recipient_id,status:'failed',error:'Previous delivery attempt failed'});continue}
   if(recipient.already_sent){outcomes.push({recipient_id:recipient.recipient_id,status:'sent',provider_message_id:recipient.provider_message_id});continue}
   const subject=String(campaign.subject||campaign.name).replace(/\{\{\s*(first_name|name)\s*\}\}/gi,recipient.first_name||'there')
   let rendered
   try{rendered=personalizeCompiledBulkEmail(compiled,{recipientId:recipient.recipient_id,variables:{first_name:recipient.first_name||'there',name:recipient.variables?.name||recipient.first_name||'there'}})}catch(error:any){outcomes.push({recipient_id:recipient.recipient_id,status:'failed',error:String(error?.message||'Template rendering failed').slice(0,500)});continue}
   prepared.push({recipient,subject,rendered})
  }
  if(prepared.length){const preparedIds=prepared.map(item=>item.recipient.recipient_id);try{await redis.sadd(dispatchKey,preparedIds[0],...preparedIds.slice(1));await redis.expire(dispatchKey,604800)}catch{breadcrumbFailure=true;break}outcomes.push(...await Promise.all(prepared.map(deliver)))}
 }

 if(!outcomes.length&&breadcrumbFailure)return NextResponse.json({error:'Could not persist provider dispatch state'},{status:503})
 const commit=await supabase.rpc('bulk_email_commit_batch_outcomes',{p_campaign:campaignId,p_outcomes:outcomes})
 if(commit.error)return NextResponse.json({error:'Could not commit recipient outcomes'},{status:503})
 const summary=commit.data||{},pipeline=redis.pipeline()
 if(Number(summary.sent_delta||0)>0)pipeline.hincrby(`campaign:${campaignId}:metrics`,'sent',Number(summary.sent_delta))
 if(Number(summary.failed_delta||0)>0)pipeline.hincrby(`campaign:${campaignId}:metrics`,'failed',Number(summary.failed_delta))
 if(summary.campaign_status)pipeline.hset(`campaign:${campaignId}:metrics`,{status:summary.campaign_status})
 await pipeline.exec().catch(()=>{})
 return NextResponse.json({processed:outcomes.length,sent:Number(summary.sent_delta||0),failed:Number(summary.failed_delta||0),remaining:Number(summary.remaining||0),status:summary.campaign_status,...(breadcrumbFailure?{error:'Dispatch state unavailable; untouched recipients will be recovered'}:{})},{status:breadcrumbFailure?503:200})
}

export const POST=process.env.QSTASH_CURRENT_SIGNING_KEY&&process.env.QSTASH_NEXT_SIGNING_KEY?verifySignatureAppRouter(handler):handler
