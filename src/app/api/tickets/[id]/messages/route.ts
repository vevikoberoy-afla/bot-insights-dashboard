import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireWorkspace } from '@/lib/saas/context'
import { recordTicketEvent } from '@/lib/ticketing'

// GET /api/tickets/[id]/messages — Get all messages for a ticket
// POST /api/tickets/[id]/messages — Add a message (reply or internal note)

export async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const ctx=await requireWorkspace(null,'tickets')
    const params = await props.params;
    const { id } = params
    if (!id) return NextResponse.json({ error: 'Ticket ID is required' }, { status: 400 })

    const ticket=(await supabase.from('tickets').select('id').eq('id',id).eq('client_id',ctx.workspaceId).maybeSingle()).data
    if(!ticket)return NextResponse.json({error:'Ticket not found'},{status:404})
    const { data, error } = await supabase
        .from('ticket_messages')
        .select('*')
        .eq('ticket_id', id)
        .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        const ctx=await requireWorkspace(null,'tickets',true)
        const { id } = params
        if (!id) return NextResponse.json({ error: 'Ticket ID is required' }, { status: 400 })

        const body = await req.json()
        const { content, is_internal_note } = body

        if (!content?.trim()) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 })
        }

        const { data: ticket } = await supabase.from('tickets').select('client_id, first_response_at').eq('id', id).eq('client_id',ctx.workspaceId).single()
        if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

        if (is_internal_note) {
            const { data, error } = await supabase.from('ticket_notes').insert({
                ticket_id: id, client_id: ticket.client_id, author_id: ctx.user.id, body: content.trim()
            }).select().single()
            if (error) return NextResponse.json({ error: error.message }, { status: 500 })
            await recordTicketEvent({ ticketId: id, clientId: ticket.client_id, actorId: ctx.user.id,
                actorType: 'agent', eventType: 'note_added' })
            return NextResponse.json(data, { status: 201 })
        }

        const { data, error } = await supabase
            .from('ticket_messages')
            .insert({
                ticket_id: id,
                sender_id: ctx.user.id,
                sender_type: 'agent',
                content: content.trim(),
                is_internal_note: false
            })
            .select()
            .single()

        if (error) return NextResponse.json({ error: error.message }, { status: 500 })

        // Update ticket updated_at
        await supabase
            .from('tickets')
            .update({ updated_at: new Date().toISOString(), first_response_at: ticket.first_response_at || new Date().toISOString() })
            .eq('id', id)

        await recordTicketEvent({ ticketId: id, clientId: ticket.client_id, actorId: ctx.user.id,
            actorType: 'agent', eventType: 'reply_sent' })

        return NextResponse.json(data, { status: 201 })
    } catch {
        return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
}
