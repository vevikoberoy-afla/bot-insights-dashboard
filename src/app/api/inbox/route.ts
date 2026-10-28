import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { redis } from '@/lib/redis'
import {requireWorkspace,saasError} from '@/lib/saas/context'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
 try{
  const ctx=await requireWorkspace(req.nextUrl.searchParams.get('client_id'),'inbox')
  const client_id = ctx.workspaceId

  const cacheKey = `inbox:convos:${client_id}`

  // 1. Serve stale Redis cache immediately if available (<10ms)
  try {
    const cached = req.headers.get('x-dashboard-revalidate')==='1' ? null : await redis.get<any[]>(cacheKey)
    if (cached !== null && cached !== undefined && Array.isArray(cached)) {
      if (cached.length > 0) {
        fetchAndCacheConvos(client_id, cacheKey).catch(() => {})
      }
      return NextResponse.json(cached)
    }
  } catch {}

  // 2. Fetch fresh from DB on cache miss
  try {
    const data = await fetchAndCacheConvos(client_id, cacheKey)
    return NextResponse.json(data)
  } catch (err: any) {
    console.error('[/api/inbox GET error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
 }catch(error){return saasError(error)}
}

async function fetchAndCacheConvos(clientId: string, cacheKey: string): Promise<any[]> {
  const { data: clientBots } = await supabase
    .from('bots')
    .select('id')
    .eq('client_id', clientId)

  const botIds = (clientBots || []).map(b => b.id).filter(Boolean)

  let query = supabase
    .from('sessions')
    .select('id, session_id, mode, channel, bot_id, client_id, contact_id, created_at, last_message_at, assigned_agent_id, contacts(name, email)')

  if (botIds.length > 0) {
    query = query.or(`client_id.eq.${clientId},bot_id.in.(${botIds.join(',')})`)
  } else {
    query = query.eq('client_id', clientId)
  }

  // Keep live text inbox strictly for real-time web & whatsapp chat
  query = query.neq('channel', 'email')

  const { data: sessions, error } = await query
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(80)

  if (error) throw error
  if (!sessions || sessions.length === 0) {
    try { await redis.set(cacheKey, [], { ex: 45 }) } catch {}
    return []
  }

  // ── Single batch query for all last messages (eliminates N+1) ──
  const allSids = sessions.flatMap((s: any) => [s.session_id, s.id].filter(Boolean))
  const uniqueSids = Array.from(new Set(allSids))

  const { data: lastMsgs } = await supabase
    .from('messages')
    .select('session_id, content, role, media_url, created_at')
    .in('session_id', uniqueSids)
    .order('created_at', { ascending: false })
    .limit(400)

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
    const rawContent = (lastMsg?.content || '').trim()
    const isVisionPrompt = rawContent.startsWith('Analyze this image')
    const displayMsg = (!rawContent || isVisionPrompt) && lastMsg?.media_url
      ? '📷 Photo'
      : (isVisionPrompt ? '' : rawContent || null)

    return {
      ...s,
      session_id: sid,
      visitor_name: visitorName,
      status: s.mode === 'resolved' ? 'resolved' : (s.mode || 'ai'),
      last_message: displayMsg,
      last_message_at: lastMsg?.created_at || s.last_message_at || s.created_at,
      last_message_role: lastMsg?.role || null,
    }
  })

  try { await redis.set(cacheKey, enriched, { ex: 45 }) } catch {}

  return enriched
}
