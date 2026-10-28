import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendMessage as chatwootSendMessage } from '@/lib/chatwoot'
import { verifySha256Signature } from '@/lib/webhookSecurity'
import { upsertCustomerContact } from '@/lib/customerContacts'
import { issueWidgetSessionToken } from '@/lib/security/widgetSessionToken'
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text()
    if (!verifySha256Signature(rawBody, req.headers.get('x-hub-signature-256'), process.env.META_APP_SECRET)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = JSON.parse(rawBody)

    // Meta sends a nested payload structure
    const entry = body?.entry?.[0]
    const change = entry?.changes?.[0]
    const value = change?.value

    // Ignore status updates (delivered, read receipts) — only handle messages
    if (!value?.messages || value.messages.length === 0) {
      return Response.json({ status: 'ignored' })
    }

    const message = value.messages[0]
    const from = message.from                // customer's WhatsApp number
    const messageText = message.text?.body   // message content
    const phoneNumberId = value.metadata?.phone_number_id

    if (!messageText || !from) {
      return Response.json({ status: 'ignored' })
    }

    

    // 1. Find the bot linked to this WhatsApp number
    const { data: bot } = await supabase
      .from('bots')
      .select('id, client_id, chatwoot_inbox_id, whatsapp_phone_number_id')
      .eq('whatsapp_phone_number_id', phoneNumberId)
      .single()

    if (!bot) {
      console.error('[WhatsApp] No bot found for phone_number_id:', phoneNumberId)
      return Response.json({ status: 'no_bot_found' })
    }

    // 2. Resolve the customer in the same contact store used by web flows.
    const profileName = value.contacts?.[0]?.profile?.name || `WhatsApp ${from.slice(-4)}`
    const contact = await upsertCustomerContact({clientId:bot.client_id,botId:bot.id,name:profileName,phone:from,channel:'whatsapp',source:'whatsapp'})
    if (!contact?.id) {
      console.error('[WhatsApp] Could not resolve customer contact:', from)
      return Response.json({ status: 'contact_error' }, { status: 503 })
    }

    // 3. Find active session for this contact
    const { data: session } = await supabase
      .from('sessions')
      .select('*')
      .eq('bot_id', bot.id)
      .eq('contact_id', contact.id)
      .in('mode', ['ai', 'waiting', 'human'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    // 4. Route based on session mode
    if (session?.mode === 'human' && session?.chatwoot_conversation_id) {
      // Active human handoff — forward message to Chatwoot agent
      await chatwootSendMessage(
        session.chatwoot_conversation_id,
        messageText,
        'incoming'
      )

      // Save to our messages table too
      await supabase.from('messages').insert({
        session_id: session.id,
        content: messageText,
        sender_type: 'visitor',
        role: 'user',
      })

      return Response.json({ status: 'forwarded_to_human' })
    }

    // 5. AI handles the conversation
    // Create new session if none exists
    const whatsappSessionKey = `wa_${bot.id}_${from}`
    let activeSessionId = session?.session_id || session?.id
    if (!session) {
      const { data: newSession } = await supabase
        .from('sessions')
        .insert({
          bot_id: bot.id,
          client_id: bot.client_id,
          contact_id: contact.id,
          session_id: whatsappSessionKey,
          mode: 'ai',
          channel: 'whatsapp',
        })
        .select()
        .single()
      activeSessionId = newSession?.session_id || newSession?.id || whatsappSessionKey
    }

    // 6. Call your existing AI chat endpoint internally
    const chatCapability = issueWidgetSessionToken({ workspaceId: bot.client_id, botId: bot.id, sessionId: activeSessionId })
    const aiResponse = await fetch(
      `${req.nextUrl.origin}/api/chat?bot=${encodeURIComponent(bot.id)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Widget-Session-Token': chatCapability.token },
        body: JSON.stringify({
          question: messageText,
          session_id: activeSessionId,
          bot_id: bot.id,
          channel: 'whatsapp',
        }),
      }
    )

    const aiData = await aiResponse.json()

    // 7. Send AI reply back via Meta WhatsApp API
    await fetch(
      `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: from,
          type: 'text',
          text: { body: aiData.answer || aiData.error || 'Sorry, I could not process that request.' },
        }),
      }
    )

    return Response.json({ status: 'ai_handled' })

  } catch (error) {
    console.error('[WhatsApp Incoming] Error:', error)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}
