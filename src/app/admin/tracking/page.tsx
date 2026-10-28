'use client'
import { useState, useEffect } from 'react'

export default function PlatformTrackingPage() {
  const [loading, setLoading] = useState(true)
  const [usage, setUsage] = useState<any>(null)
  const [revenue, setRevenue] = useState<any>(null)
  const [health, setHealth] = useState<any>(null)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    try {
      const [resUsage, resRev, resHealth] = await Promise.all([
        fetch('/api/admin/usage'),
        fetch('/api/admin/revenue'),
        fetch('/api/admin/health')
      ])

      if (resUsage.ok) setUsage(await resUsage.json())
      if (resRev.ok) setRevenue(await resRev.json())
      if (resHealth.ok) setHealth(await resHealth.json())
    } catch (err) {
      console.error(err)
    }
    setLoading(false)
  }

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Platform Tracking</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">Super-admin view of platform health, usage, and revenue.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-32"><div className="w-8 h-8 rounded-full border-4 border-brand border-t-transparent animate-spin" /></div>
      ) : (
        <>
          {/* Revenue KPI Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-surface-secondary border border-[var(--border-subtle)] rounded-2xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10 text-5xl">💰</div>
              <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Monthly Recurring Revenue (MRR)</p>
              <p className="text-4xl font-bold text-emerald-400 mt-2 mb-1">${revenue?.mrr?.toLocaleString() || 0}</p>
              <p className="text-[10px] text-[var(--text-secondary)]">From {revenue?.active_clients || 0} active subscriptions</p>
            </div>
            
            <div className="bg-surface-secondary border border-[var(--border-subtle)] rounded-2xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10 text-5xl">📈</div>
              <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Annual Run Rate (ARR)</p>
              <p className="text-4xl font-bold text-white mt-2 mb-1">${revenue?.arr?.toLocaleString() || 0}</p>
              <p className="text-[10px] text-[var(--text-secondary)]">Projected 12-month revenue</p>
            </div>

            <div className="bg-surface-secondary border border-[var(--border-subtle)] rounded-2xl p-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10 text-5xl">🏢</div>
              <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">Active Clients</p>
              <p className="text-4xl font-bold text-white mt-2 mb-1">{revenue?.active_clients || 0}</p>
              <p className="text-[10px] text-[var(--text-secondary)]">Total paying customers</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* System Health Status */}
            <div className="bg-surface-secondary border border-[var(--border-subtle)] rounded-2xl p-6">
              <h2 className="text-sm font-bold text-white mb-6">Service Health & Latency</h2>
              <div className="space-y-4">
                {health && Object.entries(health).map(([service, data]: [string, any]) => (
                  <div key={service} className="flex items-center justify-between p-3 rounded-xl bg-surface-tertiary/50 border border-[var(--border-subtle)]">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${data.status === 'operational' ? 'bg-emerald-400' : 'bg-red-400'} shadow-[0_0_8px_currentColor]`} />
                      <span className="text-sm font-medium text-white capitalize">{service.replace('_', ' ')}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-[var(--text-secondary)] font-mono">{data.latency}</span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded capitalize ${data.status === 'operational' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {data.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* API Cost & Usage Summary */}
            <div className="bg-surface-secondary border border-[var(--border-subtle)] rounded-2xl p-6">
              <h2 className="text-sm font-bold text-white mb-6">Provider API Costs (Today)</h2>
              <div className="space-y-4">
                {usage?.summary ? Object.entries(usage.summary).map(([provider, data]: [string, any]) => (
                  <div key={provider} className="flex flex-col gap-1.5 p-4 rounded-xl bg-surface-tertiary/50 border border-[var(--border-subtle)]">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-white capitalize">{provider}</span>
                      <span className="text-sm font-bold text-amber-400">${data.cost.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-[var(--text-secondary)]">{data.calls.toLocaleString()} API calls made</span>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-10 text-[var(--text-disabled)] text-sm">No API usage recorded today.</div>
                )}
              </div>
            </div>

          </div>

          {/* Raw Usage Log Table */}
          <div className="bg-surface-secondary border border-[var(--border-subtle)] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-semibold text-white">Detailed Usage Log</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  {['Date', 'Client', 'Provider', 'Calls', 'Cost Est.'].map(h => (
                    <th key={h} className="text-left px-6 py-3 text-[10px] font-semibold text-[var(--text-disabled)] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usage?.logs?.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-[var(--text-disabled)] text-sm">No logs found</td></tr>
                ) : (
                  usage?.logs?.map((log: any) => (
                    <tr key={log.id} className="border-b border-[var(--border-subtle)] hover:bg-surface-hover transition-colors">
                      <td className="px-6 py-3 text-sm text-[var(--text-secondary)]">{new Date(log.created_at).toLocaleDateString()}</td>
                      <td className="px-6 py-3 text-sm text-white">{log.clients?.name || 'Unknown'}</td>
                      <td className="px-6 py-3 text-sm text-[var(--text-secondary)] capitalize">{log.provider}</td>
                      <td className="px-6 py-3 text-sm text-white font-mono">{log.calls_count}</td>
                      <td className="px-6 py-3 text-sm font-mono text-amber-400">${Number(log.cost_estimate).toFixed(4)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
