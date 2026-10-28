'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import {getVerifiedAccessToken} from '@/lib/client/verifiedAuth'
import { InboxView } from '@/components/InboxView'
import { useCachedFetch } from '@/lib/cache'

export default function ConversationsPage() {
  const supabase = createClient()
  const [activeClientId, setActiveClientId] = useState<string | null>(null)
  
  const fetcherClients = useCallback(async () => {
    const accessToken=await getVerifiedAccessToken(supabase)
    if (!accessToken) return []
    const res = await fetch('/api/clients', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.clients ?? []
  }, [supabase])
  
  const { data: clients = [] } = useCachedFetch('clients', fetcherClients)

  useEffect(() => {
    if (clients.length > 0 && !activeClientId) {
      setActiveClientId(clients[0].id)
    }
  }, [clients, activeClientId])

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-ink">Live Conversations & Intervention</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Monitor AI chats and intervene manually across all channels</p>
        </div>
        {clients.length > 1 && (
          <select
            value={activeClientId || ''}
            onChange={(e) => setActiveClientId(e.target.value)}
            className="px-3 py-2 bg-surface-tertiary border border-[var(--border-subtle)] rounded-lg text-sm text-ink focus:border-brand focus:outline-none"
          >
            {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {activeClientId ? (
        <InboxView clientId={activeClientId} />
      ) : (
        <div className="flex justify-center p-8">
          <div className="w-5 h-5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
        </div>
      )}
    </div>
  )
}
