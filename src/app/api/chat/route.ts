import { after, NextRequest, NextResponse } from 'next/server'
import { supabase, broadcastRealtime } from '@/lib/supabase'
import { chatRoomChannel, storeInboxChannel } from '@/lib/realtime/channels'
import { embed, hashText, embeddingCacheKey as embeddingCacheKeyFor, peekLocalEmbedding, generateAndCacheEmbedding } from '@/lib/embeddings'
import { generateAnswer } from '@/lib/groq'
import { generateAnswerStream, generateAnswerUnified, DataCollectionConfig, KnownContactInfo, GeminiMediaAttachment } from '@/lib/gemini'
import { chatRateLimit, sessionRateLimit, getIP } from '@/lib/ratelimit'
import { getCorsHeaders, handleOptions } from '@/lib/cors'
import { lookupInDataSource, lookupByDataSourceId, extractLookupKey, extractOrderDetails, searchConnectedDatabases } from '@/lib/datasource'
import { fireWebhook } from '@/lib/webhooks'
import { isSpam } from '@/lib/guardrails'
import { redis } from '@/lib/redis'
import { sendMessage as chatwootSendMessage } from '@/lib/chatwoot'
import { isUUID } from '@/lib/utils'
import { writeMessage } from '@/lib/chat/writeMessage'
import { withTimeout } from '@/lib/utils/withTimeout'
import { setLastIdIfGreater } from '@/lib/redis/atomic'
import { cacheMessagePayload } from '@/lib/redis/messageCache'
import { 
  extractEntitiesRegex, 
  stitchContact, 
  evaluateTriggers, 
  recordTriggerPrompt, 
  resolvePendingPrompts,
  isLeadCaptureDecline,
  parseExtractTag,
  validateExtractedEntities
} from '@/lib/leadCapture'
import { handleSupportFlow, isPotentialSupportFlowRequest } from '@/lib/supportFlow'
import { upsertCustomerContact } from '@/lib/customerContacts'
import { FRIENDLY_RETRY_MESSAGE } from '@/lib/customerErrorMessage'
import { getEffectiveEntitlements, type Entitlements } from '@/lib/saas/entitlements'
import { reserveAiUsageFast } from '@/lib/saas/fastUsage'
import { verifyWidgetSessionToken } from '@/lib/security/widgetSessionToken'
import { localRateLimit } from '@/lib/security/rateLimitFallback'
import { ChatRequestContext } from '@/lib/chat/requestContext'
import { loadChatBootstrap, loadChatLeadState } from '@/lib/chat/bootstrap'
import { loadAtomicChatTurnContext } from '@/lib/chat/turnContext'
import { pureAnswerKey, readPureAnswer, rememberPureAnswer, persistPureAnswer, appendScheduledLeadPrompt } from '@/lib/chat/answerCache'
import { buildRetrievalQuery, canonicalizeQuery, isContactVerifiedInRecord, pruneRetrievedChunks } from '@/lib/chat/ragOptimization'
import { persistFlowTurn } from '@/lib/chat/persistFlowTurn'

async function resolveActiveDatasetIds(clientId: string, botId: string) {
  const cacheKey = `bot_dataset_ids:${botId}`
  const cached = await withTimeout(redis.get<string[]>(cacheKey), 300, null).catch(() => null)
  if (cached) return cached
  const { data: linked } = await supabase.from('bot_datasets').select('dataset_id,datasets(active_from,active_until)').eq('bot_id', botId)
  const now = Date.now()
  let ids = (linked || []).filter((link: any) => {
    const ds = link.datasets
    return !ds || (!ds.active_from || Date.parse(ds.active_from) <= now) && (!ds.active_until || Date.parse(ds.active_until) > now)
  }).map((link: any) => link.dataset_id)
  if (!ids.length) ids = ((await supabase.from('datasets').select('id').eq('client_id', clientId)).data || []).map((row: any) => row.id)
  void redis.set(cacheKey, ids, { ex: 300 }).catch(() => {})
  return ids
}

async function searchLexicalChunks(datasetIds:string[],contextId:string,queryText:string){
  if(!queryText.trim())return[]
  let query=supabase.from('chunks').select('id,text,source_url').eq('active',true)
  query=datasetIds.length?query.in('dataset_id',datasetIds):query.eq('context_id',contextId)
  const {data,error}=await query.textSearch('fts',queryText,{config:'english',type:'websearch'}).limit(5)
  if(error)return[]
  return(data||[]).map((row:any)=>({...row,similarity:.65,rrf_score:.02}))
}

function streamStaticAnswer(
  answer: string,
  source: string = 'manual_faq',
  cors: Record<string, string>,
  onComplete?: () => Promise<any>
) {
  if (onComplete) after(async () => {
    try { await onComplete() } catch (err) { console.error('[streamStaticAnswer onComplete error]:', err) }
  })
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      const words = answer.split(' ')
      const chunkSize = 4
      for (let i = 0; i < words.length; i += chunkSize) {
        const slice = words.slice(i, i + chunkSize).join(' ') + (i + chunkSize < words.length ? ' ' : '')
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: slice })}\n\n`))
        if (i + chunkSize < words.length) {
          await new Promise(r => setTimeout(r, 15))
        }
      }

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({
        done: true,
        source_url: null,
        mode: 'ai',
        source,
      })}\n\n`))
      controller.close()

    }
  })

  return new Response(readable, {
    headers: {
      ...cors,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    }
  })
}

async function* createSingleTextStream(text: string) {
  yield text
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rawContextId = req.nextUrl.searchParams.get('ctx')?.trim() ?? ''
  const contextId = (rawContextId === 'YOUR_CLIENT_ID' || rawContextId === 'null' || rawContextId === 'undefined') ? '' : rawContextId
  const cors = await getCorsHeaders(contextId, origin)
  return handleOptions(cors)
}

export async function POST(req: NextRequest) {
    const requestStartedAt=performance.now()
    let previousStageAt=requestStartedAt
    const stageTimings:string[]=[]
    const markStage=(name:string)=>{const now=performance.now();stageTimings.push(`${name};dur=${Math.max(0,Math.round(now-previousStageAt))}`);previousStageAt=now}
    const origin = req.headers.get('origin')
    const rawContextId = req.nextUrl.searchParams.get('ctx')?.trim() ?? ''
    const contextId = (rawContextId === 'YOUR_CLIENT_ID' || rawContextId === 'null' || rawContextId === 'undefined') ? '' : rawContextId
    const urlBotId = req.nextUrl.searchParams.get('bot')?.trim() || null
    const cors = await getCorsHeaders(contextId, origin, urlBotId)
    markStage('cors')

    try {
      // 1. RATE LIMIT — run both limiters in parallel (saves ~370ms vs sequential)
      // Benchmark showed chatRateLimit=1290ms then sessionRateLimit=372ms sequentially.
      // Promise.all runs both simultaneously, cost = max(1290, 372) = 1290ms instead of 1662ms.
      const ip = getIP(req)
      const body = await req.json().catch(() => ({}))
      const interaction = body?.input && typeof body.input === 'object' ? body.input : undefined
      const interactionText = interaction?.kind==='text'&&typeof interaction?.value==='string'?interaction.value:(interaction?.label || (typeof interaction?.value === 'string' ? interaction.value : interaction?.kind || ''))
      const question = body.question ?? body.query ?? body.message ?? interactionText
      const session_id = body.session_id ?? body.sessionId
      const clientMessageId = typeof body.client_id === 'string'
        ? body.client_id.slice(0, 120)
        : undefined
      const clientBotMessageId = typeof body.bot_client_id === 'string'
        ? body.bot_client_id.slice(0, 120)
        : undefined
      const { history = [], visitor_language, media_url, media_type, media_size_bytes, media_storage_path, channel = 'web' } = body
      const supportsFlowHint=Object.prototype.hasOwnProperty.call(body,'active_flow_id')
      const activeFlowId=typeof body.active_flow_id==='string'?body.active_flow_id:''
      let effectiveBotId = urlBotId || body?.bot_id || body?.botId || null
      const wantsStream = req.headers.get('accept')?.includes('text/event-stream') || req.nextUrl.searchParams.get('stream') === 'true'

      let remaining = 60

      // The homepage preview may use one explicitly configured demo bot. Never
      // select an arbitrary tenant's latest bot in production.
      if (!contextId && !effectiveBotId) {
        effectiveBotId = process.env.DEMO_BOT_ID || null
      }

      if ((!question?.trim() && !media_url) || (!contextId && !effectiveBotId)) {
        return NextResponse.json(
          { error: 'question (or photo attachment) and ctx (or bot) are required' },
          { status: 400, headers: cors }
        )
      }

      const userTextQuestion = (question?.trim() || '').slice(0, 500)
      const cleanQuestion = (userTextQuestion || (media_url ? 'Analyze this image and describe what you see, or answer any question related to it.' : '')).slice(0, 500)
      const { canonical: canonicalQuestion, entitySignature } = canonicalizeQuery(cleanQuestion)
      const retrievalQuery = buildRetrievalQuery(cleanQuestion, history)
      const isExplicitHandoff = /\b(human|agent|person|representative|talk to someone|help desk|manager)\b/i.test(cleanQuestion)
      const likelyDeterministicFlow=isExplicitHandoff||isPotentialSupportFlowRequest(cleanQuestion)||!!interaction?.flowId||!!activeFlowId

      // STAGE 0: Guardrails
      if (isSpam(cleanQuestion)) {
        return NextResponse.json(
          { error: 'Message flagged by security policies.' },
          { status: 400, headers: cors }
        )
      }

      let widgetClaims
      try {
        widgetClaims = verifyWidgetSessionToken(req.headers.get('x-widget-session-token') || '', 'widget')
        if (widgetClaims.sessionId !== session_id || (effectiveBotId && widgetClaims.botId !== effectiveBotId)) throw new Error('SESSION_SCOPE_MISMATCH')
        if (contextId && contextId !== widgetClaims.workspaceId && widgetClaims.contextId && contextId !== widgetClaims.contextId) throw new Error('CONTEXT_SCOPE_MISMATCH')
        effectiveBotId = widgetClaims.botId
      } catch {
        return NextResponse.json({ error: 'This chat session has expired. Refresh the widget and try again.' }, { status: 401, headers: cors })
      }

      // One bounded Redis batch carries lead state and the embedding cache
      // alongside the database turn-context request. A remote embedding call
      // starts only after that batch misses.
      const embedKey=!likelyDeterministicFlow&&!media_url?embeddingCacheKeyFor(retrievalQuery):null
      const localEmbedding=embedKey?peekLocalEmbedding(retrievalQuery):null
      const leadStatePromise=isExplicitHandoff
        ? Promise.resolve([null,true,2,null,[],null] as any[])
        : loadChatLeadState(session_id,embedKey)
      const speculativeEmbeddingPromise=embedKey
        ? leadStatePromise.then(state=>localEmbedding||(Array.isArray(state[5])?state[5]:null)||generateAndCacheEmbedding(retrievalQuery)).catch(()=>null)
        : null
      const atomicTurnPromise=isExplicitHandoff
        ? Promise.resolve(null)
        : loadAtomicChatTurnContext({clientId:widgetClaims.workspaceId,botId:widgetClaims.botId,sessionId:session_id,question:cleanQuestion})
      const supportRouteHintsPromise=likelyDeterministicFlow&&!isExplicitHandoff?redis.mget<any[]>(
        `strict_support_bot:${widgetClaims.botId}`,
        `order_tracking_flow:${widgetClaims.workspaceId}:${widgetClaims.botId}:${session_id}`,
        `commerce_flow:${widgetClaims.workspaceId}:${widgetClaims.botId}:${session_id}`,
        `booking_flow:${widgetClaims.workspaceId}:${widgetClaims.botId}:${session_id}`,
        `return_flow:${widgetClaims.botId}:${session_id}`,
        `support_flow:${widgetClaims.botId}:${session_id}`,
      ).catch(()=>null):null

      // The capability has been verified, so rate limiting and the scoped
      // Postgres/Redis context reads can safely occupy the same wall-clock
      // wave. Paid model work remains gated on both rate and entitlement.
      try {
        const [rateResult, sessRateResult] = await Promise.allSettled([
          withTimeout(chatRateLimit.limit(ip), 300),
          session_id ? withTimeout(sessionRateLimit.limit(session_id), 300) : Promise.resolve({ success: true, remaining: 30 }),
        ])
        if (rateResult.status === 'fulfilled') {
          remaining = rateResult.value.remaining
          if (!rateResult.value.success) {
            return NextResponse.json(
              { error: 'Too many requests. Please wait a few minutes.' },
              { status: 429, headers: { ...cors, 'X-RateLimit-Remaining': '0' } }
            )
          }
        } else if (!localRateLimit(`chat-ip:${ip}`, 10).success) {
          return NextResponse.json({ error: 'Chat is busy. Please wait a moment.' }, { status: 429, headers: cors })
        }
        if (sessRateResult.status === 'fulfilled' && session_id && !sessRateResult.value.success) {
          return NextResponse.json(
            { error: 'Too many messages in this session. Please wait a moment.' },
            { status: 429, headers: cors }
          )
        } else if (sessRateResult.status === 'rejected' && session_id && !localRateLimit(`chat-session:${session_id}`, 6).success) {
          return NextResponse.json({ error: 'Chat is busy. Please wait a moment.' }, { status: 429, headers: cors })
        }
      } catch {
        if (!localRateLimit(`chat-emergency:${ip}:${session_id || 'none'}`, 3).success) {
          return NextResponse.json({ error: 'Chat is busy. Please wait a moment.' }, { status: 429, headers: cors })
        }
      }
      markStage('rate_limit_parallel')

      // Fast heuristic check for explicit human request
      if (isExplicitHandoff) {
        const handoffMsg = "[HANDOFF]"
        logMessages(contextId || 'default', session_id, clientMessageId, userTextQuestion, handoffMsg, null, undefined, effectiveBotId || undefined, 'waiting').catch(() => {})
        return NextResponse.json(
          { answer: handoffMsg, source_url: null, mode: 'human' },
          { headers: cors }
        )
      }

      // ── FAST STAGE: resolve client/context from Redis (1h TTL) or Supabase ──
      const clientCacheKey = `client_ctx:${contextId || effectiveBotId || 'default'}`
      const cachedClient = widgetClaims.contextId !== undefined
        ? { id: widgetClaims.workspaceId, context_id: widgetClaims.contextId || null }
        : await redis.get<{ id: string; context_id: string | null }>(clientCacheKey).catch(() => null)

      // Resolve client from cache or DB
      let client: { id: string; context_id: string | null } | null = cachedClient

      if (!client && contextId) {
        const { data: byCtx } = await supabase.from('clients').select('id, context_id').eq('context_id', contextId).maybeSingle()
        client = byCtx

        if (!client && isUUID(contextId)) {
          const { data: byId } = await supabase.from('clients').select('id, context_id').eq('id', contextId).maybeSingle()
          client = byId
        }
      }

      if (!client && effectiveBotId) {
        const { data: botInfo } = await supabase.from('bots').select('client_id').eq('id', effectiveBotId).maybeSingle()
        if (botInfo?.client_id) {
          const { data: clientData } = await supabase.from('clients').select('id, context_id').eq('id', botInfo.client_id).maybeSingle()
          if (clientData) client = clientData
        }
      }

      let requestEntitlements: Entitlements | undefined
      let prefetchedBootstrap: Awaited<ReturnType<typeof loadChatBootstrap>> | undefined
      let prefetchedDatasetIds: string[] | null = null
      let prefetchedExactFaq: {answer:string;source_url:string|null}|null = null
      let atomicFaqChecked=false
      // Cache client for 1 hour to avoid repeated DB lookups
      if (client) {
        const [atomicTurn,prefetchedLeadState]=await Promise.all([atomicTurnPromise,leadStatePromise])
        if(atomicTurn){
          atomicFaqChecked=true
          requestEntitlements=atomicTurn.entitlements
          prefetchedBootstrap={...atomicTurn.bootstrap,leadState:prefetchedLeadState}
          prefetchedDatasetIds=atomicTurn.datasetIds
          prefetchedExactFaq=atomicTurn.faqMatch
          if(atomicTurn.contextId!==undefined)client={id:client.id,context_id:atomicTurn.contextId||null}
        }else{
          ;[requestEntitlements,prefetchedBootstrap]=await Promise.all([
            getEffectiveEntitlements(client.id),
            loadChatBootstrap(client.id,effectiveBotId!,session_id,prefetchedLeadState),
          ])
        }
        if (requestEntitlements.runtime_allowed === false || requestEntitlements.runtime_features?.['bots.enabled'] === false || requestEntitlements.restriction_stage === 'stopped') return NextResponse.json({answer:'This assistant is temporarily unavailable. Please contact the business directly.',mode:'unavailable'},{status:503,headers:cors})
        redis.set(clientCacheKey, client, { ex: 3600 }).catch(() => {})
      }

      if (!client || widgetClaims.workspaceId !== client.id) {
        return NextResponse.json({ error: 'This chat session has expired. Refresh the widget and try again.' }, { status: 401, headers: cors })
      }
      markStage('identity')

      const resolvedContextId = (client?.context_id && client.context_id !== 'null')
        ? client.context_id
        : (contextId && !isUUID(contextId) ? contextId : (client?.id || 'default'))

      let botId: string | null = effectiveBotId || null
      let activeDatasetIds: string[] = []
      const requestContext = client?.id && botId && session_id
        ? new ChatRequestContext(client.id, botId, session_id, requestEntitlements)
        : undefined

      // KB lookup does not depend on lead/session bookkeeping. Overlap those
      // reads for informational questions; transactional turns keep their path.
      const earlyDatasetIds = !likelyDeterministicFlow && botId
        ? (prefetchedDatasetIds?Promise.resolve(prefetchedDatasetIds):resolveActiveDatasetIds(client.id, botId).catch(() => [] as string[]))
        : null
      const earlyLexical = earlyDatasetIds
        ? earlyDatasetIds.then(ids => searchLexicalChunks(ids, resolvedContextId, retrievalQuery)).catch(() => [])
        : null

    // ── Session & Lead Capture Pacing / Identity Resolution ──
    const contactCacheKey = `sess_contact:${session_id}`
    const sessionDeclineKey = `lead_declined:${session_id}`
    const leadAskCountKey = `lead_ask_count:${session_id}`
    const leadLastAskTurnKey = `lead_last_ask_turn:${session_id}`
    const leadAskedFieldsKey = `lead_asked_fields:${session_id}`
    const widgetBotId = effectiveBotId || req.nextUrl.searchParams.get('bot')
    const botCacheKey = `bot_ctx:${widgetBotId || client?.id || 'default'}`
    const bootstrap = prefetchedBootstrap || await loadChatBootstrap(client.id, botId!, session_id)
    const bootstrapTimings = bootstrap.timings
    const prefetchedBotCtx = bootstrap.botContext
    const journeyPolicy = prefetchedBotCtx?.journeyPolicy
    const leadState: [KnownContactInfo|null,boolean|null,number|null,number|null,string[]|null] = [bootstrap.contact, bootstrap.leadState[1], bootstrap.leadState[2], bootstrap.leadState[3], bootstrap.leadState[4]]
    const [cachedContact,sessDeclined,askCountVal,lastAskTurnVal,cachedAskedFields]=leadState

    let knownContactInfo: KnownContactInfo = cachedContact || {}
    let isSessionDeclined = sessDeclined === true
    const askedFields: string[] = cachedAskedFields || []

    // ── Lead Capture: Real-time Entity Extraction & Decline Detection ──
    // Button labels such as "Confirm", "Damaged", and "Refund" are protocol
    // actions, not customer profile data. Never feed them into lead extraction.
    const extracted: Partial<ReturnType<typeof extractEntitiesRegex>> = interaction?.flowId ? {} : extractEntitiesRegex(cleanQuestion)
    const isCurrentMessageDecline = interaction?.flowId ? false : isLeadCaptureDecline(cleanQuestion)
    const isDecline = isCurrentMessageDecline

    if (isCurrentMessageDecline) {
      isSessionDeclined = true
      // Freeze lead capture for this session permanently (24 hours TTL)
      redis.set(sessionDeclineKey, true, { ex: 86400 }).catch(() => {})
    }

    // Pacing calculations
    const currentTurn = Math.floor((history?.length || 0) / 2) + 1
    const currentAskCount = Number(askCountVal) || 0
    const lastAskTurn = lastAskTurnVal !== null ? Number(lastAskTurnVal) : null

    // Constraints: Max 2 asks per session, at least 2 turns cooldown between asks
    const isMaxAsksReached = currentAskCount >= 2
    const isPacingCooldownActive = lastAskTurn !== null && (currentTurn - lastAskTurn) < 2

    // If new entities extracted in this turn, update knownContactInfo immediately
    if (extracted.name) knownContactInfo.name = extracted.name
    if (extracted.email) knownContactInfo.email = extracted.email
    if (extracted.phone) knownContactInfo.phone = extracted.phone
    if (extracted.name || extracted.email || extracted.phone) {
      redis.set(contactCacheKey, knownContactInfo, { ex: 3600 }).catch(() => {})
    }

    // Resolve current session and contact from database if missing any fields
    let curSessionContactId: string | null = null
    let curSessionClientId: string | null = null
    let currentSession:any=bootstrap.session
    try {
      const curSess = currentSession
      if (curSess) {
        curSessionContactId = curSess.contact_id
        curSessionClientId = curSess.client_id
        // Contact was hydrated by the same scoped session query, including null fields.
      }
    } catch (sErr) {
      console.warn('[Session/Contact lookup error]:', sErr)
    }

    // ── Piggybacked Lead Extraction Pipeline ──
    // 3-step chain: LLM extract -> regex validate -> conditional PATCH (zero extra LLM calls)
    const handlePiggybackedExtraction = async (
      rawExtract: any,
      cleanLLMReply: string
    ) => {
      try {
        const validated = validateExtractedEntities(rawExtract, cleanQuestion)
        if (validated.hasValidData) {
          if (validated.name) knownContactInfo.name = validated.name
          if (validated.email) knownContactInfo.email = validated.email
          if (validated.phone) knownContactInfo.phone = validated.phone
          redis.set(contactCacheKey, knownContactInfo, { ex: 3600 }).catch(() => {})

          const stitched = await stitchContact({
            contactId: curSessionContactId || undefined,
            incomingEmail: validated.email,
            incomingPhone: validated.phone,
            incomingName: validated.name,
            incomingCompany: validated.company,
            incomingRole: validated.role,
            customProperties: validated.customProperties,
            source: 'message_extraction',
            sessionId: session_id,
            clientId: curSessionClientId || client?.id,
          })

          if (stitched?.contactId) {
            curSessionContactId = stitched.contactId
            if (validated.email || validated.phone) {
              await resolvePendingPrompts(stitched.contactId, session_id, 'provided')
            }
          }
        }
      } catch (extractErr) {
        console.error('[handlePiggybackedExtraction error]:', extractErr)
      }
    }

    if (isDecline && curSessionContactId) {
      resolvePendingPrompts(curSessionContactId, session_id, 'declined').catch(() => {})
    }

    // ── Bot + dataset resolution (Redis cache first) ──
    let botPrompt: string | null = null
    let botTone: string | null = null
    let responseLength: string | null = null
    let useEmojis: boolean | null = null
    let rawCollectionConfig: DataCollectionConfig | null = null
    let visionAiEnabled = false

    if (client) {
      const cachedBotCtx = prefetchedBotCtx as {
        botId: string
        datasetIds: string[]
        botPrompt?: string | null
        botTone?: string | null
        responseLength?: string | null
        useEmojis?: boolean | null
        dataCollectionConfig?: DataCollectionConfig | null
        visionAiEnabled?: boolean
      } | null

      if (cachedBotCtx) {
        botId = cachedBotCtx.botId
        // Dataset links are intentionally resolved only if the request reaches
        // the RAG lane; card actions and deterministic flows avoid this query.
        botPrompt = cachedBotCtx.botPrompt || null
        botTone = cachedBotCtx.botTone || null
        responseLength = cachedBotCtx.responseLength || null
        useEmojis = cachedBotCtx.useEmojis ?? null
        rawCollectionConfig = cachedBotCtx.dataCollectionConfig || null
        visionAiEnabled = !!cachedBotCtx.visionAiEnabled
      } else if (widgetBotId) {
        botId = widgetBotId
        const { data: botRow } = await supabase
          .from('bots')
          .select('id, system_prompt, bot_tone, tone, response_length, use_emojis, bot_flow, vision_ai_enabled')
          .eq('id', widgetBotId)
          .maybeSingle()

        visionAiEnabled = !!(botRow?.vision_ai_enabled ?? botRow?.bot_flow?.vision_ai_enabled)
        botPrompt = botRow?.system_prompt || botRow?.bot_flow?.system_prompt || botRow?.bot_flow?.prompt || null
        botTone = botRow?.bot_tone || botRow?.tone || botRow?.bot_flow?.bot_tone || null
        responseLength = botRow?.response_length || botRow?.bot_flow?.response_length || null
        useEmojis = botRow?.use_emojis ?? botRow?.bot_flow?.use_emojis ?? null

        const fs = botRow?.bot_flow?.flow_sections || botRow?.bot_flow || {}
        rawCollectionConfig = {
          askName: !!fs.ask_name,
          namePrompt: fs.name_prompt || undefined,
          askWhatsapp: !!fs.ask_whatsapp,
          whatsappPrompt: fs.whatsapp_prompt || undefined,
          askEmail: !!fs.ask_email,
          emailPrompt: fs.email_prompt || undefined,
          customPoints: Array.isArray(fs.data_collection) ? fs.data_collection : undefined,
        }

        redis.set(botCacheKey, { botId, datasetIds: [], botPrompt, botTone, responseLength, useEmojis, dataCollectionConfig: rawCollectionConfig, visionAiEnabled }, { ex: 3600 }).catch(() => {})
      } else {
        const { data: bot } = await supabase
          .from('bots')
          .select('id, handoff_message, system_prompt, bot_tone, tone, response_length, use_emojis, bot_flow, vision_ai_enabled')
          .eq('client_id', client.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (bot) {
          botId = bot.id
          visionAiEnabled = !!(bot?.vision_ai_enabled ?? bot?.bot_flow?.vision_ai_enabled)
          botPrompt = bot.system_prompt || bot.bot_flow?.system_prompt || bot.bot_flow?.prompt || null
          botTone = bot.bot_tone || bot.tone || bot.bot_flow?.bot_tone || null
          responseLength = bot.response_length || bot.bot_flow?.response_length || null
          useEmojis = bot.use_emojis ?? bot.bot_flow?.use_emojis ?? null

          const fs = bot.bot_flow?.flow_sections || bot.bot_flow || {}
          rawCollectionConfig = {
            askName: !!fs.ask_name,
            namePrompt: fs.name_prompt || undefined,
            askWhatsapp: !!fs.ask_whatsapp,
            whatsappPrompt: fs.whatsapp_prompt || undefined,
            askEmail: !!fs.ask_email,
            emailPrompt: fs.email_prompt || undefined,
            customPoints: Array.isArray(fs.data_collection) ? fs.data_collection : undefined,
          }

          redis.set(botCacheKey, { botId, datasetIds: [], botPrompt, botTone, responseLength, useEmojis, dataCollectionConfig: rawCollectionConfig }, { ex: 3600 }).catch(() => {})
        }
      }
    }

    // ── Conversational Lead Capture Orchestration & Pacing ──
    // ── Conversational Lead Capture Orchestration & Pacing ──
    const hasAnyCollectionEnabled = !!(
      rawCollectionConfig && (
        rawCollectionConfig.askName ||
        rawCollectionConfig.askWhatsapp ||
        rawCollectionConfig.askEmail ||
        (rawCollectionConfig.customPoints && rawCollectionConfig.customPoints.length > 0)
      )
    )

    let activeDataCollectionConfig: DataCollectionConfig | null = null

    const leadPolicyStart = performance.now()
    if (isSessionDeclined) {
      // Freeze lead capture permanently for this session & instruct Gemini to respect privacy / reveal website promo
      activeDataCollectionConfig = { customerDeclinedCapture: true }
    } else if (hasAnyCollectionEnabled && !isMaxAsksReached && !isPacingCooldownActive) {
      const isDiscountIntent = /\b(discount|coupon|offer|promo|code|deal|voucher|save|sale)\b/i.test(cleanQuestion)

      let candidateField: 'whatsapp' | 'email' | 'name' | 'custom' | null = null
      let candidatePrompt: string | null = null

      if (isDiscountIntent) {
        // Prioritize the coupon hook without bypassing refusal or pacing limits.
        if (rawCollectionConfig?.askWhatsapp && !knownContactInfo.phone) {
          candidateField = 'whatsapp'
          candidatePrompt = rawCollectionConfig.whatsappPrompt || "Want some extra discount maan? Put your WhatsApp number, I'll send you a coupon code!"
        } else if (rawCollectionConfig?.askEmail && !knownContactInfo.email) {
          candidateField = 'email'
          candidatePrompt = rawCollectionConfig.emailPrompt || "I'll add you to our VIP list for exclusive offers, what's your email ID?"
        }
      } else if (!isMaxAsksReached && !isPacingCooldownActive) {
        // Normal conversational flow: respect 2-turn cooldown and ask uncollected details
        if (rawCollectionConfig?.askName && (!knownContactInfo.name || /^(?:web|website) visitor/i.test(knownContactInfo.name))) {
          candidateField = 'name'
          candidatePrompt = rawCollectionConfig.namePrompt || "By the way, who do I have the pleasure of speaking with?"
        } else if (rawCollectionConfig?.askWhatsapp && !knownContactInfo.phone) {
          candidateField = 'whatsapp'
          candidatePrompt = rawCollectionConfig.whatsappPrompt || "Want some extra discount maan? Put your WhatsApp number, I'll send you a coupon code!"
        } else if (rawCollectionConfig?.askEmail && !knownContactInfo.email) {
          candidateField = 'email'
          candidatePrompt = rawCollectionConfig.emailPrompt || "I'll add you to our VIP list for exclusive offers, what's your email ID?"
        } else if (rawCollectionConfig?.customPoints && rawCollectionConfig.customPoints.length > 0) {
          const firstPoint = rawCollectionConfig.customPoints[0]
          if (firstPoint?.question) {
            candidateField = 'custom'
            candidatePrompt = firstPoint.question
          }
        }
      }

      if (candidateField && candidatePrompt && rawCollectionConfig) {
        activeDataCollectionConfig = {
          ...rawCollectionConfig,
          activeField: candidateField,
          activePrompt: candidatePrompt,
        }
      }
    }

    const dataCollectionConfig: DataCollectionConfig | null = activeDataCollectionConfig
    bootstrapTimings.boot_lead_policy = Math.round(performance.now()-leadPolicyStart)

    const recordLeadAskFired = () => {
      if (activeDataCollectionConfig?.activePrompt && activeDataCollectionConfig?.activeField) {
        redis.incr(leadAskCountKey).catch(() => {})
        redis.set(leadLastAskTurnKey, currentTurn, { ex: 86400 }).catch(() => {})
      }
    }

    // 1.6 Check if session is already in 'human' mode (takeover)
    if (currentSession?.mode === 'human' || currentSession?.mode === 'waiting') {
      // Resolve the actual session_id column value for message inserts
      const resolvedSid = currentSession.session_id || currentSession.id
      const targetClientId = currentSession.client_id || client?.id

      const userMsg = await writeMessage({
        sessionId: resolvedSid,
        role: 'user',
        content: cleanQuestion,
        mode: 'human',
        contextId: resolvedContextId,
        botId: botId || null,
        channel: 'website',
        additionalSessionAliases: [session_id, currentSession.id].filter(Boolean) as string[],
        clientId: targetClientId,
        mediaUrl: media_url || null,
        mediaType: media_type || 'image/webp',
        mediaSizeBytes: media_size_bytes || null,
        metadata: clientMessageId ? { client_id: clientMessageId } : null,
      })

      // Update session last_message_at using the PK
      await supabase.from('sessions')
        .update({ last_message_at: userMsg.created_at })
        .eq('id', currentSession.id)

      return NextResponse.json(
        { answer: null, source_url: null, mode: currentSession.mode },
        { headers: cors }
      )
    }
    bootstrapTimings.boot_handoff = 0
    markStage('bootstrap')
    const bootstrapTimingHeader = Object.entries(bootstrapTimings).map(([name,duration])=>`${name};dur=${duration}`).join(', ')

    // Deterministic support workflows run before database lookup and RAG. If
    // every feature is disabled (the default), this is a no-op and preserves
    // the bot's existing behaviour.
    if (client?.id && botId && session_id && (journeyPolicy?.supportOnly || !supportsFlowHint || activeFlowId || interaction?.flowId || isPotentialSupportFlowRequest(cleanQuestion))) {
      let supportFlowFailed = false
      const supportResult = await handleSupportFlow({
        clientId: client.id,
        botId,
        sessionId: session_id,
        text: cleanQuestion,
        knownContact: knownContactInfo,
        mediaUrl: media_url || null,
        interaction,
        channel,
        requestContext,
        routeHints:(await supportRouteHintsPromise)||undefined,
        journeyPolicy,
      }).catch((error) => {
        console.error('[support flow]', error)
        supportFlowFailed = true
        return null
      })
      if (supportResult) {
        const flowMessages = supportResult.messages || []
        const logAction = () => logMessages(
          resolvedContextId,
          session_id,
          clientMessageId,
          userTextQuestion,
          supportResult.answer,
          null,
          client?.id,
          botId,
          'ai',
          undefined,
          undefined,
          undefined,
          undefined,
          !!interaction?.flowId,
          flowMessages,
          interaction,
          clientBotMessageId
        )
        if (supportResult.messages) {
          await Promise.all([supportResult._stateCommit,persistFlowTurn({
            contextId:resolvedContextId,clientId:client.id,botId,sessionId:session_id,answer:supportResult.answer,
            messages:flowMessages,interaction,verifiedSession:{id:currentSession.id,session_id:currentSession.session_id||session_id},
            userMessage:interaction?.flowId?undefined:{content:userTextQuestion,clientMessageId,mediaUrl:media_url||null,mediaType:media_type,mediaSizeBytes:media_size_bytes,mediaStoragePath:media_storage_path},
          })].filter(Boolean) as Promise<unknown>[]).catch((err)=>{console.error('[supportResult persistence error]',err);throw err})
          fireWebhook(resolvedContextId,'message.received',{session_id,question:userTextQuestion,answer:supportResult.answer,source_url:null})
          markStage('flow_router')
          return NextResponse.json({ answer: supportResult.answer, messages: supportResult.messages, flow: supportResult.flow ?? null,
            source: supportResult.source, ticket_id: supportResult.ticketId || null, order_id: supportResult.orderId || null }, { headers: { ...cors, 'X-RateLimit-Remaining': String(remaining), 'Server-Timing':[...stageTimings,bootstrapTimingHeader,requestContext?.serverTiming()].filter(Boolean).join(', ') } })
        }
        if (wantsStream) return streamStaticAnswer(supportResult.answer, supportResult.source, cors, logAction)
        logAction().catch(() => {})
        return NextResponse.json({ answer: supportResult.answer, source_url: null, source: supportResult.source,
          ticket_id: supportResult.ticketId || null }, { headers: { ...cors, 'X-RateLimit-Remaining': String(remaining) } })
      }
      // A protocol action must never fall through to lead capture or RAG. That
      // could interpret labels such as "Confirm" as a name or a new question.
      if (supportFlowFailed && interaction?.flowId) {
        return NextResponse.json({
          answer: FRIENDLY_RETRY_MESSAGE,
          messages: [{ id: `flow-error-${Date.now()}`, role: 'bot', type: 'text', flowId: interaction.flowId,
            stepId: interaction.stepId, interactive: true, payload: { text: FRIENDLY_RETRY_MESSAGE } }],
          flow: null, source: 'support_flow_error',
        }, { status: 503, headers: { ...cors, 'X-RateLimit-Remaining': String(remaining) } })
      }
    }
    markStage('flow_router')

    // ─────────────────────────────────────────────────────────
    // STAGE 0.DATABASE: ORDER STATUS & DATABASE LOOKUP PIPELINE
    // ─────────────────────────────────────────────────────────
    let dataSourceResult: string | null = null

    const detectedOrder = extractOrderDetails(cleanQuestion, history)
    const pendingOrderKey = `pending_order_verify:${session_id}`
    const pendingOrderId = !detectedOrder.orderId && (knownContactInfo.email || knownContactInfo.phone)
      ? await redis.get<string>(pendingOrderKey).catch(() => null)
      : null
    const orderId = detectedOrder.orderId || pendingOrderId
    const isAskingForOrder = detectedOrder.isAskingForOrder || !!pendingOrderId

    // Case 1: User asks for order/ticket status, but has not provided an ID yet
    if (isAskingForOrder && !orderId) {
      const promptAnswer = "I'd be happy to check your order status! Please provide your **Order ID** (for example, `ORD-001`) and the **Phone Number** associated with the order."
      const logAction = () => logMessages(resolvedContextId, session_id, clientMessageId, userTextQuestion, promptAnswer, null, client?.id, botId, 'ai', undefined, undefined, undefined, undefined, false, undefined, undefined, clientBotMessageId)
      if (wantsStream) {
        return streamStaticAnswer(promptAnswer, 'database_prompt', cors, logAction)
      }
      logAction().catch(() => {})
      return NextResponse.json(
        { answer: promptAnswer, source_url: null, source: 'database_prompt' },
        { headers: { ...cors, 'X-RateLimit-Remaining': String(remaining) } }
      )
    }

    // Case 2: Order ID is provided or detected
    if (orderId) {
      const dbLookup = await searchConnectedDatabases(orderId, {
        botId,
        clientId: client?.id,
        contextId: resolvedContextId,
      })

      if (dbLookup.found && dbLookup.data) {
        if (!isContactVerifiedInRecord(knownContactInfo, dbLookup.data)) {
          await redis.set(pendingOrderKey, orderId, { ex: 600 }).catch(() => {})
          const verificationAnswer = knownContactInfo.phone || knownContactInfo.email
            ? "I couldn't verify those details for that order. Please check the phone number or email used at checkout and try again."
            : `I found order **${orderId}**. For your security, please reply with the **phone number** or **email address** used when placing it.`
          const logAction = () => logMessages(resolvedContextId, session_id, clientMessageId, userTextQuestion, verificationAnswer, null, client?.id, botId, 'ai', undefined, undefined, undefined, undefined, false, undefined, undefined, clientBotMessageId)
          if (wantsStream) return streamStaticAnswer(verificationAnswer, 'order_verification', cors, logAction)
          logAction().catch(() => {})
          return NextResponse.json({ answer: verificationAnswer, source_url: null, source: 'order_verification' }, { headers: { ...cors, 'X-RateLimit-Remaining': String(remaining) } })
        } else {
          await redis.del(pendingOrderKey).catch(() => {})
          dataSourceResult = dbLookup.data
        }
      } else {
        dataSourceResult = `No matching records found in the connected database for Order ID "${orderId}".`
      }
    }

    const queryHash = hashText(canonicalQuestion)
    const retrievalHash = hashText(retrievalQuery)
    const cacheKey = `chat_cache:${resolvedContextId}:${botId || 'global'}:${queryHash}:${entitySignature}`
    const embeddingCacheKey = `embed_cache:${retrievalHash}`

    const hasPendingDataCollection = !!(dataCollectionConfig?.activePrompt)
    const hasExtractedNewContact = !!(extracted.name || extracted.email || extracted.phone)
    const hasPersonalization = !!(knownContactInfo.name && !/^(?:web|website) visitor/i.test(knownContactInfo.name))
    const pureCacheEnabled = wantsStream && !dataSourceResult && !media_url && !hasExtractedNewContact && !isAskingForOrder && !orderId
    const pureKey = pureAnswerKey({clientId:client.id,botId:botId!,sessionId:session_id,question:cleanQuestion,history,
      runtime:prefetchedBotCtx,contact:knownContactInfo})
    const appendLeadPrompt = (answer: string) => appendScheduledLeadPrompt(answer, activeDataCollectionConfig?.activePrompt)
    if (pureCacheEnabled) {
      const cached = await readPureAnswer(pureKey)
      if (cached) {
        const answer = appendLeadPrompt(cached.answer)
        if (answer !== cached.answer) recordLeadAskFired()
        markStage('answer_cache')
        return streamStaticAnswer(answer,'cache',{...cors,'Server-Timing':[...stageTimings,bootstrapTimingHeader].join(', ')},
          ()=>logMessages(resolvedContextId,session_id,clientMessageId,userTextQuestion,answer,cached.source_url,client.id,botId,'ai',undefined,undefined,undefined,undefined,false,undefined,undefined,clientBotMessageId))
      }
      markStage('answer_cache')
    }
    let prefetchedEmbedding: number[] | null = null

    // ─────────────────────────────────────────────────────────
    // STAGE 0 — Zero-embedding fast paths (run BEFORE embed() is ever called)
    // Exact legacy answer and Redis cache checks run before embedding. Imported
    // Manual FAQs now participate in the normal bot-linked Knowledge Base search.
    // ─────────────────────────────────────────────────────────
    if (!dataSourceResult && !media_url) {

      const [legacyResult, redisBatchResult] = await Promise.allSettled([
        prefetchedExactFaq
          ? Promise.resolve({data:[{id:'atomic-faq',question:cleanQuestion,...prefetchedExactFaq}]})
          : atomicFaqChecked
          ? Promise.resolve({data:null})
          : resolvedContextId
          ? supabase.from('qa_pairs').select('id, question, answer').eq('context_id', resolvedContextId).ilike('question', cleanQuestion.trim()).limit(1)
          : Promise.resolve({ data: null }),
        wantsStream ? Promise.resolve([null, null]) : withTimeout(redis.mget<[ { answer: string, source_url: string | null } | null, number[] | null ]>(cacheKey, embeddingCacheKey), 300).catch(() => [null, null]),
      ])

      // ── 0.A.2: Check legacy qa_pairs result ──
      const exactLegacy = legacyResult.status === 'fulfilled' ? (legacyResult.value as any)?.data : null
      if (exactLegacy && exactLegacy.length > 0) {
        const hit = exactLegacy[0]
        const logAction = () => logMessages(resolvedContextId, session_id, clientMessageId, userTextQuestion, hit.answer, null, client?.id, botId, 'ai', undefined, undefined, undefined, undefined, false, undefined, undefined, clientBotMessageId)
        if (wantsStream) return streamStaticAnswer(hit.answer, 'legacy_faq', cors, logAction)
        logAction().catch(() => {})
        return NextResponse.json(
          { answer: hit.answer, source_url: null, source: 'legacy_faq' },
          { headers: { ...cors, 'X-RateLimit-Remaining': String(remaining) } }
        )
      }

      // ── 0.B: Check Redis chat_cache result ──
      const redisBatch = redisBatchResult.status === 'fulfilled' ? redisBatchResult.value : [null, null]
      const cachedResponse = redisBatch?.[0] || null
      prefetchedEmbedding = Array.isArray(redisBatch?.[1]) ? redisBatch[1] : null
      if (!wantsStream && cachedResponse && !hasPendingDataCollection && !hasExtractedNewContact && !hasPersonalization) {
        const logAction = () => logMessages(resolvedContextId, session_id, clientMessageId, userTextQuestion, cachedResponse.answer, cachedResponse.source_url, client?.id, botId, 'ai', undefined, undefined, undefined, undefined, false, undefined, undefined, clientBotMessageId)
        if (wantsStream) return streamStaticAnswer(cachedResponse.answer, 'cache', cors, logAction)
        logAction().catch(() => {})
        return NextResponse.json(
          { answer: cachedResponse.answer, source_url: cachedResponse.source_url, source: 'cache' },
          { headers: cors }
        )
      }
    }

    markStage('exact_lookup')
    // ── Await speculative embedding only after the exact/cache fast paths miss.
    // The embed_cache (Redis, 24h TTL) makes this ~2ms on warm paths.
    // On cold cache (first ever query for this text): Gemini API ~300–800ms.
    // By running all exact-text DB checks first, we avoid the cold-embed penalty
    // for any question that has an exact match in qa_pairs.
    const mediaAttachmentPromise: Promise<GeminiMediaAttachment | null> = (async () => {
      if (!media_storage_path || !visionAiEnabled || !session_id) return null
      try {
        const safeSession = String(session_id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)
        if (!String(media_storage_path).startsWith(`${safeSession}/`)) throw new Error('MEDIA_SCOPE_MISMATCH')
        const { data: stored, error } = await supabase.storage.from('chat-media').download(String(media_storage_path))
        if (error || !stored || stored.size > 5 * 1024 * 1024) return null
        return { mimeType: media_type || 'image/webp', data: Buffer.from(await stored.arrayBuffer()).toString('base64') }
      } catch (error) {
        console.warn('[/api/chat] Vision AI image fetch failed:', error)
        return null
      }
    })()
    const datasetIdsPromise=earlyDatasetIds||(client?.id&&botId?resolveActiveDatasetIds(client.id,botId):Promise.resolve([] as string[]))
    const lexicalPromise=earlyLexical||datasetIdsPromise.then(ids=>searchLexicalChunks(ids,resolvedContextId,retrievalQuery)).catch(()=>[])
    const [resolvedDatasetIds,lexicalRows,prefetchedMediaAttachment]=await Promise.all([datasetIdsPromise,lexicalPromise,mediaAttachmentPromise])
    activeDatasetIds = resolvedDatasetIds
    let embeddingStr=''
    let chunks:any[]=pruneRetrievedChunks(lexicalRows)
    markStage('lexical_retrieval')
    // A pure/exact cache hit has already returned. From this point a streaming
    // turn will call the model, so reserve quota concurrently with retrieval.
    // generateAnswerStream still awaits this authoritative result before it
    // invokes Gemini, preventing concurrent overspend.
    const usageReservation=wantsStream&&client?.id
      ? reserveAiUsageFast(client.id,requestEntitlements)
      : undefined

    // ─────────────────────────────────────────────────────────
    // STAGE 2 + 3 run in parallel: query_cache lookup AND KB chunk search.
    // Previously sequential: match_query_cache (377ms) → match_chunks (411ms) = 788ms.
    // Now parallel: max(377ms, 411ms) = 411ms — saves ~377ms on every cold request.
    //
    // STAGE 2: Semantic Query Cache (match_query_cache >= 0.92)
    // STAGE 3: KB Vector Search (match_chunks / match_chunks_by_datasets)
    // ─────────────────────────────────────────────────────────

    if(!chunks.length){
      const questionEmbedding=await(speculativeEmbeddingPromise?.then(value=>value||embed(retrievalQuery,prefetchedEmbedding))||embed(retrievalQuery,prefetchedEmbedding))
      embeddingStr=JSON.stringify(questionEmbedding)
      markStage('embedding')
      let chunkSearchPromise:PromiseLike<any>
      if(activeDatasetIds.length>0){chunkSearchPromise=(async()=>{const hybrid=await supabase.rpc('match_chunks_by_datasets_hybrid',{p_dataset_ids:activeDatasetIds,p_embedding:embeddingStr,p_query_text:retrievalQuery,p_match_count:5});if(!hybrid.error)return hybrid;if(!['42883','PGRST202'].includes(hybrid.error.code||''))return hybrid;return supabase.rpc('match_chunks_by_datasets',{p_dataset_ids:activeDatasetIds,p_embedding:embeddingStr,p_match_count:5})})()}
      else if(resolvedContextId){chunkSearchPromise=(async()=>{const hybrid=await supabase.rpc('match_chunks_hybrid',{p_context_id:resolvedContextId,p_embedding:embeddingStr,p_query_text:retrievalQuery,p_match_count:5});if(!hybrid.error)return hybrid;if(!['42883','PGRST202'].includes(hybrid.error.code||''))return hybrid;return supabase.rpc('match_chunks',{p_context_id:resolvedContextId,p_embedding:embeddingStr,p_match_count:5})})()}
      else chunkSearchPromise=Promise.resolve({data:[]})
      const [cacheResult,chunkResult]=await Promise.allSettled([wantsStream ? Promise.resolve({data:null}) : withTimeout(supabase.rpc('match_query_cache_safe',{p_context_id:resolvedContextId,p_embedding:embeddingStr,p_entity_signature:entitySignature,p_threshold:.92}),400,{data:null} as any),chunkSearchPromise])
      const cached=cacheResult.status==='fulfilled'?cacheResult.value?.data:null
      if(!wantsStream&&cached?.length&&!hasPendingDataCollection&&!hasExtractedNewContact&&!hasPersonalization&&!media_url){const hit=cached[0];supabase.from('query_cache').update({hit_count:hit.hit_count+1}).eq('id',hit.id).then(()=>{});const logAction=()=>logMessages(resolvedContextId,session_id,clientMessageId,userTextQuestion,hit.response_text,hit.source_url,client?.id,botId,'ai',undefined,undefined,undefined,undefined,false,undefined,undefined,clientBotMessageId);if(wantsStream)return streamStaticAnswer(hit.response_text,'cache',cors,logAction);logAction().catch(()=>{});return NextResponse.json({answer:hit.response_text,source_url:hit.source_url,source:'cache'},{headers:{...cors,'X-RateLimit-Remaining':String(remaining)}})}
      chunks=pruneRetrievedChunks(chunkResult.status==='fulfilled'?(chunkResult.value?.data||[]):[])
      if(!chunks.length&&client?.id&&client.id!==resolvedContextId){const{data}=await supabase.rpc('match_chunks',{p_context_id:client.id,p_embedding:embeddingStr,p_match_count:5});chunks=data||[]}
      markStage('retrieval')
    }

    // ─────────────────────────────────────────────────────────
    // STAGE 4: Response Generation — Streaming (C.2) or Unified JSON
    // ─────────────────────────────────────────────────────────
    // Prepare Vision AI image attachment if enabled
    const mediaAttachment: GeminiMediaAttachment | null = prefetchedMediaAttachment

    if (wantsStream) {
      let generationFailed = false
      const openStream = async () => {
      let streamData: { stream: AsyncIterable<string>; getSourceUrl: () => string | null; usedLiveData?: () => boolean }
      try {
        streamData = await generateAnswerStream({
          question: cleanQuestion,
          knowledgeChunks: chunks,
          history,
          clientId: client?.id,
          botId: botId || undefined,
          botPrompt,
          botTone,
          responseLength,
          useEmojis,
          dataSourceResult,
          dataCollectionConfig: dataCollectionConfig ? {...dataCollectionConfig,activePrompt:undefined,activeField:undefined} : undefined,
          knownContactInfo,
          mediaAttachment,
          onTiming: (name, duration) => { stageTimings.push(`${name};dur=${duration}`) },
          usageReservation:usageReservation?.ready,
        })
        markStage('model_start')
      } catch (streamErr: any) {
        generationFailed = true
        console.error('[/api/chat] generateAnswerStream failed:', streamErr?.message || streamErr)
        const fallbackText = FRIENDLY_RETRY_MESSAGE
        streamData = {
          stream: createSingleTextStream(fallbackText),
          getSourceUrl: () => null,
        }
      }

      return streamData
      }
      const encoder = new TextEncoder()
      let fullAnswer = ''
      let extractSeen = false
      let streamBuffer = ''
      const EXTRACT_TAG = '[EXTRACT]'
      let resolvePostResponse: (work: () => Promise<void>) => void = () => {}
      const postResponseWork = new Promise<() => Promise<void>>(resolve => { resolvePostResponse = resolve })
      after(async () => {
        const work = await postResponseWork
        await work()
      })

      const readable = new ReadableStream({
        async start(controller) {
          try {
            controller.enqueue(encoder.encode(': stream-ready\n\n'))
            const { stream, getSourceUrl, usedLiveData } = await openStream()
            for await (const chunkText of stream) {
              fullAnswer += chunkText

              if (extractSeen) {
                // Once [EXTRACT] tag is hit, suppress all subsequent tokens from being streamed to customer
                continue
              }

              streamBuffer += chunkText
              const extractIdx = streamBuffer.indexOf(EXTRACT_TAG)
              if (extractIdx !== -1) {
                // Found [EXTRACT]! Send only text before it and stop streaming deltas
                const safeText = streamBuffer.slice(0, extractIdx)
                if (safeText) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: safeText })}\n\n`))
                }
                extractSeen = true
                streamBuffer = ''
                continue
              }

              // Check if the tail of streamBuffer is a potential prefix of "[EXTRACT]"
              let matchLen = 0
              for (let len = Math.min(streamBuffer.length, EXTRACT_TAG.length - 1); len > 0; len--) {
                if (EXTRACT_TAG.startsWith(streamBuffer.slice(streamBuffer.length - len))) {
                  matchLen = len
                  break
                }
              }

              const safeEnd = streamBuffer.length - matchLen
              if (safeEnd > 0) {
                const toSend = streamBuffer.slice(0, safeEnd)
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: toSend })}\n\n`))
                streamBuffer = streamBuffer.slice(safeEnd)
              }
            }

            // If [EXTRACT] was never seen, flush remaining buffer
            if (!extractSeen && streamBuffer.length > 0) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: streamBuffer })}\n\n`))
            }

            // Split fullAnswer on [EXTRACT]
            const { cleanText: parsedAnswer, rawExtract } = parseExtractTag(fullAnswer)
            const pureAnswer = parsedAnswer
            const cleanUserAnswer = generationFailed ? pureAnswer : appendLeadPrompt(pureAnswer)

            const source_url = getSourceUrl()
            const isHandoff = cleanUserAnswer.includes('[HANDOFF]')
            const finalMode = isHandoff ? 'waiting' : 'ai'
            if (cleanUserAnswer !== pureAnswer) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({delta:cleanUserAnswer.slice(pureAnswer.length)})}\n\n`))
            }
            if (!generationFailed && !isHandoff && cleanUserAnswer !== pureAnswer) recordLeadAskFired()
            const mayCacheAnswer = pureCacheEnabled && !generationFailed && !isHandoff && !rawExtract && !usedLiveData?.() && !!pureAnswer.trim()
            if (mayCacheAnswer) {
              rememberPureAnswer(pureKey,{answer:pureAnswer,source_url})
            }

            // Send done to the customer immediately so the stream closes without waiting for DB/Realtime
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              done: true,
              source_url,
              mode: finalMode,
              source: generationFailed ? 'unavailable' : isHandoff ? 'handoff' : 'rag',
              serverTiming: [...stageTimings,bootstrapTimingHeader].join(', '),
            })}\n\n`))
            controller.close()
            resolvePostResponse(async () => {
              const tasks: PromiseLike<any>[] = []
              if(usageReservation)tasks.push(usageReservation.commit())
              if (rawExtract) tasks.push(handlePiggybackedExtraction(rawExtract, cleanUserAnswer))
              if (isHandoff && client?.id) {
                tasks.push(supabase.from('handoff_requests').insert({ session_id, client_id: client.id, reason: 'AI triggered handoff' }))
                tasks.push(redis.set(`session_mode:${session_id}`, 'waiting', { ex: 86400 }))
              } else if (mayCacheAnswer) {
                tasks.push(persistPureAnswer(pureKey,{answer:pureAnswer,source_url}))
              }
              tasks.push(logMessages(resolvedContextId, session_id, clientMessageId, userTextQuestion, cleanUserAnswer, source_url, client?.id, botId, finalMode, media_url, media_type, media_size_bytes, media_storage_path, false, undefined, undefined, clientBotMessageId))
              const settled = await Promise.allSettled(tasks)
              settled.forEach(result => { if (result.status === 'rejected') console.error('[Chat post-response error]:', result.reason) })
            })
          } catch (streamErr) {
            console.error('[Chat stream error]:', streamErr)
            resolvePostResponse(async () => {})
            controller.error(streamErr)
          }
        },
      })

      return new Response(readable, {
        headers: {
          ...cors,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'Server-Timing': [...stageTimings,bootstrapTimingHeader].join(', '),
        },
      })
    }

    let { answer, source_url, rawExtract } = await generateAnswerUnified({
      question: cleanQuestion,
      knowledgeChunks: chunks ?? [],
      history,
      clientId: client?.id,
      botId: botId || undefined,
      botPrompt,
      botTone,
      responseLength,
      useEmojis,
      dataSourceResult,
      dataCollectionConfig: dataCollectionConfig || undefined,
      knownContactInfo,
      mediaAttachment,
    })

    if (!rawExtract) {
      const parsed = parseExtractTag(answer)
      answer = parsed.cleanText
      rawExtract = parsed.rawExtract
    }

    if (rawExtract) {
      handlePiggybackedExtraction(rawExtract, answer).catch((err) => {
        console.error('[Piggybacked extraction background error]:', err)
      })
    }

    let finalSource = 'rag'
    // Cache ALL non-handoff AI answers — not just chunk-backed ones.
    // Without this, zero-chunk answers (e.g. greetings) are never written to Redis,
    // so identical repeated questions always regenerate via Gemini instead of hitting cache.
    let saveToCache = !answer.includes('[HANDOFF]') && !hasPendingDataCollection && !hasExtractedNewContact && !hasPersonalization

    const needsHandoff = answer.includes('[HANDOFF]')
    const cleanReply = answer.replace('[HANDOFF]', '').trim()

    const { data: sessionInfo } = await supabase.from('sessions').select('*').eq('session_id', session_id).single()

    if (sessionInfo?.chatwoot_conversation_id) {
      try {
        await chatwootSendMessage(
          sessionInfo.chatwoot_conversation_id,
          cleanQuestion,
          'incoming'
        )
        await chatwootSendMessage(
          sessionInfo.chatwoot_conversation_id,
          cleanReply,
          'outgoing'
        )
      } catch (err) {
        console.error('[Chat] Chatwoot mirror failed:', err)
      }
    }

    // Helper to detect if bot answer is stating unknown information
    const isUnknownAnswer = (text: string) => {
      if (!text) return false
      const t = text.toLowerCase()
      return (
        t.includes('do not have') ||
        t.includes("don't have") ||
        t.includes('not available') ||
        t.includes('cannot find') ||
        t.includes("don't know") ||
        t.includes('do not know') ||
        t.includes('unable to find') ||
        t.includes('no information') ||
        t.includes('not mentioned in the knowledge')
      )
    }

    if (needsHandoff) {
      saveToCache = false
      finalSource = 'handoff'

      if (client) {
        const { data: bot } = await supabase.from('bots').select('id, handoff_message').eq('client_id', client.id).eq('channel', 'website').order('created_at', { ascending: false }).limit(1).single()

        answer = bot?.handoff_message || "I am connecting you to a human agent who can assist you further. Please hold on."

        if (sessionInfo?.id) {
          try {
            // Note: we use NEXTAUTH_URL or a relative call if possible, but NEXTAUTH_URL is fine server-to-server 
            const baseUrl = process.env.NEXTAUTH_URL || `http://${req.headers.get('host')}`
            await fetch(`${baseUrl}/api/chat/handoff`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId: sessionInfo.id, botId: botId || bot?.id }),
            })
          } catch (err) {
            console.error('[Chat] internal handoff call failed', err)
          }
        } else {
           await supabase.from('sessions').update({ mode: 'waiting' }).eq('session_id', session_id)
        }

        await redis.set(`session_mode:${session_id}`, 'waiting', { ex: 86400 })
        await supabase.from('handoff_requests').insert({ session_id, client_id: client.id, reason: 'AI triggered handoff' })
      } else {
        answer = "I am connecting you to a human agent who can assist you further. Please hold on."
      }
    } else {
      if (activeDataCollectionConfig?.activePrompt && !isUnknownAnswer(answer)) {
        const field = activeDataCollectionConfig.activeField
        const hasFieldMention = field && (
          answer.toLowerCase().includes(field) ||
          (field === 'whatsapp' && (answer.toLowerCase().includes('whatsapp') || answer.toLowerCase().includes('coupon') || answer.toLowerCase().includes('number'))) ||
          (field === 'name' && (answer.toLowerCase().includes('name') || answer.toLowerCase().includes('speaking with') || answer.toLowerCase().includes('pleasure'))) ||
          (field === 'email' && (answer.toLowerCase().includes('email') || answer.toLowerCase().includes('vip')))
        )
        if (!hasFieldMention) {
          answer = `${answer}\n\n${activeDataCollectionConfig.activePrompt}`
        }
      }
      recordLeadAskFired()
    }

    // ── Lead Capture: Active Conversational Trigger Engine (only if flow sections are not configured, visitor has not declined, and pacing permits) ──
    let capturePrompt: any = null
    if (!dataCollectionConfig && !isSessionDeclined && !isMaxAsksReached && !isPacingCooldownActive && !hasAnyCollectionEnabled && !isUnknownAnswer(answer)) {
      try {
        let sessionLookup = supabase
          .from('sessions')
          .select('id, contact_id, client_id, bot_id')
        if (isUUID(session_id)) {
          sessionLookup = sessionLookup.or(`id.eq.${session_id},session_id.eq.${session_id}`)
        } else {
          sessionLookup = sessionLookup.eq('session_id', session_id)
        }
        const { data: sess } = await sessionLookup.maybeSingle()

        if (sess?.contact_id) {
          const fired = await evaluateTriggers({
            clientId: sess.client_id || client?.id,
            botId: sess.bot_id || botId,
            contactId: sess.contact_id,
            sessionId: session_id,
            messageText: cleanQuestion,
            messageCount: history.length + 1,
            isHandoffRequested: finalSource === 'handoff',
            disabledFields: {
              email: rawCollectionConfig?.askEmail === false,
              phone: rawCollectionConfig?.askWhatsapp === false,
              name: rawCollectionConfig?.askName === false,
            }
          })

          if (fired) {
            capturePrompt = fired
            saveToCache = false
            await recordTriggerPrompt({
              triggerId: fired.id,
              contactId: sess.contact_id,
              sessionId: session_id,
              targetField: fired.targetField,
              promptText: fired.prompt,
            })

            // Append soft ask naturally to the answer for seamless widget display
            answer = `${answer}\n\n${fired.prompt}`

            // Update pacing and ask count
            redis.incr(leadAskCountKey).catch(() => {})
            redis.set(leadLastAskTurnKey, currentTurn, { ex: 86400 }).catch(() => {})
          }
        }
      } catch (triggerErr) {
        console.error('[TriggerEngine error]:', triggerErr)
      }
    }

    // Persist after the response so serverless runtimes do not drop cache/log writes.
    if (saveToCache && !media_url) {
      after(async () => {
        const tasks: PromiseLike<any>[] = [redis.set(cacheKey, { answer, source_url }, { ex: 21600 })]
        if (embeddingStr) tasks.push(supabase.from('query_cache').insert({ context_id: resolvedContextId, question_text: canonicalQuestion, question_embedding: embeddingStr, response_text: answer, source_url, hit_count: 1, entity_signature: entitySignature }))
        await Promise.allSettled(tasks)
      })
    }

    after(() => logMessages(
      resolvedContextId,
      session_id,
      clientMessageId,
      userTextQuestion,
      answer,
      source_url,
      client?.id,
      botId,
      finalSource === 'handoff' ? 'waiting' : 'ai',
      media_url,
      media_type,
      media_size_bytes,
      media_storage_path,
      false,
      undefined,
      undefined,
      clientBotMessageId
    ))

    return NextResponse.json(
      { 
        answer, 
        source_url, 
        source: finalSource,
        capture_prompt: capturePrompt,
        suggestions: capturePrompt?.options || undefined
      },
      { headers: { ...cors, 'X-RateLimit-Remaining': String(remaining) } }
    )

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[/api/chat]', message)
    return NextResponse.json(
      { error: 'temporarily_unavailable', answer: FRIENDLY_RETRY_MESSAGE, retryable: true },
      { status: 500, headers: cors }
    )
  }
}

async function checkHasDataSource(contextId: string): Promise<boolean> {
  const { data } = await supabase
    .from('data_sources')
    .select('id')
    .eq('context_id', contextId)
    .eq('enabled', true)
    .single()
  return !!data
}

async function logMessages(
  contextId: string, sessionId: string,
  clientMessageId: string | undefined,
  question: string, answer: string, sourceUrl: string | null,
  clientId?: string, botId?: string | null,
  mode: string = 'ai',
  mediaUrl?: string | null,
  mediaType?: string | null,
  mediaSizeBytes?: number | null,
  mediaStoragePath?: string | null,
  omitUserMessage: boolean = false,
  flowMessages?: any[],
  interaction?: any,
  clientBotMessageId?: string | undefined
) {
  const now = new Date().toISOString()
  let resolvedSessionId = sessionId
  let effectiveClientId = clientId

  // Attempt resolution of effectiveClientId if not passed
  if (!effectiveClientId && botId) {
    const { data: bot } = await supabase.from('bots').select('client_id').eq('id', botId).maybeSingle()
    if (bot?.client_id) effectiveClientId = bot.client_id
  }
  if (!effectiveClientId && contextId && contextId !== 'default') {
    const { data: c } = await supabase.from('clients').select('id').eq('context_id', contextId).maybeSingle()
    if (c?.id) {
      effectiveClientId = c.id
    } else if (isUUID(contextId)) {
      effectiveClientId = contextId
    }
  }

  // 1. Check if session already exists
  let sessionQuery = supabase
    .from('sessions')
    .select('id, session_id, client_id, contact_id, bot_id')
  
  if (isUUID(sessionId)) {
    sessionQuery = sessionQuery.or(`id.eq.${sessionId},session_id.eq.${sessionId}`)
  } else {
    sessionQuery = sessionQuery.eq('session_id', sessionId)
  }

  const { data: existingSession } = await sessionQuery.maybeSingle()

  if (existingSession) {
    resolvedSessionId = existingSession.session_id || existingSession.id
    if (!effectiveClientId && existingSession.client_id) {
      effectiveClientId = existingSession.client_id
    }
  }

  let contactId = existingSession?.contact_id

  // 2. Auto-create Anonymous Contact for new Web Sessions
  if (!existingSession && effectiveClientId) {
    const newContact = await upsertCustomerContact({clientId:effectiveClientId,botId,sessionId,name:`Web Visitor (${sessionId.slice(0, 6)})`,channel:'web',source:'passive',allowAnonymous:true})
    contactId = newContact.id
  }

  // 3. Update existing session or insert a new one
  if (existingSession) {
    // Update by PK to avoid duplicate rows; heal client_id/bot_id if missing
    await supabase.from('sessions')
      .update({
        bot_id: botId || existingSession.bot_id || null,
        client_id: effectiveClientId || existingSession.client_id,
        contact_id: contactId || existingSession.contact_id,
        mode,
        last_message_at: now
      })
      .eq('id', existingSession.id)
  } else if (effectiveClientId) {
    const sessionPayload: any = {
      client_id: effectiveClientId,
      session_id: sessionId,
      bot_id: botId || null,
      contact_id: contactId,
      channel: 'website',
      mode,
      last_message_at: now
    }
    if (isUUID(sessionId)) {
      sessionPayload.id = sessionId
    }
    await supabase.from('sessions').insert(sessionPayload)
  }

  // 3b. If user interacted with a prior flow card, update that card's metadata with their selection and lock it
  if (interaction?.flowId) {
    try {
      const { data: recentMsgs } = await supabase
        .from('messages')
        .select('id, metadata')
        .eq('session_id', resolvedSessionId)
        .order('created_at', { ascending: false })
        .limit(20)

      const target = (recentMsgs || []).find((m: any) => {
        if (!m.metadata) return false
        if (interaction.stepId && m.metadata.stepId === interaction.stepId) return true
        if (m.metadata.flowId === interaction.flowId) return true
        return false
      })

      if (target) {
        const updatedMeta = {
          ...(target.metadata || {}),
          locked: true,
          selectedValue: interaction.value,
          selectedLabel: interaction.label || (typeof interaction.value === 'string' ? interaction.value : undefined),
        }
        const { data: updatedRow } = await supabase
          .from('messages')
          .update({ metadata: updatedMeta })
          .eq('id', target.id)
          .select('id, session_id, role, content, mode, source_url, channel, media_url, media_type, message_type, metadata, created_at')
          .maybeSingle()

        if (updatedRow) {
          broadcastRealtime(chatRoomChannel(resolvedSessionId), 'new_message', updatedRow).catch(() => {})
        }
      }
    } catch (cardErr) {
      console.warn('[logMessages] Card selection update error:', cardErr)
    }
  }

  // Build assistant rows: structured flow messages or standard text response
  const assistantRows = (flowMessages && flowMessages.length > 0)
    ? flowMessages.map((fm: any, idx: number) => ({
        context_id: contextId,
        session_id: resolvedSessionId,
        bot_id: botId,
        channel: 'website',
        role: 'assistant',
        content: fm.payload?.title || fm.payload?.text || fm.payload?.name || fm.content || answer || 'Interactive card',
        message_type: fm.type || 'chat',
        metadata: {
          flowId: fm.flowId,
          stepId: fm.stepId,
          interactive: fm.interactive,
          payload: fm.payload,
          selectedValue: fm.selectedValue,
          selectedLabel: fm.selectedLabel,
          locked: !!fm.locked,
        },
        source_url: sourceUrl,
        created_at: new Date(Date.now() + 10 + (idx * 15)).toISOString()
      }))
    : [{
        context_id: contextId,
        session_id: resolvedSessionId,
        bot_id: botId,
        channel: 'website',
        role: 'assistant',
        content: answer,
        message_type: 'chat',
        metadata: {
          ...(clientBotMessageId ? { client_id: clientBotMessageId } : {}),
        },
        source_url: sourceUrl,
        created_at: new Date(Date.now() + 10).toISOString()
      }]

  // Insert messages with bot_id attached, using resolvedSessionId so messages link to the correct session
  const messageRows = [
    ...(!omitUserMessage ? [{
      context_id: contextId,
      session_id: resolvedSessionId,
      bot_id: botId,
      channel: 'website',
      role: 'user',
      content: question,
      message_type: 'chat',
      metadata: {
        ...(interaction ? { interaction } : {}),
        ...(clientMessageId ? { client_id: clientMessageId } : {}),
        ...(mediaStoragePath ? { media_storage_path: mediaStoragePath } : {}),
      },
      created_at: now,
      ...(mediaUrl ? {
        media_url: mediaUrl,
        media_type: mediaType || 'image/webp',
        media_size_bytes: mediaSizeBytes || null,
      } : {})
    }] : []),
    ...assistantRows,
  ]
  const { data: insertedRows } = await supabase
    .from('messages')
    .insert(messageRows)
    .select('id, session_id, role, content, mode, source_url, channel, media_url, media_type, message_type, metadata, created_at')

  // Realtime Broadcast to Agent Dashboard (Explicit REST delivery via httpSend)
  try {
    const broadcastPromises: Promise<void>[] = []
    if (effectiveClientId) {
      broadcastPromises.push(
        broadcastRealtime(storeInboxChannel(effectiveClientId), 'inbox_update', {
          session_id: resolvedSessionId,
          snippet: (question ? question.slice(0, 40) : (mediaUrl ? '📷 Photo attachment' : '')),
          created_at: now
        })
      )
    }
    if (insertedRows && insertedRows.length > 0) {
      for (const row of insertedRows) {
        broadcastPromises.push(
          broadcastRealtime(chatRoomChannel(resolvedSessionId), 'new_message', row)
        )
      }
    }
    // Await Realtime broadcast dispatch so agent's inbox receives it before stream closes
    await Promise.allSettled(broadcastPromises)
  } catch {}

  // Concurrently update Redis cache to avoid Postgres hits on subsequent polls — DO NOT await
  try {
    if (insertedRows && insertedRows.length > 0) {
      const assistantRow = insertedRows[insertedRows.length - 1]
      const allAliases = Array.from(new Set([resolvedSessionId, sessionId].filter(Boolean)))

      Promise.allSettled([
        // Prime Redis sliding-window buffer with the newly inserted user & assistant messages
        ...insertedRows.map((r) => cacheMessagePayload(resolvedSessionId, r, allAliases)),
        // Atomic CAS forward-only set on the latest message (assistant response)
        ...allAliases.map((sid) => setLastIdIfGreater(sid, assistantRow.id, assistantRow.created_at)),
        redis.del(`inbox:msgs:${resolvedSessionId}`).catch(() => {}),
        redis.del(`inbox:msgs:${sessionId}`).catch(() => {}),
        effectiveClientId ? redis.del(`inbox:convos:${effectiveClientId}`).catch(() => {}) : Promise.resolve(),
      ])
    }
  } catch {}

  // Dispatch webhook event
  fireWebhook(contextId, 'message.received', {
    session_id: sessionId,
    question,
    answer,
    source_url: sourceUrl
  })
}
