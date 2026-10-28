import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { Redis } from '@upstash/redis'
import { writeMessage } from '@/lib/chat/writeMessage'
import { sendEmailReply, resolveSmtpCredentials } from '@/lib/email'
import {requireWorkspace} from '@/lib/saas/context'
import {resolveWhatsAppConnection} from '@/lib/whatsappCampaign'
import {sendWhatsAppMessage} from '@/lib/whatsapp'
import {normalizeE164Phone} from '@/lib/phone'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// POST /api/inbox/[sessionId]/reply — Agent sends a message
export async function POST(req: NextRequest, props: { params: Promise<{ sessionId: string }> }) {
    const params = await props.params;
    try {
        const ctx=await requireWorkspace(null,'inbox',true)
        const { sessionId } = params
        if (!sessionId) return NextResponse.json({ error: 'Session ID is required' }, { status: 400 })

        const body = await req.json()
        let { context_id, bot_id, content, agent_id, channel } = body

        if (!content?.trim()) {
            return NextResponse.json({ error: 'Content is required' }, { status: 400 })
        }

        // Resolve session to obtain row id, context_id, contact email, and channel
        const { data: sessionData } = await supabase.from('sessions')
            .select('id, session_id, client_id, bot_id, channel, visitor_name, whatsapp_service_window_until, contacts(name, email, phone), bots(name), clients(context_id)')
            .or(`session_id.eq.${sessionId},id.eq.${sessionId}`)
            .eq('client_id',ctx.workspaceId).maybeSingle()

        if (!sessionData) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 })
        }

        if (!context_id && sessionData.clients) {
            context_id = (sessionData.clients as any).context_id
        }

        if (!context_id) {
            return NextResponse.json({ error: 'context_id could not be resolved' }, { status: 400 })
        }

        const effectiveChannel = channel || sessionData.channel || 'web'
        const effectiveBotId = bot_id || sessionData.bot_id || null
        const effectiveClientId = sessionData.client_id || null
        const resolvedSessionId = sessionData.session_id || sessionData.id

        // Free-form WhatsApp replies are legal only during the explicit 24-hour customer-service window.
        if (effectiveChannel === 'whatsapp' && effectiveClientId && effectiveBotId) {
            const windowEnds = sessionData.whatsapp_service_window_until ? new Date(sessionData.whatsapp_service_window_until).getTime() : 0
            if (!windowEnds || windowEnds <= Date.now()) {
                return NextResponse.json({ error: 'The WhatsApp 24-hour service window has closed. Send an approved template to reopen contact.' }, { status: 409 })
            }
            const connection = await resolveWhatsAppConnection(effectiveClientId, effectiveBotId)
            if (!connection) return NextResponse.json({ error: 'WhatsApp is not connected to this bot.' }, { status: 409 })
            const phone = normalizeE164Phone((sessionData.contacts as any)?.phone || sessionData.visitor_name, connection.defaultCountry)
            if (!phone) return NextResponse.json({ error: 'The customer phone number is invalid.' }, { status: 400 })
            await sendWhatsAppMessage(connection.phoneNumberId, connection.accessToken, phone.slice(1), content.trim())
        }

        // 1. Insert the agent message & update Redis atomic CAS + payload buffer
        const message = await writeMessage({
            sessionId: resolvedSessionId,
            role: 'agent',
            content: content.trim(),
            mode: 'human',
            contextId: context_id,
            botId: effectiveBotId,
            channel: effectiveChannel,
            clientId: effectiveClientId,
            additionalSessionAliases: [sessionData.id, sessionData.session_id, sessionId].filter(Boolean) as string[],
        })

        // 2. Update the session mode to 'human' and last_message_at
        await supabase
            .from('sessions')
            .update({
                mode: 'human',
                last_message_at: message.created_at,
                assigned_agent_id: agent_id || null
            })
            .eq('id', sessionData.id)

        // 3. Deliver via Email if this is an email thread
        if (effectiveChannel === 'email' && effectiveClientId) {
            const recipientEmail = (sessionData?.contacts as any)?.email || sessionData?.visitor_name
            if (recipientEmail && recipientEmail.includes('@')) {
                const smtp = await resolveSmtpCredentials(effectiveClientId, effectiveBotId)
                if (smtp) {
                    await sendEmailReply(smtp, {
                        to: recipientEmail,
                        subject: 'Support Update',
                        body: content.trim(),
                        brandName: (sessionData?.bots as any)?.name || 'Support Team',
                    })
                } else {
                    console.warn('[Inbox Reply] No SMTP credentials found for client:', effectiveClientId)
                }
            }
        }

        return NextResponse.json(message, { status: 201 })
    } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Invalid request' }, { status: 400 })
    }
}
