import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import {requireWorkspace,saasError} from '@/lib/saas/context'

// GET /api/campaigns?client_id=xxx
// POST /api/campaigns — Create a new campaign
export async function GET(req: NextRequest) {
  try {
    const ctx=await requireWorkspace(req.nextUrl.searchParams.get('client_id'),'campaigns')
    const client_id = ctx.workspaceId

    const { data, error } = await supabase
        .from('campaigns')
        .select('id,name,channel,status,scheduled_at,stats,created_at,updated_at,recipients_count,sent_count,delivered_count,open_count,click_count')
        .eq('client_id', client_id)
        .order('created_at', { ascending: false })
        .limit(250)

    if (error) throw error
    return NextResponse.json(data || [])
  }catch(error){return saasError(error)}
}

export async function POST(req: NextRequest) {
    try {
        const ctx=await requireWorkspace(null,'campaigns',true)
        const body = await req.json()
        const { name, channel, segment_id, scheduled_at, target_revenue, start_date, finish_date, sales_team_assignment } = body

        if (!name?.trim() || !channel) {
            return NextResponse.json({ error: 'name and channel are required' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('campaigns')
            .insert({
                client_id:ctx.workspaceId,
                name: name.trim(),
                channel,
                segment_id: segment_id || null,
                status: scheduled_at ? 'scheduled' : 'draft',
                scheduled_at: scheduled_at || null,
                target_revenue: target_revenue || 0,
                start_date: start_date || null,
                finish_date: finish_date || null,
                sales_team_assignment: sales_team_assignment || null
            })
            .select()
            .single()

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json(data, { status: 201 })
    } catch(error) {
        return saasError(error)
    }
}

export async function PUT(req: NextRequest) {
    try {
        const ctx=await requireWorkspace(null,'campaigns',true)
        const body = await req.json()
        const { id, target_revenue, start_date, finish_date, sales_team_assignment } = body

        if (!id) {
            return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 })
        }

        const updateData: any = {}
        if (target_revenue !== undefined) updateData.target_revenue = target_revenue
        if (start_date !== undefined) updateData.start_date = start_date
        if (finish_date !== undefined) updateData.finish_date = finish_date
        if (sales_team_assignment !== undefined) updateData.sales_team_assignment = sales_team_assignment

        const { data, error } = await supabase
            .from('campaigns')
            .update(updateData)
            .eq('id', id)
            .eq('client_id',ctx.workspaceId)
            .select()
            .single()

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        return NextResponse.json(data)
    } catch(error) {
        return saasError(error)
    }
}
