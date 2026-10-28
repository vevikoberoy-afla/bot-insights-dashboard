import {NextRequest,NextResponse} from 'next/server'
import {requireWorkspace,saasError,SaaSError} from '@/lib/saas/context'
import {featureAllowed} from '@/lib/saas/entitlements'
import {supabase} from '@/lib/supabase'
import {qstash} from '@/lib/qstash'
import {redis} from '@/lib/redis'
import {resolveWhatsAppConnection} from '@/lib/whatsappCampaign'

export async function POST(req:NextRequest){try{
 const ctx=await requireWorkspace(null,'campaigns',true);if(!featureAllowed(ctx.entitlements,'campaigns.enabled'))throw new SaaSError('FEATURE_UNAVAILABLE','WhatsApp campaigns are not included in this workspace plan.',403)
 const body=await req.json(),id=String(body.campaignId||''),campaign=(await supabase.from('campaigns').select('*,whatsapp_templates(status)').eq('id',id).eq('client_id',ctx.workspaceId).eq('channel','whatsapp').maybeSingle()).data
 if(!campaign)throw new SaaSError('NOT_FOUND','Campaign not found.',404);if(campaign.status!=='draft')throw new SaaSError('INVALID_STATE','Only a draft campaign can be launched.',409);if(campaign.whatsapp_templates?.status!=='APPROVED')throw new SaaSError('TEMPLATE_NOT_APPROVED','Meta must approve this template before it can be sent.',409)
 if(!await resolveWhatsAppConnection(ctx.workspaceId,campaign.bot_id))throw new SaaSError('WHATSAPP_NOT_CONFIGURED','The sending bot no longer has an active WhatsApp connection.',400)
 if(!process.env.QSTASH_TOKEN)throw new SaaSError('QUEUE_NOT_CONFIGURED','QSTASH_TOKEN is required for protected campaign delivery.',503)
 const scheduled=body.sendNow!==true,scheduleAt=scheduled?new Date(String(body.scheduledFor||'')):new Date();if(!Number.isFinite(scheduleAt.getTime())||scheduleAt.getTime()<Date.now()-30000)throw new SaaSError('INVALID_SCHEDULE','Choose a future schedule time.',400)
 const status=scheduled?'scheduled':'sending',transition=await supabase.from('campaigns').update({status,scheduled_at:scheduled?scheduleAt.toISOString():null,recipients_count:0,materialized_at:null,materialization_started_at:null,updated_at:new Date().toISOString()}).eq('id',id).eq('client_id',ctx.workspaceId).eq('status','draft').select('id').maybeSingle();if(transition.error)throw transition.error;if(!transition.data)throw new SaaSError('INVALID_STATE','This campaign was already launched.',409)
 const origin=(process.env.NEXT_PUBLIC_APP_URL||req.nextUrl.origin).replace(/\/$/,''),headers=(process.env.WHATSAPP_WORKER_SECRET||process.env.EMAIL_WEBHOOK_SECRET)?{'x-webhook-secret':process.env.WHATSAPP_WORKER_SECRET||process.env.EMAIL_WEBHOOK_SECRET||''}:undefined
 await redis.hset(`campaign:${id}:metrics`,{status,total:0,sent:0,failed:0,delivered:0,read:0,clicked:0,opted_out:0}).catch(()=>{})
 try{const job=await qstash.publishJSON({url:`${origin}/api/workers/whatsapp-coordinator`,body:{campaignId:id,workspaceId:ctx.workspaceId,cursor:null,stage:'canary'},...(scheduled?{notBefore:Math.floor(scheduleAt.getTime()/1000)}:{}),retries:5,headers,deduplicationId:`wa_launch_${id}`});await supabase.from('campaigns').update({qstash_message_id:job.messageId,failure_reason:null}).eq('id',id).eq('client_id',ctx.workspaceId)}catch(error){await supabase.from('campaigns').update({status:'draft',scheduled_at:null,failure_reason:'Queue submission failed'}).eq('id',id).eq('status',status);throw error}
 await supabase.from('whatsapp_campaign_events').insert({client_id:ctx.workspaceId,campaign_id:id,event_type:scheduled?'scheduled':'launched',metadata:{scheduled_for:scheduled?scheduleAt.toISOString():null}})
 return NextResponse.json({id,status,scheduledFor:scheduled?scheduleAt.toISOString():null})
 }catch(error){return saasError(error)}}

