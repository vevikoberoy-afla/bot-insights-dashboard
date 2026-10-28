import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getCorsHeaders, handleOptions } from '@/lib/cors'
import { redis } from '@/lib/redis'
import { journeyPolicyFromFlow } from '@/lib/botJourney'

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin')
  const contextId = req.nextUrl.searchParams.get('ctx') ?? ''
  const botId = req.nextUrl.searchParams.get('bot')
  const cors = await getCorsHeaders(contextId, origin, botId)
  return handleOptions(cors)
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  let contextId = req.nextUrl.searchParams.get('ctx') ?? ''
  const botId = req.nextUrl.searchParams.get('bot')
  let effectiveBotId = botId

  // Auto-resolve contextId from botId if omitted in script embed
  if (!contextId && effectiveBotId) {
    const { data: botRecord } = await supabase
      .from('bots')
      .select('client_id, clients(context_id)')
      .eq('id', effectiveBotId)
      .maybeSingle()
    if (botRecord?.clients) {
      contextId = (botRecord.clients as any).context_id || ''
    }
  }

  // The homepage preview must use an explicitly configured demo bot. Selecting
  // the latest tenant bot can expose another customer's configuration.
  if (!contextId && !effectiveBotId) {
    effectiveBotId = process.env.DEMO_BOT_ID || null
  }

  const cors = await getCorsHeaders(contextId, origin, effectiveBotId)

  if (!contextId && !effectiveBotId) {
    return NextResponse.json({ error: 'Missing ctx or bot parameter' }, { status: 400, headers: cors })
  }

  const cacheKey = `widget_config:${contextId || 'global'}${effectiveBotId ? `:${effectiveBotId}` : ''}`

  try {
    const cachedConfig = await redis.get(cacheKey)
    if (cachedConfig) {
      return NextResponse.json(cachedConfig, { headers: cors })
    }

    let clientId: string | null = null
    if (contextId) {
      let { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('context_id', contextId)
        .maybeSingle()
      if (!client) {
        const { data: clientById } = await supabase
          .from('clients')
          .select('id')
          .eq('id', contextId)
          .maybeSingle()
        client = clientById
      }
      if (client?.id) clientId = client.id
    }

    const selectFields = 'id, client_id, theme_color, widget_title, welcome_message, opening_message, callout_timer, callout_title, show_callout_only, auto_open_after, show_once_per_session, bot_flow, photo_upload_enabled, bot_tone, tone'

    // Get bot config
    let botConfig: any | null = null
    if (effectiveBotId) {
      const { data } = await supabase.from('bots')
        .select(selectFields)
        .eq('id', effectiveBotId).maybeSingle()
      botConfig = data
    } else if (clientId) {
      // Fallback: first website bot
      const { data } = await supabase.from('bots')
        .select(selectFields)
        .eq('client_id', clientId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      botConfig = data
    }

    if (!botConfig) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404, headers: cors })
    }

    const { data: supportSettings } = await supabase.from('bot_settings').select('support_config').eq('bot_id', botConfig.id).maybeSingle()

    const targetClientId = clientId || botConfig.client_id

    // Check for an active website campaign
    let proactiveMessage = null
    if (targetClientId) {
      const { data: activeCampaign } = await supabase
        .from('campaigns')
        .select('id, name')
        .eq('client_id', targetClientId)
        .eq('channel', 'website')
        .eq('status', 'sending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (activeCampaign) {
        const { data: campaignMsg } = await supabase
          .from('campaign_messages')
          .select('body_text')
          .eq('campaign_id', activeCampaign.id)
          .limit(1)
          .maybeSingle()
        
        if (campaignMsg?.body_text) {
          proactiveMessage = campaignMsg.body_text
          supabase.rpc('increment_campaign_stat', { p_campaign_id: activeCampaign.id, p_stat: 'delivered' }).then()
        }
      }
    }

    const openingMessage = botConfig.opening_message || botConfig.bot_flow?.opening_message || botConfig.welcome_message || 'Hi there! How can I help you today?'
    const autoOpen = botConfig.bot_flow?.auto_open ?? true
    const calloutOnly = botConfig.show_callout_only ?? botConfig.bot_flow?.callout_only ?? false
    const openDelay = botConfig.callout_timer ?? (botConfig.bot_flow?.open_delay ? parseInt(botConfig.bot_flow.open_delay, 10) : 3)
    const showOncePerSession = botConfig.show_once_per_session ?? botConfig.bot_flow?.show_once_per_session ?? true
    const openAfterCallout = botConfig.bot_flow?.open_after_callout ?? false

    // Extract configured timed popups from bot_flow
    const rawTimedPopups = botConfig.bot_flow?.timed_popups || []
    const timedPopups = Array.isArray(rawTimedPopups)
      ? rawTimedPopups
          .filter((p: any) => p && p.enabled !== false && (p.message || '').trim())
          .sort((a: any, b: any) => (Number(a.delay_seconds) || 0) - (Number(b.delay_seconds) || 0))
      : []

    const responsePayload = {
      id: botConfig.id,
      bot_id: botConfig.id,
      theme_color: botConfig.theme_color || '#7c3aed',
      widget_title: botConfig.widget_title || 'AI Assistant',
      welcome_message: botConfig.welcome_message || 'Hi there! How can I help you today?',
      opening_message: openingMessage,
      callout_title: botConfig.callout_title || openingMessage,
      callout_timer: isNaN(openDelay) ? 3 : openDelay,
      auto_open: autoOpen,
      callout_only: calloutOnly,
      open_delay: isNaN(openDelay) ? 3 : openDelay,
      open_after_callout: openAfterCallout,
      show_once_per_session: showOncePerSession,
      proactive_message: proactiveMessage,
      timed_popups: timedPopups,
      photo_upload_enabled: !!(botConfig.photo_upload_enabled || botConfig.bot_flow?.photo_upload_enabled || supportSettings?.support_config?.photo_uploads),
      bot_tone: botConfig.bot_tone || botConfig.tone || botConfig.bot_flow?.bot_tone || 'friendly',
      strict_support: journeyPolicyFromFlow(botConfig.bot_flow).supportOnly || supportSettings?.support_config?.strict_support_mode === true,
      suggestions: journeyPolicyFromFlow(botConfig.bot_flow).supportOnly
        ? ['Order status', 'Return item', 'Refund policy', 'Talk to human agent']
        : [],
      supabase_url: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
      supabase_anon_key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || null,
    }

    await redis.setex(cacheKey, 600, responsePayload) // 10 min cache

    return NextResponse.json(responsePayload, { headers: cors })
  } catch (err: any) {
    // Never expose module paths, database errors, credentials, or stack details
    // to a customer-facing embed. Full diagnostics stay in server logs.
    console.error('[widget config] unavailable', err)
    return NextResponse.json(
      { error: 'Bot is temporarily unavailable.', code: 'WIDGET_CONFIG_UNAVAILABLE' },
      { status: 503, headers: cors }
    )
  }
}
