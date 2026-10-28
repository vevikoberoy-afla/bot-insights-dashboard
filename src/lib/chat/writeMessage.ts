import { supabase, broadcastRealtime } from '@/lib/supabase'
import { redis } from '@/lib/redis'
import { setLastIdIfGreater } from '@/lib/redis/atomic'
import { cacheMessagePayload, CachedMessage } from '@/lib/redis/messageCache'
import { chatRoomChannel, storeInboxChannel } from '@/lib/realtime/channels'

export interface WriteMessageParams {
  sessionId: string
  role: 'user' | 'agent' | 'system' | 'assistant'
  content: string
  mode: 'ai' | 'human'
  contextId?: string | null
  botId?: string | null
  sourceUrl?: string | null
  channel?: string | null
  additionalSessionAliases?: string[]
  clientId?: string | null
  // Photo attachment fields (populated when user sends an image)
  mediaUrl?: string | null
  mediaType?: string | null
  mediaSizeBytes?: number | null
  messageType?: string | null
  metadata?: any
}

/**
 * Single source of truth write for all message origins (widget user, AI, human agent, system handoff).
 * Writes durably to PostgreSQL first, then concurrently updates Redis caches and broadcasts via Realtime.
 */
export async function writeMessage(params: WriteMessageParams) {
  const {
    sessionId,
    role,
    content,
    mode,
    contextId = null,
    botId = null,
    sourceUrl = null,
    channel = 'widget',
    additionalSessionAliases = [],
    clientId = null,
    mediaUrl = null,
    mediaType = null,
    mediaSizeBytes = null,
    messageType = null,
    metadata = null,
  } = params

  if (!sessionId) throw new Error('Missing sessionId in writeMessage')

  // 1. Single source of truth write — .select().single() returns the generated row including UUID and created_at
  const { data: message, error } = await supabase
    .from('messages')
    .insert({
      session_id: sessionId,
      role,
      content,
      mode,
      context_id: contextId,
      bot_id: botId,
      source_url: sourceUrl,
      channel: channel || 'widget',
      // Photo attachment fields (null when no image)
      ...(mediaUrl ? { media_url: mediaUrl, media_type: mediaType, media_size_bytes: mediaSizeBytes } : {}),
      ...(messageType ? { message_type: messageType } : {}),
      ...(metadata ? { metadata } : {}),
    })
    .select('id, session_id, role, content, mode, source_url, channel, media_url, media_type, message_type, metadata, created_at')
    .single()

  if (error || !message) {
    throw error || new Error('Failed to insert message')
  }

  const allAliases = Array.from(new Set([sessionId, ...additionalSessionAliases].filter(Boolean)))
  const cachedMsg: CachedMessage = {
    id: message.id,
    session_id: message.session_id,
    role: message.role,
    content: message.content,
    mode: message.mode,
    source_url: message.source_url,
    channel: message.channel,
    media_url: message.media_url || null,
    media_type: message.media_type || null,
    message_type: message.message_type || null,
    metadata: message.metadata || null,
    created_at: message.created_at,
  }

  // 2. Deliver the room broadcast before returning. Anonymous widgets cannot
  // read tenant-protected Postgres changes, so this is their reliable live
  // delivery path. Redis remains best-effort and does not block the response.
  await Promise.allSettled(allAliases.map((sid) =>
    broadcastRealtime(chatRoomChannel(sid), 'new_message', message)
  ))

  if (clientId) {
    // Coalesce workspace-level invalidations under email/campaign bursts. The
    // active conversation still receives every message on its room channel.
    void (async () => {
      let shouldBroadcast = true
      try { shouldBroadcast = !!(await redis.set(`realtime:inbox:${clientId}`, message.id, { nx: true, ex: 2 })) } catch {}
      if (shouldBroadcast) broadcastRealtime(storeInboxChannel(clientId), 'inbox_update', {
        session_id: sessionId,
        snippet: content.slice(0, 40),
        created_at: message.created_at,
      }).catch(() => {})
    })()
  }

  // 3. Redis writes are best-effort, non-blocking background tasks — DO NOT await
  Promise.allSettled([
    // CAS forward-only update of session_last_id across all aliases
    ...allAliases.map((sid) => setLastIdIfGreater(sid, message.id, message.created_at)),
    // Sliding-window message buffer in Redis
    cacheMessagePayload(sessionId, cachedMsg, additionalSessionAliases),
    // Update session mode in Redis
    ...allAliases.map((sid) => redis.set(`session_mode:${sid}`, mode, { ex: 86400 }).catch(() => {})),
    // Invalidate conversations list cache for dashboard sidebar
    clientId ? redis.del(`inbox:convos:${clientId}`).catch(() => {}) : Promise.resolve(),
  ])

  return message
}
