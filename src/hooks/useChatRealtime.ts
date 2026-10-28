'use client'

import { useEffect, useRef } from 'react'
import { fetchMessagesSince, ChatMessage } from '@/app/actions/chat'
import { subscribeChatRoom } from '@/lib/realtime/chatRoomSubscription'

export function useChatRealtime(
  sessionId: string | null | undefined,
  onMessages: (msgs: ChatMessage[]) => void
) {
  const lastSeenTsRef = useRef<string | null>(null)
  const lastSeenIdRef = useRef<string | null>(null)
  const seenOrderRef = useRef<string[]>([])
  const seenIdsRef = useRef<Set<string>>(new Set())
  const onMessagesRef = useRef(onMessages)
  onMessagesRef.current = onMessages

  useEffect(() => {
    if (!sessionId) return

    let isMounted = true
    let isReconciling = false
    let lastSubscribedReconcileTs = 0
    const accept = (msg: ChatMessage) => {
      const clientId = typeof msg.metadata?.client_id === 'string' ? msg.metadata.client_id : ''
      const identity = clientId || String(msg.id || '')
      if (!identity) return true
      if (seenIdsRef.current.has(identity)) return false
      seenIdsRef.current.add(identity)
      seenOrderRef.current.push(identity)
      if (seenOrderRef.current.length > 500) {
        const oldest = seenOrderRef.current.shift()
        if (oldest) seenIdsRef.current.delete(oldest)
      }
      return true
    }

    async function reconcile() {
      if (!sessionId || !isMounted || isReconciling) return
      isReconciling = true
      try {
        const missed = await fetchMessagesSince(
          sessionId,
          lastSeenTsRef.current,
          lastSeenIdRef.current
        )
        if (missed.length > 0 && isMounted) {
          const latest = missed[missed.length - 1]
          lastSeenTsRef.current = latest.created_at
          lastSeenIdRef.current = latest.id
          const unseen = missed.filter(accept)
          if (unseen.length) onMessagesRef.current(unseen)
        }
      } catch (err) {
        console.warn('[useChatRealtime] reconcile error:', err)
      } finally {
        isReconciling = false
      }
    }

    const unsubscribe = subscribeChatRoom(
      sessionId,
      (message) => {
        if (!message || !isMounted) return
        const msg = message as ChatMessage
        if (!accept(msg)) return
        if (msg.created_at) lastSeenTsRef.current = msg.created_at
        if (msg.id) lastSeenIdRef.current = msg.id
        onMessagesRef.current([msg])
      },
      (status) => {
        if (status === 'SUBSCRIBED') {
          // Backfill on (re)connect throttled to 5s to prevent flapping heartbeat syncs
          const now = Date.now()
          if (now - lastSubscribedReconcileTs >= 5000) {
            lastSubscribedReconcileTs = now
            reconcile()
          }
        }
      }
    )

    // Belt-and-suspenders: also reconcile on tab refocus and visibility change (debounced 300ms)
    let refocusTimer: ReturnType<typeof setTimeout> | null = null
    const onFocus = () => {
      if (typeof document !== 'undefined' && !document.hidden && isMounted) {
        if (refocusTimer) clearTimeout(refocusTimer)
        refocusTimer = setTimeout(() => {
          if (isMounted) reconcile()
        }, 300)
      }
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)

    return () => {
      isMounted = false
      if (refocusTimer) clearTimeout(refocusTimer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
      unsubscribe()
    }
  }, [sessionId])
}
