import { NextRequest,NextResponse } from 'next/server'
import { requireWorkspace,saasError,SaaSError } from '@/lib/saas/context'
import { supabase } from '@/lib/supabase'

export const dynamic='force-dynamic'
const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/
const phone=/^\+?[0-9][0-9\s()-]{6,20}$/
const currency=/^[A-Z]{3}$/
const missing=(error:any)=>['42P01','PGRST205','42883','PGRST202'].includes(error?.code||'')

function cleanObject(value:unknown,maxKeys=20){
 if(!value||typeof value!=='object'||Array.isArray(value))return{}
 return Object.fromEntries(Object.entries(value as Record<string,unknown>).slice(0,maxKeys).map(([key,item])=>[key.slice(0,50),typeof item==='string'?item.trim().slice(0,500):item]))
}
function cleanPayload(raw:any){
 const id=String(raw?.id||'').trim()
 if(id&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))throw new SaaSError('INVALID_INPUT','Invalid store identifier.',400)
 const kind=raw?.kind==='booking'?'booking':raw?.kind==='commerce'?'commerce':''
 const name=String(raw?.name||'').trim().slice(0,120)
 const timezone=String(raw?.timezone||'UTC').trim().slice(0,64)
 try{new Intl.DateTimeFormat('en',{timeZone:timezone}).format()}catch{throw new SaaSError('INVALID_INPUT','Choose a valid timezone.',400)}
 const contact_email=String(raw?.contact_email||'').trim().toLowerCase().slice(0,254)
 const contact_phone=String(raw?.contact_phone||'').trim().slice(0,24)
 const website_url=String(raw?.website_url||'').trim().slice(0,500)
 if(!kind||name.length<2)throw new SaaSError('INVALID_INPUT','Choose a business type and enter a store name.',400)
 if(contact_email&&!email.test(contact_email))throw new SaaSError('INVALID_INPUT','Enter a valid contact email.',400)
 if(contact_phone&&!phone.test(contact_phone))throw new SaaSError('INVALID_INPUT','Enter a valid contact phone number.',400)
 if(website_url){try{const parsed=new URL(website_url);if(!['http:','https:'].includes(parsed.protocol))throw new Error()}catch{throw new SaaSError('INVALID_INPUT','Enter a valid website URL.',400)}}
 const code=String(raw?.currency||'INR').toUpperCase()
 if(!currency.test(code))throw new SaaSError('INVALID_INPUT','Choose a valid three-letter currency.',400)
 const bot_ids=Array.from(new Set((Array.isArray(raw?.bot_ids)?raw.bot_ids:[]).filter((id:any)=>typeof id==='string'&&/^[0-9a-f-]{36}$/i.test(id)))).slice(0,100)
 return {id:id||null,kind,name,timezone,currency:code,locale:String(raw?.locale||'en-IN').slice(0,16),contact_email:contact_email||null,contact_phone:contact_phone||null,website_url:website_url||null,address:cleanObject(raw?.address,12),settings:cleanObject(raw?.settings,30),bot_ids,onboarding_step:Math.max(1,Math.min(4,Number(raw?.onboarding_step)||1)),complete:raw?.complete===true,make_primary:raw?.make_primary===true}
}

export async function GET(){
 try{
  const ctx=await requireWorkspace(null,'overview')
  const stores=await supabase.from('workspace_storefronts').select('*,workspace_storefront_bots(bot_id)').eq('client_id',ctx.workspaceId).order('is_primary',{ascending:false}).order('created_at')
  if(stores.error){if(missing(stores.error))return NextResponse.json({installed:false,stores:[],entitlements:ctx.entitlements});throw stores.error}
  const [products,services,orders,bookings]=await Promise.all([
   supabase.from('catalog_products').select('id',{count:'exact',head:true}).eq('client_id',ctx.workspaceId),
   supabase.from('booking_services').select('id',{count:'exact',head:true}).eq('client_id',ctx.workspaceId),
   supabase.from('commerce_orders').select('id',{count:'exact',head:true}).eq('client_id',ctx.workspaceId),
   supabase.from('feature_bookings').select('id',{count:'exact',head:true}).eq('client_id',ctx.workspaceId),
  ])
  const storeLimit=Math.max(0,Number(ctx.entitlements?.limits?.['storefronts.total']??1)),storeUsed=(stores.data||[]).length
  return NextResponse.json({installed:true,stores:(stores.data||[]).map((store:any)=>({...store,bot_ids:(store.workspace_storefront_bots||[]).map((row:any)=>row.bot_id),workspace_storefront_bots:undefined})),entitlements:ctx.entitlements,store_usage:{used:storeUsed,limit:storeLimit,remaining:Math.max(0,storeLimit-storeUsed)},readiness:{products:products.count||0,services:services.count||0,orders:orders.count||0,bookings:bookings.count||0}},{headers:{'Cache-Control':'private, max-age=30, stale-while-revalidate=120'}})
 }catch(error){return saasError(error)}
}

export async function POST(req:NextRequest){
 try{
  const ctx=await requireWorkspace(null,'settings',true),payload=cleanPayload(await req.json())
  const feature=`${payload.kind}.enabled`
  if(ctx.entitlements?.features?.[feature]!==true)throw new SaaSError('PLAN_FEATURE_UNAVAILABLE',`${payload.kind==='commerce'?'Commerce':'Booking'} is not included in this workspace plan.`,403)
  const result=await supabase.rpc('configure_workspace_storefront',{p_actor:ctx.user.id,p_client:ctx.workspaceId,p_payload:payload})
  if(result.error){
   if(missing(result.error))throw new SaaSError('STORAGE_UNAVAILABLE','Apply migration 102_workspace_storefront_onboarding.sql first.',503)
   if(String(result.error.message||'').includes('STOREFRONT_LIMIT_REACHED'))throw new SaaSError('STOREFRONT_LIMIT_REACHED','This workspace has reached its store allowance. Ask the platform administrator to increase Stores per workspace.',409)
   if(String(result.error.message||'').includes('STOREFRONT_NOT_FOUND'))throw new SaaSError('NOT_FOUND','Store not found.',404)
   if(result.error.code==='23505')throw new SaaSError('STORE_NAME_EXISTS','A store with this name already exists in this workspace.',409)
   throw result.error
  }
  return NextResponse.json({store:result.data},{status:payload.complete?201:200})
 }catch(error){return saasError(error)}
}
