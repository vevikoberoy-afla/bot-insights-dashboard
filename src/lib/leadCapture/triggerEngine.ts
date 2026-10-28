import { supabase } from '@/lib/supabase'
import { redis } from '@/lib/redis'

export interface TriggerEvaluationParams {
  clientId: string
  botId?: string | null
  contactId: string
  sessionId: string
  messageText: string
  messageCount?: number
  cartValue?: number
  isHandoffRequested?: boolean
  disabledFields?: {
    email?: boolean
    phone?: boolean
    name?: boolean
  }
}

export interface FiredTrigger {
  id: string
  name: string
  targetField: 'email' | 'phone' | 'name'
  prompt: string
  options: string[]
}

// Built-in standard out-of-the-box triggers when DB rules are unseeded
const DEFAULT_SYSTEM_TRIGGERS = [
  {
    id: 'default_pricing_intent',
    name: 'Pricing intent keyword',
    target_field: 'email' as const,
    condition_type: 'intent_keyword',
    condition_config: { keywords: ['price', 'pricing', 'cost', 'how much', 'quote', 'discount', 'rates', 'enterprise'] },
    prompt_template: "Happy to help with pricing! Want me to send the full breakdown to your email so you have it handy?",
    options: ["Sure, here's my email", "No thanks, just tell me here"],
    cooldown_minutes: 1440,
    max_asks_per_session: 1,
    priority: 10,
  },
  {
    id: 'default_handoff_prequal',
    name: 'Handoff contact capture',
    target_field: 'email' as const,
    condition_type: 'handoff_requested',
    condition_config: {},
    prompt_template: "I'll connect you with a team member! What's your email or WhatsApp number in case we get disconnected?",
    options: ["Here's my email", "I'll wait here"],
    cooldown_minutes: 720,
    max_asks_per_session: 1,
    priority: 20,
  },
  {
    id: 'default_message_count',
    name: '4th message engaged visitor',
    target_field: 'email' as const,
    condition_type: 'message_count_no_contact',
    condition_config: { message_count: 4 },
    prompt_template: "Enjoying the conversation? I can email you a summary of everything we discussed. What's your best email?",
    options: ["Sure, email me", "No thanks"],
    cooldown_minutes: 1440,
    max_asks_per_session: 1,
    priority: 50,
  },
]

/**
 * Evaluates trigger rules against conversation context and enforces fatigue policy.
 */
export async function evaluateTriggers(params: TriggerEvaluationParams): Promise<FiredTrigger | null> {
  const { clientId, botId, contactId, sessionId, messageText, messageCount = 1, cartValue = 0, isHandoffRequested = false } = params

  if (!contactId || !clientId) return null

  // 0. Skip immediately if the visitor has declined lead capture during this session
  if (sessionId) {
    const isDeclined = await redis.get<boolean>(`lead_declined:${sessionId}`).catch(() => null)
    if (isDeclined) return null
  }

  // 1. Fetch contact to inspect current data & fatigue timestamp
  const { data: contact } = await supabase
    .from('contacts')
    .select('id, name, email, phone, last_prompted_at')
    .eq('id', contactId)
    .maybeSingle()

  if (!contact) return null

  // Skip if contact already has both email and phone
  if (contact.email && contact.phone) return null

  // Check global fatigue cooldown (don't ask more than once every 10 minutes across any rule)
  if (contact.last_prompted_at) {
    const minSpacingMs = 10 * 60 * 1000
    const elapsed = Date.now() - new Date(contact.last_prompted_at).getTime()
    if (elapsed < minSpacingMs) {
      return null
    }
  }

  // 2. Fetch candidate rules from capture_triggers
  let query = supabase
    .from('capture_triggers')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .order('priority', { ascending: true })

  if (botId) {
    query = query.or(`bot_id.eq.${botId},bot_id.is.null`)
  }

  const { data: dbTriggers } = await query

  // Combine DB triggers with system defaults
  const candidates = (dbTriggers && dbTriggers.length > 0) ? dbTriggers : DEFAULT_SYSTEM_TRIGGERS

  const lowerMsg = messageText.toLowerCase()

  // 3. Evaluate each rule in priority order
  for (const trigger of candidates) {
    // Skip if field is explicitly disabled in bot configuration
    if (trigger.target_field === 'email' && params.disabledFields?.email) continue
    if (trigger.target_field === 'phone' && params.disabledFields?.phone) continue
    if (trigger.target_field === 'name' && params.disabledFields?.name) continue

    // Skip if target field is already captured
    if (trigger.target_field === 'email' && contact.email) continue
    if (trigger.target_field === 'phone' && contact.phone) continue
    if (trigger.target_field === 'name' && contact.name && !contact.name.startsWith('Web Visitor')) continue

    // Evaluate condition
    let matched = false
    const config = trigger.condition_config || {}

    if (trigger.condition_type === 'intent_keyword') {
      const keywords: string[] = config.keywords || []
      matched = keywords.some(kw => lowerMsg.includes(kw.toLowerCase()))
    } else if (trigger.condition_type === 'message_count_no_contact') {
      const targetCount = Number(config.message_count) || 4
      matched = messageCount >= targetCount
    } else if (trigger.condition_type === 'handoff_requested') {
      matched = isHandoffRequested || /\b(human|agent|person|representative|support|talk to someone)\b/i.test(lowerMsg)
    } else if (trigger.condition_type === 'cart_value_threshold') {
      const minValue = Number(config.min_value) || 100
      matched = cartValue >= minValue
    }

    if (!matched) continue

    // 4. Enforce fatigue policy against capture_prompts_log
    const cooldownMinutes = trigger.cooldown_minutes || 1440
    const cooldownCutoff = new Date(Date.now() - cooldownMinutes * 60 * 1000).toISOString()

    const { data: recentFire } = await supabase
      .from('capture_prompts_log')
      .select('id')
      .eq('contact_id', contactId)
      .eq('trigger_id', trigger.id)
      .gt('fired_at', cooldownCutoff)
      .limit(1)

    if (recentFire && recentFire.length > 0) continue

    // Check max asks in this session
    const maxAsks = trigger.max_asks_per_session || 1
    const { data: sessionFires } = await supabase
      .from('capture_prompts_log')
      .select('id')
      .eq('session_id', sessionId)
      .eq('trigger_id', trigger.id)

    if (sessionFires && sessionFires.length >= maxAsks) continue

    // Format prompt template (interpolation: {{name}}, etc.)
    const promptText = trigger.prompt_template.replace(/\{\{name\}\}/g, contact.name || 'there')
    const options = Array.isArray(trigger.options) ? trigger.options : ["Sure, here's my email", "No thanks"]

    return {
      id: trigger.id,
      name: trigger.name,
      targetField: trigger.target_field,
      prompt: promptText,
      options,
    }
  }

  return null
}

/**
 * Records that a trigger prompt was displayed to the user.
 */
export async function recordTriggerPrompt(params: {
  triggerId?: string
  contactId: string
  sessionId: string
  targetField: string
  promptText: string
}): Promise<void> {
  const { triggerId, contactId, sessionId, targetField, promptText } = params

  try {
    // If triggerId is a default string like 'default_pricing_intent', insert null trigger_id
    const isRealUUID = triggerId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(triggerId)

    await supabase.from('capture_prompts_log').insert({
      trigger_id: isRealUUID ? triggerId : null,
      contact_id: contactId,
      session_id: sessionId,
      target_field: targetField,
      prompt_text: promptText,
      outcome: 'pending',
    })

    await supabase
      .from('contacts')
      .update({
        last_prompted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', contactId)
  } catch (err) {
    console.error('[recordTriggerPrompt error]:', err)
  }
}

/**
 * Resolves a pending capture prompt when the user provides details or declines.
 */
export async function resolvePendingPrompts(
  contactId: string,
  sessionId: string,
  outcome: 'provided' | 'declined'
): Promise<void> {
  try {
    await supabase
      .from('capture_prompts_log')
      .update({
        outcome,
        resolved_at: new Date().toISOString(),
      })
      .eq('contact_id', contactId)
      .eq('session_id', sessionId)
      .eq('outcome', 'pending')
  } catch (err) {
    console.error('[resolvePendingPrompts error]:', err)
  }
}
