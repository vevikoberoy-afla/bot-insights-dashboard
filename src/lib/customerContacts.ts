import { supabase } from '@/lib/supabase'
import { isUUID } from '@/lib/utils'
import {normalizeE164Phone} from '@/lib/phone'

export type CustomerContactSource =
  | 'booking_flow'
  | 'commerce_flow'
  | 'support_flow'
  | 'widget_form'
  | 'passive'
  | 'message_extraction'
  | 'triggered_prompt'
  | 'whatsapp'
  | 'telegram'
  | 'manual'
  | 'csv_import'

export type CustomerContactInput = {
  clientId: string
  contactId?: string | null
  botId?: string | null
  sessionId?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  channel?: string | null
  source: CustomerContactSource
  customFields?: Record<string, unknown>
  allowAnonymous?: boolean
  defaultCountry?: string
}

const cleanText = (value: unknown, max = 200) => String(value || '').trim().slice(0, max)
const normalizeEmail = (value: unknown) => cleanText(value, 320).toLowerCase()
const normalizePhone = (value: unknown,defaultCountry?:string) => {const e164=normalizeE164Phone(value,defaultCountry);return e164?`+${e164}`:''}
const phoneDigits = (value: unknown) => String(value || '').replace(/\D/g, '')
const isPlaceholderName = (value: unknown) => !cleanText(value) || /^(?:website|web) visitor|anonymous$/i.test(cleanText(value))

async function findSessionContact(input: CustomerContactInput) {
  if (!input.sessionId) return null
  let query = supabase
    .from('sessions')
    .select('id, contact_id')
    .eq('client_id', input.clientId)
  if (input.botId) query = query.eq('bot_id', input.botId)
  query = isUUID(input.sessionId)
    ? query.or(`id.eq.${input.sessionId},session_id.eq.${input.sessionId}`)
    : query.eq('session_id', input.sessionId)
  const { data, error } = await query.order('created_at', { ascending: false }).limit(1)
  if (error) throw new Error(`Unable to resolve customer session: ${error.message}`)
  return data?.[0] || null
}

async function findMatchingContact(clientId: string, email: string, phone: string) {
  if (email) {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('client_id', clientId)
      .ilike('email', email)
      .order('created_at', { ascending: true })
      .limit(1)
    if (error) throw new Error(`Unable to match customer email: ${error.message}`)
    if (data?.[0]) return data[0]
  }
  if (phone) {
    const digits = phoneDigits(phone)
    const exact=await supabase.from('contacts').select('*').eq('client_id',clientId).eq('phone_e164',digits).order('created_at',{ascending:true}).limit(1)
    if(!exact.error&&exact.data?.[0])return exact.data[0]
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('client_id', clientId)
      .not('phone', 'is', null)
      .order('created_at', { ascending: true })
      .limit(250)
    if (error) throw new Error(`Unable to match customer phone: ${error.message}`)
    const match = data?.find(row => {
      const candidate = phoneDigits(row.phone)
      return candidate === digits || (candidate.length >= 10 && digits.length >= 10 && candidate.slice(-10) === digits.slice(-10))
    })
    if (match) return match
  }
  return null
}

/**
 * Tenant-safe identity upsert used by every deterministic customer flow.
 * It deduplicates by session, email, then normalized phone and links the active
 * chat session to the canonical contact so the customer appears in Contacts.
 */
export async function upsertCustomerContact(input: CustomerContactInput) {
  const name = cleanText(input.name, 150)
  const email = normalizeEmail(input.email)
  const phone = normalizePhone(input.phone,input.defaultCountry),phoneE164=phoneDigits(phone)||null
  if (!input.clientId) throw new Error('Customer workspace is required')
  if (!input.allowAnonymous && !email && !phone) throw new Error('Enter an email address or phone number')

  const session = await findSessionContact(input)
  let current: any = null
  const preferredContactId = input.contactId || session?.contact_id
  if (preferredContactId) {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('client_id', input.clientId)
      .eq('id', preferredContactId)
      .maybeSingle()
    if (error) throw new Error(`Unable to load customer contact: ${error.message}`)
    current = data
  }
  const identityMatch = await findMatchingContact(input.clientId, email, phone)
  if (current && identityMatch && identityMatch.id !== current.id) {
    const canonical = new Date(identityMatch.created_at).getTime() <= new Date(current.created_at).getTime() ? identityMatch : current
    const stale = canonical.id === current.id ? identityMatch : current
    const { data: mergedId, error: mergeError } = await supabase.rpc('stitch_contacts_atomic', {
      p_canonical_id: canonical.id,
      p_stale_id: stale.id,
      p_incoming_email: email || null,
      p_incoming_phone: phone || null,
      p_session_id: input.sessionId || null,
      p_source: input.source,
    })
    if (!mergeError && mergedId) {
      const { data } = await supabase.from('contacts').select('*').eq('client_id', input.clientId).eq('id', mergedId).single()
      current = data || canonical
    } else {
      // Older installations may not have the merge RPC yet. Prefer the
      // matched identity and at least link this session without deleting data.
      current = identityMatch
    }
  } else if (!current) current = identityMatch

  const now = new Date().toISOString()
  const channel = cleanText(input.channel || 'web', 30).toLowerCase()
  const flowTag = input.source.endsWith('_flow') ? input.source.replace('_flow', '') : 'customer'
  const customFields = {
    ...(current?.custom_fields || {}),
    ...(input.customFields || {}),
    last_capture_source: input.source,
  }
  const tags = Array.from(new Set([...(current?.tags || []), 'customer', flowTag]))

  if (current) {
    const updates: Record<string, unknown> = {
      last_active_at: now,
      updated_at: now,
      capture_method: input.source,
      source_channel: current.source_channel || channel,
      source_bot_id: current.source_bot_id || input.botId || null,
      custom_fields: customFields,
      tags,
    }
    if (name && isPlaceholderName(current.name)) updates.name = name
    if (email && !current.email) updates.email = email
    if (phone && !current.phone) updates.phone = phone
    if (phoneE164 && !current.phone_e164) updates.phone_e164 = phoneE164
    const { data, error } = await supabase.from('contacts').update(updates).eq('client_id', input.clientId).eq('id', current.id).select('*').single()
    if (error) throw new Error(`Unable to update customer contact: ${error.message}`)
    current = data
  } else {
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        client_id: input.clientId,
        name: name || 'Website Visitor',
        email: email || null,
        phone: phone || null,
        phone_e164: phoneE164,
        source_channel: channel,
        source_bot_id: input.botId || null,
        tags,
        custom_fields: customFields,
        capture_method: input.source,
        opt_in_web: channel === 'web' || channel === 'widget',
        // Contact details used for a transaction are not marketing consent.
        // Explicit consent endpoints update these flags separately.
        opt_in_whatsapp: false,
        opt_in_email: false,
        opt_in_sms: false,
        conversation_count: session ? 1 : 0,
        last_active_at: now,
        updated_at: now,
      })
      .select('*')
      .single()
    if (error || !data) throw new Error(`Unable to save customer contact: ${error?.message || 'unknown error'}`)
    current = data
  }

  if (session && session.contact_id !== current.id) {
    const { error } = await supabase
      .from('sessions')
      .update({ contact_id: current.id })
      .eq('client_id', input.clientId)
      .eq('id', session.id)
    if (error) throw new Error(`Customer was saved but could not be linked to this chat: ${error.message}`)
  }
  return current
}
