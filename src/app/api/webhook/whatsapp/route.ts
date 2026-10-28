import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { embed } from '@/lib/embeddings'
import { generateAnswerUnified } from '@/lib/gemini'
import { sendWhatsAppMessage, markAsRead } from '@/lib/whatsapp'
import { redis } from '@/lib/redis'
import { withTimeout } from '@/lib/utils/withTimeout'
import { verifySha256Signature } from '@/lib/webhookSecurity'
import { handleBookingFlow } from '@/lib/bookingFlow'
import { handleCommerceFlow } from '@/lib/commerceFlow'
import { FRIENDLY_RETRY_MESSAGE } from '@/lib/customerErrorMessage'
import { decryptConfigSecrets } from '@/lib/security/secretVault'
import {upsertCustomerContact} from '@/lib/customerContacts'
import {createHash} from 'node:crypto'
import {qstash} from '@/lib/qstash'
import {verifyWebhookSecret} from '@/lib/webhookSecurity'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ═══════════════════════════════════════════════════════════════
// GET — Meta Webhook Verification Handshake
// Meta sends: hub.mode=subscribe, hub.verify_token=<your token>, hub.challenge=<random string>
// We must return the challenge if the token matches.
// ═══════════════════════════════════════════════════════════════
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get('hub.mode')
  const token = req.nextUrl.searchParams.get('hub.verify_token')
  const challenge = req.nextUrl.searchParams.get('hub.challenge')

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WhatsApp Webhook] Verification successful')
    return new NextResponse(challenge, { status: 200 })
  }

  console.warn('[WhatsApp Webhook] Verification failed — token mismatch')
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ═══════════════════════════════════════════════════════════════
// POST — Incoming WhatsApp Messages
// Meta sends a webhook payload when a user messages the business number.
// ═══════════════════════════════════════════════════════════════
export async function POST(req: NextRequest) {
  const workerSecret=process.env.WHATSAPP_WORKER_SECRET||process.env.EMAIL_WEBHOOK_SECRET
  const buffered=req.headers.get('x-whatsapp-buffer-worker')==='1'&&verifyWebhookSecret(req,workerSecret)
  try {
    const rawBody = await req.text()
    if (!buffered&&!verifySha256Signature(
      rawBody,
      req.headers.get('x-hub-signature-256'),
      process.env.META_APP_SECRET
    )) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = JSON.parse(rawBody)

    // Production ingestion acknowledges Meta after a durable Redis write and a
    // signed QStash handoff. Slow database/AI work runs in the background.
    if(!buffered&&process.env.QSTASH_TOKEN&&process.env.UPSTASH_REDIS_REST_URL&&process.env.UPSTASH_REDIS_REST_TOKEN){
      const eventId=createHash('sha256').update(rawBody).digest('hex'),key=`wa:webhook:payload:${eventId}`
      await redis.set(key,rawBody,{ex:3600})
      const origin=(process.env.NEXT_PUBLIC_APP_URL||req.nextUrl.origin).replace(/\/$/,'')
      await qstash.publishJSON({url:`${origin}/api/workers/whatsapp-webhook-events`,body:{key,eventId},retries:8,deduplicationId:`wa_webhook_${eventId}`,headers:workerSecret?{'x-webhook-secret':workerSecret}:undefined})
      return NextResponse.json({status:'queued'},{status:200})
    }

    // Meta always wraps in { object: 'whatsapp_business_account', entry: [...] }
    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ignored' }, { status: 200 })
    }

    // Process each entry (usually just one)
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value
        if (change.field === 'message_template_status_update') {
          await handleTemplateQualityEvent(value)
          continue
        }
        if (change.field === 'phone_number_quality_update') {
          await handlePhoneQualityEvent(value)
          continue
        }
        if (change.field !== 'messages') continue
        const phoneNumberId = value?.metadata?.phone_number_id
        if (!phoneNumberId) continue

        for (const status of value.statuses || []) {
          await handleDeliveryStatus(status)
        }

        // Process each incoming message
        for (const message of value.messages || []) {
          const senderPhone = message.from          // e.g. "919876543210"
          const messageText = message.text?.body || message.button?.text || message.interactive?.button_reply?.title
          const buttonPayload = message.button?.payload || message.interactive?.button_reply?.id
          const waMessageId = message.id             // Meta's message ID

          if (!messageText?.trim()) continue

          // Fire and forget: mark as read (blue ticks)
          // We'll get the access token below, so we do this after lookup

          await handleIncomingMessage(phoneNumberId, senderPhone, messageText.trim(), waMessageId, buttonPayload, message.context?.id)
        }
      }
    }

    // Meta expects a 200 response quickly
    return NextResponse.json({ status: 'ok' }, { status: 200 })
  } catch (err: any) {
    console.error('[WhatsApp Webhook Error]', err.message)
    // Buffered work must retry. Direct Meta calls return 503 so Meta retains
    // the event rather than silently losing it.
    return NextResponse.json({ status: 'error' }, { status: buffered ? 500 : 503 })
  }
}

// ═══════════════════════════════════════════════════════════════
// CORE HANDLER — Process one incoming message end-to-end
// ═══════════════════════════════════════════════════════════════
async function handleIncomingMessage(
  phoneNumberId: string,
  senderPhone: string,
  messageText: string,
  waMessageId: string,
  buttonPayload?: string,
  contextMessageId?: string
) {
  // 1. Look up the bot_channel config by phone_number_id
  let { data: channel } = await supabase
    .from('bot_channels')
    .select('id, bot_id, credentials, status')
    .eq('channel_type', 'whatsapp')
    .eq('identifier', phoneNumberId)
    .maybeSingle()

  let accessToken = channel?.credentials?.access_token
  if (!channel) {
    const { data: integration } = await supabase.from('channel_integrations').select('id,client_id,bot_id,config,status').eq('channel','whatsapp').eq('status','active').eq('config->>phone_number_id',phoneNumberId).maybeSingle()
    if (integration) {
      const config = decryptConfigSecrets(integration.client_id, integration.config || {})
      channel = { id: integration.id, bot_id: integration.bot_id, credentials: config, status: 'connected' }
      accessToken = config.api_key || config.access_token
    }
  }
  if (!channel || channel.status !== 'connected') { console.error(`[WhatsApp] No connected channel found for phone_number_id: ${phoneNumberId}`); return }
  if (!accessToken) {
    console.error(`[WhatsApp] No access_token in credentials for channel ${channel.id}`)
    return
  }

  // Mark as read immediately
  markAsRead(phoneNumberId, accessToken, waMessageId)

  // 2. Get the bot → client → context_id
  const { data: bot } = await supabase
    .from('bots')
    .select('id, client_id, fallback_message, handoff_message, system_prompt, bot_tone, tone, response_length, use_emojis, bot_flow')
    .eq('id', channel.bot_id)
    .single()

  if (!bot) {
    console.error(`[WhatsApp] Bot not found for bot_id: ${channel.bot_id}`)
    return
  }

  const serviceWindowUntil=new Date(Date.now()+24*60*60*1000).toISOString(),inboundAt=new Date().toISOString()
  const contact=await upsertCustomerContact({clientId:bot.client_id,botId:bot.id,name:`WhatsApp ${senderPhone.slice(-4)}`,phone:`+${senderPhone}`,channel:'whatsapp',source:'whatsapp',defaultCountry:channel.credentials?.default_country}).catch(()=>null)
  if(contact?.id)await supabase.from('contacts').update({last_whatsapp_inbound_at:inboundAt,whatsapp_service_window_until:serviceWindowUntil}).eq('id',contact.id).eq('client_id',bot.client_id)

  const optOut = /^(stop|unsubscribe|cancel promotions|opt[ -]?out)$/i.test(messageText.trim()) || buttonPayload === 'OPT_OUT_PROMO'
  if (contextMessageId && buttonPayload) {
    const click = await supabase.rpc('bulk_whatsapp_record_click', { p_wamid: contextMessageId })
    if (click.data?.recorded) await redis.hincrby(`campaign:${click.data.campaign_id}:metrics`, 'clicked', 1).catch(() => {})
  }
  if (optOut) {
    const source = contextMessageId ? (await supabase.from('campaign_recipients').select('campaign_id').eq('provider_message_id', contextMessageId).maybeSingle()).data : null
    await supabase.rpc('bulk_whatsapp_opt_out', { p_client: bot.client_id, p_phone: senderPhone, p_campaign: source?.campaign_id || null })
    if (source?.campaign_id) {
      await redis.hincrby(`campaign:${source.campaign_id}:metrics`, 'opted_out', 1).catch(() => {})
      const campaign = (await supabase.from('campaigns').select('recipients_count,opt_out_count,status').eq('id', source.campaign_id).maybeSingle()).data
      if (campaign?.status === 'sending' && Number(campaign.recipients_count || 0) >= 50 && Number(campaign.opt_out_count || 0) / Number(campaign.recipients_count || 1) > 0.015) await pauseWhatsAppCampaigns([source.campaign_id], 'Opt-outs exceeded 1.5%')
    }
    await sendWhatsAppMessage(phoneNumberId, accessToken, senderPhone, 'You have been unsubscribed from promotional WhatsApp messages. You can still message us for support anytime.')
    return
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, context_id')
    .eq('id', bot.client_id)
    .single()

  if (!client?.context_id) {
    console.error(`[WhatsApp] Client has no context_id for client_id: ${bot.client_id}`)
    await sendWhatsAppMessage(phoneNumberId, accessToken, senderPhone, bot.fallback_message || "Sorry, I'm not set up yet.")
    return
  }

  // 3. Find or create a session for this sender
  const sessionId = `wa_${senderPhone}_${client.context_id}`

  const { data: existingSession } = await supabase
    .from('sessions')
    .select('id,session_id,mode,contact_id')
    .eq('session_id', sessionId)
    .maybeSingle()

  if (!existingSession) {
    // Create a new session
    await supabase.from('sessions').insert({
      session_id: sessionId,
      bot_id: bot.id,
      client_id: client.id,
      channel: 'whatsapp',
      visitor_name: senderPhone,
      contact_id: contact?.id || null,
      mode: 'ai',
      status: 'active',
      last_whatsapp_inbound_at: inboundAt,
      whatsapp_service_window_until: serviceWindowUntil,
    })
  } else {
    await supabase.from('sessions').update({contact_id:existingSession.contact_id||contact?.id||null,last_whatsapp_inbound_at:inboundAt,whatsapp_service_window_until:serviceWindowUntil}).eq('id',existingSession.id)
  }

  // Check if session is in human mode — if so, just log the message but don't auto-reply
  if (existingSession?.mode === 'human') {
    await logMessage(client.context_id, sessionId, bot.id, 'user', messageText, 'whatsapp')
    // The human agent will reply via the Inbox UI
    return
  }

  // 4. Log the user message
  await logMessage(client.context_id, sessionId, bot.id, 'user', messageText, 'whatsapp')

  const booking = await handleCommerceFlow({clientId:client.id,botId:bot.id,sessionId,text:messageText,channel:'whatsapp'})
    || await handleBookingFlow({clientId:client.id,botId:bot.id,sessionId,text:messageText,channel:'whatsapp'})
  if (booking) {
    await sendWhatsAppMessage(phoneNumberId, accessToken, senderPhone, booking.answer)
    await logMessage(client.context_id, sessionId, bot.id, 'assistant', booking.answer, 'whatsapp')
    return
  }

  // 5. Fetch recent history for multi-turn context
  const { data: recentMessages } = await supabase
    .from('messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(6)

  const history = (recentMessages || [])
    .reverse()
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  // Fast-path: Check exact question cache (<2ms)
  const b64Q = Buffer.from(messageText.toLowerCase().trim()).toString('base64')
  const cacheKey = `chat_cache:${client.context_id}:${b64Q}`
  const cachedAnswer = await redis.get<{ answer: string; source_url: string | null }>(cacheKey).catch(() => null)

  if (cachedAnswer?.answer) {
    await sendWhatsAppMessage(phoneNumberId, accessToken, senderPhone, cachedAnswer.answer)
    await logMessage(client.context_id, sessionId, bot.id, 'assistant', cachedAnswer.answer, 'whatsapp')
    return
  }

  // 7. RAG Pipeline: Embedding & Vector retrieval
  const questionEmbedding = await embed(messageText)
  const embeddingStr = JSON.stringify(questionEmbedding)

  // FAQs and documents share the same bot-linked Knowledge Base retrieval.
  const {data:linked}=await supabase.from('bot_datasets').select('dataset_id').eq('bot_id',bot.id)
  const datasetIds=(linked||[]).map((row:any)=>row.dataset_id)
  const { data: chunks } = datasetIds.length
    ? await supabase.rpc('match_chunks_by_datasets',{p_dataset_ids:datasetIds,p_embedding:embeddingStr,p_match_count:5})
    : await supabase.rpc('match_chunks',{p_context_id:client.context_id,p_embedding:embeddingStr,p_match_count:5})

  const botPrompt = bot.system_prompt || bot.bot_flow?.system_prompt || bot.bot_flow?.prompt || null
  const botTone = bot.bot_tone || bot.tone || bot.bot_flow?.bot_tone || null
  const responseLength = bot.response_length || bot.bot_flow?.response_length || null
  const useEmojis = bot.use_emojis ?? bot.bot_flow?.use_emojis ?? null

  let rawAnswer:string
  try{({answer:rawAnswer}=await generateAnswerUnified({
      question: messageText,
      knowledgeChunks: chunks || [],
      history,
      clientId: client.id,
      botId: bot.id,
      botPrompt,
      botTone,
      responseLength,
      useEmojis,
      onToolCall: async (_name, args) => {
        const id = args?.identifier ? ` for ${args.identifier}` : ''
        sendWhatsAppMessage(phoneNumberId, accessToken, senderPhone, `🔍 Checking our records${id}...`).catch(() => {})
      },
    }))}catch(error:any){console.error('[WhatsApp] AI response failed:',error?.message||error);rawAnswer=FRIENDLY_RETRY_MESSAGE}

  let aiReply = rawAnswer

  // Check for handoff
  const isHandoff = aiReply.includes('[HANDOFF]')
  if (isHandoff) {
    aiReply = bot.handoff_message || "I am connecting you to a human agent who can assist you further. Please hold on."
    
    // Update session mode
    await supabase.from('sessions').update({ mode: 'waiting' }).eq('session_id', sessionId)
    
    // Create handoff request
    await supabase.from('handoff_requests').insert({
      session_id: sessionId,
      client_id: client.id,
      reason: 'AI triggered handoff'
    })
  }

  // 8. Send the AI reply back via WhatsApp
  const sendResult = await sendWhatsAppMessage(phoneNumberId, accessToken, senderPhone, aiReply)

  if (!sendResult.success) {
    console.error(`[WhatsApp] Failed to send reply: ${sendResult.error}`)
  }

  // 9. Log the AI response & cache for future repeat questions
  await logMessage(client.context_id, sessionId, bot.id, 'assistant', aiReply, 'whatsapp')
  if (!isHandoff && (chunks || []).length > 0) {
    redis.set(cacheKey, { answer: aiReply, source_url: null }, { ex: 21600 }).catch(() => {})
  }
}

async function handleDeliveryStatus(status: any) {
  const messageId = String(status?.id || ''), state = String(status?.status || '').toLowerCase()
  if (!messageId || !['sent', 'delivered', 'read', 'failed'].includes(state)) return
  const eventKey = `wa:evt:${messageId}:${state}`
  const first = await redis.set(eventKey, '1', { nx: true, ex: 86400 * 30 }).catch(() => 'database-fallback')
  if (!first) return
  const errorCode = Number(status?.errors?.[0]?.code || 0) || null
  const timestamp = status?.timestamp ? new Date(Number(status.timestamp) * 1000).toISOString() : new Date().toISOString()
  const result = await supabase.rpc('bulk_whatsapp_record_status_event', { p_wamid: messageId, p_status: state, p_error_code: errorCode, p_timestamp: timestamp })
  const update = result.data
  if (!update?.recorded || !update.campaign_id) return
  const pipeline = redis.pipeline()
  if (Number(update.delivered_delta)) pipeline.hincrby(`campaign:${update.campaign_id}:metrics`, 'delivered', Number(update.delivered_delta))
  if (Number(update.read_delta)) pipeline.hincrby(`campaign:${update.campaign_id}:metrics`, 'read', Number(update.read_delta))
  if (Number(update.failed_delta)) pipeline.hincrby(`campaign:${update.campaign_id}:metrics`, 'failed', Number(update.failed_delta))
  await pipeline.exec().catch(() => {})
  if (state === 'failed') {
    const campaign = (await supabase.from('campaigns').select('sent_count,failed_count,status').eq('id', update.campaign_id).maybeSingle()).data
    const attempted = Number(campaign?.sent_count || 0) + Number(campaign?.failed_count || 0)
    const hardFailures=Number((await supabase.from('whatsapp_campaign_events').select('id',{count:'exact',head:true}).eq('campaign_id',update.campaign_id).eq('event_type','failed').neq('metadata->>error_code','131049')).count||0)
    if (campaign?.status === 'sending' && attempted >= 50 && hardFailures / attempted > 0.06) await pauseWhatsAppCampaigns([update.campaign_id], 'Delivery failures exceeded 6%')
  }
}

async function pauseWhatsAppCampaigns(ids: string[], reason: string) {
  if (!ids.length) return
  const now = new Date().toISOString()
  await supabase.from('campaigns').update({ status: 'paused_circuit_breaker', paused_at: now, failure_reason: reason, updated_at: now }).in('id', ids).in('status', ['sending', 'scheduled'])
  await Promise.all(ids.map(async id => { await redis.set(`campaign:${id}:paused`, 'circuit_breaker', { ex: 86400 * 30 }).catch(() => {}); await redis.hset(`campaign:${id}:metrics`, { status: 'paused_circuit_breaker' }).catch(() => {}) }))
}

async function handleTemplateQualityEvent(value: any) {
  const event = String(value?.event || value?.status || '').toUpperCase(), metaId = String(value?.message_template_id || value?.id || ''), name = String(value?.message_template_name || value?.name || '')
  if (!['APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'FLAGGED', 'FIRST_PAUSE', 'SECOND_PAUSE', 'RATE_LIMITING_PAUSE'].includes(event)) return
  const normalized = event.includes('PAUSE') ? 'PAUSED' : event
  let query = supabase.from('whatsapp_templates').select('id').limit(100)
  query = metaId ? query.eq('meta_template_id', metaId) : query.eq('name', name)
  const templates = (await query).data || [], ids = templates.map(row => row.id)
  if (!ids.length) return
  await supabase.from('whatsapp_templates').update({ status: normalized, rejection_reason: value?.reason || null, updated_at: new Date().toISOString() }).in('id', ids)
  if (['PAUSED', 'DISABLED', 'FLAGGED'].includes(normalized)) {
    const campaigns = (await supabase.from('campaigns').select('id').in('wa_template_id', ids).in('status', ['sending', 'scheduled'])).data || []
    await pauseWhatsAppCampaigns(campaigns.map(row => row.id), `Meta template ${normalized.toLowerCase()}`)
  }
}

async function handlePhoneQualityEvent(value: any) {
  const quality = String(value?.quality_score || value?.quality_rating || '').toUpperCase(), phoneId = String(value?.phone_number_id || value?.metadata?.phone_number_id || ''),currentLimit=String(value?.current_limit||value?.messaging_limit||'').toUpperCase()
  if (!phoneId) return
  const active = (await supabase.from('campaigns').select('id,client_id').eq('wa_phone_number_id', phoneId).in('status', ['sending', 'scheduled'])).data || []
  const existing=(await supabase.from('whatsapp_phone_health').select('current_limit,client_id').eq('phone_number_id',phoneId).maybeSingle()).data,clientId=existing?.client_id||active[0]?.client_id
  const rank=(limit:string)=>{if(limit==='UNLIMITED')return Number.MAX_SAFE_INTEGER;const match=limit.match(/(\d+)(K|M)?/);if(!match)return 0;return Number(match[1])*(match[2]==='M'?1_000_000:match[2]==='K'?1_000:1)}
  const limitDropped=!!existing?.current_limit&&!!currentLimit&&rank(currentLimit)<rank(String(existing.current_limit))
  const numeric=rank(currentLimit),tier=currentLimit.includes('UNLIMITED')?'TIER_UNLIMITED':numeric<=250?'TIER_250':numeric<=1000?'TIER_1K':numeric<=10000?'TIER_10K':'TIER_100K',event=String(value?.event||'').toUpperCase(),phoneStatus=['BLOCKED','RESTRICTED'].includes(event)?event:['FLAGGED','DOWNGRADED'].includes(event)||quality==='RED'?'FLAGGED':'CONNECTED'
  if(clientId)await supabase.from('whatsapp_phone_health').upsert({phone_number_id:phoneId,client_id:clientId,waba_id:value?.waba_id||null,quality_rating:quality||'UNKNOWN',current_limit:currentLimit||existing?.current_limit||null,messaging_limit_tier:tier,max_daily_recipients:tier==='TIER_UNLIMITED'?2147483647:Math.max(250,numeric||1000),status:phoneStatus,previous_limit:limitDropped?existing.current_limit:null,last_event:value,updated_at:new Date().toISOString()},{onConflict:'phone_number_id'})
  if (!['YELLOW', 'RED'].includes(quality)&&!limitDropped&&phoneStatus==='CONNECTED') return
  await pauseWhatsAppCampaigns(active.map(row => row.id), limitDropped?`WhatsApp messaging limit dropped from ${existing.current_limit} to ${currentLimit}`:`WhatsApp phone quality dropped to ${quality}`)
}

// ═══════════════════════════════════════════════════════════════
// HELPER — Log a message to the messages table
// ═══════════════════════════════════════════════════════════════
async function logMessage(
  contextId: string,
  sessionId: string,
  botId: string,
  role: string,
  content: string,
  channel: string
) {
  await supabase.from('messages').insert({
    context_id: contextId,
    session_id: sessionId,
    bot_id: botId,
    role,
    content,
    channel,
    mode: 'ai',
  })
}
