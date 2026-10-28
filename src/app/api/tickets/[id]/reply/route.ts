import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireWorkspace } from '@/lib/saas/context'
import { recordTicketEvent } from '@/lib/ticketing'
import { resolveSmtpCredentials, sendEmailReply } from '@/lib/email'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { writeMessage } from '@/lib/chat/writeMessage'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const ctx=await requireWorkspace(null,'tickets',true)
    const body = await req.json()
    const content = String(body.content || '').trim()
    if (!content) return NextResponse.json({ error: 'Content is required' }, { status: 400 })
    const { data: ticket } = await supabase.from('tickets').select('*, contacts(email, phone), bots(name)').eq('id', params.id).eq('client_id',ctx.workspaceId).single()
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    if (body.is_internal_note) {
      const { data, error } = await supabase.from('ticket_notes').insert({
        ticket_id: params.id, client_id: ticket.client_id, author_id: ctx.user.id, body: content,
      }).select().single()
      if (error) throw error
      await recordTicketEvent({ ticketId: params.id, clientId: ticket.client_id, actorId: ctx.user.id,
        actorType: 'agent', eventType: 'note_added' })
      return NextResponse.json(data, { status: 201 })
    }
    const { data, error } = await supabase.from('ticket_messages').insert({
      ticket_id: params.id, sender_id: ctx.user.id, sender_type: 'agent', content, is_internal_note: false,
    }).select().single()
    if (error) throw error
    const now = new Date().toISOString()
    await supabase.from('tickets').update({ updated_at: now, first_response_at: ticket.first_response_at || now }).eq('id', params.id)
    let deliveryStatus = 'recorded'
    let session: any = null
    if (ticket.session_id) {
      session = (await supabase.from('sessions').select('id, session_id, channel, client_id, bot_id, visitor_name, clients(context_id)').eq('id', ticket.session_id).maybeSingle()).data
    }
    const channel = body.channel || session?.channel || ticket.source || 'web'
    if (channel === 'email') {
      const recipient = (ticket.contacts as any)?.email || ticket.customer_email
      const smtp = await resolveSmtpCredentials(ticket.client_id, ticket.bot_id)
      if (recipient && smtp) {
        await sendEmailReply(smtp, { to: recipient, subject: `Re: ${ticket.subject}`,
          body: content, brandName: (ticket.bots as any)?.name || 'Support Team' })
        deliveryStatus = 'sent'
      } else deliveryStatus = 'channel_not_configured'
    } else if (channel === 'whatsapp') {
      const recipient = (ticket.contacts as any)?.phone || session?.visitor_name
      const cfg = ticket.bot_id ? (await supabase.from('bot_channels').select('credentials, identifier')
        .eq('bot_id', ticket.bot_id).eq('channel_type', 'whatsapp').maybeSingle()).data : null
      if (recipient && cfg?.credentials?.access_token && cfg.identifier) {
        const result = await sendWhatsAppMessage(cfg.identifier, cfg.credentials.access_token, recipient, content)
        deliveryStatus = result.success ? 'sent' : 'failed'
      } else deliveryStatus = 'channel_not_configured'
    } else if (session?.session_id) {
      await writeMessage({ sessionId: session.session_id, role: 'agent', content, mode: 'human',
        contextId: (session.clients as any)?.context_id || ticket.client_id, botId: ticket.bot_id,
        channel: session.channel || 'web', clientId: ticket.client_id, additionalSessionAliases: [session.id] })
      await supabase.from('sessions').update({ mode: 'human', assigned_agent_id: ctx.user.id, last_message_at: now }).eq('id', session.id).eq('client_id',ctx.workspaceId)
      deliveryStatus = 'sent'
    }
    await recordTicketEvent({ ticketId: params.id, clientId: ticket.client_id, actorId: ctx.user.id,
      actorType: 'agent', eventType: 'reply_sent', metadata: { channel, delivery_status: deliveryStatus } })
    return NextResponse.json({ ...data, delivery_status: deliveryStatus }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Invalid request' }, { status: 400 })
  }
}
