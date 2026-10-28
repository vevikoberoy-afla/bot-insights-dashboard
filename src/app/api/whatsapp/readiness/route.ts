import {NextRequest,NextResponse} from 'next/server'
import {requireWorkspace,saasError,SaaSError} from '@/lib/saas/context'
import {supabase} from '@/lib/supabase'
import {listMetaTemplates,resolveWhatsAppConnection} from '@/lib/whatsappCampaign'

type Check={key:string;label:string;ok:boolean;detail:string}

export async function GET(req:NextRequest){try{
 const ctx=await requireWorkspace(null,'campaigns'),botId=String(req.nextUrl.searchParams.get('botId')||'')
 if(!botId)throw new SaaSError('INVALID_INPUT','Choose a bot.',400)
 const bot=(await supabase.from('bots').select('id').eq('id',botId).eq('client_id',ctx.workspaceId).maybeSingle()).data
 if(!bot)throw new SaaSError('NOT_FOUND','Bot not found.',404)
 const connection=await resolveWhatsAppConnection(ctx.workspaceId,botId)
 const origin=String(process.env.NEXT_PUBLIC_APP_URL||'')
 const checks:Check[]=[
  {key:'meta_connection',label:'Meta WhatsApp connection',ok:!!connection,detail:connection?'Phone number and WABA credentials are configured.':'Connect this bot to an active WhatsApp Business number.'},
  {key:'public_origin',label:'Public HTTPS origin',ok:origin.startsWith('https://'),detail:origin.startsWith('https://')?'CTA tracking and webhooks have a public HTTPS origin.':'Set NEXT_PUBLIC_APP_URL to the deployed HTTPS origin.'},
  {key:'webhook_security',label:'Webhook verification',ok:!!process.env.WHATSAPP_VERIFY_TOKEN&&!!process.env.META_APP_SECRET,detail:'Requires WHATSAPP_VERIFY_TOKEN and META_APP_SECRET.'},
  {key:'queue',label:'QStash worker queue',ok:!!process.env.QSTASH_TOKEN&&!!process.env.QSTASH_CURRENT_SIGNING_KEY&&!!process.env.QSTASH_NEXT_SIGNING_KEY,detail:'Requires token plus current and next signing keys.'},
  {key:'redis',label:'Redis campaign state',ok:!!process.env.UPSTASH_REDIS_REST_URL&&!!process.env.UPSTASH_REDIS_REST_TOKEN,detail:'Requires Upstash Redis REST URL and token.'},
  {key:'worker_auth',label:'Worker authentication',ok:!!process.env.WHATSAPP_WORKER_SECRET,detail:'Requires WHATSAPP_WORKER_SECRET.'},
  {key:'click_signing',label:'CTA signature secret',ok:!!process.env.WHATSAPP_CLICK_SIGNING_SECRET,detail:'Requires a dedicated WHATSAPP_CLICK_SIGNING_SECRET.'},
 ]
 const [storage,media]=await Promise.all([supabase.from('whatsapp_phone_health').select('phone_number_id,messaging_limit_tier,max_daily_recipients,status').eq('client_id',ctx.workspaceId).eq('phone_number_id',connection?.phoneNumberId||'').maybeSingle(),supabase.from('whatsapp_media_cache').select('id').eq('client_id',ctx.workspaceId).limit(1)])
 checks.push({key:'storage',label:'WhatsApp V2 database migration',ok:!storage.error&&!media.error,detail:storage.error||media.error?'Apply migrations 078 and 079.':'Consent scopes, tier capacity, media cache, click, and service-window storage are available.'})
 let live:null|{ok:boolean;detail:string}=null
 if(req.nextUrl.searchParams.get('live')==='1'){
  if(!connection)live={ok:false,detail:'Meta credentials are not configured.'}
  else try{await listMetaTemplates(connection);live={ok:true,detail:'Meta accepted the configured WABA access token.'}}catch(error:any){live={ok:false,detail:String(error?.message||'Meta connection failed.').slice(0,240)}
  }
 }
 return NextResponse.json({ready:checks.every(check=>check.ok)&&live?.ok!==false,checks,live,phoneHealth:storage.data||null})
 }catch(error){return saasError(error)}}
