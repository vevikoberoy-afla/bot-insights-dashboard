'use server'

import { supabase, broadcastRealtime } from '@/lib/supabase'
import { isUUID } from '@/lib/utils'
import { Redis } from '@upstash/redis'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { sendEmailReply, resolveSmtpCredentials } from '@/lib/email'
import { writeMessage } from '@/lib/chat/writeMessage'
import { requireWorkspace, SaaSError } from '@/lib/saas/context'
import { decryptConfigSecrets } from '@/lib/security/secretVault'

async function authorizeSession(sessionId: string, write = false) {
  const ctx = await requireWorkspace(null, 'inbox', write)
  let query = supabase.from('sessions').select('id').eq('client_id', ctx.workspaceId)
  query = isUUID(sessionId) ? query.or(`session_id.eq.${sessionId},id.eq.${sessionId}`) : query.eq('session_id', sessionId)
  const {data,error} = await query.maybeSingle()
  if(error || !data) throw new SaaSError('PERMISSION_DENIED', 'Conversation is not available in your workspace.')
  return ctx
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

/* ─────────────────────────────────────────────
   CACHE KEY HELPERS
   ───────────────────────────────────────────── */
const convosKey = (clientId: string) => `inbox:convos:${clientId}`
const msgsKey   = (sid: string)      => `inbox:msgs:${sid}`
const modeKey   = (sid: string)      => `session_mode:${sid}`

export interface ChatMessage {
  id: string
  session_id: string
  role: 'user' | 'assistant' | 'agent' | 'system' | string
  content: string
  source_url?: string | null
  media_url?: string | null
  media_type?: string | null
  sender_type?: 'human' | 'ai' | null
  message_type?: string | null
  metadata?: any
  created_at: string
}

/**
 * 1. fetchChatHistory — Stale-While-Revalidate.
 *  * Returns cached messages instantly if available, * then refreshes cache in background from DB. */
export async function fetchChatHistory(sessionId: string): Promise<ChatMessage[]> {
  await authorizeSession(sessionId)
  if (!sessionId) return []

  const cacheKey = msgsKey(sessionId)

  try {
    const cached = await redis.get<ChatMessage[]>(cacheKey)
    if (cached && Array.isArray(cached) && cached.length > 0) {
      // Return stale immediately, refresh async in background
      refreshMessagesCache(sessionId, cacheKey).catch(() => {})
      return cached
    }
  } catch {}

  return refreshMessagesCache(sessionId, cacheKey)
}

async function refreshMessagesCache(sessionId: string, cacheKey: string): Promise<ChatMessage[]> {
  try {
    let sessionRow: any = null
    if (isUUID(sessionId)) {
      const { data } = await supabase
        .from('sessions')
        .select('id, session_id')
        .or(`session_id.eq.${sessionId},id.eq.${sessionId}`)
        .maybeSingle()
      sessionRow = data
    } else {
      const { data } = await supabase
        .from('sessions')
        .select('id, session_id')
        .eq('session_id', sessionId)
        .maybeSingle()
      sessionRow = data
    }

    const idsToQuery = Array.from(new Set([
      sessionId,
      sessionRow?.session_id,
      sessionRow?.id,
    ].filter(Boolean)))

    const { data, error } = await supabase
      .from('messages')
      .select('id, session_id, role, content, source_url, media_url, media_type, message_type, metadata, created_at')
      .in('session_id', idsToQuery)
      .order('created_at', { ascending: true })

    if (error) { console.error('[fetchChatHistory DB error]:', error); return [] }

    const msgs = (data || []) as ChatMessage[]
    try { await redis.set(cacheKey, msgs, { ex: 30 }) } catch {}
    return msgs
  } catch (err: any) {
    console.error('[fetchChatHistory exception]:', err)
    return []
  }
}

/**
 * 1b. fetchNewMessages — Incremental Sync
 * Only fetches rows created AFTER `afterTimestamp`.
 * Background sync uses this so we never re-download
 * the full history on every 2-second poll tick.
 */
export async function fetchNewMessages(sessionId: string, afterTimestamp: string): Promise<ChatMessage[]> {
  await authorizeSession(sessionId)
  if (!sessionId || !afterTimestamp) return []
  try {
    let sessionRow: any = null
    if (isUUID(sessionId)) {
      const { data } = await supabase
        .from('sessions')
        .select('id, session_id')
        .or(`session_id.eq.${sessionId},id.eq.${sessionId}`)
        .maybeSingle()
      sessionRow = data
    } else {
      const { data } = await supabase
        .from('sessions')
        .select('id, session_id')
        .eq('session_id', sessionId)
        .maybeSingle()
      sessionRow = data
    }

    const idsToQuery = Array.from(new Set([
      sessionId,
      sessionRow?.session_id,
      sessionRow?.id,
    ].filter(Boolean)))

    const { data, error } = await supabase
      .from('messages')
      .select('id, session_id, role, content, source_url, media_url, media_type, media_size_bytes, message_type, metadata, created_at')
      .in('session_id', idsToQuery)
      .gt('created_at', afterTimestamp)
      .order('created_at', { ascending: true })

    if (error) { console.error('[fetchNewMessages error]:', error); return [] }

    return (data || []) as ChatMessage[]
  } catch (err: any) {
    console.error('[fetchNewMessages exception]:', err)
    return []
  }
}

/**
 * 1c. fetchMessagesSince — Reconnection Backfill
 * Queries messages created after a given timestamp (or since a message ID)
 * to fill gaps after WebSocket drops or laptop sleep.
 */
export async function fetchMessagesSince(
  sessionId: string,
  afterTimestamp?: string | null,
  lastId?: string | null
): Promise<ChatMessage[]> {
  await authorizeSession(sessionId)
  if (!sessionId) return []
  try {
    let sessionRow: any = null
    if (isUUID(sessionId)) {
      const { data } = await supabase
        .from('sessions')
        .select('id, session_id')
        .or(`session_id.eq.${sessionId},id.eq.${sessionId}`)
        .maybeSingle()
      sessionRow = data
    } else {
      const { data } = await supabase
        .from('sessions')
        .select('id, session_id')
        .eq('session_id', sessionId)
        .maybeSingle()
      sessionRow = data
    }

    const idsToQuery = Array.from(new Set([
      sessionId,
      sessionRow?.session_id,
      sessionRow?.id,
    ].filter(Boolean)))

    let query = supabase
      .from('messages')
      .select('id, session_id, role, content, source_url, media_url, media_type, media_size_bytes, message_type, metadata, created_at')
      .in('session_id', idsToQuery)
      .order('created_at', { ascending: true })

    if (afterTimestamp) {
      query = query.gt('created_at', afterTimestamp)
    }

    const { data, error } = await query.limit(200)
    if (error) {
      console.error('[fetchMessagesSince error]:', error)
      return []
    }

    let results = (data || []) as ChatMessage[]
    if (lastId) {
      results = results.filter((m) => m.id !== lastId)
    }

    return results
  } catch (err: any) {
    console.error('[fetchMessagesSince exception]:', err)
    return []
  }
}

/**
 * 2. fetchConversationsList — Batched + Redis Cache
 * OPTIMIZED: Single messages batch query eliminates N+1.
 * Returns stale cache instantly, refreshes in background.
 */
export async function fetchConversationsList(clientId: string) {
  await requireWorkspace(clientId, 'inbox')
  if (!clientId) return []

  const cacheKey = convosKey(clientId)

  // Serve stale cache immediately for instant sidebar
  let staleData: any[] | null = null
  try {
    const cached = await redis.get<any[]>(cacheKey)
    if (cached && Array.isArray(cached) && cached.length > 0) {
      staleData = cached
    }
  } catch {}

  const freshPromise = fetchConvosFromDB(clientId, cacheKey)

  if (staleData) {
    // Return stale instantly; background refresh will update cache for next call
    freshPromise.catch(() => {})
    return staleData
  }

  return freshPromise
}

async function fetchConvosFromDB(clientId: string, cacheKey: string): Promise<any[]> {
  try {
    const { data: clientBots } = await supabase
      .from('bots')
      .select('id')
      .eq('client_id', clientId)

    const botIds = (clientBots || []).map((b: any) => b.id).filter(Boolean)

    let query = supabase
      .from('sessions')
      .select('id, session_id, mode, channel, bot_id, client_id, contact_id, created_at, last_message_at, assigned_agent_id, contacts(name, email)')

    if (botIds.length > 0) {
      query = query.or(`client_id.eq.${clientId},bot_id.in.(${botIds.join(',')})`)
    } else {
      query = query.eq('client_id', clientId)
    }

    const { data: sessions, error } = await query
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(80)

    if (error) throw error
    if (!sessions || sessions.length === 0) return []

    // ── Single batch query for last messages (eliminates N+1) ──
    const allSids = sessions.flatMap((s: any) => [s.session_id, s.id].filter(Boolean))
    const uniqueSids = Array.from(new Set(allSids))

    const { data: lastMsgs } = await supabase
      .from('messages')
      .select('session_id, content, role, created_at')
      .in('session_id', uniqueSids)
      .order('created_at', { ascending: false })
      .limit(400)

    // Build lookup: session_id → last message (first in desc-sorted list = latest)
    const lastMsgMap = new Map<string, any>()
    if (lastMsgs) {
      for (const msg of lastMsgs) {
        if (!lastMsgMap.has(msg.session_id)) {
          lastMsgMap.set(msg.session_id, msg)
        }
      }
    }

    const enriched = sessions.map((s: any) => {
      const sid = s.session_id || s.id
      const lastMsg = lastMsgMap.get(s.session_id) || lastMsgMap.get(s.id) || null
      const visitorName = (s.contacts as any)?.name || (sid ? `Visitor ${String(sid).slice(0, 6)}` : 'Website Visitor')
      return {
        ...s,
        session_id: sid,
        visitor_name: visitorName,
        status: s.mode === 'resolved' ? 'resolved' : (s.mode || 'ai'),
        last_message: lastMsg?.content || null,
        last_message_at: lastMsg?.created_at || s.last_message_at || s.created_at,
        last_message_role: lastMsg?.role || null,
      }
    })

    // Cache for 45 seconds
    try { await redis.set(cacheKey, enriched, { ex: 45 }) } catch {}

    return enriched
  } catch (err: any) {
    console.error('[fetchConversationsList error]:', err)
    return []
  }
}

/**
 * Send Agent Message (Out-of-band write)
 * Inserts directly to Supabase and updates session mode.
 */
export async function sendAgentReply(sessionId: string, text: string, agentId: string) {
  const actor = await authorizeSession(sessionId, true)
  agentId = actor.user.id
  if (!sessionId || !text?.trim()) throw new Error('Missing parameters')

  let session: any = null
  if (isUUID(sessionId)) {
    const { data } = await supabase
      .from('sessions')
      .select('*, contacts(name, email), bots(name)')
      .or(`session_id.eq.${sessionId},id.eq.${sessionId}`)
      .maybeSingle()
    session = data
  } else {
    const { data } = await supabase
      .from('sessions')
      .select('*, contacts(name, email), bots(name)')
      .eq('session_id', sessionId)
      .maybeSingle()
    session = data
  }

  if (!session) throw new Error('Session not found')

  const resolvedSessionId = session.session_id || session.id

  const { data: client } = await supabase.from('clients').select('context_id').eq('id', agentId).maybeSingle()
  const contextId = client?.context_id || null

  const additionalAliases = [session.id, session.session_id, sessionId].filter(Boolean) as string[]

  const message = await writeMessage({
    sessionId: resolvedSessionId,
    role: 'agent',
    content: text,
    mode: 'human',
    contextId,
    botId: session.bot_id || null,
    channel: session.channel,
    additionalSessionAliases: additionalAliases,
    clientId: session.client_id,
  })

  // Update session
  await supabase.from('sessions').update({
    mode: 'human',
    assigned_agent_id: agentId || session.assigned_agent_id,
    last_message_at: new Date().toISOString(),
  }).eq('id', session.id)

  // Invalidate in-memory session message caches
  await Promise.all([
    redis.del(msgsKey(resolvedSessionId)).catch(() => {}),
    redis.del(msgsKey(session.id)).catch(() => {}),
  ])

  // Deliver via WhatsApp if applicable
  if (session.channel === 'whatsapp') {
    const { data: channelCfg } = await supabase.from('bot_channels')
      .select('credentials, identifier').eq('bot_id', session.bot_id).eq('channel_type', 'whatsapp').single()
    if (channelCfg?.credentials?.access_token) {
      await sendWhatsAppMessage(channelCfg.identifier, channelCfg.credentials.access_token, session.visitor_name, text)
    }
  }

  // Deliver via Email if applicable
  if (session.channel === 'email' && session.client_id) {
    const recipientEmail = session.contacts?.email || session.visitor_name
    if (recipientEmail && recipientEmail.includes('@')) {
      const smtp = await resolveSmtpCredentials(session.client_id, session.bot_id)
      if (smtp) {
        await sendEmailReply(smtp, {
          to: recipientEmail,
          subject: 'Support Update',
          body: text,
          brandName: session.bots?.name || 'Support Team',
        })
      } else {
        console.warn('[sendAgentReply] No SMTP credentials found for client:', session.client_id)
      }
    }
  }

  // Deliver via Telegram if applicable
  if (session.channel === 'telegram') {
    await sendTelegramOutbound(resolvedSessionId, session.bot_id, session.client_id, text)
  }

  return message
}

async function sendTelegramOutbound(sessionId: string, botId: string | null, clientId: string | null, text: string) {
  try {
    const tgChatId = sessionId.replace(/^tg_/, '')
    let botToken: string | null = process.env.TELEGRAM_BOT_TOKEN?.trim() || null

    if (!botToken && botId) {
      const { data: b } = await supabase
        .from('bots')
        .select('bot_flow')
        .eq('id', botId)
        .maybeSingle()

      if (b?.bot_flow?.integration_id) {
        const { data: integ } = await supabase
          .from('channel_integrations')
          .select('config')
          .eq('id', b.bot_flow.integration_id)
          .maybeSingle()
        botToken = clientId ? decryptConfigSecrets(clientId, integ?.config)?.bot_token || null : integ?.config?.bot_token || null
      }
      if (!botToken && b?.bot_flow?.bot_token) {
        botToken = b.bot_flow.bot_token
      }
    }

    if (!botToken && clientId) {
      const { data: integ } = await supabase
        .from('channel_integrations')
        .select('config')
        .eq('channel', 'telegram')
        .eq('client_id', clientId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      botToken = decryptConfigSecrets(clientId, integ?.config)?.bot_token || null
    }

    if (botToken) {
      const res = await fetch(`https://api.telegram.org/bot${botToken.trim()}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tgChatId, text }),
      })
      if (!res.ok) {
        const err = await res.text()
        console.error('[sendTelegramOutbound error]:', err)
      } else {
        console.log(`[sendTelegramOutbound] Delivered to Telegram chat ${tgChatId}`)
      }
    } else {
      console.warn('[sendTelegramOutbound] No Telegram bot token found')
    }
  } catch (tgErr) {
    console.error('[sendTelegramOutbound exception]:', tgErr)
  }
}

/**
 * 3. handleSessionAction — takeover / handback / resolve
 * Returns the updated session AND the inserted system messages so the
 * caller can merge them directly into state without re-fetching.
 */
export async function handleSessionAction(sessionId: string, action: 'takeover' | 'handback' | 'resolve', agentId: string) {
  const actor = await authorizeSession(sessionId, true)
  agentId = actor.user.id
  let sessionRow: any = null
  if (isUUID(sessionId)) {
    const { data } = await supabase
      .from('sessions')
      .select('id, session_id, client_id, channel, bot_id')
      .or(`session_id.eq.${sessionId},id.eq.${sessionId}`)
      .maybeSingle()
    sessionRow = data
  } else {
    const { data } = await supabase
      .from('sessions')
      .select('id, session_id, client_id, channel, bot_id')
      .eq('session_id', sessionId)
      .maybeSingle()
    sessionRow = data
  }

  if (!sessionRow) throw new Error('Session not found')
  const resolvedSessionId = sessionRow.session_id || sessionRow.id
  const rowId = sessionRow.id

  const redisKeys = Array.from(new Set([
    modeKey(resolvedSessionId),
    modeKey(sessionRow.id),
    modeKey(sessionRow.session_id),
    modeKey(sessionId),
  ].filter(Boolean)))

  // Eagerly invalidate caches so next load sees fresh data
  const allSidAliases = Array.from(new Set([
    resolvedSessionId,
    rowId,
    sessionRow.session_id,
    sessionId,
  ].filter(Boolean)))

  const invalidateCaches = async (newMode: string) => {
    await Promise.all([
      ...redisKeys.map(k => redis.set(k, newMode, { ex: newMode === 'human' ? 86400 : 3600 }).catch(() => {})),
      redis.del(msgsKey(resolvedSessionId)).catch(() => {}),
      redis.del(msgsKey(rowId)).catch(() => {}),
      ...allSidAliases.map(sid => redis.del(`session_last_id:${sid}`).catch(() => {})),
      sessionRow.client_id ? redis.del(convosKey(sessionRow.client_id)).catch(() => {}) : Promise.resolve(),
    ])
  }

  const additionalAliases = [sessionRow.id, sessionRow.session_id, sessionId].filter(Boolean) as string[]

  if (action === 'takeover') {
    const { data } = await supabase.from('sessions')
      .update({ mode: 'human', assigned_agent_id: agentId || null })
      .eq('id', rowId).select().single()

    await invalidateCaches('human')

    const systemMsg = await writeMessage({
      sessionId: resolvedSessionId,
      role: 'system',
      content: 'You are now connected with a support agent.',
      mode: 'human',
      additionalSessionAliases: additionalAliases,
      clientId: sessionRow.client_id,
    })

    if (sessionRow.channel === 'telegram') {
      await sendTelegramOutbound(resolvedSessionId, sessionRow.bot_id, sessionRow.client_id, '👨‍💼 You are now connected with a human support agent.')
    }

    return { success: true, session: { ...data, session_id: resolvedSessionId, status: 'human' }, systemMessages: [systemMsg as ChatMessage] }
  }

  if (action === 'handback') {
    const { data } = await supabase.from('sessions')
      .update({ mode: 'ai' })
      .eq('id', rowId).select().single()

    await invalidateCaches('ai')

    const msg1 = await writeMessage({
      sessionId: resolvedSessionId,
      role: 'system',
      content: 'Our agent has handed you back to the AI assistant. How can I help you?',
      mode: 'ai',
      additionalSessionAliases: additionalAliases,
      clientId: sessionRow.client_id,
    })
    const msg2 = await writeMessage({
      sessionId: resolvedSessionId,
      role: 'assistant',
      content: "I'm back! Feel free to ask me anything — I'm here to help.",
      mode: 'ai',
      additionalSessionAliases: additionalAliases,
      clientId: sessionRow.client_id,
    })

    if (sessionRow.channel === 'telegram') {
      await sendTelegramOutbound(resolvedSessionId, sessionRow.bot_id, sessionRow.client_id, "🤖 Our agent has handed you back to the AI assistant. I'm here to help!")
    }

    return { success: true, session: { ...data, session_id: resolvedSessionId, status: 'ai' }, systemMessages: [msg1, msg2] as ChatMessage[] }
  }

  if (action === 'resolve') {
    const { data } = await supabase.from('sessions')
      .update({ mode: 'resolved' })
      .eq('id', rowId).select().single()

    await invalidateCaches('ai')

    const systemMsg = await writeMessage({
      sessionId: resolvedSessionId,
      role: 'system',
      content: 'This conversation has been closed. Thank you for reaching out!',
      mode: 'ai',
      additionalSessionAliases: additionalAliases,
      clientId: sessionRow.client_id,
    })

    return { success: true, session: { ...data, session_id: resolvedSessionId, status: 'resolved' }, systemMessages: [systemMsg as ChatMessage] }
  }

  throw new Error('Unknown action: ' + action)
}

/**
 * Fetch Context Card
 * Direct database select for visitor metadata and last 10 messages.
 */
export async function fetchContextCard(sessionId: string) {
  await authorizeSession(sessionId)
  if (!sessionId) return null

  try {
    let session: any = null
    if (isUUID(sessionId)) {
      const { data } = await supabase
        .from('sessions')
        .select('*, contacts(name, email, phone)')
        .or(`id.eq.${sessionId},session_id.eq.${sessionId}`)
        .maybeSingle()
      session = data
    } else {
      const { data } = await supabase
        .from('sessions')
        .select('*, contacts(name, email, phone)')
        .eq('session_id', sessionId)
        .maybeSingle()
      session = data
    }

    if (!session) return null

    const resolvedId = session.session_id || session.id

    const idsToQuery = Array.from(new Set([
      sessionId,
      session.session_id,
      session.id,
    ].filter(Boolean)))

    const { data: messages } = await supabase
      .from('messages')
      .select('role, content, created_at')
      .in('session_id', idsToQuery)
      .order('created_at', { ascending: true })

    const allMessages = messages || []
    const lastMessages = allMessages.slice(-10)

    const userMessages = allMessages.filter((m: any) => m.role === 'user')
    const lastUserMsg = userMessages[userMessages.length - 1]?.content || 'No messages yet'

    return {
      session_id: resolvedId || session.id,
      visitor_name: (session.contacts as any)?.name || (resolvedId ? `Visitor ${String(resolvedId).slice(0, 6)}` : 'Website Visitor'),
      channel: session.channel,
      mode: session.mode,
      status: session.mode === 'resolved' ? 'resolved' : session.mode,
      created_at: session.created_at,
      last_message_at: session.last_message_at,
      message_count: allMessages.length,
      last_messages: lastMessages,
      last_user_question: lastUserMsg,
      contact: session.contacts || null,
    }
  } catch (err) {
    console.error('[fetchContextCard error]:', err)
    return null
  }
}
