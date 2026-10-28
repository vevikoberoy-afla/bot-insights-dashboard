'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import {getVerifiedAccessToken} from '@/lib/client/verifiedAuth'
import { useCachedFetch, useInvalidate } from '@/lib/cache'

interface ApiKey {
  id: string
  name: string
  prefix: string
  created_at: string
  last_used_at: string | null
}

export default function SettingsPage() {
  const router = useRouter()
  const supabase = createClient()
  const [token, setToken] = useState('')
  const [newKeyName, setNewKeyName] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generatedKey, setGeneratedKey] = useState('')
  const [toast, setToast] = useState('')
  const { invalidate } = useInvalidate()

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  const fetcherKeys = useCallback(async () => {
    const accessToken=await getVerifiedAccessToken(supabase)
    if (!accessToken) { router.push('/auth/login'); return [] }
    setToken(accessToken)
    const res = await fetch('/api/settings/keys', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    if (!res.ok) return []
    const data = await res.json()
    return data.keys || []
  }, [supabase, router])

  const { data: keys = [], loading, refresh: refreshKeys } = useCachedFetch('keys', fetcherKeys)

  async function handleGenerateKey() {
    if (!newKeyName.trim()) return
    setGenerating(true)
    setGeneratedKey('')
    try {
      const res = await fetch('/api/settings/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: newKeyName.trim() })
      })
      if (!res.ok) throw new Error('Failed to generate key')
      const data = await res.json()
      setGeneratedKey(data.key) // Only shown once!
      setNewKeyName('')
      invalidate('keys')
      refreshKeys()
    } catch (err) {
      showToast('Error generating key')
    }
    setGenerating(false)
  }

  async function handleRevokeKey(id: string) {
    if (!confirm('Are you sure you want to revoke this API key? Any applications using it will instantly fail.')) return
    try {
      const res = await fetch(`/api/settings/keys?id=${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to revoke')
      showToast('API Key revoked')
      invalidate('keys')
      refreshKeys()
    } catch (err) {
      showToast('Error revoking key')
    }
  }

  if (loading) {
    return <div className="min-h-[60vh] flex items-center justify-center text-[var(--text-tertiary)]">Loading settings...</div>
  }

  return (
    <div className="space-y-8 animate-fade-in max-w-4xl">
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-surface border border-surface-border rounded-xl px-4 py-3 text-sm text-ink shadow-2xl">
          ✓ {toast}
        </div>
      )}

      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Settings & Security</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Manage organization-level configurations and API keys.</p>
      </div>

      <div className="glass border border-[var(--border-subtle)] rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-[var(--border-subtle)]">
          <h2 className="text-base font-semibold text-ink flex items-center gap-2">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
            API Keys
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1 mb-6">
            Generate secure API keys to integrate your AI chatbot with custom backends, CRM systems, or internal tools. 
            <strong> Keep these keys secret.</strong>
          </p>

          <div className="flex gap-3">
            <input 
              value={newKeyName} 
              onChange={e => setNewKeyName(e.target.value)} 
              placeholder="e.g. Production CRM Server"
              className="flex-1 bg-surface-tertiary border border-[var(--border-subtle)] rounded-xl px-4 py-2 text-sm text-ink focus:outline-none focus:border-brand/40" 
            />
            <button 
              onClick={handleGenerateKey} 
              disabled={generating || !newKeyName.trim()}
              className="bg-brand hover:bg-brand/90 disabled:opacity-50 text-ink font-medium px-6 py-2 rounded-xl text-sm transition-colors"
            >
              {generating ? 'Generating...' : 'Create new key'}
            </button>
          </div>
        </div>

        {generatedKey && (
          <div className="p-6 bg-emerald-500/10 border-b border-emerald-500/20">
            <p className="text-sm font-medium text-emerald-400 mb-2">Key generated successfully! Copy it now, you won't be able to see it again.</p>
            <div className="flex gap-2">
              <input 
                readOnly 
                value={generatedKey} 
                className="flex-1 bg-surface-muted border border-emerald-500/30 rounded-lg px-4 py-2.5 text-sm text-emerald-300 font-mono focus:outline-none" 
              />
              <button 
                onClick={() => { navigator.clipboard.writeText(generatedKey); showToast('Copied to clipboard') }}
                className="bg-surface-subtle hover:bg-white/20 text-ink px-4 py-2.5 rounded-lg text-sm transition-colors"
              >
                Copy
              </button>
            </div>
          </div>
        )}

        <div className="divide-y divide-[var(--border-subtle)]">
          {keys.length === 0 ? (
            <div className="p-8 text-center text-sm text-[var(--text-tertiary)]">No API keys generated yet.</div>
          ) : (
            keys.map((k: any) => (
              <div key={k.id} className="p-5 flex items-center justify-between hover:bg-surface-hover/30 transition-colors">
                <div>
                  <p className="font-medium text-ink text-sm">{k.name}</p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-tertiary)] font-mono">
                    <span className="bg-surface-tertiary px-2 py-0.5 rounded border border-[var(--border-subtle)]">{k.prefix}...</span>
                    <span>Created: {new Date(k.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <button 
                  onClick={() => handleRevokeKey(k.id)}
                  className="text-xs text-red-400/70 hover:text-red-400 hover:bg-red-400/10 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Revoke
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
