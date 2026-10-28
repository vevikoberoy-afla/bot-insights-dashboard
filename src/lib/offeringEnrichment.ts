import { embed } from '@/lib/embeddings'
import { chatComplete } from '@/lib/gemini'
import { redis } from '@/lib/redis'
import { supabase } from '@/lib/supabase'

export type EnrichmentKind='product'|'service'
const cleanTags=(value:unknown)=>Array.isArray(value)?Array.from(new Set(value.map(item=>String(item).toLowerCase().replace(/[^a-z0-9 -]/g,'').trim()).filter(Boolean))).slice(0,10):[]

export async function enrichOffering(kind:EnrichmentKind,id:string,clientId:string){
 const table=kind==='product'?'catalog_products':'booking_services'
 const {data:item,error}=await supabase.from(table).select('*').eq('id',id).eq('client_id',clientId).maybeSingle()
 if(error||!item)throw error||new Error('Offering not found')
 const {data:prices}=await supabase.from(table).select('price').eq('client_id',clientId).not('price','is',null)
 const values=(prices||[]).map((row:any)=>Number(row.price)).filter(Number.isFinite),average=values.length?values.reduce((sum,value)=>sum+value,0)/values.length:Number(item.price||0),ratio=Number(item.price||0)/Math.max(average,1)
 const priceTier=ratio>=1.6?'luxury':ratio>=1.15?'premium':ratio<=.75?'budget':'standard'
 const raw=await chatComplete([{role:'system',content:'You enrich a store offering for search. Return strict JSON only with attributes (5-10 concrete traits), occasions_intents (5-10 customer situations, needs, emotions, or outcomes), and short_hook (maximum 8 words). Use lowercase tags. Do not invent ingredients, capabilities, or medical claims.'},{role:'user',content:`Type: ${kind}\nName: ${item.name}\nCategory: ${kind==='product'?item.category||'':item.configuration?.category||''}\nDescription: ${item.description||''}\nPrice tier: ${priceTier}`}],{maxTokens:220,temperature:.2,responseFormat:'json_object'})
 let metadata:any={};try{metadata=JSON.parse(raw)}catch{}
 const attributes=cleanTags(metadata.attributes),intents=cleanTags(metadata.occasions_intents),category=kind==='product'?item.category||'':item.configuration?.category||'',searchText=[item.name,category,item.description,...attributes,...intents,priceTier].filter(Boolean).join(' '),vector=await embed(searchText)
 const compressed=`[${kind}:${item.id}|${item.currency||'INR'} ${Number(item.price||0)}|tier:${priceTier}|${item.name}|attrs:${attributes.join(',')}|intents:${intents.join(',')}|${String(metadata.short_hook||'').slice(0,80)}]`
 const update=await supabase.from(table).update({search_attributes:attributes,occasions_intents:intents,price_tier:priceTier,compressed_catalog_line:compressed,discovery_embedding:JSON.stringify(vector),updated_at:new Date().toISOString()}).eq('id',id).eq('client_id',clientId)
 if(update.error)throw update.error
 const linkTable=kind==='product'?'bot_catalog_products':'bot_booking_services',foreignKey=kind==='product'?'product_id':'service_id'
 const {data:links}=await supabase.from(linkTable).select('bot_id').eq('client_id',clientId).eq(foreignKey,id)
 await Promise.all([redis.del(`catalog:${clientId}`).catch(()=>{}),...(links||[]).map((link:any)=>redis.del(`bot_commerce_dashboard:${clientId}:${link.bot_id}`).catch(()=>{}))])
 return{kind,id,attributes,occasions_intents:intents,price_tier:priceTier}
}

export async function queueOfferingEnrichment(origin:string,kind:EnrichmentKind,id:string,clientId:string){
 if(!process.env.QSTASH_TOKEN){void enrichOffering(kind,id,clientId).catch(error=>console.error('[offering enrichment]',error));return}
 const {qstash}=await import('@/lib/qstash')
 await qstash.publishJSON({url:`${origin.replace(/\/$/,'')}/api/qstash/enrich-offering`,body:{kind,id,clientId},retries:3,headers:process.env.CATALOG_ENRICHMENT_SECRET?{'x-webhook-secret':process.env.CATALOG_ENRICHMENT_SECRET}:undefined})
}
