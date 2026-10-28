'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { DashboardFlowCard, isFlowCard } from '@/components/chat/DashboardFlowCard'

function formatTime(dateStr: string) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const FILTERS = [
  { id: 'all', label: '💬 All' },
  { id: 'waiting', label: '🔴 Needs Intervention' },
  { id: 'unassigned', label: '🔓 Unassigned' },
  { id: 'mine', label: '👤 Mine' },
  { id: 'unread', label: '🔵 Unread' },
]

export function BotPanel({ bot, onClose, token }: { bot: any; onClose: () => void; token: string }) {
  const supabase = createClient()
  const [tab, setTab] = useState<'chats' | 'settings' | 'qa'>('chats')
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState<any>(null)

  // Settings State
  const [form, setForm] = useState({
    name: bot.name || '',
    fallback_message: bot.fallback_message || "I don't have enough information about that. Please contact us directly for help.",
    handoff_message: bot.handoff_message || 'I am connecting you to a human agent who can assist you further. Please hold on.',
    theme_color: bot.theme_color || '#8b5cf6',
    widget_title: bot.widget_title || 'AI Assistant',
    welcome_message: bot.welcome_message || 'Hi there! How can I help you today?',
    purpose: bot.purpose || 'support',
  })

  // QA State
  const [qaPairs, setQaPairs] = useState<any[]>([])
  const [loadingQa, setLoadingQa] = useState(true)
  const [newQa, setNewQa] = useState({ q: '', a: '' })
  const [contextId, setContextId] = useState<string | null>(null)

  // Live Chats State
  const [filter, setFilter] = useState<'waiting' | 'all' | 'unassigned' | 'mine' | 'unread'>('all')
  const [sessions, setSessions] = useState<any[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [activeSession, setActiveSession] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [loadingThread, setLoadingThread] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sendingReply, setSendingReply] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    supabase
      .from('clients')
      .select('context_id')
      .eq('id', bot.client_id)
      .single()
      .then(({ data }) => {
        if (data?.context_id) {
          setContextId(data.context_id)
          fetchQaPairs(data.context_id)
        }
      })
  }, [bot.client_id])

  useEffect(() => {
    if (tab === 'chats') {
      fetchSessions()
      // Auto-poll every 10 seconds for new sessions and messages
      const interval = setInterval(()=>{if(!document.hidden)void fetchSessions()}, 10000)
      return () => clearInterval(interval)
    }
  }, [tab, filter])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-refresh the active thread every 5s to show new visitor messages
  useEffect(() => {
    if (!activeSession) return
    const controller=new AbortController()
    const interval = setInterval(async () => {
      if(document.hidden)return
      try {
        const res = await fetch(`/api/inbox/${activeSession.session_id}?t=${Date.now()}`,{signal:controller.signal})
        if (res.ok) {
          const data = await res.json()
          setMessages(data.messages || [])
          // Update session mode if changed
          if (data.session?.mode !== activeSession.mode) {
            setActiveSession(data.session)
          }
        }
      } catch (error:any) { if(error.name!=='AbortError'){/* silent */} }
    }, 5000)
    return () => {clearInterval(interval);controller.abort()}
  }, [activeSession?.session_id])

  // ── Live Chats ──────────────────────────────────────────────
  async function fetchSessions() {
    setLoadingSessions(true)
    try {
      let url = `/api/inbox?client_id=${bot.client_id}&bot_id=${bot.id}&filter=${filter}&t=${Date.now()}`
      if (filter === 'mine' && user) url += `&agent_id=${user.id}`
      const res = await fetch(url)
      if (res.ok) setSessions(await res.json())
    } catch (e) { console.error(e) }
    setLoadingSessions(false)
  }

  async function loadThread(session_id: string) {
    setLoadingThread(true)
    try {
      const res = await fetch(`/api/inbox/${session_id}?t=${Date.now()}`)
      if (res.ok) {
        const data = await res.json()
        setActiveSession(data.session)
        setMessages(data.messages || [])
        setSessions(prev => prev.map(s => s.session_id === session_id ? { ...s, unread_count: 0 } : s))
      }
    } catch (e) { console.error(e) }
    setLoadingThread(false)
  }

  async function handleTakeOver() {
    if (!activeSession) return
    const newMode = activeSession.mode === 'human' ? 'ai' : 'human'
    const res = await fetch(`/api/inbox/${activeSession.session_id}?client_id=${encodeURIComponent(bot.client_id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: newMode === 'human' ? 'takeover' : 'handback', agent_id: newMode === 'human' ? user?.id : null }),
    })
    if (res.ok) {
      const updated = await res.json()
      setActiveSession(updated.session || updated)
      fetchSessions()
    }
  }

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault()
    if (!replyText.trim() || !activeSession) return
    const text = replyText
    setReplyText('')
    setSendingReply(true)
    const tempMsg = { id: 'tmp-' + Date.now(), content: text, role: 'assistant', mode: 'human', created_at: new Date().toISOString() }
    setMessages(prev => [...prev, tempMsg])
    try {
      const res = await fetch(`/api/inbox/${activeSession.session_id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context_id: contextId, bot_id: bot.id, content: text, agent_id: user?.id, channel: bot.channel || 'web' }),
      })
      if (res.ok) {
        const real = await res.json()
        setMessages(prev => prev.map(m => m.id === tempMsg.id ? real : m))
        setActiveSession((s: any) => s ? { ...s, mode: 'human' } : s)
        fetchSessions()
      } else {
        setMessages(prev => prev.filter(m => m.id !== tempMsg.id))
        setReplyText(text)
      }
    } catch (e) { console.error(e); setMessages(prev => prev.filter(m => m.id !== tempMsg.id)); setReplyText(text) }
    setSendingReply(false)
  }

  // ── QA ──────────────────────────────────────────────────────
  async function fetchQaPairs(ctx: string) {
    setLoadingQa(true)
    const { data } = await supabase.from('qa_pairs').select('*').eq('context_id', ctx).order('created_at', { ascending: false })
    setQaPairs(data || [])
    setLoadingQa(false)
  }

  async function handleSaveSettings() {
    setSaving(true)
    try {
      await fetch('/api/bots', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ id: bot.id, ...form }) })
      alert('Settings saved!')
    } catch { alert('Error saving settings') }
    setSaving(false)
  }

  async function handleAddQa(e: React.FormEvent) {
    e.preventDefault()
    if (!newQa.q.trim() || !newQa.a.trim() || !contextId) return
    setSaving(true)
    try {
      const res = await fetch('/api/qa', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ context_id: contextId, question: newQa.q, answer: newQa.a }) })
      if (res.ok) { setNewQa({ q: '', a: '' }); fetchQaPairs(contextId) }
    } catch { alert('Failed to add QA pair') }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-5xl bg-[#0a0a0a] border-l border-white/[0.06] h-full flex flex-col shadow-2xl animate-slide-in-right">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] bg-[#111]">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-xl">
              {bot.channel === 'whatsapp' ? '📱' : bot.channel === 'email' ? '📧' : '🌐'}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{bot.name}</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500 capitalize">{bot.channel} Bot</span>
                <span className="w-1 h-1 rounded-full bg-gray-700" />
                <span className={`text-[10px] font-medium border rounded-full px-2 py-0.5 ${bot.status === 'active' ? 'text-emerald-400 border-emerald-500/30' : 'text-gray-400 border-gray-700'}`}>{bot.status}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 border-b border-white/[0.06] bg-[#111]">
          {(['chats', 'settings', 'qa'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-3.5 px-4 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-purple-500 text-purple-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`}>
              {t === 'chats' ? '💬 Live Chats' : t === 'settings' ? '⚙️ Bot Settings' : '❓ Custom Q&A'}
            </button>
          ))}
        </div>

        {/* ── LIVE CHATS TAB ───────────────────────────────────── */}
        {tab === 'chats' && (
          <div className="flex-1 flex overflow-hidden">

            {/* Left: Session List */}
            <div className="w-80 flex-shrink-0 border-r border-white/[0.06] flex flex-col bg-[#0a0a0a]">

              {/* Filter tabs */}
              <div className="flex flex-wrap gap-1 p-3 border-b border-white/[0.06]">
                {FILTERS.map(f => (
                  <button key={f.id} onClick={() => setFilter(f.id as any)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${filter === f.id ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'text-gray-500 hover:text-white hover:bg-white/5 border border-transparent'}`}>
                    {f.label}
                  </button>
                ))}
                <button onClick={fetchSessions} className="ml-auto px-2 py-1 rounded-lg text-[11px] text-gray-600 hover:text-white hover:bg-white/5 transition-all border border-transparent" title="Refresh">
                  ↻
                </button>
              </div>

              {/* Session list */}
              <div className="flex-1 overflow-y-auto">
                {loadingSessions ? (
                  <div className="flex justify-center py-10"><div className="w-5 h-5 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" /></div>
                ) : sessions.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <div className="text-3xl mb-2">💬</div>
                    <p className="text-gray-500 text-sm">No conversations found</p>
                    <p className="text-gray-600 text-xs mt-1">Try a different filter or wait for visitors</p>
                  </div>
                ) : sessions.map(s => (
                  <div key={s.session_id} onClick={() => loadThread(s.session_id)}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-white/[0.04] transition-all ${activeSession?.session_id === s.session_id ? 'bg-purple-500/10 border-l-2 border-l-purple-500' : 'hover:bg-white/[0.03]'}`}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-base flex-shrink-0 bg-white/5">
                      {s.channel === 'whatsapp' ? '📱' : s.channel === 'email' ? '📧' : '💬'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className={`text-xs font-mono truncate ${s.unread_count > 0 ? 'text-white font-bold' : 'text-gray-300'}`}>
                          {s.session_id.slice(0, 12)}…
                          {s.mode === 'human' && <span className="ml-1 text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-md align-middle font-medium">Agent</span>}
                          {s.mode === 'waiting' && <span className="ml-1 text-[9px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded-md align-middle font-semibold whitespace-nowrap">Needs Intervention</span>}
                        </p>
                        <span className="text-[10px] text-gray-600 flex-shrink-0">{formatTime(s.last_message_at)}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {s.latest_message?.content || 'New conversation'}
                      </p>
                    </div>
                    {s.unread_count > 0 && <div className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0 mt-2" />}
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Thread */}
            <div className="flex-1 flex flex-col bg-[#111] overflow-hidden">
              {activeSession ? (
                <>
                  {/* Thread header */}
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] bg-[#0d0d0d]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-sm">
                        {activeSession.session_id.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Visitor {activeSession.session_id.slice(0, 8)}</p>
                        <p className="text-[11px] text-gray-500 capitalize">{activeSession.channel} · {activeSession.mode === 'ai' ? '🤖 Bot Active' : activeSession.mode === 'waiting' ? '🔴 Needs Intervention' : '👨‍💻 Agent Active'}</p>
                      </div>
                    </div>
                    <button onClick={handleTakeOver}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${activeSession.mode !== 'human' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20' : 'bg-white/5 text-gray-300 border-white/10 hover:border-white/20'}`}>
                      {activeSession.mode !== 'human' ? '🙋 Take Over' : '🤖 Return to AI'}
                    </button>
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
                    {loadingThread ? (
                      <div className="flex justify-center py-10"><div className="w-5 h-5 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" /></div>
                    ) : messages.length === 0 ? (
                      <div className="text-center py-10 text-gray-600 text-sm">No messages yet in this session.</div>
                    ) : messages.map((m, idx) => {
                      const isUser = m.role === 'user'
                      const isAgent = !isUser && m.mode === 'human'
                      const nextM = messages[idx + 1]
                      const hasFlow = !isUser && isFlowCard(m)
                      return (
                        <div key={m.id} className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
                          {hasFlow ? (
                            <div className="max-w-[90%]">
                              <DashboardFlowCard
                                message={m}
                                nextMessage={nextM}
                                botId={bot?.id}
                                contextId={bot?.client_id}
                                sessionId={activeSession?.session_id}
                              />
                              <span className="text-[10px] text-purple-400 block mt-1.5 opacity-80 text-right">🤖 AI Bot</span>
                            </div>
                          ) : (
                            <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm ${
                              isUser ? 'bg-[#1a1a1a] border border-white/[0.06] text-gray-100 rounded-tl-sm' :
                              isAgent ? 'bg-amber-500/15 border border-amber-500/20 text-white rounded-tr-sm' :
                              'bg-purple-500/15 border border-purple-500/20 text-white rounded-tr-sm'
                            }`}>
                              <p className="leading-relaxed">{m.content}</p>
                              <span className={`text-[10px] block mt-1 opacity-60 ${isUser ? 'text-gray-400' : isAgent ? 'text-amber-400' : 'text-purple-400'}`}>
                                {isUser ? '👤 Visitor' : isAgent ? '👨‍💻 You (Agent)' : '🤖 AI Bot'}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Reply composer */}
                  {activeSession.mode === 'human' ? (
                    <form onSubmit={handleSendReply} className="px-5 py-4 border-t border-white/[0.06] bg-[#0d0d0d]">
                      <div className="flex items-center gap-3">
                        <input autoFocus value={replyText} onChange={e => setReplyText(e.target.value)}
                          placeholder="Type a reply to the customer…"
                          className="flex-1 bg-[#111] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-amber-500/40" />
                        <button type="submit" disabled={!replyText.trim() || sendingReply}
                          className="px-5 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm font-semibold transition-all flex items-center gap-2">
                          {sendingReply ? <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" /> : 'Send ↵'}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="px-5 py-4 border-t border-white/[0.06] bg-[#0d0d0d] text-center">
                      <p className="text-xs text-gray-500">Click <strong className="text-amber-400">Take Over</strong> to pause the AI and reply directly to the customer.</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <svg className="w-14 h-14 mx-auto mb-4 text-gray-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p className="text-gray-500 font-medium">Select a conversation</p>
                    <p className="text-gray-700 text-sm mt-1">Choose a session from the left to view the full thread</p>
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* ── SETTINGS TAB ──────────────────────────────────────── */}
        {tab === 'settings' && (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="max-w-2xl space-y-6">

              {/* Identity */}
              <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white mb-1">🤖 Bot Identity</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Bot Name</label>
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                      className="w-full bg-[#0a0a0a] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/40" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">Bot Purpose</label>
                    <select value={form.name === bot.name ? (bot.purpose || 'support') : 'support'}
                      onChange={e => setForm({ ...form })}
                      className="w-full bg-[#0a0a0a] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/40">
                      <option value="support">Customer Support</option>
                      <option value="sales">Sales & Lead Gen</option>
                      <option value="hr">HR & Onboarding</option>
                      <option value="custom">Custom</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Appearance */}
              <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white mb-1">🎨 Appearance & Branding</h3>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Theme Color</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={form.theme_color || '#8b5cf6'}
                      onChange={e => setForm({ ...form, theme_color: e.target.value })}
                      className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border border-white/10" />
                    <input type="text" value={form.theme_color || '#8b5cf6'}
                      onChange={e => setForm({ ...form, theme_color: e.target.value })}
                      className="bg-[#0a0a0a] border border-white/[0.06] rounded-xl px-3 py-2 text-sm text-white focus:outline-none w-32 font-mono" />
                    <div className="flex gap-2">
                      {['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'].map(c => (
                        <button key={c} onClick={() => setForm({ ...form, theme_color: c })}
                          className="w-6 h-6 rounded-full border-2 border-transparent hover:border-white/40 transition-all"
                          style={{ backgroundColor: c }} />
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Widget Title</label>
                  <input type="text" value={form.widget_title || 'AI Assistant'}
                    onChange={e => setForm({ ...form, widget_title: e.target.value })}
                    placeholder="AI Assistant"
                    className="w-full bg-[#0a0a0a] border border-white/[0.06] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-purple-500/40" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Welcome Message</label>
                  <textarea value={form.welcome_message || 'Hi there! How can I help you today?'}
                    onChange={e => setForm({ ...form, welcome_message: e.target.value })} rows={2}
                    placeholder="Hi there! How can I help you today?"
                    className="w-full bg-[#0a0a0a] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/40 resize-none" />
                </div>
                {/* Live Preview */}
                <div className="pt-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-2 font-semibold">Widget Preview (Luminous White Glass UI)</p>
                  <div className="flex gap-3 items-end">
                    <div className="rounded-[24px] shadow-xl w-64 bg-white/95 border border-slate-200/90 backdrop-blur-xl p-4 flex flex-col gap-3 text-slate-800">
                      {/* Top model pill */}
                      <div className="flex items-center justify-between">
                        <div className="px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-800 flex items-center gap-1.5">
                          <span>{form.widget_title || 'SIA AI'}</span>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-400 text-[10px]">
                          <span>⚡ 4.6</span>
                        </div>
                      </div>

                      {/* Message bubble with timeline badge */}
                      <div className="flex gap-2 items-start mt-1">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-500 p-[1.5px] shrink-0 shadow-xs">
                          <div className="w-full h-full rounded-full bg-white flex items-center justify-center">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          </div>
                        </div>
                        <div className="flex-1 bg-slate-50 border border-slate-200/80 rounded-2xl rounded-tl-sm p-2.5 text-[11px] text-slate-800 leading-relaxed shadow-xs">
                          {form.welcome_message || 'Hi there! How can I help you today?'}
                        </div>
                      </div>

                      {/* Input dock preview */}
                      <div className="mt-1 bg-slate-100 border border-slate-200 rounded-full px-3 py-1.5 flex items-center justify-between text-[11px] text-slate-400">
                        <span>Ask anything...</span>
                        <div className="w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold">→</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Fallback & Handoff */}
              <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-5 space-y-4">
                <h3 className="text-sm font-semibold text-white mb-1">📢 Fallback & Handoff</h3>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Knowledge Fallback Message</label>
                  <p className="text-[10px] text-gray-500 mb-2">Sent when the bot cannot find an answer in the knowledge base.</p>
                  <textarea value={form.fallback_message} onChange={e => setForm({ ...form, fallback_message: e.target.value })} rows={3}
                    className="w-full bg-[#0a0a0a] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/40 resize-none" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">Human Handoff Message</label>
                  <p className="text-[10px] text-gray-500 mb-2">Sent when the bot triggers a human handoff.</p>
                  <textarea value={form.handoff_message} onChange={e => setForm({ ...form, handoff_message: e.target.value })} rows={3}
                    className="w-full bg-[#0a0a0a] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500/40 resize-none" />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button onClick={handleSaveSettings} disabled={saving}
                  className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors">
                  {saving ? 'Saving…' : 'Save All Settings'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Q&A TAB ───────────────────────────────────────────── */}
        {tab === 'qa' && (
          <div className="flex-1 overflow-y-auto p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold text-white">Custom Q&A Pairs</h3>
                <p className="text-sm text-gray-400 mt-1">Exact answers for specific questions — bypasses AI generation.</p>
              </div>
            </div>
            <form onSubmit={handleAddQa} className="bg-[#111] border border-white/[0.06] rounded-2xl p-5 mb-8">
              <h4 className="text-xs font-medium text-purple-400 uppercase tracking-wider mb-4">Add New Pair</h4>
              <div className="space-y-4">
                <input value={newQa.q} onChange={e => setNewQa({ ...newQa, q: e.target.value })} required
                  placeholder="e.g. Can you give me a discount code?"
                  className="w-full bg-[#0a0a0a] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/40" />
                <textarea value={newQa.a} onChange={e => setNewQa({ ...newQa, a: e.target.value })} required rows={3}
                  placeholder="e.g. Sure! Use code SAVE20 for 20% off your next order."
                  className="w-full bg-[#0a0a0a] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-500/40 resize-none" />
                <div className="flex justify-end">
                  <button type="submit" disabled={saving || !contextId}
                    className="bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-40">
                    {saving ? 'Adding…' : 'Add Q&A'}
                  </button>
                </div>
              </div>
            </form>
            <div className="space-y-3">
              {loadingQa ? (
                <div className="text-center py-8"><div className="w-5 h-5 rounded-full border-2 border-purple-500 border-t-transparent animate-spin mx-auto" /></div>
              ) : qaPairs.length === 0 ? (
                <div className="text-center py-12 text-gray-500 text-sm border border-white/[0.04] rounded-2xl bg-white/[0.01]">No custom Q&A pairs added yet.</div>
              ) : qaPairs.map(qa => (
                <div key={qa.id} className="bg-[#111] border border-white/[0.04] rounded-2xl p-4 flex gap-4 items-start">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white mb-2">{qa.question}</p>
                    <p className="text-sm text-purple-200/80 leading-relaxed bg-purple-500/10 p-3 rounded-xl border border-purple-500/20">{qa.answer}</p>
                  </div>
                  <button onClick={async () => {
                    if (confirm('Delete this Q&A?')) {
                      await supabase.from('qa_pairs').delete().eq('id', qa.id)
                      fetchQaPairs(contextId!)
                    }
                  }} className="text-gray-600 hover:text-red-400 p-1 mt-1">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
