import { supabase } from '@/lib/supabase'
import { safeOutboundFetch } from '@/lib/urlSecurity'
import { decryptConfigSecrets, encryptConfigSecrets } from '@/lib/security/secretVault'
const checked=(r:any)=>{if(r.error)throw new Error(r.error.message);return r.data}

type Integration={id:string;channel:string;config:any}
async function integrationFor(service:any):Promise<Integration|null>{if(!service.integration_id)return null;const row=checked(await supabase.from('channel_integrations').select('id,channel,config,status').eq('id',service.integration_id).eq('client_id',service.client_id).eq('status','active').maybeSingle());return row?{...row,config:{...decryptConfigSecrets(service.client_id,row.config),_workspace_id:service.client_id}}:null}
async function googleToken(config:any){
 if(config.access_token&&(!config.token_expires_at||Date.parse(config.token_expires_at)>Date.now()+60000))return config.access_token
 if(!config.refresh_token||!config.client_id||!config.client_secret)throw new Error('Reconnect Google Calendar')
 const body=new URLSearchParams({client_id:config.client_id,client_secret:config.client_secret,refresh_token:config.refresh_token,grant_type:'refresh_token'})
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(10000)}),d=await r.json();if(!r.ok)throw new Error(d.error_description||'Google token refresh failed')
 config={...config,access_token:d.access_token,token_expires_at:new Date(Date.now()+d.expires_in*1000).toISOString()};const {_workspace_id,...stored}=config;await supabase.from('channel_integrations').update({config:encryptConfigSecrets(_workspace_id,stored),updated_at:new Date().toISOString()}).eq('id',config.integration_id||'__never__')
 return d.access_token
}
async function json(r:Response,label:string){const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.error?.message||`${label} returned ${r.status}`);return d}
export async function externalAvailableStarts(service:any,date:string):Promise<Set<string>|null>{
 const i=await integrationFor(service);if(!i)return null;const c={...i.config,integration_id:i.id},start=new Date(date+'T00:00:00Z'),end=new Date(start.getTime()+36*3600000)
 if(i.channel==='google_calendar'){
  const token=await googleToken(c),r=await fetch('https://www.googleapis.com/calendar/v3/freeBusy',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({timeMin:start.toISOString(),timeMax:end.toISOString(),timeZone:service.timezone,items:[{id:service.external_calendar_id||c.calendar_id||'primary'}]}),signal:AbortSignal.timeout(10000)}),d=await json(r,'Google Calendar')
  const busy=d.calendars?.[service.external_calendar_id||c.calendar_id||'primary']?.busy||[];return new Set<string>(['*',...busy.map((x:any)=>`${x.start}|${x.end}`)])
 }
 if(i.channel==='calendly'){
  const event=service.external_event_type_id||c.event_type_uri;if(!event)throw new Error('Set the Calendly event type URI on the booking service')
  const u=new URL('https://api.calendly.com/event_type_available_times');u.searchParams.set('event_type',event);u.searchParams.set('start_time',start.toISOString());u.searchParams.set('end_time',new Date(Math.min(end.getTime(),start.getTime()+7*86400000)).toISOString())
  const d=await json(await fetch(u,{headers:{Authorization:`Bearer ${c.access_token}`},signal:AbortSignal.timeout(10000)}),'Calendly');return new Set((d.collection||[]).map((x:any)=>new Date(x.start_time).toISOString()))
 }
 if(i.channel==='acuity'){
  const u=new URL('https://acuityscheduling.com/api/v1/availability/times');u.searchParams.set('date',date);u.searchParams.set('appointmentTypeID',service.external_event_type_id||c.appointment_type_id);if(service.external_calendar_id||c.calendar_id)u.searchParams.set('calendarID',service.external_calendar_id||c.calendar_id)
  const auth=Buffer.from(`${c.user_id}:${c.api_key}`).toString('base64'),d=await json(await fetch(u,{headers:{Authorization:`Basic ${auth}`},signal:AbortSignal.timeout(10000)}),'Acuity');return new Set((d||[]).map((x:any)=>new Date(x.time).toISOString()))
 }
 if(i.channel==='custom_calendar'){
  const u=new URL('/availability',c.base_url);u.searchParams.set('date',date);u.searchParams.set('service_id',service.external_event_type_id||service.id)
  const d=await json(await safeOutboundFetch(u,{headers:{Authorization:c.auth_header||'',Accept:'application/json'},signal:AbortSignal.timeout(10000)}),'Calendar');return new Set((d.slots||d||[]).map((x:any)=>new Date(typeof x==='string'?x:x.start).toISOString()))
 }
 return null
}
export function providerAllows(start:string,end:string,external:Set<string>|null){if(!external)return true;if(external.has('*')){for(const x of Array.from(external)){if(x==='*')continue;const [a,b]=x.split('|');if(Date.parse(a)<Date.parse(end)&&Date.parse(b)>Date.parse(start))return false}return true}return external.has(new Date(start).toISOString())}
export async function createExternalEvent(service:any,booking:any){
 const i=await integrationFor(service);if(!i)return null;const c={...i.config,integration_id:i.id},body={name:booking.customer_name,email:booking.customer_email,start:booking.slot_start,end:booking.slot_end,reference:booking.reference}
 if(i.channel==='google_calendar'){const token=await googleToken(c),calendar=service.external_calendar_id||c.calendar_id||'primary',d=await json(await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar)}/events?sendUpdates=all`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({summary:`Booking ${booking.reference}`,description:`Customer: ${booking.customer_name}\nReference: ${booking.reference}`,start:{dateTime:booking.slot_start,timeZone:service.timezone},end:{dateTime:booking.slot_end,timeZone:service.timezone},attendees:[{email:booking.customer_email}]}),signal:AbortSignal.timeout(12000)}),'Google Calendar');return{id:d.id,url:d.htmlLink}}
 if(i.channel==='calendly'){const d=await json(await fetch('https://api.calendly.com/invitees',{method:'POST',headers:{Authorization:`Bearer ${c.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({event_type:service.external_event_type_id||c.event_type_uri,start_time:booking.slot_start,invitee:{name:booking.customer_name,email:booking.customer_email,timezone:service.timezone}}),signal:AbortSignal.timeout(12000)}),'Calendly');return{id:d.resource?.uri||d.uri,url:d.resource?.reschedule_url||d.reschedule_url}}
 if(i.channel==='acuity'){const auth=Buffer.from(`${c.user_id}:${c.api_key}`).toString('base64'),d=await json(await fetch('https://acuityscheduling.com/api/v1/appointments',{method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({appointmentTypeID:service.external_event_type_id||c.appointment_type_id,calendarID:service.external_calendar_id||c.calendar_id||'',datetime:booking.slot_start,firstName:booking.customer_name,lastName:'',email:booking.customer_email}),signal:AbortSignal.timeout(12000)}),'Acuity');return{id:String(d.id),url:d.confirmationPage}}
 if(i.channel==='custom_calendar'){const d=await json(await safeOutboundFetch(new URL('/bookings',c.base_url),{method:'POST',headers:{Authorization:c.auth_header||'','Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(12000)}),'Calendar');return{id:String(d.id),url:d.manage_url}}
 return null
}
export async function updateExternalEvent(service:any,booking:any,action:'cancel'|'reschedule',start?:string,end?:string){
 const i=await integrationFor(service);if(!i||!booking.external_event_id)return
 const c={...i.config,integration_id:i.id}
 if(i.channel==='calendly')throw new Error(`Use the Calendly management link to ${action}: ${booking.external_manage_url||'link unavailable'}`)
 if(i.channel==='google_calendar'){const token=await googleToken(c),calendar=service.external_calendar_id||c.calendar_id||'primary',url=`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar)}/events/${encodeURIComponent(booking.external_event_id)}?sendUpdates=all`;await json(await fetch(url,{method:action==='cancel'?'DELETE':'PATCH',headers:{Authorization:`Bearer ${token}`,...(action==='reschedule'?{'Content-Type':'application/json'}:{})},body:action==='reschedule'?JSON.stringify({start:{dateTime:start,timeZone:service.timezone},end:{dateTime:end,timeZone:service.timezone}}):undefined,signal:AbortSignal.timeout(12000)}),'Google Calendar');return}
 if(i.channel==='acuity'){const auth=Buffer.from(`${c.user_id}:${c.api_key}`).toString('base64'),url=`https://acuityscheduling.com/api/v1/appointments/${booking.external_event_id}${action==='cancel'?'/cancel':''}`;await json(await fetch(url,{method:action==='cancel'?'PUT':'PUT',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},body:action==='reschedule'?new URLSearchParams({datetime:start!}):undefined,signal:AbortSignal.timeout(12000)}),'Acuity');return}
 if(i.channel==='custom_calendar'){await json(await safeOutboundFetch(new URL(`/bookings/${encodeURIComponent(booking.external_event_id)}`,c.base_url),{method:'PATCH',headers:{Authorization:c.auth_header||'','Content-Type':'application/json'},body:JSON.stringify({action,start,end}),signal:AbortSignal.timeout(12000)}),'Calendar')}
}
