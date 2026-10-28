import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createTicket } from '@/lib/ticketing'
import { requireWorkspace } from '@/lib/saas/context'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.session_id) return NextResponse.json({ error: 'session_id is required' }, { status: 400 })
    const ctx=await requireWorkspace(null,'tickets',true)
    const { data: session } = await supabase.from('sessions').select('*, contacts(*)').eq('session_id', body.session_id).eq('client_id',ctx.workspaceId).single()
    if (!session) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    const result = await createTicket({ ...body, client_id: session.client_id, bot_id: session.bot_id,
      contact_id: session.contact_id, session_id: session.id, source: 'conversation',
      subject: body.subject || 'Conversation escalated to support' }, { id: ctx.user.id, type: 'agent' })
    await supabase.from('messages').update({ ticket_id: result.ticket.id }).eq('session_id', body.session_id)
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Invalid request' }, { status: 400 })
  }
}
