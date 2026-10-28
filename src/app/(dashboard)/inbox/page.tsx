'use client'
import { activeWorkspaceId } from '@/lib/client/workspace'
import React, { useState, useEffect, useRef, useCallback, useMemo, useDeferredValue } from 'react'
import {
  Search, Bot, User, Sparkles, PanelRight, Paperclip, Smile, Send,
  Mail, MessageCircle, Globe, Loader2, UserCheck, RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase-browser'
import { storeInboxChannel } from '@/lib/realtime/channels'
import { subscribeChatRoom } from '@/lib/realtime/chatRoomSubscription'
import {
  sendAgentReply,
  handleSessionAction,
  type ChatMessage,
} from '@/app/actions/chat'
import { DashboardFlowCard, isFlowCard } from '@/components/chat/DashboardFlowCard'
import {fetchDashboardData,readDashboardData,writeDashboardData} from '@/lib/client/featureDataCache'

const TABS = [
  { id: 'all',      label: 'All' },
  { id: 'ai',       label: 'Bot Active' },
  { id: 'waiting',  label: 'Waiting (Handoff)' },
  { id: 'human',    label: 'Human (Mine)' },
  { id: 'resolved', label: 'Resolved' },
]

const STATUS_BADGE: Record<string, string> = {
  ai:       'bg-purple-100 text-purple-700',
  waiting:  'bg-amber-100  text-amber-700',
  human:    'bg-blue-100   text-blue-700',
  resolved: 'bg-green-100  text-green-700',
}

const CHANNEL_ICON: Record<string, React.ReactNode> = {
  whatsapp: <MessageCircle className="w-3 h-3 text-green-500" />,
  widget:   <Globe className="w-3 h-3 text-blue-500" />,
  website:  <Globe className="w-3 h-3 text-blue-500" />,
  email:    <Mail className="w-3 h-3 text-red-400" />,
  telegram: <Send className="w-3 h-3 text-sky-500" />,
}

function timeAgo(iso: string) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000)   return 'just now'
  if (diff < 3600_000) return Math.floor(diff/60_000) + 'm ago'
  if (diff < 86400_000) return Math.floor(diff/3600_000) + 'h ago'
  return new Date(iso).toLocaleDateString()
}

const convUrl=(clientId:string)=>`/api/inbox?client_id=${encodeURIComponent(clientId)}`
const msgUrl=(sid:string,clientId=activeWorkspaceId(''))=>`/api/inbox/${encodeURIComponent(sid)}?client_id=${encodeURIComponent(clientId)}&action=messages`
const contextUrl=(sid:string)=>`/api/inbox/${encodeURIComponent(sid)}/context-card`
function readMsgCache(sid:string){return readDashboardData<ChatMessage[]>(msgUrl(sid))||null}
function writeMsgCache(sid:string,msgs:ChatMessage[]){writeDashboardData(msgUrl(sid),msgs)}
function readConvCache(clientId:string){return readDashboardData<any[]>(convUrl(clientId))||null}
function writeConvCache(clientId:string,data:any[]){writeDashboardData(convUrl(clientId),data)}

export default function InboxPage() {
  const supabase = useMemo(() => createClient(), [])
  const initialWorkspace = useMemo(() => activeWorkspaceId(''), [])
  const initialConvos = useMemo(() => initialWorkspace ? (readConvCache(initialWorkspace)||[]) : [], [initialWorkspace])

  const [clientId, setClientId]       = useState<string | null>(initialWorkspace||null)
  const [activeTab, setActiveTab]     = useState('all')
  const [convos, setConvos]           = useState<any[]>(initialConvos)
  const [activeConvo, setActiveConvo] = useState<any>(initialConvos[0]||null)
  const [msgs, setMsgs]               = useState<any[]>([])
  const [replyText, setReplyText]     = useState('')
  const [search, setSearch]           = useState('')
  const deferredSearch                = useDeferredValue(search.trim().toLowerCase())
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [loadingConvos, setLoadingConvos] = useState(initialConvos.length===0)
  const [loadingMsgs, setLoadingMsgs]     = useState(false)
  const [sending, setSending]         = useState(false)
  const [contextCard, setContextCard] = useState<any>(null)
  const msgsEndRef = useRef<HTMLDivElement>(null)

  const isFetchingConvosRef = useRef(false)
  const isFetchingMsgsRef   = useRef(false)
  const debounceTimerRef    = useRef<any>(null)

  // Auth setup (single clean check)
  useEffect(() => {
    const syncAuthenticatedUser=()=>supabase.auth.getUser().then(({ data }) => {
      const uid = activeWorkspaceId(data?.user?.id || '')
      if (uid) setClientId(prev => prev !== uid ? uid : prev)
    })
    void syncAuthenticatedUser()
    // Auth events are only invalidation signals. Their session payload is not
    // trusted as identity; getUser() verifies it with Supabase Auth.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { void syncAuthenticatedUser() })
    return () => subscription.unsubscribe()
  }, [supabase])

  const [skeletonCount, setSkeletonCount] = useState(4) // for loading placeholder

  const loadConvos = useCallback(async (silent = false, force = false) => {
    if (!clientId) return
    if (isFetchingConvosRef.current) return

    // ── 1. Serve browser cache INSTANTLY (0ms) ──
    const cached = readConvCache(clientId)
    if (cached && cached.length > 0) {
      setConvos(cached)
      setSkeletonCount(cached.length)
      setLoadingConvos(false)
      setActiveConvo((prev: any) => prev || cached[0] || null)
      silent = true
    } else if (!silent) {
      setLoadingConvos(true)
    }

    // ── 2. Standard HTTP GET fetch (Zero Next.js POST /inbox actions) ──
    isFetchingConvosRef.current = true
    try {
      const data=await fetchDashboardData<any[]>(convUrl(clientId),{force})
      if (Array.isArray(data)) {
          setConvos(data)
          setSkeletonCount(data.length || 4)
          writeConvCache(clientId, data)
          setActiveConvo((prev: any) => {
            if (!prev) return data[0] || null
            const prevId = prev.session_id || prev.id
            const matched = data.find((c: any) => (c.session_id && c.session_id === prevId) || c.id === prevId)
            return matched ? { ...prev, ...matched } : prev
          })
      }
    } catch (e) {
      console.error('[loadConvos error]:', e)
    } finally {
      isFetchingConvosRef.current = false
      setLoadingConvos(false)
    }
  }, [clientId])

  const debouncedLoadConvos = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      loadConvos(true,true)
    }, 400)
  }, [loadConvos])

  const debouncedLoadConvosRef = useRef(debouncedLoadConvos)
  debouncedLoadConvosRef.current = debouncedLoadConvos

  useEffect(() => {
    if (!clientId) return
    loadConvos()

    let visTimer: any = null
    const onVis = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        if (visTimer) clearTimeout(visTimer)
        visTimer = setTimeout(() => {
          loadConvos(true)
        }, 300)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)

    // ── Direct-to-Supabase Realtime for global store inbox ──
    const storeChannel = supabase
      .channel(storeInboxChannel(clientId))
      .on('broadcast', { event: 'inbox_update' }, () => {
        debouncedLoadConvos()
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'sessions',
        filter: `client_id=eq.${clientId}`,
      }, (payload:any) => {
        const changed=payload?.new
        if(payload?.eventType==='UPDATE'&&changed){
          setConvos(previous=>{
            const next=previous.map(row=>(row.id===changed.id||row.session_id===changed.session_id)?{...row,...changed,status:changed.mode==='resolved'?'resolved':changed.mode}:row)
            writeConvCache(clientId,next)
            return next
          })
        }else debouncedLoadConvos()
      })
      .subscribe()

    return () => {
      if (visTimer) clearTimeout(visTimer)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
      supabase.removeChannel(storeChannel)
    }
  }, [clientId, loadConvos, debouncedLoadConvos, supabase])

  useEffect(() => {
    if (!activeConvo || !clientId) return

    const sid = activeConvo.session_id || activeConvo.id
    let isSubscribed = true

    // ── 1. Show browser-cached messages INSTANTLY (0ms) ──
    const browserCached = readMsgCache(sid)
    if (browserCached && browserCached.length > 0) {
      setMsgs(browserCached)
      setLoadingMsgs(false)
      setTimeout(() => msgsEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior }), 50)
    } else {
      setMsgs([])
      setLoadingMsgs(true)
    }

    /** Full load via standard HTTP GET (0 Server Action POST overhead) */
    const loadMessages = async (isBackground = false) => {
      if (typeof document !== 'undefined' && document.hidden) return
      if (isFetchingMsgsRef.current && isBackground) return

      isFetchingMsgsRef.current = true
      try {
        const fetched=await fetchDashboardData<ChatMessage[]>(msgUrl(sid,clientId),{force:isBackground})
        if (!isSubscribed) return

        {
          const newArr: ChatMessage[] = Array.isArray(fetched) ? fetched : []

          setMsgs(prev => {
            const optimistic = prev.filter(m => String(m.id).startsWith('temp-'))
            const prevReal    = prev.filter(m => !String(m.id).startsWith('temp-'))

            // ORDERING & IDEMPOTENCY INVARIANT (Issue 10):
            // All message merges must key strictly by the authoritative Postgres message ID (never arrival order or client timestamp).
            // Union-merge existing confirmed messages with fetched messages via Map<string, ChatMessage> and sort chronologically by Postgres created_at.
            const map = new Map<string, ChatMessage>()
            for (const m of prevReal) {
              if (m.id) map.set(String(m.id), m)
            }
            for (const m of newArr) {
              if (m.id) map.set(String(m.id), m)
            }

            const merged = Array.from(map.values()).sort((a, b) => {
              const tA = new Date(a.created_at || 0).getTime()
              const tB = new Date(b.created_at || 0).getTime()
              return tA - tB
            })

            // Reconcile optimistic messages against merged confirmed messages
            const remainingOptimistic = optimistic.filter(opt =>
              !merged.some(m =>
                (m.role === opt.role || (['agent', 'human'].includes(m.role) && ['agent', 'human'].includes(opt.role))) &&
                m.content?.trim() === opt.content?.trim()
              )
            )

            const hasChanges =
              merged.length !== prevReal.length ||
              remainingOptimistic.length !== optimistic.length ||
              (merged.length > 0 && merged[merged.length - 1]?.id !== prevReal[prevReal.length - 1]?.id)

            if (hasChanges) {
              writeMsgCache(sid, merged)
              setTimeout(() => msgsEndRef.current?.scrollIntoView({ behavior: isBackground ? 'smooth' : ('instant' as ScrollBehavior) }), 80)
              return [...merged, ...remainingOptimistic]
            }
            return prev
          })
        }
        if (!isBackground) {
          setLoadingMsgs(false)
          setTimeout(() => msgsEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior }), 80)
        }
      } catch (err) {
        console.error('[loadMessages error]:', err)
        if (!isBackground && isSubscribed) setLoadingMsgs(false)
      } finally {
        isFetchingMsgsRef.current = false
      }
    }

    // ── 2. Initial load in background (refreshes cache) ──
    loadMessages(!!browserCached)

    // ── 3. Reconcile on tab focus / visibility change (debounced) ──
    let msgVisTimer: any = null
    const onVis = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        if (msgVisTimer) clearTimeout(msgVisTimer)
        msgVisTimer = setTimeout(() => {
          loadMessages(true)
        }, 300)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)

    // ── 4. Targeted WebSocket Push for Active Chat (0 Next.js CPU, 0 Polling) ──
    const handleIncomingMessage = (newMsg: any) => {
      if (!newMsg) return
      setMsgs(prev => {
        if (prev.some(m => m.id === newMsg.id)) {
          const updated = prev.map(m => m.id === newMsg.id ? { ...m, ...newMsg } : m)
          writeMsgCache(sid, updated.filter(m => !String(m.id).startsWith('temp-')))
          return updated
        }

        // Reconcile and consume matching optimistic bubble so it doesn't duplicate
        let matchedOptimistic = false
        const remainingOptimistic = prev.filter(m => {
          if (!String(m.id).startsWith('temp-')) return false
          if (
            !matchedOptimistic &&
            (m.role === newMsg.role || (['agent', 'human'].includes(m.role) && ['agent', 'human'].includes(newMsg.role))) &&
            m.content?.trim() === newMsg.content?.trim()
          ) {
            matchedOptimistic = true
            return false
          }
          return true
        })

        const confirmed  = prev.filter(m => !String(m.id).startsWith('temp-'))
        const updated    = [...confirmed, newMsg, ...remainingOptimistic]
        writeMsgCache(sid, updated.filter(m => !String(m.id).startsWith('temp-')))
        setTimeout(() => msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
        return updated
      })
      debouncedLoadConvosRef.current()
    }

    const unsubscribeRoom = subscribeChatRoom(
      sid,
      handleIncomingMessage,
      (status) => {
        if (status === 'SUBSCRIBED') {
          // Backfill on every (re)connect — covers cold start AND reconnect-after-drop
          loadMessages(true)
        }
      }
    )

    // Release this view's listener when switching or closing chat.
    return () => {
      isSubscribed = false
      if (msgVisTimer) clearTimeout(msgVisTimer)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
      unsubscribeRoom()
    }
  }, [activeConvo?.session_id, activeConvo?.id, clientId, supabase])

  // Fetch context card via standard HTTP GET
  useEffect(() => {
    if (!activeConvo) { setContextCard(null); return }
    const sid = activeConvo.session_id || activeConvo.id
    const cached=readDashboardData(contextUrl(sid))
    if(cached)setContextCard(cached)
    fetchDashboardData(contextUrl(sid))
      .then(d => setContextCard(d || null))
      .catch(() => {if(!cached)setContextCard(null)})
  }, [activeConvo?.session_id, activeConvo?.id])

  const handleSend = async () => {
    const text = replyText.trim()
    if (!text || !activeConvo || !clientId || sending) return
    setSending(true)
    setReplyText('')
    const tempId = 'temp-' + Date.now()
    // Optimistic message bubble
    setMsgs(prev => [...prev, { id: tempId, role: 'agent', content: text, created_at: new Date().toISOString() }])
    setTimeout(() => msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)

    const sid = activeConvo.session_id || activeConvo.id
    try {
      const confirmedMsg = await sendAgentReply(sid, text, clientId)

      // Reconcile or replace optimistic tempId with confirmed message
      setMsgs(prev => {
        // If Realtime already delivered confirmedMsg into msgs
        if (confirmedMsg && prev.some(m => m.id === confirmedMsg.id)) {
          const cleaned = prev.filter(m => m.id !== tempId)
          writeMsgCache(sid, cleaned.filter(m => !String(m.id).startsWith('temp-')))
          return cleaned
        }

        // If Realtime hasn't arrived yet, replace tempId in place with confirmedMsg
        if (confirmedMsg) {
          const hasTemp = prev.some(m => m.id === tempId)
          if (hasTemp) {
            const replaced = prev.map(m => m.id === tempId ? confirmedMsg : m)
            writeMsgCache(sid, replaced.filter(m => !String(m.id).startsWith('temp-')))
            return replaced
          }
          const appended = [...prev.filter(m => m.id !== tempId), confirmedMsg]
          writeMsgCache(sid, appended.filter(m => !String(m.id).startsWith('temp-')))
          return appended
        }

        // Fallback cleanup
        const fallback = prev.filter(m => m.id !== tempId)
        writeMsgCache(sid, fallback.filter(m => !String(m.id).startsWith('temp-')))
        return fallback
      })

      if (activeConvo.mode === 'ai' || activeConvo.mode === 'waiting') {
        const res = await handleSessionAction(sid, 'takeover', clientId)
        if (res?.session) {
          setActiveConvo((prev: any) => ({ ...prev, ...res.session }))
          setConvos((prev: any[]) => prev.map((c: any) =>
            (c.session_id && c.session_id === res.session.session_id) || c.id === res.session.id ? { ...c, ...res.session } : c
          ))
          if (res.systemMessages?.length) {
            setMsgs(prev => {
              const ids = new Set(prev.map((m: any) => m.id))
              const newSys = res.systemMessages!.filter((m: any) => !ids.has(m.id))
              if (newSys.length === 0) return prev
              const merged = [...prev, ...newSys]
              writeMsgCache(sid, merged.filter(m => !String(m.id).startsWith('temp-')))
              return merged
            })
          }
        }
      }
      // Invalidate convo list cache so sidebar updates
      loadConvos(true,true)
    } catch (err) {
      console.error('[handleSend error]:', err)
      setMsgs(prev => prev.filter(m => m.id !== tempId))
    } finally {
      setSending(false)
    }
  }

  const handleAction = async (action: 'takeover' | 'handback' | 'resolve') => {
    if (!activeConvo || !clientId) return
    const sid = activeConvo.session_id || activeConvo.id

    // Optimistically update mode immediately
    const optimisticMode = action === 'takeover' ? 'human' : action === 'resolve' ? 'resolved' : 'ai'
    setActiveConvo((prev: any) => ({ ...prev, mode: optimisticMode, status: optimisticMode }))

    try {
      const res = await handleSessionAction(sid, action, clientId)
      if (res?.session) {
        setActiveConvo((prev: any) => ({ ...prev, ...res.session }))
        setConvos((prev: any[]) => prev.map((c: any) =>
          (c.session_id && c.session_id === res.session.session_id) || c.id === res.session.id ? { ...c, ...res.session } : c
        ))
        if (res.systemMessages?.length) {
          setMsgs(prev => {
            const ids = new Set(prev.map((m: any) => m.id))
            const newSys = res.systemMessages!.filter((m: any) => !ids.has(m.id))
            if (newSys.length === 0) return prev
            const merged = [...prev, ...newSys]
            // Write system messages into browser cache immediately
            writeMsgCache(sid, merged.filter(m => !String(m.id).startsWith('temp-')))
            setTimeout(() => msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
            return merged
          })
        }
      }
      loadConvos(true,true)
    } catch (err) {
      console.error('[handleAction error]:', err)
      setActiveConvo((prev: any) => ({ ...prev, mode: activeConvo.mode, status: activeConvo.status }))
    }
  }



  const filtered = useMemo(() => convos.filter((c: any) => {
    if (c.channel === 'email') return false
    if(deferredSearch){const haystack=`${c.visitor_name||''} ${c.contacts?.name||''} ${c.contacts?.email||''} ${c.last_message||''} ${c.session_id||c.id||''}`.toLowerCase();if(!haystack.includes(deferredSearch))return false}
    if (activeTab === 'all')      return true
    if (activeTab === 'resolved') return c.status === 'resolved' || c.mode === 'resolved'
    return c.mode === activeTab && c.status !== 'resolved' && c.mode !== 'resolved'
  }), [convos, activeTab, deferredSearch])

  return (
    <div className="h-[calc(100vh)] overflow-hidden flex bg-white -m-4">

      {/* LEFT */}
      <section className="w-[300px] border-r border-gray-200 flex flex-col bg-[#f9f9f9] shrink-0">
        <div className="p-3 border-b border-gray-200 bg-white shrink-0 space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search..." className="w-full pl-8 pr-3 py-1.5 bg-gray-100 rounded-lg text-[12px] outline-none focus:ring-1 focus:ring-gray-300" />
            </div>
            <button onClick={() => loadConvos(false,true)} title="Refresh" className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex overflow-x-auto scrollbar-hide gap-0">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={cn('px-2.5 py-1.5 text-[11px] font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0',
                  activeTab === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
                )}>{t.label}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Skeleton loading — no blank screen flash */}
          {loadingConvos && convos.length === 0 && (
            Array.from({ length: skeletonCount }).map((_, i) => (
              <div key={i} className="w-full p-3 border-b border-gray-100 flex gap-3 border-l-2 border-l-transparent animate-pulse">
                <div className="w-9 h-9 rounded-full bg-gray-200 shrink-0" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-2.5 bg-gray-200 rounded w-3/4" />
                  <div className="h-2 bg-gray-100 rounded w-full" />
                  <div className="h-2 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))
          )}
          {!loadingConvos && filtered.length === 0 && (
            <div className="p-6 text-center text-xs text-gray-400">
              No conversations.
              {activeTab !== 'all' && <button onClick={() => setActiveTab('all')} className="block mx-auto mt-2 text-blue-500 underline">Show all</button>}
            </div>
          )}
          {filtered.map((c: any) => {
            const isActive = (activeConvo?.session_id && activeConvo.session_id === c.session_id) || (activeConvo?.id === c.id)
            const name     = c.visitor_name || c.contacts?.name || ('Visitor ' + (c.session_id || c.id || '').slice(0, 6))
            const channel  = c.channel || 'website'
            const modeKey  = c.status === 'resolved' ? 'resolved' : (c.mode || 'ai')
            const lastTs   = c.last_message_at || c.created_at
            const preview  = c.last_message ? c.last_message.slice(0, 55) + (c.last_message.length > 55 ? '…' : '') : 'No messages yet'
            return (
              <button key={c.id || c.session_id} onClick={() => setActiveConvo(c)}
                className={cn('w-full text-left p-3 border-b border-gray-100 flex gap-3 border-l-2 transition-colors',
                  isActive ? 'border-l-blue-500 bg-white' : 'border-l-transparent hover:bg-white/70'
                )}>
                <div className={cn('w-9 h-9 rounded-full flex items-center justify-center font-bold text-[12px] shrink-0 uppercase',
                  isActive ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
                )}>{name.substring(0, 2)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-[13px] font-semibold text-gray-900 truncate">{name}</p>
                    <span className="text-[10px] text-gray-400 shrink-0 ml-1">{timeAgo(lastTs)}</span>
                  </div>
                  <p className="text-[11px] text-gray-500 truncate mb-1.5">{preview}</p>
                  <div className="flex items-center gap-1.5">
                    {CHANNEL_ICON[channel] || <Globe className="w-3 h-3 text-gray-400" />}
                    <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide', STATUS_BADGE[modeKey] || 'bg-gray-100 text-gray-600')}>
                      {modeKey}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* CENTER */}
      <section className="flex-1 flex flex-col min-w-0">
        {!activeConvo ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2">
            <MessageCircle className="w-10 h-10 text-gray-200" />
            <p className="text-sm">Select a conversation</p>
          </div>
        ) : (
          <>
            <div className="h-14 border-b border-gray-200 px-4 flex items-center justify-between shrink-0 bg-white shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-[11px] font-bold uppercase">
                  {(activeConvo.visitor_name || activeConvo.session_id || activeConvo.id || 'U').substring(0, 2)}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{activeConvo.visitor_name || ('Visitor ' + (activeConvo.session_id || activeConvo.id || '').slice(0, 6))}</p>
                  <p className="text-[11px] text-gray-500 capitalize">{activeConvo.channel || 'website'} · {activeConvo.mode || 'ai'} mode</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {activeConvo.status !== 'resolved' && activeConvo.mode !== 'human' && (
                  <Button variant="outline" size="sm" className="h-7 px-3 text-[11px]" onClick={() => handleAction('takeover')}>Take Over</Button>
                )}
                {activeConvo.mode === 'human' && activeConvo.status !== 'resolved' && (
                  <Button variant="outline" size="sm" className="h-7 px-3 text-[11px] text-amber-600" onClick={() => handleAction('handback')}>Hand to AI</Button>
                )}
                {activeConvo.status !== 'resolved' && (
                  <Button variant="outline" size="sm" className="h-7 px-3 text-[11px] text-green-600" onClick={() => handleAction('resolve')}>Resolve</Button>
                )}
                <div className="w-px h-4 bg-gray-200 mx-1" />
                <button onClick={() => setIsSidebarOpen(v => !v)}
                  className={cn('w-7 h-7 rounded-lg flex items-center justify-center transition-colors', isSidebarOpen ? 'bg-gray-100' : 'text-gray-500 hover:bg-gray-100')}>
                  <PanelRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-white">
              {loadingMsgs ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
              ) : msgs.length === 0 ? (
                <div className="flex justify-center py-8 text-xs text-gray-400">No messages yet.</div>
              ) : msgs.map((msg: any, idx: number) => {
                if (msg.role === 'system') {
                  return (
                    <div key={msg.id} className="flex justify-center my-2">
                      <span className="px-3 py-1 bg-gray-100 border border-gray-200 text-gray-500 rounded-full text-[11px] italic">
                        {msg.content}
                      </span>
                    </div>
                  )
                }
                const isUser  = msg.role === 'user'
                const isBot   = msg.role === 'assistant' || msg.role === 'ai'
                const isAgent = msg.role === 'agent' || msg.role === 'human'
                const isRight = isBot || isAgent
                const nextMsg = msgs[idx + 1]
                const hasFlowCard = !isUser && isFlowCard(msg)

                return (
                  <div key={msg.id} className={cn('flex gap-3 max-w-2xl', isRight ? 'ml-auto flex-row-reverse' : '')}>
                    <div className={cn('w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1',
                      isBot ? 'bg-purple-100' : isAgent ? 'bg-blue-100' : 'bg-gray-100 border border-gray-200'
                    )}>
                      {isBot ? <Bot className="w-4 h-4 text-purple-600" /> : isAgent ? <UserCheck className="w-4 h-4 text-blue-600" /> : <User className="w-4 h-4 text-gray-500" />}
                    </div>
                    <div className={cn('flex flex-col gap-1', isRight && 'items-end')}>
                      {msg.media_url && (
                        <div className="overflow-hidden rounded-xl border border-gray-200 max-w-[260px] shadow-sm mb-1 bg-gray-50">
                          <img
                            src={msg.media_url}
                            alt="Attachment"
                            className="w-full max-h-[220px] object-cover rounded-lg cursor-pointer hover:opacity-95 transition-opacity"
                            onClick={() => window.open(msg.media_url, '_blank')}
                          />
                        </div>
                      )}
                      {hasFlowCard ? (
                        <DashboardFlowCard
                          message={msg}
                          nextMessage={nextMsg}
                          botId={activeConvo?.bot_id}
                          contextId={activeConvo?.client_id}
                          sessionId={activeConvo?.session_id || activeConvo?.id}
                        />
                      ) : msg.content && !msg.content.trim().startsWith('Analyze this image') && msg.content.trim() !== 'Sent a photo' ? (
                        <div className={cn('px-4 py-2.5 rounded-xl text-[13px] leading-relaxed whitespace-pre-wrap',
                          isUser ? 'bg-gray-100 border border-gray-200 text-gray-900 rounded-tl-sm' :
                          isAgent ? 'bg-blue-600 text-white rounded-tr-sm shadow-sm' :
                          'bg-purple-600 text-white rounded-tr-sm shadow-sm'
                        )}>{msg.content}</div>
                      ) : null}
                      <div className={cn('flex items-center gap-1.5', isRight ? 'pr-1' : 'pl-1')}>
                        <span className="text-[10px] text-gray-400">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {isBot && <span className="text-[10px] text-purple-600 font-medium flex items-center gap-1"><Sparkles className="w-3 h-3" />AI</span>}
                        {isAgent && <span className="text-[10px] text-blue-600 font-medium">Agent</span>}
                        {isUser && <span className="text-[10px] text-gray-500 font-medium">Customer</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
              <div ref={msgsEndRef} />
            </div>

            {activeConvo.status === 'resolved' ? (
              <div className="p-4 border-t bg-gray-50 text-center text-sm text-gray-500">This conversation is resolved.</div>
            ) : (
              <div className="p-4 border-t bg-white shrink-0">
                <div className="border border-gray-200 rounded-xl bg-gray-50 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
                  <textarea
                    className="w-full bg-transparent border-0 resize-none text-[13px] focus:ring-0 p-3 min-h-[56px] text-gray-900 placeholder:text-gray-400 outline-none"
                    placeholder={
                      activeConvo.channel === 'email'
                        ? `Reply via email to ${activeConvo.contacts?.email || activeConvo.visitor_name || 'customer'}… (Enter to send)`
                        : activeConvo.channel === 'whatsapp'
                        ? `Reply via WhatsApp to ${activeConvo.contacts?.phone || activeConvo.visitor_name || 'customer'}… (Enter to send)`
                        : "Type a reply… (Enter to send, Shift+Enter for newline)"
                    }
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                    rows={2}
                  />
                  <div className="flex items-center justify-between px-3 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                        {CHANNEL_ICON[activeConvo.channel || 'website']}
                        <span>{activeConvo.channel === 'email' ? 'Email Thread' : activeConvo.channel === 'whatsapp' ? 'WhatsApp' : 'Live Chat'}</span>
                      </span>
                    </div>
                    <button onClick={handleSend} disabled={!replyText.trim() || sending}
                      className="h-8 px-4 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm">
                      {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : activeConvo.channel === 'email' ? <><Mail className="w-3.5 h-3.5" /> Send Email</> : <><Send className="w-3.5 h-3.5" /> Send</>}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {/* RIGHT SIDEBAR — Context Card */}
      {isSidebarOpen && activeConvo && (() => {
        const card = contextCard
        const visitorName = card?.visitor_name || activeConvo.visitor_name || ('Visitor ' + (activeConvo.session_id || activeConvo.id || '').slice(0, 6))
        const modeKey = activeConvo.status === 'resolved' ? 'resolved' : (activeConvo.mode || 'ai')
        return (
          <aside className="w-[256px] border-l border-gray-200 bg-white shrink-0 flex flex-col overflow-y-auto">
            <div className="h-14 px-4 border-b border-gray-200 flex items-center shrink-0">
              <p className="text-[14px] font-bold text-gray-900">Visitor Context</p>
            </div>
            <div className="p-4 space-y-4">
              {/* Avatar + name + badges */}
              <div className="flex flex-col items-center text-center gap-1.5">
                <div className="w-14 h-14 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-700 text-xl font-bold uppercase">
                  {visitorName.substring(0, 2)}
                </div>
                <p className="font-semibold text-gray-900 text-sm mt-0.5">{visitorName}</p>
                <div className="flex items-center gap-1.5 flex-wrap justify-center">
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-gray-100 text-gray-600 capitalize">
                    {activeConvo.channel || 'website'}
                  </span>
                  <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide', STATUS_BADGE[modeKey] || 'bg-gray-100 text-gray-600')}>
                    {modeKey}
                  </span>
                </div>
              </div>

              {/* Last user question — most useful for the agent */}
              {card?.last_user_question && card.last_user_question !== 'No messages yet' && (
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Last Question</p>
                  <p className="text-[12px] text-gray-800 bg-gray-50 rounded-lg p-2.5 border border-gray-100 leading-relaxed line-clamp-3">
                    {card.last_user_question}
                  </p>
                </div>
              )}

              {/* Session details */}
              <div className="space-y-2.5 text-[12px]">
                {([
                  ['Messages',  card?.message_count != null ? `${card.message_count} total` : '—'],
                  ['Channel',   activeConvo.channel || 'website'],
                  ['Started',   new Date(activeConvo.created_at).toLocaleString()],
                  ['Last Msg',  activeConvo.last_message_at ? timeAgo(activeConvo.last_message_at) : '—'],
                ] as [string, string][]).map(([label, val]) => (
                  <div key={label}>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
                    <p className="text-gray-900">{val}</p>
                  </div>
                ))}
              </div>

              {/* Contact info if available */}
              {card?.contact && (card.contact.email || card.contact.phone) && (
                <div className="pt-1 border-t border-gray-100 space-y-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Contact</p>
                  {card.contact.email && (
                    <div>
                      <p className="text-[10px] text-gray-400 mb-0.5">Email</p>
                      <a href={`mailto:${card.contact.email}`} className="text-[12px] text-blue-600 hover:underline break-all">{card.contact.email}</a>
                    </div>
                  )}
                  {card.contact.phone && (
                    <div>
                      <p className="text-[10px] text-gray-400 mb-0.5">Phone</p>
                      <a href={`tel:${card.contact.phone}`} className="text-[12px] text-blue-600 hover:underline">{card.contact.phone}</a>
                    </div>
                  )}
                </div>
              )}

              {/* Quick Actions */}
              {activeConvo.status !== 'resolved' && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Quick Actions</p>
                  {activeConvo.mode !== 'human' && (
                    <button onClick={() => handleAction('takeover')} className="w-full py-1.5 px-3 rounded-lg text-[12px] font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors">Take Over Chat</button>
                  )}
                  {activeConvo.mode === 'human' && (
                    <button onClick={() => handleAction('handback')} className="w-full py-1.5 px-3 rounded-lg text-[12px] font-medium bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 transition-colors">Hand Back to AI</button>
                  )}
                  <button onClick={() => handleAction('resolve')} className="w-full py-1.5 px-3 rounded-lg text-[12px] font-medium bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 transition-colors">Resolve &amp; Close</button>
                </div>
              )}
            </div>
          </aside>
        )
      })()}
    </div>
  )
}
