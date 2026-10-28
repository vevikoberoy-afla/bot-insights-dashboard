import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { enqueueEmailReply, resolveSmtpCredentials } from '@/lib/email'
import { writeMessage } from '@/lib/chat/writeMessage'
import crypto from 'crypto'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/bots/emails
 * Lists email conversations with filtering, thread history, and triage summaries.
 */
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedWorkspaceUser(req,'bots',req.method!=='GET')
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const clientId = user.workspaceId
  const botId = searchParams.get('bot_id')
  const statusFilter = searchParams.get('status') || 'all' // draft_pending | needs_human | auto_replied | spam | all

  try {
    // Get client's bot IDs
    let botIds: string[] = []
    if (botId) {
      botIds = [botId]
    } else {
      const { data: bots } = await supabase.from('bots').select('id').eq('client_id', clientId)
      botIds = (bots || []).map(b => b.id).filter(Boolean)
    }

    let query = supabase
      .from('sessions')
      .select(`
        id,
        session_id,
        client_id,
        bot_id,
        contact_id,
        channel,
        mode,
        email_status,
        email_subject,
        email_summary,
        reply_summary,
        draft_reply,
        spam_reason,
        created_at,
        last_message_at,
        contacts (
          id,
          name,
          email,
          phone
        ),
        bots (
          id,
          name
        )
      `)
      .eq('channel', 'email')

    query = query.eq('client_id', clientId)
    if (botId && botIds.length > 0) query = query.eq('bot_id', botIds[0])

    // Apply status filter
    if (statusFilter === 'draft_pending') {
      query = query.eq('email_status', 'draft_pending')
    } else if (statusFilter === 'needs_human') {
      query = query.eq('email_status', 'needs_human')
    } else if (statusFilter === 'auto_replied') {
      query = query.in('email_status', ['auto_replied', 'resolved'])
    } else if (statusFilter === 'spam') {
      query = query.eq('email_status', 'spam')
    }

    const { data: sessions, error } = await query
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) {
      console.error('[/api/bots/emails GET error]:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Count in PostgreSQL instead of materializing every historic email row in
    // the Node process. This keeps the endpoint's RAM flat as inboxes grow.
    const countFor = async (statuses?:string[]) => {
      let counter=supabase.from('sessions').select('id',{count:'exact',head:true}).eq('channel','email').eq('client_id',clientId)
      if(botId&&botIds.length>0)counter=counter.eq('bot_id',botIds[0])
      if(statuses?.length===1)counter=counter.eq('email_status',statuses[0])
      else if(statuses?.length)counter=counter.in('email_status',statuses)
      const {count}=await counter
      return count||0
    }
    const [all,draft_pending,needs_human,auto_replied,spam]=await Promise.all([
      countFor(),countFor(['draft_pending']),countFor(['needs_human']),countFor(['auto_replied','resolved']),countFor(['spam'])
    ])
    const counts={all,draft_pending,needs_human,auto_replied,spam}

    const normalizedSessions=(sessions||[]).map((session:any)=>{
      const contact=Array.isArray(session.contacts)?session.contacts[0]:session.contacts
      return{...session,visitor_name:contact?.name||contact?.email||`Customer ${String(session.session_id||session.id).slice(0,6)}`,status:session.mode==='resolved'?'resolved':(session.mode||'ai')}
    })

    return NextResponse.json({
      sessions: normalizedSessions,
      counts,
    })
  } catch (err: any) {
    console.error('[/api/bots/emails exception]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * POST /api/bots/emails
 * Actions: approve_draft, send_reply, mark_spam, unmark_spam, handover
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedWorkspaceUser(req,'bots',true)
    if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
    const body = await req.json()
    const { action, sessionId, replyText, spamReason } = body

    if (!sessionId || !action) {
      return NextResponse.json({ error: 'sessionId and action are required' }, { status: 400 })
    }

    // Resolve session
    const { data: session, error: sessErr } = await supabase
      .from('sessions')
      .select('*, contacts(id, name, email), bots(id, name, client_id)')
      .or(`id.eq.${sessionId},session_id.eq.${sessionId}`)
      .eq('client_id', user.workspaceId)
      .maybeSingle()

    if (sessErr || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 })
    }

    const resolvedSessionId = session.session_id || session.id
    const clientId = session.client_id || session.bots?.client_id
    const botId = session.bot_id || session.bots?.id

    // Determine customer email
    let recipientEmail = session.contacts?.email || ''
    if (!recipientEmail && session.visitor_name && session.visitor_name.includes('@')) {
      const match = session.visitor_name.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)
      if (match) recipientEmail = match[0]
    }

    // ── ACTION: APPROVE DRAFT OR SEND REPLY ──────────────────────────────
    if (action === 'approve_draft' || action === 'send_reply') {
      const finalReply = (replyText || session.draft_reply || '').trim()

      if (!finalReply) {
        return NextResponse.json({ error: 'No reply content to send' }, { status: 400 })
      }

      if (!recipientEmail) {
        return NextResponse.json({ error: 'Recipient email address not found on session' }, { status: 400 })
      }

      // 1. Dispatch outbound email via SMTP
      const smtpCredentials = await resolveSmtpCredentials(clientId, botId)
      if (!smtpCredentials) {
        return NextResponse.json({ error: 'No SMTP credentials configured for this bot or client' }, { status: 400 })
      }

      const emailSubject = session.email_subject || 'Re: Support Request'

      const sent = await enqueueEmailReply(clientId, botId, {
        to: recipientEmail,
        subject: emailSubject,
        body: finalReply,
        brandName: session.bots?.name || 'Support Team',
        sessionId: resolvedSessionId,
        idempotencyKey: `manual:${session.id}:${crypto.createHash('sha256').update(finalReply).digest('hex')}`,
      })
      if (!sent.success) return NextResponse.json({ error: sent.error || 'Email delivery failed' }, { status: 502 })

      // 2. Write agent assistant message to messages table
      await writeMessage({
        sessionId: resolvedSessionId,
        role: 'assistant',
        content: finalReply,
        mode: 'human',
        channel: 'email',
        botId,
        clientId,
        additionalSessionAliases: [session.id, session.session_id, resolvedSessionId].filter(Boolean),
      })

      // 3. Update session
      await supabase
        .from('sessions')
        .update({
          email_status: 'auto_replied',
          draft_reply: null,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', session.id)

      return NextResponse.json({
        success: true,
        message: 'Email reply successfully sent to customer',
      })
    }

    // ── ACTION: MARK AS SPAM ─────────────────────────────────────────────
    if (action === 'mark_spam') {
      await supabase
        .from('sessions')
        .update({
          email_status: 'spam',
          spam_reason: spamReason || 'Marked as spam by agent',
        })
        .eq('id', session.id)

      return NextResponse.json({ success: true, message: 'Marked as spam' })
    }

    // ── ACTION: UNMARK SPAM ──────────────────────────────────────────────
    if (action === 'unmark_spam') {
      await supabase
        .from('sessions')
        .update({
          email_status: session.draft_reply ? 'draft_pending' : 'needs_human',
          spam_reason: null,
        })
        .eq('id', session.id)

      return NextResponse.json({ success: true, message: 'Removed from spam' })
    }

    // ── ACTION: HANDOVER TO HUMAN ─────────────────────────────────────────
    if (action === 'handover') {
      await supabase
        .from('sessions')
        .update({
          email_status: 'needs_human',
          mode: 'waiting',
        })
        .eq('id', session.id)

      return NextResponse.json({ success: true, message: 'Handed over to human agent' })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err: any) {
    console.error('[/api/bots/emails POST exception]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
