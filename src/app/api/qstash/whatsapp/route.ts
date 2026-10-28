import { NextRequest, NextResponse } from 'next/server'
import { verifySignatureAppRouter } from '@upstash/qstash/dist/nextjs'
import { supabase } from '@/lib/supabase'
import {getEffectiveEntitlements,featureAllowed} from '@/lib/saas/entitlements'

async function handler(req: NextRequest) {
    try {
        const body = await req.json()
        const {
            contact_id,
            phone,
            campaign_id,
            message_text,
            template_name,
            // Array of { type: 'text', text: string } for personalised template variables
            template_parameters,
            client_id,
            // Flag set by the abandoned cart cron to trigger abandoned_cart_sent_at stamp
            is_abandoned_cart_recovery,
        } = body
        if(!client_id)return NextResponse.json({error:'Workspace required'},{status:400})
        if(!featureAllowed(await getEffectiveEntitlements(client_id),'campaigns.enabled'))return NextResponse.json({skipped:true,reason:'Workspace campaign access unavailable'})

        // 1. Fetch Contact to check 24-hour rule
        const { data: contact } = await supabase
            .from('contacts')
            .select('last_active_at')
            .eq('id', contact_id)
            .eq('client_id',client_id)
            .single()

        if (!contact) {
            return NextResponse.json({ error: 'Contact not found' }, { status: 400 })
        }

        // 2. Enforce 24-Hour Meta Rule
        const lastActive = new Date(contact.last_active_at).getTime()
        const now = Date.now()
        const isWithin24h = (now - lastActive) < 24 * 60 * 60 * 1000

        // If outside 24h window, Meta ONLY allows pre-approved template messages.
        // If the campaign is trying to send free-form text without a template, block it.
        if (!isWithin24h && !template_name) {
            console.error(`Blocked campaign send for contact ${contact_id}: Outside 24h window without a template.`)
            return NextResponse.json({ error: 'Outside 24h window. Template required.' }, { status: 403 })
        }

        // 3. Fetch Client Channel Config for WhatsApp token
        const { data: channel } = await supabase
            .from('channels')
            .select('config')
            .eq('client_id', client_id)
            .eq('provider', 'whatsapp')
            .single()

        if (!channel?.config?.access_token || !channel?.config?.phone_number_id) {
            return NextResponse.json({ error: 'WhatsApp not configured for client' }, { status: 400 })
        }

        const { access_token, phone_number_id } = channel.config as any

        // 4. Construct WhatsApp Meta API Payload
        let payload: any = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: phone,
        }

        if (template_name) {
            payload.type = 'template'
            payload.template = {
                name: template_name,
                language: { code: 'en_US' }, // TODO: Dynamic based on contact locale
            }

            // Attach personalised components if template_parameters were provided
            // e.g. [{ type: 'text', text: 'John' }, { type: 'text', text: '₹1450' }]
            if (Array.isArray(template_parameters) && template_parameters.length > 0) {
                payload.template.components = [
                    {
                        type: 'body',
                        parameters: template_parameters,
                    },
                ]
            }
        } else {
            payload.type = 'text'
            payload.text = { body: message_text }
        }

        // 5. Send to Meta
        const metaRes = await fetch(`https://graph.facebook.com/v19.0/${phone_number_id}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        })

        const metaData = await metaRes.json()

        if (!metaRes.ok) {
            console.error('Meta API Error:', metaData)
            throw new Error(metaData.error?.message || 'Meta API Error')
        }

        const sentAt = new Date().toISOString()

        // 6. Log success to Campaign Recipients (only when campaign_id present)
        if (campaign_id) {
            await supabase.from('campaign_recipients').insert({
                campaign_id,
                contact_id,
                status: 'sent',
                sent_at: sentAt,
            })
        }

        // 7. Stamp abandoned_cart_sent_at on the contact for the 23-hour cooldown.
        //    Only do this for cron-triggered recovery jobs (not manual campaigns).
        if (is_abandoned_cart_recovery && contact_id) {
            await supabase
                .from('contacts')
                .update({ abandoned_cart_sent_at: sentAt })
                .eq('id', contact_id)
        }

        return NextResponse.json({ success: true, messageId: metaData.messages?.[0]?.id })

    } catch (e: any) {
        console.error('QStash Worker Error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}

// Wrap with QStash Signature Verifier to prevent unauthorized calls
export const POST = verifySignatureAppRouter(handler)
