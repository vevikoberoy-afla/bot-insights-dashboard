/**
 * Chatwoot API Client
 * Connects to self-hosted Chatwoot instance on Oracle Cloud VM.
 * All calls are server-side only. Never import this in client components.
 */

import type {
  ChatwootContact,
  ChatwootConversation,
  ChatwootMessage,
  ChatwootInbox,
  CreateContactParams,
  CreateConversationParams,
} from '@/types/chatwoot'

const CHATWOOT_URL = process.env.NEXT_PUBLIC_CHATWOOT_URL || process.env.CHATWOOT_URL
const TOKEN = process.env.CHATWOOT_API_KEY || process.env.CHATWOOT_API_TOKEN
const ACCOUNT = process.env.CHATWOOT_ACCOUNT_ID || '1'

if (!CHATWOOT_URL || !TOKEN || !ACCOUNT) {
  console.warn('[Chatwoot] Missing env vars — integration disabled')
}

/** Base fetch wrapper with auth headers */
async function chatwootFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'api_access_token': TOKEN!,
      ...options.headers,
    },
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Chatwoot API error ${res.status}: ${error}`)
  }
  return res.json() as Promise<T>
}

/** Create a new inbox for a bot */
export async function createInbox(botName: string): Promise<ChatwootInbox> {
  return chatwootFetch<ChatwootInbox>('/inboxes', {
    method: 'POST',
    body: JSON.stringify({
      name: botName,
      channel: {
        type: 'api',
        webhook_url: `${process.env.NEXTAUTH_URL}/api/webhooks/chatwoot`,
      },
    }),
  })
}

/** Find or create a contact by phone number */
export async function findOrCreateContact(
  params: CreateContactParams
): Promise<ChatwootContact> {
  // Search first to avoid duplicates
  if (params.phone_number) {
    try {
      const search = await chatwootFetch<{ payload: ChatwootContact[] }>(
        `/contacts/search?q=${encodeURIComponent(params.phone_number)}&page=1`
      )
      if (search.payload && search.payload.length > 0) {
        return search.payload[0]
      }
    } catch {
      // Contact not found — create new one below
    }
  }
  return chatwootFetch<ChatwootContact>('/contacts', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

/** Create a new conversation linked to a contact and inbox */
export async function createConversation(
  params: CreateConversationParams
): Promise<ChatwootConversation> {
  return chatwootFetch<ChatwootConversation>('/conversations', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

/** Send a message to an existing conversation */
export async function sendMessage(
  conversationId: number,
  content: string,
  type: 'incoming' | 'outgoing',
  isPrivate = false
): Promise<ChatwootMessage> {
  return chatwootFetch<ChatwootMessage>(
    `/conversations/${conversationId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({
        content,
        message_type: type,
        private: isPrivate,
      }),
    }
  )
}

/** Toggle conversation status to open (triggers agent alert) */
export async function triggerHandoff(
  conversationId: number
): Promise<ChatwootConversation> {
  return chatwootFetch<ChatwootConversation>(
    `/conversations/${conversationId}/toggle_status`,
    {
      method: 'POST',
      body: JSON.stringify({ status: 'open' }),
    }
  )
}

/** Add a label to a conversation */
export async function addLabel(
  conversationId: number,
  label: string
): Promise<void> {
  await chatwootFetch(`/conversations/${conversationId}/labels`, {
    method: 'POST',
    body: JSON.stringify({ labels: [label] }),
  })
}

/** Get all messages for a conversation */
export async function getMessages(
  conversationId: number
): Promise<ChatwootMessage[]> {
  const res = await chatwootFetch<{ payload: ChatwootMessage[] }>(
    `/conversations/${conversationId}/messages`
  )
  return res.payload ?? []
}

/** Resolve a conversation when session ends */
export async function resolveConversation(
  conversationId: number
): Promise<void> {
  await chatwootFetch(`/conversations/${conversationId}/toggle_status`, {
    method: 'POST',
    body: JSON.stringify({ status: 'resolved' }),
  })
}
