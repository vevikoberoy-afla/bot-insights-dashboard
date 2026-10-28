import {NextRequest,NextResponse} from 'next/server'
import {getAuthenticatedWorkspaceUser} from '@/lib/requestAuth'
import {supabase} from '@/lib/supabase'

const categories=['mine','tickets','orders'] as const
const defaults={dnd_until:null,quiet_hours_enabled:false,quiet_hours_start:'20:00',quiet_hours_end:'08:00',timezone:'Asia/Kolkata',toast_position:'top-right',toast_duration_ms:5000,sound_enabled:true,browser_push_enabled:false,event_matrix:{'message.received':{in_app:true,toast:true,sound:true},'ticket.raised':{in_app:true,toast:true,sound:false},'ticket.assigned':{in_app:true,toast:true,sound:true},'ticket.sla_breached':{in_app:true,toast:true,sound:true},'booking.created':{in_app:true,toast:true,sound:true},'order.created':{in_app:true,toast:true,sound:true}}}
const response=(body:any,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}})
const category=(value:string|null)=>categories.includes(value as any)?value as typeof categories[number]:'mine'
const cursorEncode=(item:any)=>Buffer.from(JSON.stringify([item.created_at,item.id])).toString('base64url')
const cursorDecode=(value:string|null)=>{try{const [created,id]=JSON.parse(Buffer.from(value||'','base64url').toString()),validDate=typeof created==='string'&&Number.isFinite(Date.parse(created)),validId=typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);return validDate&&validId?{created:new Date(created).toISOString(),id}:null}catch{return null}}

export async function GET(req:NextRequest){
 const user=await getAuthenticatedWorkspaceUser(req)
 if(!user)return response({error:'Access denied'},403)
 const view=req.nextUrl.searchParams.get('view')
 if(view==='counts'){
  const results=await Promise.all(categories.map(name=>supabase.from('in_app_notifications').select('id',{count:'exact',head:true}).eq('client_id',user.workspaceId).eq('recipient_id',user.id).eq('category',name).eq('is_read',false).or(`snoozed_until.is.null,snoozed_until.lte.${new Date().toISOString()}`)))
  const error=results.find(item=>item.error)?.error
  if(error)return response({error:error.message},500)
  return response(Object.fromEntries(categories.map((name,index)=>[name,results[index].count||0])))
 }
 if(view==='settings'){
  const {data,error}=await supabase.from('user_notification_settings').select('*').eq('client_id',user.workspaceId).eq('user_id',user.id).maybeSingle()
  if(error)return response({error:error.message},500)
  return response(data||{...defaults,client_id:user.workspaceId,user_id:user.id})
 }
 const selected=category(req.nextUrl.searchParams.get('category')),unread=req.nextUrl.searchParams.get('unread')==='true',limit=Math.min(30,Math.max(1,Number(req.nextUrl.searchParams.get('limit'))||15)),cursor=cursorDecode(req.nextUrl.searchParams.get('cursor'))
 let query=supabase.from('in_app_notifications').select('id,category,event_type,title,body,entity_type,entity_id,action_url,metadata,rollup_count,is_read,read_at,snoozed_until,created_at').eq('client_id',user.workspaceId).eq('recipient_id',user.id).eq('category',selected).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(limit+1)
 if(unread)query=query.eq('is_read',false)
 if(cursor)query=query.or(`created_at.lt.${cursor.created},and(created_at.eq.${cursor.created},id.lt.${cursor.id})`)
 const {data,error}=await query
 if(error)return response({error:error.message},500)
 const rows=data||[],hasMore=rows.length>limit,items=rows.slice(0,limit)
 return response({items,nextCursor:hasMore?cursorEncode(items[items.length-1]):null})
}

export async function PUT(req:NextRequest){
 const user=await getAuthenticatedWorkspaceUser(req)
 if(!user)return response({error:'Access denied'},403)
 try{
  const body=await req.json(),duration=[0,3000,5000,10000].includes(Number(body.toast_duration_ms))?Number(body.toast_duration_ms):5000,position=body.toast_position==='bottom-right'?'bottom-right':'top-right',time=(value:any,fallback:string)=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||''))?String(value):fallback,eventMatrix=body.event_matrix&&typeof body.event_matrix==='object'&&JSON.stringify(body.event_matrix).length<12000?body.event_matrix:defaults.event_matrix
  const input={client_id:user.workspaceId,user_id:user.id,dnd_until:body.dnd_until?new Date(body.dnd_until).toISOString():null,quiet_hours_enabled:body.quiet_hours_enabled===true,quiet_hours_start:time(body.quiet_hours_start,'20:00'),quiet_hours_end:time(body.quiet_hours_end,'08:00'),timezone:String(body.timezone||'Asia/Kolkata').slice(0,64),toast_position:position,toast_duration_ms:duration,sound_enabled:body.sound_enabled!==false,browser_push_enabled:body.browser_push_enabled===true,event_matrix:eventMatrix,updated_at:new Date().toISOString()}
  const {data,error}=await supabase.from('user_notification_settings').upsert(input,{onConflict:'client_id,user_id'}).select('*').single()
  if(error)throw error
  return response(data)
 }catch(error:any){return response({error:error.message||'Invalid notification settings'},400)}
}

export async function PATCH(req:NextRequest){
 const user=await getAuthenticatedWorkspaceUser(req)
 if(!user)return response({error:'Access denied'},403)
 try{
  const body=await req.json(),action=String(body.action||'read')
  if(action==='read_all'){
   let query=supabase.from('in_app_notifications').update({is_read:true,read_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('client_id',user.workspaceId).eq('recipient_id',user.id).eq('is_read',false)
   if(categories.includes(body.category))query=query.eq('category',body.category)
   const {error}=await query;if(error)throw error
   return response({ok:true})
  }
  const id=String(body.id||'')
  if(!/^[0-9a-f-]{36}$/i.test(id))return response({error:'Invalid notification'},400)
  const {data:item,error:itemError}=await supabase.from('in_app_notifications').select('*').eq('id',id).eq('client_id',user.workspaceId).eq('recipient_id',user.id).single()
  if(itemError||!item)return response({error:'Notification not found'},404)
  if(action==='snooze'){
   const minutes=Math.min(1440,Math.max(15,Number(body.minutes)||60)),until=new Date(Date.now()+minutes*60000).toISOString(),{error}=await supabase.from('in_app_notifications').update({snoozed_until:until,updated_at:new Date().toISOString()}).eq('id',id).eq('recipient_id',user.id)
   if(error)throw error;return response({ok:true,snoozed_until:until})
  }
  if(action==='claim_ticket'){
   const ticketUser=await getAuthenticatedWorkspaceUser(req,'tickets',true)
   if(!ticketUser)return response({error:'Ticket write access is required'},403)
   if(item.entity_type!=='ticket'||!item.entity_id)return response({error:'This notification is not a ticket'},400)
   const {error}=await supabase.from('tickets').update({assignee_id:user.id,updated_at:new Date().toISOString()}).eq('id',item.entity_id).eq('client_id',user.workspaceId).is('assignee_id',null)
   if(error)throw error
  }
  const {error}=await supabase.from('in_app_notifications').update({is_read:true,read_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',id).eq('recipient_id',user.id)
  if(error)throw error
  return response({ok:true})
 }catch(error:any){return response({error:error.message||'Notification update failed'},400)}
}
