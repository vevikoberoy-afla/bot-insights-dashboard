import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { qstash } from '@/lib/qstash'
import { getAuthenticatedWorkspaceResource } from '@/lib/requestAuth'

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const { id } = params
    if (!id) return NextResponse.json({ error: 'Campaign ID is required' }, { status: 400 })
    const actor = await getAuthenticatedWorkspaceResource(req, 'campaigns', id, 'campaigns', true)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        // 1. Fetch Campaign
        const { data: campaign, error } = await supabase
            .from('campaigns')
            .select('*, campaign_messages(*)')
            .eq('id', id)
            .eq('client_id', actor.workspaceId)
            .single()

        if (error || !campaign) throw new Error('Campaign not found')
        if (campaign.status === 'sent') return NextResponse.json({ error: 'Already sent' }, { status: 400 })

        const message = campaign.campaign_messages?.[0]
        if (!message) return NextResponse.json({ error: 'No message configured for this campaign' }, { status: 400 })

        // 2. Fetch contacts in segment
        const { data: members } = await supabase
            .from('contact_segment_members')
            .select('contact_id, contacts(id, client_id, phone, email, opt_in_whatsapp, opt_in_email)')
            .eq('segment_id', campaign.segment_id)

        if (!members || members.length === 0) {
            return NextResponse.json({ error: 'No contacts in this segment' }, { status: 400 })
        }

        const validContacts = members.map(m => m.contacts as any).filter(contact => contact?.client_id === actor.workspaceId)

        // 3. Route by channel via Native QStash Queue
        const channel = campaign.channel || 'email'
        let queued = 0
        const origin = (process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin).replace(/\/$/,'')

        if (channel === 'whatsapp') {
            const whatsappContacts = validContacts.filter(c => c.phone && c.opt_in_whatsapp)
            if (whatsappContacts.length === 0) {
                return NextResponse.json({ error: 'No opted-in WhatsApp contacts found' }, { status: 400 })
            }
            const webhookUrl = `${origin}/api/qstash/whatsapp`
            await qstash.batchJSON(whatsappContacts.map((contact: any) => ({
                url: webhookUrl,
                body: {
                    contact_id: contact.id,
                    phone: contact.phone,
                    campaign_id: campaign.id,
                    message_text: message.body_text,
                    template_name: message.template_name,
                    client_id: campaign.client_id
                },
                headers: { 'Content-Type': 'application/json', ...(process.env.EMAIL_WEBHOOK_SECRET ? {'x-webhook-secret':process.env.EMAIL_WEBHOOK_SECRET} : {}) }
            })))
            queued = whatsappContacts.length
        } else if (channel === 'email') {
            const emailContacts = validContacts.filter(c => c.email && c.opt_in_email)
            if (emailContacts.length === 0) {
                return NextResponse.json({ error: 'No valid email contacts found' }, { status: 400 })
            }
            const webhookUrl = `${origin}/api/qstash/email`
            await qstash.batchJSON(emailContacts.map((contact: any) => ({
                url: webhookUrl,
                body: {
                    contact_id: contact.id,
                    email: contact.email,
                    campaign_id: campaign.id,
                    message_text: message.body_text,
                    subject: message.subject || campaign.name,
                    client_id: campaign.client_id
                },
                flowControl: { key: 'marketing-email', parallelism: 15, rate: Number(process.env.EMAIL_OUTBOUND_RATE || 100), period: '1s' },
                headers: { 'Content-Type': 'application/json', ...(process.env.EMAIL_WEBHOOK_SECRET ? {'x-webhook-secret':process.env.EMAIL_WEBHOOK_SECRET} : {}) }
            })))
            queued = emailContacts.length
        } else {
             return NextResponse.json({ error: `Channel ${channel} not supported natively yet` }, { status: 400 })
        }

        // 4. Mark as sent
        await supabase.from('campaigns').update({
            status: 'sent',
            recipients_count: queued,
            updated_at: new Date().toISOString()
        }).eq('id', id)
          .eq('client_id', actor.workspaceId)

        return NextResponse.json({ success: true, channel, queued })

    } catch (e: any) {
        console.error('[POST /api/campaigns/:id/send]', e.message)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
