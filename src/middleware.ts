import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { memberCan } from '@/lib/saas/catalog'
import { claimsIdentity,validateSupabaseClaims } from '@/lib/security/jwtClaims'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() verifies the access token with Supabase. getSession() only decodes
  // the local cookie and must not be used as an authorization decision.
  const authorization = request.headers.get('authorization')
  const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null
  const claimsResult = bearerToken
    ? await supabase.auth.getClaims(bearerToken)
    : await supabase.auth.getClaims()
  const trustedClaims = claimsResult.error ? null : validateSupabaseClaims(claimsResult.data?.claims)
  const user = trustedClaims ? claimsIdentity(trustedClaims) : null

  const pathname = request.nextUrl.pathname
  const isPublicApi =
    pathname === '/api/health' ||
    pathname === '/api/waitlist' ||
    pathname === '/api/feedback' ||
    pathname === '/api/events/ingest' ||
    pathname === '/api/ticket-status' ||
    pathname === '/api/csat' ||
    pathname === '/api/commerce/postal-lookup' ||
    pathname.startsWith('/api/chat') ||
    pathname.startsWith('/api/widget/') ||
    pathname.startsWith('/api/tracker/') ||
    pathname.startsWith('/api/webhook/') ||
    pathname.startsWith('/api/webhooks/') ||
    pathname.startsWith('/api/whatsapp/') ||
    pathname === '/api/integrations/shopify/webhook' ||
    pathname.startsWith('/api/contacts/identify') ||
    pathname.startsWith('/api/qstash/') ||
    pathname.startsWith('/api/cron/') ||
    pathname.startsWith('/api/workers/') ||
    pathname.startsWith('/api/track/') ||
    pathname === '/api/unsubscribe' ||
    pathname.startsWith('/api/v1/chat')

  // One service client and one authorization snapshot per request. The snapshot
  // combines identity, membership, staff and entitlement reads in PostgreSQL,
  // removing three sequential network round trips from protected API requests.
  const service = user ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }) : null
  let requestBody: Record<string, any> = {}
  if (user && pathname.startsWith('/api/') && request.headers.get('content-type')?.includes('application/json')) requestBody = await request.clone().json().catch(() => ({}))
  const hintedWorkspace = request.nextUrl.searchParams.get('client_id') || request.nextUrl.searchParams.get('clientId') || requestBody.client_id || requestBody.clientId || request.headers.get('x-workspace-id') || request.cookies.get('vittain_workspace')?.value || null
  let authorizationSnapshot: any = null
  const authorizationPrefixes = ['/api/','/master-admin','/admin','/overview','/features','/bots','/analytics','/api-keys','/campaigns','/contacts','/databases','/inbox','/knowledge','/notepad','/settings','/templates','/tickets','/webhooks','/waitlist','/suspended']
  const needsAuthorization = authorizationPrefixes.some(prefix => pathname.startsWith(prefix)) || pathname === '/auth/login' || pathname === '/auth/register'
  if (user && service && needsAuthorization && !isPublicApi && pathname !== '/auth/callback') {
    const snapshot = await service.rpc('saas_authorization_snapshot', { p_actor: user.id, p_client: hintedWorkspace })
    if (!snapshot.error) authorizationSnapshot = snapshot.data
    else if (!['PGRST202', '42883'].includes(snapshot.error.code || '')) return NextResponse.json({ error: 'Account access verification is unavailable.' }, { status: 503 })
  }

  // Cookie-authenticated mutations must originate from this deployment. Bearer
  // clients authenticate independently and provider callbacks are handled below.
  if (pathname.startsWith('/api/') && !isPublicApi && !['GET','HEAD','OPTIONS'].includes(request.method) && !bearerToken) {
    const fetchSite = request.headers.get('sec-fetch-site')
    const origin = request.headers.get('origin')
    const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).origin : request.nextUrl.origin
    if (fetchSite === 'cross-site' || (origin && origin !== request.nextUrl.origin && origin !== configuredOrigin)) {
      return NextResponse.json({ error: 'Cross-site request rejected.' }, { status: 403 })
    }
  }

  if(user&&!isPublicApi&&!pathname.startsWith('/auth/')&&!pathname.startsWith('/api/auth/')){
    let blocked = authorizationSnapshot?.blocked
    if (!authorizationSnapshot && service) {
      const {data,error}=await service.from('saas_identity_controls').select('blocked').eq('user_id',user.id).maybeSingle()
      if(error)return NextResponse.json({error:'Account access verification is unavailable.'},{status:503})
      blocked=data?.blocked
    }
    if(blocked)return NextResponse.json({error:'Your account access is restricted. Contact platform support.',code:'IDENTITY_RESTRICTED'},{status:403})
  }
  // Management APIs use the service-role database client, so they must never
  // be reachable anonymously. Provider callbacks and widget APIs authenticate
  // themselves or are intentionally public and rate-limited.
  if (
    pathname.startsWith('/api/') &&
    request.method !== 'OPTIONS' &&
    !isPublicApi &&
    !user
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Enforce tenant ownership before service-role API handlers run. Existing
  // platform administrators retain cross-tenant access; newly provisioned
  // tenant owners are restricted to resources belonging to their client ID.
  if (pathname.startsWith('/api/') && !isPublicApi && user) {
    if (!service) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const fallbackStaff = authorizationSnapshot ? null : (await service.from('platform_staff_memberships').select('role_key,status,require_mfa').eq('user_id', user.id).maybeSingle()).data
    const staff = authorizationSnapshot?.staff || fallbackStaff
    const isPlatformAdmin = staff?.status === 'active'
    if (pathname.startsWith('/api/admin/')) {
      if (!isPlatformAdmin) return NextResponse.json({error:'Platform staff access required'},{status:403})
      // trustedClaims came from getClaims(), so its AAL is signature, issuer,
      // audience and expiry verified. Do not call the MFA helper without a JWT:
      // its cookie fallback reads getSession().user and emits an insecurity warning.
      if (staff.require_mfa && trustedClaims?.aal !== 'aal2') return NextResponse.json({error:'Authenticator verification required',code:'MFA_REQUIRED'},{status:403})
    }

    if (!pathname.startsWith('/api/admin/') && !pathname.startsWith('/api/auth/') && !pathname.startsWith('/api/workspaces/')) {
      const deny = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      const url = request.nextUrl
      const body = requestBody

      const requestedClientId =
        url.searchParams.get('client_id') || url.searchParams.get('clientId') ||
        body.client_id || body.clientId
      const workspaceId = requestedClientId || request.headers.get('x-workspace-id') || request.cookies.get('vittain_workspace')?.value || user.id
      const memberResult = authorizationSnapshot && authorizationSnapshot.workspace_id === workspaceId
        ? { data: authorizationSnapshot.membership, error: null }
        : await service.from('workspace_memberships').select('*').eq('client_id',workspaceId).eq('user_id',user.id).maybeSingle()
      const {data:member,error:memberError} = memberResult
      // Fail closed when control storage is unavailable; never fall back to a legacy admin role.
      if (memberError) return NextResponse.json({error:'Account controls are unavailable. Apply migration 067.',code:'STORAGE_UNAVAILABLE'},{status:503})
      if (!member || member.status !== 'active') return deny()
      const parts=pathname.split('/').filter(Boolean),area=parts[1],kind=parts[2]
      const isMutation = !['GET','HEAD','OPTIONS'].includes(request.method)
      const permissionArea = area==='features'
        ? ({bookings:'bookings',slots:'bookings',notifications:'bookings',services:'services',offers:'offers',analytics:'booking_analytics',summary:'bookings'} as Record<string,string>)[kind]||'bookings'
        : area==='commerce'
          ? ({products:'products',orders:'orders',inventory:'inventory',hold:'inventory'} as Record<string,string>)[kind]||'orders'
          : area==='storefront'
            ? (isMutation?'settings':'overview')
            : ({email:'campaigns',segments:'contacts',datasets:'knowledge',databases:'sources',integrations:'settings',client:'settings','agent-actions':'campaigns',channels:'bots',events:'analytics'} as Record<string,string>)[area] || area
      if (!memberCan(member.role_key,permissionArea,isMutation,member.permissions)) return deny()
      const entitlementResult = authorizationSnapshot && authorizationSnapshot.workspace_id === workspaceId && authorizationSnapshot.entitlements
        ? { data: authorizationSnapshot.entitlements, error: null }
        : await service.rpc('saas_entitlements',{p_client:workspaceId})
      const {data:entitlement,error:entitlementError}=entitlementResult
      if(entitlementError || !entitlement)return NextResponse.json({error:'Workspace access could not be verified.'},{status:503})
      if ((entitlement.restriction_stage === 'stopped' || (!entitlement.restriction_stage && entitlement.operational_state === 'suspended')) && permissionArea !== 'billing') {
        return NextResponse.json({error:'Workspace services are paused. Contact platform support.',code:'WORKSPACE_SERVICES_PAUSED'},{status:403})
      }
      if (isMutation && permissionArea !== 'billing') {
        const legacyAllowed = entitlement.operational_state === 'active' && ['active','trialing','past_due_grace'].includes(entitlement.access_state)
        const writeAllowed = permissionArea === 'inbox'
          ? (typeof entitlement.human_support_allowed === 'boolean' ? entitlement.human_support_allowed : legacyAllowed)
          : (typeof entitlement.dashboard_write_allowed === 'boolean' ? entitlement.dashboard_write_allowed : legacyAllowed)
        if (!writeAllowed) return NextResponse.json({error:permissionArea==='inbox'?'Human replies are paused for this workspace.':'This workspace is read-only during its account transition.',code:'WORKSPACE_READ_ONLY'},{status:403})
      }
      const feature = pathname.includes('/analytics') ? 'analytics.enabled' :
        ({campaigns:'campaigns.enabled','agent-actions':'campaigns.enabled'} as Record<string,string>)[area]
      if (feature) {
        if(entitlement.features?.[feature]!==true)return NextResponse.json({error:'This feature is not available on your current workspace plan.',code:'PLAN_FEATURE_UNAVAILABLE'},{status:403})
      }

      const checks: Array<{ table: string; id: string; column: string }> = []
      const addCheck = (table: string, id: unknown, column = 'client_id') => {
        if (typeof id === 'string' && id && !id.startsWith('mock-')) checks.push({ table, id, column })
      }

      addCheck('bots', url.searchParams.get('bot_id') || body.bot_id || body.botId)
      addCheck('datasets', url.searchParams.get('dataset_id') || body.dataset_id)
      addCheck('data_sources', url.searchParams.get('database_id') || body.database_id || body.data_source_id)
      addCheck('campaigns',url.searchParams.get('campaign_id') || body.campaign_id)
      addCheck('contacts',url.searchParams.get('contact_id') || body.contact_id)
      addCheck('booking_services',url.searchParams.get('service_id') || body.service_id)

      const contextId = url.searchParams.get('context_id') || body.context_id
      if (contextId && contextId !== workspaceId) {
        const { data: owner } = await service.from('clients').select('id').eq('context_id', contextId).maybeSingle()
        if (!owner || owner.id !== workspaceId) return deny()
      }

      const segments = pathname.split('/').filter(Boolean)
      const root = segments[1]
      const resourceId = segments[2]
      const rootTables: Record<string,string> = { bots:'bots',datasets:'datasets',databases:'data_sources',contacts:'contacts',campaigns:'campaigns',tickets:'tickets',integrations:'channel_integrations' }
      if (rootTables[root]) addCheck(rootTables[root],url.searchParams.get('id') || body.id)
      for (const id of Array.isArray(body.knowledgeBases) ? body.knowledgeBases : []) addCheck('datasets',id)
      for (const id of Array.isArray(body.databases) ? body.databases : []) addCheck('data_sources',id)
      addCheck('channel_integrations',body.channelAccount)
      if (resourceId && resourceId !== 'triggers' && resourceId !== 'emails' && resourceId !== 'create-inbox') {
        if (root === 'bots') addCheck('bots', resourceId)
        if (root === 'datasets') addCheck('datasets', resourceId)
        if (root === 'databases') addCheck('data_sources', resourceId)
        if (root === 'contacts') addCheck('contacts', resourceId)
        if (root === 'campaigns') addCheck('campaigns', resourceId)
        if (root === 'agent-actions') addCheck('agent_actions', resourceId)
        if (root === 'inbox') addCheck('sessions', resourceId)
        if (root === 'tickets' && !['analytics', 'promote'].includes(resourceId)) addCheck('tickets', resourceId)
      }

      for (const check of checks) {
        let ownershipQuery = service.from(check.table).select(check.column)
        if (check.table === 'sessions' && !/^[0-9a-f-]{36}$/i.test(check.id)) ownershipQuery = ownershipQuery.eq('session_id',check.id)
        else ownershipQuery = ownershipQuery.eq('id',check.id)
        const { data: owned } = await ownershipQuery.maybeSingle()
        if (!owned || owned[check.column] !== workspaceId) return deny()
      }

      // Listing or mutating the platform client registry is platform-admin only.
      if (pathname === '/api/clients' && (request.method !== 'GET' || url.searchParams.get('id') !== workspaceId)) return deny()
    }
  }

  // Protect /admin routes — redirect to login if not authenticated
  const isProtectedPage =
    pathname.startsWith('/master-admin') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/overview') ||
    pathname.startsWith('/features') ||
    pathname.startsWith('/bots') ||
    pathname.startsWith('/analytics') ||
    pathname.startsWith('/api-keys') ||
    pathname.startsWith('/campaigns') ||
    pathname.startsWith('/contacts') ||
    pathname.startsWith('/databases') ||
    pathname.startsWith('/inbox') ||
    pathname.startsWith('/knowledge') ||
    pathname.startsWith('/notepad') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/templates') ||
    pathname.startsWith('/tickets') ||
    pathname.startsWith('/webhooks') ||
    pathname.startsWith('/waitlist') ||
    pathname.startsWith('/suspended')

  if (isProtectedPage && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    return NextResponse.redirect(url)
  }

  if (user && authorizationSnapshot && !authorizationSnapshot.staff) {
    const state = authorizationSnapshot.onboarding
    if (state !== 'approved' && state !== 'waitlisted') {
      if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) return NextResponse.json({ error: 'Account access is not active.', code: 'ONBOARDING_RESTRICTED' }, { status: 403 })
      if (isProtectedPage && pathname !== '/suspended') { const url=request.nextUrl.clone();url.pathname='/suspended';url.search='';return NextResponse.redirect(url) }
    }
    if (state === 'waitlisted') {
      const allowedApi = pathname.startsWith('/api/auth/') || pathname === '/api/workspaces/team'
      if (pathname.startsWith('/api/') && !allowedApi) return NextResponse.json({ error: 'Workspace approval is pending.', code: 'WAITLISTED' }, { status: 403 })
      if (isProtectedPage && !['/waitlist','/suspended'].includes(pathname)) { const url=request.nextUrl.clone();url.pathname='/waitlist';url.search='';return NextResponse.redirect(url) }
    }
  }

  if ((pathname.startsWith('/admin') || pathname.startsWith('/master-admin')) && user) {
    const staff = authorizationSnapshot?.staff || (service ? (await service.from('platform_staff_memberships').select('status').eq('user_id', user.id).maybeSingle()).data : null)
    if (staff?.status !== 'active') {
      const url = request.nextUrl.clone()
      url.pathname = '/overview'
      return NextResponse.redirect(url)
    }
  }

  // If logged in and visiting /auth/login or /auth/register, redirect to admin
  if (user && (pathname === '/auth/login' || pathname === '/auth/register')) {
    const url = request.nextUrl.clone()
    const staff=authorizationSnapshot?.staff || (service ? (await service.from('platform_staff_memberships').select('status').eq('user_id',user.id).maybeSingle()).data : null)
    url.pathname = staff?.status==='active'?'/master-admin':authorizationSnapshot?.onboarding==='approved'?'/overview':authorizationSnapshot?.onboarding==='waitlisted'?'/waitlist':'/suspended'
    url.search=''
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|widget.js|tracker.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
