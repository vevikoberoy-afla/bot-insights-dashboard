import { after, NextRequest } from 'next/server'
import { randomUUID } from 'node:crypto'
import { supabase } from '@/lib/supabase'
import { redis } from '@/lib/redis'
import { findOrCreateContact, createConversation } from '@/lib/chatwoot'
import { upsertCustomerContact } from '@/lib/customerContacts'
import { issueWidgetSessionToken } from '@/lib/security/widgetSessionToken'
import { botRuntimeContext, BOT_RUNTIME_COLUMNS } from '@/lib/chat/bootstrap'

export async function POST(req: NextRequest) {
  const started = performance.now()
  try {
    const { botId, visitorName, visitorEmail, sessionId: incoming } = await req.json()
    if (typeof botId !== 'string' || !/^[0-9a-f-]{36}$/i.test(botId)) return Response.json({error:'Invalid bot'}, {status:400})
    const sessionId = incoming || `widget_${randomUUID()}`
    if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9_-]{8,200}$/.test(sessionId)) return Response.json({error:'Invalid session'}, {status:400})
    if ((visitorName != null && (typeof visitorName !== 'string' || visitorName.length > 150)) ||
        (visitorEmail != null && (typeof visitorEmail !== 'string' || visitorEmail.length > 320))) return Response.json({error:'Invalid visitor details'}, {status:400})
    let initialized: any = null
    let initPath = 'compatibility'
    if (!visitorName && !visitorEmail) {
      const result = await supabase.rpc('init_widget_session_atomic', {p_bot_id:botId,p_session_id:sessionId})
      if (!result.error) { initialized=result.data; initPath='atomic' }
      else if (!['42883','PGRST202'].includes(result.error.code)) throw new Error('Session initialization failed')
    }
    if (initialized?.error === 'BOT_NOT_FOUND') return Response.json({error:'Bot not found'}, {status:404})
    if (!initialized) {
      // Rolling deployment fallback. Rich visitor identity uses the existing stitcher.
      const [botResult, existingResult] = await Promise.all([
        supabase.from('bots').select(`${BOT_RUNTIME_COLUMNS},chatwoot_inbox_id,clients(context_id)`).eq('id',botId).maybeSingle(),
        supabase.from('sessions').select('id,session_id,client_id,bot_id,contact_id,chatwoot_conversation_id').eq('session_id',sessionId).maybeSingle(),
      ])
      if (botResult.error || existingResult.error) throw new Error('Session lookup unavailable')
      const bot: any = botResult.data, existing = existingResult.data
      if (!bot) return Response.json({error:'Bot not found'}, {status:404})
      if (existing && (existing.client_id !== bot.client_id || existing.bot_id !== botId)) return Response.json({error:'Invalid session scope'}, {status:403})
      const contact = await upsertCustomerContact({clientId:bot.client_id,botId,sessionId,name:visitorName,email:visitorEmail,source:'widget_form',channel:'web',allowAnonymous:true})
      let session: any = existing
      if (!session) {
        const inserted = await supabase.from('sessions').insert({client_id:bot.client_id,bot_id:botId,session_id:sessionId,contact_id:contact.id,mode:'ai',channel:'widget'}).select('*').single()
        if (inserted.error || !inserted.data) throw new Error('Session could not be persisted')
        session = inserted.data
      }
      initialized={bot,contact,session,client_id:bot.client_id,context_id:bot.clients?.context_id||null,is_new_session:!existing}
    }
    const {bot,contact,session} = initialized
    if (!session?.id) throw new Error('Session could not be persisted')
    const capability = issueWidgetSessionToken({workspaceId:initialized.client_id,contextId:initialized.context_id,botId,sessionId})
    after(async () => {
      const pipeline = redis.pipeline()
      const client = {id:initialized.client_id,context_id:initialized.context_id}
      for (const alias of new Set([botId,initialized.context_id,initialized.client_id].filter(Boolean))) pipeline.set(`client_ctx:${alias}`,client,{ex:3600})
      pipeline.set(`bot_ctx:${botId}`,botRuntimeContext(bot),{ex:3600})
      pipeline.set(`sess_contact:${sessionId}`,{id:contact.id,name:contact.name,email:contact.email,phone:contact.phone,hydrated:true},{ex:3600})
      await Promise.allSettled([
        pipeline.exec(),
        (async () => {
          if (!bot.chatwoot_inbox_id || session.chatwoot_conversation_id) return
          const external = await findOrCreateContact({name:visitorName || 'Website Visitor',email:visitorEmail})
          const conversation = await createConversation({inbox_id:bot.chatwoot_inbox_id,contact_id:external.id,status:'pending'})
          const update = await supabase.from('sessions').update({chatwoot_conversation_id:conversation.id,chatwoot_contact_id:external.id}).eq('id',session.id).eq('client_id',initialized.client_id).is('chatwoot_conversation_id',null)
          if (update.error) throw update.error
        })(),
      ]).then(results => { for (const result of results) if(result.status==='rejected') console.warn('[chat init] background provisioning failed') })
    })
    return Response.json({sessionId:session.session_id,sessionToken:capability.token,sessionTokenExpiresAt:capability.expiresAt,status:'ready',isNewSession:initialized.is_new_session},
      {headers:{'Server-Timing':`init_${initPath};dur=${Math.round(performance.now()-started)}`,'Cache-Control':'no-store'}})
  } catch {
    return Response.json({error:'Chat session is temporarily unavailable'}, {status:503})
  }
}
