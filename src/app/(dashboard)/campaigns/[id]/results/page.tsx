'use client'
import { useState } from 'react'
import { useParams } from 'next/navigation'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Download, Search, Mail, Users, Eye, MousePointerClick, CheckCircle2, MessageCircle, XCircle, TrendingUp, DollarSign } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const MOCK_RESULT = {
  id: 'c-1',
  name: 'Summer Sale Blast',
  channel: 'email',
  status: 'sent',
  sent: 3241,
  delivered: 3144,
  delivered_pct: 97,
  opened: 975,
  opened_pct: 31,
  clicked: 259,
  clicked_pct: 8,
  replied: 42,
  replied_pct: 1.3,
  converted: 142,
  converted_pct: 4.4,
  revenue: 145200,
  unsubscribed: 18,
}

const MOCK_CONTACTS = [
  { id: 'u-1', name: 'Alex Johnson',   email: 'alex@example.com',   delivered: true,  opened_at: '10:42 AM', clicked_at: '10:45 AM', converted: true,  unsubscribed: false },
  { id: 'u-2', name: 'Sarah Miller',   email: 'sarah@example.com',  delivered: true,  opened_at: '11:02 AM', clicked_at: null,        converted: false, unsubscribed: false },
  { id: 'u-3', name: 'David Chen',     email: 'david@example.com',  delivered: true,  opened_at: null,       clicked_at: null,        converted: false, unsubscribed: true  },
  { id: 'u-4', name: 'Maria Garcia',   email: 'maria@example.com',  delivered: true,  opened_at: '2:15 PM',  clicked_at: '2:18 PM',  converted: true,  unsubscribed: false },
  { id: 'u-5', name: 'Tom Wilson',     email: 'tom@example.com',    delivered: false, opened_at: null,       clicked_at: null,        converted: false, unsubscribed: false },
]

// Minimal bar chart using CSS
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-surface-muted rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-bold text-ink w-8 text-right">{pct}%</span>
    </div>
  )
}

export default function CampaignResultsPage() {
  const params = useParams()
  const [search, setSearch] = useState('')
  const r = MOCK_RESULT

  const filtered = MOCK_CONTACTS.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.email.toLowerCase().includes(search.toLowerCase())
  )

  const stats = [
    { label: 'Total Sent',    value: r.sent.toLocaleString(),          icon: Users,          color: 'text-ink',          bg: 'bg-surface-muted' },
    { label: 'Delivered',     value: `${r.delivered.toLocaleString()} (${r.delivered_pct}%)`, icon: CheckCircle2, color: 'text-indigo-500',   bg: 'bg-indigo-50' },
    { label: 'Opened',        value: `${r.opened.toLocaleString()} (${r.opened_pct}%)`,       icon: Eye,          color: 'text-green-500',  bg: 'bg-green-50' },
    { label: 'Clicked',       value: `${r.clicked.toLocaleString()} (${r.clicked_pct}%)`,     icon: MousePointerClick, color: 'text-purple-500', bg: 'bg-purple-50' },
    { label: 'Replied',       value: `${r.replied.toLocaleString()} (${r.replied_pct}%)`,     icon: MessageCircle, color: 'text-orange-500', bg: 'bg-orange-50' },
    { label: 'Converted',     value: `${r.converted.toLocaleString()} (${r.converted_pct}%)`, icon: TrendingUp,   color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { label: 'Revenue',       value: `₹${r.revenue.toLocaleString()}`, icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  ]

  const handleRetarget = (type: string) => {
    alert(`Retargeting segment for ${type} created successfully!`)
  }

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 pb-12">
      <PageHeader title={r.name} description={`Campaign results · ${r.channel} · ${r.status}`}>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
            <Link href="/campaigns/all"><ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> Back</Link>
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs">
            <Download className="w-3.5 h-3.5 mr-1.5" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs bg-surface text-ink" onClick={() => handleRetarget('Non-Openers')}>
            Retarget Non-Openers
          </Button>
          <Button size="sm" className="h-8 text-xs bg-ink text-white hover:bg-ink-secondary" onClick={() => handleRetarget('Non-Converters')}>
            Retarget Non-Converters
          </Button>
        </div>
      </PageHeader>

      {/* Stats Row */}
      <div className="grid grid-cols-7 gap-4 mb-6">
        {stats.map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className={cn('rounded-xl border border-surface-border p-4', s.bg)}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className={cn('w-4 h-4', s.color)} />
                <p className="text-[10px] font-bold text-ink-muted uppercase tracking-wider">{s.label}</p>
              </div>
              <p className="text-[15px] font-bold text-ink leading-tight">{s.value}</p>
            </div>
          )
        })}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-2 gap-5 mb-6">
        {/* Funnel */}
        <div className="bg-surface border border-surface-border rounded-xl p-5">
          <h3 className="text-sm font-bold text-ink mb-4">Engagement Funnel</h3>
          <div className="space-y-4">
            {[
              { label: 'Delivered', value: r.delivered, max: r.sent,      color: 'bg-indigo-400' },
              { label: 'Opened',    value: r.opened,    max: r.delivered,  color: 'bg-green-400' },
              { label: 'Clicked',   value: r.clicked,   max: r.opened,     color: 'bg-purple-400' },
              { label: 'Converted', value: r.converted, max: r.clicked,    color: 'bg-emerald-400' },
            ].map(item => (
              <div key={item.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium text-ink">{item.label}</span>
                  <span className="text-ink-muted">{item.value.toLocaleString()}</span>
                </div>
                <MiniBar value={item.value} max={item.max} color={item.color} />
              </div>
            ))}
          </div>
        </div>

        {/* Conversions by Channel */}
        <div className="bg-surface border border-surface-border rounded-xl p-5 flex flex-col">
          <h3 className="text-sm font-bold text-ink mb-4">Conversions & Revenue by Channel</h3>
          <div className="flex-1 flex flex-col justify-end space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center"><MessageCircle className="w-4 h-4" /></div>
                <div><p className="text-sm font-semibold">WhatsApp</p><p className="text-xs text-ink-muted">124 conversions</p></div>
              </div>
              <p className="font-bold text-ink">₹98,500</p>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center"><Mail className="w-4 h-4" /></div>
                <div><p className="text-sm font-semibold">Email</p><p className="text-xs text-ink-muted">45 conversions</p></div>
              </div>
              <p className="font-bold text-ink">₹34,200</p>
            </div>
          </div>
        </div>
      </div>

      {/* Contact Activity Table */}
      <div className="bg-surface border border-surface-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-border bg-surface-muted/30">
          <h3 className="text-sm font-bold text-ink">Contact Activity</h3>
          <div className="relative w-56">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <Input placeholder="Search contacts..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs bg-surface" />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-border text-[10px] font-bold text-ink-muted uppercase tracking-wider">
              <th className="text-left px-5 py-2.5">Contact</th>
              <th className="px-4 py-2.5 text-center">Delivered</th>
              <th className="px-4 py-2.5 text-center">Opened At</th>
              <th className="px-4 py-2.5 text-center">Clicked At</th>
              <th className="px-4 py-2.5 text-center">Converted</th>
              <th className="px-4 py-2.5 text-center">Unsubscribed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-surface-muted/30 transition-colors">
                <td className="px-5 py-3">
                  <p className="font-semibold text-ink text-[13px]">{c.name}</p>
                  <p className="text-[11px] text-ink-muted">{c.email}</p>
                </td>
                <td className="px-4 py-3 text-center">
                  {c.delivered ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" /> : <XCircle className="w-4 h-4 text-red-400 mx-auto" />}
                </td>
                <td className="px-4 py-3 text-center text-[12px] text-ink-secondary">{c.opened_at || '—'}</td>
                <td className="px-4 py-3 text-center text-[12px] text-ink-secondary">{c.clicked_at || '—'}</td>
                <td className="px-4 py-3 text-center">
                  {c.converted ? <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 uppercase tracking-wider">Yes</span> : <span className="text-ink-muted text-[12px]">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  {c.unsubscribed ? <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-50 text-red-600 border border-red-200 uppercase tracking-wider">Yes</span> : <span className="text-ink-muted text-[12px]">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
