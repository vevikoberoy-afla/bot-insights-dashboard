import { redis } from '@/lib/redis'

export interface CachedMessage {
  id: string
  session_id: string
  role: string
  content: string
  mode: string
  source_url?: string | null
  channel?: string | null
  media_url?: string | null
  media_type?: string | null
  message_type?: string | null
  metadata?: any
  created_at: string
}

const CACHE_SIZE = 25
const CACHE_TTL_SECONDS = 3600 // 1 hour buffer

/**
 * Appends a message to the sliding window buffer in Redis.
 * Uses atomic Redis pipeline to rpush, ltrim, and expire in a single round trip.
 */
export async function cacheMessagePayload(
  sessionId: string,
  message: CachedMessage,
  additionalSessionAliases: string[] = []
): Promise<void> {
  if (!sessionId || !message?.id) return

  const allAliases = Array.from(new Set([sessionId, ...additionalSessionAliases].filter(Boolean)))
  const serialized = JSON.stringify(message)

  try {
    await Promise.all(
      allAliases.map(async (sid) => {
        const key = `session_recent_msgs:${sid}`
        const p = redis.pipeline()
        p.rpush(key, serialized)
        p.ltrim(key, -CACHE_SIZE, -1)
        p.expire(key, CACHE_TTL_SECONDS)
        await p.exec()
      })
    )
  } catch (err) {
    console.warn('[Redis Cache] cacheMessagePayload failed:', err)
  }
}

/**
 * Serve from cache when the requested range is fully covered; else caller falls back to Postgres.
 * Returns CachedMessage[] when afterId/lastId is within the window (or empty if already caught up).
 * Returns null if afterId is older than the buffer's oldest message (gap -> requires Postgres).
 */
export async function getRecentMessagesFromCache(
  sessionId: string,
  afterId?: string | null
): Promise<CachedMessage[] | null> {
  if (!sessionId) return null

  try {
    const key = `session_recent_msgs:${sessionId}`
    const rawList = await redis.lrange<string | CachedMessage>(key, 0, -1)
    if (!rawList || rawList.length === 0) return null

    const messages: CachedMessage[] = rawList.map((item) => {
      if (typeof item === 'string') {
        try {
          return JSON.parse(item)
        } catch {
          return null
        }
      }
      return item
    }).filter(Boolean) as CachedMessage[]

    if (messages.length === 0) return null

    // Sort chronologically oldest -> newest just in case
    messages.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())

    // If client didn't supply afterId, return full buffer
    if (!afterId) return messages

    const lastIndex = messages.findIndex((m) => m.id === afterId)
    if (lastIndex === -1) {
      // Gap between afterId and cache (client is behind our sliding window) — not safe to serve from cache alone, fall back to Postgres
      return null
    }

    // Return messages arriving strictly after afterId
    return messages.slice(lastIndex + 1)
  } catch (err) {
    console.warn('[Redis Cache] getRecentMessagesFromCache failed:', err)
    return null
  }
}

// Backwards-compatible alias
export const getCachedMessagesAfter = getRecentMessagesFromCache
