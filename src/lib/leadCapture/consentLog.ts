import { supabase } from '@/lib/supabase'

export interface LogConsentParams {
  contactId: string
  channel: 'web' | 'whatsapp' | 'email' | 'sms'
  optedIn: boolean
  source: 'widget_form' | 'message_extraction' | 'triggered_prompt' | 'whatsapp' | 'csv_import' | 'manual'
  promptShown?: string
  sessionId?: string
}

/**
 * Records a verifiable consent audit log entry for GDPR/CCPA/DPDP compliance
 * and synchronizes the opt-in flag on the contacts record.
 */
export async function logConsent(params: LogConsentParams): Promise<void> {
  const { contactId, channel, optedIn, source, promptShown, sessionId } = params

  try {
    // 1. Record immutable audit log
    await supabase.from('consent_log').insert({
      contact_id: contactId,
      channel,
      opted_in: optedIn,
      source,
      prompt_shown: promptShown || null,
      session_id: sessionId || null,
    })

    // 2. Synchronize boolean flag on contacts
    const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() }
    if (channel === 'email') updatePayload.opt_in_email = optedIn
    if (channel === 'whatsapp') updatePayload.opt_in_whatsapp = optedIn
    if (channel === 'web') updatePayload.opt_in_web = optedIn
    if (channel === 'sms') updatePayload.opt_in_sms = optedIn

    await supabase.from('contacts').update(updatePayload).eq('id', contactId)
  } catch (err) {
    console.error('[logConsent error]:', err)
  }
}
