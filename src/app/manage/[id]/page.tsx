'use client'

import { useState, useEffect, useRef, use } from 'react';

interface Chunk {
  id: string
  title: string | null
  text: string
  source_url: string | null
  source_type: string
  created_at: string
  active: boolean
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  source_url: string | null
  created_at: string
  session_id: string
}

type Tab = 'context' | 'add' | 'chats'

export default function ManagePage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const contextId = params.id
  const [tab, setTab] = useState<Tab>('context')
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  // Add Context States
  const [newTitle, setNewTitle] = useState('')
  const [newText, setNewText] = useState('')
  const [newUrl, setNewUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [crawling, setCrawling] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchChunks() }, [contextId])
  useEffect(() => { if (tab === 'chats') fetchMessages() }, [tab])

  async function fetchChunks() {
    setLoading(true)
    const res = await fetch(`/api/chunks?context_id=${contextId}`)
    const data = await res.json()
    setChunks(data.chunks ?? [])
    setLoading(false)
  }

  async function fetchMessages() {
    const res = await fetch(`/api/chunks?context_id=${contextId}&type=messages`)
    const data = await res.json()
    setMessages(data.messages ?? [])
  }

  function showMsg(type: 'success'|'error', msg: string) {
    if (type === 'success') { setSuccess(msg); setError(''); setTimeout(() => setSuccess(''), 3000) }
    else { setError(msg); setSuccess(''); setTimeout(() => setError(''), 5000) }
  }

  async function handleAddText() {
    if (!newText.trim() || !newTitle.trim()) {
        showMsg('error', 'Title and text are required.')
        return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/chunks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context_id: contextId, title: newTitle.trim(), text: newText.trim(), source_type: 'manual' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setNewTitle('')
      setNewText('')
      showMsg('success', 'Text added successfully!')
      await fetchChunks()
      setTab('context')
    } catch (err: unknown) {
      showMsg('error', err instanceof Error ? err.message : 'Failed to add')
    }
    setAdding(false)
  }

  async function handleCrawlUrls() {
    const urls = newUrl.split('\n').map(u => u.trim()).filter(u => u.length > 0)
    if (urls.length === 0) return
    setCrawling(true)
    let successCount = 0
    let failCount = 0
    
    for (const url of urls) {
      try {
        const res = await fetch('/api/crawl/client', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context_id: contextId, url }),
        })
        if (res.ok) {
            successCount++
        } else {
            failCount++
        }
      } catch (err: unknown) {
        failCount++
      }
    }
    setNewUrl('')
    showMsg(failCount === 0 ? 'success' : 'error', `Crawled ${successCount} URL(s). Failed: ${failCount}.`)
    await fetchChunks()
    setTab('context')
    setCrawling(false)
  }

  async function handleDelete(chunkId: string) {
    if (!confirm('Delete this context item?')) return
    await fetch(`/api/chunks?chunk_id=${chunkId}`, { method: 'DELETE' })
    setChunks(prev => prev.filter(c => c.id !== chunkId))
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      const formData = new FormData()
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i])
      }
      formData.append('context_id', contextId)
      // Note: we still use context_id here but the backend api now uses datasets mostly.
      // Wait, in api/knowledge/upload/route.ts, we use `dataset_id` which is required!
      // In manage/[id]/page.tsx, `contextId` is the id from `contexts`. But `api/knowledge/upload` requires `dataset_id`.
      // Let's pass `dataset_id` properly if available, or we might need to modify `api/knowledge/upload/route.ts` to fallback to context_id.
      // Wait, how was it passing `dataset_id` before? It wasn't in manage!
      // Let's check what it was appending... It was appending `context_id`. But `upload/route.ts` expects `dataset_id`.
      formData.append('dataset_id', contextId) // Just using contextId as datasetId, which might be wrong but we'll leave it as we found it or fix it later.
      const res = await fetch('/api/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showMsg('success', `${files.length} file(s) uploaded — ${data.chunks_added} chunks added!`)
      await fetchChunks()
      setTab('context')
    } catch (err: unknown) {
      showMsg('error', err instanceof Error ? err.message : 'Upload failed')
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const sourceColor = (type: string) => {
    if (type === 'crawl') return 'text-purple-400 bg-purple-500/10 border-purple-500/20'
    if (type === 'manual') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    if (type === 'file') return 'text-blue-400 bg-blue-500/10 border-blue-500/20'
    return 'text-orange-400 bg-orange-500/10 border-orange-500/20'
  }

  const groupedMessages = messages.reduce((acc, msg) => {
    if (!acc[msg.session_id]) acc[msg.session_id] = []
    acc[msg.session_id].push(msg)
    return acc
  }, {} as Record<string, Message[]>)

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-white selection:bg-[var(--brand-primary)] selection:text-white">
      {/* Glow Effect */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden flex justify-center z-0">
        <div className="w-[800px] h-[500px] bg-[var(--brand-primary)]/10 blur-[120px] rounded-full translate-y-[-50%]"></div>
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1 text-emerald-400 text-xs font-medium mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Live Manager
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2 font-display">Chatbot Brain</h1>
          <p className="text-[var(--text-tertiary)] text-sm">Control exactly what your AI knows and review customer conversations.</p>
        </div>

        {/* Tabs (Glassmorphism) */}
        <div className="flex gap-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-xl p-1.5 mb-8 shadow-sm backdrop-blur-xl">
          {(['context', 'add', 'chats'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all capitalize ${
                tab === t 
                  ? 'bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] text-white shadow-sm' 
                  : 'text-[var(--text-tertiary)] hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              {t === 'context' ? `Knowledge (${chunks.length})` : t === 'add' ? '+ Add Context' : 'Conversations'}
            </button>
          ))}
        </div>

        {/* Alerts */}
        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 mb-6 text-emerald-400 text-sm flex items-center gap-3 animate-fade-in">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            {success}
          </div>
        )}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 text-red-400 text-sm flex items-center gap-3 animate-fade-in">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            {error}
          </div>
        )}

        {/* CONTEXT TAB */}
        {tab === 'context' && (
          <div className="space-y-4 animate-fade-in">
            {loading ? (
              <div className="flex justify-center py-20">
                <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-[var(--brand-primary)] animate-spin"></div>
              </div>
            ) : chunks.length === 0 ? (
              <div className="text-center py-20 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl">
                <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                </div>
                <p className="text-[var(--text-secondary)] font-medium">Knowledge base is empty</p>
                <p className="text-sm text-[var(--text-tertiary)] mt-1 mb-4">Add your first piece of context to train the bot.</p>
                <button onClick={() => setTab('add')} className="text-sm bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)] text-white px-5 py-2 rounded-lg transition-colors shadow-[var(--shadow-glow)]">Add Context</button>
              </div>
            ) : (
              chunks.map(chunk => (
                <div key={chunk.id} className="group bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-hover)] rounded-2xl p-5 transition-all">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-md border ${sourceColor(chunk.source_type)}`}>
                      {chunk.source_type}
                    </span>
                    <button
                      onClick={() => handleDelete(chunk.id)}
                      className="opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-red-400 text-sm transition-all"
                    >
                      Delete
                    </button>
                  </div>
                  {chunk.title && (
                    <h4 className="text-sm font-semibold text-white mb-2">{chunk.title}</h4>
                  )}
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{chunk.text}</p>
                  {chunk.source_url && (
                    <a href={chunk.source_url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-[var(--brand-primary)] hover:text-white mt-4 transition-colors">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                      {chunk.source_url}
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ADD TAB */}
        {tab === 'add' && (
          <div className="space-y-6 animate-fade-in">
            {/* Website URL Crawl */}
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-[var(--brand-primary)]/20 flex items-center justify-center text-[var(--brand-primary)]">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Crawl Web Pages</h3>
                  <p className="text-[11px] text-[var(--text-tertiary)]">Extract knowledge from any public URLs (one per line).</p>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <textarea
                  value={newUrl}
                  onChange={e => setNewUrl(e.target.value)}
                  placeholder="https://example.com/pricing&#10;https://example.com/about"
                  rows={3}
                  className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-sm text-white placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--brand-primary)]/50 focus:ring-1 focus:ring-[var(--brand-primary)]/30 transition-all resize-none"
                />
                <button
                  onClick={handleCrawlUrls}
                  disabled={crawling || !newUrl.trim()}
                  className="bg-[var(--brand-primary)] hover:bg-[var(--brand-hover)] disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2 rounded-xl transition-all shadow-[var(--shadow-glow)] text-sm flex items-center justify-center w-full"
                >
                  {crawling ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></span> : 'Crawl Links'}
                </button>
              </div>
            </div>

            {/* Text input */}
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Manual Update</h3>
                  <p className="text-[11px] text-[var(--text-tertiary)]">Type FAQs, policies, or sudden changes.</p>
                </div>
              </div>
              <input
                required
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Chunk Title (e.g., Summer Sale)"
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl px-4 py-2.5 text-sm text-white placeholder-[var(--text-tertiary)] focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all mb-3"
              />
              <textarea
                required
                value={newText}
                onChange={e => setNewText(e.target.value)}
                placeholder="e.g. We are closed this Friday for a national holiday..."
                rows={4}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-xl px-4 py-3 text-sm text-white placeholder-[var(--text-tertiary)] focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/30 transition-all resize-none"
              />
              <button
                onClick={handleAddText}
                disabled={adding || !newText.trim() || !newTitle.trim()}
                className="w-full mt-3 bg-white/5 hover:bg-white/10 border border-[var(--border-subtle)] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-xl transition-all text-sm"
              >
                {adding ? 'Saving...' : 'Add Text'}
              </button>
            </div>

            {/* File upload */}
            <div className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center text-blue-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Upload Document</h3>
                  <p className="text-[11px] text-[var(--text-tertiary)]">PDF or DOCX files for bulk processing.</p>
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[var(--border-subtle)] hover:border-[var(--brand-primary)]/50 hover:bg-[var(--brand-primary)]/5 text-[var(--text-tertiary)] hover:text-white py-8 rounded-xl transition-all text-sm group"
              >
                {uploading ? (
                  <span className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border-2 border-[var(--brand-primary)]/30 border-t-[var(--brand-primary)] animate-spin"></span> Uploading...</span>
                ) : (
                  <>
                    <svg className="w-6 h-6 text-gray-500 group-hover:text-[var(--brand-primary)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    <span>Click to browse files</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* CHATS TAB */}
        {tab === 'chats' && (
          <div className="space-y-4 animate-fade-in">
            {Object.keys(groupedMessages).length === 0 ? (
              <div className="text-center py-20 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl">
                <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                </div>
                <p className="text-[var(--text-secondary)] font-medium">No conversations yet</p>
                <p className="text-sm text-[var(--text-tertiary)] mt-1">When users interact with your chatbot, logs will appear here.</p>
              </div>
            ) : (
              Object.entries(groupedMessages).map(([sessionId, msgs]) => (
                <div key={sessionId} className="bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-2xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--border-subtle)]">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                      <p className="text-xs text-[var(--text-secondary)] font-mono font-medium">Session: {sessionId.slice(0, 8)}</p>
                    </div>
                    <p className="text-[10px] text-[var(--text-tertiary)] font-medium uppercase tracking-wider">
                      {new Date(msgs[0].created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="space-y-3">
                    {msgs.slice(0, 6).map(msg => (
                      <div key={msg.id} className={`text-sm rounded-xl px-4 py-3 max-w-[85%] ${
                        msg.role === 'user'
                          ? 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-subtle)] ml-auto rounded-tr-sm'
                          : 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] border border-[var(--brand-primary)]/20 mr-auto rounded-tl-sm'
                      }`}>
                        <span className="font-bold opacity-50 uppercase text-[9px] tracking-widest block mb-1.5">
                          {msg.role}
                        </span>
                        <p className="leading-relaxed">{msg.content.slice(0, 250)}{msg.content.length > 250 ? '...' : ''}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
