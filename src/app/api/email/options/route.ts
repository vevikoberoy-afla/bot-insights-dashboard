import {NextRequest,NextResponse} from 'next/server'
import {requireWorkspace,saasError,SaaSError} from '@/lib/saas/context'
import {supabase} from '@/lib/supabase'
import {resolveSmtpCredentials} from '@/lib/email'

export async function GET(req:NextRequest){try{
 const ctx=await requireWorkspace(null,'campaigns'),botId=String(req.nextUrl.searchParams.get('botId')||'')
 const bots=await supabase.from('bots').select('id,name,status').eq('client_id',ctx.workspaceId).neq('status','archived').order('name');if(bots.error)throw bots.error
 const configuredBots=await Promise.all((bots.data||[]).map(async bot=>{const mailbox=await resolveSmtpCredentials(ctx.workspaceId,bot.id);return{...bot,reply_to_email:mailbox?.from_email||null,sender_name:mailbox?.from_name||bot.name,email_configured:!!mailbox}}))
 if(!botId)return NextResponse.json({bots:configuredBots,products:[]},{headers:{'Cache-Control':'private, max-age=30, stale-while-revalidate=120'}})
 if(!configuredBots.some(bot=>bot.id===botId))throw new SaaSError('INVALID_INPUT','Choose a bot from this workspace.',400)
 const [config,links]=await Promise.all([supabase.from('bot_commerce_config').select('bot_id').eq('bot_id',botId).maybeSingle(),supabase.from('bot_catalog_products').select('product_id').eq('bot_id',botId)])
 if(config.error||links.error)throw config.error||links.error
 const productIds=(links.data||[]).map(row=>row.product_id),explicit=!!config.data
 if(explicit&&!productIds.length)return NextResponse.json({bots:configuredBots,products:[],configured:true,productIds:[]},{headers:{'Cache-Control':'private, max-age=15, stale-while-revalidate=60'}})
 let products=supabase.from('catalog_products').select('id,name,description,image_url,price,currency,status,sku').eq('client_id',ctx.workspaceId).eq('status','active').order('name').limit(250)
 if(explicit)products=products.in('id',productIds)
 const result=await products;if(result.error)throw result.error
 return NextResponse.json({bots:configuredBots,products:result.data||[],configured:explicit,productIds:explicit?productIds:(result.data||[]).map(row=>row.id)},{headers:{'Cache-Control':'private, max-age=15, stale-while-revalidate=60'}})
 }catch(error){return saasError(error)}}
