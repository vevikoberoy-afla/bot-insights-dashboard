import { NextRequest, NextResponse } from 'next/server'
import { supabase, broadcastRealtime } from '@/lib/supabase'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { sendEmailReply, resolveSmtpCredentials } from '@/lib/email'
import { Redis } from '@upstash/redis'
import { isUUID } from '@/lib/utils'
import { writeMessage } from '@/lib/chat/writeMessage'
import {requireWorkspace} from '@/lib/saas/context'

export const dynamic = 'force-dynamic'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export async function GET(req: NextRequest, props: { params: Promise<{ sessionId: string }> }) {
  const params = await props.params;
  const { sessionId } = params
  const client_id = req.nextUrl.searchParams.get('client_id')
  const action = req.nextUrl.searchParams.get('action')

  try {
    const ctx=await requireWorkspace(client_id,'inbox')
    let sessionRow: any = null
    if (isUUID(sessionId)) {
      const { data } = await supabase
        .from('sessions')
        .select('id, session_id, client_id, mode, channel')
        .or(`session_id.eq.${sessionId},id.eq.${sessionId}`)
        .eq('client_id',ctx.workspaceId).maybeSingle()
      sessionRow = data
    } else {
      const { data } = await supabase
        .from('sessions')
        .select('id, session_id, client_id, mode, channel')
        .eq('session_id', sessionId)
        .eq('client_id',ctx.workspaceId).maybeSingle()
      sessionRow = data
    }

    const resolvedSessionId = sessionRow?.session_id || sessionId

    const idsToQuery = Array.from(new Set([
      sessionId,
      sessionRow?.session_id,
      sessionRow?.id,
    ].filter(Boolean)))

    const { data: messagesData, error: messagesError } = await supabase
      .from('messages')
      .select('id, session_id, role, content, source_url, media_url, media_type, media_size_bytes, message_type, metadata, created_at')
      .in('session_id', idsToQuery)
      .order('created_at', { ascending: true })

    if (messagesError) throw messagesError

    if (action === 'messages') {
      return NextResponse.json(messagesData || [])
    }

    if (sessionRow) {
      return NextResponse.json({
        ...sessionRow,
        session: sessionRow,
        messages: messagesData || []
      })
    }
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  } catch (err: any) {
    console.error('[/api/inbox/[sessionId] GET error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest, props: { params: Promise<{ sessionId: string }> }) {
  const params = await props.params;
  const { sessionId } = params
  const client_id = req.nextUrl.searchParams.get('client_id')

  try {
    const ctx=await requireWorkspace(client_id,'inbox',true)
    const body = await req.json()
    const { text, sender_name, agent_id } = body

    if (!text?.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 })

    let session: any = null
    if (isUUID(sessionId)) {
      const { data } = await supabase
        .from('sessions')
        .select('*, contacts(name, email), bots(name)')
        .or(`session_id.eq.${sessionId},id.eq.${sessionId}`)
        .eq('client_id',ctx.workspaceId).maybeSingle()
      session = data
    } else {
      const { data } = await supabase
        .from('sessions')
        .select('*, contacts(name, email), bots(name)')
        .eq('session_id', sessionId)
        .eq('client_id',ctx.workspaceId).maybeSingle()
      session = data
    }

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

    const resolvedSessionId = session.session_id || session.id
    const { data: client } = await supabase.from('clients').select('context_id').eq('id', client_id).maybeSingle()
    const contextId = client?.context_id || null

    const additionalAliases = [session.id, session.session_id, sessionId].filter(Boolean) as string[]

    // 1. Log message to Supabase & atomically update Redis caches + Realtime broadcast
    const message = await writeMessage({
      sessionId: resolvedSessionId,
      role: 'agent',
      content: text,
      mode: 'human',
      contextId,
      botId: session.bot_id || null,
      channel: session.channel,
      additionalSessionAliases: additionalAliases,
      clientId: client_id,
    })

    // 2. Set mode to human and update last_message_at on session
    await supabase.from('sessions').update({
      mode: 'human',
      assigned_agent_id: agent_id || session.assigned_agent_id,
      last_message_at: message.created_at
    }).eq('id', session.id)

    // 3. Deliver via WhatsApp if applicable
    if (session.channel === 'whatsapp') {
        const { data: channelCfg } = await supabase.from('bot_channels')
            .select('credentials, identifier').eq('bot_id', session.bot_id).eq('channel_type', 'whatsapp').single()
        if (channelCfg?.credentials?.access_token) {
            await sendWhatsAppMessage(channelCfg.identifier, channelCfg.credentials.access_token, session.visitor_name, text)
        }
    }

    // 4. Deliver via Email if applicable
    if (session.channel === 'email') {
      const recipientEmail = (session.contacts as any)?.email || session.visitor_name
      if (recipientEmail && recipientEmail.includes('@')) {
        const smtp = await resolveSmtpCredentials(ctx.workspaceId, session.bot_id)
        if (smtp) {
          await sendEmailReply(smtp, {
            to: recipientEmail,
            subject: 'Support Update',
            body: text,
            brandName: (session.bots as any)?.name || 'Support Team',
          })
        } else {
          console.warn('[Inbox Email Reply] No SMTP credentials found for client:', ctx.workspaceId)
        }
      }
    }

    // 5. Deliver via Telegram if applicable
    if (session.channel === 'telegram') {
      try {
        const tgChatId = resolvedSessionId.replace(/^tg_/, '')
        let botToken: string | null = null

        if (session.bot_id) {
          const { data: b } = await supabase
            .from('bots')
            .select('bot_flow')
            .eq('id', session.bot_id)
            .maybeSingle()

          if (b?.bot_flow?.integration_id) {
            const { data: integ } = await supabase
              .from('channel_integrations')
              .select('config')
              .eq('id', b.bot_flow.integration_id)
              .maybeSingle()
            botToken = integ?.config?.bot_token || null
          }
          if (!botToken && b?.bot_flow?.bot_token) {
            botToken = b.bot_flow.bot_token
          }
        }

        if (!botToken) {
          const { data: integ } = await supabase
            .from('channel_integrations')
            .select('config')
            .eq('channel', 'telegram')
            .eq('client_id', client_id)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          botToken = integ?.config?.bot_token || null
        }

        if (botToken) {
          await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: tgChatId, text }),
          })
        }
      } catch (tgErr) {
        console.error('[Inbox Telegram Reply Error]:', tgErr)
      }
    }

    return NextResponse.json(message, { status: 201 })
  } catch (err: any) {
    console.error('[/api/inbox/[sessionId] POST error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, props: { params: Promise<{ sessionId: string }> }) {
  const params = await props.params;
  const { sessionId } = params
  const client_id = req.nextUrl.searchParams.get('client_id')

  try {
    const body = await req.json()
    const action = body.action || (body.mode === 'human' ? 'takeover' : body.mode === 'ai' ? 'handback' : null)
    const agent_id = body.agent_id || body.assigned_agent_id || null

    let sessionRow: any = null
    if (isUUID(sessionId)) {
      const { data } = await supabase
        .from('sessions')
        .select('id, session_id, client_id, bot_id, channel')
        .or(`session_id.eq.${sessionId},id.eq.${sessionId}`)
        .maybeSingle()
      sessionRow = data
    } else {
      const { data } = await supabase
        .from('sessions')
        .select('id, session_id, client_id, bot_id, channel')
        .eq('session_id', sessionId)
        .maybeSingle()
      sessionRow = data
    }

    if (!sessionRow) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    if (client_id && client_id !== sessionRow.client_id) return NextResponse.json({ error: 'Session does not belong to this workspace' }, { status: 403 })
    const effectiveClientId = sessionRow.client_id
    const resolvedSessionId = sessionRow.session_id || sessionRow.id
    const rowId = sessionRow.id

    const redisKeys = Array.from(new Set([
      `session_mode:${resolvedSessionId}`,
      `session_mode:${sessionRow.id}`,
      `session_mode:${sessionRow.session_id}`,
      `session_mode:${sessionId}`
    ].filter(Boolean)))

    const invalidateCaches = () => Promise.all([
      redis.del(`inbox:convos:${effectiveClientId}`),
      redis.del(`session_last_id:${resolvedSessionId}`),
      redis.del(`session_last_id:${sessionId}`),
      redis.del(`session_last_id:${rowId}`),
    ]).catch(() => {})

    const additionalAliases = [rowId, sessionRow.session_id, sessionId].filter(Boolean) as string[]

    if (action === 'takeover') {
      const { data } = await supabase.from('sessions')
        .update({ mode: 'human', assigned_agent_id: agent_id || null })
        .eq('id', rowId)
        .select()
        .single()
      await Promise.all(redisKeys.map(k => redis.set(k, 'human', { ex: 86400 })))

      // Notify the visitor that a human agent has joined
      await writeMessage({
        sessionId: resolvedSessionId,
        role: 'system',
        content: 'You are now connected with a support agent.',
        mode: 'human',
        additionalSessionAliases: additionalAliases,
        clientId: effectiveClientId,
      })

      await invalidateCaches()
      return NextResponse.json({ success: true, session: { ...data, session_id: resolvedSessionId, status: 'human' } })
    }

    if (action === 'handback') {
      const { data } = await supabase.from('sessions')
        .update({ mode: 'ai' })
        .eq('id', rowId)
        .select()
        .single()
      await Promise.all(redisKeys.map(k => redis.set(k, 'ai', { ex: 3600 })))

      // Notify the visitor and insert an AI resume message
      await writeMessage({
        sessionId: resolvedSessionId,
        role: 'system',
        content: 'Our agent has handed you back to the AI assistant. How can I help you?',
        mode: 'ai',
        additionalSessionAliases: additionalAliases,
        clientId: effectiveClientId,
      })
      await writeMessage({
        sessionId: resolvedSessionId,
        role: 'assistant',
        content: "I'm back! Feel free to ask me anything — I'm here to help.",
        mode: 'ai',
        additionalSessionAliases: additionalAliases,
        clientId: effectiveClientId,
      })

      await invalidateCaches()
      return NextResponse.json({ success: true, session: { ...data, session_id: resolvedSessionId, status: 'ai' } })
    }

    if (action === 'assign' && agent_id) {
      const { data } = await supabase.from('sessions')
        .update({ assigned_agent_id: agent_id })
        .eq('id', rowId)
        .select()
        .single()
      await invalidateCaches()
      return NextResponse.json({ success: true, session: data })
    }

    if (action === 'resolve') {
      const { data } = await supabase.from('sessions')
        .update({ mode: 'resolved' })
        .eq('id', rowId)
        .select()
        .single()
      await Promise.all(redisKeys.map(k => redis.set(k, 'ai', { ex: 3600 })))

      // Notify the visitor that the conversation has been closed
      await writeMessage({
        sessionId: resolvedSessionId,
        role: 'system',
        content: 'This conversation has been closed. Thank you for reaching out!',
        mode: 'ai',
        additionalSessionAliases: additionalAliases,
        clientId: effectiveClientId,
      })

      await invalidateCaches()
      return NextResponse.json({ success: true, session: { ...data, session_id: resolvedSessionId, status: 'resolved' } })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    console.error('[/api/inbox/[sessionId] PUT error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
