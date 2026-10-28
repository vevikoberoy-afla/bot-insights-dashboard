import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function GET(req: NextRequest) {
    const actor=await getAuthenticatedWorkspaceUser(req,'analytics')
    if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
    const client_id = actor.workspaceId

    const { data, error } = await supabase
        .from('client_daily_stats')
        .select('*')
        .eq('client_id', client_id)
        .order('metric_date', { ascending: false })
        .limit(30)

    if (error) {
        // Fallback to raw messages if view hasn't been refreshed or doesn't exist yet
        console.error('View error, falling back to raw tables', error)
        
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

        const { data: rawData, error: rawError } = await supabase
            .from('messages')
            .select('id, created_at, content, source_url, role, session_id')
            .eq('client_id', client_id)
            .gte('created_at', thirtyDaysAgo.toISOString())

        if (rawError) return NextResponse.json({ error: rawError.message }, { status: 500 })

        // Process raw data on the fly as a fallback
        const stats: Record<string, any> = {}
        rawData.forEach(m => {
            const date = m.created_at.split('T')[0]
            if (!stats[date]) {
                stats[date] = { metric_date: date, total_messages: 0, total_handoffs: 0, total_fallbacks: 0, sessions: new Set() }
            }
            stats[date].total_messages++
            stats[date].sessions.add(m.session_id)
            if (m.content === '[HANDOFF]') stats[date].total_handoffs++
            if (m.role === 'assistant' && !m.source_url && m.content !== '[HANDOFF]') stats[date].total_fallbacks++
        })

        const fallbackResult = Object.values(stats).map(s => ({
            ...s,
            unique_sessions: s.sessions.size,
            sessions: undefined
        })).sort((a: any, b: any) => new Date(b.metric_date).getTime() - new Date(a.metric_date).getTime())

        return NextResponse.json(fallbackResult)
    }

    return NextResponse.json(data || [])
}
