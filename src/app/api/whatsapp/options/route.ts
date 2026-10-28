import {NextRequest,NextResponse} from 'next/server'
import {requireWorkspace,saasError,SaaSError} from '@/lib/saas/context'
import {supabase} from '@/lib/supabase'
import {resolveWhatsAppConnection} from '@/lib/whatsappCampaign'

export async function GET(req:NextRequest){try{
 const ctx=await requireWorkspace(null,'campaigns'),botId=String(req.nextUrl.searchParams.get('botId')||'')
 const botsResult=await supabase.from('bots').select('id,name,status').eq('client_id',ctx.workspaceId).neq('status','archived').order('name');if(botsResult.error)throw botsResult.error
 const bots=(await Promise.all((botsResult.data||[]).map(async bot=>({...bot,whatsapp_configured:!!await resolveWhatsAppConnection(ctx.workspaceId,bot.id)})))).filter(bot=>bot.whatsapp_configured)
 if(!botId)return NextResponse.json({bots,templates:[],products:[]},{headers:{'Cache-Control':'private, max-age=20, stale-while-revalidate=60'}})
 if(!bots.some(bot=>bot.id===botId))throw new SaaSError('INVALID_INPUT','Choose a bot with an active WhatsApp Business integration.',400)
 const [templates,config,links]=await Promise.all([supabase.from('whatsapp_templates').select('*').eq('client_id',ctx.workspaceId).eq('bot_id',botId).order('updated_at',{ascending:false}),supabase.from('bot_commerce_config').select('bot_id').eq('bot_id',botId).maybeSingle(),supabase.from('bot_catalog_products').select('product_id').eq('bot_id',botId)])
 if(templates.error||config.error||links.error)throw templates.error||config.error||links.error
 const productIds=(links.data||[]).map(row=>row.product_id),explicit=!!config.data
 let products=supabase.from('catalog_products').select('id,name,description,image_url,price,currency,status,sku').eq('client_id',ctx.workspaceId).eq('status','active').order('name').limit(250);if(explicit&&productIds.length)products=products.in('id',productIds)
 const productResult=explicit&&!productIds.length?{data:[],error:null}:await products;if(productResult.error)throw productResult.error
 return NextResponse.json({bots,templates:templates.data||[],products:productResult.data||[],configured:explicit},{headers:{'Cache-Control':'private, max-age=10, stale-while-revalidate=30'}})
 }catch(error){return saasError(error)}}

