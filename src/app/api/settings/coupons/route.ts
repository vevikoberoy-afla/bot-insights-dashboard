import { NextRequest,NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'
import { invalidateWorkspaceBookingBundles } from '@/lib/chat/bookingBundleCache'
import { invalidateWorkspaceCommerceBundles } from '@/lib/chat/commerceBundleCache'

const cleanIds=(value:unknown)=>Array.from(new Set(Array.isArray(value)?value.map(String).filter(id=>/^[0-9a-f-]{36}$/i.test(id)):[]))
const cleanCategories=(value:unknown)=>Array.from(new Set(Array.isArray(value)?value.map(item=>String(item).trim()).filter(Boolean).slice(0,50):[]))
function couponInput(body:any){
 const code=String(body.code||'').trim().toUpperCase(),discount_type=body.discount_type==='fixed'?'fixed':'percentage',discount_value=Number(body.discount_value),min_cart_value=Number(body.min_cart_value||0),max_uses=body.max_uses==null||body.max_uses===''?null:Number(body.max_uses)
 if(!/^[A-Z0-9_-]{2,50}$/.test(code))throw new Error('Coupon code must contain 2–50 letters, numbers, dashes or underscores')
 if(!Number.isFinite(discount_value)||discount_value<=0||(discount_type==='percentage'&&discount_value>100))throw new Error('Enter a valid discount value')
 if(!Number.isFinite(min_cart_value)||min_cart_value<0)throw new Error('Minimum cart value is invalid')
 if(max_uses!=null&&(!Number.isInteger(max_uses)||max_uses<1))throw new Error('Maximum uses must be a positive whole number')
 const expires_at=body.expires_at?new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(body.expires_at))?`${body.expires_at}T23:59:59.999Z`:body.expires_at).toISOString():null
 return{code,description:String(body.description||'').trim().slice(0,500)||null,discount_type,discount_value,min_cart_value,max_uses,expires_at,product_ids:cleanIds(body.product_ids),service_ids:cleanIds(body.service_ids),categories:cleanCategories(body.categories),stackable:body.stackable===true,compatible_offer_ids:body.stackable===true?cleanIds(body.compatible_offer_ids):[],is_active:body.is_active!==false,updated_at:new Date().toISOString()}
}

export async function GET(req:NextRequest){
 const user=await getAuthenticatedWorkspaceUser(req,'offers',false);if(!user)return NextResponse.json({error:'Access denied'},{status:403})
 const [coupons,products,services,offers,bots,rules]=await Promise.all([
  supabase.from('coupons').select('*').eq('client_id',user.workspaceId).order('created_at',{ascending:false}),
  supabase.from('catalog_products').select('id,name,sku,category,status,price,currency,stock_quantity,track_inventory,allow_backorder').eq('client_id',user.workspaceId).neq('status','archived').order('name'),
  supabase.from('booking_services').select('id,name,price,currency,is_active').eq('client_id',user.workspaceId).order('name'),
  supabase.from('booking_offers').select('id,name,service_id,product_id,price,currency,status,segment_rule').eq('client_id',user.workspaceId).order('name'),
  supabase.from('bots').select('id,name').eq('client_id',user.workspaceId).order('name'),
  supabase.from('bot_coupon_rules').select('bot_id,coupon_id,enabled,auto_apply,custom_message').eq('client_id',user.workspaceId),
 ])
 const error=[coupons,products,services,offers,bots,rules].find(result=>result.error)?.error;if(error)return NextResponse.json({error:error.message},{status:500})
 return NextResponse.json({coupons:coupons.data||[],products:products.data||[],services:services.data||[],offers:offers.data||[],bots:bots.data||[],rules:rules.data||[]})
}
export async function POST(req:NextRequest){return save(req)}
export async function PUT(req:NextRequest){return save(req)}
async function save(req:NextRequest){
 const user=await getAuthenticatedWorkspaceUser(req,'offers',true);if(!user)return NextResponse.json({error:'Access denied'},{status:403})
 try{const body=await req.json(),input=couponInput(body),ids=input.product_ids
  if(ids.length){const owned=await supabase.from('catalog_products').select('id').eq('client_id',user.workspaceId).in('id',ids);if(owned.error)throw owned.error;if((owned.data||[]).length!==ids.length)throw new Error('One or more selected products are invalid')}
  if(input.service_ids.length){const owned=await supabase.from('booking_services').select('id').eq('client_id',user.workspaceId).in('id',input.service_ids);if(owned.error)throw owned.error;if((owned.data||[]).length!==input.service_ids.length)throw new Error('One or more selected services are invalid')}
  if(input.compatible_offer_ids.length){const owned=await supabase.from('booking_offers').select('id').eq('client_id',user.workspaceId).in('id',input.compatible_offer_ids);if(owned.error)throw owned.error;if((owned.data||[]).length!==input.compatible_offer_ids.length)throw new Error('One or more compatible offers are invalid')}
  const query=body.id?supabase.from('coupons').update(input).eq('id',String(body.id)).eq('client_id',user.workspaceId):supabase.from('coupons').insert({...input,client_id:user.workspaceId})
  const {data,error}=await query.select('*').single();if(error)throw error;await Promise.all([invalidateWorkspaceBookingBundles(user.workspaceId),invalidateWorkspaceCommerceBundles(user.workspaceId)]);return NextResponse.json(data,{status:body.id?200:201})
 }catch(error:any){return NextResponse.json({error:error.message||'Invalid coupon'},{status:400})}
}
export async function DELETE(req:NextRequest){
 const user=await getAuthenticatedWorkspaceUser(req,'offers',true);if(!user)return NextResponse.json({error:'Access denied'},{status:403})
 const id=req.nextUrl.searchParams.get('id');if(!id)return NextResponse.json({error:'Coupon id is required'},{status:400})
 const {error}=await supabase.from('coupons').delete().eq('id',id).eq('client_id',user.workspaceId);if(error)return NextResponse.json({error:error.message},{status:400});await Promise.all([invalidateWorkspaceBookingBundles(user.workspaceId),invalidateWorkspaceCommerceBundles(user.workspaceId)]);return NextResponse.json({success:true})
}
