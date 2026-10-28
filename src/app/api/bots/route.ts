import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { redis } from '@/lib/redis'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function GET(req: NextRequest) {
  const actor=await getAuthenticatedWorkspaceUser(req,'bots')
  if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
  const client_id = actor.workspaceId

  const { data, error } = await supabase
    .from('bots')
    // List screens must not pull prompts and bot_flow JSON for every bot.
    .select('id, client_id, name, purpose, status, channel, bot_avatar, created_at, updated_at')
    .eq('client_id', client_id)
    .order('created_at', { ascending: false })
    .limit(250)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
  const actor=await getAuthenticatedWorkspaceUser(req,'bots',true)
  if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
  try {
    const body = await req.json()
    const client_id=actor.workspaceId
    const { name, type, channel, purpose, custom_instructions, tone, knowledgeBases, databases, widgetConfig } = body

    if (!client_id || !name?.trim()) {
      return NextResponse.json({ error: 'client_id and name are required' }, { status: 400 })
    }

    const { data: client } = await supabase.from('clients').select('context_id').eq('id', client_id).single()

    // 1. Create Bot in Supabase
    const determinedPurpose = purpose || (['marketing','support','service','sales'].includes(type) ? type : type === 'both' ? 'omnichannel' : 'support')
    const { data: bot, error } = await supabase
      .from('bots')
      .insert({
        client_id,
        name: name.trim(),
        channel: channel || 'web',
        purpose: determinedPurpose,
        system_prompt: custom_instructions || body.oneliner || '',
        bot_tone: tone || 'friendly',
        status: 'active',
        bot_flow: { 
          type, 
          integration_id: body.channelAccount,
          tags: body.tags || [],
          oneliner: body.oneliner || '',
          schedule: body.schedule || '24_7',
          auto_ticket: body.autoTicket ?? true,
        },
        opening_message: body.openingMessage || widgetConfig?.openingMessage || 'Hi there! How can I help you today?',
        show_callout_only: widgetConfig?.showCalloutOnly || false,
        callout_title: widgetConfig?.calloutTitle || 'Need help?',
        handoff_message: body.handoffMessage || 'Let me connect you with a human agent...',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // A Support Bot is intentionally narrow: it verifies the registered phone
    // and order before answering, and it cannot enter booking or shopping flows.
    if (type === 'support' || determinedPurpose === 'support') {
      await Promise.all([
        supabase.from('bot_settings').upsert({bot_id:bot.id,client_id,support_config:{strict_support_mode:true,returns_refunds:true,exchanges:true,price_lookup:true,stock_lookup:true,ticket_status:true,csat:true,photo_uploads:true,return_window_days:30,require_order_verification:true,allow_unverified_complaints:true,allowed_resolutions:['refund','exchange','store_credit']},updated_at:new Date().toISOString()},{onConflict:'bot_id'}),
        supabase.from('bot_commerce_config').upsert({bot_id:bot.id,client_id,booking_enabled:false,ordering_enabled:false,show_catalog:false,allow_booking_management:false,allow_order_management:true,menu_title:'Customer support',booking_label:'',catalogue_label:'',updated_at:new Date().toISOString()},{onConflict:'bot_id'}),
      ])
    }

    // 2. Link Knowledge Bases
    if (knowledgeBases?.length > 0) {
      await supabase.from('bot_datasets').insert(
        knowledgeBases.map((id: string) => ({ bot_id: bot.id, dataset_id: id }))
      )
    }

    // 3. Link Databases (Structured Data)
    if (databases?.length > 0) {
      await supabase.from('bot_databases').insert(
        databases.map((id: string, index: number) => ({ bot_id: bot.id, database_id: id, priority: index }))
      )
    }

    // A mailbox belongs to exactly one bot. Creating an email bot from a
    // connected account makes that routing explicit immediately.
    if (channel === 'email' && body.channelAccount) {
      await supabase.from('channel_integrations').update({bot_id:bot.id,updated_at:new Date().toISOString()}).eq('id',body.channelAccount).eq('client_id',client_id).eq('channel','email')
    }

    // 3. Invalidate widget config cache
    if (client?.context_id) {
      try {
        await redis.del(`widget_config:${client.context_id}`)
      } catch (redisErr) {
        console.warn('Redis cache invalidation failed:', redisErr)
      }
    }

    return NextResponse.json(bot, { status: 201 })
  } catch (err) {
    console.error('POST /api/bots error:', err)
    return NextResponse.json({ error: 'Invalid request', details: err }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  const actor=await getAuthenticatedWorkspaceUser(req,'bots',true)
  if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
  const id = req.nextUrl.searchParams.get('id')
  const client_id = actor.workspaceId
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data: client } = await supabase.from('clients').select('context_id').eq('id', client_id).single()

  const { data: deleted, error } = await supabase.from('bots').delete().eq('id', id).eq('client_id', client_id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!deleted?.length) return NextResponse.json({ error: 'Bot not found' }, { status: 404 })

  // A cache outage must not turn a committed deletion into a reported failure.
  const contexts = Array.from(new Set([client?.context_id, client_id, 'global'].filter(Boolean)))
  const keys = contexts.flatMap(context => [`widget_config:${context}:${id}`, `widget_config:${context}`])
  keys.push(`widget_config:${id}`, `strict_support_bot:${id}`, `bot_context:${id}`, `bot_ctx:${id}`, `bot_ctx:${client_id}`, `client_ctx:${client_id}`)
  if (client?.context_id) keys.push(`client_ctx:${client.context_id}`)
  await Promise.all(keys.map(async key => {
    try { await redis.del(key) }
    catch { console.warn('[DELETE /api/bots] Cache invalidation failed') }
  }))

  return NextResponse.json({ success: true })
}
