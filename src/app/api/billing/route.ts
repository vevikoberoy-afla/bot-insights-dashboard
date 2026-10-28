import { NextRequest,NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checked,requireWorkspace,saasError } from '@/lib/saas/context'
export async function GET(req:NextRequest){
 try{
  const ctx=await requireWorkspace(req.nextUrl.searchParams.get('client_id'),'billing')
  const [account,invoices]=await Promise.all([supabase.from('saas_workspace_accounts').select('*,saas_plan_versions(*)').eq('client_id',ctx.workspaceId).single(),supabase.from('invoices').select('*').eq('client_id',ctx.workspaceId).order('created_at',{ascending:false}).limit(100)])
  return NextResponse.json({subscription:checked(account),invoices:checked(invoices),payment_provider:'not_connected'})
 }catch(e){return saasError(e)}
}
export const dynamic = 'force-dynamic'
