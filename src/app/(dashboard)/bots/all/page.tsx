'use client'
import { activeWorkspaceId } from '@/lib/client/workspace'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Bot, Plus, MoreVertical, MessageSquare, Search, Copy, 
  Pause, Play, Trash2, Settings, MessageCircle, Mail,
  Globe, Phone, Hash, Send, TrendingUp, Users, CheckCircle2,
  ChevronDown
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { fetchDashboardData, invalidateDashboardData, readDashboardData, writeDashboardData } from '@/lib/client/featureDataCache'

const CHANNEL_ICONS: Record<string, { icon: any; color: string; label: string }> = {
  web:       { icon: Globe,          color: 'text-blue-500',   label: 'Web Chat' },
  whatsapp:  { icon: MessageCircle,  color: 'text-green-500',  label: 'WhatsApp' },
  email:     { icon: Mail,           color: 'text-red-500',    label: 'Email' },
  sms:       { icon: Phone,          color: 'text-orange-500', label: 'SMS' },
  slack:     { icon: Hash,           color: 'text-purple-500', label: 'Slack' },
  telegram:  { icon: Send,           color: 'text-sky-500',    label: 'Telegram' },
}

export default function BotsListPage() {
  const workspaceId = activeWorkspaceId('')
  const dataUrl = workspaceId ? `/api/bots?client_id=${encodeURIComponent(workspaceId)}` : ''
  const cached = dataUrl ? readDashboardData<any[]>(dataUrl) : undefined
  const [bots, setBots] = useState<any[]>(cached || [])
  const [loading, setLoading] = useState(!cached)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [statusFilter, setStatusFilter] = useState('all')
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const deletingIds = useRef(new Set<string>())

  useEffect(() => {
    let cancelled = false
    async function fetchBots() {
      try {
        if (!dataUrl) { setBots([]); return }
        const data = await fetchDashboardData<any[]>(dataUrl)
        if (!cancelled) setBots(data || [])
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : 'Could not load bots')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchBots()
    return () => { cancelled = true }
  }, [dataUrl])

  const filtered = useMemo(() => bots.filter(b => {
    const matchesSearch = b.name?.toLowerCase().includes(deferredSearch.toLowerCase())
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter
    return matchesSearch && matchesStatus
  }), [bots, deferredSearch, statusFilter])

  const handlePauseResume = (id: string, currentStatus: string) => {
    setBots(prev => prev.map(b => b.id === id ? { ...b, status: currentStatus === 'active' ? 'paused' : 'active' } : b))
    toast.success(currentStatus === 'active' ? 'Bot paused' : 'Bot resumed')
    setOpenMenu(null)
  }

  const handleDuplicate = (bot: any) => {
    const clone = { ...bot, id: `bot-clone-${Date.now()}`, name: `${bot.name} (Copy)`, status: 'draft' }
    setBots(prev => [clone, ...prev])
    toast.success('Bot duplicated')
    setOpenMenu(null)
  }

  const handleDelete = async (id: string) => {
    if (deletingIds.current.has(id)) return
    if (!confirm('Are you sure you want to delete this bot?')) return
    deletingIds.current.add(id)
    setOpenMenu(null)
    try {
      const response = await fetch(`/api/bots?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'X-Workspace-Id': workspaceId },
      })
      const body = await response.json()
      if (!response.ok || !body.success) throw new Error(body.error || 'Could not delete bot')
      // Invalidate other list variants and bot detail pages before caching this list.
      const remaining = (readDashboardData<any[]>(dataUrl) || bots).filter(bot => bot.id !== id)
      invalidateDashboardData('/api/bots')
      writeDashboardData(dataUrl, remaining)
      setBots(prev => prev.filter(bot => bot.id !== id))
      toast.success('Bot deleted')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete bot')
    } finally {
      deletingIds.current.delete(id)
    }
  }

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 pb-12" onClick={() => setOpenMenu(null)}>
      <PageHeader title="My Bots" description="Create and manage your AI bots across all channels.">
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <Input placeholder="Search bots by name..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 bg-surface" />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="h-9 border border-surface-border rounded-lg px-3 text-sm bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="draft">Draft</option>
          </select>
          <Button className="bg-ink hover:bg-ink-secondary text-white shadow-sm h-9" asChild>
            <Link href="/bots/new"><Plus className="w-4 h-4 mr-2" /> Create New Bot</Link>
          </Button>
        </div>
      </PageHeader>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6" aria-label="Loading bots">
          {[0,1,2,3].map(item => <div key={item} className="h-44 rounded-xl border border-surface-border bg-surface animate-pulse"><div className="m-5 h-4 w-36 rounded bg-surface-muted" /><div className="mx-5 mt-5 h-3 w-3/4 rounded bg-surface-muted" /></div>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface border border-surface-border rounded-xl p-16 text-center max-w-lg mx-auto mt-12">
          <div className="w-16 h-16 bg-surface-muted rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Bot className="w-8 h-8 text-ink-muted" />
          </div>
          <h3 className="text-lg font-semibold text-ink mb-2">No bots yet</h3>
          <p className="text-sm text-ink-secondary mb-8">Create your first AI bot to start handling support or campaigns.</p>
          <Button className="bg-ink hover:bg-ink-secondary text-white" asChild>
            <Link href="/bots/new"><Plus className="w-4 h-4 mr-2" /> Create Your First Bot</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(bot => {
            const statusStyle = bot.status === 'active'
              ? 'bg-status-greenBg text-status-green border-status-green/20'
              : bot.status === 'paused'
              ? 'bg-amber-50 text-amber-600 border-amber-200'
              : 'bg-surface-muted text-ink-muted border-surface-border'

            return (
              <div key={bot.id} className="bg-surface border border-surface-border rounded-xl p-5 hover:border-accent/30 hover:shadow-sm transition-all flex flex-col group relative">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center text-accent font-bold text-sm shrink-0">
                      {bot.name?.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold text-ink leading-tight">{bot.name}</h3>
                      <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border mt-1', statusStyle)}>
                        {bot.status}
                      </span>
                    </div>
                  </div>

                  {/* Actions Menu */}
                  <div className="relative" onClick={e => e.stopPropagation()}>
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => setOpenMenu(openMenu === bot.id ? null : bot.id)}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                    {openMenu === bot.id && (
                      <div className="absolute right-0 top-8 z-50 bg-white border border-surface-border rounded-xl shadow-lg py-1 w-44 animate-in fade-in slide-in-from-top-2 duration-150">
                        <Link href={`/bots/${bot.id}/edit`} className="flex items-center gap-2.5 px-3 py-2 text-sm text-ink hover:bg-surface-muted transition-colors">
                          <Settings className="w-3.5 h-3.5 text-ink-muted" /> Edit Bot
                        </Link>
                        <button onClick={() => handleDuplicate(bot)} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-ink hover:bg-surface-muted transition-colors">
                          <Copy className="w-3.5 h-3.5 text-ink-muted" /> Duplicate
                        </button>
                        <button onClick={() => handlePauseResume(bot.id, bot.status)} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-ink hover:bg-surface-muted transition-colors">
                          {bot.status === 'active' ? <Pause className="w-3.5 h-3.5 text-ink-muted" /> : <Play className="w-3.5 h-3.5 text-ink-muted" />}
                          {bot.status === 'active' ? 'Pause' : 'Resume'}
                        </button>
                        <div className="h-px bg-surface-border mx-2 my-1" />
                        <button onClick={() => handleDelete(bot.id)} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-xs text-ink-secondary line-clamp-2 mb-4">{bot.purpose || 'No description'}</p>

                {/* Channel Icons */}
                <div className="flex items-center gap-2 mb-4">
                  {(bot.channels || (bot.channel ? [bot.channel] : [])).map((ch: string) => {
                    const cfg = CHANNEL_ICONS[ch]
                    if (!cfg) return null
                    const Icon = cfg.icon
                    return (
                      <div key={ch} className="flex items-center gap-1 px-2 py-1 bg-surface-muted border border-surface-border rounded-md" title={cfg.label}>
                        <Icon className={cn('w-3 h-3', cfg.color)} />
                        <span className="text-[10px] font-medium text-ink-secondary">{cfg.label}</span>
                      </div>
                    )
                  })}
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-surface-border mt-auto">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      <MessageSquare className="w-3 h-3 text-ink-muted" />
                      <p className="text-[13px] font-bold text-ink">{bot.conversations_today ?? 0}</p>
                    </div>
                    <p className="text-[9px] font-medium text-ink-muted uppercase tracking-wider">Today</p>
                  </div>
                  <div className="text-center border-x border-surface-border">
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      <CheckCircle2 className="w-3 h-3 text-status-green" />
                      <p className="text-[13px] font-bold text-ink">{bot.resolution_rate ?? 0}%</p>
                    </div>
                    <p className="text-[9px] font-medium text-ink-muted uppercase tracking-wider">Resolved</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      <Users className="w-3 h-3 text-ink-muted" />
                      <p className="text-[13px] font-bold text-ink">{bot.handoffs_today ?? 0}</p>
                    </div>
                    <p className="text-[9px] font-medium text-ink-muted uppercase tracking-wider">Handoffs</p>
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-surface-border">
                  <span className="text-[10px] text-ink-muted font-medium">
                    Last active {bot.last_active}
                  </span>
                  <Button size="sm" variant="ghost" className="h-7 text-[11px] text-accent hover:bg-accent/5 -mr-1" asChild>
                    <Link href={`/bots/${bot.id}/edit`}><Settings className="w-3 h-3 mr-1" /> Edit</Link>
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
