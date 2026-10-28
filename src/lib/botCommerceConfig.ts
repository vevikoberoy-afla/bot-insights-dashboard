import { supabase } from '@/lib/supabase'
import { checked } from '@/lib/booking'
import { getEffectiveEntitlements, featureAllowed, type Entitlements } from '@/lib/saas/entitlements'
import { BoundedCache } from '@/lib/boundedCache'

export type BotCommerceConfig={configured:boolean;booking_enabled:boolean;ordering_enabled:boolean;show_catalog:boolean;allow_booking_management:boolean;allow_order_management:boolean;upsell_enabled:boolean;upsell_max_gap:number;menu_title:string;booking_label:string;catalogue_label:string;serviceIds:Set<string>;offerIds:Set<string>;productIds:Set<string>;couponIds:Set<string>;autoApplyCouponIds:Set<string>;serviceLabels:Map<string,string>;offerLabels:Map<string,string>;productLabels:Map<string,string>}

const configCache=new BoundedCache<string,BotCommerceConfig>({maxEntries:256,maxBytes:4*1024*1024,ttlMs:30_000})
const pendingConfigs=new Map<string,Promise<BotCommerceConfig>>()
const cloneConfig=(value:BotCommerceConfig):BotCommerceConfig=>({...value,serviceIds:new Set(value.serviceIds),offerIds:new Set(value.offerIds),productIds:new Set(value.productIds),couponIds:new Set(value.couponIds),autoApplyCouponIds:new Set(value.autoApplyCouponIds),serviceLabels:new Map(value.serviceLabels),offerLabels:new Map(value.offerLabels),productLabels:new Map(value.productLabels)})

export async function getBotCommerceConfig(clientId:string,botId:string,knownEntitlements?:Entitlements):Promise<BotCommerceConfig>{
 const entitlement=knownEntitlements||await getEffectiveEntitlements(clientId)
 const bookingAllowed=featureAllowed(entitlement,'booking.enabled'),commerceAllowed=featureAllowed(entitlement,'commerce.enabled')
 const cacheKey=`${clientId}:${botId}:${bookingAllowed?1:0}:${commerceAllowed?1:0}`
 const cached=configCache.get(cacheKey);if(cached)return cloneConfig(cached)
 const pending=pendingConfigs.get(cacheKey);if(pending)return cloneConfig(await pending)
 const loading=loadBotCommerceConfig(clientId,botId,entitlement,bookingAllowed,commerceAllowed)
 pendingConfigs.set(cacheKey,loading)
 try{const value=await loading;configCache.set(cacheKey,value);return cloneConfig(value)}finally{pendingConfigs.delete(cacheKey)}
}

export function invalidateBotCommerceConfig(clientId:string,botId:string){
 const prefix=`${clientId}:${botId}:`
 for(const cacheKey of Array.from(configCache.keys()))if(cacheKey.startsWith(prefix))configCache.delete(cacheKey)
}

async function loadBotCommerceConfig(clientId:string,botId:string,entitlement:Entitlements,bookingAllowed:boolean,commerceAllowed:boolean):Promise<BotCommerceConfig>{
 const fallback:BotCommerceConfig={configured:false,booking_enabled:true,ordering_enabled:true,show_catalog:true,allow_booking_management:true,allow_order_management:true,upsell_enabled:true,upsell_max_gap:1000,menu_title:'How can I help?',booking_label:'Book an appointment',catalogue_label:'Browse products',serviceIds:new Set(),offerIds:new Set(),productIds:new Set(),couponIds:new Set(),autoApplyCouponIds:new Set(),serviceLabels:new Map(),offerLabels:new Map(),productLabels:new Map()}
 try {
  const row=checked(await supabase.from('bot_commerce_config').select('*').eq('client_id',clientId).eq('bot_id',botId).maybeSingle())
  if(!row)return {...fallback,booking_enabled:bookingAllowed,ordering_enabled:commerceAllowed,show_catalog:commerceAllowed}
  const base={configured:true,booking_enabled:row.booking_enabled!==false,ordering_enabled:row.ordering_enabled!==false,show_catalog:row.show_catalog!==false,allow_booking_management:row.allow_booking_management!==false,allow_order_management:row.allow_order_management!==false,upsell_enabled:row.upsell_enabled!==false,upsell_max_gap:Math.max(0,Number(row.upsell_max_gap)||0),menu_title:row.menu_title||fallback.menu_title,booking_label:row.booking_label||fallback.booking_label,catalogue_label:row.catalogue_label||fallback.catalogue_label}
  const [services,offers,products,coupons]=await Promise.all([
   supabase.from('bot_booking_services').select('service_id,custom_label').eq('client_id',clientId).eq('bot_id',botId),
   supabase.from('bot_booking_offers').select('offer_id,custom_label').eq('client_id',clientId).eq('bot_id',botId),
   supabase.from('bot_catalog_products').select('product_id,custom_label').eq('client_id',clientId).eq('bot_id',botId),
   supabase.from('bot_coupon_rules').select('coupon_id,auto_apply').eq('client_id',clientId).eq('bot_id',botId).eq('enabled',true),
  ])
  const serviceRows=checked(services)||[],offerRows=checked(offers)||[],productRows=checked(products)||[],couponRows=checked(coupons)||[]
  return{...base,booking_enabled:base.booking_enabled&&bookingAllowed,ordering_enabled:base.ordering_enabled&&commerceAllowed,show_catalog:base.show_catalog&&commerceAllowed,serviceIds:new Set(serviceRows.map((x:any)=>x.service_id)),offerIds:new Set(offerRows.map((x:any)=>x.offer_id)),productIds:new Set(productRows.map((x:any)=>x.product_id)),couponIds:new Set(couponRows.map((x:any)=>x.coupon_id)),autoApplyCouponIds:new Set(couponRows.filter((x:any)=>x.auto_apply).map((x:any)=>x.coupon_id)),serviceLabels:new Map(serviceRows.map((x:any)=>[x.service_id,x.custom_label])),offerLabels:new Map(offerRows.map((x:any)=>[x.offer_id,x.custom_label])),productLabels:new Map(productRows.map((x:any)=>[x.product_id,x.custom_label]))}
 } catch(error) {
  console.warn('[bot-commerce-config] configuration unavailable',error)
  return {...fallback,booking_enabled:false,ordering_enabled:false,show_catalog:false}
 }
}
