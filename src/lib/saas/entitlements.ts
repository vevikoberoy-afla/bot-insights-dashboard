import { supabase } from '@/lib/supabase'

export type Entitlements = {
  client_id: string
  plan_code: string
  operational_state: string
  access_state: string
  features: Record<string,boolean>
  runtime_features?: Record<string,boolean>
  limits: Record<string,number>
  period_start: string
  period_end: string
  enforcement_mode: string
  restriction_stage?: 'active' | 'grace' | 'restricted' | 'stopped'
  restricted_at?: string | null
  service_stops_at?: string | null
  restriction_reason?: string | null
  grace_policy?: Record<string,boolean>
  dashboard_write_allowed?: boolean
  runtime_allowed?: boolean
  human_support_allowed?: boolean
  seconds_until_shutdown?: number
}
/** No in-process cache: suspensions, revocations and expiry are effective on the next request. */
export async function getEffectiveEntitlements(clientId: string): Promise<Entitlements> {
  const { data, error } = await supabase.rpc('saas_entitlements', { p_client: clientId })
  if (error || !data) throw new Error('Workspace access could not be verified. Please try again shortly.')
  return data
}
export function featureAllowed(e: Entitlements, key: string) {
  if (e.runtime_features) return e.runtime_allowed === true && e.runtime_features[key] === true
  return e.operational_state === 'active' && ['active','trialing','past_due_grace'].includes(e.access_state) && e.features[key] === true
}
export function dashboardWriteAllowed(e: Entitlements) {
  if (typeof e.dashboard_write_allowed === 'boolean') return e.dashboard_write_allowed
  return e.operational_state === 'active' && ['active','trialing'].includes(e.access_state)
}
export function humanSupportAllowed(e: Entitlements) {
  if (typeof e.human_support_allowed === 'boolean') return e.human_support_allowed
  return dashboardWriteAllowed(e)
}
export async function consumeUsage(clientId: string, meter: string, operation: string, amount = 1) {
  const { data, error } = await supabase.rpc('saas_consume_usage', { p_client: clientId, p_meter: meter, p_operation: operation, p_amount: amount })
  if (error || !data?.allowed) throw new Error(data?.message || 'Your workspace allowance is unavailable or has been reached.')
  return data
}
