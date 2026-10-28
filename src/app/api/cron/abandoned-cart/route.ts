import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { qstash } from '@/lib/qstash'

/**
 * POST /api/cron/abandoned-cart
 *
 * Automated abandoned cart recovery cron. Designed to be called every 30
 * minutes by a QStash scheduled job or Vercel cron.
 *
 * ELIGIBILITY CRITERIA (strict phone gate):
 *   1. contacts.last_cart_value > 0
 *   2. contacts.lead_status != 'won'            (did not complete purchase)
 *   3. contacts.opt_in_whatsapp = true           (explicit consent)
 *   4. contacts.phone IS NOT NULL                (must have a real number)
 *   5. contacts.last_active_at < NOW() - 1h      (idle / left the store)
 *   6. contacts.last_active_at > NOW() - 23h     (still within Meta template window)
 *   7. contacts.abandoned_cart_sent_at IS NULL
 *      OR abandoned_cart_sent_at < NOW() - 23h   (23-hour anti-spam cooldown)
 *
 * For each eligible contact, this enqueues a QStash job to
 * POST /api/qstash/whatsapp with:
 *   - the contact's phone number
 *   - template_name: 'abandoned_cart_v2'
 *   - personalised template_parameters (name, cart value)
 *
 * Security: protected by Authorization: Bearer <CRON_SECRET> header.
 */
export async function POST(req: NextRequest) {
  // ── Auth gate ────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = Date.now()
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString()
  const twentyThreeHoursAgo = new Date(now - 23 * 60 * 60 * 1000).toISOString()

  // ── Query eligible contacts ───────────────────────────────────────────────
  const { data: contacts, error } = await supabase
    .from('contacts')
    .select('id, client_id, name, phone, last_cart_value, last_active_at, abandoned_cart_sent_at')
    .gt('last_cart_value', 0)
    .neq('lead_status', 'won')
    .eq('opt_in_whatsapp', true)
    .not('phone', 'is', null)
    // Idle > 1 hour (left without purchasing)
    .lt('last_active_at', oneHourAgo)
    // Still within 23-hour window (Meta template window; avoids stale carts)
    .gt('last_active_at', twentyThreeHoursAgo)

  if (error) {
    console.error('[cron/abandoned-cart] DB query error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!contacts || contacts.length === 0) {
    return NextResponse.json({ success: true, enqueued: 0, reason: 'no eligible contacts' })
  }

  // ── Apply 23-hour cooldown filter in JS (Supabase doesn't allow OR IS NULL + lt in one chain cleanly) ─
  const eligible = contacts.filter((c) => {
    if (!c.abandoned_cart_sent_at) return true
    return new Date(c.abandoned_cart_sent_at).getTime() < now - 23 * 60 * 60 * 1000
  })

  if (eligible.length === 0) {
    return NextResponse.json({ success: true, enqueued: 0, reason: 'all contacts in cooldown' })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vittain.ai'

  // ── Enqueue QStash jobs (batch) ───────────────────────────────────────────
  const jobs = eligible.map((contact) => ({
    url: `${appUrl}/api/qstash/whatsapp`,
    body: JSON.stringify({
      contact_id: contact.id,
      phone: contact.phone,
      client_id: contact.client_id,
      // Use pre-approved Meta template — required for messages outside 24h
      // window. The template must be approved in Meta Business Manager.
      template_name: 'abandoned_cart_v2',
      template_parameters: [
        // {{1}} = customer name
        { type: 'text', text: contact.name || 'there' },
        // {{2}} = cart value
        { type: 'text', text: `₹${Number(contact.last_cart_value).toFixed(0)}` },
      ],
      // Mark as cron-triggered so QStash handler records abandoned_cart_sent_at
      is_abandoned_cart_recovery: true,
    }),
    headers: { 'Content-Type': 'application/json' },
  }))

  try {
    await qstash.batchJSON(jobs)
  } catch (qErr: any) {
    console.error('[cron/abandoned-cart] QStash batch error:', qErr.message)
    return NextResponse.json({ error: 'QStash batch failed', detail: qErr.message }, { status: 502 })
  }

  console.log(`[cron/abandoned-cart] Enqueued ${jobs.length} recovery jobs`)
  return NextResponse.json({ success: true, enqueued: jobs.length })
}
