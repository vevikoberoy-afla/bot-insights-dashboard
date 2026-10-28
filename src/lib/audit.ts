import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function logAudit(
  actorId: string | null,
  action: string,
  targetId: string | null = null,
  metadata: any = {},
  ipAddress: string | null = null
) {
  try {
    await supabase.from('audit_logs').insert({
      actor_id: actorId,
      action,
      target_id: targetId,
      metadata,
      ip_address: ipAddress
    })
  } catch (err) {
    console.error('[Audit Log Failed]', err)
  }
}
