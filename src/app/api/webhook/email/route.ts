import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { embed } from '@/lib/embeddings'
import { generateAnswer } from '@/lib/groq'
import { enqueueEmailReply } from '@/lib/email'
import { writeMessage } from '@/lib/chat/writeMessage'
import { triageEmail } from '@/lib/emailTriage'
import { verifyWebhookSecret } from '@/lib/webhookSecurity'
import { handleBookingFlow } from '@/lib/bookingFlow'
import { handleCommerceFlow } from '@/lib/commerceFlow'
import { handleOrderTrackingFlow } from '@/lib/orderTrackingFlow'
import { redis } from '@/lib/redis'
import { qstash } from '@/lib/qstash'
import crypto from 'crypto'
import { upsertCustomerContact } from '@/lib/customerContacts'
import { decryptConfigSecrets } from '@/lib/security/secretVault'

export const dynamic = 'force-dynamic'

/**
 * POST /api/webhook/email
 * 
 * Omnichannel Inbound Email Webhook.
 * Accepts inbound parsed emails from SendGrid Inbound Parse, Mailgun, Postmark,
 * AWS SES, or Cloudflare Email Routing.
 * 
 * Architecture:
 * 1. Parses headers, sender, recipient, subject, and text/html body.
 * 2. Resolves receiving bot & client from bot_channels or channel_integrations.
 * 3. Upserts contact in CRM contacts table (source_channel: 'email', opt_in_email: true).
 * 4. Resolves or creates threaded conversation session.
 * 5. Atomically writes message via writeMessage() with Realtime broadcast to Live Inbox.
 * 6. If session mode is 'human', notifies support agents without auto-replying.
 * 7. If session mode is 'ai', runs RAG pipeline over bot knowledge and sends threaded email reply.
 */
export async function POST(req: NextRequest) {
  try {
    if (!verifyWebhookSecret(req, process.env.EMAIL_WEBHOOK_SECRET)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (req.nextUrl.searchParams.get('process') === '1') {
      const job = await req.json() as InboundEmailData
      if (!job.messageId || !job.toEmail || !job.fromEmail) return NextResponse.json({ error: 'Invalid inbound email job' }, { status: 400 })
      await supabase.from('email_inbound_events').update({status:'processing'}).eq('message_id',job.messageId).eq('recipient',job.toEmail)
      try {
        await processInboundEmail(job)
        await supabase.from('email_inbound_events').update({status:'processed',processed_at:new Date().toISOString()}).eq('message_id',job.messageId).eq('recipient',job.toEmail)
        return NextResponse.json({ success: true })
      } catch (error: any) {
        await supabase.from('email_inbound_events').update({status:'failed',last_error:String(error?.message||error),processed_at:new Date().toISOString()}).eq('message_id',job.messageId).eq('recipient',job.toEmail)
        throw error
      }
    }
    const contentType = req.headers.get('content-type') || ''
    let from = '', to = '', subject = '', text = '', messageId = '', inReplyTo = ''

    if (contentType.includes('application/json')) {
      const body = await req.json()
      from = body.from || body.sender || body.from_email || ''
      to = body.to || body.recipient || body.to_email || ''
      subject = body.subject || ''
      text = body.text || body.plain || body['stripped-text'] || body.body || ''
      messageId = body['Message-Id'] || body.message_id || body.messageId || ''
      inReplyTo = body['In-Reply-To'] || body.in_reply_to || body.inReplyTo || ''
    } else if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData()
      from = (formData.get('from') as string) || ''
      to = (formData.get('to') as string) || ''
      subject = (formData.get('subject') as string) || ''
      text = (formData.get('text') as string) || (formData.get('stripped-text') as string) || ''
      messageId = (formData.get('Message-Id') as string) || (formData.get('message_id') as string) || ''
      inReplyTo = (formData.get('In-Reply-To') as string) || (formData.get('in_reply_to') as string) || ''
    }

    // Extract sender name and clean email (e.g., "John Doe <john@example.com>")
    const fromEmailMatch = from.match(/<(.+?)>/)
    const fromEmail = (fromEmailMatch ? fromEmailMatch[1] : from).trim().toLowerCase()
    const fromName = from.replace(/<.+?>/, '').trim() || fromEmail.split('@')[0]

    // Extract recipient email
    const toEmailMatch = to.match(/<(.+?)>/)
    const toEmail = (toEmailMatch ? toEmailMatch[1] : to).trim().toLowerCase()

    if (!fromEmail || !toEmail || !text.trim()) {
      return NextResponse.json({ status: 'ignored', reason: 'Missing from, to, or text' }, { status: 200 })
    }
    const normalizedSubject = subject.trim() || 'No Subject'
    const obviousBounce = /mailer-daemon|postmaster@/i.test(fromEmail) || /^(?:undelivered mail|delivery status notification)/i.test(normalizedSubject)
    if (obviousBounce) return NextResponse.json({ status: 'ignored', reason: 'Automated bounce' }, { status: 200 })
    const stableMessageId = messageId || `<generated-${crypto.createHash('sha256').update(`${fromEmail}|${toEmail}|${normalizedSubject}|${text}`).digest('hex')}@vittain>`
    const job: InboundEmailData = {
      fromEmail,
      fromName,
      toEmail,
      subject: normalizedSubject,
      messageText: text.trim(),
      messageId: stableMessageId,
      inReplyTo,
    }
    const idempotencyKey = `email:msgid:${crypto.createHash('sha256').update(`${stableMessageId}|${toEmail}`).digest('hex')}`
    try {
      const claimed = await redis.set(idempotencyKey, 'queued', { nx: true, ex: 7 * 86400 })
      if (!claimed) return NextResponse.json({ status: 'duplicate' }, { status: 202 })
    } catch (error) { console.warn('[Email Webhook] Redis idempotency unavailable; using database guard', error) }
    const { error: eventError } = await supabase.from('email_inbound_events').insert({ message_id: stableMessageId, recipient: toEmail, sender: fromEmail, status: 'queued' })
    if (eventError?.code === '23505') return NextResponse.json({ status: 'duplicate' }, { status: 202 })

    if (process.env.QSTASH_TOKEN) {
      const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin
      try {
        await qstash.publishJSON({ url: `${origin}/api/webhook/email?process=1`, body: job, retries: 5, flowControl: { key: 'email-inbound', parallelism: 50, rate: Number(process.env.EMAIL_WORKER_RATE || 50), period: '1s' }, headers: process.env.EMAIL_WEBHOOK_SECRET ? { 'x-webhook-secret': process.env.EMAIL_WEBHOOK_SECRET } : undefined })
      } catch (queueError) {
        await Promise.all([redis.del(idempotencyKey).catch(() => null),supabase.from('email_inbound_events').delete().eq('message_id',stableMessageId).eq('recipient',toEmail)])
        throw queueError
      }
      return NextResponse.json({ status: 'queued' }, { status: 202 })
    }
    await processInboundEmail(job)
    await supabase.from('email_inbound_events').update({ status: 'processed', processed_at: new Date().toISOString() }).eq('message_id', stableMessageId).eq('recipient', toEmail)

    return NextResponse.json({ status: 'ok' }, { status: 200 })
  } catch (err: any) {
    console.error('[Email Webhook Error]:', err)
    return NextResponse.json({ status: 'error', message: 'Email could not be accepted for processing' }, { status: 500 })
  }
}

interface InboundEmailData {
  fromEmail: string
  fromName: string
  toEmail: string
  subject: string
  messageText: string
  messageId?: string
  inReplyTo?: string
}

async function processInboundEmail(data: InboundEmailData) {
  const { fromEmail, fromName, toEmail, subject, messageText, messageId, inReplyTo } = data

  // ── 1. Resolve Bot & Client ───────────────────────────────────────────────
  let bot: any = null
  let clientId: string | null = null
  let emailPolicy: any = {}

  // 1a. Check bot_channels for explicit email channel
  const { data: botChannel } = await supabase
    .from('bot_channels')
    .select('bot_id, credentials, identifier, bots(id, client_id, name, fallback_message, handoff_message, prompt)')
    .eq('channel_type', 'email')
    .ilike('identifier', toEmail)
    .maybeSingle()

  if (botChannel?.bots) {
    bot = botChannel.bots
    clientId = bot.client_id
    emailPolicy = botChannel.credentials || {}
  }

  // 1b. The Integrations dashboard is the source of truth for new mailbox
  // assignments. Check it even when a legacy bot_channels row matched so a
  // stale legacy record cannot route mail to the wrong bot.
  const { data: integrations } = await supabase
    .from('channel_integrations')
    .select('client_id, bot_id, config')
    .eq('channel', 'email')
    .eq('status', 'active')

  const resolvedIntegrations = (integrations || []).map((i:any)=>({...i,config:decryptConfigSecrets(i.client_id,i.config)}))
  const matchedInt = resolvedIntegrations.find((i: any) => {
    const cfgUser = (i.config?.smtp_user || '').toLowerCase()
    const cfgFrom = (i.config?.from_email || '').toLowerCase()
    const cfgMailbox = (i.config?.email_address || '').toLowerCase()
    return cfgUser === toEmail || cfgFrom === toEmail || cfgMailbox === toEmail
  })

  if (matchedInt) {
    clientId = matchedInt.client_id
    emailPolicy = matchedInt.config || {}
    // New integrations explicitly bind one mailbox to one bot. Older
    // integrations retain the previous active-bot fallback.
    let botQuery = supabase
      .from('bots')
      .select('id, client_id, name, fallback_message, handoff_message, prompt')
      .eq('client_id', clientId)
      .eq('status', 'active')
    if (matchedInt.bot_id) botQuery = botQuery.eq('id', matchedInt.bot_id)
    const { data: primaryBot } = await botQuery.order('created_at', { ascending: false }).limit(1).maybeSingle()

    bot = primaryBot
  }

  // 1c. If still not matched, check if toEmail matches any bot's client's registered email
  if (!bot) {
    console.warn(`[Email Webhook] No bot/client mapped to receiving address: ${toEmail}`)
    return
  }

  // ── 2. Contact Resolution in CRM ──────────────────────────────────────────
  const contact = await upsertCustomerContact({clientId:clientId!,botId:bot.id,name:fromName||fromEmail.split('@')[0],email:fromEmail,channel:'email',source:'message_extraction',customFields:{last_email_mailbox:toEmail}})
  const contactId: string = contact.id

  // ── 3. Session & Thread Resolution ────────────────────────────────────────
  let sessionRow: any = null
  const normalizedThreadSubject = subject.replace(/^\s*(?:(?:re|fw|fwd)\s*:\s*)+/i, '').trim().toLowerCase()
  const threadKey = crypto.createHash('sha256').update(`${bot.id}|${fromEmail}|${normalizedThreadSubject}`).digest('hex')

  // Search for active non-resolved email session
  const { data: activeSession } = await supabase
    .from('sessions')
    .select('id, session_id, mode, client_id, email_references')
    .eq('bot_id', bot.id)
    .eq('channel', 'email')
    .eq('email_thread_key', threadKey)
    .neq('mode', 'resolved')
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (activeSession) {
    sessionRow = activeSession
  } else {
    const newSessionId = `em_${fromEmail.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 16)}_${Date.now().toString(36)}`
    const { data: createdSession } = await supabase
      .from('sessions')
      .insert({
        client_id: clientId,
        bot_id: bot.id,
        session_id: newSessionId,
        contact_id: contactId,
        channel: 'email',
        email_subject: subject,
        email_thread_key: threadKey,
        email_message_id: messageId || null,
        email_references: [inReplyTo].filter(Boolean),
        mode: 'ai',
        last_message_at: new Date().toISOString(),
      })
      .select('id, session_id, mode, client_id, email_references')
      .single()

    sessionRow = createdSession
  }

  if (!sessionRow) {
    console.error('[Email Webhook] Failed to resolve or create session')
    return
  }

  const resolvedSessionId = sessionRow.session_id || sessionRow.id
  const currentMode = sessionRow.mode || 'ai'

  // ── 4. Log Inbound Customer Message via writeMessage() ────────────────────
  // writeMessage handles Postgres insert + Redis CAS forward set + Supabase Realtime broadcast
  const formattedContent = subject && subject !== 'No Subject'
    ? `**Subject: ${subject}**\n\n${messageText}`
    : messageText

  await writeMessage({
    sessionId: resolvedSessionId,
    role: 'user',
    content: formattedContent,
    mode: currentMode,
    channel: 'email',
    botId: bot.id,
    clientId,
    additionalSessionAliases: [sessionRow.id, sessionRow.session_id, resolvedSessionId].filter(Boolean),
  })

  // Update session last_message_at and email_subject
  await supabase
    .from('sessions')
    .update({ 
      last_message_at: new Date().toISOString(),
      email_subject: subject,
      email_message_id: messageId || null,
      email_references: Array.from(new Set([...(sessionRow.email_references || []), inReplyTo].filter(Boolean))),
    })
    .eq('id', sessionRow.id)

  // ── 5. Human Mode Gate ───────────────────────────────────────────────────
  // If human agent has taken over, do not auto-reply. Realtime broadcast already notified agent!
  if (currentMode === 'human') {
    console.log(`[Email Webhook] Session ${resolvedSessionId} is in human mode. Skipped AI reply.`)
    return
  }

  if (emailPolicy.auto_reply_mode === 'human_only') {
    await supabase.from('sessions').update({ email_status: 'needs_human', email_summary: subject, mode: 'waiting' }).eq('id', sessionRow.id)
    return
  }

  // Deterministic transactional flows run before free-form email triage. The
  // numbered options in `answer` make the same flow usable without rich UI.
  const serviceRole = emailPolicy.bot_role || 'support'
  let transactional: any = null
  if (serviceRole !== 'marketing' && String(emailPolicy.allow_order_lookup ?? 'true') !== 'false') transactional = await handleOrderTrackingFlow({clientId:clientId!,botId:bot.id,sessionId:resolvedSessionId,text:messageText,channel:'email',knownContact:{name:fromName,email:fromEmail}})
  if (!transactional && serviceRole !== 'marketing') transactional = await handleCommerceFlow({clientId:clientId!,botId:bot.id,sessionId:resolvedSessionId,text:messageText,channel:'email',knownContact:{name:fromName,email:fromEmail}})
  if (!transactional && serviceRole !== 'marketing' && String(emailPolicy.allow_booking ?? 'true') !== 'false') transactional = await handleBookingFlow({clientId:clientId!,botId:bot.id,sessionId:resolvedSessionId,text:messageText,channel:'email',knownContact:{name:fromName,email:fromEmail}})
  if (transactional) {
    if (emailPolicy.auto_reply_mode === 'draft_all') {
      await supabase.from('sessions').update({email_status:'draft_pending',email_summary:subject,reply_summary:'Transactional response ready for approval',draft_reply:transactional.answer,mode:'human'}).eq('id',sessionRow.id)
      return
    }
    const sent = await enqueueEmailReply(clientId!,bot.id,{to:fromEmail,subject,body:transactional.answer,inReplyTo:messageId,brandName:bot.name||'Support Team',sessionId:resolvedSessionId,idempotencyKey:`${messageId}:transactional`})
    if (!sent.success) throw new Error(sent.error||'Email delivery failed')
    await writeMessage({sessionId:resolvedSessionId,role:'assistant',content:transactional.answer,mode:'ai',channel:'email',botId:bot.id,clientId,additionalSessionAliases:[sessionRow.id,sessionRow.session_id,resolvedSessionId].filter(Boolean)})
    return
  }

  // ── 6. RAG Pipeline & AI Auto-Reply ───────────────────────────────────────
  try {
    // 6a. Embed user message for semantic knowledge search
    const queryEmbedding = await embed(messageText)
    const embeddingStr = JSON.stringify(queryEmbedding)

    // Retrieve knowledge base chunks linked to bot
    const { data: linkedDatasets } = await supabase
      .from('bot_datasets')
      .select('dataset_id')
      .eq('bot_id', bot.id)

    const datasetIds = (linkedDatasets || []).map((d: any) => d.dataset_id).filter(Boolean)

    let chunks: any[] = []
    if (datasetIds.length > 0) {
      try {
        const { data: matched } = await supabase.rpc('match_chunks_by_datasets', {
          p_dataset_ids: datasetIds,
          p_embedding: embeddingStr,
          p_match_count: 5,
        })
        chunks = matched || []
      } catch {}
    }

    if (chunks.length === 0) {
      // Fallback matching by context_id if RPC dataset matching is empty
      try {
        const { data: contextChunks } = await supabase.rpc('match_chunks', {
          p_context_id: clientId,
          p_embedding: embeddingStr,
          p_match_count: 5,
        })
        chunks = contextChunks || []
      } catch {}
    }

    // 6b. Fetch recent history for conversational continuity
    const { data: recentMessages } = await supabase
      .from('messages')
      .select('role, content')
      .eq('session_id', resolvedSessionId)
      .order('created_at', { ascending: false })
      .limit(6)

    const history = (recentMessages || [])
      .reverse()
      .filter((m: any) => m.role === 'user' || m.role === 'assistant')
      .map((m: any) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))

    // 6c. Run Intelligent Email Triage Engine
    const triage = await triageEmail({
      clientId: clientId!,
      operationId: `email-draft:${messageId}`,
      subject,
      messageText,
      fromEmail,
      fromName,
      chunks,
      history,
      botName: bot.name,
      botPrompt: bot.prompt,
    })

    console.log(`[Email Webhook] Triage category for ${resolvedSessionId}: ${triage.category}`)

    // ── CASE A: SPAM FILTER ────────────────────────────────────────────────
    if (triage.category === 'spam') {
      await supabase
        .from('sessions')
        .update({
          email_status: 'spam',
          spam_reason: triage.spamReason || 'Classified as unsolicited/spam email',
          email_summary: triage.emailSummary,
          mode: 'human',
        })
        .eq('id', sessionRow.id)

      console.log(`[Email Webhook] Marked session ${resolvedSessionId} as SPAM. No auto-reply sent.`)
      return
    }

    // ── CASE B: ROUTINE / SIMPLE FAQ (Auto-Reply) ──────────────────────────
    if (triage.category === 'simple_faq' && triage.autoReply && emailPolicy.auto_reply_mode !== 'draft_all') {
      const sent = await enqueueEmailReply(clientId!, bot.id, {
          to: fromEmail,
          subject,
          body: triage.autoReply,
          inReplyTo: messageId,
          brandName: bot.name || 'Support Team', sessionId: resolvedSessionId, idempotencyKey: `${messageId}:faq`
        })
      if (!sent.success) throw new Error(sent.error || 'Email delivery could not be queued')

      await writeMessage({
        sessionId: resolvedSessionId,
        role: 'assistant',
        content: triage.autoReply,
        mode: 'ai',
        channel: 'email',
        botId: bot.id,
        clientId,
        additionalSessionAliases: [sessionRow.id, sessionRow.session_id, resolvedSessionId].filter(Boolean),
      })

      await supabase
        .from('sessions')
        .update({
          email_status: 'auto_replied',
          email_summary: triage.emailSummary,
          reply_summary: triage.replySummary || 'Direct FAQ auto-reply sent',
        })
        .eq('id', sessionRow.id)

      return
    }

    // ── CASE C: COMPLEX BUSINESS INQUIRY (WITH CONTEXT) ───────────────────
    // Bot crafts draft reply, generates 1-line email summary & 1-line reply summary.
    // DOES NOT SEND! Stored for human agent 1-click approval in /bots/emails.
    if (triage.category === 'complex_business' || (triage.category === 'simple_faq' && triage.autoReply && emailPolicy.auto_reply_mode === 'draft_all')) {
      await supabase
        .from('sessions')
        .update({
          email_status: 'draft_pending',
          email_summary: triage.emailSummary,
          reply_summary: triage.replySummary || 'Proposed business response formulated',
          draft_reply: triage.draftReply || triage.autoReply || '',
          mode: 'human',
        })
        .eq('id', sessionRow.id)

      console.log(`[Email Webhook] Session ${resolvedSessionId}: Complex business inquiry. Draft reply pending human approval.`)
      return
    }

    // ── CASE D: COMPLEX INQUIRY (NO CONTEXT / NEEDS HUMAN) ─────────────────
    // Low confidence or missing knowledge base coverage. Handover to human!
    await supabase
      .from('sessions')
      .update({
        email_status: 'needs_human',
        email_summary: triage.emailSummary,
        mode: 'waiting',
      })
      .eq('id', sessionRow.id)

    try {
      await supabase.from('tickets').insert({
        client_id: clientId,
        bot_id: bot.id,
        contact_id: contactId,
        customer_email: fromEmail,
        customer_name: fromName,
        session_id: sessionRow.id,
        subject: `Email Support: ${subject}`,
        description: messageText,
        status: 'open',
        source: 'email'
      })
    } catch {}

    console.log(`[Email Webhook] Session ${resolvedSessionId}: Handed over to human agent.`)

  } catch (aiErr: any) {
    console.error('[Email Webhook AI error]:', aiErr)
    await supabase.from('sessions').update({email_status:'needs_human',email_summary:subject,mode:'waiting'}).eq('id',sessionRow.id)
  }
}
