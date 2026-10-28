'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import {getVerifiedAccessToken} from '@/lib/client/verifiedAuth'
import { useCachedFetch, useInvalidate } from '@/lib/cache'

interface Webhook {
  id: string
  context_id: string
  url: string
  events: string[]
  is_active: boolean
  last_triggered_at: string | null
  created_at: string
}

interface ClientInfo {
  name: string
  context_id: string
}

export default function WebhooksPage() {
  const router = useRouter()
  const supabase = createClient()
  const [token, setToken] = useState('')

  const [toast, setToast] = useState('')
  const { invalidate } = useInvalidate()

  // Form State
  const [newUrl, setNewUrl] = useState('')
  const [selectedContextId, setSelectedContextId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const fetcherData = useCallback(async () => {
    const accessToken=await getVerifiedAccessToken(supabase)
    if (!accessToken) { router.push('/auth/login'); return { webhooks: [], clients: [] } }
    setToken(accessToken)
    
    const [resW, resC] = await Promise.all([
      fetch('/api/settings/webhooks', { headers: { 'Authorization': `Bearer ${accessToken}` } }),
      fetch('/api/clients', { headers: { 'Authorization': `Bearer ${accessToken}` } })
    ])
    
    const dataW = resW.ok ? await resW.json() : { webhooks: [] }
    const dataC = resC.ok ? await resC.json() : { clients: [] }
    
    if (dataC.clients?.length > 0 && !selectedContextId) {
      setSelectedContextId(dataC.clients[0].context_id)
    }
    
    return {
      webhooks: dataW.webhooks || [],
      clients: dataC.clients || []
    }
  }, [supabase, router, selectedContextId])

  const { data = { webhooks: [], clients: [] }, loading, refresh: refreshData } = useCachedFetch('webhooks', fetcherData)
  const { webhooks, clients } = data

  async function handleAddWebhook() {
    if (!newUrl.trim() || !selectedContextId) return
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/settings/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ url: newUrl.trim(), context_id: selectedContextId })
      })
      if (!res.ok) throw new Error('Failed to create webhook')
      setNewUrl('')
      showToast('Webhook added successfully')
      invalidate('webhooks')
      refreshData()
    } catch (err) {
      showToast('Error adding webhook')
    }
    setIsSubmitting(false)
  }

  async function handleDeleteWebhook(id: string) {
    if (!confirm('Delete this webhook?')) return
    try {
      const res = await fetch(`/api/settings/webhooks?id=${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to delete')
      showToast('Webhook deleted')
      invalidate('webhooks')
      refreshData()
    } catch (err) {
      showToast('Error deleting webhook')
    }
  }

  function getClientName(ctx: string) {
    const c = clients.find((c: any) => c.context_id === ctx)
    return c ? c.name : 'Unknown Client'
  }

  if (loading) return <div className="min-h-[60vh] flex items-center justify-center text-[var(--text-tertiary)]">Loading webhooks...</div>

  return (
    <div className="space-y-8 animate-fade-in max-w-5xl">
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-[#1a1a1a] border border-white/10 rounded-xl px-4 py-3 text-sm text-white shadow-2xl">
          ✓ {toast}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-semibold text-white tracking-tight">Webhooks</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Send real-time chat events to external systems like Slack, Zapier, or your CRM.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Add New Webhook Form */}
        <div className="lg:col-span-1 space-y-4">
          <div className="glass border border-[var(--border-subtle)] rounded-2xl p-6">
            <h2 className="text-sm font-semibold text-white mb-4">Add Endpoint</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1.5">Target Client</label>
                <select 
                  value={selectedContextId} onChange={e => setSelectedContextId(e.target.value)}
                  className="w-full bg-surface-tertiary border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand/40"
                >
                  {clients.map((c: any) => (
                    <option key={c.context_id} value={c.context_id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-[var(--text-secondary)] mb-1.5">Payload URL</label>
                <input 
                  type="url"
                  placeholder="https://hooks.slack.com/..."
                  value={newUrl} onChange={e => setNewUrl(e.target.value)}
                  className="w-full bg-surface-tertiary border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-brand/40"
                />
              </div>

              <div className="bg-brand/5 border border-brand/10 rounded-xl p-3">
                <p className="text-[10px] text-brand/80 font-medium mb-1">Subscribed Events:</p>
                <div className="flex flex-wrap gap-1">
                  <span className="text-[10px] bg-brand/20 text-brand px-1.5 py-0.5 rounded">message.received</span>
                </div>
              </div>

              <button 
                onClick={handleAddWebhook}
                disabled={isSubmitting || !newUrl.trim()}
                className="w-full bg-brand hover:bg-brand/90 disabled:opacity-50 text-white font-medium px-4 py-2.5 rounded-xl text-sm transition-colors"
              >
                {isSubmitting ? 'Adding...' : 'Add Webhook'}
              </button>
            </div>
          </div>
        </div>

        {/* Active Webhooks List */}
        <div className="lg:col-span-2 glass border border-[var(--border-subtle)] rounded-2xl overflow-hidden h-fit">
          <div className="p-4 border-b border-[var(--border-subtle)] bg-surface-tertiary/50">
            <h2 className="text-sm font-semibold text-white">Active Webhooks ({webhooks.length})</h2>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {webhooks.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--text-tertiary)]">No webhooks configured yet.</div>
            ) : (
              webhooks.map((w: any) => (
                <div key={w.id} className="p-5 flex items-start justify-between hover:bg-surface-hover/30 transition-colors">
                  <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400 mt-0.5 flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                    </div>
                    <div>
                      <p className="font-medium text-white text-sm">{getClientName(w.context_id)}</p>
                      <p className="text-xs text-[var(--text-tertiary)] font-mono mt-1 mb-2">{w.url}</p>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1.5 text-[10px] bg-[#1a1a1a] border border-white/10 px-2 py-0.5 rounded text-[var(--text-secondary)]">
                          <div className={`w-1.5 h-1.5 rounded-full ${w.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
                          {w.is_active ? 'Active' : 'Disabled'}
                        </span>
                        <span className="text-[10px] text-[var(--text-tertiary)]">
                          Last triggered: {w.last_triggered_at ? new Date(w.last_triggered_at).toLocaleString() : 'Never'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDeleteWebhook(w.id)}
                    className="text-xs text-red-400/70 hover:text-red-400 hover:bg-red-400/10 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Delete
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
