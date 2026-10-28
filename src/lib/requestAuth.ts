import { createServerClient } from '@supabase/ssr'
import { NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'
import { memberCan } from '@/lib/saas/catalog'
import { claimsIdentity,validateSupabaseClaims } from '@/lib/security/jwtClaims'

async function verifiedUser(req: NextRequest) {
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} } }
  )
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const {data,error}=token?await client.auth.getClaims(token):await client.auth.getClaims()
  if(error)return null
  const claims=validateSupabaseClaims(data?.claims)
  return claims?claimsIdentity(claims):null
}

export async function getAuthenticatedUser(req: NextRequest) {
  const user = await verifiedUser(req)
  if(user){const {data,error}=await supabase.from('saas_identity_controls').select('blocked').eq('user_id',user.id).maybeSingle();if(error||data?.blocked)return null}
  return user
}

/** Management API context. Actor identity and workspace identity are deliberately separate. */
export async function getAuthenticatedWorkspaceUser(req: NextRequest, area?:string, write=false) {
  const user = await verifiedUser(req)
  if (!user) return null
  const workspaceId = req.headers.get('x-workspace-id') || req.cookies.get('vittain_workspace')?.value || user.id
  // One database round trip for identity controls + membership. JWT signature
  // and registered claims were already checked locally above.
  const { data: snapshot, error } = await supabase.rpc('saas_authorization_snapshot', {
    p_actor: user.id,
    p_client: workspaceId,
  })
  const membership = snapshot?.membership
  if (error || snapshot?.blocked || !membership || membership.status !== 'active') return null
  if(area&&!memberCan(membership.role_key,area,write,membership.permissions))return null
  return { ...user, workspaceId, workspaceRole: membership.role_key }
}

/** Defense-in-depth resource guard for service-role route handlers. */
export async function getAuthenticatedWorkspaceResource(
  req: NextRequest,
  table: string,
  id: string,
  area?: string,
  write = false,
) {
  const actor = await getAuthenticatedWorkspaceUser(req, area, write)
  if (!actor || !id) return null
  const { data, error } = await supabase.from(table).select('id').eq('id', id).eq('client_id', actor.workspaceId).maybeSingle()
  return error || !data ? null : actor
}
