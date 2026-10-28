import {NextRequest,NextResponse} from 'next/server'
import {requireWorkspace,saasError,SaaSError} from '@/lib/saas/context'
import {supabase} from '@/lib/supabase'
import {validateCampaignContent,validateSegmentFilter} from '@/types/bulkEmail'
import {resolveSmtpCredentials} from '@/lib/email'
import {explicitContactAudience} from '@/lib/campaignAudience'

const email=/^[^\s,;<>@]+@[^\s,;<>@]+\.[^\s,;<>@]+$/
export async function GET(req:NextRequest){try{const ctx=await requireWorkspace(null,'campaigns');const id=req.nextUrl.searchParams.get('id'),selection=id?'*,campaign_messages(subject,body_text,body_html)':'id,bot_id,name,channel,status,subject,recipients_count,sent_count,delivered_count,open_count,click_count,bounced_count,complaint_count,failed_count,scheduled_at,created_at';let query=supabase.from('campaigns').select(selection).eq('client_id',ctx.workspaceId).eq('channel','email').order('created_at',{ascending:false});if(id)query=query.eq('id',id);const{data,error}=await query.limit(id?1:250);if(error)throw error;return NextResponse.json(id?(data?.[0]||null):(data||[]),{headers:{'Cache-Control':'private, max-age=5, stale-while-revalidate=20'}})}catch(error){return saasError(error)}}
export async function POST(req:NextRequest){try{
 const ctx=await requireWorkspace(null,'campaigns',true),body=await req.json();let content,filter;try{content=validateCampaignContent(body.content);filter=validateSegmentFilter(body.filterAst||{combinator:'AND',rules:[]})}catch(error:any){throw new SaaSError('INVALID_INPUT',String(error?.message||'Invalid campaign content.'),400)}
 const name=String(body.name||'').trim().slice(0,160),subject=String(body.subject||'').trim().slice(0,300),fromName=String(body.fromName||'').trim().slice(0,160),replyTo=String(body.replyToEmail||'').trim().toLowerCase()
 if(!name||!subject||!fromName||!email.test(replyTo))throw new SaaSError('INVALID_INPUT','Campaign name, subject, sender name, and a valid reply-to email are required.',400)
 const botId=String(body.botId||'');const bot=(await supabase.from('bots').select('id').eq('id',botId).eq('client_id',ctx.workspaceId).maybeSingle()).data;if(!bot)throw new SaaSError('INVALID_INPUT','Choose a bot from this workspace.',400)
 const mailbox=await resolveSmtpCredentials(ctx.workspaceId,botId);if(mailbox?.from_email&&mailbox.from_email.toLowerCase()!==replyTo)throw new SaaSError('INVALID_INPUT','Reply-to must match the email inbox assigned to this bot.',400)
 const productIds=Array.isArray(body.featuredProductIds)?body.featuredProductIds.map(String).slice(0,6):[]
 if(productIds.length){const[products,config,links]=await Promise.all([supabase.from('catalog_products').select('id').eq('client_id',ctx.workspaceId).in('id',productIds),supabase.from('bot_commerce_config').select('bot_id').eq('bot_id',botId).maybeSingle(),supabase.from('bot_catalog_products').select('product_id').eq('bot_id',botId)]);if(products.error||config.error||links.error)throw products.error||config.error||links.error;if((products.data||[]).length!==new Set(productIds).size)throw new SaaSError('INVALID_INPUT','One or more products do not belong to this workspace.',400);if(config.data){const allowed=new Set((links.data||[]).map(row=>row.product_id));if(productIds.some(id=>!allowed.has(id)))throw new SaaSError('INVALID_INPUT','One or more products are not enabled for this bot.',400)}}
 const contactIds=await explicitContactAudience(ctx.workspaceId,body.selectedContactIds),audienceMode=contactIds.length?'contacts':'segment'
 const campaign=(await supabase.from('campaigns').insert({client_id:ctx.workspaceId,bot_id:botId,name,channel:'email',status:'draft',subject,preview_text:String(body.previewText||'').slice(0,300),from_name:fromName,from_email:null,reply_to_email:replyTo,content_json:content,featured_product_ids:productIds,coupon_code:String(body.couponCode||'').trim().slice(0,100),inline_filter_ast:filter,audience_mode:audienceMode,selected_contact_ids:contactIds,timezone:String(body.timezone||'UTC').slice(0,100)}).select('*').single());if(campaign.error)throw campaign.error
 const message=await supabase.from('campaign_messages').insert({campaign_id:campaign.data.id,variant:'A',subject,body_text:content.body,body_html:null,variables_used:['first_name','coupon_code','store_name']});if(message.error){await supabase.from('campaigns').delete().eq('id',campaign.data.id).eq('client_id',ctx.workspaceId);throw message.error}
 return NextResponse.json(campaign.data,{status:201})
 }catch(error){return saasError(error)}}
export const dynamic='force-dynamic'
