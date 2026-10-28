import { NextRequest, NextResponse } from 'next/server'
import { supabase, broadcastRealtime } from '@/lib/supabase'
import { embed } from '@/lib/embeddings'
import { generateAnswerUnified } from '@/lib/gemini'
import { redis } from '@/lib/redis'
import { writeMessage } from '@/lib/chat/writeMessage'
import { withTimeout } from '@/lib/utils/withTimeout'
import { decryptConfigSecrets } from '@/lib/security/secretVault'
import { handleSupportFlow } from '@/lib/supportFlow'
import { upsertCustomerContact } from '@/lib/customerContacts'
import { FRIENDLY_RETRY_MESSAGE } from '@/lib/customerErrorMessage'

export async function POST(req: NextRequest) {
  try {
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET
    if (!secretToken && process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Webhook secret is not configured' }, { status: 503 })
    }
    if (secretToken) {
      const headerSecret = req.headers.get('x-telegram-bot-api-secret-token')
      if (headerSecret !== secretToken) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const update = await req.json()

    // 1. Validate payload — acknowledge non-text silently (stops Telegram retry)
    if (!update.message || !update.message.text) {
      return NextResponse.json({ ok: true })
    }

    const { chat, text, from: tgUser } = update.message
    const chatId = String(chat.id)
    const sessionId = `tg_${chatId}`

    // 2. Multi-tier resilient bot + token resolution (with 10-minute Redis cache)
    const tgCacheKey = 'tg_bot_config'
    let bot: any = null
    let botToken: string | null = null
    let resolvedContextId: string | null = null

    try {
      const cachedConfig = await redis.get<{ bot: any; botToken: string; resolvedContextId: string }>(tgCacheKey)
      if (cachedConfig?.bot && cachedConfig?.botToken) {
        bot = cachedConfig.bot
        botToken = cachedConfig.botToken
        resolvedContextId = cachedConfig.resolvedContextId
      }
    } catch {}

    if (!bot || !botToken) {
      botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || null

      // Find any Telegram integration instances in channel_integrations
      const { data: telegramIntegrations } = await supabase
        .from('channel_integrations')
        .select('id, client_id, config, status')
        .eq('channel', 'telegram')
        .order('created_at', { ascending: false })

      const activeIntegration = telegramIntegrations?.find(i => i.status === 'active') || telegramIntegrations?.[0]
      if (activeIntegration) activeIntegration.config = decryptConfigSecrets(activeIntegration.client_id, activeIntegration.config)
      if (activeIntegration?.config?.bot_token && !botToken) {
        botToken = activeIntegration.config.bot_token.trim()
      }

      // Fetch all bots using select('*')
      const { data: allBots, error: botsError } = await supabase
        .from('bots')
        .select('*')
        .order('created_at', { ascending: false })

      if (botsError) {
        console.error('[Telegram] Error querying bots table:', botsError)
      }

      if (allBots && allBots.length > 0) {
        // 1. Bot with channel = 'telegram' (case-insensitive)
        bot = allBots.find(b =>
          (b.channel && String(b.channel).toLowerCase() === 'telegram') ||
          (b.bot_flow?.channel && String(b.bot_flow.channel).toLowerCase() === 'telegram')
        )

        // 2. Bot linked to active Telegram integration or belonging to same client
        if (!bot && activeIntegration) {
          bot = allBots.find(b => b.bot_flow?.integration_id === activeIntegration.id)
            || allBots.find(b => b.client_id === activeIntegration.client_id && b.status === 'active')
            || allBots.find(b => b.client_id === activeIntegration.client_id)
        }

        // 3. Bot with inline token
        if (!bot) {
          bot = allBots.find(b => b.bot_flow?.bot_token)
            // 4. Any active bot, or the most recent bot
            || allBots.find(b => b.status === 'active')
            || allBots[0]
        }
      }

      // Secondary token checks if not yet resolved
      if (!botToken && bot?.bot_flow?.bot_token) {
        botToken = bot.bot_flow.bot_token.trim()
      }
      if (!botToken && bot?.bot_flow?.integration_id) {
        const { data: integ } = await supabase
          .from('channel_integrations')
          .select('config')
          .eq('id', bot.bot_flow.integration_id)
          .maybeSingle()
        const integrationConfig = activeIntegration ? decryptConfigSecrets(activeIntegration.client_id, integ?.config) : integ?.config
        if (integrationConfig?.bot_token) {
          botToken = integrationConfig.bot_token.trim()
        }
      }

      if (!bot) {
        console.error('[Telegram] No bots found in the database. Please create a bot in the dashboard first.')
        return NextResponse.json({ ok: true })
      }

      if (!botToken) {
        console.error('[Telegram] No bot_token found. Configure your bot token in Settings -> Integrations -> Telegram or in .env.local.')
        return NextResponse.json({ ok: true })
      }

      // Resolve client context ID
      const { data: clientRow } = await supabase
        .from('clients')
        .select('id, context_id')
        .eq('id', bot.client_id)
        .maybeSingle()

      resolvedContextId = (clientRow?.context_id && clientRow.context_id !== 'null')
        ? clientRow.context_id
        : bot.client_id

      // Cache resolved config for 10 minutes (600s)
      redis.set(tgCacheKey, { bot, botToken, resolvedContextId }, { ex: 600 }).catch(() => {})
    }

    console.log(`[Telegram] Handling message for bot "${bot.name}" (ID: ${bot.id}, channel: ${bot.channel}, status: ${bot.status})`)

    // 4. Check for existing session and human mode
    const { data: existingSession } = await supabase
      .from('sessions')
      .select('id, session_id, mode, contact_id')
      .eq('session_id', sessionId)
      .maybeSingle()

    const cleanQuestion = text.trim().slice(0, 500)
    const now = new Date().toISOString()

    // 5. Create or link Contact for Live Chat inbox display
    let contactId = existingSession?.contact_id || null
    if (!contactId && bot.client_id) {
      const fullName = tgUser
        ? [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || tgUser.username || `Telegram ${chatId}`
        : `Telegram ${chatId}`

      try {
        const contact = await upsertCustomerContact({clientId:bot.client_id,botId:bot.id,sessionId,name:fullName,channel:'telegram',source:'telegram',customFields:tgUser?.username?{telegram_username:tgUser.username}:{},allowAnonymous:true})
        contactId = contact.id
      } catch (cErr) {
        console.warn('[Telegram] Could not create contact record:', cErr)
      }
    }

    // If human agent has taken over, do not auto-respond with AI
    if (existingSession?.mode === 'human') {
      const userMsg = await writeMessage({
        sessionId,
        role: 'user',
        content: cleanQuestion,
        mode: 'human',
        contextId: resolvedContextId,
        botId: bot.id,
        channel: 'telegram',
        clientId: bot.client_id,
      })

      await supabase.from('sessions').update({ last_message_at: userMsg.created_at }).eq('id', existingSession.id)

      return NextResponse.json({ ok: true })
    }
    const guidedFlow = await handleSupportFlow({clientId:bot.client_id,botId:bot.id,sessionId,text:cleanQuestion,channel:'telegram',knownContact:{name:tgUser?[tgUser.first_name,tgUser.last_name].filter(Boolean).join(' '):null}})
    if (guidedFlow) {
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text:guidedFlow.answer})})
      await writeMessage({sessionId,role:'user',content:cleanQuestion,mode:'ai',contextId:resolvedContextId,botId:bot.id,channel:'telegram',clientId:bot.client_id})
      await writeMessage({sessionId,role:'assistant',content:guidedFlow.answer,mode:'ai',contextId:resolvedContextId,botId:bot.id,channel:'telegram',clientId:bot.client_id})
      return NextResponse.json({ok:true})
    }
    // Immediate presence: Send "typing..." action so user gets immediate visual feedback (<50ms)
    fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    }).catch(() => {})

    // Fast-path: Check exact question cache (<2ms)
    const b64Q = Buffer.from(cleanQuestion.toLowerCase()).toString('base64')
    const cacheKey = `chat_cache:${resolvedContextId}:${b64Q}`
    const cachedAnswer = await redis.get<{ answer: string; source_url: string | null }>(cacheKey).catch(() => null)

    if (cachedAnswer?.answer) {
      const safeAnswer = cachedAnswer.answer
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: safeAnswer, parse_mode: 'HTML' }),
      })

      Promise.allSettled([
        writeMessage({
          sessionId,
          role: 'user',
          content: cleanQuestion,
          mode: 'ai',
          contextId: resolvedContextId,
          botId: bot.id,
          channel: 'telegram',
          clientId: bot.client_id,
        }),
        writeMessage({
          sessionId,
          role: 'assistant',
          content: cachedAnswer.answer,
          mode: 'ai',
          contextId: resolvedContextId,
          botId: bot.id,
          channel: 'telegram',
          clientId: bot.client_id,
          sourceUrl: cachedAnswer.source_url,
        }),
      ]).catch(() => {})

      return NextResponse.json({ ok: true })
    }

    // 6. Gather Datasets, History & Embedding in parallel
    const datasetCacheKey = `tg_bot_datasets:${bot.id}`

    const [cachedDatasets, historyRes, questionEmbedding] = await Promise.all([
      redis.get<string[]>(datasetCacheKey).catch(() => null),
      supabase
        .from('messages')
        .select('role, content')
        .eq('session_id', sessionId)
        .in('role', ['user', 'assistant'])
        .order('created_at', { ascending: true })
        .limit(10),
      embed(cleanQuestion),
    ])

    // Resolve active dataset IDs
    let activeDatasetIds: string[] = cachedDatasets || []
    if (!cachedDatasets) {
      const { data: linkedDatasets } = await supabase
        .from('bot_datasets')
        .select('dataset_id, datasets(active_from, active_until)')
        .eq('bot_id', bot.id)

      if (linkedDatasets && linkedDatasets.length > 0) {
        const nowDate = new Date()
        for (const link of linkedDatasets as any[]) {
          const ds = link.datasets
          if (!ds) { activeDatasetIds.push(link.dataset_id); continue }
          if (ds.active_from && new Date(ds.active_from) > nowDate) continue
          if (ds.active_until && new Date(ds.active_until) < nowDate) continue
          activeDatasetIds.push(link.dataset_id)
        }
      }

      if (activeDatasetIds.length === 0 && bot.client_id) {
        const { data: clientDatasets } = await supabase
          .from('datasets')
          .select('id')
          .eq('client_id', bot.client_id)
        if (clientDatasets) {
          activeDatasetIds = clientDatasets.map((d: any) => d.id)
        }
      }
      redis.set(datasetCacheKey, activeDatasetIds, { ex: 600 }).catch(() => {})
    }

    const history = (historyRes.data || []).map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // 7. Targeted Vector search using HNSW index
    const embeddingStr = JSON.stringify(questionEmbedding)

    let chunks: any[] = []

    if (activeDatasetIds.length > 0) {
      const { data } = await supabase.rpc('match_chunks_by_datasets', {
        p_dataset_ids: activeDatasetIds,
        p_embedding: embeddingStr,
        p_match_count: 5,
      })
      chunks = data || []
    } else if (resolvedContextId) {
      const { data } = await supabase.rpc('match_chunks', {
        p_context_id: resolvedContextId,
        p_embedding: embeddingStr,
        p_match_count: 5,
      })
      chunks = data || []
    }

    if (chunks.length === 0 && bot.client_id && bot.client_id !== resolvedContextId) {
      const { data } = await supabase.rpc('match_chunks', {
        p_context_id: bot.client_id,
        p_embedding: embeddingStr,
        p_match_count: 5,
      })
      chunks = data || []
    }

    // 8. Generate AI Answer with single-pass Gemini tool calling
    const botPrompt = bot.prompt || bot.system_prompt || bot.bot_flow?.prompt || bot.bot_flow?.oneliner || null

    let answer:string,source_url:string|null=null
    try{({answer,source_url}=await generateAnswerUnified({
        question: cleanQuestion,
        knowledgeChunks: chunks,
        history,
        clientId: bot.client_id,
        botId: bot.id,
        botPrompt,
        onToolCall: async (_name, args) => {
          const id = args?.identifier ? ` for <b>${args.identifier}</b>` : ''
          fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: `🔍 Checking our records${id}...`, parse_mode: 'HTML' }),
          }).catch(() => {})
        },
      }))}catch(error:any){console.error('[Telegram] AI response failed:',error?.message||error);answer=FRIENDLY_RETRY_MESSAGE}

    // Handle Handoff
    const isHandoff = answer.includes('[HANDOFF]')
    if (isHandoff) {
      answer = bot.handoff_message || 'I am connecting you to a human agent. Please hold on.'
      if (bot.client_id) {
        Promise.resolve(
          supabase.from('handoff_requests').insert({
            session_id: sessionId,
            client_id: bot.client_id,
            reason: 'Customer requested human support',
            status: 'pending',
          })
        ).catch(() => {})
      }
    }

    // Escape HTML special characters for Telegram parse_mode
    const safeAnswer = answer
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    // 11. Send reply back to Telegram immediately
    let telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: safeAnswer, parse_mode: 'HTML' }),
    })
    if (!telegramRes.ok) {
      telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: answer }),
      })
    }

    const nextMode = isHandoff ? 'waiting' : (existingSession?.mode || 'ai')

    // 12. Fire-and-forget: Upsert Session and Write Messages into DB & Realtime sync
    ;(async () => {
      try {
        if (existingSession) {
          await supabase.from('sessions').update({
            bot_id: bot.id,
            client_id: bot.client_id,
            contact_id: contactId || existingSession.contact_id,
            mode: nextMode,
            last_message_at: now,
          }).eq('id', existingSession.id)
        } else {
          await supabase.from('sessions').insert({
            session_id: sessionId,
            client_id: bot.client_id,
            bot_id: bot.id,
            contact_id: contactId,
            channel: 'telegram',
            mode: nextMode,
            last_message_at: now,
          })
        }

        await Promise.allSettled([
          writeMessage({
            sessionId,
            role: 'user',
            content: cleanQuestion,
            mode: nextMode,
            contextId: resolvedContextId,
            botId: bot.id,
            channel: 'telegram',
            clientId: bot.client_id,
          }),
          writeMessage({
            sessionId,
            role: 'assistant',
            content: answer,
            mode: nextMode,
            contextId: resolvedContextId,
            botId: bot.id,
            channel: 'telegram',
            clientId: bot.client_id,
            sourceUrl: source_url,
          }),
        ])

        if (!isHandoff && chunks.length > 0) {
          redis.set(cacheKey, { answer, source_url }, { ex: 21600 }).catch(() => {})
        }
      } catch (postErr) {
        console.error('[Telegram] Post-reply DB write error:', postErr)
      }
    })()

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Telegram] Error processing update:', err)
    return NextResponse.json({ ok: true })
  }
}
