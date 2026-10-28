import {NextResponse} from 'next/server'
import {supabase} from '@/lib/supabase'
import {checked,requireWorkspace,saasError} from '@/lib/saas/context'
export const dynamic='force-dynamic'
export async function GET(){try{
 const started=performance.now()
 const ctx=await requireWorkspace()
 const authorized=performance.now()
 const [usage,settings,account,broadcasts]=await Promise.all([
  supabase.rpc('saas_usage_snapshot',{p_client:ctx.workspaceId}),
  supabase.from('saas_platform_settings').select('notice').single(),
  supabase.from('saas_workspace_accounts').select('version').eq('client_id',ctx.workspaceId).single(),
  supabase.rpc('saas_workspace_active_broadcasts',{p_client:ctx.workspaceId}),
 ])
 return NextResponse.json({workspace_id:ctx.workspaceId,role:ctx.membership.role_key,permissions:ctx.membership.permissions||null,entitlements:ctx.entitlements,usage:checked(usage),notice:checked(settings)?.notice||'',broadcasts:broadcasts.error?[]:(broadcasts.data||[]),version:checked(account)?.version},{headers:{'Cache-Control':'no-store','Server-Timing':`authorization;dur=${Math.round(authorized-started)},state_data;dur=${Math.round(performance.now()-authorized)}`}})
}catch(e){return saasError(e)}}
