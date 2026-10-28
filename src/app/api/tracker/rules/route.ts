import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/tracker/rules?clientId=xxx
 *
 * Called by tracker.js on page load to fetch all active trigger rules
 * for this client. The rules are cached in-memory by tracker.js and
 * evaluated against client-side events (cart_updated, page_viewed, etc.)
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')

  if (!clientId) {
    return NextResponse.json({ rules: [] })
  }

  try {
    // Fetch all active trigger rules for this client across all their bots
    const { data: rules, error } = await supabase
      .from('trigger_rules')
      .select(`
        id,
        name,
        description,
        trigger_event,
        conditions,
        actions,
        message,
        action_type,
        frequency_per_session,
        min_gap_minutes,
        status,
        bot_id,
        bots!inner(channel, status)
      `)
      .eq('client_id', clientId)
      .eq('status', 'active')
      .eq('bots.status', 'active')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[/api/tracker/rules]', error.message)
      return NextResponse.json({ rules: [] })
    }

    // Sanitize: only return what tracker.js needs, no sensitive data
    const sanitized = (rules || []).map(rule => ({
      name: rule.name,
      trigger_event: rule.trigger_event,
      condition: rule.conditions?.[0] || {},   // primary condition for simple matching
      conditions: rule.conditions || [],
      actions: rule.actions || [],
      message: rule.message || '',
      action_type: rule.action_type || 'popup',
      frequency_per_session: rule.frequency_per_session || 1,
      min_gap_minutes: rule.min_gap_minutes || 5,
    }))

    // Cache with short TTL so rule changes propagate quickly
    return NextResponse.json(
      { rules: sanitized },
      {
        headers: {
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
          'Access-Control-Allow-Origin': '*',  // tracker.js runs on client sites
        }
      }
    )
  } catch (err: any) {
    console.error('[/api/tracker/rules]', err.message)
    return NextResponse.json({ rules: [] })
  }
}
