'use client'
import { activeWorkspaceId } from '@/lib/client/workspace'
import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { fetchDashboardData, readDashboardData } from '@/lib/client/featureDataCache'
import {
  ShoppingCart, MessageCircle, TrendingUp, Users,
  CheckCircle2, Clock, Zap, RefreshCw, ArrowUpRight, Phone, BarChart2
} from 'lucide-react'

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'accent',
}: {
  icon: any; label: string; value: string | number; sub?: string; color?: string
}) {
  const colorMap: Record<string, string> = {
    accent: 'bg-accent/10 text-accent',
    green: 'bg-green-500/10 text-green-400',
    amber: 'bg-amber-500/10 text-amber-400',
    blue: 'bg-blue-500/10 text-blue-400',
  }

  return (
    <div className="bg-surface border border-surface-border rounded-xl p-5 flex items-start gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colorMap[color]}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-ink">{value}</p>
        <p className="text-sm font-medium text-ink mt-0.5">{label}</p>
        {sub && <p className="text-xs text-ink-muted mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Recovery Row ──────────────────────────────────────────────────────────────
function RecoveryRow({ c }: { c: any }) {
  const sentAt = c.abandoned_cart_sent_at
    ? new Date(c.abandoned_cart_sent_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '—'

  return (
    <tr className="border-b border-surface-border hover:bg-surface-muted/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-bold shrink-0">
            {(c.name || 'V').charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-ink">{c.name || 'Visitor'}</p>
            <p className="text-[11px] text-ink-muted">{c.phone || '—'}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-ink-secondary">
        ₹{Number(c.last_cart_value || 0).toLocaleString('en-IN')}
      </td>
      <td className="px-4 py-3 text-[11px] text-ink-muted">{sentAt}</td>
      <td className="px-4 py-3">
        {c.lead_status === 'won' ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 text-[11px] font-medium">
            <CheckCircle2 className="w-3 h-3" /> Recovered
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[11px] font-medium">
            <Clock className="w-3 h-3" /> Pending
          </span>
        )}
      </td>
    </tr>
  )
}

// ── Trigger Rule Row ──────────────────────────────────────────────────────────
function TriggerRow({ rule }: { rule: any }) {
  const conditions = (rule.conditions || [])
    .map((c: any) => `${c.event} ${c.operator} ${c.value}`)
    .join(' & ')

  return (
    <tr className="border-b border-surface-border hover:bg-surface-muted/30 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-accent shrink-0" />
          <span className="text-sm font-medium text-ink">{rule.name}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <code className="text-[11px] bg-surface-muted px-1.5 py-0.5 rounded border border-surface-border text-ink-secondary font-mono">
          {conditions || '(no conditions)'}
        </code>
      </td>
      <td className="px-4 py-3 text-center">
        <span className="text-sm font-bold text-ink">{rule.fire_count || 0}</span>
      </td>
      <td className="px-4 py-3 text-center">
        <div className={`inline-block w-2 h-2 rounded-full ${rule.status === 'active' ? 'bg-green-400' : 'bg-amber-400'}`} />
      </td>
    </tr>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TriggerAnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [data, setData] = useState<any>(null)
  const [clientId] = useState(() => activeWorkspaceId('') || null)

  useEffect(() => {
    if (!clientId) return
    loadData(false)
  }, [clientId, days])

  async function loadData(force = false) {
    if(!clientId)return
    const url=`/api/bots/triggers/analytics?client_id=${encodeURIComponent(clientId)}&days=${days}`
    const cached=readDashboardData<any>(url)
    if(cached){setData(cached);setLoading(false)}else setLoading(true)
    try {
      setData(await fetchDashboardData<any>(url,{force}))
    } catch {}
    setLoading(false)
  }

  const summary = data?.summary || {}
  const triggers = data?.trigger_rules || []
  const recoveries = data?.recent_recoveries || []

  const fmtCurrency = (v: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto">
      <PageHeader
        title="Proactive Triggers — Analytics"
        description="WhatsApp lead capture performance and abandoned cart recovery metrics."
      >
        <div className="flex items-center gap-2">
          {/* Day filter */}
          {[7, 30, 90].map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? 'default' : 'outline'}
              className={days === d ? 'bg-accent text-white' : 'text-ink-secondary border-surface-border'}
              onClick={() => setDays(d)}
            >
              {d}d
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
            className="border-surface-border text-ink-secondary"
            onClick={() => loadData(true)}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </PageHeader>

      {loading && !data ? (
        <div className="space-y-5" aria-label="Loading trigger analytics"><div className="grid grid-cols-2 gap-4 md:grid-cols-4">{[0,1,2,3].map(item=><div key={item} className="h-28 rounded-xl border border-surface-border bg-surface animate-pulse"/>)}</div><div className="h-72 rounded-xl border border-surface-border bg-surface animate-pulse"/></div>
      ) : (
        <div className="space-y-6">

          {/* ── KPI Strip ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={Phone}
              label="WhatsApp Leads Captured"
              value={(summary.new_leads_in_window || 0).toLocaleString()}
              sub={`${summary.total_whatsapp_leads || 0} total all-time`}
              color="green"
            />
            <StatCard
              icon={ShoppingCart}
              label="Recovery Messages Sent"
              value={(summary.recoveries_sent || 0).toLocaleString()}
              sub={`Last ${days} days`}
              color="blue"
            />
            <StatCard
              icon={CheckCircle2}
              label="Carts Recovered"
              value={`${summary.recovery_rate_pct || 0}%`}
              sub={`${summary.carts_recovered || 0} orders won`}
              color="green"
            />
            <StatCard
              icon={TrendingUp}
              label="Open Abandoned Cart Value"
              value={fmtCurrency(summary.open_cart_value || 0)}
              sub={`${summary.open_abandoned_carts || 0} carts eligible`}
              color="amber"
            />
          </div>

          {/* ── Eligibility Banner ─────────────────────────────────────── */}
          {summary.open_abandoned_carts > 0 && (
            <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl p-4">
              <ShoppingCart className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-300">
                  {summary.open_abandoned_carts} cart{summary.open_abandoned_carts !== 1 ? 's' : ''} eligible for recovery right now
                </p>
                <p className="text-xs text-amber-400/70 mt-0.5">
                  Total value: {fmtCurrency(summary.open_cart_value)} — contacts have opted-in WhatsApp number and idle &gt; 1 hour.
                  Recovery messages will be sent automatically by the scheduled cron.
                </p>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-6">

            {/* ── Active Trigger Rules ───────────────────────────────── */}
            <div className="bg-surface border border-surface-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-border flex items-center gap-2">
                <Zap className="w-4 h-4 text-accent" />
                <h3 className="text-sm font-semibold text-ink">Active Trigger Rules</h3>
                <span className="ml-auto text-xs text-ink-muted">{triggers.length} rules</span>
              </div>
              {triggers.length === 0 ? (
                <div className="p-8 text-center text-sm text-ink-muted">
                  No trigger rules configured yet.{' '}
                  <a href="/bots/triggers" className="text-accent hover:underline">Create one →</a>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-surface-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">Rule</th>
                      <th className="px-4 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">Condition</th>
                      <th className="px-4 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide text-center">Fires</th>
                      <th className="px-4 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {triggers.map((r: any) => <TriggerRow key={r.id} rule={r} />)}
                  </tbody>
                </table>
              )}
              <div className="p-3 border-t border-surface-border">
                <a
                  href="/bots/triggers"
                  className="flex items-center gap-1 text-xs text-accent hover:underline"
                >
                  Manage trigger rules <ArrowUpRight className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* ── Recent Recovery Sends ──────────────────────────────── */}
            <div className="bg-surface border border-surface-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-border flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-green-400" />
                <h3 className="text-sm font-semibold text-ink">Recent Recovery Sends</h3>
                <span className="ml-auto text-xs text-ink-muted">Last {days} days</span>
              </div>
              {recoveries.length === 0 ? (
                <div className="p-8 text-center text-sm text-ink-muted">
                  No recovery messages sent in this period.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-surface-muted/50">
                      <tr>
                        <th className="px-4 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">Contact</th>
                        <th className="px-4 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">Cart</th>
                        <th className="px-4 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">Sent At</th>
                        <th className="px-4 py-2 text-xs font-semibold text-ink-muted uppercase tracking-wide">Outcome</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recoveries.map((c: any) => <RecoveryRow key={c.id} c={c} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* ── How It Works ──────────────────────────────────────────── */}
          <div className="bg-surface border border-surface-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-ink mb-4">How the WhatsApp Recovery Pipeline Works</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { icon: ShoppingCart, step: '1', text: 'Shopper adds items & tracker.js fires cart_updated' },
                { icon: Zap, step: '2', text: 'Trigger rule fires upsell message in widget chat' },
                { icon: Phone, step: '3', text: 'Shopper enters WhatsApp number → lead captured' },
                { icon: Clock, step: '4', text: 'Cron detects idle cart > 1h with known phone' },
                { icon: MessageCircle, step: '5', text: 'WhatsApp template message sent via Meta API' },
              ].map((s, i) => (
                <div key={i} className="flex flex-col items-center text-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center">
                    <s.icon className="w-4 h-4 text-accent" />
                  </div>
                  <span className="text-[10px] font-bold text-accent">Step {s.step}</span>
                  <p className="text-xs text-ink-secondary leading-relaxed">{s.text}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
