import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function GET(req: NextRequest) {
    const actor = await getAuthenticatedWorkspaceUser(req, 'analytics')
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const client_id = actor.workspaceId

    const { data: client } = await supabase.from('clients').select('context_id').eq('id', client_id).maybeSingle()
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    const { data, error } = await supabase
        .from('messages')
        .select('id, content, created_at')
        .eq('context_id', client.context_id)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
        .limit(100)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const grouped = new Map<string, { question: string; frequency: number; last_asked: string }>()
    for (const message of data || []) {
        const key = message.content.trim().toLowerCase()
        const existing = grouped.get(key)
        if (existing) existing.frequency += 1
        else grouped.set(key, { question: message.content, frequency: 1, last_asked: message.created_at })
    }
    const gaps = Array.from(grouped.values()).sort((a, b) => b.frequency - a.frequency).slice(0, 10)

    return NextResponse.json(gaps)
}
