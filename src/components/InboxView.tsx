'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { DashboardFlowCard, isFlowCard } from '@/components/chat/DashboardFlowCard'

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export function InboxView({ clientId, botId, isPanel = false }: { clientId: string, botId?: string, isPanel?: boolean }) {
  const supabase = createClient()
  const [user, setUser] = useState<any>(null)
  
  // Inbox List State
  const [sessions, setSessions] = useState<any[]>([])
  const [filter, setFilter] = useState<'all' | 'unassigned' | 'mine' | 'unread' | 'waiting'>('waiting')
  const [loadingSessions, setLoadingSessions] = useState(true)
  
  // Active Thread State
  const [activeSession, setActiveSession] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [replyText, setReplyText] = useState('')
  const [loadingThread, setLoadingThread] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
  }, [])

  useEffect(() => {
    if (clientId) fetchInbox()
  }, [clientId, botId, filter])

  useEffect(() => {
    if (activeSession) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  async function fetchInbox() {
    setLoadingSessions(true)
    try {
      let url = `/api/inbox?client_id=${clientId}&filter=${filter}`
      if (botId) url += `&bot_id=${botId}`
      if (filter === 'mine' && user) url += `&agent_id=${user.id}`
      const res = await fetch(url)
      if (res.ok) {
        let data = await res.json()
        if (filter === 'waiting') {
            data = data.filter((s: any) => s.mode === 'waiting')
        }
        setSessions(data)
      }
    } catch (err) {
      console.error(err)
    }
    setLoadingSessions(false)
  }

  async function loadThread(session_id: string) {
    setLoadingThread(true)
    try {
      const res = await fetch(`/api/inbox/${session_id}`)
      if (res.ok) {
        const data = await res.json()
        setActiveSession(data.session)
        setMessages(data.messages)
        setSessions(prev => prev.map(s => s.session_id === session_id ? { ...s, unread_count: 0 } : s))
      }
    } catch (err) {
      console.error(err)
    }
    setLoadingThread(false)
  }

  async function handleTakeOver() {
    if (!activeSession) return
    const newMode = activeSession.mode === 'human' ? 'ai' : 'human'
    try {
      const res = await fetch(`/api/inbox/${activeSession.session_id}?client_id=${encodeURIComponent(clientId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: newMode === 'human' ? 'takeover' : 'handback', agent_id: user?.id })
      })
      if (res.ok) {
        const updated = await res.json()
        setActiveSession(updated.session || updated)
        fetchInbox()
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function handleSendReply(e: React.FormEvent) {
    e.preventDefault()
    if (!replyText.trim() || !activeSession) return

    const tempMsg = {
      id: 'temp-' + Date.now(),
      content: replyText,
      sender: 'agent',
      created_at: new Date().toISOString()
    }
    setMessages(prev => [...prev, tempMsg])
    const currentText = replyText
    setReplyText('')

    try {
      const res = await fetch(`/api/inbox/${activeSession.session_id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: activeSession.client_id,
          bot_id: activeSession.bot_id,
          content: currentText,
          agent_id: user?.id,
          channel: activeSession.channel
        })
      })
      if (!res.ok) {
        setMessages(prev => prev.filter(m => m.id !== tempMsg.id))
        setReplyText(currentText)
      } else {
        const realMsg = await res.json()
        setMessages(prev => prev.map(m => m.id === tempMsg.id ? realMsg : m))
        fetchInbox()
      }
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-12 gap-0 ${isPanel ? 'h-full' : 'h-[calc(100vh-200px)] rounded-2xl border border-[var(--border-subtle)]'} overflow-hidden`}>
      
      {/* Left Panel - Conversation List */}
      <div className="lg:col-span-4 border-r border-[var(--border-subtle)] bg-[#0a0a0a] flex flex-col">
        {/* Filter tabs */}
        <div className="flex items-center gap-1 p-3 border-b border-[var(--border-subtle)] flex-wrap">
          {[
            { id: 'waiting', label: 'Waiting' },
            { id: 'all', label: 'All' },
            { id: 'unassigned', label: 'Unassigned' },
            { id: 'mine', label: 'Mine' },
            { id: 'unread', label: 'Unread' }
          ].map(tab => (
            <button 
              key={tab.id} 
              onClick={() => setFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filter === tab.id ? 'bg-purple-500/15 text-purple-400' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {loadingSessions ? (
            <div className="flex justify-center p-8"><div className="w-5 h-5 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" /></div>
          ) : sessions.length === 0 ? (
            <div className="text-center p-8 text-gray-600 text-sm">No conversations found</div>
          ) : (
            sessions.map(s => (
              <div 
                key={s.session_id} 
                onClick={() => loadThread(s.session_id)}
                className={`flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-[var(--border-subtle)] transition-all ${activeSession?.session_id === s.session_id ? 'bg-purple-500/5 border-l-2 border-l-purple-500' : 'hover:bg-white/5'}`}
              >
                <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-sm flex-shrink-0">
                  {s.channel === 'whatsapp' ? '📱' : s.channel === 'email' ? '📧' : '💬'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={`text-sm truncate ${s.unread_count > 0 ? 'font-semibold text-white' : 'text-gray-300'}`}>
                      {s.session_id.substring(0, 8)}
                      {s.mode === 'human' && <span className="ml-2 text-[9px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-md">Agent</span>}
                      {s.mode === 'waiting' && <span className="ml-2 text-[9px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-md">Waiting</span>}
                    </p>
                    <span className="text-[10px] text-gray-500 flex-shrink-0">{formatTime(s.last_message_at)}</span>
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${s.unread_count > 0 ? 'text-gray-300' : 'text-gray-500'}`}>
                    {s.latest_message?.content || 'New conversation'}
                  </p>
                </div>
                {s.unread_count > 0 && <div className="w-2 h-2 rounded-full bg-purple-500 flex-shrink-0 mt-2" />}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Panel - Thread */}
      <div className="lg:col-span-8 flex flex-col bg-[#111] relative">
        {activeSession ? (
          <>
            {/* Thread header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] bg-[#0a0a0a]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-sm font-semibold">
                  {activeSession.session_id.substring(0,1).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Visitor {activeSession.session_id.substring(0,6)}</p>
                  <p className="text-xs text-gray-500 capitalize">{activeSession.channel} Chat · {activeSession.mode === 'ai' ? 'Bot Active' : 'Agent Active'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleTakeOver} className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${activeSession.mode === 'ai' || activeSession.mode === 'waiting' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20' : 'bg-white/5 text-white border-white/10 hover:border-white/20'}`}>
                  {activeSession.mode === 'ai' || activeSession.mode === 'waiting' ? 'Take Over' : 'Return to AI'}
                </button>
              </div>
            </div>
            
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {loadingThread ? (
                <div className="flex justify-center p-8"><div className="w-5 h-5 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" /></div>
              ) : (
                messages.map((m, idx) => {
                  const nextM = messages[idx + 1]
                  const hasFlow = m.sender !== 'user' && isFlowCard(m)
                  return (
                    <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-start' : 'justify-end'}`}>
                      {hasFlow ? (
                        <div className="max-w-[90%]">
                          <DashboardFlowCard
                            message={{ ...m, role: m.sender }}
                            nextMessage={nextM ? { ...nextM, role: nextM.sender } : undefined}
                            botId={activeSession?.bot_id}
                            contextId={activeSession?.client_id}
                            sessionId={activeSession?.session_id}
                          />
                          <span className="text-[10px] text-purple-400 block mt-1.5 opacity-80 text-right">🤖 AI Response</span>
                        </div>
                      ) : (
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm text-white ${m.sender === 'user' ? 'bg-[#1a1a1a] border border-white/[0.04] rounded-tl-sm' : 'bg-purple-500/15 border border-purple-500/20 rounded-tr-sm'}`}>
                          {m.media_url && (
                            <div className="overflow-hidden rounded-xl border border-white/10 max-w-[240px] mb-2">
                              <img
                                src={m.media_url}
                                alt="Attachment"
                                className="w-full max-h-[200px] object-cover rounded-lg cursor-pointer hover:opacity-95 transition-opacity"
                                onClick={() => window.open(m.media_url, '_blank')}
                              />
                            </div>
                          )}
                          {m.content && !m.content.trim().startsWith('Analyze this image') && m.content.trim() !== 'Sent a photo' ? m.content : null}
                          {m.sender === 'assistant' && <span className="text-[10px] text-purple-400 block mt-1 opacity-80">🤖 AI Response</span>}
                          {m.sender === 'agent' && <span className="text-[10px] text-purple-400 block mt-1 opacity-80">👨‍💻 Agent Response</span>}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>
            
            {/* Composer */}
            {activeSession.mode === 'human' ? (
              <form onSubmit={handleSendReply} className="px-6 py-4 border-t border-[var(--border-subtle)] bg-[#0a0a0a]">
                <div className="flex items-center gap-3">
                  <input 
                    autoFocus
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Type a reply..." 
                    className="flex-1 bg-[#111] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/40" 
                  />
                  <button type="submit" disabled={!replyText.trim()} className="px-4 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                    Send
                  </button>
                </div>
              </form>
            ) : (
              <div className="px-6 py-4 border-t border-[var(--border-subtle)] text-center bg-[#0a0a0a]">
                <p className="text-xs text-gray-500">Click "Take Over" to pause the AI and reply directly.</p>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              <p className="text-sm">Select a conversation to view the thread</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
