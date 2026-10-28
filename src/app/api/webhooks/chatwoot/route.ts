import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { ChatwootWebhookPayload } from '@/types/chatwoot'

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json() as ChatwootWebhookPayload

    // Verify webhook secret
    const signature = req.headers.get('x-chatwoot-signature')
    const secret = process.env.CHATWOOT_WEBHOOK_SECRET
    if ((!secret && process.env.NODE_ENV === 'production') || (secret && signature !== secret)) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only handle agent-sent outgoing messages
    // Ignore: bot messages, activity logs, system messages
    if (
      payload.event !== 'message_created' ||
      payload.message_type !== 'outgoing' ||
      payload.sender?.type !== 'agent' ||
      !payload.content ||
      !payload.conversation?.id
    ) {
      return Response.json({ status: 'ignored' })
    }

    

    // Find our session by Chatwoot conversation ID
    const { data: session } = await supabase
      .from('sessions')
      .select('id, mode, channel')
      .eq('chatwoot_conversation_id', payload.conversation.id)
      .single()

    if (!session) {
      console.warn('[Chatwoot Webhook] No session for conversation:', payload.conversation.id)
      return Response.json({ status: 'session_not_found' })
    }

    // Save human message to our messages table
    await supabase.from('messages').insert({
      session_id: session.id,
      content: payload.content,
      sender_type: 'human',
      role: 'assistant',
      chatwoot_message_id: payload.id,
    })

    // Update session mode to human (in case it was 'waiting')
    if (session.mode === 'waiting') {
      await supabase
        .from('sessions')
        .update({
          mode: 'human',
          last_human_message_at: new Date().toISOString(),
        })
        .eq('id', session.id)
    }

    // If this is a WhatsApp session — forward human reply to customer via Meta API
    if (session.channel === 'whatsapp') {
      // Get contact phone from session
      const { data: sessionData } = await supabase
        .from('sessions')
        .select('*, contacts(*)')
        .eq('id', session.id)
        .single()

      const customerPhone = sessionData?.contacts?.phone
      const bot = await supabase
        .from('bots')
        .select('whatsapp_phone_number_id')
        .eq('id', sessionData?.bot_id)
        .single()

      if (customerPhone && bot.data?.whatsapp_phone_number_id) {
        await fetch(
          `https://graph.facebook.com/v18.0/${bot.data.whatsapp_phone_number_id}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: customerPhone,
              type: 'text',
              text: { body: payload.content },
            }),
          }
        )
      }
    }

    return Response.json({ status: 'saved' })

  } catch (error) {
    console.error('[Chatwoot Webhook] Error:', error)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}
