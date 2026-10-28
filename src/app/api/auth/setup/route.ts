import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get('authorization')?.replace(/^Bearer /, '')
    const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: { getAll: () => req.cookies.getAll(), setAll: () => {} },
      ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
    })
    const { data: { user } } = await auth.auth.getUser(token)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!user.email_confirmed_at) return NextResponse.json({ error: 'Verify your email before continuing.', code: 'EMAIL_VERIFICATION_REQUIRED' }, { status: 403 })
    const body = await req.json().catch(() => ({}))
    const company = String(body.company_name || body.name || '').trim().slice(0, 200)
    const { data: result, error } = await supabase.rpc('saas_bootstrap_identity', { p_actor: user.id })
    if (error) throw error
    if (company && result?.status === 'waitlisted') {
      const update = await supabase.from('saas_user_onboarding').update({ company_name: company, updated_at: new Date().toISOString() }).eq('user_id', user.id).eq('status', 'waitlisted')
      if (update.error) throw update.error
    }
    const response = NextResponse.json({ success: true, ...result })
    if (result?.workspace_id) response.cookies.set('vittain_workspace', result.workspace_id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 2592000 })
    return response
  } catch (error) {
    console.error('[/api/auth/setup]', error)
    return NextResponse.json({ error: 'Account onboarding is temporarily unavailable.' }, { status: 503 })
  }
}
