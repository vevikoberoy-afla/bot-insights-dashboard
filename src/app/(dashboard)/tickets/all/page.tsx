'use client'
import { activeWorkspaceId } from '@/lib/client/workspace'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { 
  AlertTriangle, 
  BarChart2, 
  CheckCircle2, 
  ChevronLeft, 
  ChevronRight, 
  Clock3, 
  Filter, 
  Inbox, 
  Plus, 
  RefreshCw, 
  Search, 
  ShieldCheck, 
  Ticket 
} from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase-browser'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { 
  getCachedTickets, 
  getStoredClientId, 
  getTicketsCacheKey, 
  setCachedTickets, 
  setStoredClientId 
} from '@/lib/tickets-cache'

const statusTabs = [
  ['all', 'All'], ['open', 'Open'], ['in_progress', 'In progress'], ['pending', 'Pending'],
  ['on_hold', 'On hold'], ['solved', 'Solved'], ['closed', 'Closed'],
]

const priorityClass: Record<string, string> = {
  urgent: 'bg-red-50 text-red-700 border-red-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  normal: 'bg-blue-50 text-blue-700 border-blue-200',
  low: 'bg-slate-50 text-slate-600 border-slate-200',
}

const statusClass: Record<string, string> = {
  open: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-violet-50 text-violet-700',
  pending: 'bg-amber-50 text-amber-700',
  waiting: 'bg-amber-50 text-amber-700',
  on_hold: 'bg-slate-100 text-slate-700',
  resolved: 'bg-emerald-50 text-emerald-700',
  solved: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-slate-100 text-slate-600',
}

export default function AllTicketsPage() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // Synchronously resolve clientId from cache/storage so we can immediately inspect the cache
  const [clientId, setClientId] = useState<string>(() => getStoredClientId())

  // Initial cache lookup for instantaneous 0ms display on initial render
  const initialCacheKey = useMemo(() => {
    const id = getStoredClientId()
    return id ? getTicketsCacheKey({
      clientId: id,
      page: 1,
      pageSize: 25,
      search: '',
      status: 'all',
      priority: 'all',
      type: 'all',
      verification: 'all'
    }) : ''
  }, [])

  const initialCached = useMemo(() => {
    return initialCacheKey ? getCachedTickets(initialCacheKey) : null
  }, [initialCacheKey])

  const [tickets, setTickets] = useState<any[]>(() => initialCached?.data || [])
  const [count, setCount] = useState<number>(() => initialCached?.count || 0)
  const [loading, setLoading] = useState<boolean>(() => !initialCached)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(() => !!initialCached?.isStale)

  // Filters & State
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [priority, setPriority] = useState('all')
  const [type, setType] = useState('all')
  const [verification, setVerification] = useState('all')
  const [page, setPage] = useState(1)

  // Debounce search input only when user is typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim())
    }, 280)
    return () => clearTimeout(timer)
  }, [search])

  // Sync verified Supabase Auth identity & update stored clientId if needed
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const id = activeWorkspaceId(data.user?.id || '') || ''
      if (id) {
        setStoredClientId(id)
        setClientId(prev => (prev !== id ? id : prev))
      }
    })
  }, [supabase])

  // Fetch or load from cache
  const isFetchingRef = useRef(false)

  const load = useCallback(async (force = false) => {
    const activeClientId = clientId || getStoredClientId()
    if (!activeClientId) return

    const cacheKey = getTicketsCacheKey({
      clientId: activeClientId,
      page,
      pageSize: 25,
      search: debouncedSearch,
      status,
      priority,
      type,
      verification,
    })

    // ── 1. Check cache for instantaneous (0ms) render ──
    const cached = getCachedTickets(cacheKey)
    if (cached && !force) {
      setTickets(cached.data)
      setCount(cached.count)
      setLoading(false)

      // If fresh, do not send any network request at all!
      if (!cached.isStale) {
        setIsRefreshing(false)
        return
      }

      // If stale, serve cache immediately and lazyload fresh data in background
      setIsRefreshing(true)
    } else if (!cached && tickets.length === 0) {
      setLoading(true)
    } else {
      setIsRefreshing(true)
    }

    if (isFetchingRef.current) return
    isFetchingRef.current = true

    try {
      const params = new URLSearchParams({
        client_id: activeClientId,
        paginated: 'true',
        page: String(page),
        page_size: '25',
      })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (status !== 'all') params.set('status', status)
      if (priority !== 'all') params.set('priority', priority)
      if (type !== 'all') params.set('type', type)
      if (verification !== 'all') params.set('verification_status', verification)

      const res = await fetch(`/api/tickets?${params}`)
      if (res.ok) {
        const body = await res.json()
        const newTickets = body.data || []
        const newCount = body.count || 0

        setTickets(newTickets)
        setCount(newCount)

        // Store into cache for subsequent instantaneous visits
        setCachedTickets(cacheKey, { data: newTickets, count: newCount })
      }
    } catch (err) {
      console.error('Failed to load tickets', err)
    } finally {
      isFetchingRef.current = false
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [clientId, debouncedSearch, page, priority, status, type, verification, tickets.length])

  // Load when filters or page change
  useEffect(() => {
    load()
  }, [load])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [priority, debouncedSearch, status, type, verification])

  // Auto-refresh when admin switches back to tab
  useEffect(() => {
    const handleFocus = () => load(true)
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [load])

  // Realtime subscription: auto revalidate background on DB mutations
  useEffect(() => {
    const activeClientId = clientId || getStoredClientId()
    if (!activeClientId) return

    const channel = supabase.channel(`tickets-rt:${activeClientId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tickets',
        filter: `client_id=eq.${activeClientId}`
      }, () => {
        // Silently reload in background
        load(true)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clientId, load, supabase])

  const active = tickets.filter(t => !['resolved', 'solved', 'closed'].includes(t.status)).length
  const breached = tickets.filter(t => t.sla_breached_at || (t.resolution_due_at && !t.resolved_at && new Date(t.resolution_due_at) < new Date())).length

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto animate-in fade-in duration-300">
      <PageHeader 
        title="Tickets" 
        description="Manage customer issues, returns, escalations, and service-level commitments."
      >
        <Button 
          variant="outline" 
          onClick={() => load(true)} 
          disabled={loading || isRefreshing}
          className="shadow-sm"
        >
          <RefreshCw className={cn('w-4 h-4 mr-1.5', (loading || isRefreshing) && 'animate-spin')} />
          {isRefreshing ? 'Updating…' : 'Refresh'}
        </Button>
        <Button asChild className="bg-ink text-white hover:bg-ink-secondary shadow-sm">
          <Link href="/tickets/new">
            <Plus className="w-4 h-4 mr-1.5" />
            New ticket
          </Link>
        </Button>
      </PageHeader>

      {/* Navigation tabs between All Tickets and Analytics */}
      <div className="flex items-center gap-1 bg-surface-muted/60 p-1 rounded-xl border border-surface-border mb-5 w-fit">
        <Link
          href="/tickets/all"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-ink shadow-sm transition-all"
        >
          <Ticket className="w-3.5 h-3.5 text-accent" />
          All Tickets
        </Link>
        <Link
          href="/tickets/analytics"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-ink-muted hover:text-ink hover:bg-white/60 transition-all"
        >
          <BarChart2 className="w-3.5 h-3.5" />
          Analytics
        </Link>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat icon={Ticket} label="Matching tickets" value={count} tone="blue" />
        <Stat icon={Inbox} label="Active on this page" value={active} tone="violet" />
        <Stat icon={AlertTriangle} label="SLA attention" value={breached} tone="red" />
        <Stat icon={CheckCircle2} label="Resolved on page" value={tickets.filter(t => ['resolved', 'solved', 'closed'].includes(t.status)).length} tone="green" />
      </div>

      {/* Tickets Table Container */}
      <div className="bg-white border border-surface-border rounded-2xl shadow-sm overflow-hidden relative">
        {/* Subtle background refresh progress line */}
        {isRefreshing && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-accent/20 overflow-hidden z-20">
            <div className="h-full bg-accent animate-pulse w-full" />
          </div>
        )}

        {/* Status Filter Tabs */}
        <div className="flex gap-1 px-4 pt-4 overflow-x-auto border-b border-surface-border">
          {statusTabs.map(([value, label]) => (
            <button 
              key={value} 
              onClick={() => setStatus(value)}
              className={cn(
                'px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors', 
                status === value 
                  ? 'border-accent text-accent' 
                  : 'border-transparent text-ink-muted hover:text-ink'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search & Select Filters */}
        <div className="p-4 grid grid-cols-1 lg:grid-cols-[minmax(260px,1fr)_160px_160px_180px] gap-3 border-b border-surface-border bg-surface-muted/20">
          <div className="relative">
            <Search className="w-4 h-4 text-ink-muted absolute left-3 top-2.5" />
            <Input 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder="Search ticket, customer, email, or order…" 
              className="pl-9 h-9 bg-white" 
            />
          </div>
          <FilterSelect value={priority} onChange={setPriority} options={['all', 'urgent', 'high', 'medium', 'normal', 'low']} label="Priority" />
          <FilterSelect value={type} onChange={setType} options={['all', 'general', 'return', 'refund', 'exchange', 'order_issue', 'complaint', 'technical']} label="Type" />
          <FilterSelect value={verification} onChange={setVerification} options={['all', 'verified', 'unverified']} label="Verification" />
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-ink-muted border-b border-surface-border bg-surface-muted/20">
                <th className="px-5 py-3 font-bold">Ticket</th>
                <th className="px-4 py-3 font-bold">Customer</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 font-bold">Priority</th>
                <th className="px-4 py-3 font-bold">Type</th>
                <th className="px-4 py-3 font-bold">SLA</th>
                <th className="px-5 py-3 font-bold">Updated</th>
              </tr>
            </thead>
            <tbody>
              {/* Existing or cached tickets */}
              {tickets.map(ticket => {
                const due = ticket.resolution_due_at ? new Date(ticket.resolution_due_at) : null
                const late = due && !ticket.resolved_at && due < new Date()
                return (
                  <tr 
                    key={ticket.id} 
                    onClick={() => router.push(`/tickets/${ticket.id}`)} 
                    className="border-b last:border-0 border-surface-border hover:bg-accent/[0.03] cursor-pointer transition-colors"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-accent/10 text-accent flex items-center justify-center shrink-0">
                          <Ticket className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xs font-mono font-bold text-accent">{ticket.ticket_number || ticket.id.slice(0, 8)}</p>
                          <p className="text-sm font-semibold text-ink mt-0.5 max-w-[320px] truncate">{ticket.subject}</p>
                          {ticket.order_number && <p className="text-[11px] text-ink-muted mt-0.5">Order {ticket.order_number}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-medium text-ink">{ticket.contacts?.name || ticket.customer_name || 'Anonymous'}</p>
                      <p className="text-xs text-ink-muted truncate max-w-[200px]">{ticket.contacts?.email || ticket.customer_email || 'No email'}</p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn('inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold capitalize', statusClass[ticket.status] || 'bg-slate-100')}>
                        {ticket.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={cn('inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold capitalize', priorityClass[ticket.priority] || priorityClass.normal)}>
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs font-medium capitalize text-ink-secondary">{(ticket.type || 'general').replace('_', ' ')}</span>
                      <div className="flex items-center gap-1 mt-1 text-[10px] text-ink-muted">
                        {ticket.verification_status === 'verified' && <ShieldCheck className="w-3 h-3 text-emerald-600" />}
                        {ticket.verification_status || 'unverified'}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className={cn('flex items-center gap-1.5 text-xs font-medium', late ? 'text-red-600' : 'text-ink-secondary')}>
                        <Clock3 className="w-3.5 h-3.5" />
                        {ticket.resolved_at ? 'Completed' : due ? formatDistanceToNow(due, { addSuffix: true }) : 'No SLA'}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-ink-muted">
                      {formatDistanceToNow(new Date(ticket.updated_at || ticket.created_at), { addSuffix: true })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Initial Loading skeleton when no cache exists yet */}
          {loading && tickets.length === 0 && (
            <div className="py-16 text-center text-sm text-ink-muted">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-accent" />
              Loading tickets…
            </div>
          )}

          {/* Empty State */}
          {!loading && tickets.length === 0 && (
            <div className="py-16 text-center">
              <Ticket className="w-8 h-8 text-ink-muted mx-auto mb-3" />
              <p className="font-semibold text-ink">No tickets found</p>
              <p className="text-sm text-ink-muted mt-1">Try changing the filters or create a ticket.</p>
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        <div className="px-5 py-3 border-t border-surface-border flex items-center justify-between text-xs text-ink-muted bg-white">
          <span>{count ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, count)} of ${count}` : '0 tickets'}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="outline" disabled={page * 25 >= count} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value, tone }: any) {
  const tones: any = { 
    blue: 'bg-blue-50 text-blue-600', 
    violet: 'bg-violet-50 text-violet-600', 
    red: 'bg-red-50 text-red-600', 
    green: 'bg-emerald-50 text-emerald-600' 
  }
  return (
    <div className="bg-white border border-surface-border rounded-xl p-4 flex items-center gap-3 shadow-sm">
      <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', tones[tone])}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div>
        <p className="text-xl font-bold text-ink">{value}</p>
        <p className="text-[11px] text-ink-muted">{label}</p>
      </div>
    </div>
  )
}

function FilterSelect({ value, onChange, options, label }: any) {
  return (
    <div className="relative">
      <Filter className="w-3.5 h-3.5 absolute left-3 top-3 text-ink-muted" />
      <select 
        value={value} 
        onChange={e => onChange(e.target.value)} 
        className="w-full h-9 pl-9 pr-3 bg-white border border-surface-border rounded-md text-xs capitalize text-ink outline-none focus:border-accent" 
        aria-label={label}
      >
        {options.map((item: string) => (
          <option key={item} value={item}>
            {item === 'all' ? `All ${label.toLowerCase()}s` : item.replace('_', ' ')}
          </option>
        ))}
      </select>
    </div>
  )
}
