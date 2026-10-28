import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceResource } from '@/lib/requestAuth'

// GET /api/channels/config?bot_id=xxx
// POST /api/channels/config — Connect/Update a channel
export async function GET(req: NextRequest) {
    const bot_id = req.nextUrl.searchParams.get('bot_id')
    if (!bot_id) return NextResponse.json({ error: 'bot_id is required' }, { status: 400 })
    const actor = await getAuthenticatedWorkspaceResource(req, 'bots', bot_id, 'bots')
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
        .from('bot_channels')
        .select('*')
        .eq('bot_id', bot_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json()
        const { bot_id, channel_type, identifier, credentials } = body

        if (!bot_id || !channel_type) {
            return NextResponse.json({ error: 'bot_id and channel_type are required' }, { status: 400 })
        }
        const actor = await getAuthenticatedWorkspaceResource(req, 'bots', bot_id, 'bots', true)
        if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { data, error } = await supabase
            .from('bot_channels')
            .upsert({
                bot_id,
                channel_type,
                identifier: identifier || null,
                credentials: credentials || null,
                status: 'connected',
                connected_at: new Date().toISOString()
            }, { onConflict: 'bot_id,channel_type' })
            .select()
            .single()

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json(data, { status: 201 })
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
}
