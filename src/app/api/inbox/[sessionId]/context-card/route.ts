import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isUUID } from '@/lib/utils'
import {requireWorkspace} from '@/lib/saas/context'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, props: { params: Promise<{ sessionId: string }> }) {
  const params = await props.params;
  const { sessionId } = params

  try {
    const ctx=await requireWorkspace(req.nextUrl.searchParams.get('client_id'),'inbox')
    let session: any = null
    if (isUUID(sessionId)) {
      const { data } = await supabase
        .from('sessions')
        .select('*, contacts(name, email, phone)')
        .or(`id.eq.${sessionId},session_id.eq.${sessionId}`)
        .eq('client_id',ctx.workspaceId).maybeSingle()
      session = data
    } else {
      const { data } = await supabase
        .from('sessions')
        .select('*, contacts(name, email, phone)')
        .eq('session_id', sessionId)
        .eq('client_id',ctx.workspaceId).maybeSingle()
      session = data
    }

    if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

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
      .limit(30)

    const allMessages = messages || []
    const lastMessages = allMessages.slice(-10)

    const userMessages = allMessages.filter((m: any) => m.role === 'user')
    const lastUserMsg = userMessages[userMessages.length - 1]?.content || 'No messages yet'

    return NextResponse.json({
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
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
