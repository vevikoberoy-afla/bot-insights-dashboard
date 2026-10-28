import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { supabase } from '@/lib/supabase'
import { safeRedirect } from '@/lib/security/safeRedirect'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const requested = safeRedirect(request.nextUrl.searchParams.get('next'), '/overview')
  const response = NextResponse.redirect(new URL('/auth/login?error=oauth_callback_failed', request.url))
  if (!code) return response
  const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => request.cookies.getAll(), setAll: values => values.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) },
  })
  const { data, error } = await auth.auth.exchangeCodeForSession(code)
  if (error || !data.user?.email_confirmed_at) return response
  const { data: bootstrap, error: bootstrapError } = await supabase.rpc('saas_bootstrap_identity', { p_actor: data.user.id })
  if (bootstrapError) return response
  const destination = ['/master-admin', '/waitlist', '/suspended'].includes(bootstrap?.destination) ? bootstrap.destination : requested
  response.headers.set('location', new URL(destination, request.url).toString())
  if (bootstrap?.workspace_id) response.cookies.set('vittain_workspace', bootstrap.workspace_id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 2592000 })
  return response
}
