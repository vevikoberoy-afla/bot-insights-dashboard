import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyTicketToken } from '@/lib/ticketTokens'
import { getCorsHeaders, handleOptions } from '@/lib/cors'

export async function OPTIONS(req: NextRequest) {
  const cors = await getCorsHeaders(req.nextUrl.searchParams.get('ctx') || '', req.headers.get('origin'), req.nextUrl.searchParams.get('bot'))
  return handleOptions(cors)
}

export async function POST(req: NextRequest) {
  const cors = await getCorsHeaders(req.nextUrl.searchParams.get('ctx') || '', req.headers.get('origin'), req.nextUrl.searchParams.get('bot'))
  try {
    const body = await req.json()
    let ticketId: string | null = null
    let widgetSessionAuthorized = false
    const payload = body.token ? verifyTicketToken(String(body.token), 'csat') : null
    if (payload) ticketId = payload.ticketId
    if (!ticketId && body.ticketId && body.sessionId) {
      const { data: candidate } = await supabase.from('tickets').select('id,session_id').eq('id', body.ticketId).maybeSingle()
      const { data: session } = candidate?.session_id ? await supabase.from('sessions').select('session_id').eq('id', candidate.session_id).maybeSingle() : { data: null }
      if (session?.session_id === body.sessionId) { ticketId = candidate!.id; widgetSessionAuthorized = true }
    }
    if (!ticketId) return NextResponse.json({ error: 'Invalid or expired survey' }, { status: 401, headers: cors })
    const rating = Number(body.rating ?? body.score)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return NextResponse.json({ error: 'Rating must be from 1 to 5' }, { status: 400, headers: cors })
    const { data: ticket } = await supabase.from('tickets').select('client_id, status').eq('id', ticketId).single()
    if (!ticket || (!widgetSessionAuthorized && !['resolved', 'solved', 'closed'].includes(ticket.status))) return NextResponse.json({ error: 'Ticket is not eligible for a survey' }, { status: 409, headers: cors })
    const { data, error } = await supabase.from('csat_responses').upsert({ ticket_id: ticketId,
      client_id: ticket.client_id, rating, comment: String(body.comment || '').trim().slice(0, 2000) || null,
      channel: body.channel || 'web', submitted_at: new Date().toISOString() }, { onConflict: 'ticket_id' }).select().single()
    if (error) throw error
    return NextResponse.json({ success: true, response: data }, { headers: cors })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Invalid request' }, { status: 400, headers: cors })
  }
}
