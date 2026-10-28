import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function GET(req: NextRequest) {
    const actor=await getAuthenticatedWorkspaceUser(req,'campaigns')
    if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
    const campaign_id = req.nextUrl.searchParams.get('campaign_id')
    if (!campaign_id) return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 })

    const { data, error } = await supabase
        .from('campaign_expenses')
        .select('*')
        .eq('campaign_id', campaign_id)
        .eq('client_id',actor.workspaceId)
        .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
}

export async function POST(req: NextRequest) {
    const actor=await getAuthenticatedWorkspaceUser(req,'campaigns',true)
    if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
    try {
        const body = await req.json()
        const client_id=actor.workspaceId
        const { campaign_id, amount, status, description, expense_date } = body

        if (!client_id || !campaign_id || amount === undefined) {
            return NextResponse.json({ error: 'client_id, campaign_id, and amount are required' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('campaign_expenses')
            .insert({
                client_id,
                campaign_id,
                amount: parseFloat(amount),
                status: status || 'pending',
                description: description || null,
                expense_date: expense_date || new Date().toISOString()
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
    const actor=await getAuthenticatedWorkspaceUser(req,'campaigns',true)
    if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
    try {
        const body = await req.json()
        const { id, status } = body

        if (!id || !status) {
            return NextResponse.json({ error: 'id and status are required' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('campaign_expenses')
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
