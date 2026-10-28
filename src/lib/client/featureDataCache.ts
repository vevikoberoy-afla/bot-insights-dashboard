'use client'
import {BoundedCache} from '@/lib/boundedCache'
import {activeWorkspaceId} from '@/lib/client/workspace'

type Entry={value:any;fetchedAt:number}
const FRESH_MS=2*60_000,RETAIN_MS=30*60_000
const values=new BoundedCache<string,Entry>({maxEntries:40,maxBytes:28*1024*1024,ttlMs:RETAIN_MS})
const requests=new Map<string,Promise<any>>()
const listeners=new Map<string,Set<(value:any)=>void>>()
const scoped=(url:string)=>`${activeWorkspaceId('unscoped')}:${url}`

export function readFeatureData<T=any>(url:string){return values.get(scoped(url))?.value as T|undefined}
function freshness(url:string){return url.startsWith('/api/inbox')?15_000:/^\/api\/(campaigns|email\/campaigns|whatsapp\/campaigns)/.test(url)?30_000:FRESH_MS}
export function isFeatureDataFresh(url:string){const entry=values.peek(scoped(url));return !!entry&&Date.now()-entry.fetchedAt<freshness(url)}
function publish(url:string,value:any,key=scoped(url)){values.set(key,{value,fetchedAt:Date.now()});listeners.get(key)?.forEach(listener=>listener(value));return value}

export async function fetchFeatureData<T=any>(url:string,{force=false}:{force?:boolean}={}){
 const key=scoped(url),entry=values.get(key)
 if(!force&&entry&&Date.now()-entry.fetchedAt<freshness(url))return entry.value as T
 const pending=requests.get(key);if(pending)return pending as Promise<T>
 const workspace=activeWorkspaceId('')
 const request=fetch(url,{cache:'no-store',headers:{'X-Dashboard-Prefetch':'1',...(force?{'X-Dashboard-Revalidate':'1'}:{}),...(workspace?{'X-Workspace-Id':workspace}:{})}}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||'Request failed');return publish(url,body,key)}).finally(()=>requests.delete(key))
 requests.set(key,request);return request as Promise<T>
}
export function revalidateFeatureData(url:string){if(!isFeatureDataFresh(url))void fetchFeatureData(url).catch(()=>{})}
export function invalidateFeatureData(urlOrPrefix:string){const prefix=`${activeWorkspaceId('unscoped')}:${urlOrPrefix}`;for(const key of Array.from(values.keys()))if(key===prefix||key.startsWith(prefix))values.delete(key)}
export function subscribeFeatureData(url:string,listener:(value:any)=>void){const key=scoped(url);let set=listeners.get(key);if(!set){set=new Set();listeners.set(key,set)}set.add(listener);return()=>{set?.delete(listener);if(!set?.size)listeners.delete(key)}}
export function writeDashboardData<T=any>(url:string,value:T){return publish(url,value) as T}
export function updateDashboardData<T=any>(url:string,updater:(current:T|undefined)=>T){return publish(url,updater(readFeatureData<T>(url))) as T}

// Generic aliases keep feature screens backwards compatible while Overview and
// Inbox share the same workspace-scoped, byte-bounded request/cache layer.
export const readDashboardData=readFeatureData
export const fetchDashboardData=fetchFeatureData
export const invalidateDashboardData=invalidateFeatureData
export const subscribeDashboardData=subscribeFeatureData

export function featureRouteDataUrls(href:string){
 const path=href.split('?')[0]
 if(path==='/features'||path==='/features/store-settings'||path.startsWith('/features/stores/'))return['/api/storefront']
 if(path==='/features/services')return['/api/features/services','/api/integrations']
 if(path==='/features/offers')return['/api/features/services','/api/features/offers','/api/commerce/products']
 if(path==='/features/bookings')return['/api/features/services','/api/features/bookings','/api/features/offers']
 if(path==='/features/analytics')return['/api/features/analytics?days=30']
 if(path==='/features/events')return['/api/features/events']
 if(path==='/features/notifications')return['/api/features/notifications']
 if(path==='/features/commerce/catalogue')return['/api/commerce/products']
 if(path==='/features/commerce/orders')return['/api/commerce/orders']
 if(path==='/features/commerce/inventory')return['/api/commerce/inventory']
 return[]
}
export function prefetchFeatureRoute(href:string){for(const url of featureRouteDataUrls(href))void fetchFeatureData(url).catch(()=>{})}
export function dashboardRouteDataUrls(href:string){
 const path=href.split('?')[0]
 if(path==='/overview')return['/api/dashboard/overview']
 if(path==='/inbox'){const workspace=activeWorkspaceId('');return workspace?[`/api/inbox?client_id=${encodeURIComponent(workspace)}`]:[]}
 if(path==='/campaigns/all')return['/api/campaigns']
 if(path==='/campaigns/create')return['/api/integrations']
 if(path==='/campaigns/journeys')return['/api/campaigns/journeys']
 if(path==='/campaigns/whatsapp/templates')return['/api/whatsapp/options','/api/whatsapp/templates']
 if(path==='/campaigns/whatsapp')return['/api/whatsapp/campaigns']
 if(path==='/campaigns/email')return['/api/email/campaigns']
 if(path==='/campaigns/coupons')return['/api/settings/coupons']
 if(path==='/campaigns/crm')return['/api/contacts']
 if(path==='/bots/all'){const workspace=activeWorkspaceId('');return workspace?[`/api/bots?client_id=${encodeURIComponent(workspace)}`]:[]}
 if(path==='/bots/emails'){const workspace=activeWorkspaceId('');return workspace?[`/api/bots/emails?client_id=${encodeURIComponent(workspace)}&status=draft_pending`,`/api/bots?client_id=${encodeURIComponent(workspace)}`]:[]}
 if(path==='/bots/triggers'){const workspace=activeWorkspaceId('');return workspace?[`/api/bots/triggers?client_id=${encodeURIComponent(workspace)}`,`/api/bots?client_id=${encodeURIComponent(workspace)}`]:[]}
 if(path==='/bots/triggers/analytics'){const workspace=activeWorkspaceId('');return workspace?[`/api/bots/triggers/analytics?client_id=${encodeURIComponent(workspace)}&days=30`]:[]}
 const botMatch=path.match(/^\/bots\/([^/]+)\/(edit|analytics|flow)$/)
 if(botMatch){
  const [,botId,section]=botMatch
  if(section==='analytics')return[`/api/bots/${encodeURIComponent(botId)}/analytics?days=30`]
  return[`/api/bots/${encodeURIComponent(botId)}`]
 }
 return featureRouteDataUrls(href)
}
export function prefetchDashboardRoute(href:string){for(const url of dashboardRouteDataUrls(href))void fetchFeatureData(url).catch(()=>{})}
