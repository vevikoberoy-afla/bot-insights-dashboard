export interface ChatwootContact {
  id: number
  name: string
  email?: string
  phone_number?: string
  created_at: string
  additional_attributes?: Record<string, unknown>
}

export interface ChatwootConversation {
  id: number
  status: 'open' | 'resolved' | 'pending' | 'snoozed'
  inbox_id: number
  contact: ChatwootContact
  messages?: ChatwootMessage[]
  created_at: string
  updated_at: string
}

export interface ChatwootMessage {
  id: number
  content: string
  message_type: 'incoming' | 'outgoing' | 'activity' | 'template'
  sender?: {
    id: number
    name: string
    type: 'agent' | 'contact' | 'bot'
  }
  created_at: string
  private?: boolean
}

export interface ChatwootInbox {
  id: number
  name: string
  channel_type: string
  webhook_url?: string
}

export interface ChatwootWebhookPayload {
  event: string
  id?: number
  content?: string
  message_type?: string
  conversation?: ChatwootConversation
  sender?: {
    id: number
    name: string
    type: string
  }
  account?: {
    id: number
    name: string
  }
}

export interface CreateContactParams {
  name: string
  phone_number?: string
  email?: string
  additional_attributes?: Record<string, unknown>
}

export interface CreateConversationParams {
  inbox_id: number
  contact_id: number
  status?: 'open' | 'pending'
  additional_attributes?: Record<string, unknown>
}
