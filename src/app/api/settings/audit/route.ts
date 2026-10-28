import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checked, requireWorkspace, saasError } from '@/lib/saas/context'
export async function GET() {
 try {
  const ctx=await requireWorkspace(null,'settings')
  const logs=checked(await supabase.from('saas_audit_events').select('*').eq('client_id',ctx.workspaceId).order('created_at',{ascending:false}).limit(100))
  return NextResponse.json({logs})
 }catch(e){return saasError(e)}
}
export const dynamic = 'force-dynamic'
