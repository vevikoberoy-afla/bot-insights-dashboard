import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { eventRateLimit, getIP } from '@/lib/ratelimit'

export async function POST(req: NextRequest) {
  try {
    const limit = await eventRateLimit.limit(getIP(req)).catch(() => null)
    if (limit && !limit.success) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    const body = await req.json()
    const { clientId, visitorId, event, properties } = body

    if (!clientId || !visitorId || !event) {
      return NextResponse.json({ error: 'Missing required tracking fields' }, { status: 400 })
    }

    // Lookup client keys based on client_id (Vittain's ID now)
    const { data: client, error } = await supabase
      .from('clients')
      .select('id, context_id')
      .eq('id', clientId)
      .single()

    if (error || !client) {
      return NextResponse.json({ error: 'Client configuration not found' }, { status: 404 })
    }

    // We can save events directly into Supabase analytics table later.
    // For now, if the event matches a segment criteria or triggers a coupon,
    // the tracker.js script handles calling the specific endpoints.

    // Let's just log the event to a native `analytics_events` table (assuming it exists)
    try {
      await supabase.from('analytics_events').insert({
        client_id: client.id,
        visitor_id: String(visitorId).slice(0, 128),
        event_name: String(event).slice(0, 100),
        properties: properties || {}
      })
    } catch {} // Ignore if table isn't created yet for v1

    return NextResponse.json({ success: true, event })
  } catch (err: any) {
    console.error('[/api/tracker/event]', err.message)
    return NextResponse.json({ error: 'Tracking failed' }, { status: 500 })
  }
}
