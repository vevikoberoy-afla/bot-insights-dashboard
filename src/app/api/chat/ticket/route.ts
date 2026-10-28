import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getCorsHeaders, handleOptions } from '@/lib/cors'

export async function OPTIONS(req: NextRequest) {
  const cors = await getCorsHeaders(req.nextUrl.searchParams.get('ctx') || '', req.headers.get('origin'), req.nextUrl.searchParams.get('bot'))
  return handleOptions(cors)
}

// Public widget-safe status lookup. A ticket UUID alone is insufficient: it
// must belong to the same opaque browser chat session that created it.
export async function GET(req: NextRequest) {
  const cors = await getCorsHeaders(req.nextUrl.searchParams.get('ctx') || '', req.headers.get('origin'), req.nextUrl.searchParams.get('bot'))
  const id = req.nextUrl.searchParams.get('id')?.trim()
  const sessionId = req.nextUrl.searchParams.get('session_id')?.trim()
  if (!id || !sessionId) return NextResponse.json({ error: 'id and session_id are required' }, { status: 400, headers: cors })
  const { data: ticket } = await supabase.from('tickets').select('id,ticket_number,status,sub_status,type,order_number,updated_at,session_id').eq('id', id).maybeSingle()
  if (!ticket?.session_id) return NextResponse.json({ error: 'Ticket not found' }, { status: 404, headers: cors })
  const { data: session } = await supabase.from('sessions').select('session_id').eq('id', ticket.session_id).maybeSingle()
  if (session?.session_id !== sessionId) return NextResponse.json({ error: 'Ticket not found' }, { status: 404, headers: cors })
  return NextResponse.json({ ticketId: ticket.id, ticketNumber: ticket.ticket_number, status: ticket.status, subStatus: ticket.sub_status,
    type: ticket.type, orderNumber: ticket.order_number, updatedAt: ticket.updated_at,
    nextStep: ['resolved', 'solved', 'closed'].includes(ticket.status) ? 'This request has been resolved.' : 'Our support team is reviewing your request.' }, { headers: cors })
}
