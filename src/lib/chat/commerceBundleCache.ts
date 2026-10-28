import { BoundedCache } from '@/lib/boundedCache'
import { checked } from '@/lib/booking'
import { getBotCommerceConfig, invalidateBotCommerceConfig, type BotCommerceConfig } from '@/lib/botCommerceConfig'
import { redis } from '@/lib/redis'
import { supabase } from '@/lib/supabase'

export type BotCommerceBundle={clientId:string;botId:string;config:BotCommerceConfig;offers:any[];coupons:any[];cachedAt:number}
type StoredConfig=Omit<BotCommerceConfig,'serviceIds'|'offerIds'|'productIds'|'couponIds'|'autoApplyCouponIds'|'serviceLabels'|'offerLabels'|'productLabels'>&{
 serviceIds:string[];offerIds:string[];productIds:string[];couponIds:string[];autoApplyCouponIds:string[]
 serviceLabels:Array<[string,string]>;offerLabels:Array<[string,string]>;productLabels:Array<[string,string]>
}
type StoredBundle=Omit<BotCommerceBundle,'config'>&{config:StoredConfig}

const TTL_SECONDS=120
const localBundles=new BoundedCache<string,BotCommerceBundle>({maxEntries:128,maxBytes:8*1024*1024,ttlMs:TTL_SECONDS*1000})
const pending=new Map<string,Promise<BotCommerceBundle>>()
const key=(clientId:string,botId:string)=>`bot_commerce_bundle:v1:${clientId}:${botId}`
const serializeConfig=(value:BotCommerceConfig):StoredConfig=>({...value,serviceIds:[...value.serviceIds],offerIds:[...value.offerIds],productIds:[...value.productIds],couponIds:[...value.couponIds],autoApplyCouponIds:[...value.autoApplyCouponIds],serviceLabels:[...value.serviceLabels],offerLabels:[...value.offerLabels],productLabels:[...value.productLabels]})
const hydrateConfig=(value:StoredConfig):BotCommerceConfig=>({...value,serviceIds:new Set(value.serviceIds||[]),offerIds:new Set(value.offerIds||[]),productIds:new Set(value.productIds||[]),couponIds:new Set(value.couponIds||[]),autoApplyCouponIds:new Set(value.autoApplyCouponIds||[]),serviceLabels:new Map(value.serviceLabels||[]),offerLabels:new Map(value.offerLabels||[]),productLabels:new Map(value.productLabels||[])})
const clone=(value:BotCommerceBundle):BotCommerceBundle=>({...value,config:hydrateConfig(serializeConfig(value.config)),offers:value.offers.map(row=>({...row})),coupons:value.coupons.map(row=>({...row}))})

export async function getBotCommerceBundle(input:{clientId:string;botId:string;loadConfig?:()=>Promise<BotCommerceConfig>}):Promise<BotCommerceBundle>{
 const cacheKey=key(input.clientId,input.botId),local=localBundles.get(cacheKey)
 if(local)return clone(local)
 const inFlight=pending.get(cacheKey);if(inFlight)return clone(await inFlight)
 const loading=(async()=>{
  const cached=await redis.get<StoredBundle>(cacheKey).catch(()=>null)
  if(cached?.clientId===input.clientId&&cached?.botId===input.botId&&cached.config){const hydrated:BotCommerceBundle={...cached,config:hydrateConfig(cached.config)};localBundles.set(cacheKey,hydrated);return hydrated}
  const now=new Date().toISOString()
  const [config,offersResult,couponsResult]=await Promise.all([
   input.loadConfig?.()||getBotCommerceConfig(input.clientId,input.botId),
   supabase.from('booking_offer_stats').select('*').eq('client_id',input.clientId).eq('status','active').not('product_id','is',null).lte('start_at',now).gt('end_at',now),
   supabase.from('coupons').select('id,code,description,discount_type,discount_value,min_cart_value,is_active,max_uses,used_count,expires_at,product_ids,categories,service_ids,stackable,compatible_offer_ids').eq('client_id',input.clientId).eq('is_active',true).order('created_at',{ascending:false}),
  ])
  const bundle:BotCommerceBundle={clientId:input.clientId,botId:input.botId,config,offers:checked(offersResult)||[],coupons:checked(couponsResult)||[],cachedAt:Date.now()}
  localBundles.set(cacheKey,bundle)
  const stored:StoredBundle={...bundle,config:serializeConfig(config)}
  void redis.set(cacheKey,stored,{ex:TTL_SECONDS}).catch(()=>{})
  return bundle
 })()
 pending.set(cacheKey,loading)
 try{return clone(await loading)}finally{pending.delete(cacheKey)}
}

export async function invalidateBotCommerceBundle(clientId:string,botId:string){
 const cacheKey=key(clientId,botId);localBundles.delete(cacheKey);invalidateBotCommerceConfig(clientId,botId);await redis.del(cacheKey).catch(()=>{})
}

export async function invalidateWorkspaceCommerceBundles(clientId:string){
 const {data}=await supabase.from('bots').select('id').eq('client_id',clientId)
 await Promise.all((data||[]).map(bot=>invalidateBotCommerceBundle(clientId,bot.id)))
}
