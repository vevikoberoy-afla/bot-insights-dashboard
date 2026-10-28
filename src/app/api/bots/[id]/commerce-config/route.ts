import { NextRequest,NextResponse } from 'next/server'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'
import { supabase } from '@/lib/supabase'
import { redis } from '@/lib/redis'
import { invalidateBotBookingBundle } from '@/lib/chat/bookingBundleCache'
import { invalidateBotCommerceBundle } from '@/lib/chat/commerceBundleCache'

async function owner(req:NextRequest,id:string){const user=await getAuthenticatedWorkspaceUser(req,'bots',req.method!=='GET');if(!user)return null;const {data}=await supabase.from('bots').select('id,client_id').eq('id',id).eq('client_id',user.workspaceId).maybeSingle();return data}
export async function GET(req:NextRequest, props:{params: Promise<{id:string}>}) {
 const params = await props.params;
 const user=await getAuthenticatedWorkspaceUser(req,'bots',req.method!=='GET');if(!user)return NextResponse.json({error:'Access denied'},{status:403})
 const cacheKey=`bot_commerce_dashboard:${user.workspaceId}:${params.id}`
 const cached=req.nextUrl.searchParams.get('refresh')==='1'?null:await redis.get<any>(cacheKey).catch(()=>null)
 if(cached)return NextResponse.json(cached,{headers:{'X-Data-Cache':'HIT'}})
 const {data:bot}=await supabase.from('bots').select('id,client_id').eq('id',params.id).eq('client_id',user.workspaceId).maybeSingle();if(!bot)return NextResponse.json({error:'Bot not found'},{status:404})
 const [config,serviceLinks,offerLinks,productLinks,couponLinks,services,offers,products,coupons]=await Promise.all([
  supabase.from('bot_commerce_config').select('*').eq('bot_id',bot.id).maybeSingle(),
  supabase.from('bot_booking_services').select('*').eq('bot_id',bot.id),supabase.from('bot_booking_offers').select('*').eq('bot_id',bot.id),supabase.from('bot_catalog_products').select('*').eq('bot_id',bot.id),
  supabase.from('bot_coupon_rules').select('*').eq('bot_id',bot.id),
  supabase.from('booking_services').select('id,name,description,is_active,duration_min,timezone').eq('client_id',bot.client_id).order('name'),
  supabase.from('booking_offer_stats').select('id,name,description,status,service_id,product_id,remaining,start_at,end_at').eq('client_id',bot.client_id).order('name'),
  supabase.from('catalog_product_availability').select('id,name,sku,status,price,currency,available_quantity').eq('client_id',bot.client_id).order('name'),
  supabase.from('coupons').select('id,code,description,discount_type,discount_value,min_cart_value,is_active,max_uses,used_count,expires_at,product_ids,categories').eq('client_id',bot.client_id).order('created_at',{ascending:false})])
 const error=[config,serviceLinks,offerLinks,productLinks,couponLinks,services,offers,products,coupons].find(x=>x.error)?.error;if(error)return NextResponse.json({error:error.message},{status:500})
 const payload={configured:!!config.data,config:config.data||{booking_enabled:true,ordering_enabled:true,show_catalog:true,allow_booking_management:true,allow_order_management:true,upsell_enabled:true,upsell_max_gap:1000,menu_title:'How can I help?',booking_label:'Book an appointment',catalogue_label:'Browse products'},service_ids:(serviceLinks.data||[]).map(x=>x.service_id),offer_ids:(offerLinks.data||[]).map(x=>x.offer_id),product_ids:(productLinks.data||[]).map(x=>x.product_id),coupon_ids:(couponLinks.data||[]).filter(x=>x.enabled).map(x=>x.coupon_id),auto_apply_coupon_ids:(couponLinks.data||[]).filter(x=>x.enabled&&x.auto_apply).map(x=>x.coupon_id),services:services.data||[],offers:offers.data||[],products:products.data||[],coupons:(coupons.data||[]).map((coupon:any)=>({...coupon,name:coupon.code,status:coupon.is_active?'active':'inactive',description:[coupon.description,coupon.discount_type==='percentage'?`${coupon.discount_value}% off`:`INR ${Number(coupon.discount_value).toLocaleString()} off`,`Unlocks at INR ${Number(coupon.min_cart_value||0).toLocaleString()}`].filter(Boolean).join(' · ')}))}
 await redis.set(cacheKey,payload,{ex:120}).catch(()=>{})
 return NextResponse.json(payload,{headers:{'X-Data-Cache':'MISS'}})
}
export async function PUT(req:NextRequest, props:{params: Promise<{id:string}>}) {
 const params = await props.params;
 const bot=await owner(req,params.id);if(!bot)return NextResponse.json({error:'Bot not found'},{status:404})
 try{
  const body=await req.json(),serviceIds=Array.from(new Set<string>(body.service_ids||[])),offerIds=Array.from(new Set<string>(body.offer_ids||[])),productIds=Array.from(new Set<string>(body.product_ids||[])),couponIds=Array.from(new Set<string>(body.coupon_ids||[])),autoApplyIds=Array.from(new Set<string>(body.auto_apply_coupon_ids||[]))
  const [services,offers,products,coupons]=await Promise.all([supabase.from('booking_services').select('id').eq('client_id',bot.client_id).in('id',serviceIds.length?serviceIds:['00000000-0000-0000-0000-000000000000']),supabase.from('booking_offers').select('id').eq('client_id',bot.client_id).in('id',offerIds.length?offerIds:['00000000-0000-0000-0000-000000000000']),supabase.from('catalog_products').select('id,status').eq('client_id',bot.client_id).in('id',productIds.length?productIds:['00000000-0000-0000-0000-000000000000']).neq('status','archived'),supabase.from('coupons').select('id').eq('client_id',bot.client_id).in('id',couponIds.length?couponIds:['00000000-0000-0000-0000-000000000000'])])
  if(services.error||offers.error||products.error||coupons.error)throw new Error(services.error?.message||offers.error?.message||products.error?.message||coupons.error?.message)
  if(services.data.length!==serviceIds.length||offers.data.length!==offerIds.length||products.data.length!==productIds.length||coupons.data.length!==couponIds.length||autoApplyIds.some(id=>!couponIds.includes(id)))return NextResponse.json({error:'One or more selections do not belong to this workspace'},{status:400})
  const config={booking_enabled:body.booking_enabled!==false,ordering_enabled:body.ordering_enabled!==false,show_catalog:body.show_catalog!==false,allow_booking_management:body.allow_booking_management!==false,allow_order_management:body.allow_order_management!==false,upsell_enabled:body.upsell_enabled!==false,upsell_max_gap:Math.min(100000000,Math.max(0,Number(body.upsell_max_gap)||0)),menu_title:String(body.menu_title||'How can I help?').slice(0,120),booking_label:String(body.booking_label||'Book an appointment').slice(0,120),catalogue_label:String(body.catalogue_label||'Browse products').slice(0,120)}
  const saved=await supabase.rpc('save_bot_commerce_config',{p_client:bot.client_id,p_bot:bot.id,p_config:config,p_service_ids:serviceIds,p_offer_ids:offerIds,p_product_ids:productIds});if(saved.error)throw new Error(saved.error.message)
  const savedCoupons=await supabase.rpc('save_bot_coupon_config',{p_client:bot.client_id,p_bot:bot.id,p_coupon_ids:couponIds,p_upsell_enabled:config.upsell_enabled,p_upsell_max_gap:config.upsell_max_gap,p_auto_apply_ids:autoApplyIds});if(savedCoupons.error)throw new Error(savedCoupons.error.message)
  const drafts=products.data.filter((product:any)=>product.status==='draft').map((product:any)=>product.id)
  if(drafts.length){const activated=await supabase.from('catalog_products').update({status:'active',updated_at:new Date().toISOString()}).eq('client_id',bot.client_id).in('id',drafts);if(activated.error)throw new Error(`Bot configuration was saved, but selected draft products could not be published: ${activated.error.message}`)}
  await redis.del(`bot_commerce_dashboard:${bot.client_id}:${bot.id}`).catch(()=>{})
  await Promise.all([invalidateBotBookingBundle(bot.client_id,bot.id),invalidateBotCommerceBundle(bot.client_id,bot.id)])
  return NextResponse.json({success:true})
 }catch(e:any){return NextResponse.json({error:e.message||'Invalid configuration'},{status:400})}
}
