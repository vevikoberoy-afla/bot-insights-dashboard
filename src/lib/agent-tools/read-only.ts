import { supabase } from '@/lib/supabase'
import { getStats, getPageviewSeries } from '@/lib/umami'
import type { ToolContext, ToolResult } from './types'

/** get_segment — list/count contacts matching filter criteria */
export async function getSegment(
  ctx: ToolContext,
  criteria: { topic?: string; sinceDays?: number; channel?: string }
): Promise<ToolResult<{ count: number; contactIds: string[] }>> {
  
  let query = supabase.from('contacts').select('id').eq('client_id', ctx.clientId)
  if (criteria.channel) query = query.eq('channel', criteria.channel)
  if (criteria.sinceDays) {
    const since = new Date(Date.now() - criteria.sinceDays * 86400000).toISOString()
    query = query.gte('created_at', since)
  }
  const { data, error } = await query
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: { count: data.length, contactIds: data.map(d => d.id) } }
}

/** get_analytics_summary — pull traffic stats for a client */
export async function getAnalyticsSummary(
  ctx: ToolContext,
  rangeDays = 7
): Promise<ToolResult<{ pageviews: number; visitors: number }>> {
  
  const { data: client } = await supabase
    .from('clients')
    .select('umami_website_id')
    .eq('id', ctx.clientId)
    .single()
  if (!client?.umami_website_id) {
    return { ok: false, error: 'No analytics website configured for this client' }
  }
  const endAt = Date.now()
  const startAt = endAt - rangeDays * 86400000
  const stats = await getStats(client.umami_website_id, startAt, endAt)
  return { ok: true, data: { pageviews: stats.pageviews.value, visitors: stats.visitors.value } }
}

/** get_open_tickets — list open tickets for a client */
export async function getOpenTickets(
  ctx: ToolContext
): Promise<ToolResult<{ count: number }>> {
  
  const { data, error } = await supabase
    .from('tickets')
    .select('id')
    .eq('client_id', ctx.clientId)
    .in('status', ['open', 'in_progress'])
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: { count: data.length } }
}
