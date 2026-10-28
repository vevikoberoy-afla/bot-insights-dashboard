import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function GET(req: NextRequest) {
    const actor = await getAuthenticatedWorkspaceUser(req, 'analytics')
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const client_id = actor.workspaceId

    const { data, error } = await supabase
        .from('feedback')
        .select('rating, bot_id!inner(client_id)')
        .eq('bot_id.client_id', client_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const total = data.length
    if (total === 0) return NextResponse.json({ csat: 0, total_ratings: 0 })

    const positive = data.filter(f => f.rating === 'positive').length
    const csat = Math.round((positive / total) * 100)

    return NextResponse.json({ csat, total_ratings: total })
}
