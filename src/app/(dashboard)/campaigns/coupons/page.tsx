'use client'
import { useState, useEffect } from 'react'
import {fetchDashboardData,readDashboardData} from '@/lib/client/featureDataCache'

interface Coupon {
  id: string
  code: string
  discount_type: 'percentage' | 'fixed'
  discount_value: number
  min_cart_value: number
  is_active: boolean
  created_at: string
}

export default function CouponsPage() {
  const initial=readDashboardData<any>('/api/settings/coupons')
  const [coupons, setCoupons] = useState<Coupon[]>(initial?.coupons||[])
  const [loading, setLoading] = useState(!initial)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Form State
  const [code, setCode] = useState('')
  const [type, setType] = useState<'percentage' | 'fixed'>('percentage')
  const [value, setValue] = useState('')
  const [minCart, setMinCart] = useState('')

  useEffect(() => {
    fetchCoupons()
  }, [])

  async function fetchCoupons(force=false) {
    try{const data=await fetchDashboardData<any>('/api/settings/coupons',{force});setCoupons(data.coupons||[])}
    catch(error:any){console.error('Error fetching coupons:',error.message)}finally{setLoading(false)}
  }

  async function handleAddCoupon(e: React.FormEvent) {
    e.preventDefault()
    if (!code || !value) return

    setIsSubmitting(true)
    const response=await fetch('/api/settings/coupons',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        code: code.toUpperCase(),
        discount_type: type,
        discount_value: parseFloat(value),
        min_cart_value: minCart ? parseFloat(minCart) : 0,
        is_active: true
      })})
      if (!response.ok) {
        console.error('Error creating coupon:',(await response.json()).error)
      } else {
        await fetchCoupons(true)
        setIsModalOpen(false)
        setCode('')
        setValue('')
        setMinCart('')
      }
    setIsSubmitting(false)
  }

  async function toggleCouponStatus(id: string, currentStatus: boolean) {
    const coupon=coupons.find(item=>item.id===id);if(!coupon)return
    const response=await fetch('/api/settings/coupons',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...coupon,is_active:!currentStatus})})
    if(response.ok)await fetchCoupons(true)
  }

  async function deleteCoupon(id: string) {
    if (!confirm('Are you sure you want to delete this coupon?')) return
    const response=await fetch(`/api/settings/coupons?id=${encodeURIComponent(id)}`,{method:'DELETE'})
    if(response.ok)await fetchCoupons(true)
  }

  return (
    <div className="p-6 md:p-8 max-w-[1200px] mx-auto min-h-screen">
      
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight mb-1">Coupons & Offers</h1>
          <p className="text-[var(--text-secondary)] text-sm">Create and manage dynamic discounts for your bot to offer customers.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-brand hover:bg-brand-hover text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-glow flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Coupon
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">{Array.from({length:6}).map((_,index)=><div key={index} className="h-44 animate-pulse rounded-2xl border border-[var(--border-subtle)] bg-surface-secondary/50"/>)}</div>
      ) : coupons.length === 0 ? (
        <div className="bg-surface-secondary/50 backdrop-blur-xl border border-[var(--border-subtle)] rounded-2xl p-12 text-center flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
            </svg>
          </div>
          <h3 className="text-white font-medium mb-2">No coupons created</h3>
          <p className="text-[var(--text-secondary)] text-sm mb-6 max-w-sm mx-auto">Create your first coupon code to allow the bot to dynamically reward high-intent customers.</p>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-surface-tertiary hover:bg-white/10 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors border border-white/10"
          >
            Create Coupon
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {coupons.map(coupon => (
            <div key={coupon.id} className="bg-surface-secondary/50 backdrop-blur-md border border-[var(--border-subtle)] rounded-2xl p-6 relative group overflow-hidden transition-all hover:border-white/20">
              
              {/* Status Dot */}
              <div className="absolute top-6 right-6 flex items-center gap-3">
                <button 
                  onClick={() => toggleCouponStatus(coupon.id, coupon.is_active)}
                  className={`w-10 h-5 rounded-full p-1 transition-colors ${coupon.is_active ? 'bg-brand' : 'bg-surface-quaternary'}`}
                >
                  <div className={`w-3 h-3 bg-white rounded-full transition-transform ${coupon.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>

              <div className="mb-4">
                <span className="inline-block px-3 py-1 rounded-lg bg-brand/10 text-brand text-xs font-bold font-mono border border-brand/20 tracking-wider">
                  {coupon.code}
                </span>
              </div>
              
              <div className="flex items-baseline gap-2 mb-6">
                <h3 className="text-3xl font-bold text-white tracking-tight">
                  {coupon.discount_type === 'percentage' ? `${coupon.discount_value}%` : `$${coupon.discount_value}`}
                </h3>
                <span className="text-[var(--text-tertiary)] text-sm">off</span>
              </div>

              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Minimum Cart</span>
                  <span className="text-white font-medium">{coupon.min_cart_value > 0 ? `$${coupon.min_cart_value}` : 'None'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-secondary)]">Type</span>
                  <span className="text-white font-medium capitalize">{coupon.discount_type}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-[var(--border-subtle)] flex items-center justify-between">
                <span className="text-xs text-[var(--text-tertiary)]">
                  Created {new Date(coupon.created_at).toLocaleDateString()}
                </span>
                <button 
                  onClick={() => deleteCoupon(coupon.id)}
                  className="text-[var(--text-tertiary)] hover:text-red-400 p-1.5 rounded-lg hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="bg-surface-secondary border border-[var(--border-subtle)] rounded-2xl w-full max-w-md relative z-10 shadow-2xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-b from-brand/10 to-transparent h-32 pointer-events-none" />
            
            <div className="p-6 relative">
              <h2 className="text-xl font-bold text-white mb-1">Create Coupon</h2>
              <p className="text-[var(--text-secondary)] text-sm mb-6">Configure a new discount code for your AI bots to offer.</p>

              <form onSubmit={handleAddCoupon} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Coupon Code</label>
                  <input
                    type="text" value={code} onChange={e => setCode(e.target.value)} required placeholder="e.g. SUMMER24"
                    className="w-full bg-surface-tertiary border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm text-white placeholder-[var(--text-disabled)] focus:outline-none focus:border-brand transition-all uppercase font-mono"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Discount Type</label>
                    <select
                      value={type} onChange={e => setType(e.target.value as 'percentage' | 'fixed')}
                      className="w-full bg-surface-tertiary border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand transition-all appearance-none"
                    >
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed Amount ($)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Value</label>
                    <input
                      type="number" value={value} onChange={e => setValue(e.target.value)} required min="0" step="0.01" placeholder={type === 'percentage' ? 'e.g. 20' : 'e.g. 10.00'}
                      className="w-full bg-surface-tertiary border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm text-white placeholder-[var(--text-disabled)] focus:outline-none focus:border-brand transition-all"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Minimum Cart Value (Optional)</label>
                  <input
                    type="number" value={minCart} onChange={e => setMinCart(e.target.value)} min="0" step="0.01" placeholder="e.g. 50.00"
                    className="w-full bg-surface-tertiary border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm text-white placeholder-[var(--text-disabled)] focus:outline-none focus:border-brand transition-all"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl text-sm font-medium text-white hover:bg-white/5 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={isSubmitting || !code || !value} className="bg-brand hover:bg-brand-hover text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center gap-2">
                    {isSubmitting ? (
                      <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    ) : null}
                    Create Coupon
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
