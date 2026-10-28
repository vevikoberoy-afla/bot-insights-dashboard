'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import {getVerifiedAccessToken} from '@/lib/client/verifiedAuth'
import { useCachedFetch, useInvalidate } from '@/lib/cache'

export default function NotepadPage() {
  const supabase = createClient()
  const [activeClientId, setActiveClientId] = useState<string | null>(null)
  const { invalidate } = useInvalidate()
  
  // Active note state
  const [activeNote, setActiveNote] = useState<any>(null)
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

  // --- Cached notes ---
  const fetcherNotes = useCallback(async () => {
    if (!activeClientId) return []
    const res = await fetch(`/api/notes?client_id=${activeClientId}`)
    if (!res.ok) return []
    const data = await res.json()
    return data
  }, [activeClientId])
  
  const { data: notes = [], loading, refresh: refreshNotes } = useCachedFetch(`notes:${activeClientId}`, fetcherNotes)

  useEffect(() => {
    if (notes.length > 0 && !activeNote) {
      setActiveNote(notes[0])
    } else if (notes.length === 0 && !loading) {
      handleNewNote()
    }
  }, [notes, loading])

  function handleNewNote() {
    setActiveNote({
      id: 'new',
      title: 'Untitled Note',
      content: '',
      is_snippet: false
    })
  }

  async function handleSaveNote() {
    if (!activeClientId || !activeNote.title.trim()) return
    setIsSubmitting(true)
    try {
      // NOTE: Our API currently just handles POST for create. We could add PUT for updates.
      // For this implementation, we will treat 'Save' as create if it's 'new'
      
      const payload = {
        client_id: activeClientId,
        title: activeNote.title,
        content: activeNote.content,
        is_snippet: activeNote.is_snippet
      }

      const res = await fetch('/api/notes', {
        method: 'POST', // Assuming POST handles upsert or we just create a new one for now
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        setActiveNote(null)
        invalidate(`notes:${activeClientId}`)
        refreshNotes()
      }
    } catch (err) {
      console.error(err)
    }
    setIsSubmitting(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Notepad</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Internal team notes and snippets</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-0 h-[calc(100vh-220px)] rounded-2xl border border-[var(--border-subtle)] overflow-hidden">
        {/* Note list */}
        <div className="lg:col-span-4 border-r border-[var(--border-subtle)] bg-surface-secondary flex flex-col">
          <div className="p-3 border-b border-[var(--border-subtle)]">
            <button onClick={handleNewNote} className="w-full px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-semibold transition-all flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              New Note
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center p-8"><div className="w-4 h-4 rounded-full border-2 border-brand border-t-transparent animate-spin" /></div>
            ) : notes.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--text-disabled)]">No notes yet</div>
            ) : (
              notes.map((n: any) => (
                <div 
                  key={n.id} 
                  onClick={() => setActiveNote(n)} 
                  className={`px-4 py-3 cursor-pointer border-b border-[var(--border-subtle)] transition-all ${activeNote?.id === n.id ? 'bg-brand/5 border-l-2 border-l-brand' : 'hover:bg-surface-hover'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-white truncate">{n.title}</p>
                    {n.is_snippet && <span className="text-[9px] font-medium bg-brand/10 text-brand border border-brand/20 rounded-full px-1.5 py-0.5 flex-shrink-0">Snippet</span>}
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] truncate">{n.content?.split('\n')[0] || 'Empty'}</p>
                  <p className="text-[10px] text-[var(--text-disabled)] mt-1">{new Date(n.created_at).toLocaleDateString()}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="lg:col-span-8 flex flex-col bg-surface-primary">
          {activeNote ? (
            <>
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
                <input 
                  value={activeNote.title} 
                  onChange={e => setActiveNote({...activeNote, title: e.target.value})}
                  className="text-lg font-semibold text-white bg-transparent border-none outline-none flex-1" 
                />
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] cursor-pointer hover:text-white transition-colors">
                    <input 
                      type="checkbox" 
                      checked={activeNote.is_snippet} 
                      onChange={e => setActiveNote({...activeNote, is_snippet: e.target.checked})}
                      className="rounded bg-surface-tertiary border-[var(--border-subtle)] text-brand focus:ring-brand" 
                    />
                    Mark as Snippet
                  </label>
                  <button 
                    onClick={handleSaveNote}
                    disabled={isSubmitting}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-brand hover:bg-brand-hover text-white transition-all disabled:opacity-50 shadow-glow"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Note'}
                  </button>
                </div>
              </div>
              <textarea
                value={activeNote.content || ''}
                onChange={e => setActiveNote({...activeNote, content: e.target.value})}
                className="flex-1 p-6 text-sm text-[var(--text-secondary)] bg-transparent resize-none outline-none leading-relaxed font-mono"
                placeholder="Start writing..."
              />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-[var(--text-disabled)] text-sm">
              Select or create a note
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
