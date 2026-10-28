'use client'

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { subscribeChatRoom } from '@/lib/realtime/chatRoomSubscription'
import { cn } from '@/lib/utils'
import { WIDGET_HISTORY_RETENTION_MS } from '@/lib/retention'
import { FRIENDLY_RETRY_MESSAGE } from '@/lib/customerErrorMessage'
import { buildFlowActionAcknowledgement, buildProgressAcknowledgement, progressFlowHint, type FlowProgressDomain } from '@/lib/chat/progressAcknowledgement'
import { 
  FlowMessage as FlowCard, 
  type FlowInput, 
  type FlowMeta, 
  type StructuredMessage 
} from '@/components/chat/FlowMessage'
import {
  ChatCard,
  DetailCard,
} from '@/components/chat/ConciergeCards'
import { Button } from '@/components/ui/button'
import { 
  ArrowRight, 
  ChevronDown, 
  ImageIcon, 
  Loader2, 
  Maximize2, 
  MessageCircle, 
  Mic, 
  Minus,
  Minimize2, 
  Plus,
  ShoppingBag,
  X 
} from 'lucide-react'

export interface ChatWidgetProps {
  botId?: string
  contextId?: string
  sessionId?: string
  apiBase?: string
  mode?: 'floating' | 'embedded' | 'fullscreen'
  initialOpen?: boolean
  className?: string
  onClose?: () => void
  photoUploadEnabled?: boolean
  isIframe?: boolean
}

interface Message {
  id: string
  role: 'user' | 'assistant' | 'agent' | 'system' | 'upsell'
  content: string
  source?: string | null
  source_url?: string | null
  media_url?: string | null
  media_type?: string | null
  sender_type?: 'ai' | 'human' | null
  metadata?: any
  created_at: string
  type?: string
  flowId?: string
  stepId?: string
  interactive?: boolean
  payload?: any
  locked?: boolean
  selectedValue?: any
  selectedLabel?: string
  revision?: number
  transient?: boolean
}

const stableMessageId = (prefix:string) => `${prefix}-${typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(36).slice(2)}`}`
const safeBrowserMessage=(message:Message):Message=>{
  if(message.type==='payment_checkout')return{...message,payload:{text:'Secure payment session',title:'Secure payment session'},content:'Secure payment session',locked:true}
  if(message.type==='checkout_form')return{...message,selectedValue:message.selectedValue?{submitted:true}:undefined,payload:{...(message.payload||{}),initial:{}},content:'Delivery details'}
  if(message.type==='saved_address')return{...message,payload:{text:'Saved delivery address',title:'Saved delivery address'},content:'Saved delivery address',locked:true}
  if(message.type==='order_confirmation'||message.type==='order_summary')return{...message,payload:{...(message.payload||{}),customer:undefined,rows:Array.isArray(message.payload?.rows)?message.payload.rows.filter((row:any)=>!/(?:phone|email|address|deliver to)/i.test(String(Array.isArray(row)?row[0]:row?.label||''))):message.payload?.rows}}
  return message
}
const secureSessionId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `session_${crypto.randomUUID()}`
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return `session_${Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')}`
  }
  throw new Error('Secure random generation is unavailable')
}

function AgentMessage({
  children,
  named = false,
  id,
  botTitle = 'SIEXY',
}: {
  children: React.ReactNode
  named?: boolean
  id?: string
  botTitle?: string
}) {
  return (
    <div className="agent-message message-row" id={id}>
      <div className={named ? "agent-avatar" : "continuation-dot"}>
        {named && <i />}
      </div>
      <div className="agent-content">
        {children}
        {named && <div className="agent-name">{botTitle}</div>}
      </div>
    </div>
  )
}

function AgentText({ children }: { children: string }) {
  return (
    <div className="assistant-bubble">
      <FormattedMarkdown text={children} />
    </div>
  )
}

const StreamingMessage = React.memo(function StreamingMessage({ text, botTitle }: { text: string; botTitle: string }) {
  return <AgentMessage named botTitle={botTitle}><div className="assistant-bubble"><FormattedMarkdown text={text}/><span className="ml-1 inline-block h-3.5 w-[2px] animate-blink bg-amber-500 align-middle"/></div></AgentMessage>
})

function UserMessage({
  children,
  now = false,
  mediaUrl,
}: {
  children: React.ReactNode
  now?: boolean
  mediaUrl?: string | null
}) {
  return (
    <div className="user-message message-row">
      <div className="user-bubble">
        {mediaUrl && (
          <div className="overflow-hidden rounded-xl border border-white/20 max-w-[240px] mb-2">
            <img
              src={mediaUrl}
              alt="Attachment"
              className="w-full max-h-48 object-cover rounded-lg cursor-pointer hover:opacity-95 transition-opacity"
              onClick={() => window.open(mediaUrl, '_blank')}
            />
          </div>
        )}
        {children}
      </div>
      <span className="delivered">Delivered{now ? ' · Just now' : ''}</span>
    </div>
  )
}

function FormattedMarkdown({ text }: { text: string }) {
  if (!text) return null

  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let tableLines: string[] = []
  let inTable = false

  const flushTable = (key: number) => {
    if (tableLines.length === 0) return null
    const rows = tableLines
      .filter((l) => l.trim().startsWith('|') && !l.trim().match(/^\|[\s\-:|]+\|$/))
      .map((l) =>
        l
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim())
      )

    tableLines = []
    if (rows.length === 0) return null

    const header = rows[0]
    const bodyRows = rows.slice(1)

    return (
      <div key={`table-${key}`} className="my-2.5 overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
        <table className="min-w-full text-xs text-left divide-y divide-slate-200">
          <thead className="bg-slate-50/90 font-semibold text-slate-700">
            <tr>
              {header.map((col, ci) => (
                <th key={ci} className="px-3 py-2 border-r last:border-r-0 border-slate-200/80">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {bodyRows.map((r, ri) => (
              <tr key={ri} className="hover:bg-slate-50/60 transition-colors">
                {r.map((cell, cii) => (
                  <td key={cii} className="px-3 py-2 border-r last:border-r-0 border-slate-100 font-medium text-slate-800">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim()
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true
      tableLines.push(trimmed)
    } else {
      if (inTable) {
        const tableEl = flushTable(idx)
        if (tableEl) elements.push(tableEl)
        inTable = false
      }
      if (trimmed.length > 0) {
        const parts = line.split(/(\*\*[^*]+\*\*)/g)
        elements.push(
          <p key={idx} className="my-1 leading-relaxed text-left">
            {parts.map((p, pi) => {
              if (p.startsWith('**') && p.endsWith('**')) {
                return <strong key={pi} className="font-semibold text-slate-900">{p.slice(2, -2)}</strong>
              }
              return p
            })}
          </p>
        )
      } else {
        elements.push(<div key={idx} className="h-1.5" />)
      }
    }
  })

  if (inTable) {
    const tableEl = flushTable(lines.length)
    if (tableEl) elements.push(tableEl)
  }

  return <div className="space-y-0.5 text-left">{elements}</div>
}

function compressImageClient(file: File, maxDim = 1280, quality = 0.8): Promise<Blob> {
  if (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined') {
    const source = `self.onmessage=async({data})=>{try{const bitmap=await createImageBitmap(data.file);let width=bitmap.width,height=bitmap.height;if(width>data.max||height>data.max){if(width>height){height=Math.round(height*data.max/width);width=data.max}else{width=Math.round(width*data.max/height);height=data.max}}const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0,width,height);bitmap.close();const blob=await canvas.convertToBlob({type:'image/webp',quality:data.quality});self.postMessage({blob})}catch(error){self.postMessage({error:String(error)})}}`
    const workerUrl = URL.createObjectURL(new Blob([source],{type:'text/javascript'}))
    return new Promise(resolve=>{const worker=new Worker(workerUrl);const finish=(blob:Blob)=>{worker.terminate();URL.revokeObjectURL(workerUrl);resolve(blob)};worker.onmessage=({data})=>finish(data?.blob||file);worker.onerror=()=>finish(file);worker.postMessage({file,max:maxDim,quality})})
  }
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onerror = () => resolve(file)
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => resolve(file)
      img.onload = () => {
        let width = img.width
        let height = img.height
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width)
            width = maxDim
          } else {
            width = Math.round((width * maxDim) / height)
            height = maxDim
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(file)
          return
        }
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob)
            else resolve(file)
          },
          'image/webp',
          quality
        )
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

export function ChatWidget({
  botId: propBotId,
  contextId: propContextId,
  sessionId: propSessionId,
  apiBase = '',
  mode = 'floating',
  initialOpen,
  className = '',
  onClose,
  photoUploadEnabled: propPhotoUploadEnabled,
  isIframe: propIsIframe
}: ChatWidgetProps) {
  // Synchronously resolve effective botId and contextId on initial render
  const [botId, setBotId] = useState(propBotId || '')
  const [contextId, setContextId] = useState(propContextId || '')
  const [isIframe, setIsIframe] = useState(propIsIframe || false)

  useEffect(() => {
    if (propIsIframe !== undefined) {
      setIsIframe(propIsIframe)
      return
    }
    if (typeof window !== 'undefined') {
      try {
        const frameCheck = window.self !== window.top
        const params = new URLSearchParams(window.location.search)
        const hasIframeParam = params.get('iframe') === 'true' || params.get('embed') === 'true'
        if (frameCheck || hasIframeParam) {
          setIsIframe(true)
        }
      } catch {
        setIsIframe(true)
      }
    }
  }, [propIsIframe])

  useEffect(() => {
    if (propBotId && propBotId !== botId) setBotId(propBotId)
  }, [propBotId, botId])

  useEffect(() => {
    if (propContextId && propContextId !== contextId) setContextId(propContextId)
  }, [propContextId, contextId])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const qBot = params.get('bot') || params.get('botId') || params.get('bot_id') || params.get('id')
      const qCtx = params.get('ctx') || params.get('contextId') || params.get('context_id') || params.get('clientId') || params.get('client_id')
      if (!botId && qBot) setBotId(qBot)
      if (!contextId && qCtx) setContextId(qCtx)
    }
  }, [botId, contextId])

  const widgetKey = contextId || botId || 'default_chat'
  const storageKey = `siexy_msgs_${widgetKey}`
  const sessionKey = `siexy_session_${widgetKey}`
  const sessionStartedKey = `${sessionKey}_started_at`

  // UI & Flow State (Matching exact chatflow-ui-main specification)
  const [hasMounted, setHasMounted] = useState(false)
  const [isOpen, setIsOpen] = useState(initialOpen ?? (mode !== 'floating'))
  const isOpenRef = useRef(isOpen)
  const [isExpanded, setIsExpanded] = useState(mode === 'fullscreen')
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [pendingFlowKey, setPendingFlowKey] = useState<string | null>(null)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  
  // Hydration-safe message initialization
  const [messages, setMessages] = useState<Message[]>([])
  const [cartOpen,setCartOpen]=useState(false)
  const [draftCart,setDraftCart]=useState<any[]>([])
  const activeCart=useMemo(()=>{
    let cart:any=null
    for(const message of messages){
      if(message.type==='cart_card')cart=message.payload
      if(message.type==='order_confirmation'||message.type==='order_receipt'||/order request cancelled|no order was placed/i.test(message.content||''))cart=null
    }
    if(draftCart.length){const currency=draftCart[0]?.currency||cart?.currency||'INR';return{items:draftCart,currency,total:draftCart.reduce((sum,item)=>sum+Number(item.price||0)*Number(item.quantity||0),0),discount:0}}
    return cart&&Array.isArray(cart.items)&&cart.items.length?cart:null
  },[messages,draftCart])
  const mergeCartPreview=useCallback((items:any[])=>{
    if(!items.length)return
    setDraftCart(current=>{
      const next=new Map(current.map(item=>[String(item.productId||item.id),item]))
      for(const item of items){const id=String(item.productId||item.id||'');if(id)next.set(id,{...(next.get(id)||{}),...item,productId:id,quantity:Number(item.quantity??item.qty??0)})}
      return Array.from(next.values())
    })
  },[])
  const adjustCartQuantity=useCallback((item:any,delta:number)=>{
    const id=String(item.productId||item.id||'')
    if(!id)return
    setDraftCart(current=>{
      const source=current.length?current:(activeCart?.items||[])
      const next=new Map(source.map((line:any)=>[String(line.productId||line.id),{...line,productId:String(line.productId||line.id),quantity:Number(line.quantity??line.qty??0)}]))
      const existing:any=next.get(id)||{...item,productId:id,quantity:0}
      next.set(id,{...existing,quantity:Math.max(0,Math.min(Number(existing.maxQuantity||99),Number(existing.quantity||0)+delta))})
      return Array.from(next.values())
    })
  },[activeCart])
  useEffect(()=>{if(!activeCart)setCartOpen(false)},[activeCart])

  useEffect(() => {
    isOpenRef.current = isOpen
  }, [isOpen])

  // Restore past conversation from storage on client mount
  useEffect(() => {
    setHasMounted(true)
    try {
      const saved = localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved)
        const savedAt = Number(parsed?.savedAt || 0)
        const storedMessages = Array.isArray(parsed?.messages) ? parsed.messages : []
        if (savedAt > 0 && Date.now() - savedAt < WIDGET_HISTORY_RETENTION_MS && storedMessages.length > 0) {
          setMessages(storedMessages)
        } else {
          localStorage.removeItem(storageKey)
          sessionStorage.removeItem(storageKey)
        }
      }
    } catch {}
  }, [storageKey])

  const [unreadCount, setUnreadCount] = useState(0)

  // Detail overlay state for product detail panel
  const [details, setDetails] = useState<string | null>(null)

  // Config State
  const [config, setConfig] = useState<any>({
    widget_title: 'SIEXY',
    welcome_message: 'Hi there! How can I help you today?',
    opening_message: '',
    theme_color: '#007aff',
    suggestions: ['Order status', 'Return item', 'Refund policy', 'Talk to human agent'],
    bot_tone: 'friendly',
  })
  const [configStatus, setConfigStatus] = useState<'loading'|'ready'|'unavailable'>('loading')

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const sessionIdRef = useRef<string>('')
  const sessionTokenRef = useRef<string>('')
  const newSessionRef = useRef(false)
  const [sessionToken, setSessionToken] = useState('')
  const lastSeenTsRef = useRef<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const firstCardRef = useRef<HTMLDivElement>(null)
  const pillRectRef = useRef<DOMRect | null>(null)
  const streamBufferRef = useRef('')
  const streamFrameRef = useRef<number | null>(null)
  const progressSequenceRef = useRef(0)

  const [pendingMedia, setPendingMedia] = useState<{
    url: string
    storagePath?: string
    mediaType: string
    sizeBytes: number
    previewUrl: string
  } | null>(null)
  const [isUploadingMedia, setIsUploadingMedia] = useState(false)

  const reply = (text: string) => {
    const botMsg: Message = {
      id: stableMessageId('bot'),
      role: 'assistant',
      content: text,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, botMsg])
    setTimeout(() => {
      document.getElementById('chat-end')?.scrollIntoView({ behavior: 'smooth' })
      textareaRef.current?.focus({ preventScroll: true })
    }, 80)
  }

  const progressReply = (text:string,hint?:'product'|'booking'|'support'|'general',moment:'working'|'selection_added'='working') => {
    const id=stableMessageId('progress')
    const variant=progressSequenceRef.current++
    const progress:Message={
      id,role:'assistant',content:buildProgressAcknowledgement(text,config.bot_tone||'friendly',hint,moment,variant),
      transient:true,metadata:{transient:true,kind:'progress_acknowledgement'},created_at:new Date().toISOString(),
    }
    setMessages(previous=>[...previous,progress])
    return id
  }

  const flowProgressReply=(content:string)=>{
    const id=stableMessageId('progress')
    const progress:Message={id,role:'assistant',content,transient:true,metadata:{transient:true,kind:'progress_acknowledgement'},created_at:new Date().toISOString()}
    setMessages(previous=>[...previous,progress])
    return id
  }

  const agentHandoff = () => {
    reply("Your request to speak with a human agent has been noted. Connecting with our support team...")
    fetch(`${apiBase}/api/chat/handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(sessionTokenRef.current ? { 'X-Widget-Session-Token': sessionTokenRef.current } : {}) },
      body: JSON.stringify({
        sessionId: sessionIdRef.current,
        botId,
        reason: 'User requested human agent'
      })
    }).catch(() => {})
  }

  const handleQuickAction = (label: string) => {
    if (label === 'Talk to human agent') agentHandoff()
    else handleSendMessage(label)
  }

  const handlePillMouseMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = pillRectRef.current
    if (!rect) return
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    e.currentTarget.style.setProperty('--pill-mouse-x', `${x}%`)
    e.currentTarget.style.setProperty('--pill-mouse-y', `${y}%`)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (JPEG, PNG, or WebP).')
      return
    }

    const instantPreview = URL.createObjectURL(file)
    if (pendingMedia?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(pendingMedia.previewUrl)
    setPendingMedia({url:instantPreview,mediaType:file.type,sizeBytes:file.size,previewUrl:instantPreview})
    setIsUploadingMedia(true)
    try {
      const compressedBlob = await compressImageClient(file, 1280, 0.8)

      const formData = new FormData()
      formData.append('file', compressedBlob, file.name || 'attachment.webp')
      formData.append('session_id', sessionIdRef.current || getSessionId())
      if (botId) formData.append('bot_id', botId)
      if (contextId) formData.append('context_id', contextId)
      if (propPhotoUploadEnabled ?? true) formData.append('photo_upload_enabled', 'true')

      let uploadUrl = `${apiBase}/api/chat/media`
      const params = new URLSearchParams()
      if (contextId) params.set('ctx', contextId)
      if (botId) params.set('bot', botId)
      if (propPhotoUploadEnabled ?? true) params.set('photo_upload_enabled', 'true')
      const qs = params.toString()
      if (qs) uploadUrl += `?${qs}`

      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        headers: sessionTokenRef.current ? { 'X-Widget-Session-Token': sessionTokenRef.current } : {},
        body: formData,
      })

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}))
        console.warn('[ChatWidget] Media upload warning:', errData.error || uploadRes.statusText)
        setPendingMedia({
          url: instantPreview,
          mediaType: 'image/webp',
          sizeBytes: compressedBlob.size,
          previewUrl: instantPreview,
        })
        return
      }

      const mediaData = await uploadRes.json()
      setPendingMedia({
        url: mediaData.url,
        storagePath: mediaData.storagePath,
        mediaType: mediaData.mediaType || 'image/webp',
        sizeBytes: mediaData.sizeBytes,
        previewUrl: instantPreview,
      })
    } catch (err: any) {
      console.error('[ChatWidget] Media upload error:', err)
      alert(err.message || 'Image upload failed. Please try again.')
    } finally {
      setIsUploadingMedia(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // Abort pending fetch on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort('WIDGET_UNMOUNTED')
      }
      if (streamFrameRef.current) cancelAnimationFrame(streamFrameRef.current)
      if (pendingMedia?.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(pendingMedia.previewUrl)
    }
  }, [])

  // Save messages to persistent browser storage
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      if (messages.length > 0) {
        const persist=()=>{const serialized=JSON.stringify({ savedAt: Date.now(), messages:messages.filter(message=>!message.transient&&!message.metadata?.transient).map(safeBrowserMessage) });localStorage.setItem(storageKey, serialized);sessionStorage.setItem(storageKey, serialized)}
        const idle=(window as any).requestIdleCallback
        if(idle)idle(persist,{timeout:1000});else setTimeout(persist,0)
      }
    } catch {}
  }, [messages, storageKey])

  const getSessionId = useCallback(() => {
    if (typeof window !== 'undefined') {
      if (propSessionId) {
        sessionIdRef.current = propSessionId
        try {
          localStorage.setItem(sessionKey, propSessionId)
          sessionStorage.setItem(sessionKey, propSessionId)
        } catch {}
        return propSessionId
      }
      try {
        const params = new URLSearchParams(window.location.search)
        const qSid = params.get('session_id') || params.get('sessionId')
        if (qSid) {
          sessionIdRef.current = qSid
          localStorage.setItem(sessionKey, qSid)
          sessionStorage.setItem(sessionKey, qSid)
          return qSid
        }
        const saved = localStorage.getItem(sessionKey) || sessionStorage.getItem(sessionKey)
        const startedAt = Number(localStorage.getItem(sessionStartedKey) || sessionStorage.getItem(sessionStartedKey) || 0)
        if (saved && startedAt > 0 && Date.now() - startedAt < WIDGET_HISTORY_RETENTION_MS) {
          sessionIdRef.current = saved
          return saved
        }
        localStorage.removeItem(sessionKey)
        sessionStorage.removeItem(sessionKey)
        localStorage.removeItem(storageKey)
        sessionStorage.removeItem(storageKey)
        const sid = secureSessionId()
        localStorage.setItem(sessionKey, sid)
        sessionStorage.setItem(sessionKey, sid)
        localStorage.setItem(sessionStartedKey, String(Date.now()))
        sessionStorage.setItem(sessionStartedKey, String(Date.now()))
        sessionIdRef.current = sid
        return sid
      } catch {
        // Fallback
      }
    }
    if (!sessionIdRef.current) {
      sessionIdRef.current = propSessionId || secureSessionId()
    }
    return sessionIdRef.current
  }, [propSessionId, sessionKey, sessionStartedKey, storageKey])

  const handleResetChat = () => {
    const newSid = secureSessionId()
    sessionTokenRef.current = ''
    setSessionToken('')
    sessionIdRef.current = newSid
    try {
      localStorage.setItem(sessionKey, newSid)
      sessionStorage.setItem(sessionKey, newSid)
      localStorage.setItem(sessionStartedKey, String(Date.now()))
      sessionStorage.setItem(sessionStartedKey, String(Date.now()))
      localStorage.removeItem(storageKey)
      sessionStorage.removeItem(storageKey)
    } catch {}
    setMessages([])
    setInput('')
    if(pendingMedia?.previewUrl?.startsWith('blob:'))URL.revokeObjectURL(pendingMedia.previewUrl)
    setPendingMedia(null)
    if (typeof window !== 'undefined' && window.parent) {
      window.parent.postMessage({ type: 'siexy_new_session', sessionId: newSid }, '*')
      window.parent.postMessage({ type: 'rag_widget_new_session', sessionId: newSid }, '*')
    }
    const activeBotId = config?.bot_id || botId
    if (activeBotId) fetch(`${apiBase}/api/chat/init`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botId: activeBotId, sessionId: newSid }) })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Session reset failed')))
      .then(initialized => { newSessionRef.current = initialized.isNewSession === true; sessionTokenRef.current = initialized.sessionToken || ''; setSessionToken(initialized.sessionToken || '') })
      .catch(() => setConfigStatus('unavailable'))
  }

  // Sync conversation history from server
  useEffect(() => {
    const sid = sessionIdRef.current || getSessionId()
    if (!sid || !sessionToken || newSessionRef.current) return

    let isMounted = true

    const syncHistory = async () => {
      try {
        const queryParams = new URLSearchParams()
        queryParams.set('session_id', sid)
        if (contextId) queryParams.set('ctx', contextId)
        if (botId) queryParams.set('bot', botId)

        const syncRes = await fetch(`${apiBase}/api/chat/sync?${queryParams.toString()}`, { headers: sessionTokenRef.current ? { 'X-Widget-Session-Token': sessionTokenRef.current } : {} })
        if (!syncRes.ok) return
        const syncData = await syncRes.json()
        if (!isMounted || !Array.isArray(syncData.messages) || syncData.messages.length === 0) return

        const serverMessages: Message[] = syncData.messages.map((m: any) => ({
          // Reuse the browser-generated id after reconciliation so the
          // optimistic bubble is updated instead of duplicated.
          id: m.metadata?.client_id || m.id,
          role: m.role || 'assistant',
          content: m.content || '',
          source_url: m.source_url,
          media_url: m.media_url,
          media_type: m.media_type,
          sender_type: m.sender_type || (m.role === 'agent' ? 'human' : 'ai'),
          metadata: m.metadata,
          created_at: m.created_at,
          type: m.message_type || m.metadata?.type,
          flowId: m.metadata?.flowId,
          stepId: m.metadata?.stepId,
          interactive: m.metadata?.interactive,
          payload: m.metadata?.payload,
          locked: m.metadata?.locked ?? true,
          selectedValue: m.metadata?.selectedValue,
          selectedLabel: m.metadata?.selectedLabel,
        }))

        setMessages((prev) => {
          if (prev.length === 0) return serverMessages

          const existingIds = new Set(prev.map((p) => p.id))
          const existingContentKeys = new Set(
            prev.map((p) => `${p.role}:${(p.content || '').trim()}`)
          )

          const toAdd = serverMessages.filter(
            (sm) => !existingIds.has(sm.id) && !existingContentKeys.has(`${sm.role}:${(sm.content || '').trim()}`)
          )

          if (toAdd.length === 0) return prev
          return [...prev, ...toAdd]
        })
      } catch (err) {
        console.warn('[ChatWidget] History sync error:', err)
      }
    }

    syncHistory()

    return () => {
      isMounted = false
    }
  }, [apiBase, botId, contextId, getSessionId, sessionToken])

  // Initialize Session & Config
  useEffect(() => {
    const sid = getSessionId()
    sessionIdRef.current = sid

    const fetchConfig = async () => {
      let lastFailure: unknown = null
      for(let attempt=0;attempt<2;attempt++)try {
        let configUrl = `${apiBase}/api/widget/config`
        const queryParams = new URLSearchParams()
        if (contextId) queryParams.set('ctx', contextId)
        if (botId) queryParams.set('bot', botId)
        const qs = queryParams.toString()
        if (qs) configUrl += `?${qs}`

        const res = await fetch(configUrl,{cache:'no-store'})
        if(!res.ok)throw new Error('Widget configuration unavailable')
        const data = await res.json()
        if(!data||typeof data!=='object'||data.error)throw new Error('Widget configuration unavailable')
        setConfig((prev: any) => ({...prev,...data}))
        const initRes = await fetch(`${apiBase}/api/chat/init`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ botId: data.bot_id || botId, sessionId: sid }),
        })
        if (!initRes.ok) throw new Error('Widget session unavailable')
        const initialized = await initRes.json()
        if (!initialized.sessionToken) throw new Error('Widget session capability unavailable')
        newSessionRef.current = initialized.isNewSession === true
        sessionTokenRef.current = initialized.sessionToken
        setSessionToken(initialized.sessionToken)
        setConfigStatus('ready')
        return
      } catch (err) {
        lastFailure=err
        if(attempt===0)await new Promise(resolve=>setTimeout(resolve,500))
      }
      console.warn('[ChatWidget] Remote configuration is unavailable')
      if(lastFailure)setConfigStatus('unavailable')
    }

    fetchConfig()
  }, [apiBase, botId, contextId, getSessionId])

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        firstCardRef.current?.scrollIntoView({ block: 'start' })
        textareaRef.current?.focus({ preventScroll: true })
      }, 350)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Supabase Realtime Subscription
  useEffect(() => {
    const sid = sessionIdRef.current || getSessionId()
    if (!sid) return

    const receiveMessage = (row: any) => {
      if (!row || row.role === 'user') return

      const clientMsgId = row.metadata?.client_id
      const newMsgId = clientMsgId || row.id

      const newMsg: Message = {
        id: newMsgId,
        role: row.role || 'assistant',
        content: row.content || '',
        sender_type: row.sender_type || (row.role === 'agent' ? 'human' : 'ai'),
        source_url: row.source_url,
        media_url: row.media_url,
        media_type: row.media_type,
        metadata: row.metadata,
        created_at: row.created_at,
        type: row.message_type || row.metadata?.type,
        flowId: row.metadata?.flowId,
        stepId: row.metadata?.stepId,
        interactive: row.metadata?.interactive,
        payload: row.metadata?.payload,
        locked: row.metadata?.locked ?? false,
        selectedValue: row.metadata?.selectedValue,
        selectedLabel: row.metadata?.selectedLabel,
      }

      setMessages((prev) => {
        // 1. If exact id or client_id matches, update existing message
        const exactMatchIdx = prev.findIndex(
          (m) => m.id === newMsg.id || (clientMsgId && (m.id === clientMsgId || m.metadata?.client_id === clientMsgId))
        )
        if (exactMatchIdx !== -1) {
          return prev.map((m, idx) => (idx === exactMatchIdx ? { ...m, ...newMsg, id: newMsg.id } : m))
        }

        // 2. Reconcile with local / optimistic assistant message from the latest turn
        // Scan backwards from the end so we only reconcile the most recent assistant bubble
        const trimmedContent = (newMsg.content || '').trim()
        let matchIdx = -1
        for (let i = prev.length - 1; i >= 0; i--) {
          const m = prev[i]
          if (m.role !== newMsg.role) continue
          const mTrimmed = (m.content || '').trim()
          if (trimmedContent && mTrimmed === trimmedContent) {
            matchIdx = i
            break
          }
          if (newMsg.flowId && m.flowId === newMsg.flowId && newMsg.stepId && m.stepId === newMsg.stepId) {
            matchIdx = i
            break
          }
          if (m.id.startsWith('bot-') && (i === prev.length - 1 || prev[i + 1]?.role !== 'user')) {
            matchIdx = i
            break
          }
        }

        if (matchIdx !== -1) {
          return prev.map((m, idx) =>
            idx === matchIdx ? { ...m, ...newMsg, id: newMsg.id } : m
          )
        }

        return [...prev, newMsg]
      })

      lastSeenTsRef.current = row.created_at
      if (!isOpenRef.current) setUnreadCount((count) => count + 1)
    }
    return subscribeChatRoom(sid, receiveMessage)
  }, [getSessionId])

  // Handle flow interaction inputs
  const sendFlowInput = async (inputVal: FlowInput) => {
    if(inputVal.kind==='search'){
      const raw=typeof inputVal.value==='object'&&inputVal.value?inputVal.value:{query:inputVal.value}
      const selections=new Map((Array.isArray((raw as any).selections)?(raw as any).selections:[]).filter((item:any)=>Number(item.quantity)>0).map((item:any)=>[String(item.productId),{productId:String(item.productId),quantity:Number(item.quantity)}]))
      for(const item of draftCart){const id=String(item.productId||item.id),quantity=Number(item.quantity??item.qty??0);if(quantity>0)selections.set(id,{productId:id,quantity});else selections.delete(id)}
      inputVal={...inputVal,value:{...raw,selections:Array.from(selections.values())}}
    }else if(inputVal.kind==='products'||inputVal.kind==='cart_checkout'){
      const selections=new Map((Array.isArray(inputVal.value)?inputVal.value:[]).filter((item:any)=>Number(item.quantity)>0).map((item:any)=>[String(item.productId),{productId:String(item.productId),quantity:Number(item.quantity)}]))
      for(const item of draftCart){const id=String(item.productId||item.id),quantity=Number(item.quantity??item.qty??0);if(quantity>0)selections.set(id,{productId:id,quantity});else selections.delete(id)}
      inputVal={...inputVal,value:Array.from(selections.values())}
    }
    const sid = sessionIdRef.current || getSessionId()
    const echoId = stableMessageId('user-flow')
    const schedulerNavigation = inputVal.kind === 'date' || inputVal.kind === 'preview_date'
    const catalogueNavigation = inputVal.kind === 'search'
    setIsLoading(true)
    const safeSelectedValue=inputVal.kind==='contact'?{submitted:true}:inputVal.value
    setMessages((prev) =>
      prev.map((m) => {
        if (m.flowId === inputVal.flowId && m.stepId === inputVal.stepId) {
          return {
            ...m,
            locked: !(schedulerNavigation||catalogueNavigation),
            selectedValue: safeSelectedValue,
            selectedLabel: inputVal.label,
          }
        }
        return m
      })
    )

    let progressId:string|undefined
    let delayedProgressTimer:ReturnType<typeof setTimeout>|undefined
    let finishDelayedProgress:()=>void=()=>{}
    let delayedProgressReady:Promise<void>|undefined
    if(inputVal.kind!=='preview_date'){
      const domain:FlowProgressDomain=inputVal.flowId.startsWith('booking-')?'booking':inputVal.flowId.startsWith('order-')?'product':'support'
      const content=buildFlowActionAcknowledgement({domain,kind:inputVal.kind,value:inputVal.value,label:inputVal.label},config.bot_tone||'friendly',progressSequenceRef.current++)
      delayedProgressReady=new Promise(resolve=>{
        finishDelayedProgress=resolve
        delayedProgressTimer=setTimeout(()=>{
          progressId=flowProgressReply(content)
          setTimeout(resolve,300)
        },1200)
      })
    }

    // A card action stays visible on its originating card. It is not repeated
    // as a second user bubble, and it does not lock the rest of the widget.
    setPendingFlowKey(`${inputVal.flowId}:${inputVal.stepId}`)
    try {
      let flowUrl = `${apiBase}/api/chat/flow`
      if (contextId) flowUrl += `?ctx=${encodeURIComponent(contextId)}`
      if (botId) flowUrl += `${contextId ? '&' : '?'}bot=${encodeURIComponent(botId)}`

      let res:Response,data:any={}
      for(let attempt=0;attempt<4;attempt++){
        res = await fetch(flowUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(sessionTokenRef.current ? { 'X-Widget-Session-Token': sessionTokenRef.current } : {}) },
          body: JSON.stringify({
            session_id: sid,
            flow_id: inputVal.flowId,
            step_id: inputVal.stepId,
            input: inputVal,
            client_id: echoId,
            bot_client_id: stableMessageId('bot-flow'),
          }),
          keepalive: true,
        })
        data=await res.json().catch(()=>({}))
        if(res.status!==409||data.recoverable!==true||attempt===3)break
        await new Promise(resolve=>setTimeout(resolve,Math.max(100,Math.min(750,Number(data.retry_after_ms)||250))))
      }
      // Assigned in the bounded retry loop above.
      res=res!
      if (!res.ok) {
        if (res.status === 409) {
          setMessages(prev => prev.map(message => message.flowId === inputVal.flowId&&message.stepId===inputVal.stepId
            ? { ...message, revision: Number(data.revision ?? message.revision ?? 0), payload: { ...(message.payload || {}), revision: Number(data.revision ?? message.payload?.revision ?? 0) }, locked: false,selectedValue:undefined,selectedLabel:undefined }
            : message))
          reply('Your progress is saved. I could not refresh the current step just now—please tap the option once more.')
          return
        }
        if (Number.isFinite(Number(data.revision))) setMessages(prev => prev.map(message => message.flowId === inputVal.flowId
          ? { ...message, revision: Number(data.revision), payload: { ...(message.payload || {}), revision: Number(data.revision) } }
          : message))
        throw new Error('Flow step execution failed')
      }

      if (Array.isArray(data.messages)) {
        // The request runs immediately; only this conversational bridge waits.
        if(delayedProgressReady)await delayedProgressReady
        const incoming: Message[] = data.messages.map((m: any) => ({
          ...m,
          source: m.source || data.source,
          role: 'assistant',
          content: m.payload?.text || m.payload?.title || m.content || '',
          created_at: new Date().toISOString(),
          flowId: m.flowId || m.payload?.flowId,
          stepId: m.stepId || m.payload?.stepId,
        }))
        if(inputVal.kind==='products'||inputVal.kind==='cart_checkout'||inputVal.kind==='cancel')setDraftCart([])
        // Keep the completed card in the transcript. It is already locked and
        // carries selectedValue/selectedLabel, so the customer's action can be
        // shown on the card instead of echoed as a separate user bubble.
        setMessages((prev) => {
          const appendProductCard=inputVal.kind==='search'&&incoming.some(message=>message.type==='product_grid'||message.type==='product_catalog')
          let base = data.recovered
            ? prev.filter(message=>!(message.flowId===inputVal.flowId&&message.stepId===inputVal.stepId))
            : schedulerNavigation
            ? prev.filter(message => !(message.flowId === inputVal.flowId && message.stepId === inputVal.stepId))
            : prev
          if(appendProductCard){const latest=incoming.find(message=>message.type==='product_grid'||message.type==='product_catalog');base=base.map(message=>message.flowId===inputVal.flowId&&(message.type==='product_grid'||message.type==='product_catalog')?{...message,stepId:latest?.stepId||message.stepId,revision:latest?.revision??message.revision,payload:{...(message.payload||{}),revision:latest?.revision??message.payload?.revision},locked:false,selectedValue:undefined,selectedLabel:undefined}:message)}
          const existingIds = new Set(base.map(b => b.id))
          const existingKeys = new Set(base.map(b => `${b.flowId || ''}:${b.stepId || ''}:${(b.content || '').trim()}`))
          const dedupedIncoming = incoming.filter(inc => {
            if (existingIds.has(inc.id)) return false
            const key = `${inc.flowId || ''}:${inc.stepId || ''}:${(inc.content || '').trim()}`
            return appendProductCard||!existingKeys.has(key)
          })
          return [...base, ...dedupedIncoming]
        })
      } else if ((data.mode==='human'||data.mode==='waiting')&&progressId) {
        setMessages(previous=>previous.filter(message=>message.id!==progressId))
      }
    } catch (err) {
      if(delayedProgressTimer){clearTimeout(delayedProgressTimer);finishDelayedProgress()}
      console.error('[ChatWidget] Flow error:', err)
      setMessages((prev) => prev
        .filter((message) => message.id !== echoId)
        .map((message) => message.flowId === inputVal.flowId && message.stepId === inputVal.stepId
          ? { ...message, locked: false, selectedValue: undefined, selectedLabel: undefined }
          : message))
      reply(FRIENDLY_RETRY_MESSAGE)
    } finally {
      if(delayedProgressTimer)clearTimeout(delayedProgressTimer)
      setPendingFlowKey(null)
      setIsLoading(false)
    }
  }

  const handleSendSuggestion = (suggestion: string) => {
    handleSendMessage(suggestion)
  }

  // Handle standard message submit from input form
  const handleSendMessage = async (textOverride?: string) => {
    const question = (typeof textOverride === 'string' ? textOverride : input).trim()
    const mediaToSend = textOverride ? null : pendingMedia
    if ((!question && !mediaToSend) || isLoading || isStreaming) return

    if (!textOverride) {
      setInput('')
      setPendingMedia(null)
      if(mediaToSend?.previewUrl?.startsWith('blob:')&&mediaToSend.url!==mediaToSend.previewUrl)setTimeout(()=>URL.revokeObjectURL(mediaToSend.previewUrl),0)
    }
    setIsLoading(true)

    const clientMessageId = stableMessageId('user')
    const clientBotId = stableMessageId('bot')
    const userMsg: Message = {
      id: clientMessageId,
      role: 'user',
      content: question,
      media_url: mediaToSend ? mediaToSend.url : undefined,
      media_type: mediaToSend ? mediaToSend.mediaType : undefined,
      created_at: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMsg])
    const activeFlowId = [...messages].reverse().find(message => message.flowId && !message.locked)?.flowId || null
    const progressHint=progressFlowHint(question,activeFlowId)
    let progressId:string|undefined
    let delayedProgressTimer:ReturnType<typeof setTimeout>|undefined
    let finishDelayedProgress:()=>void=()=>{}
    let delayedProgressReady:Promise<void>|undefined
    if(progressHint){
      delayedProgressReady=new Promise(resolve=>{
        finishDelayedProgress=resolve
        delayedProgressTimer=setTimeout(()=>{
          progressId=progressReply(question,progressHint)
          setTimeout(resolve,300)
        },1200)
      })
    }
    lastSeenTsRef.current = userMsg.created_at

    setTimeout(() => {
      document.getElementById('chat-end')?.scrollIntoView({ behavior: 'smooth' })
    }, 60)

    try {
      const historyPayload = messages.filter(message=>!message.transient&&!message.metadata?.transient).slice(-10).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content,
      }))
      if (abortControllerRef.current) {
        abortControllerRef.current.abort('SUPERSEDED_BY_NEW_MESSAGE')
      }
      const abortController = new AbortController()
      abortControllerRef.current = abortController

      let chatUrl = `${apiBase}/api/chat?`
      if (contextId) chatUrl += `ctx=${encodeURIComponent(contextId)}&`
      if (botId) chatUrl += `bot=${encodeURIComponent(botId)}&`
      chatUrl += `stream=true`

      const res = await fetch(chatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream, application/json',
          ...(sessionTokenRef.current ? { 'X-Widget-Session-Token': sessionTokenRef.current } : {}),
        },
        body: JSON.stringify({
          question,
          session_id: sessionIdRef.current,
          history: historyPayload,
          media_url: mediaToSend ? mediaToSend.url : undefined,
          media_type: mediaToSend ? mediaToSend.mediaType : undefined,
          media_size_bytes: mediaToSend ? mediaToSend.sizeBytes : undefined,
          media_storage_path: mediaToSend ? mediaToSend.storagePath : undefined,
          client_id: clientMessageId,
          bot_client_id: clientBotId,
          active_flow_id: activeFlowId,
        }),
        signal: abortController.signal,
        keepalive: true,
      })

      if (!res.ok) {
        throw new Error(`Chat API error: ${res.statusText}`)
      }

      const contentType = res.headers.get('content-type') || ''
      if(delayedProgressReady)await delayedProgressReady
      if (contentType.includes('text/event-stream') && res.body) {
        setIsStreaming(true)
        setStreamingContent('')
        streamBufferRef.current=''
        setIsLoading(false)

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let accumulated = ''
        let sourceUrl: string | null = null
        let responseSource: string | null = null
        let done = false

        try {
          while (!done) {
            const { value, done: readerDone } = await reader.read()
            done = readerDone
            if (value) {
              const chunk = decoder.decode(value, { stream: true })
              const lines = chunk.split('\n')
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.slice(6).trim()
                  if (!jsonStr) continue
                  try {
                    const parsed = JSON.parse(jsonStr)
                    if (parsed.delta) {
                      accumulated += parsed.delta
                    } else if (parsed.text) {
                      accumulated = parsed.text
                    }
                    streamBufferRef.current=accumulated
                    if(streamFrameRef.current===null)streamFrameRef.current=requestAnimationFrame(()=>{streamFrameRef.current=null;setStreamingContent(streamBufferRef.current)})
                    if (parsed.source_url) {
                      sourceUrl = parsed.source_url
                    }
                    if (parsed.source) responseSource = parsed.source
                    if (parsed.done) {
                      done = true
                      break
                    }
                  } catch {}
                }
              }
            }
          }
        } finally {
          try {
            reader.releaseLock()
          } catch {}
        }

        if (accumulated.trim()) {
          const contentTrimmed = accumulated.trim()
          setMessages((prev) => {
            if (prev.some((m) => m.id === clientBotId)) {
              return prev.map((m) => (m.id === clientBotId ? { ...m, content: contentTrimmed, source_url: sourceUrl, source: responseSource } : m))
            }
            const last = prev[prev.length - 1]
            if (last && last.role === 'assistant' && (last.content || '').trim() === contentTrimmed) {
              return prev
            }
            const botMsg: Message = {
              id: clientBotId,
              role: 'assistant',
              content: contentTrimmed,
              source_url: sourceUrl,
              source: responseSource,
              created_at: new Date().toISOString(),
            }
            return [...prev, botMsg]
          })
          lastSeenTsRef.current = new Date().toISOString()
        }
        setIsStreaming(false)
        setStreamingContent('')
      } else {
        const data = await res.json()
        if (Array.isArray(data.messages)) {
          const incoming: Message[] = data.messages.map((m: any) => ({
            ...m,
            source: m.source || data.source,
            role: 'assistant',
            content: m.payload?.text || m.payload?.title || m.text || m.content || '',
            created_at: new Date().toISOString(),
            flowId: m.flowId || m.payload?.flowId,
            stepId: m.stepId || m.payload?.stepId,
          }))
          setMessages((prev) => {
            const existingIds = new Set(prev.map(p => p.id))
            const existingKeys = new Set(prev.map(p => `${p.flowId || ''}:${p.stepId || ''}:${(p.content || '').trim()}`))
            const deduped = incoming.filter(inc => {
              if (existingIds.has(inc.id)) return false
              const k = `${inc.flowId || ''}:${inc.stepId || ''}:${(inc.content || '').trim()}`
              return !existingKeys.has(k)
            })
            return [...prev, ...deduped]
          })
          return
        }
        // In human mode the customer's message is stored for the agent, but
        // there is intentionally no automated assistant response.
        if ((data.mode === 'human' || data.mode === 'waiting') && !data.answer && !data.content && !data.message) {
          setMessages(previous=>previous.filter(message=>message.id!==progressId))
          return
        }
        const contentTrimmed = data.answer || data.content || data.message || 'Thank you for your message.'
        setMessages((prev) => {
          if (prev.some((m) => m.id === clientBotId)) {
            return prev.map((m) => (m.id === clientBotId ? { ...m, content: contentTrimmed, source_url: data.source_url || null, source: data.source || null } : m))
          }
          const last = prev[prev.length - 1]
          if (last && last.role === 'assistant' && (last.content || '').trim() === contentTrimmed) {
            return prev
          }
          const botMsg: Message = {
            id: clientBotId,
            role: 'assistant',
            content: contentTrimmed,
            source_url: data.source_url || null,
            source: data.source || null,
            created_at: new Date().toISOString(),
          }
          return [...prev, botMsg]
        })
        lastSeenTsRef.current = new Date().toISOString()
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      console.error('[ChatWidget] send error:', err)
      reply(FRIENDLY_RETRY_MESSAGE)
    } finally {
      if(delayedProgressTimer){clearTimeout(delayedProgressTimer);finishDelayedProgress()}
      abortControllerRef.current = null
      setIsLoading(false)
      setIsStreaming(false)
      if(streamFrameRef.current!==null){cancelAnimationFrame(streamFrameRef.current);streamFrameRef.current=null}
      setStreamingContent('')
    }
  }

  useEffect(() => {
    const receiveTestPrompt = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.data?.type !== 'rag_widget_test_prompt') return
      const prompt = typeof event.data.prompt === 'string' ? event.data.prompt.trim().slice(0, 500) : ''
      if (prompt) void handleSendMessage(prompt)
    }
    window.addEventListener('message', receiveTestPrompt)
    return () => window.removeEventListener('message', receiveTestPrompt)
  }, [handleSendMessage])

  const activeScheduler = [...messages].reverse().find(message =>
    message.role === 'assistant' &&
    !message.locked &&
    message.interactive !== false &&
    (message.type === 'date_picker' || message.type === 'reschedule_picker' || message.type === 'slot_picker')
  )
  const schedulerRequiresCard = Boolean(activeScheduler)

  // Floating Launcher Button when closed in floating mode
  if (mode === 'floating' && !isOpen) {
    return (
      <Button
        variant="send"
        className="widget-launcher"
        aria-label="Open concierge"
        title="Open concierge"
        onClick={() => {
          setIsOpen(true)
          setUnreadCount(0)
        }}
      >
        <MessageCircle className="w-5 h-5 text-slate-800" />
        <i className="launcher-status" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
            {unreadCount}
          </span>
        )}
      </Button>
    )
  }

  if(configStatus==='loading')return <section className={cn('concierge-widget',isIframe&&'fullscreen-mode',mode==='embedded'&&'embedded-mode',className)} aria-label="Loading bot">
    <div className="flex h-full min-h-[300px] items-center justify-center bg-white"><div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500" aria-label="Loading"/></div>
  </section>

  if(configStatus==='unavailable')return <section className={cn('concierge-widget',isIframe&&'fullscreen-mode',mode==='embedded'&&'embedded-mode',className)} aria-label="Bot unavailable">
    <header className="widget-header"><div className="brand-pill brandpill" onPointerEnter={event=>{pillRectRef.current=event.currentTarget.getBoundingClientRect()}} onPointerMove={handlePillMouseMove} onPointerLeave={()=>{pillRectRef.current=null}}><i/><strong>Support</strong></div>{(mode==='floating'||isIframe)&&<Button variant="ghost" size="icon-sm" aria-label="Minimize chat" onClick={()=>{setIsOpen(false);onClose?.();if(typeof window!=='undefined'&&window.parent)window.parent.postMessage({type:'rag_widget_close'},'*')}}><ChevronDown className="w-4 h-4"/></Button>}</header>
    <div className="chat-conversation"><div className="chat-transcript flex min-h-full items-center justify-center"><div className="max-w-[280px] rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm"><div className="mx-auto mb-3 h-2.5 w-2.5 rounded-full bg-slate-300"/><h2 className="text-sm font-semibold text-slate-900">Tiny tea break ☕</h2><p className="mt-1.5 text-xs leading-5 text-slate-500">Please message me again in a minute—I’ll be ready to help.</p></div></div></div>
  </section>

  return (
    <>
      <section
        className={cn(
          "concierge-widget",
          isIframe && "fullscreen-mode",
          mode === 'embedded' && "embedded-mode",
          isExpanded && "w-[90vw] max-w-[620px] h-[85vh] max-h-[760px]",
          className
        )}
        aria-label={`${config.widget_title || 'SIEXY'} concierge chat`}
      >
        {/* ============================================================
            1. HEADER
        ============================================================ */}
        <header className="widget-header">
          <div className="brand-pill brandpill" onPointerEnter={event=>{pillRectRef.current=event.currentTarget.getBoundingClientRect()}} onPointerMove={handlePillMouseMove} onPointerLeave={()=>{pillRectRef.current=null}}>
            <i />
            <strong>{config.widget_title || 'SIEXY'}</strong>
            <span className="brand-divider">·</span>
            <span>Concierge</span>
          </div>
          <div className="header-actions">
            <span className="live-badge">Live Assistant</span>

            {!isIframe && mode !== 'fullscreen' && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={isExpanded ? "Restore chat" : "Expand chat"}
                title={isExpanded ? "Restore chat" : "Expand chat"}
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </Button>
            )}

            {(mode === 'floating' || isIframe) && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Minimize chat"
                title="Minimize chat"
                onClick={() => {
                  setIsOpen(false)
                  if (onClose) onClose()
                  if (typeof window !== 'undefined' && window.parent) {
                    window.parent.postMessage({ type: 'rag_widget_close' }, '*')
                    window.parent.postMessage({ type: 'concierge_close' }, '*')
                  }
                }}
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
            )}
          </div>
        </header>

        {/* ============================================================
            2. CHAT CONVERSATION STREAM
        ============================================================ */}
        <div className="chat-conversation">
          <div className="chat-transcript">
            {/* Anchor for scroll-to-top on open */}
            <div ref={firstCardRef} />

            {/* Welcome message shown only when mounted and no messages yet */}
            {hasMounted && messages.length === 0 && !isLoading && !isStreaming && (
              <AgentMessage named botTitle={config.widget_title || 'Support'}>
                <AgentText>{config.welcome_message || config.opening_message || `Hi there! How can I help you today?`}</AgentText>
              </AgentMessage>
            )}

            {/* Suggestion chips shown when mounted and no conversation yet */}
            {hasMounted && messages.length === 0 && !isLoading && !isStreaming && (config.suggestions?.length > 0) && (
              <div className="flex flex-wrap gap-1.5 px-1 pb-1">
                {(config.suggestions as string[]).map((s: string) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSendMessage(s)}
                    className="text-xs px-3 py-1.5 rounded-full border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {/* Dynamic messages from backend / user chat */}
            {messages.map((item, idx) =>
              item.role === 'user' ? (
                <UserMessage key={item.id || idx} now={idx === messages.length - 1} mediaUrl={item.media_url}>
                  {item.content}
                </UserMessage>
              ) : (
                <AgentMessage named key={item.id || idx} botTitle={item.sender_type === 'human' || item.role === 'agent' ? 'Support agent' : (config.widget_title || 'Support')}>
                  {item.type && item.flowId && item.stepId ? (
                      <FlowCard
                        message={item as StructuredMessage}
                        disabled={!!item.locked || pendingFlowKey === `${item.flowId}:${item.stepId}`}
                        apiBase={apiBase}
                        botId={botId}
                        contextId={contextId}
                        sessionId={sessionIdRef.current}
                        onInput={sendFlowInput}
                        onCartPreview={mergeCartPreview}
                      />
                  ) : (
                    <AgentText>{item.content}</AgentText>
                  )}
                </AgentMessage>
              )
            )}

            {/* Streaming message from backend */}
            {isStreaming && (
              <StreamingMessage text={streamingContent} botTitle={config.widget_title || 'Support'}/>
            )}

            {/* Loading / thinking indicator */}
            {isLoading && !isStreaming && (
              <AgentMessage named botTitle={config.widget_title || 'Support'}>
                <div className="assistant-bubble w-fit">
                  <div className="flex items-center gap-1.5 py-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </AgentMessage>
            )}

            <div id="chat-end" ref={messagesEndRef} />
          </div>
        </div>

        {activeCart&&<div className="floating-cart-summary absolute bottom-[132px] right-4 z-30 flex flex-col items-end">
          <div className={`mb-2 grid w-[280px] origin-bottom-right transition-all duration-300 ease-out ${cartOpen?'grid-rows-[1fr] translate-y-0 opacity-100':'pointer-events-none grid-rows-[0fr] translate-y-2 opacity-0'}`}><div className="overflow-hidden"><section className="rounded-2xl border border-black/10 bg-white/95 p-3 text-slate-950 shadow-[0_16px_40px_rgba(0,0,0,.18)] backdrop-blur-xl"><div className="mb-2 flex items-center justify-between"><strong className="text-[13px]">Your cart</strong><span className="text-[10px] text-slate-500">{activeCart.items.reduce((sum:number,item:any)=>sum+Number(item.quantity??item.qty??0),0)} items</span></div>{activeCart.items.map((item:any)=>{const quantity=Number(item.quantity??item.qty??0);return <div key={`${item.productId||item.id}-${item.variantId||''}`} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-t border-black/[.06] py-2 text-[11px] ${quantity===0?'opacity-50':''}`}><span className="min-w-0"><strong className="block truncate">{item.name}</strong><small className="text-slate-500">{quantity===0?'Removed':new Intl.NumberFormat(undefined,{style:'currency',currency:item.currency||activeCart.currency||'INR',maximumFractionDigits:2}).format(Number(item.price||0)*quantity)}</small></span><span className="flex items-center rounded-full bg-slate-100 p-0.5"><button type="button" aria-label={`Decrease ${item.name} quantity`} onClick={()=>adjustCartQuantity(item,-1)} className="grid h-7 w-7 place-items-center rounded-full bg-white shadow-sm disabled:opacity-35" disabled={quantity<=0}><Minus className="h-3.5 w-3.5"/></button><strong className="min-w-7 text-center text-[11px]">{quantity}</strong><button type="button" aria-label={`Increase ${item.name} quantity`} onClick={()=>adjustCartQuantity(item,1)} className="grid h-7 w-7 place-items-center rounded-full bg-white shadow-sm"><Plus className="h-3.5 w-3.5"/></button></span></div>})}<div className="flex justify-between border-t border-black/10 pt-2 text-[12px]"><span>Total</span><strong>{new Intl.NumberFormat(undefined,{style:'currency',currency:activeCart.currency||'INR',maximumFractionDigits:2}).format(Math.max(0,Number(activeCart.total||0)-Number(activeCart.discount||0)))}</strong></div></section></div></div>
          <button type="button" aria-label={cartOpen?'Close cart summary':'View cart summary'} aria-expanded={cartOpen} onClick={()=>setCartOpen(value=>!value)} className="relative grid h-12 w-12 place-items-center rounded-full bg-[#007aff] text-white shadow-[0_8px_24px_rgba(0,122,255,.38)] transition duration-200 hover:scale-105 active:scale-95"><ShoppingBag className="h-5 w-5"/><span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-[#ff3b30] px-1 text-[9px] font-bold">{activeCart.items.reduce((sum:number,item:any)=>sum+Number(item.quantity??item.qty??0),0)}</span></button>
        </div>}

        {/* ============================================================
            3. FOOTER & COMPOSER
        ============================================================ */}
        <footer className="widget-footer">
          <nav className="quick-actions quick-action" aria-label="Quick actions">
            {["Order status", "Return item", "Refund policy", "Talk to human agent"].map((label) => (
              <Button key={label} variant="chip" size="sm" disabled={schedulerRequiresCard || isLoading} onClick={() => handleQuickAction(label)}>
                {label}
              </Button>
            ))}
          </nav>
          <div className="composer-area">
            {pendingMedia && (
              <div className="mb-2 relative inline-block">
                <img
                  src={pendingMedia.previewUrl}
                  alt="Attachment preview"
                  className="w-14 h-14 object-cover rounded-xl border border-slate-200 shadow-sm"
                />
                <button
                  type="button"
                  onClick={() => {if(pendingMedia.previewUrl.startsWith('blob:'))URL.revokeObjectURL(pendingMedia.previewUrl);setPendingMedia(null)}}
                  className="absolute -top-1.5 -right-1.5 bg-slate-800 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] shadow-sm hover:bg-black transition-colors"
                  aria-label="Remove photo"
                >
                  ×
                </button>
              </div>
            )}

            <form
              className="chat-composer"
              onSubmit={(e) => {
                e.preventDefault()
                handleSendMessage()
              }}
            >
              <div className="composer-input-group composite-input-group">
                <textarea
                  ref={textareaRef}
                  placeholder={schedulerRequiresCard ? "Choose a date and time above…" : "Reply or ask anything…"}
                  aria-label="Your message"
                  disabled={schedulerRequiresCard}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                  rows={1}
                />
              </div>
              <div className="composer-controls">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="camera-control rounded-full"
                  type="button"
                  aria-label="Attach a photo"
                  title={isUploadingMedia ? "Uploading photo..." : "Attach a photo"}
                  disabled={isUploadingMedia || schedulerRequiresCard}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {isUploadingMedia ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                  ) : (
                    <ImageIcon className="w-4 h-4" />
                  )}
                </Button>
                <div className="send-controls">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                  type="button"
                  aria-label="Voice input"
                  title="Voice input"
                  disabled={schedulerRequiresCard}
                    onClick={() => {
                      reply("Voice input is not connected in this frontend preview. You can type your message instead.")
                    }}
                  >
                    <Mic className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="send"
                    size="icon-sm"
                    type="submit"
                    aria-label="Send message"
                    disabled={schedulerRequiresCard || (!input.trim() && !pendingMedia) || isLoading || isStreaming}
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </form>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={handleFileSelect}
            />
            <div className="powered-by">
              Powered by <strong>Vittain AI</strong>
              <span>·</span>Encrypted Spatial Returns
            </div>
          </div>
        </footer>

        {/* ============================================================
            4. DETAIL OVERLAY PANEL
        ============================================================ */}
        {details && (
          <div className="detail-overlay">
            <div className="detail-panel">
              <Button
                className="detail-close"
                variant="ghost"
                size="icon-sm"
                aria-label="Close details"
                onClick={() => setDetails(null)}
              >
                <X className="w-4 h-4" />
              </Button>
              <DetailCard title={details}>
                {details === "Refund policy" ? (
                  <p>
                    Your verified order has 19 days left to return. Choose a refund, store credit,
                    or an exchange. Refunds follow review of your request.
                  </p>
                ) : (
                  <>
                    <p>Hand-crafted materials. Considered details.</p>
                    <p>Explore the collection with your {config.widget_title || 'SIEXY'} concierge.</p>
                    <Button
                      className="card-primary mt-2"
                      onClick={() => {
                        setDetails(null)
                        reply(`${details} selected. Let us know if you'd like more specifications or showroom details.`)
                      }}
                    >
                      Continue <ArrowRight className="w-3.5 h-3.5 ml-1 inline" />
                    </Button>
                  </>
                )}
              </DetailCard>
            </div>
          </div>
        )}
      </section>

      {/* Floating launcher toggle button when in floating mode and open */}
      {mode === 'floating' && (
        <Button
          variant="send"
          className="widget-launcher"
          aria-label="Close concierge"
          title="Close concierge"
          onClick={() => {
            setIsOpen(false)
            if (onClose) onClose()
          }}
        >
          <X className="w-5 h-5 text-slate-800" />
        </Button>
      )}
    </>
  )
}
