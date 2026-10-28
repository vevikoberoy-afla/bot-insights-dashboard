'use client'

import { createClient } from '@/lib/supabase-browser'
import { chatRoomChannel } from '@/lib/realtime/channels'

type MessageListener = (message: any) => void
type StatusListener = (status: string) => void

interface ChatRoomEntry {
  sessionId: string
  channel: any | null
  listeners: Set<MessageListener>
  statusListeners: Set<StatusListener>
  cleanupTimer: ReturnType<typeof setTimeout> | null
  starting: boolean
  removing: boolean
  lastStatus: string | null
}

const GLOBAL_KEY = '__rag_widget_chat_room_subscriptions__'

function roomEntries(): Map<string, ChatRoomEntry> {
  const scope = globalThis as typeof globalThis & {
    [GLOBAL_KEY]?: Map<string, ChatRoomEntry>
  }
  if (!scope[GLOBAL_KEY]) scope[GLOBAL_KEY] = new Map()
  return scope[GLOBAL_KEY]
}

function publish(entry: ChatRoomEntry, message: any) {
  if (!message) return
  entry.listeners.forEach((listener) => {
    try {
      listener(message)
    } catch (error) {
      console.warn('[chat realtime] message listener failed:', error)
    }
  })
}

function publishStatus(entry: ChatRoomEntry, status: string) {
  entry.lastStatus = status
  entry.statusListeners.forEach((listener) => listener(status))
}

async function startEntry(entry: ChatRoomEntry) {
  if (entry.starting || entry.removing || entry.channel || entry.listeners.size === 0) return
  entry.starting = true

  try {
    const supabase = createClient()
    const name = chatRoomChannel(entry.sessionId)

    // A channel can survive a development hot reload while this module's state is
    // recreated. Remove that orphan before registering postgres callbacks; Supabase
    // forbids adding them to an already-subscribed channel.
    const orphan = supabase
      .getChannels()
      .find((candidate: any) => candidate.topic === `realtime:${name}`)
    if (orphan) await supabase.removeChannel(orphan)

    if (entry.listeners.size === 0 || roomEntries().get(entry.sessionId) !== entry) return

    const seenMessageKeys = new Set<string>()
    const safePublish = (payload: any) => {
      if (!payload) return
      const identity = String(payload.metadata?.client_id || payload.id || '')
      if (identity) {
        if (seenMessageKeys.has(identity)) return
        seenMessageKeys.add(identity)
        if (seenMessageKeys.size > 200) {
          const first = seenMessageKeys.values().next().value
          if (first) seenMessageKeys.delete(first)
        }
      }
      publish(entry, payload)
    }

    entry.channel = supabase
      .channel(name)
      .on('broadcast', { event: 'new_message' }, ({ payload }: any) => {
        safePublish(payload)
      })
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `session_id=eq.${entry.sessionId}`,
        },
        (payload: any) => safePublish(payload?.new)
      )
      .subscribe((status: string) => publishStatus(entry, status))
  } catch (error) {
    console.warn('[chat realtime] subscription unavailable:', error)
    publishStatus(entry, 'CHANNEL_ERROR')
  } finally {
    entry.starting = false
  }
}

/**
 * Shares one Supabase channel between every widget/inbox consumer of a session.
 * All postgres callbacks are registered before subscribe() is called.
 */
export function subscribeChatRoom(
  sessionId: string,
  onMessage: MessageListener,
  onStatus?: StatusListener
) {
  const entries = roomEntries()
  let entry = entries.get(sessionId)

  if (!entry) {
    entry = {
      sessionId,
      channel: null,
      listeners: new Set(),
      statusListeners: new Set(),
      cleanupTimer: null,
      starting: false,
      removing: false,
      lastStatus: null,
    }
    entries.set(sessionId, entry)
  }

  if (entry.cleanupTimer) {
    clearTimeout(entry.cleanupTimer)
    entry.cleanupTimer = null
  }
  entry.listeners.add(onMessage)
  if (onStatus) {
    entry.statusListeners.add(onStatus)
    if (entry.lastStatus) queueMicrotask(() => {
      if (entry!.statusListeners.has(onStatus)) onStatus(entry!.lastStatus!)
    })
  }
  void startEntry(entry)

  let active = true
  return () => {
    if (!active) return
    active = false
    entry!.listeners.delete(onMessage)
    if (onStatus) entry!.statusListeners.delete(onStatus)
    if (entry!.listeners.size > 0 || entry!.cleanupTimer) return

    // The short grace period absorbs React Strict Mode and rapid view switches.
    entry!.cleanupTimer = setTimeout(async () => {
      entry!.cleanupTimer = null
      if (entry!.listeners.size > 0 || entry!.removing) return
      entry!.removing = true
      try {
        if (entry!.channel) await createClient().removeChannel(entry!.channel)
      } finally {
        entry!.channel = null
        entry!.removing = false
        if (entry!.listeners.size > 0) {
          void startEntry(entry!)
        } else if (entries.get(sessionId) === entry) {
          entries.delete(sessionId)
        }
      }
    }, 500)
  }
}
