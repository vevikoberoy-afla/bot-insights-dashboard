import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verifyTicketToken } from '@/lib/ticketTokens'

export async function GET(req: NextRequest) {
  const payload = verifyTicketToken(req.nextUrl.searchParams.get('token') || '', 'status')
  if (!payload) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 401 })
  const { data } = await supabase.from('tickets').select('ticket_number, subject, status, sub_status, updated_at, resolved_at').eq('id', payload.ticketId).single()
  if (!data) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  return NextResponse.json(data)
}

