'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import {getVerifiedAccessToken} from '@/lib/client/verifiedAuth'

export default function NewCampaignPage() {
  const router = useRouter()
  const supabase = createClient()
  const [clients, setClients] = useState<any[]>([])
  const [activeClientId, setActiveClientId] = useState<string | null>(null)
  
  const [step, setStep] = useState(1) // 1: Channel, 2: Audience, 3: Compose, 4: Review
  
  // Form State
  const [name, setName] = useState('')
  const [channel, setChannel] = useState<'whatsapp' | 'email' | 'sms' | 'website'>('email')
  const [bodyText, setBodyText] = useState('')
  
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    fetchClients()
  }, [])

  async function fetchClients() {
    try {
      const accessToken=await getVerifiedAccessToken(supabase)
      if (!accessToken) return
      const res = await fetch('/api/clients', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      })
      if (res.ok) {
        const data = await res.json()
        setClients(data.clients ?? [])
        if (data.clients?.length > 0) setActiveClientId(data.clients[0].id)
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function handleSaveDraft() {
    if (!activeClientId || !name.trim()) return
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: activeClientId,
          name,
          channel
        })
      })
      if (res.ok) {
        router.push('/admin/campaigns')
      }
    } catch (err) {
      console.error(err)
    }
    setIsSubmitting(false)
  }

  return (
    <div className="max-w-5xl mx-auto pb-20">
      <div className="flex items-center justify-between mb-8">
        <div>
          <button onClick={() => router.push('/admin/campaigns')} className="text-sm font-medium text-[var(--text-tertiary)] hover:text-white transition-colors mb-2 flex items-center gap-1">
            ← Back to Campaigns
          </button>
          <h1 className="text-2xl font-bold text-white">Create Campaign</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleSaveDraft} disabled={isSubmitting || !name} className="px-4 py-2 rounded-xl bg-surface-tertiary border border-[var(--border-subtle)] text-[var(--text-secondary)] text-sm font-medium hover:text-white hover:border-[var(--border-default)] transition-all disabled:opacity-50">
            {isSubmitting ? 'Saving...' : 'Save Draft'}
          </button>
          {step === 4 && (
            <button onClick={handleSaveDraft} className="px-6 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition-all hover:shadow-glow shadow-[0_0_15px_rgba(59,130,246,0.5)]">
              Schedule & Send
            </button>
          )}
        </div>
      </div>

      {/* Wizard Steps */}
      <div className="flex items-center mb-8">
        {['Basic Info & Channel', 'Audience', 'Knowledge Booster', 'Compose Message', 'Review'].map((label, i) => {
          const s = i + 1
          const isActive = step === s
          const isPast = step > s
          return (
            <div key={s} className="flex-1 flex items-center">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${isActive ? 'bg-brand text-white shadow-glow' : isPast ? 'bg-emerald-500/20 text-emerald-400' : 'bg-surface-tertiary text-[var(--text-disabled)]'}`}>
                  {isPast ? '✓' : s}
                </div>
                <span className={`text-sm font-medium ${isActive ? 'text-white' : isPast ? 'text-[var(--text-secondary)]' : 'text-[var(--text-disabled)]'}`}>{label}</span>
              </div>
              {s !== 5 && <div className={`flex-1 h-px mx-4 ${isPast ? 'bg-emerald-500/30' : 'bg-[var(--border-subtle)]'}`} />}
            </div>
          )
        })}
      </div>

      <div className="bg-surface-secondary border border-[var(--border-subtle)] rounded-2xl p-8">
        
        {/* Step 1: Info & Channel */}
        {step === 1 && (
          <div className="animate-fade-in">
            <h2 className="text-lg font-bold text-white mb-6">Campaign Settings</h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-2">Campaign Name</label>
                <input 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  autoFocus
                  placeholder="e.g. Summer Sale 2026" 
                  className="w-full max-w-md bg-surface-tertiary border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-brand/40" 
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--text-secondary)] mb-4">Select Channel</label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { id: 'whatsapp', icon: '📱', title: 'WhatsApp', desc: 'High engagement, instant delivery' },
                    { id: 'email', icon: '📧', title: 'Email', desc: 'Long-form rich content' },
                    { id: 'sms', icon: '📲', title: 'SMS', desc: 'Direct text messaging' },
                    { id: 'website', icon: '🌐', title: 'Website Bot', desc: 'Proactive popup messages' },
                  ].map(ch => (
                    <div 
                      key={ch.id}
                      onClick={() => setChannel(ch.id as any)}
                      className={`p-5 rounded-2xl border-2 cursor-pointer transition-all flex flex-col justify-between h-full ${channel === ch.id ? 'border-brand bg-brand/5' : 'border-[var(--border-subtle)] bg-surface-tertiary hover:border-[var(--border-default)]'}`}
                    >
                      <div>
                        <div className="text-3xl mb-3">{ch.icon}</div>
                        <h3 className="text-sm font-bold text-white mb-1">{ch.title}</h3>
                      </div>
                      <p className="text-xs text-[var(--text-tertiary)]">{ch.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-8 flex justify-end">
              <button onClick={() => setStep(2)} disabled={!name} className="px-6 py-2.5 rounded-xl bg-surface-tertiary border border-[var(--border-subtle)] text-white text-sm font-medium hover:border-brand transition-all disabled:opacity-50">Next Step →</button>
            </div>
          </div>
        )}

        {/* Step 2: Audience */}
        {step === 2 && (
          <div className="animate-fade-in">
            <h2 className="text-lg font-bold text-white mb-6">Who are we sending to?</h2>
            
            {channel === 'website' ? (
              <div className="p-12 border border-[var(--border-subtle)] rounded-2xl text-center bg-brand/5">
                 <div className="w-12 h-12 rounded-full bg-brand/20 flex items-center justify-center mx-auto mb-4 text-xl">🌐</div>
                 <h3 className="text-white font-medium mb-2">Broadcast to All Visitors</h3>
                 <p className="text-sm text-[var(--text-tertiary)] max-w-sm mx-auto">Website campaigns are automatically shown to all active website visitors. No segment selection is required.</p>
              </div>
            ) : (
              <div className="p-12 border-2 border-dashed border-[var(--border-subtle)] rounded-2xl text-center">
                 <svg className="w-10 h-10 mx-auto text-[var(--text-tertiary)] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                 <h3 className="text-white font-medium mb-1">Select a Segment</h3>
                 <p className="text-sm text-[var(--text-tertiary)] mb-4">Choose from your saved contact segments.</p>
                 <select className="px-4 py-2.5 bg-surface-primary border border-[var(--border-subtle)] rounded-xl text-sm text-white outline-none w-64 mx-auto">
                   <option>All Contacts (Default)</option>
                   <option>VIP Customers</option>
                   <option>Active in last 30 days</option>
                 </select>
              </div>
            )}

            <div className="mt-8 flex justify-between">
              <button onClick={() => setStep(1)} className="px-6 py-2.5 rounded-xl bg-transparent text-[var(--text-secondary)] text-sm font-medium hover:text-white transition-all">← Back</button>
              <button onClick={() => setStep(3)} className="px-6 py-2.5 rounded-xl bg-surface-tertiary border border-[var(--border-subtle)] text-white text-sm font-medium hover:border-brand transition-all">Next Step →</button>
            </div>
          </div>
        )}

        {/* Step 3: Knowledge Booster */}
        {step === 3 && (
          <div className="animate-fade-in">
            <h2 className="text-lg font-bold text-white mb-6">Attach Knowledge Chunks (Optional)</h2>
            <p className="text-sm text-[var(--text-tertiary)] mb-8">Attach specific knowledge datasets (like a temporary sale FAQ) to this campaign. The bot will use this context when replying to users engaging with this campaign.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Dummy Datasets for UI preview */}
              {[
                { id: '1', name: 'Summer Sale FAQ', type: 'manual', active: true },
                { id: '2', name: 'Product Catalog 2026', type: 'upload', active: false },
              ].map(ds => (
                <div key={ds.id} onClick={() => {}} className={`p-4 rounded-xl border cursor-pointer transition-all ${ds.active ? 'border-brand bg-brand/5' : 'border-[var(--border-subtle)] bg-surface-tertiary hover:border-[var(--border-default)]'}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-sm font-bold text-white">{ds.name}</h3>
                      <p className="text-xs text-[var(--text-tertiary)] mt-1 uppercase tracking-wider">{ds.type}</p>
                    </div>
                    {ds.active && <div className="w-5 h-5 rounded-full bg-brand flex items-center justify-center text-white text-xs">✓</div>}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-12 flex justify-between">
              <button onClick={() => setStep(2)} className="px-6 py-2.5 rounded-xl bg-transparent text-[var(--text-secondary)] text-sm font-medium hover:text-white transition-all">← Back</button>
              <button onClick={() => setStep(4)} className="px-6 py-2.5 rounded-xl bg-surface-tertiary border border-[var(--border-subtle)] text-white text-sm font-medium hover:border-brand transition-all">Next Step →</button>
            </div>
          </div>
        )}

        {/* Step 4: Compose (The Canvas) */}
        {step === 4 && (
          <div className="animate-fade-in">
            <h2 className="text-lg font-bold text-white mb-6">Compose Message (The Canvas)</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Editor */}
              <div className="flex flex-col border border-[var(--border-subtle)] rounded-xl overflow-hidden bg-surface-primary min-h-[400px]">
                {/* Toolbar */}
                <div className="flex items-center gap-1 p-2 border-b border-[var(--border-subtle)] bg-surface-tertiary">
                   <button className="p-2 rounded hover:bg-surface-secondary text-[var(--text-secondary)] font-serif font-bold">B</button>
                   <button className="p-2 rounded hover:bg-surface-secondary text-[var(--text-secondary)] font-serif italic">I</button>
                   <div className="w-px h-4 bg-[var(--border-subtle)] mx-1" />
                   <button className="p-2 rounded hover:bg-surface-secondary text-[var(--text-secondary)] text-xs">{"{ }"} Variables</button>
                   <button className="p-2 rounded hover:bg-surface-secondary text-[var(--text-secondary)] text-xs">😀 Emoji</button>
                </div>
                <textarea 
                  value={bodyText}
                  onChange={e => setBodyText(e.target.value)}
                  placeholder={`Write your ${channel} message here...`}
                  className="flex-1 p-4 bg-transparent resize-none outline-none text-sm text-white"
                />
              </div>

              {/* Live Preview */}
              <div>
                 <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3">Live Preview</p>
                 {channel === 'whatsapp' && (
                   <div className="bg-[#EFEAE2] rounded-xl p-4 min-h-[400px] border border-[var(--border-subtle)] relative overflow-hidden flex flex-col justify-end">
                     {/* Fake header */}
                     <div className="absolute top-0 left-0 right-0 h-14 bg-[#075E54] px-4 flex items-center text-white font-medium z-10 shadow-sm">
                       Business Account
                     </div>
                     <div className="bg-white rounded-xl rounded-tr-sm p-3 shadow-sm max-w-[85%] self-end relative z-0 mb-4 text-[#111B21] text-[13px] leading-relaxed">
                       {bodyText || 'Start typing to see preview...'}
                     </div>
                   </div>
                 )}
                 {channel === 'email' && (
                   <div className="bg-white rounded-xl p-6 min-h-[400px] border border-[var(--border-subtle)] text-gray-800 text-sm">
                     <div className="mb-4 pb-4 border-b border-gray-200">
                        <p className="text-gray-500 mb-1">Subject: <span className="text-gray-800 font-medium">Your Campaign Subject</span></p>
                     </div>
                     <div className="whitespace-pre-wrap">{bodyText || 'Start typing to see preview...'}</div>
                   </div>
                 )}
                 {channel === 'sms' && (
                   <div className="bg-gray-100 rounded-[2.5rem] p-6 min-h-[500px] w-[280px] mx-auto border-8 border-gray-800 relative">
                     <div className="bg-blue-500 text-white rounded-2xl rounded-br-sm p-3 mt-10 text-[13px] shadow-sm ml-auto max-w-[85%]">
                       {bodyText || 'Text preview...'}
                     </div>
                   </div>
                 )}
                 {channel === 'website' && (
                   <div className="bg-surface-primary rounded-2xl p-6 min-h-[400px] border border-[var(--border-subtle)] flex items-end justify-end relative overflow-hidden">
                     <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
                     <div className="w-[320px] bg-surface-secondary border border-[var(--border-subtle)] rounded-2xl rounded-br-sm p-4 shadow-2xl relative z-10 animate-slide-up">
                       <div className="flex items-center gap-2 mb-3">
                         <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center text-[10px] text-white">AI</div>
                         <span className="text-xs font-semibold text-white">Chat Assistant</span>
                       </div>
                       <div className="text-[13px] text-gray-200 leading-relaxed whitespace-pre-wrap">
                         {bodyText || 'Start typing to see preview...'}
                       </div>
                     </div>
                   </div>
                 )}
              </div>
            </div>

            <div className="mt-8 flex justify-between">
              <button onClick={() => setStep(3)} className="px-6 py-2.5 rounded-xl bg-transparent text-[var(--text-secondary)] text-sm font-medium hover:text-white transition-all">← Back</button>
              <button onClick={() => setStep(5)} className="px-6 py-2.5 rounded-xl bg-surface-tertiary border border-[var(--border-subtle)] text-white text-sm font-medium hover:border-brand transition-all">Review →</button>
            </div>
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div className="animate-fade-in">
            <h2 className="text-lg font-bold text-white mb-6">Review & Send</h2>
            
            <div className="bg-surface-tertiary rounded-2xl p-6 border border-[var(--border-subtle)] max-w-2xl mx-auto space-y-4">
              <div className="flex justify-between border-b border-[var(--border-subtle)] pb-4">
                <span className="text-sm text-[var(--text-secondary)]">Campaign Name</span>
                <span className="text-sm font-medium text-white">{name}</span>
              </div>
              <div className="flex justify-between border-b border-[var(--border-subtle)] pb-4">
                <span className="text-sm text-[var(--text-secondary)]">Channel</span>
                <span className="text-sm font-medium text-white capitalize">{channel}</span>
              </div>
              <div className="flex justify-between border-b border-[var(--border-subtle)] pb-4">
                <span className="text-sm text-[var(--text-secondary)]">Audience Segment</span>
                <span className="text-sm font-medium text-white">{channel === 'website' ? 'All Website Visitors' : 'All Contacts (~5,240 recipients)'}</span>
              </div>
              <div className="flex justify-between border-b border-[var(--border-subtle)] pb-4">
                <span className="text-sm text-[var(--text-secondary)]">Knowledge Booster</span>
                <span className="text-sm font-medium text-brand">1 Dataset Attached</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-[var(--text-secondary)]">Cost Estimate</span>
                <span className="text-sm font-medium text-emerald-400">~$14.50</span>
              </div>
            </div>

            <div className="mt-8 flex justify-between">
              <button onClick={() => setStep(4)} className="px-6 py-2.5 rounded-xl bg-transparent text-[var(--text-secondary)] text-sm font-medium hover:text-white transition-all">← Back to Editor</button>
              <button onClick={handleSaveDraft} className="px-8 py-3 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-bold transition-all shadow-[0_0_20px_rgba(59,130,246,0.6)]">Schedule Campaign</button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
