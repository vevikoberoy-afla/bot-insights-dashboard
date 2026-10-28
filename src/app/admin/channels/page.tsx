'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import {getVerifiedAccessToken} from '@/lib/client/verifiedAuth'
import { useCachedFetch, useInvalidate } from '@/lib/cache'

const CHANNELS_DEF = [
  { id: 'web', name: 'Web Chat', icon: '💬', desc: 'Embeddable website widget', help: 'Built-in automatically. Go to API Keys to get your embed script.' },
  { id: 'whatsapp', name: 'WhatsApp Business', icon: '📱', desc: 'Meta Cloud API integration', help: 'Requires Meta App ID, Token, and Phone Number ID.' },
  { id: 'email', name: 'Email (SMTP)', icon: '📧', desc: 'Send & receive via SMTP/IMAP', help: 'Requires SMTP Host, Port, Username, and Password.' },
  { id: 'sms', name: 'SMS (Twilio)', icon: '📲', desc: 'Twilio programmable messaging', help: 'Requires Account SID, Auth Token, and Sender Number.' },
  { id: 'telegram', name: 'Telegram', icon: '✈️', desc: 'Telegram Bot API', help: 'Requires a Bot Token from BotFather.' },
]

interface ChannelDef {
  id: string
  name: string
  icon: string
  desc: string
  help: string
}

interface ChannelConfig {
  channel_type: string
  credentials: Record<string, string>
  is_active: boolean
}

interface ClientRecord {
  id: string
  name: string
}

export default function ChannelsPage() {
  const supabase = createClient()
  const [activeClientId, setActiveClientId] = useState<string | null>(null)
  const [activeChannelDef, setActiveChannelDef] = useState<ChannelDef | null>(null)
  const [credentials, setCredentials] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false)
  const { invalidate } = useInvalidate()

  // --- Cached clients list ---
  const fetcherClients = useCallback(async (): Promise<ClientRecord[]> => {
    const accessToken=await getVerifiedAccessToken(supabase)
    if (!accessToken) return []
    const res = await fetch('/api/clients', { headers: { 'Authorization': `Bearer ${accessToken}` } })
    if (!res.ok) return []
    const data = await res.json()
    return data.clients ?? []
  }, [supabase])
  const { data: clients = [] } = useCachedFetch<ClientRecord[]>('clients', fetcherClients)

  // Set first client once clients load
  useEffect(() => {
    if (clients.length > 0 && !activeClientId) setActiveClientId(clients[0].id)
  }, [clients])

  // --- Cached configs ---
  const fetcherConfigs = useCallback(async (): Promise<Record<string, ChannelConfig>> => {
    if (!activeClientId) return {}
    const res = await fetch(`/api/channels/config?client_id=${activeClientId}`)
    if (!res.ok) return {}
    const data: ChannelConfig[] = await res.json()
    const map: Record<string, ChannelConfig> = {}
    data.forEach((c: ChannelConfig) => { map[c.channel_type] = c })
    return map
  }, [activeClientId])

  const { data: configs = {}, loading, refresh: refreshConfigs } = useCachedFetch<Record<string, ChannelConfig>>(`configs:${activeClientId}`, fetcherConfigs)

  function openConfigModal(chDef: ChannelDef) {
    setActiveChannelDef(chDef)
    if (chDef.id === 'web') return // Built-in
    const existing = configs[chDef.id]
    if (existing?.credentials) {
      setCredentials(JSON.stringify(existing.credentials, null, 2))
    } else {
      // Boilerplate examples
      if (chDef.id === 'whatsapp') setCredentials(JSON.stringify({ meta_token: "", phone_number_id: "" }, null, 2))
      if (chDef.id === 'email') setCredentials(JSON.stringify({ smtp_host: "", smtp_user: "", smtp_pass: "" }, null, 2))
      if (chDef.id === 'sms') setCredentials(JSON.stringify({ twilio_sid: "", twilio_token: "", sender_number: "" }, null, 2))
      if (chDef.id === 'telegram') setCredentials(JSON.stringify({ bot_token: "" }, null, 2))
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault()
    if (!activeClientId || !activeChannelDef) return

    let parsedCreds: Record<string, string> = {}
    try {
      parsedCreds = JSON.parse(credentials)
    } catch (err) {
      alert('Invalid JSON formatting')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/channels/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: activeClientId,
          channel_type: activeChannelDef.id,
          credentials: parsedCreds,
          is_active: true
        })
      })
      if (res.ok) {
        setActiveChannelDef(null)
        setCredentials('')
        invalidate(`configs:${activeClientId}`)
        refreshConfigs()
      }
    } catch (err) {
      console.error(err)
    }
    setIsSubmitting(false)
  }

  async function handleToggleStatus(channelType: string, currentStatus: boolean) {
    if (!activeClientId) return
    try {
      // Just post it again with inverted is_active status
      const existing = configs[channelType]
      if (!existing) return

      const res = await fetch('/api/channels/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: activeClientId,
          channel_type: channelType,
          credentials: existing.credentials,
          is_active: !currentStatus
        })
      })
      if (res.ok) {
        invalidate(`configs:${activeClientId}`)
        refreshConfigs()
      }
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-ink">Channels</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Connect messaging platforms to your bots</p>
        </div>

        {clients.length > 1 && (
          <select
            value={activeClientId || ''}
            onChange={(e) => setActiveClientId(e.target.value)}
            className="px-3 py-2 bg-surface-tertiary border border-[var(--border-subtle)] rounded-lg text-sm text-ink focus:border-brand focus:outline-none"
          >
            {clients.map((c: ClientRecord) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-brand border-t-transparent animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CHANNELS_DEF.map((ch) => {
            const isWeb = ch.id === 'web'
            const config = isWeb ? { is_active: true } as ChannelConfig : configs[ch.id]
            const isConnected = !!config
            const isActive = config?.is_active

            return (
              <div key={ch.id} className="bg-surface-secondary border border-[var(--border-subtle)] rounded-2xl p-6 hover:border-[var(--border-default)] transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-surface-quaternary flex items-center justify-center text-xl">{ch.icon}</div>
                    <div>
                      <h3 className="text-sm font-semibold text-ink">{ch.name}</h3>
                      <p className="text-xs text-[var(--text-tertiary)]">{ch.desc}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  {isConnected && isActive ? (
                    <span className="text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2.5 py-0.5 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Connected
                    </span>
                  ) : isConnected && !isActive ? (
                    <span className="text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full px-2.5 py-0.5 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Paused
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium bg-surface-quaternary text-[var(--text-tertiary)] border border-[var(--border-subtle)] rounded-full px-2.5 py-0.5">Not Connected</span>
                  )}

                  <div className="flex items-center gap-2">
                    {isConnected && !isWeb && (
                      <button
                        onClick={() => handleToggleStatus(ch.id, isActive)}
                        className={`text-xs font-medium hover:text-ink transition-colors ${isActive ? 'text-amber-400' : 'text-emerald-400'}`}
                      >
                        {isActive ? 'Pause' : 'Activate'}
                      </button>
                    )}
                    {!isWeb && (
                      <button
                        onClick={() => openConfigModal(ch)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${isConnected ? 'bg-surface-tertiary text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-ink' : 'bg-brand/10 text-brand border border-brand/20 hover:bg-brand/20'}`}
                      >
                        {isConnected ? 'Configure' : 'Connect'}
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-[var(--text-disabled)] mt-3">{ch.help}</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Config Modal */}
      {activeChannelDef && activeChannelDef.id !== 'web' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface-secondary border border-[var(--border-subtle)] rounded-2xl p-6 w-[500px] shadow-2xl relative">
            <button onClick={() => setActiveChannelDef(null)} className="absolute top-4 right-4 text-[var(--text-tertiary)] hover:text-ink transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-surface-quaternary flex items-center justify-center text-lg">{activeChannelDef.icon}</div>
              <div>
                <h2 className="text-xl font-bold text-ink">Configure {activeChannelDef.name}</h2>
                <p className="text-xs text-[var(--text-tertiary)]">Enter your API credentials (JSON format)</p>
              </div>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <textarea
                  autoFocus required value={credentials} onChange={e => setCredentials(e.target.value)}
                  className="w-full px-4 py-3 bg-[#0D1117] border border-[var(--border-subtle)] rounded-xl text-sm text-emerald-400 font-mono focus:border-brand focus:outline-none transition-colors resize-none h-48"
                />
              </div>

              <div className="pt-4 flex justify-between items-center">
                <a href="#" className="text-xs text-brand hover:underline">Read API Docs</a>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setActiveChannelDef(null)} className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:text-ink transition-colors">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-hover text-ink text-sm font-semibold transition-all hover:shadow-glow disabled:opacity-50">
                    {isSubmitting ? 'Saving...' : 'Save Configuration'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
