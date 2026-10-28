import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

/**
 * GET /api/bots/triggers/analytics
 *
 * Returns analytics for the Proactive Triggers + WhatsApp Cart Recovery feature.
 * Used by the /bots/triggers/analytics dashboard page.
 *
 * Query params:
 *   client_id  string  – required
 *   days       number  – lookback window (default 30)
 */
export async function GET(req: NextRequest) {
  const actor = await getAuthenticatedWorkspaceUser(req, 'analytics')
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const client_id = actor.workspaceId
  const days = parseInt(req.nextUrl.searchParams.get('days') || '30', 10)

  if (!client_id) {
    return NextResponse.json({ error: 'client_id required' }, { status: 400 })
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  // ── 1. Total contacts with a phone + WhatsApp opt-in (leads captured) ──────
  const { count: totalWhatsappLeads } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', client_id)
    .eq('opt_in_whatsapp', true)
    .not('phone', 'is', null)

  // ── 2. Phone numbers captured in window (new leads) ──────────────────────
  const { count: newLeadsInWindow } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', client_id)
    .eq('opt_in_whatsapp', true)
    .not('phone', 'is', null)
    .gte('updated_at', since)

  // ── 3. Abandoned cart recoveries sent (cron stamps abandoned_cart_sent_at) ─
  const { count: recoveriesSent } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', client_id)
    .not('abandoned_cart_sent_at', 'is', null)
    .gte('abandoned_cart_sent_at', since)

  // ── 4. Carts that were recovered (lead_status turned 'won' after recovery) ─
  const { count: cartsRecovered } = await supabase
    .from('contacts')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', client_id)
    .eq('lead_status', 'won')
    .not('abandoned_cart_sent_at', 'is', null)
    .gte('abandoned_cart_sent_at', since)

  // ── 5. Total cart value of currently abandoned carts (pending recovery) ───
  const { data: openCartsData } = await supabase
    .from('contacts')
    .select('last_cart_value')
    .eq('client_id', client_id)
    .eq('opt_in_whatsapp', true)
    .not('phone', 'is', null)
    .gt('last_cart_value', 0)
    .neq('lead_status', 'won')

  const openCartValue = (openCartsData || []).reduce(
    (sum, c) => sum + Number(c.last_cart_value || 0), 0
  )
  const openCartsCount = openCartsData?.length || 0

  // ── 6. Trigger rule fire counts ─────────────────────────────────────────
  const { data: triggerRules } = await supabase
    .from('trigger_rules')
    .select('id, name, fire_count, status, conditions')
    .eq('client_id', client_id)
    .order('fire_count', { ascending: false })
    .limit(10)

  // ── 7. Recent recovered contacts ───────────────────────────────────────
  const { data: recentRecoveries } = await supabase
    .from('contacts')
    .select('id, name, phone, last_cart_value, abandoned_cart_sent_at, lead_status, updated_at')
    .eq('client_id', client_id)
    .not('abandoned_cart_sent_at', 'is', null)
    .gte('abandoned_cart_sent_at', since)
    .order('abandoned_cart_sent_at', { ascending: false })
    .limit(20)

  const recoveryRate =
    recoveriesSent && recoveriesSent > 0
      ? Math.round(((cartsRecovered || 0) / recoveriesSent) * 100)
      : 0

  return NextResponse.json({
    summary: {
      total_whatsapp_leads: totalWhatsappLeads || 0,
      new_leads_in_window: newLeadsInWindow || 0,
      recoveries_sent: recoveriesSent || 0,
      carts_recovered: cartsRecovered || 0,
      recovery_rate_pct: recoveryRate,
      open_abandoned_carts: openCartsCount,
      open_cart_value: openCartValue,
      days,
    },
    trigger_rules: triggerRules || [],
    recent_recoveries: recentRecoveries || [],
  })
}
