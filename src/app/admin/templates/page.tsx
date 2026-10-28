'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import {getVerifiedAccessToken} from '@/lib/client/verifiedAuth'
import { useCachedFetch, useInvalidate } from '@/lib/cache'

const CATEGORIES = ['All', 'Greeting', 'FAQ', 'Troubleshooting', 'Closing', 'Upsell']

export default function TemplatesPage() {
  const supabase = createClient()
  const [activeClientId, setActiveClientId] = useState<string | null>(null)
  const { invalidate } = useInvalidate()
  const [activeCat, setActiveCat] = useState('All')

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Greeting')
  const [bodyText, setBodyText] = useState('')
  const [shortcode, setShortcode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  // --- Cached templates ---
  const fetcherTemplates = useCallback(async () => {
    if (!activeClientId) return []
    const res = await fetch(`/api/templates?client_id=${activeClientId}`)
    if (!res.ok) return []
    const data = await res.json()
    return data
  }, [activeClientId])
  
  const { data: templates = [], loading, refresh: refreshTemplates } = useCachedFetch(`templates:${activeClientId}`, fetcherTemplates)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!activeClientId || !title.trim() || !bodyText.trim() || !shortcode.trim()) return
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: activeClientId,
          title,
          category,
          body: bodyText,
          shortcode: shortcode.startsWith('/') ? shortcode : `/${shortcode}`
        })
      })
      if (res.ok) {
        setIsModalOpen(false)
        setTitle('')
        setBodyText('')
        setShortcode('')
        setCategory('Greeting')
        invalidate(`templates:${activeClientId}`)
        refreshTemplates()
      }
    } catch (err) {
      console.error(err)
    }
    setIsSubmitting(false)
  }

  const filtered = activeCat === 'All' ? templates : templates.filter((t: any) => t.category === activeCat)

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-ink">Templates</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Canned responses for faster replies</p>
        </div>
        <div className="flex items-center gap-4">
          {clients.length > 1 && (
            <select
              value={activeClientId || ''}
              onChange={(e) => setActiveClientId(e.target.value)}
              className="px-3 py-2 bg-surface-tertiary border border-[var(--border-subtle)] rounded-lg text-sm text-ink focus:border-brand focus:outline-none"
            >
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-ink text-sm font-semibold transition-all hover:shadow-glow flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            New Template
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto">
        {CATEGORIES.map(cat => (
          <button 
            key={cat} 
            onClick={() => setActiveCat(cat)} 
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${activeCat === cat ? 'bg-brand/15 text-brand border border-brand/20' : 'bg-surface-tertiary text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:text-ink'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Template Grid */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-brand border-t-transparent animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-surface-secondary border border-dashed border-[var(--border-subtle)] rounded-2xl">
          <p className="text-[var(--text-disabled)]">No templates found for this category.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t: any) => (
            <div key={t.id} className="bg-surface-secondary border border-[var(--border-subtle)] rounded-2xl p-5 hover:border-[var(--border-default)] transition-all cursor-pointer group flex flex-col justify-between min-h-[160px]">
              <div>
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-sm font-semibold text-ink group-hover:text-brand transition-colors">{t.title}</h3>
                  <span className="text-[10px] font-medium bg-surface-quaternary text-[var(--text-tertiary)] rounded-full px-2 py-0.5">{t.usage_count} uses</span>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mb-4 line-clamp-3">{t.body}</p>
              </div>
              <div className="flex items-center justify-between mt-auto">
                <span className="text-[10px] font-medium bg-brand/10 text-brand border border-brand/20 rounded-full px-2 py-0.5">{t.category}</span>
                <code className="text-[10px] font-mono text-[var(--text-disabled)] bg-surface-quaternary px-2 py-0.5 rounded border border-[var(--border-subtle)]">{t.shortcode}</code>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* New Template Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface-secondary border border-[var(--border-subtle)] rounded-2xl p-6 w-[500px] shadow-2xl relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-[var(--text-tertiary)] hover:text-ink transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="text-xl font-bold text-ink mb-6">Create New Template</h2>
            
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Title</label>
                <input 
                  autoFocus required value={title} onChange={e => setTitle(e.target.value)}
                  className="w-full px-4 py-2 bg-surface-tertiary border border-[var(--border-subtle)] rounded-xl text-sm text-ink focus:border-brand focus:outline-none transition-colors" 
                  placeholder="e.g. Welcome Message" 
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Category</label>
                  <select 
                    value={category} onChange={e => setCategory(e.target.value)}
                    className="w-full px-4 py-2 bg-surface-tertiary border border-[var(--border-subtle)] rounded-xl text-sm text-ink focus:border-brand focus:outline-none transition-colors appearance-none"
                  >
                    {CATEGORIES.filter(c => c !== 'All').map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Shortcode (Trigger)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-2 text-sm text-[var(--text-disabled)]">/</span>
                    <input 
                      required value={shortcode} onChange={e => setShortcode(e.target.value.replace(/\//g, ''))}
                      className="w-full pl-7 pr-4 py-2 bg-surface-tertiary border border-[var(--border-subtle)] rounded-xl text-sm text-ink focus:border-brand focus:outline-none transition-colors font-mono" 
                      placeholder="welcome" 
                    />
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">Message Body</label>
                <textarea 
                  required value={bodyText} onChange={e => setBodyText(e.target.value)}
                  className="w-full px-4 py-3 bg-surface-tertiary border border-[var(--border-subtle)] rounded-xl text-sm text-ink focus:border-brand focus:outline-none transition-colors resize-none h-32" 
                  placeholder="Hi {{name}}, how can I help you today?" 
                />
                <p className="text-[10px] text-[var(--text-tertiary)] mt-1.5">Use <code className="text-brand bg-brand/10 px-1 rounded">{"{{variable}}"}</code> to insert dynamic data.</p>
              </div>
              
              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:text-ink transition-colors">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-5 py-2 rounded-xl bg-brand hover:bg-brand-hover text-ink text-sm font-semibold transition-all hover:shadow-glow disabled:opacity-50">
                  {isSubmitting ? 'Creating...' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
