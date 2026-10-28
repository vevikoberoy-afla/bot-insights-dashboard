'use client'
import { activeWorkspaceId } from '@/lib/client/workspace'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { 
  AlertTriangle, 
  ArrowLeft, 
  BarChart2, 
  CheckCircle2, 
  Clock3, 
  RefreshCw, 
  Star, 
  Ticket 
} from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase-browser'
import { cn } from '@/lib/utils'
import { 
  getAnalyticsCacheKey, 
  getCachedAnalytics, 
  getStoredClientId, 
  setCachedAnalytics, 
  setStoredClientId 
} from '@/lib/tickets-cache'

export default function TicketAnalyticsPage() {
  const supabase = useMemo(() => createClient(), [])

  // Synchronously resolve clientId
  const [clientId, setClientId] = useState<string>(() => getStoredClientId())
  const [days, setDays] = useState(30)

  // Initial cache lookup for 0ms instantaneous display
  const initialCacheKey = useMemo(() => {
    const id = getStoredClientId()
    return id ? getAnalyticsCacheKey(id, 30) : ''
  }, [])

  const initialCached = useMemo(() => {
    return initialCacheKey ? getCachedAnalytics(initialCacheKey) : null
  }, [initialCacheKey])

  const [data, setData] = useState<any>(() => initialCached?.data || null)
  const [loading, setLoading] = useState<boolean>(() => !initialCached)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(() => !!initialCached?.isStale)

  // Supabase Auth identity sync
  useEffect(() => {
    supabase.auth.getUser().then(({ data: auth }) => {
      const id = activeWorkspaceId(auth.user?.id || '') || ''
      if (id) {
        setStoredClientId(id)
        setClientId(prev => (prev !== id ? id : prev))
      }
    })
  }, [supabase])

  const isFetchingRef = useRef(false)

  // Fetch or load from cache
  const load = useCallback(async (force = false) => {
    const activeClientId = clientId || getStoredClientId()
    if (!activeClientId) return

    const cacheKey = getAnalyticsCacheKey(activeClientId, days)

    // ── 1. Serve cache instantly if available (0ms) ──
    const cached = getCachedAnalytics(cacheKey)
    if (cached && !force) {
      setData(cached.data)
      setLoading(false)

      if (!cached.isStale) {
        setIsRefreshing(false)
        return
      }

      // Stale-While-Revalidate: serve cached data immediately, lazyload in background
      setIsRefreshing(true)
    } else if (!cached && !data) {
      setLoading(true)
    } else {
      setIsRefreshing(true)
    }

    if (isFetchingRef.current) return
    isFetchingRef.current = true

    try {
      const res = await fetch(`/api/tickets/analytics?client_id=${activeClientId}&days=${days}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
        setCachedAnalytics(cacheKey, json)
      }
    } catch (err) {
      console.error('Failed to load ticket analytics', err)
    } finally {
      isFetchingRef.current = false
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [clientId, days, data])

  useEffect(() => {
    load()
  }, [load])

  const maxDaily = Math.max(1, ...Object.values(data?.daily || {}).map(Number))

  return (
    <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto animate-in fade-in duration-300">
      <PageHeader 
        title="Ticket analytics" 
        description="Volume, resolution performance, SLA risk, and customer satisfaction."
      >
        <select 
          value={days} 
          onChange={e => setDays(Number(e.target.value))} 
          className="h-9 px-3 border border-surface-border bg-white rounded-md text-xs font-medium text-ink outline-none focus:border-accent shadow-sm"
        >
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
        <Button 
          variant="outline" 
          onClick={() => load(true)} 
          disabled={loading || isRefreshing}
          className="shadow-sm"
        >
          <RefreshCw className={cn('w-4 h-4 mr-1.5', (loading || isRefreshing) && 'animate-spin')} />
          {isRefreshing ? 'Updating…' : 'Refresh'}
        </Button>
        <Button asChild variant="outline" className="shadow-sm">
          <Link href="/tickets/all">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Tickets
          </Link>
        </Button>
      </PageHeader>

      {/* Navigation tabs between All Tickets and Analytics */}
      <div className="flex items-center gap-1 bg-surface-muted/60 p-1 rounded-xl border border-surface-border mb-5 w-fit">
        <Link
          href="/tickets/all"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-ink-muted hover:text-ink hover:bg-white/60 transition-all"
        >
          <Ticket className="w-3.5 h-3.5" />
          All Tickets
        </Link>
        <Link
          href="/tickets/analytics"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-ink shadow-sm transition-all"
        >
          <BarChart2 className="w-3.5 h-3.5 text-accent" />
          Analytics
        </Link>
      </div>

      {/* First-load spinner when no cache exists */}
      {loading && !data && (
        <div className="py-20 text-center text-sm text-ink-muted bg-white border border-surface-border rounded-2xl shadow-sm">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-accent" />
          Loading analytics…
        </div>
      )}

      {/* Cached or loaded data presentation */}
      {data && (
        <div className="space-y-5 relative">
          {/* Subtle background refresh line */}
          {isRefreshing && (
            <div className="absolute -top-2 left-0 right-0 h-0.5 bg-accent/20 overflow-hidden rounded-full">
              <div className="h-full bg-accent animate-pulse w-full" />
            </div>
          )}

          {/* Top Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Metric icon={Ticket} label="Created" value={data.total} tone="blue" />
            <Metric icon={Clock3} label="Open" value={data.open} tone="violet" />
            <Metric icon={CheckCircle2} label="Resolved" value={data.resolved} tone="green" />
            <Metric icon={AlertTriangle} label="SLA breached" value={data.sla_breached} tone="red" />
            <Metric icon={Star} label="Average CSAT" value={data.avg_csat ? `${data.avg_csat.toFixed(1)} / 5` : '—'} tone="amber" />
          </div>

          {/* Charts & Breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-white border border-surface-border rounded-2xl shadow-sm p-5">
              <div className="flex items-end justify-between">
                <div>
                  <h2 className="text-sm font-bold text-ink">Ticket volume</h2>
                  <p className="text-xs text-ink-muted mt-1">Tickets created per day</p>
                </div>
                <p className="text-sm font-bold text-ink">
                  {data.avg_resolution_hours ? `${data.avg_resolution_hours.toFixed(1)}h avg. resolution` : 'No resolved tickets'}
                </p>
              </div>
              <div className="h-60 flex items-end gap-1.5 mt-8 border-b border-surface-border pb-1">
                {Object.entries(data.daily || {}).sort().map(([date, count]: any) => (
                  <div 
                    key={date} 
                    title={`${date}: ${count}`} 
                    className="flex-1 min-w-1 bg-accent/70 hover:bg-accent rounded-t transition-colors" 
                    style={{ height: `${Math.max(5, count / maxDaily * 100)}%` }} 
                  />
                ))}
                {!Object.keys(data.daily || {}).length && (
                  <p className="text-sm text-ink-muted m-auto">No ticket activity in this period.</p>
                )}
              </div>
            </div>

            <Breakdown title="By status" values={data.by_status} />
            <Breakdown title="By priority" values={data.by_priority} />
            <Breakdown title="By issue type" values={data.by_type} className="lg:col-span-2" />
          </div>
        </div>
      )}
    </div>
  )
}

function Metric({ icon: Icon, label, value, tone }: any) { 
  const colors: any = { 
    blue: 'bg-blue-50 text-blue-600', 
    violet: 'bg-violet-50 text-violet-600', 
    green: 'bg-emerald-50 text-emerald-600', 
    red: 'bg-red-50 text-red-600', 
    amber: 'bg-amber-50 text-amber-600' 
  } 
  return (
    <div className="bg-white border border-surface-border rounded-xl p-4 shadow-sm">
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center mb-3', colors[tone])}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-xl font-bold text-ink">{value}</p>
      <p className="text-[11px] text-ink-muted mt-0.5">{label}</p>
    </div>
  ) 
}

function Breakdown({ title, values, className }: any) { 
  const entries = Object.entries(values || {}) as [string, number][] 
  const max = Math.max(1, ...entries.map(([,n]) => n)) 
  return (
    <div className={cn('bg-white border border-surface-border rounded-2xl shadow-sm p-5', className)}>
      <h2 className="text-sm font-bold text-ink mb-4">{title}</h2>
      <div className="space-y-3">
        {entries.map(([label, count]) => (
          <div key={label}>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="font-medium capitalize text-ink-secondary">{label.replace('_',' ')}</span>
              <span className="font-bold text-ink">{count}</span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-muted">
              <div className="h-full rounded-full bg-accent" style={{ width: `${count / max * 100}%` }} />
            </div>
          </div>
        ))}
        {!entries.length && <p className="text-xs text-ink-muted">No data yet.</p>}
      </div>
    </div>
  ) 
}
