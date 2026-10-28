import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function GET(req: NextRequest) {
    const actor=await getAuthenticatedWorkspaceUser(req,'orders')
    if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
    const campaign_id = req.nextUrl.searchParams.get('campaign_id')
    if (!campaign_id) return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 })

    const { data, error } = await supabase
        .from('sales_orders')
        .select(`
            *,
            contacts(name, email, phone)
        `)
        .eq('campaign_id', campaign_id)
        .eq('client_id',actor.workspaceId)
        .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
    const actor=await getAuthenticatedWorkspaceUser(req,'orders',true)
    if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
    try {
        const body = await req.json()
        const client_id=actor.workspaceId
        const { campaign_id, contact_id, total_amount, status, items } = body

        if (!client_id || total_amount === undefined) {
            return NextResponse.json({ error: 'client_id and total_amount are required' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('sales_orders')
            .insert({
                client_id,
                campaign_id: campaign_id || null,
                contact_id: contact_id || null,
                total_amount: parseFloat(total_amount),
                status: status || 'completed',
                items: items || []
            })
            .select()
            .single()

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json(data, { status: 201 })
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
}

export async function PUT(req: NextRequest) {
    const actor=await getAuthenticatedWorkspaceUser(req,'orders',true)
    if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
    try {
        const body = await req.json()
        const { id, status } = body

        if (!id || !status) {
            return NextResponse.json({ error: 'id and status are required' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('sales_orders')
            .update({ status })
            .eq('id', id)
            .eq('client_id',actor.workspaceId)
            .select()
            .single()

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json(data)
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
}
