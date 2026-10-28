import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const actor = await getAuthenticatedWorkspaceUser(req, 'settings', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const clientId = actor.workspaceId
    const botId = req.nextUrl.searchParams.get('bot_id')

    if (!clientId && !botId) {
      return NextResponse.json({ error: 'client_id or bot_id is required' }, { status: 400 })
    }

    let resolvedClientId = clientId

    // If only botId provided, resolve clientId from bot
    if (!resolvedClientId && botId) {
      const { data: bot } = await supabase.from('bots').select('client_id').eq('id', botId).eq('client_id', actor.workspaceId).maybeSingle()
      if (bot?.client_id) resolvedClientId = bot.client_id
    }

    if (!resolvedClientId) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    // 1. Fetch client record
    const { data: client } = await supabase
      .from('clients')
      .select('id, context_id, website_url')
      .eq('id', resolvedClientId)
      .maybeSingle()

    // If client already has a valid context_id, return it
    if (client?.context_id && client.context_id !== 'null') {
      return NextResponse.json({ context_id: client.context_id, client_id: client.id })
    }

    // 2. Client does NOT have a context_id -> auto-provision one in contexts table
    const siteUrl = client?.website_url || 'https://vittain.com'
    const { data: newContext, error: ctxErr } = await supabase
      .from('contexts')
      .insert({
        site_url: siteUrl,
        crawl_status: 'complete'
      })
      .select('id')
      .single()

    if (ctxErr || !newContext) {
      console.error('[ensure-context] Failed to insert context:', ctxErr)
      return NextResponse.json({
        context_id: client?.id || resolvedClientId,
        client_id: client?.id || resolvedClientId
      })
    }

    // 3. Update client record with the new context_id
    await supabase
      .from('clients')
      .update({ context_id: newContext.id })
      .eq('id', resolvedClientId)

    return NextResponse.json({
      context_id: newContext.id,
      client_id: resolvedClientId
    })
  } catch (err: any) {
    console.error('[ensure-context error]:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
