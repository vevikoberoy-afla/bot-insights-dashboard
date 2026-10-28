import { supabase, broadcastRealtime } from '@/lib/supabase'
import { cacheMessagePayload } from '@/lib/redis/messageCache'
import { chatRoomChannel } from '@/lib/realtime/channels'

export interface NormalizedCartItem {
  productId: string
  name: string
  price: number
  quantity: number
}

export interface NormalizedCartEventInput {
  source: 'shopify' | 'woocommerce' | 'custom_snippet'
  clientId: string
  contactId?: string
  sessionId?: string
  externalCartId: string
  email?: string | null
  phone?: string | null
  valueMinor: number // paise/cents integer to prevent float drift
  currency: string
  items: NormalizedCartItem[]
}

export interface NormalizedCartResult {
  success: boolean
  contactId?: string
  cartValue: number
  matchedRules: any[]
  dispatchedUpsells: number
}

/**
 * Shared Cart Event Normalizer
 * Ingests cart events from both native platform webhooks (Shopify) and Universal JS snippet,
 * resolves contact identities, updates cart peak metrics, evaluates active trigger rules,
 * and pushes realtime upsell callouts into the webchat widget.
 */
export async function normalizeCartEvent(
  input: NormalizedCartEventInput
): Promise<NormalizedCartResult> {
  const {
    source,
    clientId,
    sessionId,
    externalCartId,
    email,
    phone,
    valueMinor,
    currency,
    items,
  } = input

  const cartValue = Number((valueMinor / 100).toFixed(2))
  let contactId = input.contactId

  // 1. Resolve or create contact
  if (!contactId && (email || phone)) {
    let query = supabase.from('contacts').select('id, cart_peak_value, name, email, phone').eq('client_id', clientId)
    if (email && phone) {
      query = query.or(`email.eq.${email},phone.eq.${phone}`)
    } else if (email) {
      query = query.eq('email', email)
    } else if (phone) {
      query = query.eq('phone', phone)
    }

    const { data: existingContact } = await query.maybeSingle()
    if (existingContact) {
      contactId = existingContact.id
    } else {
      // Create new contact
      const { data: newContact } = await supabase
        .from('contacts')
        .insert({
          client_id: clientId,
          email: email || null,
          phone: phone || null,
          source,
          last_cart_value: cartValue,
          cart_peak_value: cartValue,
        })
        .select('id')
        .maybeSingle()

      if (newContact) contactId = newContact.id
    }
  }

  // 2. Persist to contact_events
  await supabase.from('contact_events').insert({
    client_id: clientId,
    contact_id: contactId || null,
    event_type: 'cart_updated',
    event_data: {
      value: cartValue,
      currency,
      items,
      external_cart_id: externalCartId,
      source,
    },
    session_id: sessionId || null,
    channel: 'web',
  })

  // 3. Update contact's last cart value & peak cart value
  if (contactId) {
    const { data: currentContact } = await supabase
      .from('contacts')
      .select('cart_peak_value')
      .eq('id', contactId)
      .maybeSingle()

    const currentPeak = currentContact?.cart_peak_value || 0
    const newPeak = Math.max(currentPeak, cartValue)

    await supabase
      .from('contacts')
      .update({
        last_cart_value: cartValue,
        cart_peak_value: newPeak,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId)
  }

  // 4. Update store_integrations last_event_at
  if (source === 'shopify' || source === 'woocommerce') {
    await supabase
      .from('store_integrations')
      .update({ last_event_at: new Date().toISOString() })
      .eq('client_id', clientId)
      .eq('platform', source)
  }

  // 5. Evaluate active trigger rules
  const { data: rules } = await supabase
    .from('trigger_rules')
    .select('*')
    .eq('client_id', clientId)
    .eq('status', 'active')

  const matchedRules: any[] = []
  let dispatchedUpsells = 0

  if (rules && rules.length > 0) {
    for (const rule of rules) {
      // Strict channel gating: must include 'web_chat' if channels is defined
      const ruleChannels: string[] = Array.isArray(rule.channels) && rule.channels.length > 0
        ? rule.channels
        : ['web_chat']

      if (!ruleChannels.includes('web_chat')) {
        continue
      }

      // Check conditions
      const conditions = Array.isArray(rule.conditions) ? rule.conditions : []
      let conditionsMatch = false
      let calculatedMissingAmount: number | null = null

      for (const cond of conditions) {
        if (cond.event === 'cart_updated') {
          const val1 = parseFloat(cond.value) || 0
          const val2 = parseFloat(cond.value2) || 0

          if (cond.operator === '>=' && cartValue >= val1) {
            conditionsMatch = true
          } else if (cond.operator === '<=' && cartValue <= val1) {
            conditionsMatch = true
          } else if (cond.operator === 'between' && cartValue >= val1 && cartValue <= val2) {
            conditionsMatch = true
            const target = val2 >= val1 ? (val2 % 1 === 0 ? val2 + 1 : val2) : val1
            calculatedMissingAmount = Math.max(0, target - cartValue)
          }
        }
      }

      if (!conditionsMatch) continue

      matchedRules.push(rule)

      // Resolve message template
      const action = (rule.actions && rule.actions[0]) || {}
      const rawMessage = action.message || rule.message || ''
      const missingAmountDisplay = calculatedMissingAmount !== null
        ? calculatedMissingAmount.toString()
        : '0'

      const renderedMessage = rawMessage
        .replace(/\{\{missing_amount\}\}/g, missingAmountDisplay)
        .replace(/\{\{cart_value\}\}/g, cartValue.toString())
        .replace(/\{\{currency\}\}/g, currency)

      // 6. Find target chat session to push upsell
      let targetSessionId = sessionId
      if (!targetSessionId && contactId) {
        const { data: latestSession } = await supabase
          .from('sessions')
          .select('id, session_id')
          .eq('contact_id', contactId)
          .order('last_active_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (latestSession) {
          targetSessionId = latestSession.session_id || latestSession.id
        }
      }

      // 7. Dispatch Realtime Upsell Callout into session if session exists
      if (targetSessionId) {
        const popupStyle = rule.popup_style || action.message_type || 'callout'
        const delaySeconds = rule.delay_seconds ?? action.delay_seconds ?? 0
        const tone = rule.tone || 'casual'
        const autoDismissSeconds = rule.auto_dismiss_seconds || 0
        const ctaText = rule.cta_text || null
        const ctaUrl = rule.cta_url || null

        // Insert system message into messages table
        const { data: insertedMsg, error: insertError } = await supabase
          .from('messages')
          .insert({
            session_id: targetSessionId,
            role: 'system',
            content: renderedMessage,
            message_type: 'upsell_callout',
            channel: 'widget',
            metadata: {
              tone,
              ruleId: rule.id,
              ruleName: rule.name,
              popup_style: popupStyle,
              delay_seconds: delaySeconds,
              auto_dismiss_seconds: autoDismissSeconds,
              cta_text: ctaText,
              cta_url: ctaUrl,
              coupon_code: action.coupon_code || null,
              missing_amount: missingAmountDisplay,
            },
          })
          .select('id, session_id, role, content, message_type, metadata, created_at')
          .maybeSingle()

        if (!insertError && insertedMsg) {
          dispatchedUpsells++

          // Push to Supabase Realtime channel
          await broadcastRealtime(chatRoomChannel(targetSessionId), 'new_message', insertedMsg)

          // Update Redis sliding window buffer for instant sync read
          await cacheMessagePayload(targetSessionId, {
            id: insertedMsg.id,
            session_id: insertedMsg.session_id,
            role: insertedMsg.role,
            content: insertedMsg.content,
            mode: 'ai',
            created_at: insertedMsg.created_at,
          }).catch(() => {})

          // Increment rule fire count
          await supabase
            .from('trigger_rules')
            .update({ fire_count: (rule.fire_count || 0) + 1 })
            .eq('id', rule.id)
        }
      }
    }
  }

  return {
    success: true,
    contactId,
    cartValue,
    matchedRules,
    dispatchedUpsells,
  }
}
