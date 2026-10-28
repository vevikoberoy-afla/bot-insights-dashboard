import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getStats, getPageviewSeries } from '@/lib/umami'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const actor = await getAuthenticatedWorkspaceUser(req, 'analytics')
    if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const clientId = actor.workspaceId

    
    const { data: client } = await supabase
      .from('clients')
      .select('umami_website_id')
      .eq('id', clientId)
      .single()

    if (!client?.umami_website_id) {
      return Response.json({ stats: null, series: [] })
    }

    const endAt = Date.now()
    const startAt = endAt - 7 * 24 * 60 * 60 * 1000 // last 7 days

    const [stats, series] = await Promise.all([
      getStats(client.umami_website_id, startAt, endAt),
      getPageviewSeries(client.umami_website_id, startAt, endAt),
    ])

    return Response.json({ stats, series })
  } catch (error) {
    console.error('[Analytics Traffic] Error:', error)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}
