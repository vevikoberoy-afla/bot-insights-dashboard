'use client'
import { useEffect, useState } from 'react'
import { AlertCircle, Camera, CheckCircle2, Clock3, PackageCheck, RefreshCw, RotateCcw, Save, Search, ShieldCheck, Star, TicketCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

const defaults = { strict_support_mode: false, returns_refunds: false, exchanges: false, price_lookup: false, stock_lookup: false,
  ticket_status: false, csat: false, photo_uploads: false, return_window_days: 30,
  require_order_verification: true, allow_unverified_complaints: true,
  allowed_resolutions: ['refund', 'exchange', 'store_credit'] as string[] }

type SupportConfig = typeof defaults

// The Behaviour tab is conditionally mounted by the bot editor. Keep a small
// client-side cache so reopening the tab does not replace this card with a
// loading placeholder or issue another request for the same bot.
const configCache = new Map<string, SupportConfig>()
const configSavedAt = new Map<string, number>()
const configRequests = new Map<string, Promise<SupportConfig>>()
const CACHE_FOR = 5 * 60 * 1000
const KEEP_FOR = 30 * 60 * 1000
const cacheKey = (botId: string) => `bot-support-config:v1:${botId}`

function readStored(botId: string) {
  if (typeof window === 'undefined') return null
  try {
    const parsed = JSON.parse(window.localStorage.getItem(cacheKey(botId)) || 'null')
    if (!parsed?.value || Date.now() - parsed.savedAt > KEEP_FOR) return null
    return parsed as { savedAt: number; value: SupportConfig }
  } catch { return null }
}

function saveCached(botId: string, value: SupportConfig) {
  const savedAt = Date.now()
  if (!configCache.has(botId) && configCache.size >= 24) {
    const oldest = configSavedAt.entries().next().value as [string, number] | undefined
    if (oldest) { configCache.delete(oldest[0]); configSavedAt.delete(oldest[0]) }
  }
  configCache.set(botId, value)
  configSavedAt.set(botId, savedAt)
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(cacheKey(botId), JSON.stringify({ savedAt, value })) } catch {}
  }
  return value
}

function loadConfig(botId: string) {
  const cached = configCache.get(botId)
  if (cached && Date.now() - (configSavedAt.get(botId) || 0) < CACHE_FOR) return Promise.resolve(cached)

  const stored = readStored(botId)
  if (stored && Date.now() - stored.savedAt < CACHE_FOR) {
    configCache.set(botId, stored.value)
    configSavedAt.set(botId, stored.savedAt)
    return Promise.resolve(stored.value)
  }

  const pending = configRequests.get(botId)
  if (pending) return pending

  const request = fetch(`/api/bots/${botId}/support-config`)
    .then(async res => {
      if (!res.ok) throw new Error('Could not load support settings')
      const value = { ...defaults, ...(await res.json()) }
      return saveCached(botId, value)
    })
    .finally(() => configRequests.delete(botId))

  configRequests.set(botId, request)
  return request
}

export const prefetchSupportAutomationConfig = loadConfig

export function SupportAutomationConfig({ botId }: { botId: string }) {
  const [config, setConfig] = useState<SupportConfig>(() => configCache.get(botId) || readStored(botId)?.value || { ...defaults })
  const [loading, setLoading] = useState(() => !configCache.has(botId) && !readStored(botId))
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let active = true
    const cached = configCache.get(botId)
    if (cached && Date.now() - (configSavedAt.get(botId) || 0) < CACHE_FOR) {
      setConfig(cached)
      setLoading(false)
      return () => { active = false }
    }
    const stored = readStored(botId)
    if (stored) {
      configCache.set(botId, stored.value)
      configSavedAt.set(botId, stored.savedAt)
      setConfig(stored.value)
      setLoading(false)
      if (Date.now() - stored.savedAt < CACHE_FOR) return () => { active = false }
    }
    loadConfig(botId)
      .then(value => { if (active) setConfig(value) })
      .catch(error => { if (active) toast.error(error.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [botId])
  const update = (key: string, value: any) => setConfig(prev => {
    const next = { ...prev, [key]: value }
    saveCached(botId, next)
    return next
  })
  const save = async () => {
    setSaving(true); const res = await fetch(`/api/bots/${botId}/support-config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) })
    const body = await res.json(); setSaving(false)
    if (!res.ok) return toast.error(body.error || 'Could not save support settings')
    const saved = { ...defaults, ...body }
    saveCached(botId, saved)
    setConfig(saved); toast.success('Support automation saved')
  }
  const toggleResolution = (value: string) => update('allowed_resolutions', config.allowed_resolutions.includes(value) ? config.allowed_resolutions.filter(item => item !== value) : [...config.allowed_resolutions, value])
  return <div className="bg-white border border-surface-border rounded-2xl shadow-sm overflow-hidden">
    <div className="p-5 border-b border-surface-border bg-gradient-to-r from-accent/[0.06] to-transparent flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-accent/10 text-accent flex items-center justify-center"><TicketCheck className="w-5 h-5" /></div><div><h3 className="font-bold text-ink">Customer support automation</h3><p className="text-xs text-ink-muted mt-0.5">Deterministic flows run before RAG and create verified, auditable tickets.</p></div></div>
      <Button onClick={save} disabled={saving || loading} className="bg-ink text-white hover:bg-ink-secondary">{loading ? <RefreshCw className="animate-spin" /> : <Save />}{saving ? 'Saving…' : loading ? 'Syncing settings…' : 'Save support settings'}</Button>
    </div>
    <div className="p-5 space-y-6">
      <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 flex gap-3"><ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" /><div><p className="text-xs font-bold text-blue-900">Safe by default</p><p className="text-xs text-blue-800/80 mt-1">All customer-facing automations start off. Price and stock answers only use synced catalog data; order-linked actions require identity verification.</p></div></div>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-surface-border p-4"><div><p className="text-sm font-semibold text-ink">Strict support identity gate</p><p className="mt-1 text-xs text-ink-muted">Ask for registered phone, then order ID, before any support conversation. Support-type bots enforce this automatically and never open booking or new-order flows.</p></div><Switch checked={config.strict_support_mode} onCheckedChange={v=>update('strict_support_mode',v)}/></div>
      <div className="grid md:grid-cols-2 gap-3">
        <Feature icon={RotateCcw} title="Returns & refunds" description="Collect order, item, reason, resolution, and confirmation." checked={config.returns_refunds} onChange={v => update('returns_refunds', v)} />
        <Feature icon={PackageCheck} title="Exchanges" description="Offer exchange as an eligible ticket resolution." checked={config.exchanges} disabled={!config.returns_refunds} onChange={v => update('exchanges', v)} />
        <Feature icon={Search} title="Price lookup" description="Answer prices only from the synced product catalog." checked={config.price_lookup} onChange={v => update('price_lookup', v)} />
        <Feature icon={PackageCheck} title="Stock lookup" description="Return live inventory status from synced catalog data." checked={config.stock_lookup} onChange={v => update('stock_lookup', v)} />
        <Feature icon={TicketCheck} title="Ticket status" description="Let verified customers check an existing ticket." checked={config.ticket_status} onChange={v => update('ticket_status', v)} />
        <Feature icon={Star} title="CSAT surveys" description="Request one 1–5 rating after a ticket is solved." checked={config.csat} disabled={!config.ticket_status} onChange={v => update('csat', v)} />
        <Feature icon={Camera} title="Photo evidence" description="Allow images during return and damaged-item flows." checked={config.photo_uploads} disabled={!config.returns_refunds} onChange={v => update('photo_uploads', v)} />
        <Feature icon={ShieldCheck} title="Order verification" description="Require order plus matching email or phone." checked={config.require_order_verification} onChange={v => update('require_order_verification', v)} />
      </div>
      <div className="grid md:grid-cols-2 gap-5 pt-1">
        <div className="border border-surface-border rounded-xl p-4"><div className="flex items-center gap-2 mb-3"><Clock3 className="w-4 h-4 text-accent" /><p className="text-sm font-bold">Return policy</p></div><label className="text-[10px] uppercase tracking-wider font-bold text-ink-muted">Return window (days)</label><Input type="number" min={1} max={365} value={config.return_window_days} onChange={e => update('return_window_days', Number(e.target.value))} className="mt-1.5" /><p className="text-[11px] text-ink-muted mt-2">Eligibility is calculated from the synced delivery date.</p></div>
        <div className="border border-surface-border rounded-xl p-4"><p className="text-sm font-bold mb-3">Allowed resolutions</p><div className="flex flex-wrap gap-2">{['refund','exchange','store_credit'].map(value => <button type="button" key={value} onClick={() => toggleResolution(value)} className={cn('inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold capitalize transition-colors', config.allowed_resolutions.includes(value) ? 'bg-accent/10 text-accent border-accent/30' : 'bg-white text-ink-muted border-surface-border')}><CheckCircle2 className="w-3.5 h-3.5" />{value.replace('_',' ')}</button>)}</div></div>
      </div>
      <div className="flex items-center justify-between gap-4 p-4 border border-surface-border rounded-xl"><div><p className="text-sm font-semibold text-ink">Accept unverified complaints</p><p className="text-xs text-ink-muted mt-1">Create a separate unverified complaint without exposing order details.</p></div><Switch checked={config.allow_unverified_complaints} onCheckedChange={v => update('allow_unverified_complaints', v)} /></div>
      {!config.returns_refunds && !config.price_lookup && !config.stock_lookup && !config.ticket_status && <div className="flex gap-2 text-xs text-amber-800 bg-amber-50 rounded-lg p-3"><AlertCircle className="w-4 h-4 shrink-0" />Support automation is currently off. The bot continues using its existing knowledge and behaviour unchanged.</div>}
    </div>
  </div>
}

function Feature({ icon: Icon, title, description, checked, disabled, onChange }: any) { return <div className={cn('flex items-start justify-between gap-4 p-4 border border-surface-border rounded-xl transition-opacity', disabled && 'opacity-50')}><div className="flex gap-3"><div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-ink-secondary" /></div><div><p className="text-sm font-semibold text-ink">{title}</p><p className="text-[11px] text-ink-muted mt-1 leading-relaxed">{description}</p></div></div><Switch checked={checked} disabled={disabled} onCheckedChange={onChange} /></div> }
