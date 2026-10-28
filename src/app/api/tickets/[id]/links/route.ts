import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { signTicketToken } from '@/lib/ticketTokens'
import { getAuthenticatedWorkspaceResource } from '@/lib/requestAuth'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const actor = await getAuthenticatedWorkspaceResource(req, 'tickets', params.id, 'tickets', true)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: ticket } = await supabase.from('tickets').select('id, status').eq('id', params.id).eq('client_id', actor.workspaceId).single()
  if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
  const body = await req.json().catch(() => ({}))
  const purpose = body.purpose === 'csat' ? 'csat' : 'status'
  if (purpose === 'csat' && !['resolved', 'solved', 'closed'].includes(ticket.status)) {
    return NextResponse.json({ error: 'CSAT links are available after resolution' }, { status: 409 })
  }
  const ttl = purpose === 'csat' ? 30 * 86_400_000 : 7 * 86_400_000
  const token = signTicketToken({ ticketId: ticket.id, purpose, exp: Date.now() + ttl })
  const origin = req.nextUrl.origin
  return NextResponse.json({ purpose, token, expires_at: new Date(Date.now() + ttl).toISOString(),
    endpoint: purpose === 'csat' ? `${origin}/ticket-feedback?token=${encodeURIComponent(token)}` : `${origin}/ticket-status?token=${encodeURIComponent(token)}` })
}
