import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createWebsite } from '@/lib/umami'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'

export async function POST(req: NextRequest) {
  try {
    const actor = await getAuthenticatedWorkspaceUser(req, 'settings', true)
    if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const { clientName, domain } = await req.json()
    const clientId = actor.workspaceId
    

    const website = await createWebsite({ name: clientName, domain })

    await supabase
      .from('clients')
      .update({
        umami_website_id: website.id,
        umami_website_domain: domain,
      })
      .eq('id', clientId)

    return Response.json({ websiteId: website.id })
  } catch (error) {
    console.error('[Create Website] Error:', error)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
}
