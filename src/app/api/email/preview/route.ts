import {NextRequest,NextResponse} from 'next/server'
import {requireWorkspace,saasError,SaaSError} from '@/lib/saas/context'
import {supabase} from '@/lib/supabase'
import {validateCampaignContent} from '@/types/bulkEmail'
import {renderBulkEmail} from '@/lib/email/bulkRenderer'

function httpsOrigin(value:unknown){try{const url=new URL(String(value));return url.protocol==='https:'&&url.hostname?url.origin:null}catch{return null}}

export async function POST(req:NextRequest){try{
 const ctx=await requireWorkspace(null,'campaigns'),body=await req.json();let content;try{content=validateCampaignContent(body.content)}catch(error:any){throw new SaaSError('INVALID_INPUT',String(error?.message||'Invalid email content.'),400)}
 const botId=String(body.botId||''),bot=(await supabase.from('bots').select('id,name').eq('id',botId).eq('client_id',ctx.workspaceId).maybeSingle()).data;if(!bot)throw new SaaSError('INVALID_INPUT','Choose a workspace bot before previewing.',400)
 const ids=Array.isArray(body.featuredProductIds)?[...new Set(body.featuredProductIds.map(String))].slice(0,6):[]
 const [client,products,config,links]=await Promise.all([supabase.from('clients').select('name,website_url').eq('id',ctx.workspaceId).maybeSingle(),ids.length?supabase.from('catalog_products').select('id,name,description,image_url,price,currency').eq('client_id',ctx.workspaceId).eq('status','active').in('id',ids):Promise.resolve({data:[],error:null}),supabase.from('bot_commerce_config').select('bot_id').eq('bot_id',botId).maybeSingle(),supabase.from('bot_catalog_products').select('product_id').eq('bot_id',botId)]);if(client.error||products.error||config.error||links.error)throw client.error||products.error||config.error||links.error
 if((products.data||[]).length!==ids.length)throw new SaaSError('INVALID_INPUT','One or more preview products are unavailable.',400)
 if(config.data){const allowed=new Set((links.data||[]).map(row=>row.product_id));if(ids.some(id=>!allowed.has(id)))throw new SaaSError('INVALID_INPUT','One or more preview products are not enabled for this bot.',400)}
 const site=httpsOrigin(client.data?.website_url),productCards=(products.data||[]).map(product=>({...product,url:site?`${site}/products/${encodeURIComponent(product.id)}`:undefined})),origin=(process.env.NEXT_PUBLIC_APP_URL||req.nextUrl.origin).replace(/\/$/,''),store=String(body.fromName||client.data?.name||bot.name||'Updates').slice(0,160)
 const rendered=renderBulkEmail({origin,recipientId:'00000000-0000-4000-8000-000000000000',content,products:productCards,variables:{first_name:'Alex',name:'Alex Morgan',coupon_code:String(body.couponCode||'WELCOME20').slice(0,100),store_name:store},previewText:String(body.previewText||'').slice(0,300)})
 const subject=String(body.subject||'Email preview').slice(0,300).replace(/\{\{\s*(first_name|name)\s*\}\}/gi,(_,key)=>String(key).toLowerCase()==='name'?'Alex Morgan':'Alex')
 return NextResponse.json({subject,html:rendered.html,text:rendered.text},{headers:{'Cache-Control':'private, no-store'}})
 }catch(error){return saasError(error)}}
