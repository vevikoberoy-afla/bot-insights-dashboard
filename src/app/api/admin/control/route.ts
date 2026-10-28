import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checked, requireStaff, requireReason, saasError, SaaSError, uuid } from '@/lib/saas/context'
import { ACCESS_STATES, FEATURES, LIMITS, STAFF_ROLES, STATES, validValues } from '@/lib/saas/catalog'

export const dynamic = 'force-dynamic'
export async function GET(req: NextRequest) {
  try {
    const staff = await requireStaff()
    const view = req.nextUrl.searchParams.get('view') || 'overview'
    const workspace = req.nextUrl.searchParams.get('workspace')
    const page = Math.max(0, Math.min(10000, Number(req.nextUrl.searchParams.get('page')) || 0))
    if (view === 'identity') return NextResponse.json({ staff })
    if (view === 'plans') return NextResponse.json({ staff, rows: checked(await supabase.from('saas_plan_versions').select('*').order('published_at', { ascending: false })), features: FEATURES, limits: LIMITS })
    if (view === 'workspaces' || view === 'overview' || view === 'subscriptions') {
      let query = supabase.from('saas_workspace_accounts').select('*,clients(id,name,email,created_at),saas_plan_versions(id,code,name,version,price_minor,currency,billing_interval)', { count: 'exact' }).order('updated_at', { ascending: false })
      const state = req.nextUrl.searchParams.get('state')
      if (state && (STATES as readonly string[]).includes(state)) query = query.eq('operational_state', state)
      const result = await query.range(page * 50, page * 50 + 49)
      return NextResponse.json({ rows: checked(result), total: result.count, page, staff, payment_provider: 'not_connected' })
    }
    if (view === 'workspace') {
      const id = uuid(workspace)
      const [account, entitlements, overrides, members, invitations, plans, bots, requests, audit, usage] = await Promise.all([
        supabase.from('saas_workspace_accounts').select('*,clients(id,name,email,created_at),saas_plan_versions(*)').eq('client_id', id).single(),
        supabase.rpc('saas_entitlements', { p_client: id }),
        supabase.from('saas_entitlement_overrides').select('*').eq('client_id', id).order('created_at', { ascending: false }),
        supabase.from('workspace_memberships').select('*').eq('client_id', id),
        supabase.from('saas_invitations').select('id,email,role_key,status,expires_at').eq('client_id', id),
        supabase.from('saas_plan_versions').select('*').order('published_at', { ascending: false }),
        supabase.from('bots').select('id,name,status,channel,created_at').eq('client_id', id),
        supabase.from('saas_requests').select('*').eq('client_id', id).order('created_at', { ascending: false }).limit(50),
        supabase.from('saas_audit_events').select('*').eq('client_id', id).order('created_at', { ascending: false }).limit(100),
        supabase.rpc('saas_usage_snapshot', { p_client: id }),
      ])
      return NextResponse.json({ account: checked(account), entitlements: checked(entitlements), overrides: checked(overrides), members: checked(members), invitations: checked(invitations), plans: checked(plans), bots: checked(bots), requests: checked(requests), audit: checked(audit), usage: checked(usage), staff })
    }
    if (view === 'users') {
      if (!['platform_owner','operations_admin','security_operator'].includes(staff.role_key)) throw new SaaSError('PERMISSION_DENIED','Identity directory is limited to account operators.')
      const { data, error } = await supabase.auth.admin.listUsers({ page: page + 1, perPage: 50 })
      if (error) throw error
      const ids=data.users.map(u=>u.id)
      const [controls,memberships,staffRows]=ids.length?await Promise.all([supabase.from('saas_identity_controls').select('user_id,blocked').in('user_id',ids),supabase.from('workspace_memberships').select('user_id,client_id,role_key,status').in('user_id',ids),supabase.from('platform_staff_memberships').select('user_id,role_key,status').in('user_id',ids)]):[{data:[],error:null},{data:[],error:null},{data:[],error:null}]
      const blocked=checked(controls)||[],members=checked(memberships)||[],roles=checked(staffRows)||[]
      return NextResponse.json({ rows: data.users.map(u => ({ id: u.id, email: u.email, email_confirmed_at: u.email_confirmed_at, last_sign_in_at: u.last_sign_in_at, created_at: u.created_at,blocked:blocked.find(x=>x.user_id===u.id)?.blocked||false,mfa_enrolled:u.factors?.some(f=>f.status==='verified')||false,platform_role:roles.find(x=>x.user_id===u.id&&x.status==='active')?.role_key||null,memberships:members.filter(m=>m.user_id===u.id)})), page,staff })
    }
    const sources: Record<string, { table: string; columns: string; order: string }> = {
      audit: { table: 'saas_audit_events', columns: '*', order: 'created_at' },
      support: { table: 'saas_requests', columns: '*', order: 'created_at' },
      security: { table: 'platform_staff_memberships', columns: '*', order: 'created_at' },
      releases: { table: 'saas_release_gates', columns: '*', order: 'updated_at' },
      usage: { table: 'saas_usage_events', columns: '*', order: 'created_at' },
      integrations: { table: 'channel_integrations', columns: 'id,client_id,channel,created_at', order: 'created_at' },
      jobs: { table: 'saas_delivery_operations', columns: '*', order: 'created_at' },
    }
    if (view === 'security' && !['platform_owner','security_operator'].includes(staff.role_key)) throw new SaaSError('PERMISSION_DENIED','Security access required.')
    if (!(view in sources)) throw new SaaSError('NOT_FOUND','Unknown administration view.',404)
    const s = sources[view]
    let query = supabase.from(s.table).select(s.columns, { count: 'exact' }).order(s.order, { ascending: false })
    if (workspace && !['security','releases'].includes(view)) query = query.eq('client_id', uuid(workspace))
    const result = await query.range(page * 50, page * 50 + 49)
    return NextResponse.json({ rows: checked(result), total: result.count, page, staff })
  } catch (error) { return saasError(error) }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json(), action = String(body.action || '')
    const permissions: Record<string,string> = { workspace:'workspaces',subscription:'subscriptions',override:'overrides',revoke_override:'overrides',plan:'plans',staff:'staff',release:'releases',case:'cases',member:'members',delivery:'deliveries',note:'notes',profile:'profile',bot:'resources',revoke_invite:'members',ownership:'ownership',enterprise:'enterprise',settings:'settings',identity:'identities',identity_password_reset:'identities',identity_mfa_reset:'identities',provision:'provision',approve_waitlist:'provision',broadcast:'broadcasts' }
    if (!(action in permissions)) throw new SaaSError('INVALID_INPUT','Unknown action.',400)
    const staff = await requireStaff(permissions[action]), reason = requireReason(body.reason)
    const p = body.payload || {}, workspace = ['workspace','subscription','override','revoke_override','case','member','delivery','note','profile','bot','revoke_invite','ownership','enterprise','identity_password_reset','identity_mfa_reset'].includes(action) ? uuid(body.workspace) : null
    if (p.expected_version!==undefined && (!Number.isSafeInteger(p.expected_version)||p.expected_version<1))throw new SaaSError('INVALID_INPUT','Invalid account version.',400)
    if (action === 'workspace' && !Number.isSafeInteger(p.expected_version))throw new SaaSError('INVALID_INPUT','Refresh the account before changing access.',400)
    if(action==='note' && (typeof p.body!=='string'||!p.body.trim()||p.body.length>10000))throw new SaaSError('INVALID_INPUT','Enter a note up to 10,000 characters.',400)
    if(action==='profile' && (typeof p.name!=='string'||!p.name.trim()||p.name.length>200))throw new SaaSError('INVALID_INPUT','Enter a business name.',400)
    if(['bot','revoke_invite'].includes(action))uuid(p.id)
    if(action==='bot' && !['active','paused'].includes(p.status))throw new SaaSError('INVALID_INPUT','Choose an active or paused bot state.',400)
    if(action==='ownership')uuid(p.user_id)
    if(action==='identity'){uuid(p.user_id);if(typeof p.blocked!=='boolean')throw new SaaSError('INVALID_INPUT','Choose an identity access state.',400)}
    if(['identity_password_reset','identity_mfa_reset'].includes(action)){
      uuid(p.user_id)
      if(staff.role_key!=='platform_owner')throw new SaaSError('PERMISSION_DENIED','Only the platform owner can perform credential recovery.',403)
      const member=checked(await supabase.from('workspace_memberships').select('user_id').eq('client_id',workspace!).eq('user_id',p.user_id).maybeSingle())
      if(!member)throw new SaaSError('NOT_FOUND','This identity does not belong to the selected workspace.',404)
      const platformStaff=checked(await supabase.from('platform_staff_memberships').select('status').eq('user_id',p.user_id).eq('status','active').maybeSingle())
      if(platformStaff)throw new SaaSError('PERMISSION_DENIED','Platform staff credentials must be recovered through the separate founder security process.',403)
      const recent=checked(await supabase.from('saas_audit_events').select('created_at').eq('client_id',workspace!).eq('action',`founder.${action}`).gte('created_at',new Date(Date.now()-60000).toISOString()).limit(1))||[]
      if(recent.length)throw new SaaSError('RATE_LIMITED','Wait one minute before repeating this security action.',429)
      const {data:target,error:targetError}=await supabase.auth.admin.getUserById(p.user_id)
      if(targetError||!target.user?.email)throw new SaaSError('NOT_FOUND','Authenticated customer identity was not found.',404)
      const pending=checked(await supabase.from('saas_audit_events').insert({actor_id:staff.user_id,client_id:workspace,action:`founder.${action}`,reason,before_value:{user_id:p.user_id,email:target.user.email},after_value:{status:'pending'}}).select('id').single())
      if(!pending)throw new SaaSError('STORAGE_UNAVAILABLE','The security operation could not be audited.',503)
      if(action==='identity_password_reset'){
        const origin=process.env.NEXT_PUBLIC_APP_URL||req.nextUrl.origin
        const {error}=await supabase.auth.resetPasswordForEmail(target.user.email,{redirectTo:`${origin.replace(/\/$/,'')}/auth/callback?next=/auth/update-password`})
        if(error){await supabase.from('saas_audit_events').update({after_value:{status:'failed',error_code:'PASSWORD_RECOVERY_DELIVERY_FAILED'}}).eq('id',pending.id);throw new SaaSError('DELIVERY_FAILED','The password recovery email could not be sent.',502)}
        checked(await supabase.from('saas_audit_events').update({after_value:{status:'dispatched',channel:'email'}}).eq('id',pending.id))
        return NextResponse.json({success:true,result:{status:'dispatched'}})
      }
      const factors=await supabase.auth.admin.mfa.listFactors({userId:p.user_id})
      if(factors.error){await supabase.from('saas_audit_events').update({after_value:{status:'failed',error_code:'MFA_LOOKUP_FAILED'}}).eq('id',pending.id);throw new SaaSError('PROVIDER_ERROR','MFA factors could not be loaded.',502)}
      let removed=0
      for(const factor of factors.data?.factors||[]){const deletion=await supabase.auth.admin.mfa.deleteFactor({userId:p.user_id,id:factor.id});if(deletion.error){await supabase.from('saas_audit_events').update({after_value:{status:'partial_failure',removed}}).eq('id',pending.id);throw new SaaSError('PROVIDER_ERROR','MFA reset was only partially completed. Review the audit entry.',502)}removed++}
      checked(await supabase.from('saas_audit_events').update({after_value:{status:'completed',removed_factors:removed}}).eq('id',pending.id))
      return NextResponse.json({success:true,result:{status:'completed',removed_factors:removed}})
    }
    if(action==='provision'){uuid(p.owner_user_id);if(typeof p.name!=='string'||!p.name.trim()||p.name.length>200)throw new SaaSError('INVALID_INPUT','Enter a business name.',400)}
    if(action==='approve_waitlist'){
      uuid(p.user_id)
      if(typeof p.company_name!=='string'||p.company_name.trim().length<2||p.company_name.length>200||!['trial','starter','growth','business','enterprise'].includes(p.plan_code)||![p.max_seats,p.max_bots,p.max_datasets,p.max_messages].every(Number.isSafeInteger)||p.max_seats<1||p.max_seats>500||p.max_bots<0||p.max_datasets<0||p.max_messages<0||!(Date.parse(p.valid_until)>Date.now()))throw new SaaSError('INVALID_INPUT','Enter valid workspace limits, plan, and a future access date.',400)
    }
    if(action==='broadcast'){
      if(!['create','activate','end'].includes(p.operation))throw new SaaSError('INVALID_INPUT','Invalid broadcast operation.',400)
      if(p.operation==='create'){
        if(typeof p.title!=='string'||!p.title.trim()||p.title.length>160||typeof p.message!=='string'||!p.message.trim()||p.message.length>2000)throw new SaaSError('INVALID_INPUT','Enter a title and message.',400)
        if(!['info','warning','critical','success'].includes(p.severity)||!['all','workspace','plan'].includes(p.target_type)||!['draft','active'].includes(p.status))throw new SaaSError('INVALID_INPUT','Invalid broadcast settings.',400)
        if(p.target_type!=='all'&&(!String(p.target_value||'').trim()||String(p.target_value).length>200))throw new SaaSError('INVALID_INPUT','Choose a broadcast target.',400)
        if(!(Date.parse(p.starts_at)>0)||(p.ends_at&&!(Date.parse(p.ends_at)>Date.parse(p.starts_at))))throw new SaaSError('INVALID_INPUT','Choose a valid broadcast window.',400)
      } else uuid(p.id)
    }
    if(action==='enterprise' && (!String(p.reference||'').trim()||!String(p.payment_terms||'').trim()||!Number.isInteger(p.sla_hours)||p.sla_hours<1||!(Date.parse(p.ends_at)>Date.parse(p.starts_at))))throw new SaaSError('INVALID_INPUT','Enter a contract reference, valid dates, terms and positive SLA hours.',400)
    if(action==='settings' && (!Number.isInteger(p.trial_days)||p.trial_days<1||p.trial_days>90||!Number.isInteger(p.grace_days)||p.grace_days<1||p.grace_days>60||typeof p.notice!=='string'||p.notice.length>2000))throw new SaaSError('INVALID_INPUT','Trial must be 1–90 days and grace 1–60 days.',400)
    if (action === 'workspace') {
      if (!(STATES as readonly string[]).includes(p.state)) throw new SaaSError('INVALID_INPUT','Invalid workspace state.',400)
      if (p.state === 'restricted' && (!Number.isInteger(p.grace_days) || p.grace_days < 1 || p.grace_days > 60)) throw new SaaSError('INVALID_INPUT','Grace period must be between 1 and 60 days.',400)
      const policyKeys = ['bots','human_inbox','campaigns','commerce','booking','support']
      if (!p.grace_policy || typeof p.grace_policy !== 'object' || policyKeys.some(key => typeof p.grace_policy[key] !== 'boolean') || Object.keys(p.grace_policy).some(key => !policyKeys.includes(key))) throw new SaaSError('INVALID_INPUT','Choose which services remain available during grace.',400)
    }
    if (action === 'subscription') {
      uuid(p.plan_version_id)
      if (!(ACCESS_STATES as readonly string[]).includes(p.access_state) || !['enforced','shadow'].includes(p.enforcement_mode)) throw new SaaSError('INVALID_INPUT','Invalid subscription state.',400)
      if (['trialing','past_due_grace'].includes(p.access_state) && !(Date.parse(p.expires_at) > Date.now())) throw new SaaSError('INVALID_INPUT','Choose a future trial or grace expiry.',400)
    }
    if (action === 'override') {
      if (!(p.key in FEATURES || p.key in LIMITS)) throw new SaaSError('INVALID_INPUT','Unknown entitlement.',400)
      if (p.key in FEATURES ? typeof p.value !== 'boolean' : !Number.isSafeInteger(p.value) || p.value < 0) throw new SaaSError('INVALID_INPUT','Invalid entitlement value.',400)
      if(p.key==='knowledge.documents.max_file_mb' && p.value>20)throw new SaaSError('INVALID_INPUT','Choose a document size limit from 0 to 20 MB. Zero disables imports.',400)
      if (!(Date.parse(p.expires_at) > Date.now()) || Date.parse(p.expires_at) > Date.now()+366*86400000) throw new SaaSError('INVALID_INPUT','Overrides must expire within 366 days.',400)
    }
    if (action === 'revoke_override' || action === 'case') uuid(p.id)
    if (action === 'case' && !['open','in_progress','resolved','closed'].includes(p.status)) throw new SaaSError('INVALID_INPUT','Invalid case state.',400)
    if (action === 'plan') {
      if (!/^[a-z][a-z0-9_-]{1,40}$/.test(p.code) || !String(p.name || '').trim() || !validValues(p.features,p.limits)) throw new SaaSError('INVALID_INPUT','Provide a name, code and a complete valid feature/limit matrix.',400)
      if (p.price_minor !== null && (!Number.isSafeInteger(p.price_minor) || p.price_minor < 0)) throw new SaaSError('INVALID_INPUT','Price must be a non-negative minor-unit amount, or unset.',400)
      if (!/^[A-Z]{3}$/.test(p.currency) || !['month','year','contract'].includes(p.billing_interval)) throw new SaaSError('INVALID_INPUT','Invalid currency or interval.',400)
    }
    if (action === 'staff') {
      uuid(p.user_id)
      if (!(STAFF_ROLES as readonly string[]).includes(p.role_key) || !['active','revoked'].includes(p.status)) throw new SaaSError('INVALID_INPUT','Invalid staff role or status.',400)
    }
    if (action === 'release' && (!(p.key in FEATURES) || typeof p.enabled !== 'boolean')) throw new SaaSError('INVALID_INPUT','Invalid release gate.',400)
    if (action === 'member') {
      uuid(p.id)
      if (!['workspace_admin','agent','booking_commerce_operator','analyst','billing_manager'].includes(p.role_key) || !['active','revoked'].includes(p.status)) throw new SaaSError('INVALID_INPUT','Invalid membership change.',400)
    }
    if (action === 'delivery' && (typeof p.operation !== 'string' || !['accepted','failed'].includes(p.status) || typeof p.message_id !== 'string' || !p.message_id.trim() || p.message_id.length>1000)) throw new SaaSError('INVALID_INPUT','Choose a confirmed provider outcome and provide an evidence reference.',400)
    const result = action === 'approve_waitlist'
      ? checked(await supabase.rpc('saas_approve_waitlist',{p_actor:staff.user_id,p_user:p.user_id,p_company:p.company_name,p_plan_code:p.plan_code,p_max_seats:p.max_seats,p_max_bots:p.max_bots,p_max_datasets:p.max_datasets,p_max_messages:p.max_messages,p_valid_until:p.valid_until,p_notes:reason}))
      : action === 'workspace'
      ? checked(await supabase.rpc('saas_set_workspace_lifecycle', {
          p_actor: staff.user_id,
          p_client: workspace,
          p_state: p.state,
          p_grace_days: p.state === 'restricted' ? p.grace_days : 0,
          p_policy: p.grace_policy,
          p_reason: reason,
          p_expected_version: p.expected_version,
        }))
      : action === 'broadcast'
        ? checked(await supabase.rpc('saas_manage_broadcast', { p_actor: staff.user_id, p_id: p.id || null, p_payload: p, p_reason: reason }))
        : checked(await supabase.rpc('saas_admin_mutate', { p_actor: staff.user_id, p_action: action, p_client: workspace, p_payload: p, p_reason: reason }))
    return NextResponse.json({ success: true, result })
  } catch (error) { return saasError(error) }
}
