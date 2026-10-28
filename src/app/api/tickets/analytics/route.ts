import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function GET(req: NextRequest) {
  const actor = await getAuthenticatedWorkspaceUser(req, 'tickets')
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const clientId = actor.workspaceId
  const days = Math.min(365, Math.max(7, Number(req.nextUrl.searchParams.get('days') || 30)))
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const { data, error } = await supabase.from('tickets').select('*').eq('client_id', clientId).gte('created_at', since)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const tickets = data || []
  const resolved = tickets.filter(t => t.resolved_at)
  const avgResolutionHours = resolved.length ? resolved.reduce((sum, t) => sum + (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()) / 3_600_000, 0) / resolved.length : 0
  const by = (field: string) => tickets.reduce((acc: Record<string, number>, item: any) => {
    const key = item[field] || 'unknown'; acc[key] = (acc[key] || 0) + 1; return acc
  }, {})
  const daily = tickets.reduce((acc: Record<string, number>, item: any) => {
    const key = item.created_at.slice(0, 10); acc[key] = (acc[key] || 0) + 1; return acc
  }, {})
  const { data: csat } = await supabase.from('csat_responses').select('rating').eq('client_id', clientId).gte('submitted_at', since)
  const avgCsat = csat?.length ? csat.reduce((sum, item) => sum + item.rating, 0) / csat.length : 0
  return NextResponse.json({ total: tickets.length, open: tickets.filter(t => !['resolved', 'solved', 'closed'].includes(t.status)).length,
    resolved: resolved.length, sla_breached: tickets.filter(t => t.sla_breached_at || (t.resolution_due_at && !t.resolved_at && new Date(t.resolution_due_at) < new Date())).length,
    avg_resolution_hours: avgResolutionHours, avg_csat: avgCsat, by_status: by('status'), by_priority: by('priority'), by_type: by('type'), daily })
}
