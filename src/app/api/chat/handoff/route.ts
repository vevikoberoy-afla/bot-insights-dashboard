import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { triggerHandoff, addLabel } from '@/lib/chatwoot'
import { redis } from '@/lib/redis'
import { isUUID } from '@/lib/utils'
import { verifyWidgetSessionToken } from '@/lib/security/widgetSessionToken'


export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const sessionId = body.sessionId || body.session_id
    const botId = body.botId || body.bot_id

    if (!sessionId || !botId) {
      return Response.json({ error: 'sessionId and botId required' }, { status: 400 })
    }

    try {
      const claims = verifyWidgetSessionToken(req.headers.get('x-widget-session-token') || '', 'widget')
      if (claims.sessionId !== sessionId || claims.botId !== botId) throw new Error('HANDOFF_SCOPE_MISMATCH')
    } catch {
      return Response.json({ error: 'Chat session expired.' }, { status: 401 })
    }

    const { data: bot } = await supabase.from('bots').select('id, client_id').eq('id', botId).maybeSingle()
    if (!bot?.client_id) return Response.json({ error: 'Bot not found' }, { status: 404 })

    // 1. Get session with Chatwoot conversation ID
    let sessionQuery = supabase
      .from('sessions')
      .select('*, contacts(*)')
      .eq('bot_id', botId)
    sessionQuery = isUUID(sessionId)
      ? sessionQuery.or(`id.eq.${sessionId},session_id.eq.${sessionId}`)
      : sessionQuery.eq('session_id', sessionId)
    let { data: session, error } = await sessionQuery.maybeSingle()

    // Handoff can be the visitor's first action, before a normal chat request
    // has created the durable session.
    if (!session && !error) {
      const created = await supabase.from('sessions').insert({
        session_id: sessionId,
        client_id: bot.client_id,
        bot_id: botId,
        channel: 'web',
        mode: 'waiting',
      }).select('*, contacts(*)').single()
      session = created.data
      error = created.error
    }
    if (error || !session) return Response.json({ error: error?.message || 'Session could not be created' }, { status: 400 })

    // 2. Update session mode to 'waiting'
    await supabase
      .from('sessions')
      .update({ mode: 'waiting' })
      .eq('id', session.id)

    await Promise.all([
      redis.set(`session_mode:${session.session_id}`, 'waiting', { ex: 86400 }).catch(() => {}),
      redis.set(`session_mode:${session.id}`, 'waiting', { ex: 86400 }).catch(() => {}),
      redis.del(`inbox:convos:${bot.client_id}`).catch(() => {}),
    ])

    const { data: existingRequest } = await supabase.from('handoff_requests')
      .select('id').eq('session_id', session.session_id).eq('status', 'pending').limit(1).maybeSingle()
    if (!existingRequest) await supabase.from('handoff_requests').insert({
      session_id: session.session_id,
      client_id: bot.client_id,
      reason: String(body.reason || 'Customer requested a human agent').slice(0, 500),
      status: 'pending',
    })

    // 3. Alert Chatwoot agents
    if (session.chatwoot_conversation_id) {
      try {
        await triggerHandoff(session.chatwoot_conversation_id)
        await addLabel(session.chatwoot_conversation_id, 'needs-human')
      } catch (chatwootError) {
        console.error('[Handoff] Chatwoot alert failed:', chatwootError)
      }
    }



    return Response.json({ status: 'waiting', session_id: session.session_id, message: 'Human agent alerted' })

  } catch (error) {
    console.error('[Handoff] Error:', error)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}
