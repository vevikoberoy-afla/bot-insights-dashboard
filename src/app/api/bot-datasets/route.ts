import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

// POST /api/bot-datasets — Link a dataset to a bot
// DELETE /api/bot-datasets?bot_id=xxx&dataset_id=xxx — Unlink

export async function POST(req: NextRequest) {
    try {
        const actor = await getAuthenticatedWorkspaceUser(req, 'knowledge', true)
        if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const { bot_id, dataset_id } = await req.json()
        if (!bot_id || !dataset_id) {
            return NextResponse.json({ error: 'bot_id and dataset_id are required' }, { status: 400 })
        }
        const [bot, dataset] = await Promise.all([
            supabase.from('bots').select('id').eq('id', bot_id).eq('client_id', actor.workspaceId).maybeSingle(),
            supabase.from('datasets').select('id').eq('id', dataset_id).eq('client_id', actor.workspaceId).maybeSingle(),
        ])
        if (!bot.data || !dataset.data) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const { data, error } = await supabase
            .from('bot_datasets')
            .insert({ bot_id, dataset_id })
            .select()
            .single()

        if (error) {
            if (error.code === '23505') return NextResponse.json({ error: 'Already linked' }, { status: 409 })
            return NextResponse.json({ error: error.message }, { status: 500 })
        }
        return NextResponse.json(data, { status: 201 })
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
}

export async function DELETE(req: NextRequest) {
    const actor = await getAuthenticatedWorkspaceUser(req, 'knowledge', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const bot_id = req.nextUrl.searchParams.get('bot_id')
    const dataset_id = req.nextUrl.searchParams.get('dataset_id')

    if (!bot_id || !dataset_id) {
        return NextResponse.json({ error: 'bot_id and dataset_id are required' }, { status: 400 })
    }
    const [bot, dataset] = await Promise.all([
        supabase.from('bots').select('id').eq('id', bot_id).eq('client_id', actor.workspaceId).maybeSingle(),
        supabase.from('datasets').select('id').eq('id', dataset_id).eq('client_id', actor.workspaceId).maybeSingle(),
    ])
    if (!bot.data || !dataset.data) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error } = await supabase
        .from('bot_datasets')
        .delete()
        .eq('bot_id', bot_id)
        .eq('dataset_id', dataset_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
}
