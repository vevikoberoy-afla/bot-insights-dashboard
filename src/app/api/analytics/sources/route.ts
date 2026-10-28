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
        .from('chunks').select('source_url')
        .eq('context_id', client.context_id).eq('active', true).limit(5000)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const counts = new Map<string, number>()
    for (const row of data || []) {
        const source = row.source_url || 'Manual knowledge'
        counts.set(source, (counts.get(source) || 0) + 1)
    }
    const total = Math.max(data?.length || 0, 1)
    return NextResponse.json(Array.from(counts.entries())
        .map(([source, retrievals]) => ({ source, retrievals, percentage: Math.round(retrievals / total * 100) }))
        .sort((a, b) => b.retrievals - a.retrievals))
}
