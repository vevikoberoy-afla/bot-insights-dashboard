import {NextRequest,NextResponse} from 'next/server'
import {createHash} from 'node:crypto'
import {requireWorkspace,saasError,SaaSError} from '@/lib/saas/context'
import {supabase} from '@/lib/supabase'
import {redis} from '@/lib/redis'
import {validateWhatsAppCampaignFilter} from '@/types/bulkWhatsApp'
import {explicitContactAudience} from '@/lib/campaignAudience'

export async function POST(req:NextRequest){try{
 const ctx=await requireWorkspace(null,'campaigns'),body=await req.json(),botId=String(body.botId||''),templateId=String(body.templateId||''),contactIds=await explicitContactAudience(ctx.workspaceId,body.selectedContactIds);let filter;try{filter=validateWhatsAppCampaignFilter(body.filterAst||{combinator:'AND',rules:[]})}catch(error:any){throw new SaaSError('INVALID_INPUT',error.message,400)}
 const bot=(await supabase.from('bots').select('id').eq('id',botId).eq('client_id',ctx.workspaceId).maybeSingle()).data;if(!bot)throw new SaaSError('INVALID_INPUT','Choose a workspace bot.',400)
 const key=`campaign:wa:audience-preview:${createHash('sha256').update(`${ctx.workspaceId}|${botId}|${templateId}|${JSON.stringify(filter)}|${contactIds.join(',')}`).digest('hex')}`,cached=await redis.get<any>(key).catch(()=>null);if(cached)return NextResponse.json(cached,{headers:{'X-Audience-Cache':'HIT'}})
 const result=await supabase.rpc('bulk_whatsapp_preview_audience_v3',{p_client:ctx.workspaceId,p_bot:botId,p_template:templateId,p_ast:filter,p_contact_ids:contactIds});if(result.error)throw result.error
 const response={count:Number(result.data?.count||0),sampleContacts:result.data?.sample||[]};await redis.set(key,response,{ex:30}).catch(()=>{});return NextResponse.json(response,{headers:{'X-Audience-Cache':'MISS'}})
 }catch(error){return saasError(error)}}
