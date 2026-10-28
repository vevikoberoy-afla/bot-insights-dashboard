import { NextRequest,NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checked,requireStaff,saasError,uuid,SaaSError } from '@/lib/saas/context'
export const dynamic='force-dynamic'
export async function GET(req:NextRequest){
 try {
  const staff=await requireStaff(),p=req.nextUrl.searchParams,view=p.get('view')||'overview',page=Math.max(0,Math.min(10000,Number(p.get('page'))||0))
  if(view==='overview')return NextResponse.json({...checked(await supabase.rpc('saas_founder_overview',{p_days:Math.min(90,Math.max(1,Number(p.get('days'))||30))})),staff})
  if(view==='accounts')return NextResponse.json({...checked(await supabase.rpc('saas_founder_accounts',{p_search:(p.get('q')||'').slice(0,200),p_state:p.get('state')||'',p_plan:p.get('plan')||'',p_page:page})),staff})
  if(view==='access-requests'){
   await requireStaff('provision')
   const status=['waitlisted','approved','rejected','suspended'].includes(p.get('state')||'')?p.get('state')!:'waitlisted'
   const result=await supabase.from('saas_user_onboarding').select('user_id,email,status,company_name,website_url,use_case,requested_seats,admin_notes,created_at,reviewed_at',{count:'exact'}).eq('status',status).order('created_at',{ascending:true}).range(page*50,page*50+49)
   return NextResponse.json({rows:checked(result),total:result.count,page,status,staff})
  }
  if(view==='health-radar'){
   const since=new Date(Date.now()-14*86400000).toISOString()
   const [accountsResult,sessionsResult,usageResult]=await Promise.all([
    supabase.from('saas_workspace_accounts').select('client_id,operational_state,access_state,service_stops_at,clients(name,email),saas_plan_versions(code,name,limits)').order('updated_at',{ascending:false}),
    supabase.from('sessions').select('client_id,mode,created_at').gte('created_at',since).limit(10000),
    supabase.from('saas_usage_events').select('client_id,meter,amount,created_at').eq('state','committed').gte('created_at',new Date(Date.now()-30*86400000).toISOString()).limit(10000),
   ])
   const accounts:any[]=checked(accountsResult)||[],sessions:any[]=checked(sessionsResult)||[],usage:any[]=checked(usageResult)||[]
   const rows=accounts.map(account=>{
    const conversations=sessions.filter(s=>s.client_id===account.client_id),resolved=conversations.filter(s=>['ai','resolved'].includes(s.mode)).length
    const credits=usage.filter(u=>u.client_id===account.client_id&&u.meter==='ai.credits.monthly').reduce((sum,u)=>sum+Number(u.amount||0),0)
    const limit=Number(account.saas_plan_versions?.limits?.['ai.credits.monthly']||0),quota_percent=limit?Math.min(100,Math.round(credits/limit*100)):0
    const activityScore=Math.min(35,Math.round(conversations.length/20*35)),resolutionScore=conversations.length?Math.round(resolved/conversations.length*25):0
    const utilizationScore=quota_percent>0?Math.min(20,Math.max(5,Math.round(quota_percent/100*20))):0,billingScore=['active','trialing','past_due_grace'].includes(account.access_state)&&account.operational_state==='active'?20:0
    const health_score=Math.min(100,activityScore+resolutionScore+utilizationScore+billingScore)
    const status=account.operational_state!=='active'?'critical':health_score>=75?'healthy':health_score>=45?'at_risk':'churning'
    return{client_id:account.client_id,name:account.clients?.name||'Unnamed workspace',email:account.clients?.email,plan:account.saas_plan_versions?.name,health_score,status,conversations_14d:conversations.length,resolution_rate:conversations.length?Math.round(resolved/conversations.length*100):0,quota_percent,zombie:account.access_state==='active'&&conversations.length<5,expansion_signal:quota_percent>=85,service_stops_at:account.service_stops_at}
   }).sort((a,b)=>a.health_score-b.health_score)
   return NextResponse.json({rows,summary:{healthy:rows.filter(r=>r.status==='healthy').length,at_risk:rows.filter(r=>r.status==='at_risk').length,churning:rows.filter(r=>r.status==='churning').length,critical:rows.filter(r=>r.status==='critical').length,zombies:rows.filter(r=>r.zombie).length,expansion:rows.filter(r=>r.expansion_signal).length},computed_at:new Date().toISOString(),staff})
  }
  if(view==='broadcasts'){await requireStaff('broadcasts');const r=await supabase.from('saas_workspace_broadcasts').select('*',{count:'exact'}).order('created_at',{ascending:false}).range(page*50,page*50+49);return NextResponse.json({rows:checked(r),total:r.count,staff})}
  if(view==='export'){
   await requireStaff('workspaces')
   const rows:any[]=[]
   for(let n=0;n<100;n++){const result=checked(await supabase.rpc('saas_founder_accounts',{p_search:(p.get('q')||'').slice(0,200),p_state:p.get('state')||'',p_plan:p.get('plan')||'',p_page:n}));if(result.total>5000)throw new SaaSError('EXPORT_TOO_LARGE','Narrow your filters to 5,000 accounts or fewer.',413);rows.push(...result.rows);if(rows.length>=result.total)break}
   const cell=(v:any)=>{const s=String(v??'');return '"'+(/^[=+@\-\t\r\n]/.test(s)?"'"+s:s).replaceAll('"','""')+'"'}
   const csv=[['Account ID','Business','Email','Plan','Version','Subscription','Operational state'],...rows.map(r=>[r.client_id,r.clients.name,r.clients.email,r.saas_plan_versions.name,r.saas_plan_versions.version,r.effective_access_state,r.operational_state])].map(r=>r.map(cell).join(',')).join('\r\n')
   checked(await supabase.from('saas_audit_events').insert({actor_id:staff.user_id,action:'founder.registry_export',reason:'Staff downloaded filtered account registry',after_value:{count:rows.length}}))
   return new NextResponse(csv,{headers:{'Content-Type':'text/csv;charset=utf-8','Content-Disposition':'attachment; filename="customer-accounts.csv"','Cache-Control':'no-store'}})
  }
  if(view==='account-extra'){
   const id=uuid(p.get('workspace'))
   const [notes,integrations,gates,profile,agreements,members,settings]=await Promise.all([
    supabase.from('saas_account_notes').select('*').eq('client_id',id).order('created_at',{ascending:false}).limit(50),
    supabase.from('channel_integrations').select('id,channel,created_at').eq('client_id',id),
    supabase.from('saas_release_gates').select('*'),supabase.from('clients').select('id,name,data_retention_days').eq('id',id).single(),
    supabase.from('saas_enterprise_agreements').select('*').eq('client_id',id).order('created_at',{ascending:false}),
    supabase.from('workspace_memberships').select('user_id').eq('client_id',id),
    supabase.from('saas_platform_settings').select('grace_days').single()
   ])
   const memberRows=checked(members)||[],ids=memberRows.map(m=>m.user_id)
   const controls=(ids.length?checked(await supabase.from('saas_identity_controls').select('user_id,blocked,reason,updated_at').in('user_id',ids)):[])||[]
   const identities=await Promise.all(memberRows.map(async m=>{const {data,error}=await supabase.auth.admin.getUserById(m.user_id);if(error)throw error;const user=data.user,control=controls.find(c=>c.user_id===m.user_id);return {id:m.user_id,email:user?.email,verified:!!user?.email_confirmed_at,created_at:user?.created_at,last_sign_in:user?.last_sign_in_at,providers:user?.app_metadata?.providers||[],mfa_enrolled:user?.factors?.some(f=>f.status==='verified')||false,blocked:control?.blocked||false,restriction_reason:control?.reason||null,restriction_updated_at:control?.updated_at||null}}))
   return NextResponse.json({notes:checked(notes),integrations:checked(integrations),gates:checked(gates),profile:checked(profile),agreements:checked(agreements),identities,settings:checked(settings),staff})
  }
  if(view==='settings') {await requireStaff('settings');return NextResponse.json({settings:checked(await supabase.from('saas_platform_settings').select('*').single()),staff})}
  if(view==='enterprise'){await requireStaff('enterprise');const r=await supabase.from('saas_enterprise_agreements').select('*,clients(name,email)',{count:'exact'}).order('created_at',{ascending:false}).range(page*50,page*50+49);return NextResponse.json({rows:checked(r),total:r.count,staff})}
  throw new SaaSError('NOT_FOUND','Unknown founder view.',404)
 }catch(e){return saasError(e)}
}
