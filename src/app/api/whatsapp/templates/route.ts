import {NextRequest,NextResponse} from 'next/server'
import {requireWorkspace,saasError,SaaSError} from '@/lib/saas/context'
import {supabase} from '@/lib/supabase'
import {listMetaTemplates,resolveWhatsAppConnection,submitMetaTemplate,toMetaTemplateComponents} from '@/lib/whatsappCampaign'
import {validateWhatsAppTemplate} from '@/types/bulkWhatsApp'

const status=(value:unknown)=>['PENDING','APPROVED','REJECTED','PAUSED','DISABLED','FLAGGED'].includes(String(value).toUpperCase())?String(value).toUpperCase():'PENDING'
export async function GET(req:NextRequest){try{const ctx=await requireWorkspace(null,'campaigns'),botId=String(req.nextUrl.searchParams.get('botId')||'');let query=supabase.from('whatsapp_templates').select('*').eq('client_id',ctx.workspaceId).order('updated_at',{ascending:false});if(botId)query=query.eq('bot_id',botId);const result=await query.limit(250);if(result.error)throw result.error;return NextResponse.json(result.data||[],{headers:{'Cache-Control':'private, max-age=10, stale-while-revalidate=30'}})}catch(error){return saasError(error)}}

export async function POST(req:NextRequest){try{
 const ctx=await requireWorkspace(null,'campaigns',true),body=await req.json(),botId=String(body.botId||''),action=body.action==='sync'?'sync':'create'
 const bot=(await supabase.from('bots').select('id').eq('id',botId).eq('client_id',ctx.workspaceId).maybeSingle()).data;if(!bot)throw new SaaSError('INVALID_INPUT','Choose a bot from this workspace.',400)
 const connection=await resolveWhatsAppConnection(ctx.workspaceId,botId);if(!connection)throw new SaaSError('WHATSAPP_NOT_CONFIGURED','Connect an active WhatsApp Business number to this bot first.',400)
 if(action==='sync'){
  const remote=await listMetaTemplates(connection)
  const existingResult=await supabase.from('whatsapp_templates').select('name,language,components_json').eq('client_id',ctx.workspaceId).eq('bot_id',botId)
  if(existingResult.error)throw existingResult.error
  const existing=new Map((existingResult.data||[]).map((item:any)=>[`${item.name}:${item.language}`,item.components_json||[]]))
  const rows=(remote.data||[]).map((item:any)=>{
   const components=item.components||[],local=existing.get(`${item.name}:${item.language}`) as any[]|undefined
   const localButtons=local?.find(component=>String(component.type).toUpperCase()==='BUTTONS')?.buttons||[]
   const merged=components.map((component:any)=>String(component.type).toUpperCase()!=='BUTTONS'?component:{...component,buttons:(component.buttons||[]).map((button:any,index:number)=>{
    const saved=localButtons[index]
    return button.type==='URL'&&saved?.type==='URL'&&saved.url&&!String(saved.url).includes('/api/track/whatsapp')?{...button,url:saved.url}:button
   })})
   return{client_id:ctx.workspaceId,bot_id:botId,waba_id:connection.wabaId,meta_template_id:String(item.id||''),name:String(item.name),language:String(item.language||'en_US'),category:String(item.category||'MARKETING'),status:status(item.status),components_json:merged,rejection_reason:item.rejected_reason||null,updated_at:new Date().toISOString()}
  })
  if(rows.length){const saved=await supabase.from('whatsapp_templates').upsert(rows,{onConflict:'bot_id,name,language'});if(saved.error)throw saved.error}
  return NextResponse.json({synced:rows.length})
 }
 let template;try{template=validateWhatsAppTemplate(body.template)}catch(error:any){throw new SaaSError('INVALID_INPUT',error.message,400)}
 const meta=await submitMetaTemplate(connection,template)
 const saved=await supabase.from('whatsapp_templates').upsert({client_id:ctx.workspaceId,bot_id:botId,waba_id:connection.wabaId,meta_template_id:String(meta.id||''),name:template.name,language:template.language,category:template.category,status:status(meta.status),components_json:toMetaTemplateComponents(template),rejection_reason:null,updated_at:new Date().toISOString()},{onConflict:'bot_id,name,language'}).select('*').single();if(saved.error)throw saved.error
 return NextResponse.json(saved.data,{status:201})
 }catch(error:any){if(!(error instanceof SaaSError)&&error?.details)error=new SaaSError('META_TEMPLATE_REJECTED',String(error.message||'Meta rejected the template.'),400);return saasError(error)}}
