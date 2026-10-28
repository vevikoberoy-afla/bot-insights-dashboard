import { upsertCustomerContact } from '@/lib/customerContacts'

export interface StitchParams {
  contactId?: string | null
  incomingEmail?: string
  incomingPhone?: string
  incomingName?: string
  incomingCompany?: string
  incomingRole?: string
  customProperties?: Record<string, any>
  source: 'widget_form' | 'message_extraction' | 'triggered_prompt' | 'whatsapp' | 'csv_import'
  sessionId?: string
  clientId?: string
}

export interface StitchResult {
  merged: boolean
  contactId: string
}

/**
 * Compatibility entry point for passive lead capture. All deterministic and
 * AI-assisted capture now share the same current contacts schema and session
 * linking implementation.
 */
export async function stitchContact(params: StitchParams): Promise<StitchResult> {
  if (!params.clientId) return { merged: false, contactId: params.contactId || '' }
  try {
    const contact = await upsertCustomerContact({
      clientId: params.clientId,
      contactId: params.contactId,
      sessionId: params.sessionId,
      name: params.incomingName,
      email: params.incomingEmail,
      phone: params.incomingPhone,
      channel: params.source === 'whatsapp' ? 'whatsapp' : 'web',
      source: params.source === 'csv_import' ? 'csv_import' : params.source,
      customFields: {
        ...(params.incomingCompany ? { company: params.incomingCompany } : {}),
        ...(params.incomingRole ? { role: params.incomingRole } : {}),
        ...(params.customProperties || {}),
      },
      allowAnonymous: true,
    })
    return { merged: false, contactId: contact.id }
  } catch (error) {
    console.error('[stitchContact exception]:', error)
    return { merged: false, contactId: params.contactId || '' }
  }
}
