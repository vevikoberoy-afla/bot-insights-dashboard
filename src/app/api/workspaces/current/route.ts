import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checked, requireWorkspace, saasError } from '@/lib/saas/context'
export const dynamic='force-dynamic'
export async function GET() {
 try {
  const ctx=await requireWorkspace()
  const [workspace,memberships,entitlements,usage,plans,requests,broadcasts,storefronts]=await Promise.all([
   supabase.from('clients').select('id,name,email,context_id,website_url,data_retention_days').eq('id',ctx.workspaceId).single(),
   supabase.from('workspace_memberships').select('client_id,role_key,clients(id,name,email)').eq('user_id',ctx.user.id).eq('status','active'),
   supabase.rpc('saas_entitlements',{p_client:ctx.workspaceId}),supabase.rpc('saas_usage_snapshot',{p_client:ctx.workspaceId}),
   supabase.from('saas_plan_versions').select('*').neq('code','legacy').order('version',{ascending:false}),
   supabase.from('saas_requests').select('*').eq('client_id',ctx.workspaceId).eq('requester_id',ctx.user.id).order('created_at',{ascending:false}).limit(50),
   supabase.rpc('saas_workspace_active_broadcasts',{p_client:ctx.workspaceId}),
   supabase.from('workspace_storefronts').select('id,name,kind,status,is_primary').eq('client_id',ctx.workspaceId).order('is_primary',{ascending:false}).order('created_at'),
  ])
  const baseWorkspace=checked(workspace),storeRows=storefronts.error?[]:(storefronts.data||[])
  const response=NextResponse.json({workspace:{...baseWorkspace,storefront:storeRows[0]||null,storefronts:storeRows},memberships:checked(memberships),role:ctx.membership.role_key,permissions:ctx.membership.permissions||null,entitlements:checked(entitlements),usage:checked(usage),plans:checked(plans),requests:checked(requests),broadcasts:broadcasts.error?[]:(broadcasts.data||[]),payment_provider:'not_connected'})
  response.cookies.set('vittain_workspace',ctx.workspaceId,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:30*86400})
  return response
 }catch(e){return saasError(e)}
}
export async function POST(req:NextRequest){
 try {const body=await req.json();const ctx=await requireWorkspace(body.workspace_id);const response=NextResponse.json({success:true,workspace_id:ctx.workspaceId});response.cookies.set('vittain_workspace',ctx.workspaceId,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:30*86400});return response}catch(e){return saasError(e)}
}
