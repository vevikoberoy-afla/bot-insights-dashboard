import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { redis } from '@/lib/redis'
import { getAuthenticatedWorkspaceResource } from '@/lib/requestAuth'

const DEFAULT_CONFIG = {
  strict_support_mode: false,
  returns_refunds: false, exchanges: false, price_lookup: false, stock_lookup: false,
  ticket_status: false, csat: false, photo_uploads: false, return_window_days: 30,
  require_order_verification: true, allow_unverified_complaints: true,
  allowed_resolutions: ['refund', 'exchange', 'store_credit'],
}

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const actor = await getAuthenticatedWorkspaceResource(req, 'bots', params.id, 'bots')
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: bot } = await supabase.from('bots').select('client_id').eq('id', params.id).eq('client_id', actor.workspaceId).single()
  if (!bot) return NextResponse.json({ error: 'Bot not found' }, { status: 404 })
  const { data, error } = await supabase.from('bot_settings').select('support_config').eq('bot_id', params.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...DEFAULT_CONFIG, ...(data?.support_config || {}) })
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const actor = await getAuthenticatedWorkspaceResource(req, 'bots', params.id, 'bots', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json()
    const { data: bot } = await supabase.from('bots').select('client_id,bot_flow').eq('id', params.id).eq('client_id', actor.workspaceId).single()
    if (!bot) return NextResponse.json({ error: 'Bot not found' }, { status: 404 })
    const allowedKeys = Object.keys(DEFAULT_CONFIG)
    const input = Object.fromEntries(Object.entries(body).filter(([key]) => allowedKeys.includes(key)))
    const config: any = { ...DEFAULT_CONFIG, ...input }
    config.return_window_days = Math.min(365, Math.max(1, Number(config.return_window_days) || 30))
    config.allowed_resolutions = Array.isArray(config.allowed_resolutions)
      ? config.allowed_resolutions.filter((item: string) => ['refund', 'exchange', 'store_credit'].includes(item)) : DEFAULT_CONFIG.allowed_resolutions
    if (!config.returns_refunds) config.photo_uploads = false
    if (!config.ticket_status) config.csat = false
    const { data, error } = await supabase.from('bot_settings').upsert({
      bot_id: params.id, client_id: bot.client_id, support_config: config, updated_at: new Date().toISOString(),
    }, { onConflict: 'bot_id' }).select('support_config').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (config.strict_support_mode && bot.bot_flow?.type !== 'support') {
      await supabase.from('bots').update({ bot_flow: { ...(bot.bot_flow || {}), type: 'support', mode: 'support_only' }, updated_at: new Date().toISOString() }).eq('id', params.id).eq('client_id', bot.client_id)
    }
    await redis.del(`support_config:${params.id}`).catch(() => {})
    await redis.del(`strict_support_bot:${params.id}`).catch(() => {})
    const { data: client } = await supabase.from('clients').select('context_id').eq('id', bot.client_id).maybeSingle()
    await Promise.all([
      redis.del(`widget_config:${client?.context_id || bot.client_id}:${params.id}`).catch(() => {}),
      redis.del(`widget_config:${bot.client_id}:${params.id}`).catch(() => {}),
      redis.del(`bot_ctx:${params.id}`).catch(() => {}),
    ])
    return NextResponse.json(data.support_config)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Invalid request' }, { status: 400 })
  }
}
