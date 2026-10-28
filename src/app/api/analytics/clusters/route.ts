import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function GET(req: NextRequest) {
    const actor = await getAuthenticatedWorkspaceUser(req, 'analytics')
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const client_id = actor.workspaceId

    try {
        // AI Statistical Clustering Engine
        
        // 1. Fetch all contacts for this client who have made at least one purchase (Sales Orders)
        const { data: buyersData, error: buyersError } = await supabase
            .from('sales_orders')
            .select('contact_id, total_amount')
            .eq('client_id', client_id)
            .not('contact_id', 'is', null)

        if (buyersError) throw buyersError

        const buyerStats: Record<string, { count: number, totalSpend: number }> = {}
        for (const order of buyersData) {
            const cid = order.contact_id as string
            if (!buyerStats[cid]) buyerStats[cid] = { count: 0, totalSpend: 0 }
            buyerStats[cid].count += 1
            buyerStats[cid].totalSpend += Number(order.total_amount)
        }

        const highValueBuyers = Object.entries(buyerStats)
            .filter(([_, stats]) => stats.totalSpend > 500 || stats.count >= 2)
            .map(([id]) => id)

        // 2. Fetch contacts who frequently click campaigns but haven't purchased recently
        const { data: clickedData, error: clickedError } = await supabase
            .from('campaign_recipients')
            .select('contact_id')
            .eq('status', 'clicked')
            .in('contact_id', (
                await supabase.from('contacts').select('id').eq('client_id', client_id)
            ).data?.map(c => c.id) || [])

        if (clickedError) throw clickedError

        const clickStats: Record<string, number> = {}
        for (const click of clickedData) {
            const cid = click.contact_id as string
            clickStats[cid] = (clickStats[cid] || 0) + 1
        }

        const highlyEngagedNonBuyers = Object.entries(clickStats)
            .filter(([id, count]) => count >= 2 && !buyerStats[id])
            .map(([id]) => id)

        // Generate dynamic cluster suggestions
        const suggestions: any[] = []

        if (highValueBuyers.length > 0) {
            suggestions.push({
                id: 'cluster_vip_buyers',
                name: 'VIP Buyers (High LTV)',
                description: 'Customers who have spent >$500 or made multiple purchases. Prime for high-ticket upsells.',
                contact_count: highValueBuyers.length,
                potential_revenue: highValueBuyers.length * 100, // Estimated value
                contacts: highValueBuyers
            })
        }

        if (highlyEngagedNonBuyers.length > 0) {
            suggestions.push({
                id: 'cluster_warm_leads',
                name: 'Warm Leads (High Engagement)',
                description: 'Contacts who frequently click campaign links but haven\'t purchased yet. Send a targeted discount.',
                contact_count: highlyEngagedNonBuyers.length,
                potential_revenue: highlyEngagedNonBuyers.length * 50,
                contacts: highlyEngagedNonBuyers
            })
        }

        return NextResponse.json(suggestions)

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// POST to save a suggested cluster as a permanent contact segment
export async function POST(req: NextRequest) {
    try {
        const actor = await getAuthenticatedWorkspaceUser(req, 'analytics', true)
        if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const { name, rules, contact_ids } = await req.json()
        const client_id = actor.workspaceId

        const requestedContacts = Array.isArray(contact_ids) ? contact_ids.filter((id): id is string => typeof id === 'string') : []
        const { data: ownedContacts } = requestedContacts.length
            ? await supabase.from('contacts').select('id').eq('client_id', client_id).in('id', requestedContacts)
            : { data: [] as Array<{ id: string }> }
        if ((ownedContacts || []).length !== requestedContacts.length) {
            return NextResponse.json({ error: 'One or more contacts are outside this workspace' }, { status: 403 })
        }
        
        // 1. Create the segment
        const { data: segment, error: segError } = await supabase
            .from('contact_segments')
            .insert({
                client_id,
                name,
                rules: rules || { source: 'ai_cluster' }
            })
            .select()
            .single()

        if (segError) throw segError

        // 2. Add members
        if (requestedContacts.length > 0) {
            const members = requestedContacts.map((cid: string) => ({
                contact_id: cid,
                segment_id: segment.id
            }))
            const { error: memError } = await supabase.from('contact_segment_members').insert(members)
            if (memError) throw memError
        }

        return NextResponse.json(segment)
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
