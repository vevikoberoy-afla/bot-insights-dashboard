import { NextRequest, NextResponse } from 'next/server'
import { identity, saasError, checked, SaaSError } from '@/lib/saas/context'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    const { user } = await identity()
    checked(await supabase.rpc('saas_bootstrap_identity', { p_actor: user.id }))
    return NextResponse.json({ onboarding: checked(await supabase.from('saas_user_onboarding').select('email,status,company_name,website_url,use_case,requested_seats,created_at,reviewed_at').eq('user_id', user.id).single()) })
  } catch (error) { return saasError(error) }
}
export async function PATCH(req: NextRequest) {
  try {
    const { user } = await identity(), body = await req.json()
    const company_name = String(body.company_name || '').trim(), website_url = String(body.website_url || '').trim(), use_case = String(body.use_case || '').trim(), requested_seats = Number(body.requested_seats)
    if (company_name.length < 2 || company_name.length > 200 || use_case.length > 2000 || !Number.isInteger(requested_seats) || requested_seats < 1 || requested_seats > 500) throw new SaaSError('INVALID_INPUT', 'Enter a company name and 1–500 requested seats.', 400)
    if (website_url) { try { const u = new URL(website_url); if (!['http:', 'https:'].includes(u.protocol)) throw new Error() } catch { throw new SaaSError('INVALID_INPUT', 'Enter a valid HTTP or HTTPS website.', 400) } }
    const result = checked(await supabase.from('saas_user_onboarding').update({ company_name, website_url: website_url || null, use_case: use_case || null, requested_seats, updated_at: new Date().toISOString() }).eq('user_id', user.id).eq('status', 'waitlisted').select('email,status,company_name,website_url,use_case,requested_seats,created_at').single())
    return NextResponse.json({ onboarding: result })
  } catch (error) { return saasError(error) }
}
