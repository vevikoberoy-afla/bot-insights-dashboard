'use client'
import { useState, useEffect, useDeferredValue, useMemo } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Search, Plus, Mail, MessageCircle, Phone, Hash, Send,
  MoreVertical, Copy, Archive, Trash2, BarChart2, Eye,
  TrendingUp, Users, MousePointerClick, CheckCircle2, ArrowRight
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {fetchDashboardData,readDashboardData,writeDashboardData} from '@/lib/client/featureDataCache'

const CHANNEL_CFG: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  email:    { icon: Mail,           color: 'text-red-500',    bg: 'bg-red-50',     label: 'Email' },
  whatsapp: { icon: MessageCircle,  color: 'text-green-500',  bg: 'bg-green-50',   label: 'WhatsApp' },
  sms:      { icon: Phone,          color: 'text-orange-500', bg: 'bg-orange-50',  label: 'SMS' },
  slack:    { icon: Hash,           color: 'text-purple-500', bg: 'bg-purple-50',  label: 'Slack' },
  telegram: { icon: Send,           color: 'text-sky-500',    bg: 'bg-sky-50',     label: 'Telegram' },
}

const STATUS_CFG: Record<string, string> = {
  draft:     'bg-surface-muted text-ink-muted border-surface-border',
  scheduled: 'bg-blue-50 text-blue-600 border-blue-200',
  sending:   'bg-amber-50 text-amber-600 border-amber-200',
  sent:      'bg-status-greenBg text-status-green border-status-green/20',
  failed:    'bg-red-50 text-red-600 border-red-200',
  paused:    'bg-yellow-50 text-yellow-600 border-yellow-200',
}

// Stats summary for header
function StatsBar({ campaigns }: { campaigns: any[] }) {
  const sent = campaigns.filter(c => ['sent','completed'].includes(c.status))
  const totalSent = sent.reduce((a, c) => a + Number(c.sent_count??c.audience??c.recipients_count??0), 0)
  const openRate=(c:any)=>Number(c.opened_pct??(Number(c.sent_count)?Number(c.open_count||0)/Number(c.sent_count)*100:0))
  const clickRate=(c:any)=>Number(c.clicked_pct??(Number(c.sent_count)?Number(c.click_count||0)/Number(c.sent_count)*100:0))
  const avgOpen = sent.length ? Math.round(sent.reduce((a, c) => a + openRate(c), 0) / sent.length) : 0
  const avgClick = sent.length ? Math.round(sent.reduce((a, c) => a + clickRate(c), 0) / sent.length) : 0
  const totalConverted = campaigns.reduce((a, c) => a + Number(c.converted||c.converted_count||0), 0)

  const stats = [
    { label: 'Total Campaigns', value: campaigns.length, icon: BarChart2, color: 'text-ink' },
    { label: 'Total Sent', value: totalSent.toLocaleString(), icon: Users, color: 'text-blue-500' },
    { label: 'Avg Open Rate', value: `${avgOpen}%`, icon: Eye, color: 'text-green-500' },
    { label: 'Avg Click Rate', value: `${avgClick}%`, icon: MousePointerClick, color: 'text-purple-500' },
    { label: 'Total Conversions', value: totalConverted.toLocaleString(), icon: CheckCircle2, color: 'text-emerald-500' },
  ]
  return (
    <div className="grid grid-cols-5 gap-4 mb-6">
      {stats.map(s => {
        const Icon = s.icon
        return (
          <div key={s.label} className="bg-surface border border-surface-border rounded-xl px-4 py-3.5 flex items-center gap-3">
            <Icon className={cn('w-4 h-4 shrink-0', s.color)} />
            <div>
              <p className="text-[11px] text-ink-muted font-medium uppercase tracking-wider">{s.label}</p>
              <p className="text-[18px] font-bold text-ink leading-tight">{s.value}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function CampaignsListPage() {
  const cached=readDashboardData<any[]>('/api/campaigns')
  const [campaigns, setCampaigns] = useState<any[]>(cached||[])
  const [loading, setLoading] = useState(!cached)
  const [search, setSearch] = useState('')
  const deferredSearch=useDeferredValue(search.toLowerCase())
  const [channelFilter, setChannelFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [openMenu, setOpenMenu] = useState<string | null>(null)

  useEffect(() => {
    void fetchDashboardData<any[]>('/api/campaigns').then(setCampaigns).catch(()=>{}).finally(()=>setLoading(false))
  }, [])

  const filtered = useMemo(()=>campaigns.filter(c => {
    if (deferredSearch && !c.name?.toLowerCase().includes(deferredSearch)) return false
    if (channelFilter !== 'all' && c.channel !== channelFilter) return false
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    return true
  }),[campaigns,deferredSearch,channelFilter,statusFilter])

  const handleDuplicate = (c: any) => {
    setCampaigns(prev => {const next=[{ ...c, id: `c-clone-${Date.now()}`, name: `${c.name} (Copy)`, status: 'draft', audience: 0 }, ...prev];writeDashboardData('/api/campaigns',next);return next})
    toast.success('Campaign duplicated')
    setOpenMenu(null)
  }

  const handleDelete = (id: string) => {
    if (!confirm('Delete this campaign?')) return
    setCampaigns(prev => {const next=prev.filter(c => c.id !== id);writeDashboardData('/api/campaigns',next);return next})
    toast.success('Campaign deleted')
    setOpenMenu(null)
  }

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 pb-12" onClick={() => setOpenMenu(null)}>
      <PageHeader title="Campaigns" description="Send bulk messages to your contacts across email, WhatsApp, SMS, and more.">
        <Button className="bg-ink hover:bg-ink-secondary text-white shadow-sm h-9" asChild>
          <Link href="/campaigns/create"><Plus className="w-4 h-4 mr-2" /> Create Campaign</Link>
        </Button>
      </PageHeader>

      {!loading && <StatsBar campaigns={campaigns} />}

      {/* Filter Bar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input placeholder="Search campaigns..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 bg-surface" />
        </div>
        <select value={channelFilter} onChange={e => setChannelFilter(e.target.value)} className="h-9 border border-surface-border rounded-lg px-3 text-sm bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-accent">
          <option value="all">All Channels</option>
          <option value="email">Email</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
          <option value="telegram">Telegram</option>
          <option value="slack">Slack</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="h-9 border border-surface-border rounded-lg px-3 text-sm bg-surface text-ink focus:outline-none focus:ring-1 focus:ring-accent">
          <option value="all">All Status</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="sending">Sending</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>
        <div className="ml-auto">
          <Button variant="outline" size="sm" className="h-9 text-xs border-surface-border" asChild>
            <Link href="/campaigns/journeys"><TrendingUp className="w-3.5 h-3.5 mr-1.5" /> Journey Builder</Link>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-xl border bg-surface">{Array.from({length:7}).map((_,index)=><div key={index} className="flex gap-6 border-b p-4 last:border-0"><div className="h-4 w-1/4 animate-pulse rounded bg-surface-muted"/><div className="h-4 w-20 animate-pulse rounded bg-surface-muted"/><div className="ml-auto h-4 w-1/3 animate-pulse rounded bg-surface-muted"/></div>)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface border border-surface-border rounded-xl p-16 text-center">
          <BarChart2 className="w-10 h-10 text-ink-muted mx-auto mb-4" />
          <p className="text-sm font-medium text-ink mb-2">No campaigns found</p>
          <p className="text-xs text-ink-secondary mb-6">Try adjusting your filters or create a new campaign.</p>
          <Button className="bg-ink text-white hover:bg-ink-secondary" asChild><Link href="/campaigns/create"><Plus className="w-4 h-4 mr-2" /> Create Campaign</Link></Button>
        </div>
      ) : (
        <div className="bg-surface border border-surface-border rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-muted/50 border-b border-surface-border text-[10px] font-bold text-ink-muted uppercase tracking-wider">
                <th className="text-left px-5 py-3">Campaign</th>
                <th className="px-4 py-3">Channel</th>
                <th className="px-4 py-3">Status</th>
                <th className="text-right px-4 py-3">Audience</th>
                <th className="text-right px-4 py-3">Delivered</th>
                <th className="text-right px-4 py-3">Opened</th>
                <th className="text-right px-4 py-3">Clicked</th>
                <th className="text-right px-4 py-3">Converted</th>
                <th className="px-4 py-3">Scheduled</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {filtered.map(c => {
                const ch = CHANNEL_CFG[c.channel] || CHANNEL_CFG.email
                const Icon = ch.icon
                return (
                  <tr key={c.id} className="hover:bg-surface-muted/30 transition-colors group cursor-pointer" onClick={() => window.location.href = `/campaigns/${c.id}/results`}>
                    <td className="px-5 py-3.5">
                      <p className="font-semibold text-ink text-[13px]">{c.name}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-lg', ch.bg)}>
                        <Icon className={cn('w-3 h-3', ch.color)} />
                        <span className={cn('text-[10px] font-bold uppercase tracking-wider', ch.color)}>{ch.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={cn('inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border', STATUS_CFG[c.status] || STATUS_CFG.draft)}>
                        {c.status === 'sending' ? '● Sending' : c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-medium text-ink">{Number(c.audience??c.recipients_count??0).toLocaleString()}</td>
                    <td className="px-4 py-3.5 text-right text-ink-secondary">{c.delivered_pct ? `${c.delivered_pct}%` : '—'}</td>
                    <td className="px-4 py-3.5 text-right text-ink-secondary">{c.opened_pct ? `${c.opened_pct}%` : '—'}</td>
                    <td className="px-4 py-3.5 text-right text-ink-secondary">{c.clicked_pct ? `${c.clicked_pct}%` : '—'}</td>
                    <td className="px-4 py-3.5 text-right font-semibold text-emerald-600">{c.converted || '—'}</td>
                    <td className="px-4 py-3.5 text-ink-muted text-[12px]">{c.scheduled || c.scheduled_at || '—'}</td>
                    <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                      <div className="relative">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-ink-muted opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => { e.stopPropagation(); setOpenMenu(openMenu === c.id ? null : c.id) }}>
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                        {openMenu === c.id && (
                          <div className="absolute right-0 top-8 z-50 bg-white border border-surface-border rounded-xl shadow-lg py-1 w-44 animate-in fade-in slide-in-from-top-2 duration-150">
                            <Link href={`/campaigns/${c.id}/results`} className="flex items-center gap-2.5 px-3 py-2 text-sm text-ink hover:bg-surface-muted"><Eye className="w-3.5 h-3.5 text-ink-muted" /> View Results</Link>
                            <button onClick={() => handleDuplicate(c)} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-ink hover:bg-surface-muted"><Copy className="w-3.5 h-3.5 text-ink-muted" /> Duplicate</button>
                            <button className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-ink hover:bg-surface-muted"><Archive className="w-3.5 h-3.5 text-ink-muted" /> Archive</button>
                            <div className="h-px bg-surface-border mx-2 my-1" />
                            <button onClick={() => handleDelete(c.id)} className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
