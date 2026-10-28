import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function GET(req: NextRequest) {
    const actor = await getAuthenticatedWorkspaceUser(req, 'analytics')
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const client_id = actor.workspaceId

    // Deflection rate = (Sessions handled completely by AI / Total sessions) * 100
    const { data, error } = await supabase
        .from('sessions')
        .select('mode')
        .eq('client_id', client_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const total = data.length
    if (total === 0) return NextResponse.json({ rate: 0, total: 0, ai_handled: 0 })

    const aiHandled = data.filter(s => s.mode === 'ai').length
    const rate = Math.round((aiHandled / total) * 100)

    return NextResponse.json({ rate, total, ai_handled: aiHandled })
}
