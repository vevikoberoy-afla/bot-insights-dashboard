import {NextRequest,NextResponse} from 'next/server'
import {requireWorkspace,saasError,SaaSError} from '@/lib/saas/context'
import {supabase} from '@/lib/supabase'
import {qstash} from '@/lib/qstash'
import {redis} from '@/lib/redis'
import {resolveSmtpCredentials} from '@/lib/email'
import {bulkTransportConfigured} from '@/lib/email/bulkTransport'
export async function POST(req:NextRequest){try{
 const ctx=await requireWorkspace(null,'campaigns',true),body=await req.json(),campaignId=String(body.campaignId||'')
 const campaign=(await supabase.from('campaigns').select('*').eq('id',campaignId).eq('client_id',ctx.workspaceId).eq('channel','email').maybeSingle()).data;if(!campaign)throw new SaaSError('NOT_FOUND','Campaign not found.',404)
 if(campaign.status!=='draft')throw new SaaSError('INVALID_STATE','Only a draft campaign can be launched.',409)
 const smtp=await resolveSmtpCredentials(ctx.workspaceId,campaign.bot_id);if(!bulkTransportConfigured()&&!smtp)throw new SaaSError('EMAIL_TRANSPORT_NOT_CONFIGURED','Connect an SMTP mailbox for this bot or configure AWS SES before launching.',400)
 const scheduled=body.sendNow!==true,scheduleAt=scheduled?new Date(String(body.scheduledFor||'')):new Date();if(!Number.isFinite(scheduleAt.getTime())||scheduleAt.getTime()<Date.now()-30000)throw new SaaSError('INVALID_SCHEDULE','Choose a future schedule time.',400)
 const origin=(process.env.NEXT_PUBLIC_APP_URL||req.nextUrl.origin).replace(/\/$/,'');if(!process.env.QSTASH_TOKEN)throw new SaaSError('QUEUE_NOT_CONFIGURED','QSTASH_TOKEN is required to launch bulk email safely.',503)
 const transportMode=bulkTransportConfigured()?'ses':'smtp',status=scheduled?'scheduled':'sending',transition=await supabase.from('campaigns').update({status,transport_mode:transportMode,scheduled_at:scheduled?scheduleAt.toISOString():null,recipients_count:0,materialized_at:null,materialization_started_at:null,updated_at:new Date().toISOString()}).eq('id',campaign.id).eq('client_id',ctx.workspaceId).eq('status','draft').select('id').maybeSingle();if(transition.error)throw transition.error;if(!transition.data)throw new SaaSError('INVALID_STATE','This campaign was already launched.',409)
 await redis.hset(`campaign:${campaign.id}:metrics`,{status,sent:0,failed:0,delivered:0,opened:0,clicked:0,bounced:0,complained:0,total:0}).catch(()=>{})
 let queued:{messageId:string};try{queued=await qstash.publishJSON({url:`${origin}/api/workers/campaign-coordinator`,body:{campaignId:campaign.id,workspaceId:ctx.workspaceId,cursor:null,stage:'canary'},...(scheduled?{notBefore:Math.floor(scheduleAt.getTime()/1000)}:{}),retries:5,headers:process.env.EMAIL_WEBHOOK_SECRET?{'x-webhook-secret':process.env.EMAIL_WEBHOOK_SECRET}:undefined})}catch(error){await supabase.from('campaigns').update({status:'draft',scheduled_at:null,failure_reason:'Queue submission failed',updated_at:new Date().toISOString()}).eq('id',campaign.id).eq('client_id',ctx.workspaceId).eq('status',status);await redis.del(`campaign:${campaign.id}:metrics`).catch(()=>{});throw error}
 await supabase.from('campaigns').update({qstash_message_id:queued.messageId,failure_reason:null,updated_at:new Date().toISOString()}).eq('id',campaign.id).eq('client_id',ctx.workspaceId);await supabase.from('email_campaign_events').insert({client_id:ctx.workspaceId,campaign_id:campaign.id,event_type:scheduled?'scheduled':'launched',metadata:{materialization:'queued',transport_mode:transportMode,scheduled_for:scheduled?scheduleAt.toISOString():null}})
 return NextResponse.json({id:campaign.id,status,transportMode,materialization:'queued',scheduledFor:scheduled?scheduleAt.toISOString():null})
 }catch(error){return saasError(error)}}
