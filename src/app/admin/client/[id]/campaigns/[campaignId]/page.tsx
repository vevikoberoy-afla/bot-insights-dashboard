'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

interface CampaignStats {
  sent: number
  delivered: number
  opened: number
  clicked: number
  failed: number
  replied?: number
}

export default function ClientCampaignDetailPage() {
  const router = useRouter()
  const params = useParams()
  const supabase = createClient()
  const clientId = params.id as string
  const campaignId = params.campaignId as string

  const [campaign, setCampaign] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'funnel' | 'financials' | 'orders'>('funnel')

  // Financials State
  const [budgets, setBudgets] = useState<any[]>([])
  const [expenses, setExpenses] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [financialsLoading, setFinancialsLoading] = useState(false)

  // Forms
  const [budgetForm, setBudgetForm] = useState({ amount: '', description: '' })
  const [expenseForm, setExpenseForm] = useState({ amount: '', description: '' })
  const [orderForm, setOrderForm] = useState({ total_amount: '' })
  
  // Edit Settings
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [editForm, setEditForm] = useState<any>({ target_revenue: 0, start_date: '', finish_date: '', sales_team_assignment: '' })

  useEffect(() => {
    fetchCampaign()
  }, [])

  async function fetchCampaign() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select(`*, contact_segments(name)`)
        .eq('id', campaignId)
        .eq('client_id', clientId)
        .single()

      if (data) {
        setCampaign(data)
        fetchERPData()
      }
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  async function fetchERPData() {
    setFinancialsLoading(true)
    try {
      const [bRes, eRes, oRes] = await Promise.all([
        fetch(`/api/erp/budgets?campaign_id=${campaignId}`),
        fetch(`/api/erp/expenses?campaign_id=${campaignId}`),
        fetch(`/api/erp/orders?campaign_id=${campaignId}`)
      ])
      if (bRes.ok) setBudgets(await bRes.json())
      if (eRes.ok) setExpenses(await eRes.json())
      if (oRes.ok) setOrders(await oRes.json())
    } catch (e) { console.error(e) }
    setFinancialsLoading(false)
  }

  async function handleAddBudget() {
    if (!budgetForm.amount) return
    try {
      await fetch('/api/erp/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, campaign_id: campaignId, ...budgetForm })
      })
      setBudgetForm({ amount: '', description: '' })
      fetchERPData()
    } catch (e) { console.error(e) }
  }

  async function handleAddExpense() {
    if (!expenseForm.amount) return
    try {
      await fetch('/api/erp/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, campaign_id: campaignId, ...expenseForm })
      })
      setExpenseForm({ amount: '', description: '' })
      fetchERPData()
    } catch (e) { console.error(e) }
  }

  async function handleAddOrder() {
    if (!orderForm.total_amount) return
    try {
      await fetch('/api/erp/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, campaign_id: campaignId, total_amount: orderForm.total_amount })
      })
      setOrderForm({ total_amount: '' })
      fetchERPData()
    } catch (e) { console.error(e) }
  }

  async function toggleStatus(endpoint: string, id: string, currentStatus: string, options: string[]) {
    const nextIndex = (options.indexOf(currentStatus) + 1) % options.length
    const nextStatus = options[nextIndex]
    try {
      await fetch(`/api/erp/${endpoint}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: nextStatus })
      })
      fetchERPData()
    } catch (e) { console.error(e) }
  }

  function openSettingsModal() {
    setEditForm({
      target_revenue: campaign.target_revenue || 0,
      start_date: campaign.start_date ? new Date(campaign.start_date).toISOString().split('T')[0] : '',
      finish_date: campaign.finish_date ? new Date(campaign.finish_date).toISOString().split('T')[0] : '',
      sales_team_assignment: campaign.sales_team_assignment || ''
    })
    setShowSettingsModal(true)
  }

  async function handleSaveSettings() {
    try {
      const res = await fetch('/api/campaigns', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: campaignId, ...editForm })
      })
      if (res.ok) {
        setShowSettingsModal(false)
        fetchCampaign()
      }
    } catch (e) { console.error(e) }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-purple-500 border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex items-center justify-center">
        <p className="text-gray-500">Campaign not found</p>
      </div>
    )
  }

  const stats: CampaignStats = campaign.stats || { sent: 0, delivered: 0, opened: 0, clicked: 0, failed: 0, replied: 0 }
  
  // Calculate funnel percentages
  const sent = stats.sent || 0
  const delivered = stats.delivered || 0
  const opened = stats.opened || 0
  const clicked = stats.clicked || 0
  
  const deliveredPct = sent > 0 ? Math.round((delivered / sent) * 100) : 0
  const openedPct = delivered > 0 ? Math.round((opened / delivered) * 100) : 0
  const clickedPct = opened > 0 ? Math.round((clicked / opened) * 100) : 0

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#0a0a0a]/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <button onClick={() => router.push(`/admin/client/${clientId}?tab=campaigns`)} className="text-gray-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-lg font-semibold">{campaign.name}</h1>
            <p className="text-xs text-gray-500 capitalize">{campaign.channel} Campaign • {campaign.status}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        
        {/* Campaign ERP Overview Header */}
        <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-6 mb-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white">{campaign.campaign_number || 'CMP-PENDING'}</h2>
              <button onClick={openSettingsModal} className="text-xs px-3 py-1 bg-white/5 hover:bg-white/10 text-gray-400 rounded-full transition-colors border border-white/[0.06]">Edit Settings</button>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
              <span>Target: <strong className="text-white">${campaign.target_revenue?.toLocaleString() || 0}</strong></span>
              <span>•</span>
              <span>Start: <strong className="text-white">{campaign.start_date ? new Date(campaign.start_date).toLocaleDateString() : 'TBD'}</strong></span>
              <span>•</span>
              <span>Team: <strong className="text-white">{campaign.sales_team_assignment || 'Unassigned'}</strong></span>
            </div>
          </div>
          <div className="flex bg-[#0a0a0a] p-1 rounded-xl border border-white/[0.06]">
            <button onClick={() => setTab('funnel')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'funnel' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}>Delivery Funnel</button>
            <button onClick={() => setTab('financials')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'financials' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}>Financials</button>
            <button onClick={() => setTab('orders')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'orders' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}>Sales Orders</button>
          </div>
        </div>

        {tab === 'funnel' && (
          <>
            {/* Funnel Visualization */}
            <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-8 mb-8">
              <h2 className="text-sm font-semibold text-white mb-8">Campaign Funnel Analytics</h2>
              
              <div className="flex justify-between items-center relative">
                {/* Connecting Line */}
                <div className="absolute top-1/2 left-0 w-full h-1 bg-white/[0.04] -translate-y-1/2 z-0 rounded-full" />
                
                {/* Step 1: Sent */}
                <div className="relative z-10 flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.15)]">
                    <span className="text-xl">🚀</span>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-white">{sent}</p>
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Sent</p>
                  </div>
                </div>

                {/* Step 2: Delivered */}
                <div className="relative z-10 flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.15)]">
                    <span className="text-xl">📨</span>
                  </div>
                  <div className="text-center">
                    <div className="flex items-baseline gap-2 justify-center">
                      <p className="text-2xl font-bold text-white">{delivered}</p>
                      <p className="text-xs text-emerald-400 font-medium">{deliveredPct}%</p>
                    </div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Delivered</p>
                  </div>
                </div>

                {/* Step 3: Opened */}
                <div className="relative z-10 flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.15)]">
                    <span className="text-xl">👀</span>
                  </div>
                  <div className="text-center">
                    <div className="flex items-baseline gap-2 justify-center">
                      <p className="text-2xl font-bold text-white">{opened}</p>
                      <p className="text-xs text-amber-400 font-medium">{openedPct}%</p>
                    </div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Opened</p>
                  </div>
                </div>

                {/* Step 4: Clicked/Responded */}
                <div className="relative z-10 flex flex-col items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center shadow-[0_0_30px_rgba(168,85,247,0.15)]">
                    <span className="text-xl">🎯</span>
                  </div>
                  <div className="text-center">
                    <div className="flex items-baseline gap-2 justify-center">
                      <p className="text-2xl font-bold text-white">{clicked}</p>
                      <p className="text-xs text-purple-400 font-medium">{clickedPct}%</p>
                    </div>
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Clicked / Replied</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6">
              <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-6">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Target Audience</h3>
                <p className="text-lg font-medium text-white">{campaign.contact_segments?.name || 'All Contacts'}</p>
              </div>
              <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-6">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">Send Date</h3>
                <p className="text-lg font-medium text-white">{campaign.sent_at ? new Date(campaign.sent_at).toLocaleString() : 'Not sent yet'}</p>
              </div>
              <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-6">
                <h3 className="text-xs font-semibold text-red-500/80 uppercase tracking-wider mb-4">Bounce / Fail Rate</h3>
                <p className="text-lg font-medium text-white">{stats.failed || 0} <span className="text-sm text-gray-500 font-normal">contacts failed</span></p>
              </div>
            </div>
          </>
        )}

        {tab === 'financials' && (
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-6">
              <div className="bg-[#111] border border-emerald-500/20 rounded-2xl p-6">
                <h3 className="text-xs font-semibold text-emerald-500 uppercase tracking-wider mb-2">Total Budget</h3>
                <p className="text-3xl font-bold text-white">${budgets.reduce((sum, b) => sum + Number(b.amount), 0).toLocaleString()}</p>
              </div>
              <div className="bg-[#111] border border-amber-500/20 rounded-2xl p-6">
                <h3 className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-2">Total Expenses</h3>
                <p className="text-3xl font-bold text-white">${expenses.reduce((sum, e) => sum + Number(e.amount), 0).toLocaleString()}</p>
              </div>
              <div className="bg-[#111] border border-purple-500/20 rounded-2xl p-6">
                <h3 className="text-xs font-semibold text-purple-500 uppercase tracking-wider mb-2">Remaining</h3>
                <p className="text-3xl font-bold text-white">
                  ${(budgets.reduce((sum, b) => sum + Number(b.amount), 0) - expenses.reduce((sum, e) => sum + Number(e.amount), 0)).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-white mb-4">Budgets Allocation</h3>
                <div className="flex gap-2 mb-4">
                  <input type="number" value={budgetForm.amount} onChange={e => setBudgetForm({...budgetForm, amount: e.target.value})} placeholder="Amount ($)" className="w-1/3 bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none" />
                  <input value={budgetForm.description} onChange={e => setBudgetForm({...budgetForm, description: e.target.value})} placeholder="Description" className="flex-1 bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none" />
                  <button onClick={handleAddBudget} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium">Add</button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {budgets.map(b => (
                    <div key={b.id} className="flex justify-between items-center bg-[#0a0a0a] p-3 rounded-lg border border-white/[0.04]">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white">{b.budget_number}</p>
                          <button 
                            onClick={() => toggleStatus('budgets', b.id, b.status, ['pending', 'approved', 'exhausted'])}
                            className="text-[10px] font-medium border border-gray-700 hover:border-gray-500 rounded-full px-2 py-0.5 capitalize text-gray-300 transition-colors"
                          >
                            {b.status}
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{b.description || 'No description'}</p>
                        <p className="text-[10px] text-gray-600 mt-1">{new Date(b.budget_date).toLocaleDateString()}</p>
                      </div>
                      <p className="text-emerald-400 font-semibold">+${Number(b.amount).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-white mb-4">Campaign Expenses</h3>
                <div className="flex gap-2 mb-4">
                  <input type="number" value={expenseForm.amount} onChange={e => setExpenseForm({...expenseForm, amount: e.target.value})} placeholder="Amount ($)" className="w-1/3 bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none" />
                  <input value={expenseForm.description} onChange={e => setExpenseForm({...expenseForm, description: e.target.value})} placeholder="Description" className="flex-1 bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none" />
                  <button onClick={handleAddExpense} className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-sm font-medium">Add</button>
                </div>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {expenses.map(e => (
                    <div key={e.id} className="flex justify-between items-center bg-[#0a0a0a] p-3 rounded-lg border border-white/[0.04]">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white">{e.expense_number}</p>
                          <button 
                            onClick={() => toggleStatus('expenses', e.id, e.status, ['pending', 'paid', 'rejected'])}
                            className="text-[10px] font-medium border border-gray-700 hover:border-gray-500 rounded-full px-2 py-0.5 capitalize text-gray-300 transition-colors"
                          >
                            {e.status}
                          </button>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{e.description || 'No description'}</p>
                        <p className="text-[10px] text-gray-600 mt-1">{new Date(e.expense_date).toLocaleDateString()}</p>
                      </div>
                      <p className="text-amber-400 font-semibold">-${Number(e.amount).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'orders' && (
          <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-semibold text-white">Sales Orders</h3>
              <div className="flex gap-2">
                <input type="number" value={orderForm.total_amount} onChange={e => setOrderForm({...orderForm, total_amount: e.target.value})} placeholder="Manual Order Amount ($)" className="bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none w-64" />
                <button onClick={handleAddOrder} className="px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl text-sm font-medium transition-colors">Log Sale</button>
              </div>
            </div>
            
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06] bg-[#0a0a0a]/50">
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase">Order #</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase">Customer</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase">Amount</th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500 text-sm">No sales generated yet.</td></tr>
                ) : (
                  orders.map(o => (
                    <tr key={o.id} className="border-b border-white/[0.04] hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3 text-sm text-white font-mono">{o.order_number}</td>
                      <td className="px-4 py-3 text-sm text-gray-400">{o.contacts?.name || 'Guest'}</td>
                      <td className="px-4 py-3">
                        <button 
                          onClick={() => toggleStatus('orders', o.id, o.status, ['processing', 'completed', 'refunded'])}
                          className="text-[10px] font-medium border border-emerald-500/20 hover:border-emerald-500/50 bg-emerald-500/10 text-emerald-400 rounded-full px-2 py-0.5 capitalize transition-colors"
                        >
                          {o.status}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-white">${Number(o.total_amount).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{new Date(o.order_date).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        
      </main>

      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#111] border border-white/[0.08] rounded-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-white mb-4">Edit Campaign ERP Settings</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Target Revenue ($)</label>
                <input type="number" value={editForm.target_revenue} onChange={e => setEditForm({...editForm, target_revenue: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Start Date</label>
                  <input type="date" value={editForm.start_date} onChange={e => setEditForm({...editForm, start_date: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">Finish Date</label>
                  <input type="date" value={editForm.finish_date} onChange={e => setEditForm({...editForm, finish_date: e.target.value})} className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Sales Team Assignment</label>
                <input type="text" value={editForm.sales_team_assignment} onChange={e => setEditForm({...editForm, sales_team_assignment: e.target.value})} placeholder="e.g. Enterprise Team A" className="w-full bg-[#0a0a0a] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none" />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowSettingsModal(false)} className="px-4 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={handleSaveSettings} className="px-4 py-2 bg-brand hover:bg-brand-hover text-white rounded-xl text-sm font-medium transition-colors">Save Changes</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
