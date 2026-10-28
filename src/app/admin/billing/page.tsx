'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import {getVerifiedAccessToken} from '@/lib/client/verifiedAuth'
import { useCachedFetch, useInvalidate } from '@/lib/cache'

export default function BillingPage() {
  const supabase = createClient()
  const [activeClientId, setActiveClientId] = useState<string | null>(null)
  
  // --- Cached clients list ---
  const fetcherClients = useCallback(async () => {
    const accessToken=await getVerifiedAccessToken(supabase)
    if (!accessToken) return []
    const res = await fetch('/api/clients', { headers: { 'Authorization': `Bearer ${accessToken}` } })
    if (!res.ok) return []
    const data = await res.json()
    return data.clients ?? []
  }, [supabase])
  const { data: clients = [] } = useCachedFetch('clients', fetcherClients)

  // Set first client once clients load
  useEffect(() => {
    if (clients.length > 0 && !activeClientId) setActiveClientId(clients[0].id)
  }, [clients])

  // --- Cached billing ---
  const fetcherBilling = useCallback(async () => {
    if (!activeClientId) return { subscription: null, invoices: [] }
    const res = await fetch(`/api/billing?client_id=${activeClientId}`)
    if (!res.ok) return { subscription: null, invoices: [] }
    const data = await res.json()
    return { subscription: data.subscription, invoices: data.invoices || [] }
  }, [activeClientId])
  
  const { data: billingData = { subscription: null, invoices: [] }, loading } = useCachedFetch(`billing:${activeClientId}`, fetcherBilling)
  const { subscription, invoices } = billingData

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Billing & Plan</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Manage your subscription and payments</p>
        </div>
        
        {clients.length > 1 && (
          <select
            value={activeClientId || ''}
            onChange={(e) => setActiveClientId(e.target.value)}
            className="px-3 py-2 bg-surface-tertiary border border-[var(--border-subtle)] rounded-lg text-sm text-white focus:border-brand focus:outline-none"
          >
            {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-brand border-t-transparent animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Current Plan */}
            <div className="lg:col-span-2 bg-surface-secondary border border-[var(--border-subtle)] rounded-2xl p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-semibold mb-1">Current Plan</p>
                  <h2 className="text-2xl font-bold text-white capitalize">{subscription?.plans?.name || 'Free Tier'}</h2>
                  {subscription?.plans && (
                    <p className="text-[var(--text-secondary)] text-sm mt-1">${subscription.plans.price}/month · Renews {new Date(subscription.current_period_end).toLocaleDateString()}</p>
                  )}
                  {!subscription?.plans && (
                    <p className="text-[var(--text-secondary)] text-sm mt-1">Upgrade to unlock more features</p>
                  )}
                </div>
                <button className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition-all hover:shadow-glow">Upgrade Plan</button>
              </div>
              
              {/* Usage meters */}
              <div className="space-y-4">
                {[
                  { label: 'Messages', used: 1240, limit: subscription?.plans?.message_limit || 1000 },
                  { label: 'Bots', used: 1, limit: subscription?.plans?.bot_limit || 1 },
                  { label: 'Channels', used: 1, limit: subscription?.plans?.channel_limit || 1 },
                ].map(m => (
                  <div key={m.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm text-[var(--text-secondary)]">{m.label}</span>
                      <span className="text-xs font-mono text-[var(--text-tertiary)]">{m.used.toLocaleString()} / {m.limit.toLocaleString()}</span>
                    </div>
                    <div className="h-2 bg-surface-quaternary rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${m.used > m.limit ? 'bg-red-500' : 'bg-brand'}`} style={{ width: `${Math.min((m.used / m.limit) * 100, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Payment Method */}
            <div className="bg-surface-secondary border border-[var(--border-subtle)] rounded-2xl p-6">
              <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wider font-semibold mb-4">Payment Method</p>
              
              {subscription?.stripe_customer_id ? (
                <>
                  <div className="bg-surface-quaternary rounded-xl p-4 mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-7 rounded bg-gradient-to-r from-blue-600 to-blue-400 flex items-center justify-center text-[8px] font-bold text-white tracking-wider">VISA</div>
                      <div>
                        <p className="text-sm text-white font-mono">•••• •••• •••• 4242</p>
                        <p className="text-[10px] text-[var(--text-disabled)]">Expires 12/28</p>
                      </div>
                    </div>
                  </div>
                  <button className="w-full px-4 py-2 rounded-xl bg-surface-tertiary border border-[var(--border-subtle)] text-[var(--text-secondary)] text-sm font-medium hover:text-white hover:border-[var(--border-default)] transition-all">Update Card</button>
                </>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-[var(--text-secondary)] mb-4">No payment method on file</p>
                  <button className="px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium transition-all">Add Card</button>
                </div>
              )}
            </div>
          </div>

          {/* Invoice History */}
          <div className="bg-surface-secondary border border-[var(--border-subtle)] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-[var(--border-subtle)]">
              <h3 className="text-sm font-semibold text-white">Invoice History</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)]">
                  {['Date', 'Amount', 'Status', 'Download'].map(h => (
                    <th key={h} className="text-left px-6 py-3 text-[10px] font-semibold text-[var(--text-disabled)] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-[var(--text-disabled)] text-sm">No invoices found</td></tr>
                ) : (
                  invoices.map((inv: any) => (
                    <tr key={inv.id} className="border-b border-[var(--border-subtle)]">
                      <td className="px-6 py-3 text-sm text-white">{new Date(inv.created_at).toLocaleDateString()}</td>
                      <td className="px-6 py-3 text-sm text-white font-mono">${inv.amount}</td>
                      <td className="px-6 py-3">
                        <span className={`text-[10px] font-medium border rounded-full px-2.5 py-0.5 capitalize ${inv.status === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="px-6 py-3"><button className="text-xs text-brand hover:text-brand-hover transition-colors">Download PDF</button></td>
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
