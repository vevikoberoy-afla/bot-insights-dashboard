import { NextRequest } from 'next/server'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'
import { supabase } from '@/lib/supabase'

export async function getClientFromRequest(req: NextRequest, write = false) {
  const actor = await getAuthenticatedWorkspaceUser(req, 'campaigns', write)
  if (!actor) return null
  const { data: client, error } = await supabase
    .from('clients')
    .select('meta_waba_id, meta_access_token')
    .eq('id', actor.workspaceId)
    .single()

  if (error) return null

  return client
}
