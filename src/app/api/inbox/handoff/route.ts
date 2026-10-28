import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

// POST /api/inbox/handoff — Triggered by user from widget or system fallback
export async function POST(req: NextRequest) {
    try {
        const actor = await getAuthenticatedWorkspaceUser(req, 'inbox', true)
        if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const body = await req.json()
        const { session_id, reason } = body
        const client_id = actor.workspaceId

        if (!session_id) {
            return NextResponse.json({ error: 'session_id is required' }, { status: 400 })
        }

        // 1. Ensure the session exists
        const { data: ownedSession } = await supabase.from('sessions').select('session_id').eq('session_id', session_id).eq('client_id', client_id).maybeSingle()
        if (!ownedSession) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
        const { error: sessionError } = await supabase
            .from('sessions')
            .update({
                mode: 'waiting' // Change mode to waiting for human
            })
            .eq('session_id', session_id)
            .eq('client_id', client_id)

        if (sessionError) return NextResponse.json({ error: sessionError.message }, { status: 500 })

        // 2. Create a handoff request
        const { data: request, error: requestError } = await supabase
            .from('handoff_requests')
            .insert({
                session_id,
                client_id,
                reason: reason || 'User requested human assistance'
            })
            .select()
            .single()

        if (requestError) return NextResponse.json({ error: requestError.message }, { status: 500 })

        return NextResponse.json(request, { status: 201 })
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
}
