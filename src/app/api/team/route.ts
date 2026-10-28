import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireWorkspace,checked,saasError } from '@/lib/saas/context'

export async function GET(req: NextRequest) {
  const client_id = req.nextUrl.searchParams.get('client_id')
  if (!client_id) return NextResponse.json({ error: 'client_id required' }, { status: 400 })

  try {
    const ctx=await requireWorkspace(client_id)
    const members=checked(await supabase.from('workspace_memberships').select('user_id,role_key,status').eq('client_id',ctx.workspaceId).eq('status','active')) || []
    const data=await Promise.all(members.map(async m=>{const {data}=await supabase.auth.admin.getUserById(m.user_id);return {id:m.user_id,email:data.user?.email,full_name:data.user?.user_metadata?.full_name || data.user?.email,role:m.role_key,status:m.status}}))
    return NextResponse.json(data)
  } catch (err: any) {
    return saasError(err)
  }
}

// Legacy mutations never granted authentication-backed workspace access.
// All invitations and role changes now use the audited membership API.
function retired() { return NextResponse.json({error:'Use /api/workspaces/team to manage workspace membership.'},{status:410}) }
export const POST=retired
export const PUT=retired
export const DELETE=retired
export const dynamic='force-dynamic'
