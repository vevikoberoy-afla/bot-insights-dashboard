import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function GET(req: NextRequest) {
    const actor = await getAuthenticatedWorkspaceUser(req, 'analytics')
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const client_id = actor.workspaceId

    // Assuming we extracted visitor_language in some metadata
    const { data, error } = await supabase
        .from('messages')
        .select('content')
        .eq('client_id', client_id)
        .eq('sender', 'user')
        .limit(100)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // For boilerplate, we'll mock the distribution
    const total = data.length
    if (total === 0) return NextResponse.json([])

    return NextResponse.json([
        { language: 'English', percentage: 70 },
        { language: 'Spanish', percentage: 15 },
        { language: 'French', percentage: 10 },
        { language: 'Other', percentage: 5 }
    ])
}
