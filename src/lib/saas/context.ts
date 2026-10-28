import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { staffCan, memberCan } from './catalog'
import { cache } from 'react'
import { claimsIdentity,validateSupabaseClaims } from '@/lib/security/jwtClaims'

export class SaaSError extends Error {
  constructor(public code: string, message: string, public status = 403) { super(message) }
}
export function checked<T>(result: { data: T; error: any }): T {
  if (result.error) {
    if(result.error.code==='40001')throw new SaaSError('CONCURRENT_MODIFICATION_CONFLICT','This account changed while you were editing. Refresh the account and review your change again.',409)
    if(result.error.code==='P0001')throw new SaaSError('CONTROL_REJECTED',String(result.error.message || 'Change rejected').replaceAll('_',' ').slice(0,200),409)
    console.error('[saas database]', result.error)
    throw new SaaSError('STORAGE_UNAVAILABLE', 'Account controls are unavailable. Check that migrations 067–070 are installed.', 503)
  }
  return result.data
}
export function saasError(error: unknown) {
  if ((error as { digest?: string })?.digest === 'DYNAMIC_SERVER_USAGE') throw error
  if (error instanceof SaaSError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
  console.error('[saas]', error)
  return NextResponse.json({ error: 'We could not complete this request. Please try again.', code: 'INTERNAL_ERROR' }, { status: 500 })
}
export const identity = cache(async function identity() {
  const h = await headers(), c = await cookies(), token = h.get('authorization')?.replace(/^Bearer /, '')
  const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => c.getAll(), setAll: () => {} },
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
  })
  const verified=token?await auth.auth.getClaims(token):await auth.auth.getClaims(),claims=verified.error?null:validateSupabaseClaims(verified.data?.claims),user=claims?claimsIdentity(claims):null
  if (!user) throw new SaaSError('UNAUTHENTICATED', 'Please sign in.', 401)
  const selectedWorkspace = h.get('x-workspace-id') || c.get('vittain_workspace')?.value || null
  const authorizationResult = await supabase.rpc('saas_authorization_snapshot',{p_actor:user.id,p_client:selectedWorkspace})
  const authorization=checked(authorizationResult)
  if(authorization?.blocked)throw new SaaSError('IDENTITY_RESTRICTED','Your account access has been restricted. Contact platform support.',403)
  // `getClaims()` cryptographically verifies the JWT before we trust its AAL.
  // Reading the signed `aal` claim avoids Supabase MFA's cookie-only fallback,
  // which internally calls getSession() and exposes an unverified user proxy.
  return { user, aal: claims?.aal === 'aal2' ? 'aal2' : 'aal1', authorization }
})
export async function requireStaff(permission = 'read') {
  const { user, aal, authorization } = await identity()
  const staff = authorization?.staff
  if (!staff || staff.status !== 'active') throw new SaaSError('PERMISSION_DENIED', 'Platform staff access is required.')
  if (aal !== 'aal2') throw new SaaSError('MFA_REQUIRED', 'Verify your authenticator to access platform administration.')
  if (!staffCan(staff.role_key, permission)) throw new SaaSError('PERMISSION_DENIED', 'Your staff role cannot perform this action.')
  return { ...staff, email: user.email, aal }
}
export async function requireWorkspace(explicit?: string | null, area = 'account', write = false) {
  const { user, authorization } = await identity()
  const h = await headers(), c = await cookies()
  const id = explicit || h.get('x-workspace-id') || c.get('vittain_workspace')?.value
  const snapshot = !id || authorization?.workspace_id === id ? authorization : checked(await supabase.rpc('saas_authorization_snapshot', { p_actor: user.id, p_client: id }))
  if (snapshot?.onboarding !== 'approved') throw new SaaSError('WAITLISTED', 'Workspace approval is pending.', 403)
  const membership = snapshot?.membership
  if (!membership) throw new SaaSError('MEMBERSHIP_REQUIRED', 'You do not have access to this workspace.')
  const entitlements = snapshot.entitlements
  if (!entitlements) throw new SaaSError('STORAGE_UNAVAILABLE','Workspace account is not configured.',503)
  const stopped = entitlements.restriction_stage === 'stopped' || (!entitlements.restriction_stage && entitlements.operational_state === 'suspended')
  if (stopped && !['account','billing'].includes(area)) throw new SaaSError('ACCOUNT_RESTRICTED','Workspace services are paused. Contact platform support.')
  if (area !== 'account' && !memberCan(membership.role_key, area, write, membership.permissions)) throw new SaaSError('PERMISSION_DENIED', 'Your workspace access does not allow this action.')
  if (write && area !== 'billing') {
    const legacyAllowed = entitlements.operational_state === 'active' && ['active','trialing','past_due_grace'].includes(entitlements.access_state)
    const allowed = area === 'inbox'
      ? (typeof entitlements.human_support_allowed === 'boolean' ? entitlements.human_support_allowed : legacyAllowed)
      : (typeof entitlements.dashboard_write_allowed === 'boolean' ? entitlements.dashboard_write_allowed : legacyAllowed)
    if (!allowed) throw new SaaSError('ACCOUNT_READ_ONLY', area === 'inbox' ? 'Human replies are paused for this workspace.' : 'This workspace is read-only during its account transition.', 403)
  }
  return { user, workspaceId: membership.client_id as string, membership, entitlements }
}
export function requireReason(value: unknown) {
  if (typeof value !== 'string' || value.trim().length < 10 || value.length > 2000) throw new SaaSError('INVALID_INPUT', 'Please give a reason of 10–2,000 characters.', 400)
  return value.trim()
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new SaaSError('INVALID_INPUT', 'Invalid identifier.', 400)
  return value
}
