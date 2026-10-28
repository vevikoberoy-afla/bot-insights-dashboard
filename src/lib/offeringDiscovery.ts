import { embed } from '@/lib/embeddings'
import { chatComplete } from '@/lib/gemini'
import { redis } from '@/lib/redis'
import { supabase } from '@/lib/supabase'

export type OfferingScope='product'|'service'|'all'
export type DiscoveryItem={offering_type:OfferingScope;id:string;name:string;description?:string|null;price?:number|null;currency?:string|null;image_url?:string|null;sku?:string|null;category?:string|null;available_quantity?:number|null;duration_min?:number|null;bestseller_score?:number|null;score?:number;compressed_catalog_line?:string|null;reason?:string}
export type DiscoveryResult={brief:string;items:DiscoveryItem[];source:'hybrid_rrf'|'local_fallback'}

const supportIntent=/\b(?:track|tracking|order\s+(?:status|details)|return|refund|exchange|replace|damaged|ticket|complaint|cancel|change|modify|reschedule|manage)\b/i
// Keep deterministic catalogue/name/SKU lookups out of the LLM path. This
// classifier is deliberately limited to requests that need interpretation.
const discoveryIntent=/\b(?:recommend|suggest|ideas?|gift|surprise|special|best|better|perfect|premium|luxury|budget|affordable|hungry|eat|food|fresh|healthy|romantic|anniversary|birthday|apology|sorry|stress|stressed|relax|relaxation|pamper|unwind|wellness)\b/i
const serviceIntent=/\b(?:appointment|book|booking|reserve|reservation|schedule|slot|consultation|therapy|salon|spa|massage|treatment|session|table|seat|stress|stressed|relax|relaxation|pamper|wellness|unwind)\b/i
const productIntent=/\b(?:buy|order|shop|product|item|gift|food|eat|menu|cake|flower|shoe|dress|lamp|bouquet|something)\b/i
const normalized=(value:unknown)=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
const words=(value:unknown)=>normalized(value).split(' ').filter(word=>word.length>2&&!['want','need','have','with','that','this','what','your','something','please','show'].includes(word))
const expandedWords=(value:string)=>{const base=words(value),extra:string[]=[];if(/gift|girlfriend|boyfriend|partner|wife|husband|romantic|anniversary|apology|sorry/i.test(value))extra.push('gift','romantic','premium','luxury','flower','bouquet','cake','chocolate','spa');if(/hungry|eat|food|fresh|meal|craving/i.test(value))extra.push('food','meal','fresh','menu','dish','salad','snack');if(/stress|relax|pamper|unwind/i.test(value))extra.push('relaxation','massage','spa','therapy','wellness','aromatherapy');return Array.from(new Set([...base,...extra]))}

export function recommendationScope(text:string):OfferingScope|null{
 if(supportIntent.test(text)||!discoveryIntent.test(text))return null
 if(serviceIntent.test(text))return'service'
 if(productIntent.test(text))return'product'
 return'all'
}

function fallbackBrief(query:string,scope:OfferingScope,count:number){
 const q=query.toLowerCase()
 if(/gift|girlfriend|boyfriend|partner|wife|husband/.test(q))return `That’s a lovely idea—something thoughtful can make the moment feel genuinely special. I found ${count} ${scope==='service'?'experiences':'picks'} that fit what you described.`
 if(/stress|relax|pamper|unwind/.test(q))return `Taking a little time to unwind sounds like a great call. Here are the most relevant options I found for a restorative break.`
 if(/hungry|food|eat|fresh/.test(q))return `That sounds good—I’ve narrowed the menu to the options that best match what you’re craving. Here are the strongest picks available now.`
 return `Absolutely—I looked at what you’re trying to achieve, not just the exact words you used. Here are the most relevant available options.`
}

function localRank(query:string,items:DiscoveryItem[]){
 const terms=expandedWords(query),premium=/\b(?:special|best|better|premium|luxury|upgrade)\b/i.test(query),maxPrice=Math.max(1,...items.map(item=>Number(item.price||0)))
 const ranked=items.map(item=>{const hay=normalized(`${item.name} ${item.description||''} ${item.category||''} ${item.compressed_catalog_line||''}`),matches=terms.filter(term=>hay.includes(term)).length,quality=Number(item.bestseller_score||0)/100;return{...item,score:matches/Math.max(terms.length,1)+(premium&&/premium|luxury/.test(hay)?0.35:0)+quality*0.05+(premium?Number(item.price||0)/maxPrice*0.04:0)}}).sort((a,b)=>Number(b.score)-Number(a.score))
 const relevant=ranked.filter(item=>Number(item.score)>.05)
 // Existing catalogues may not have embeddings until their background
 // enrichment runs. A bounded popularity/price fallback still gives the LLM
 // real records to choose from instead of failing or inventing an item.
 return (relevant.length?relevant:ranked).slice(0,15)
}

async function fallbackCandidates(clientId:string,botId:string,scope:OfferingScope,query:string){
 const configured=(await supabase.from('bot_commerce_config').select('bot_id').eq('client_id',clientId).eq('bot_id',botId).maybeSingle()).data
 const [productLinks,serviceLinks,products,services]=await Promise.all([
  configured&&scope!=='service'?supabase.from('bot_catalog_products').select('product_id').eq('client_id',clientId).eq('bot_id',botId):Promise.resolve({data:[]}),
  configured&&scope!=='product'?supabase.from('bot_booking_services').select('service_id').eq('client_id',clientId).eq('bot_id',botId):Promise.resolve({data:[]}),
  scope!=='service'?supabase.from('catalog_product_availability').select('*').eq('client_id',clientId).eq('status','active').limit(1000):Promise.resolve({data:[]}),
  scope!=='product'?supabase.from('booking_services').select('*').eq('client_id',clientId).eq('is_active',true).limit(1000):Promise.resolve({data:[]}),
 ])
 const productIds=new Set((productLinks.data||[]).map((row:any)=>row.product_id)),serviceIds=new Set((serviceLinks.data||[]).map((row:any)=>row.service_id))
 const rows:DiscoveryItem[]=[...(products.data||[]).filter((row:any)=>!configured||productIds.has(row.id)).filter((row:any)=>!row.track_inventory||row.allow_backorder||Number(row.available_quantity)>0).map((row:any)=>({offering_type:'product' as const,...row,available_quantity:Number(row.available_quantity),compressed_catalog_line:[row.name,row.sku,row.category,row.description,JSON.stringify(row.attributes||{})].filter(Boolean).join(' ')})),...(services.data||[]).filter((row:any)=>!configured||serviceIds.has(row.id)).map((row:any)=>({offering_type:'service' as const,...row,category:row.configuration?.category,compressed_catalog_line:[row.name,row.description,row.configuration?.category].filter(Boolean).join(' ')}))]
 return localRank(query,rows)
}

async function personalize(query:string,items:DiscoveryItem[],scope:OfferingScope){
 const lines=items.slice(0,15).map(item=>`[${item.offering_type}:${item.id}|${item.name}|${item.currency||''} ${item.price??''}|${String(item.compressed_catalog_line||`${item.category||''} ${item.description||''}`).slice(0,240)}]`)
 try{
  const raw=await chatComplete([{role:'system',content:'You select real store offerings. Return strict JSON only: {"brief":"two warm, natural sentences responding to the customer before recommendations","items":[{"id":"exact supplied id","reason":"maximum 7 words"}]}. Select at most 5 relevant IDs. Never invent IDs, availability, prices, or claims. Avoid exaggerated flattery. If multiple traits are requested, rank items matching all traits first. Special/better/upgrade favors premium choices.'},{role:'user',content:`Customer: ${query}\nAvailable ${scope} candidates:\n${lines.join('\n')}`}],{maxTokens:260,temperature:.35,responseFormat:'json_object'})
  const parsed=JSON.parse(raw),allowed=new Map(items.map(item=>[item.id,item])),selected=Array.isArray(parsed.items)?parsed.items.map((pick:any)=>{const item=allowed.get(String(pick.id));return item?{...item,reason:String(pick.reason||'Recommended for you').slice(0,80)}:null}).filter(Boolean).slice(0,5):[]
  if(selected.length)return{brief:String(parsed.brief||fallbackBrief(query,scope,selected.length)).slice(0,500),items:selected as DiscoveryItem[]}
 }catch(error){console.warn('[offering discovery] personalization fallback',error instanceof Error?error.message:error)}
 return{brief:fallbackBrief(query,scope,Math.min(5,items.length)),items:items.slice(0,5).map(item=>({...item,reason:'Recommended for what you described'}))}
}

export async function discoverOfferings(input:{clientId:string;botId:string;query:string;scope:OfferingScope}):Promise<DiscoveryResult|null>{
 const cacheKey=`offering_discovery:v1:${input.clientId}:${input.botId}:${input.scope}:${Buffer.from(normalized(input.query)).toString('base64url')}`
 const cached=await redis.get<DiscoveryResult>(cacheKey).catch(()=>null);if(cached)return cached
 let candidates:DiscoveryItem[]=[],source:DiscoveryResult['source']='hybrid_rrf'
 try{
  const vector=await embed(input.query),result=await supabase.rpc('match_bot_offerings_hybrid',{p_client:input.clientId,p_bot:input.botId,p_query_text:input.query,p_query_embedding:JSON.stringify(vector),p_scope:input.scope,p_limit:15})
  if(result.error)throw result.error
  candidates=(result.data||[]).map((item:any)=>({...item,price:item.price==null?null:Number(item.price),available_quantity:item.available_quantity==null?null:Number(item.available_quantity)}))
 }catch(error){source='local_fallback';console.warn('[offering discovery] hybrid fallback',error instanceof Error?error.message:error);candidates=await fallbackCandidates(input.clientId,input.botId,input.scope,input.query)}
 // An empty successful RPC is common while discovery embeddings are being
 // backfilled. Treat an under-filled result like a recoverable miss and top it
 // up with real, bot-scoped, in-stock records rather than dropping the user
 // into a generic search prompt.
 const hybridCount=source==='hybrid_rrf'?candidates.length:0
 if(source==='hybrid_rrf'&&candidates.length<3){
  const fallback=await fallbackCandidates(input.clientId,input.botId,input.scope,input.query)
  const seen=new Set(candidates.map(item=>item.id))
  for(const item of fallback){if(!seen.has(item.id)){candidates.push(item);seen.add(item.id)}if(candidates.length>=15)break}
  if(candidates.length&&source==='hybrid_rrf'&&hybridCount===0)source='local_fallback'
 }
 if(!candidates.length)return null
 const tailored=await personalize(input.query,candidates,input.scope),result={...tailored,source}
 await redis.set(cacheKey,result,{ex:300}).catch(()=>{})
 return result
}
