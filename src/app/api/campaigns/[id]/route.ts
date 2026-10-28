import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceResource } from '@/lib/requestAuth'

// GET /api/campaigns/[id] — Get campaign details, content, and recipient stats
export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const { id } = params
    if (!id) return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 })
    const actor = await getAuthenticatedWorkspaceResource(req, 'campaigns', id, 'campaigns')
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase
        .from('campaigns')
        .select(`
            *,
            campaign_messages(*),
            campaign_recipients(count),
            contact_segments(name)
        `)
        .eq('id', id)
        .eq('client_id', actor.workspaceId)
        .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
        ...data,
        recipient_count: data.campaign_recipients?.[0]?.count || 0,
        campaign_recipients: undefined
    })
}
