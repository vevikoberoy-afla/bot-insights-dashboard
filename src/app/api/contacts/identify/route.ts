import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getCorsHeaders, handleOptions } from '@/lib/cors'
import { isUUID } from '@/lib/utils'

/**
 * POST /api/contacts/identify
 *
 * Called by the chat widget when a visitor submits their WhatsApp number
 * through the in-chat coupon unlock gate. Binds the phone to the contact
 * record linked to the current session and sets opt_in_whatsapp = true.
 *
 * Body:
 *   session_id    string  – widget session ID (nanoid or UUID)
 *   phone         string  – E.164 or local phone number (we normalise it)
 *   opt_in_whatsapp boolean – must be true; reflects user explicit consent
 *   client_id     string  – context ID or client UUID
 *
 * Returns:
 *   { success: true, contact_id: string }
 */
export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rawCtx = req.nextUrl.searchParams.get('ctx')?.trim() ?? ''
  const cors = await getCorsHeaders(rawCtx, origin)
  return handleOptions(cors)
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const rawCtx = req.nextUrl.searchParams.get('ctx')?.trim() ?? ''
  const cors = await getCorsHeaders(rawCtx, origin)

  try {
    const body = await req.json()
    const { session_id, phone, opt_in_whatsapp, client_id } = body

    // ── Basic validation ───────────────────────────────────────────────────
    if (!session_id || !phone) {
      return NextResponse.json(
        { error: 'session_id and phone are required' },
        { status: 400, headers: cors }
      )
    }

    // Phone must have at least 10 digits (strip all non-digits for check)
    const digitsOnly = phone.replace(/\D/g, '')
    if (digitsOnly.length < 10) {
      return NextResponse.json(
        { error: 'Please provide a valid phone number (at least 10 digits)' },
        { status: 422, headers: cors }
      )
    }

    // Normalise: if it doesn't start with '+' and has 10 digits, treat as
    // local; store as-is and let the operator normalise in the dashboard.
    const normalizedPhone = phone.startsWith('+') ? phone : `+${digitsOnly}`

    // ── Resolve the session → contact ──────────────────────────────────────
    let sessionQuery = supabase
      .from('sessions')
      .select('id, session_id, contact_id, client_id')

    if (isUUID(session_id)) {
      sessionQuery = sessionQuery.or(`id.eq.${session_id},session_id.eq.${session_id}`)
    } else {
      sessionQuery = sessionQuery.eq('session_id', session_id)
    }

    const { data: session } = await sessionQuery.maybeSingle()

    // Determine effective client_id (from session, or from request body)
    let effectiveClientId: string | null = session?.client_id || null

    if (!effectiveClientId && client_id) {
      // Try resolving from context_id token
      const { data: clientByCtx } = await supabase
        .from('clients')
        .select('id')
        .eq('context_id', client_id)
        .maybeSingle()

      effectiveClientId = clientByCtx?.id || (isUUID(client_id) ? client_id : null)
    }

    if (!effectiveClientId) {
      return NextResponse.json(
        { error: 'Could not resolve client — provide a valid client_id or session_id' },
        { status: 400, headers: cors }
      )
    }

    // ── Update or create the contact record ────────────────────────────────
    let contactId = session?.contact_id || null

    if (contactId) {
      // Contact already exists — just update phone + opt-in
      await supabase
        .from('contacts')
        .update({
          phone: normalizedPhone,
          opt_in_whatsapp: opt_in_whatsapp === true,
          last_active_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId)
    } else {
      // No contact yet — create one and link to session
      const { data: newContact } = await supabase
        .from('contacts')
        .insert({
          client_id: effectiveClientId,
          phone: normalizedPhone,
          opt_in_whatsapp: opt_in_whatsapp === true,
          source_channel: 'web',
          name: `Web Visitor`,
          last_active_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      contactId = newContact?.id || null

      // Link contact back to session
      if (contactId && session?.id) {
        await supabase
          .from('sessions')
          .update({ contact_id: contactId })
          .eq('id', session.id)
      }
    }

    if (!contactId) {
      return NextResponse.json(
        { error: 'Failed to save contact' },
        { status: 500, headers: cors }
      )
    }

    return NextResponse.json(
      { success: true, contact_id: contactId, phone: normalizedPhone },
      { headers: cors }
    )
  } catch (err: any) {
    console.error('[POST /api/contacts/identify]', err.message)
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500, headers: cors }
    )
  }
}
