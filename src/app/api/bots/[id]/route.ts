import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { redis } from '@/lib/redis'
import { redactSecretsForBrowser } from '@/lib/security/redactSecrets'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'
import { validateBotJourney } from '@/lib/botJourney'

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const actor=await getAuthenticatedWorkspaceUser(req,'bots')
  if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
  const params = await props.params;
  const { id } = params
  if (!id) return NextResponse.json({ error: 'Missing bot ID' }, { status: 400 })

  const { data, error } = await supabase
    .from('bots')
    .select('*')
    .eq('id', id)
    .eq('client_id',actor.workspaceId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(redactSecretsForBrowser(data))
}

export async function PUT(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const actor=await getAuthenticatedWorkspaceUser(req,'bots',true)
  if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
  const params = await props.params;
  const { id } = params
  if (!id) return NextResponse.json({ error: 'Missing bot ID' }, { status: 400 })

  try {
    const body = await req.json()
    if (body.bot_flow?.version === 1) {
      const checked = validateBotJourney(body.bot_flow)
      if (!checked.journey) return NextResponse.json({ error: checked.errors.join(' ') }, { status: 400 })
      body.bot_flow = checked.journey
    }

    // 1. Normalize aliases to exact database columns
    const normalizedSystemPrompt = body.system_prompt !== undefined ? body.system_prompt : body.prompt
    const normalizedAvatar = body.bot_avatar !== undefined ? body.bot_avatar : body.avatar_url
    const normalizedTone = body.bot_tone !== undefined ? body.bot_tone : body.tone
    const normalizedPurpose = body.purpose !== undefined ? body.purpose : body.description

    // Exact database columns present in public.bots table
    const allowedColumns = [
      'name', 'purpose', 'status', 'opening_message', 'callout_timer', 'callout_title',
      'show_callout_only', 'auto_open_after', 'show_once_per_session', 'bot_flow',
      'system_prompt', 'bot_tone', 'tone', 'response_length', 'use_emojis', 'handoff_message',
      'confidence_threshold', 'max_turns', 'theme_color', 'widget_title', 'welcome_message',
      'channel', 'bot_avatar', 'fallback_message', 'chatwoot_inbox_id',
      'whatsapp_phone_number_id', 'whatsapp_access_token',
      'photo_upload_enabled', 'vision_ai_enabled'
    ]

    const updates: Record<string, any> = {}
    for (const col of allowedColumns) {
      if (body[col] !== undefined) updates[col] = body[col]
    }

    if (normalizedSystemPrompt !== undefined) updates.system_prompt = normalizedSystemPrompt
    if (normalizedAvatar !== undefined) updates.bot_avatar = normalizedAvatar
    if (normalizedTone !== undefined) {
      updates.bot_tone = normalizedTone
      updates.tone = normalizedTone
    }
    if (normalizedPurpose !== undefined) updates.purpose = normalizedPurpose

    updates.updated_at = new Date().toISOString()

    const { data: bot, error } = await supabase
      .from('bots')
      .update(updates)
      .eq('id', id)
      .eq('client_id',actor.workspaceId)
      .select()
      .single()

    if (error) {
      console.error('[PUT /api/bots/[id]] Supabase update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Defensive Redis cache invalidation
    try {
      const { data: client } = await supabase.from('clients').select('id, context_id').eq('id', bot.client_id).single()
      if (client?.context_id) {
        await redis.del(`widget_config:${client.context_id}:${id}`).catch(() => {})
        await redis.del(`widget_config:${client.context_id}`).catch(() => {})
        await redis.del(`client_ctx:${client.context_id}`).catch(() => {})
      }
      if (client?.id) {
        await redis.del(`widget_config:${client.id}:${id}`).catch(() => {})
        await redis.del(`widget_config:${client.id}`).catch(() => {})
      }
      await redis.del(`widget_config:global:${id}`).catch(() => {})
      await redis.del(`widget_config:global`).catch(() => {})
      await redis.del(`widget_config:${id}`).catch(() => {})
      await redis.del(`strict_support_bot:${id}`).catch(() => {})
      await redis.del(`bot_context:${id}`).catch(() => {})
      await redis.del(`bot_ctx:${id}`).catch(() => {})
      if (bot.client_id) {
        await redis.del(`bot_ctx:${bot.client_id}`).catch(() => {})
        await redis.del(`client_ctx:${bot.client_id}`).catch(() => {})
      }
    } catch (redisErr) {
      console.warn('[PUT /api/bots/[id]] Redis eviction warning:', redisErr)
    }

    return NextResponse.json(redactSecretsForBrowser(bot))
  } catch (err: any) {
    console.error('[PUT /api/bots/[id]] Exception:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
