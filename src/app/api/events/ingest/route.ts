import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { normalizeCartEvent } from '@/lib/integrations/normalizer'
import { eventRateLimit, getIP } from '@/lib/ratelimit'
import { localRateLimit } from '@/lib/security/rateLimitFallback'
import { verifyWidgetSessionToken } from '@/lib/security/widgetSessionToken'

const ALLOWED_EVENTS = new Set(['page_url','idle_time','exit_intent','scroll_depth','checkout_started','widget_opened','product_viewed','cart_item_added','cart_updated','booking_slot_viewed','faq_clicked','proactive_callout_clicked','identify'])

export async function POST(req: NextRequest) {
  try {
    const rawToken = req.headers.get('x-widget-session-token')
    if (!rawToken) return NextResponse.json({ error: 'Signed session capability required.' }, { status: 401 })
    const claims = verifyWidgetSessionToken(rawToken)
    const remote = getIP(req)
    let allowed = false
    try {
      const result = await Promise.race([eventRateLimit.limit(`${claims.workspaceId}:${remote}`),new Promise<never>((_, reject) => setTimeout(() => reject(new Error('RATE_LIMIT_TIMEOUT')), 1500))])
      allowed = result.success
    } catch { allowed = localRateLimit(`events:${claims.workspaceId}:${remote}`, 20).success }
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    const body = await req.json()
    const eventType = String(body.event_type || '').trim()
    if (!ALLOWED_EVENTS.has(eventType)) return NextResponse.json({ error: 'Unsupported event type.' }, { status: 403 })
    const sessionId = String(body.session_id || '').slice(0, 160) || null
    if (claims.sessionId && sessionId !== claims.sessionId) return NextResponse.json({ error: 'Session capability mismatch.' }, { status: 401 })
    const eventData = body.event_data && typeof body.event_data === 'object' && !Array.isArray(body.event_data) ? body.event_data : {}
    if (Buffer.byteLength(JSON.stringify(eventData)) > 4096) return NextResponse.json({ error: 'Event metadata is too large.' }, { status: 413 })
    let contactId: string | null = null
    if (typeof body.contact_id === 'string' && body.contact_id) {
      const { data } = await supabase.from('contacts').select('id').eq('id', body.contact_id).eq('client_id', claims.workspaceId).maybeSingle()
      contactId = data?.id || null
    }
    if (eventType === 'cart_updated') {
      const result = await normalizeCartEvent({source:'custom_snippet',clientId:claims.workspaceId,contactId:contactId || undefined,sessionId:sessionId || undefined,externalCartId:String(eventData.cart_id || `cart_${Date.now()}`).slice(0,160),valueMinor:Math.max(0,Math.round(Number(eventData.value || 0)*100)),currency:String(eventData.currency || 'INR').slice(0,8),items:Array.isArray(eventData.items)?eventData.items.slice(0,50):[]})
      return NextResponse.json({success:true,matched_rules:result.matchedRules.map((rule:any)=>({id:rule.id,name:rule.name,actions:rule.actions,popup_style:rule.popup_style,delay_seconds:rule.delay_seconds,tone:rule.tone,cta_text:rule.cta_text,cta_url:rule.cta_url}))})
    }
    const { error } = await supabase.from('contact_events').insert({client_id:claims.workspaceId,contact_id:contactId,event_type:eventType,event_data:eventData,session_id:sessionId,page_url:typeof body.page_url==='string'?body.page_url.slice(0,2048):null,channel:claims.purpose==='tracker'?'web':'widget'})
    if (error) throw error
    return NextResponse.json({ success: true }, { status: 201 })
  } catch (error) {
    console.error('[events ingest] rejected', error)
    return NextResponse.json({ error: 'Invalid session capability or event payload.' }, { status: 401 })
  }
}
