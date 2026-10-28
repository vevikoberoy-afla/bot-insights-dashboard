import {randomUUID} from 'crypto'
import {NextRequest,NextResponse} from 'next/server'
import {getAuthenticatedWorkspaceUser} from '@/lib/requestAuth'
import {supabase} from '@/lib/supabase'
import {resolveSmtpCredentials,sendEmailReply} from '@/lib/email'
import {resolveWhatsAppConnection} from '@/lib/whatsappCampaign'
import {sendWhatsAppMessage} from '@/lib/whatsapp'
import {featureAllowed,getEffectiveEntitlements} from '@/lib/saas/entitlements'

const email=/^[^\s,;<>@]+@[^\s,;<>@]+\.[^\s,;<>@]+$/

async function context(req:NextRequest){return getAuthenticatedWorkspaceUser(req,'contacts',req.method!=='GET')}
async function effectiveConsent(contact:any){
 const result=await supabase.from('consent_log').select('channel,opted_in,created_at').eq('contact_id',contact.id).in('channel',['email','whatsapp']).order('created_at',{ascending:false}).limit(20)
 const latest=new Map<string,boolean>()
 for(const row of result.error?[]:(result.data||[]))if(!latest.has(row.channel))latest.set(row.channel,row.opted_in===true)
 return{email:latest.get('email')??contact.opt_in_email===true,whatsappUtility:latest.get('whatsapp')??contact.opt_in_whatsapp_utility===true}
}

export async function GET(req:NextRequest,props:{params:Promise<{id:string}>}){const user=await context(req);if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});const{id}=await props.params
 const [contact,entitlements]=await Promise.all([supabase.from('contacts').select('id,name,email,phone,phone_e164,opt_in_email,opt_in_whatsapp_utility,whatsapp_service_window_until').eq('id',id).eq('client_id',user.workspaceId).maybeSingle(),getEffectiveEntitlements(user.workspaceId)]);if(contact.error)return NextResponse.json({error:contact.error.message},{status:500});if(!contact.data)return NextResponse.json({error:'Contact not found'},{status:404})
 const[bots,history,consent]=await Promise.all([supabase.from('bots').select('id,name,status').eq('client_id',user.workspaceId).neq('status','archived').order('name'),supabase.from('contact_communications').select('*').eq('client_id',user.workspaceId).eq('contact_id',id).order('created_at',{ascending:false}).limit(100),effectiveConsent(contact.data)])
 const options=await Promise.all((bots.data||[]).map(async bot=>({id:bot.id,name:bot.name,emailConfigured:!!await resolveSmtpCredentials(user.workspaceId,bot.id),whatsappConfigured:!!await resolveWhatsAppConnection(user.workspaceId,bot.id)})))
 return NextResponse.json({contact:contact.data,bots:options,history:history.error?[]:history.data||[],messagingEnabled:featureAllowed(entitlements,'contacts.messaging.enabled'),consent,whatsappWindowOpen:Boolean(contact.data.whatsapp_service_window_until&&Date.parse(contact.data.whatsapp_service_window_until)>Date.now())},{headers:{'Cache-Control':'private, no-store'}})
}

export async function POST(req:NextRequest,props:{params:Promise<{id:string}>}){const user=await context(req);if(!user)return NextResponse.json({error:'Unauthorized'},{status:401});const{id}=await props.params
 try{const body=await req.json(),channel=String(body.channel||''),botId=String(body.botId||''),text=String(body.body||'').trim().slice(0,10000),subject=String(body.subject||'').trim().slice(0,300)
  if(!['email','whatsapp'].includes(channel)||!text)return NextResponse.json({error:'Choose email or WhatsApp and enter a message.'},{status:400})
  const entitlements=await getEffectiveEntitlements(user.workspaceId)
  if(!featureAllowed(entitlements,'contacts.messaging.enabled'))return NextResponse.json({error:'Direct customer messaging is disabled for this workspace. Ask the platform administrator to enable it.'},{status:403})
  const contact=(await supabase.from('contacts').select('*').eq('id',id).eq('client_id',user.workspaceId).maybeSingle()).data;if(!contact)return NextResponse.json({error:'Contact not found'},{status:404})
  const consent=await effectiveConsent(contact)
  if(botId){const bot=(await supabase.from('bots').select('id').eq('id',botId).eq('client_id',user.workspaceId).maybeSingle()).data;if(!bot)return NextResponse.json({error:'Choose a bot from this workspace.'},{status:400})}
  const record=await supabase.from('contact_communications').insert({client_id:user.workspaceId,contact_id:id,bot_id:botId||null,actor_user_id:user.id,channel,subject:channel==='email'?subject:null,body:text,status:'sending'}).select('id').single();if(record.error)throw record.error
  let outcome:{success:boolean;messageId?:string;error?:string}
  if(channel==='email'){
   if(!email.test(String(contact.email||'')))outcome={success:false,error:'This contact does not have a valid email address.'}
   else if(!consent.email)outcome={success:false,error:'This contact has not consented to email.'}
   else if(!subject)outcome={success:false,error:'An email subject is required.'}
   else{const suppressed=(await supabase.from('email_suppressions').select('email').eq('client_id',user.workspaceId).ilike('email',contact.email).maybeSingle()).data,credentials=await resolveSmtpCredentials(user.workspaceId,botId||null);outcome=suppressed?{success:false,error:'This email address is suppressed.'}:!credentials?{success:false,error:'Connect an email inbox to the selected bot first.'}:await sendEmailReply(credentials,{operationId:`contact:${record.data.id}`,category:'transactional',to:contact.email,subject,body:text,isReply:false})}
  }else{
   const phone=String(contact.phone_e164||contact.phone||'').replace(/\D/g,''),windowOpen=Boolean(contact.whatsapp_service_window_until&&Date.parse(contact.whatsapp_service_window_until)>Date.now())
   if(!phone)outcome={success:false,error:'This contact does not have a valid WhatsApp number.'}
   else if(!consent.whatsappUtility)outcome={success:false,error:'This contact has not consented to WhatsApp utility messages.'}
   else if(!windowOpen)outcome={success:false,error:'The 24-hour WhatsApp service window is closed. Start a template campaign to contact this customer.'}
   else if(!botId)outcome={success:false,error:'Choose a WhatsApp-connected bot.'}
   else{const connection=await resolveWhatsAppConnection(user.workspaceId,botId);outcome=!connection?{success:false,error:'Connect WhatsApp to the selected bot first.'}:await sendWhatsAppMessage(connection.phoneNumberId,connection.accessToken,phone,text)}
  }
  await supabase.from('contact_communications').update({status:outcome.success?'sent':'failed',provider_message_id:outcome.messageId||null,error:outcome.error||null,sent_at:outcome.success?new Date().toISOString():null}).eq('id',record.data.id).eq('client_id',user.workspaceId)
  if(!outcome.success)return NextResponse.json({error:outcome.error},{status:400})
  return NextResponse.json({success:true,id:record.data.id,messageId:outcome.messageId||randomUUID()})
 }catch(error:any){return NextResponse.json({error:error.message||'Message could not be sent.'},{status:500})}
}
