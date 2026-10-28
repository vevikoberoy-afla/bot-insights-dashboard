import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

// POST /api/events — receives tracking events from tracker.js snippet
// Called by the Vittain tracker running on client websites
export function POST() {
  return NextResponse.json({ error: 'Use the signed telemetry endpoint.' }, { status: 405, headers: { Allow: 'GET' } })
}

// GET /api/events — get events for a contact
export async function GET(req: NextRequest) {
  const actor = await getAuthenticatedWorkspaceUser(req,'analytics')
  if (!actor) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const contact_id = req.nextUrl.searchParams.get('contact_id')
  const requestedLimit = Number(req.nextUrl.searchParams.get('limit') || 50)
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 200) : 50

  let query = supabase.from('contact_events').select('id,contact_id,event_type,event_data,session_id,page_url,channel,created_at').eq('client_id', actor.workspaceId).order('created_at', { ascending: false }).limit(limit)
  if (contact_id) query = query.eq('contact_id', contact_id)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Events are temporarily unavailable.' }, { status: 503 })
  return NextResponse.json(data || [])
}
