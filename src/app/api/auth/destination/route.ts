import { NextResponse } from 'next/server'
import { identity, saasError, checked } from '@/lib/saas/context'
import { supabase } from '@/lib/supabase'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const { user } = await identity()
    const result = checked(await supabase.rpc('saas_bootstrap_identity', { p_actor: user.id }))
    const response = NextResponse.json({ destination: result?.destination || '/waitlist', status: result?.status })
    if (result?.workspace_id) response.cookies.set('vittain_workspace', result.workspace_id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 2592000 })
    return response
  } catch (error) { return saasError(error) }
}
