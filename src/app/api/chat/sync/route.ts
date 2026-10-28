import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getCorsHeaders, handleOptions } from '@/lib/cors'
import { redis } from '@/lib/redis'
import { isUUID } from '@/lib/utils'
import { safeRedisGet, safeRedisMGet } from '@/lib/redis/safe'
import { setLastIdIfGreater } from '@/lib/redis/atomic'
import { getRecentMessagesFromCache, cacheMessagePayload } from '@/lib/redis/messageCache'
import { verifyWidgetSessionToken } from '@/lib/security/widgetSessionToken'

export const dynamic = 'force-dynamic'

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rawCtx = req.nextUrl.searchParams.get('ctx')?.trim() ?? ''
  const contextId = (rawCtx === 'YOUR_CLIENT_ID' || rawCtx === 'null' || rawCtx === 'undefined') ? '' : rawCtx
  const cors = await getCorsHeaders(contextId, origin)
  return handleOptions(cors)
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rawCtx = req.nextUrl.searchParams.get('ctx')?.trim() ?? ''
  const contextId = (rawCtx === 'YOUR_CLIENT_ID' || rawCtx === 'null' || rawCtx === 'undefined') ? '' : rawCtx
  const sessionId = req.nextUrl.searchParams.get('session_id')
  const botId = req.nextUrl.searchParams.get('bot')
  const lastId = req.nextUrl.searchParams.get('last_id')
  const afterCount = parseInt(req.nextUrl.searchParams.get('after') || '0')
  const cors = await getCorsHeaders(contextId, origin)

  if (!sessionId) {
    return NextResponse.json(
      { error: 'Missing session_id' },
      { status: 400, headers: cors }
    )
  }

  try {
    const claims = verifyWidgetSessionToken(req.headers.get('x-widget-session-token') || '', 'widget')
    if (claims.sessionId !== sessionId || (botId && claims.botId !== botId)) throw new Error('SYNC_SCOPE_MISMATCH')
  } catch {
    return NextResponse.json({ error: 'Chat session expired.' }, { status: 401, headers: cors })
  }

  try {
    let expectedClientId: string | null = null
    if (botId) {
      const { data: bot } = await supabase.from('bots').select('client_id').eq('id', botId).maybeSingle()
      expectedClientId = bot?.client_id || null
    } else if (contextId) {
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .or(/^[0-9a-f-]{36}$/i.test(contextId) ? `id.eq.${contextId},context_id.eq.${contextId}` : `context_id.eq.${contextId}`)
        .maybeSingle()
      expectedClientId = client?.id || null
    }
    if (!expectedClientId) {
      const { data: sessRow } = await supabase
        .from('sessions')
        .select('client_id')
        .or(isUUID(sessionId) ? `id.eq.${sessionId},session_id.eq.${sessionId}` : `session_id.eq.${sessionId}`)
        .maybeSingle()
      if (sessRow?.client_id) {
        expectedClientId = sessRow.client_id
      }
    }
    if (!expectedClientId) {
      return NextResponse.json({ error: 'Missing or invalid bot/context scope' }, { status: 400, headers: cors })
    }

    // ── 1. FAST PATH: Check Redis cache (<2ms) ────────────────────────
    const mgetRes = await safeRedisMGet<[string | null, string | null]>(
      `session_last_id:${sessionId}`,
      `session_mode:${sessionId}`
    )
    const [cachedLastId, cachedMode] = mgetRes || [null, null]

    // If client provided last_id and it matches the cached latest message ID:
    if (lastId && cachedLastId && lastId === cachedLastId) {
      return NextResponse.json(
        { messages: [], mode: cachedMode || 'ai' },
        { headers: cors }
      )
    }

    // ── 2. BUFFER PATH: Retrieve from Redis sliding-window cache (<2ms, 0 Postgres hits) ──
    const bufferedMessages = await getRecentMessagesFromCache(sessionId, lastId)
    if (bufferedMessages !== null) {
      return NextResponse.json(
        { messages: bufferedMessages, mode: cachedMode || 'ai' },
        { headers: cors }
      )
    }

    // ── 3. RESOLVE SESSION ALIASES & MODE ────────────────────────────
    let idsToQuery: string[] | null = await safeRedisGet<string[]>(`session_ids:${sessionId}`)
    let mode = cachedMode

    if (!idsToQuery || idsToQuery.length === 0 || !mode) {
      let sessionData: any = null
      if (isUUID(sessionId)) {
        const { data } = await supabase
          .from('sessions')
          .select('id, session_id, mode, client_id')
          .or(`id.eq.${sessionId},session_id.eq.${sessionId}`)
          .eq('client_id', expectedClientId)
          .maybeSingle()
        sessionData = data
      } else {
        const { data } = await supabase
          .from('sessions')
          .select('id, session_id, mode, client_id')
          .eq('session_id', sessionId)
          .eq('client_id', expectedClientId)
          .maybeSingle()
        sessionData = data
      }

      mode = sessionData?.mode || cachedMode || 'ai'

      idsToQuery = Array.from(new Set([
        sessionId,
        sessionData?.session_id,
        sessionData?.id,
      ].filter(Boolean))) as string[]

      if (idsToQuery.length > 0) {
        await redis.set(`session_ids:${sessionId}`, idsToQuery, { ex: 1800 }).catch(() => {})
      }
    }

    // ── 4. POSTGRES BACKFILL (Only on buffer cache-miss) ─────────────
    const { data: messages, error } = await supabase
      .from('messages')
      .select('id, session_id, role, content, source_url, media_url, media_type, media_size_bytes, created_at, mode, channel, message_type, metadata')
      .in('session_id', idsToQuery)
      .order('created_at', { ascending: true })
      .limit(100)

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: cors }
      )
    }

    const allMsgs = messages || []
    const totalCount = allMsgs.length
    const latestMsg = allMsgs[allMsgs.length - 1]

    // ── 5. READ-REPAIR WITH ATOMIC CAS ───────────────────────────────
    // Using setLastIdIfGreater prevents a concurrent write from being regressed by this backfill read
    if (latestMsg?.id) {
      await Promise.allSettled([
        ...idsToQuery.map(id => setLastIdIfGreater(id, latestMsg.id, latestMsg.created_at)),
        ...idsToQuery.map(id => redis.set(`session_mode:${id}`, mode || 'ai', { ex: 86400 }).catch(() => {})),
        // Prime the Redis sliding window buffer with the last 20 messages
        ...allMsgs.slice(-20).map(m => cacheMessagePayload(sessionId, m, idsToQuery!)),
      ])
    }

    // If client passed last_id and it matches the latest row, return empty
    if (lastId && latestMsg?.id && lastId === latestMsg.id) {
      return NextResponse.json(
        { messages: [], mode: mode || 'ai' },
        { headers: cors }
      )
    }

    // Filter messages after lastId if provided
    let resultMessages = allMsgs
    if (lastId) {
      const idx = allMsgs.findIndex(m => m.id === lastId)
      if (idx !== -1) {
        resultMessages = allMsgs.slice(idx + 1)
      }
    } else if (afterCount > 0 && afterCount <= allMsgs.length) {
      resultMessages = allMsgs.slice(afterCount)
    }

    return NextResponse.json(
      { messages: resultMessages, mode: mode || 'ai' },
      { headers: cors }
    )

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: cors }
    )
  }
}
