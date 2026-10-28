/**
 * Shared Realtime channel name helpers.
 * Imported by BOTH backend broadcasters and frontend subscribers
 * so channel names can never drift out of sync.
 */
export function chatRoomChannel(sessionId: string): string {
  return `chat-room:${sessionId}`
}

export function storeInboxChannel(clientId: string): string {
  return `store-inbox:${clientId}`
}
