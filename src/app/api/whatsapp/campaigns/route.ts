import {NextRequest,NextResponse} from 'next/server'
import {requireWorkspace,saasError,SaaSError} from '@/lib/saas/context'
import {supabase} from '@/lib/supabase'
import {resolveWhatsAppConnection} from '@/lib/whatsappCampaign'
import {validateWhatsAppBindings,validateWhatsAppCampaignFilter} from '@/types/bulkWhatsApp'
import {explicitContactAudience} from '@/lib/campaignAudience'

export async function GET(req:NextRequest){try{const ctx=await requireWorkspace(null,'campaigns');const result=await supabase.from('campaigns').select('id,bot_id,name,channel,status,recipients_count,sent_count,delivered_count,read_count,click_count,failed_count,opt_out_count,scheduled_at,created_at,whatsapp_templates(name,language,category,status)').eq('client_id',ctx.workspaceId).eq('channel','whatsapp').order('created_at',{ascending:false}).limit(250);if(result.error)throw result.error;return NextResponse.json(result.data||[],{headers:{'Cache-Control':'private, max-age=5, stale-while-revalidate=20'}})}catch(error){return saasError(error)}}
export async function POST(req:NextRequest){try{
 const ctx=await requireWorkspace(null,'campaigns',true),body=await req.json(),botId=String(body.botId||''),templateId=String(body.templateId||''),name=String(body.name||'').trim().slice(0,160)
 if(!name)throw new SaaSError('INVALID_INPUT','Campaign name is required.',400)
 const [botResult,templateResult]=await Promise.all([supabase.from('bots').select('id').eq('id',botId).eq('client_id',ctx.workspaceId).maybeSingle(),supabase.from('whatsapp_templates').select('*').eq('id',templateId).eq('bot_id',botId).eq('client_id',ctx.workspaceId).maybeSingle()]);if(!botResult.data)throw new SaaSError('INVALID_INPUT','Choose a workspace bot.',400);if(!templateResult.data||templateResult.data.status!=='APPROVED')throw new SaaSError('INVALID_INPUT','Choose a Meta-approved template.',400)
 const connection=await resolveWhatsAppConnection(ctx.workspaceId,botId);if(!connection)throw new SaaSError('WHATSAPP_NOT_CONFIGURED','This bot needs an active WhatsApp Business integration.',400)
 const bodyComponent=(templateResult.data.components_json||[]).find((component:any)=>String(component.type).toUpperCase()==='BODY'),count=Math.max(0,...Array.from(String(bodyComponent?.text||'').matchAll(/\{\{(\d+)\}\}/g),match=>Number(match[1])))
 let bindings,filter;try{bindings=validateWhatsAppBindings(body.bindings,count);filter=validateWhatsAppCampaignFilter(body.filterAst||{combinator:'AND',rules:[]})}catch(error:any){throw new SaaSError('INVALID_INPUT',error.message,400)}
 const productIds=Array.isArray(body.featuredProductIds)?body.featuredProductIds.map(String).slice(0,1):[]
 if(productIds.length){const products=await supabase.from('catalog_products').select('id').eq('client_id',ctx.workspaceId).in('id',productIds);if(products.error)throw products.error;if((products.data||[]).length!==productIds.length)throw new SaaSError('INVALID_INPUT','The selected product does not belong to this workspace.',400)}
 const contactIds=await explicitContactAudience(ctx.workspaceId,body.selectedContactIds),audienceMode=contactIds.length?'contacts':'segment'
 const campaign=await supabase.from('campaigns').insert({client_id:ctx.workspaceId,bot_id:botId,name,channel:'whatsapp',status:'draft',wa_template_id:templateId,wa_phone_number_id:connection.phoneNumberId,wa_variable_bindings:bindings,inline_filter_ast:filter,audience_mode:audienceMode,selected_contact_ids:contactIds,featured_product_ids:productIds,coupon_code:String(body.couponCode||'').trim().slice(0,100),timezone:String(body.timezone||'UTC').slice(0,100),content_json:{headerImageUrl:String(body.headerImageUrl||'').trim().slice(0,2000)}}).select('*').single();if(campaign.error)throw campaign.error
 const message=await supabase.from('campaign_messages').insert({campaign_id:campaign.data.id,variant:'A',body_text:String(bodyComponent?.text||''),variables_used:bindings});if(message.error){await supabase.from('campaigns').delete().eq('id',campaign.data.id);throw message.error}
 return NextResponse.json(campaign.data,{status:201})
 }catch(error){return saasError(error)}}
