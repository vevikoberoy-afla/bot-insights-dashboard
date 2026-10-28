import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceResource } from '@/lib/requestAuth'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const dataset_id = params.id
    const actor = await getAuthenticatedWorkspaceResource(req, 'datasets', dataset_id, 'knowledge', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { bot_id } = await req.json()
    if (!bot_id) return NextResponse.json({ error: 'bot_id is required' }, { status: 400 })
    const { data: ownedBot } = await supabase.from('bots').select('id').eq('id', bot_id).eq('client_id', actor.workspaceId).maybeSingle()
    if (!ownedBot) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error } = await supabase.from('bot_datasets').insert({ bot_id, dataset_id })
    if (error && error.code !== '23505') { // Ignore unique violation
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const dataset_id = params.id
    const actor = await getAuthenticatedWorkspaceResource(req, 'datasets', dataset_id, 'knowledge', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const url = new URL(req.url)
    const bot_id = url.searchParams.get('bot_id')
    if (!bot_id) return NextResponse.json({ error: 'bot_id is required' }, { status: 400 })
    const { data: ownedBot } = await supabase.from('bots').select('id').eq('id', bot_id).eq('client_id', actor.workspaceId).maybeSingle()
    if (!ownedBot) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error } = await supabase.from('bot_datasets').delete().eq('bot_id', bot_id).eq('dataset_id', dataset_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
