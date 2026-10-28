import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import { safeOutboundFetch } from '@/lib/urlSecurity'
import { decryptTenantSecret } from '@/lib/security/secretVault'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function fireWebhook(contextId: string, eventName: string, payload: any) {
  try {
    const { data: client } = await supabase.from('clients').select('id').eq('context_id', contextId).maybeSingle()
    if (!client?.id) return
    // 1. Fetch active webhooks for this context that subscribe to the event
    const { data: webhooks, error } = await supabase
      .from('webhooks')
      .select('id, url, events, secret')
      .eq('context_id', contextId)
      .eq('is_active', true)

    if (error || !webhooks || webhooks.length === 0) return

    // 2. Filter webhooks that subscribe to this event
    const targetWebhooks = webhooks.filter(w => w.events.includes(eventName) || w.events.includes('*'))

    if (targetWebhooks.length === 0) return

    // 3. Fire the webhooks (fire and forget)
    targetWebhooks.forEach(async (webhook) => {
      try {
        const workspaceId = client.id
        if (!webhook.secret) throw new Error('Webhook signing is not configured')
        const body = JSON.stringify({event:eventName,context_id:contextId,timestamp:new Date().toISOString(),data:payload})
        const secret = decryptTenantSecret(workspaceId, webhook.secret)
        const signature = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`
        const response = await safeOutboundFetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Vittain-Webhook-Sender/1.0',
            'X-Vittain-Event': eventName,
            'X-Vittain-Signature': signature,
          },
          body,
          signal: AbortSignal.timeout(5000),
        })

        if (response.ok) {
          // Update last triggered
          await supabase.from('webhooks').update({ last_triggered_at: new Date().toISOString() }).eq('id', webhook.id)
        } else {
          console.error(`[Webhook Failed] ${webhook.url} returned ${response.status}`)
        }
      } catch (err) {
        console.error(`[Webhook Error] Failed to reach ${webhook.url}`, err)
      }
    })
  } catch (err) {
    console.error('[fireWebhook Error]', err)
  }
}
