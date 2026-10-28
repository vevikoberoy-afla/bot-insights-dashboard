'use client'
import {BoundedCache} from '@/lib/boundedCache'

export type BotCommerceItem={id:string;name:string;description?:string|null;status?:string;is_active?:boolean;duration_min?:number;timezone?:string;service_id?:string|null;product_id?:string|null;remaining?:number;price?:number;currency?:string;available_quantity?:number;sku?:string}
export type BotCommerceSettings={booking_enabled:boolean;ordering_enabled:boolean;show_catalog:boolean;allow_booking_management:boolean;allow_order_management:boolean;upsell_enabled:boolean;upsell_max_gap:number;menu_title:string;booking_label:string;catalogue_label:string}
export type BotCommercePayload={configured:boolean;config:BotCommerceSettings;service_ids:string[];offer_ids:string[];product_ids:string[];coupon_ids?:string[];auto_apply_coupon_ids?:string[];services:BotCommerceItem[];offers:BotCommerceItem[];products:BotCommerceItem[];coupons?:BotCommerceItem[]}

export const defaultBotCommerceSettings:BotCommerceSettings={booking_enabled:true,ordering_enabled:true,show_catalog:true,allow_booking_management:true,allow_order_management:true,upsell_enabled:true,upsell_max_gap:1000,menu_title:'How can I help?',booking_label:'Book an appointment',catalogue_label:'Browse products'}
export const emptyBotCommercePayload:BotCommercePayload={configured:false,config:defaultBotCommerceSettings,service_ids:[],offer_ids:[],product_ids:[],coupon_ids:[],auto_apply_coupon_ids:[],services:[],offers:[],products:[],coupons:[]}

type CacheEntry={savedAt:number;value:BotCommercePayload}
const FRESH_FOR=5*60*1000,KEEP_FOR=30*60*1000,DB='vittain-client-cache',STORE='commerce',VERSION=1
const memory=new BoundedCache<string,CacheEntry>({maxEntries:24,maxBytes:20*1024*1024,ttlMs:KEEP_FOR}),requests=new Map<string,Promise<BotCommercePayload>>()
const key=(botId:string)=>`bot-commerce-config:v3:${botId}`,event=(botId:string)=>`bot-commerce-config:${botId}`
let database:Promise<IDBDatabase>|null=null,channel:BroadcastChannel|null=null

function openDatabase(){
 if(typeof indexedDB==='undefined')return Promise.reject(new Error('IndexedDB unavailable'))
 if(database)return database
 database=new Promise((resolve,reject)=>{const request=indexedDB.open(DB,VERSION);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})
 return database
}
async function persistentGet(cacheKey:string){const db=await openDatabase();return new Promise<CacheEntry|null>((resolve,reject)=>{const request=db.transaction(STORE,'readonly').objectStore(STORE).get(cacheKey);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error)})}
async function persistentSet(cacheKey:string,entry:CacheEntry){const db=await openDatabase();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(entry,cacheKey);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
function idle(task:()=>void){if(typeof window==='undefined')return;const requestIdle=(window as any).requestIdleCallback as undefined|((callback:(deadline:{didTimeout:boolean;timeRemaining:()=>number})=>void,options?:{timeout:number})=>number);if(requestIdle)requestIdle(()=>task(),{timeout:1000});else window.setTimeout(task,1)}
function ensureChannel(){if(typeof BroadcastChannel==='undefined'||channel)return;channel=new BroadcastChannel('bot_commerce_cache');channel.onmessage=({data})=>{if(!data?.botId||!data?.entry)return;memory.set(data.botId,data.entry);window.dispatchEvent(new CustomEvent(event(data.botId),{detail:data.entry.value}))}}
function valid(entry:CacheEntry|null){return !!entry?.value&&Date.now()-entry.savedAt<KEEP_FOR}

export function getCachedBotCommerceConfig(botId:string){const entry=memory.get(botId);return valid(entry||null)?entry!.value:null}
export function isBotCommerceCacheFresh(botId:string){const entry=memory.get(botId);return !!entry&&Date.now()-entry.savedAt<FRESH_FOR}

export function cacheBotCommerceConfig(botId:string,value:BotCommercePayload){
 const entry={savedAt:Date.now(),value};memory.set(botId,entry)
 if(typeof window!=='undefined'){ensureChannel();window.dispatchEvent(new CustomEvent(event(botId),{detail:value}));channel?.postMessage({botId,entry});idle(()=>{persistentSet(key(botId),entry).catch(()=>{})})}
 return value
}

async function hydrate(botId:string){
 const current=memory.get(botId);if(valid(current||null))return current!
 try{const stored=await persistentGet(key(botId));if(valid(stored)){memory.set(botId,stored!);return stored!}}catch{}
 return null
}
async function requestBotCommerceConfig(botId:string,force=false){
 const pending=requests.get(botId);if(pending)return pending
 const request=fetch(`/api/bots/${botId}/commerce-config${force?'?refresh=1':''}`,{cache:'no-store'})
  .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not load booking and commerce settings');return cacheBotCommerceConfig(botId,body as BotCommercePayload)})
  .finally(()=>requests.delete(botId))
 requests.set(botId,request);return request
}

export async function prefetchBotCommerceConfig(botId:string){
 ensureChannel();const cached=await hydrate(botId)
 if(cached&&Date.now()-cached.savedAt<FRESH_FOR)return cached.value
 if(cached){void requestBotCommerceConfig(botId);return cached.value}
 return requestBotCommerceConfig(botId)
}
export function refreshBotCommerceConfig(botId:string){return requestBotCommerceConfig(botId,true)}
export function subscribeBotCommerceConfig(botId:string,listener:(value:BotCommercePayload)=>void){if(typeof window==='undefined')return()=>{};ensureChannel();const name=event(botId),handler=(value:Event)=>listener((value as CustomEvent<BotCommercePayload>).detail);window.addEventListener(name,handler);return()=>window.removeEventListener(name,handler)}
