'use client'
import { activeWorkspaceId } from '@/lib/client/workspace'
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { 
  ArrowLeft, Database, Search, Plus, GripVertical, Check, Cpu, 
  MessageCircle, Sliders, Webhook, Copy, Bot, Send, Globe, Hash, Mail,
  Clock, Link as LinkIcon, Trash2, Zap, Settings, X, UploadCloud,
  LayoutTemplate, Users, Bell, AlertCircle, ShoppingCart, BookOpen, CalendarDays,
  ExternalLink, RefreshCw, Sparkles, Phone, User, Camera, Image as ImageIcon
} from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { toast } from 'sonner'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue , SelectLabel } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { TimedPopupItem } from '@/components/bots/timed-popups-manager'
import { fetchDashboardData, invalidateDashboardData, readDashboardData } from '@/lib/client/featureDataCache'

const LazyPanel=()=> <div className="space-y-3 py-3" aria-label="Loading bot settings"><div className="h-24 rounded-2xl bg-surface-muted animate-pulse"/><div className="h-40 rounded-2xl bg-surface-muted animate-pulse"/></div>
const TriggersTab=dynamic(()=>import('@/components/bots/triggers-tab').then(module=>module.TriggersTab),{loading:LazyPanel})
const BookingCommerceTab=dynamic(()=>import('@/components/bots/booking-commerce-tab').then(module=>module.BookingCommerceTab),{loading:LazyPanel})
const BotFaqManager=dynamic(()=>import('@/components/bots/bot-faq-manager').then(module=>module.BotFaqManager),{loading:LazyPanel})
const TimedPopupsManager=dynamic(()=>import('@/components/bots/timed-popups-manager').then(module=>module.TimedPopupsManager),{loading:LazyPanel})
const ChatWidget=dynamic(()=>import('@/components/chat/ChatWidget').then(module=>module.ChatWidget),{ssr:false,loading:LazyPanel})
const SupportAutomationConfig=dynamic(()=>import('@/components/bots/support-automation-config').then(module=>module.SupportAutomationConfig),{loading:LazyPanel})
const BotReadinessPanel=dynamic(()=>import('@/components/bots/bot-readiness-panel').then(module=>module.BotReadinessPanel),{loading:LazyPanel})

const TONE_PRESETS = [
  {
    id: 'friendly',
    name: 'Friendly & Warm',
    icon: '😊',
    tagline: 'Welcoming, positive, and light emojis',
    instruction: 'Maintain a warm, welcoming, friendly, and enthusiastic tone. Use approachable, positive language and tasteful emojis 😊. Speak like an attentive, helpful teammate.',
  },
  {
    id: 'professional',
    name: 'Professional & Formal',
    icon: '💼',
    tagline: 'Polite, structured, and business-ready',
    instruction: 'Maintain an impeccably professional, formal, polite, and business-appropriate tone. Use structured, clear, and objective phrasing. Avoid slang, jokes, or casual contractions.',
  },
  {
    id: 'concise',
    name: 'Direct & Concise',
    icon: '⚡',
    tagline: 'Straight to the point with zero fluff',
    instruction: 'Be extremely direct, succinct, and concise. Omit introductory fluff and filler phrases. Provide the exact answer in 1 to 3 short sentences or bullet points.',
  },
  {
    id: 'empathetic',
    name: 'Empathetic Support',
    icon: '🤝',
    tagline: 'Patient, compassionate, and validating',
    instruction: 'Adopt a deeply empathetic, patient, compassionate, and understanding tone. Validate customer emotions or concerns sincerely before offering clear solutions.',
  },
  {
    id: 'playful',
    name: 'Playful & Witty',
    icon: '✨',
    tagline: 'Lively, charismatic, and conversational',
    instruction: 'Be lively, playful, witty, and high-energy while remaining helpful. Keep the conversation engaging and cheerful.',
  },
  {
    id: 'luxury',
    name: 'Luxury Concierge',
    icon: '👑',
    tagline: 'Refined vocabulary and elite hospitality',
    instruction: 'Adopt the persona of an elite luxury concierge. Speak with elegance, prestige, refined vocabulary, and flawless hospitality.',
  },
]

export default function BotSettingsPage() {
  const params = useParams()
  const id = params?.id as string
  const supabase = useMemo(() => createClient(), [])
  
  const [bot, setBot] = useState<any>(null)
  const [activeTab, setActiveTab] = useState('identity')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [contextId, setContextId] = useState<string | null>(null)
  const [channelIntegrations, setChannelIntegrations] = useState<any[]>([])

  // Knowledge Bases State
  const [assignedKnowledgeBases, setAssignedKnowledgeBases] = useState<any[]>([])
  const [availableKnowledgeBases, setAvailableKnowledgeBases] = useState<any[]>([])
  const [isRefreshingKb, setIsRefreshingKb] = useState(false)
  const [kbSearch, setKbSearch] = useState('')

  // Live Databases State
  const [assignedDatabases, setAssignedDatabases] = useState<any[]>([])
  const [availableDatabases, setAvailableDatabases] = useState<any[]>([])
  const [isRefreshingDb, setIsRefreshingDb] = useState(false)
  const [dbSearch, setDbSearch] = useState('')
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [knowledgeLoaded, setKnowledgeLoaded] = useState(false)
  
  // Advanced RAG settings
  const [ragSettings, setRagSettings] = useState({ caching: true, reranking: false })

  // Quick Add Chunk State
  const [quickTitle, setQuickTitle] = useState('')
  const [quickText, setQuickText] = useState('')
  const [isAddingQuickChunk, setIsAddingQuickChunk] = useState(false)

  // Tracking snippet tab for Appearance & Integration
  const [trackingSnippetTab, setTrackingSnippetTab] = useState<'cart' | 'base' | 'product' | 'purchase' | 'shopify'>('cart')

  // Timed Proactive Popups State
  const [timedPopups, setTimedPopups] = useState<TimedPopupItem[]>([])

  const [form, setForm] = useState({
    name: '',
    avatar_url: '',
    prompt: '',
    bot_tone: 'friendly',
    response_length: 'medium',
    use_emojis: true,
    llm: 'gpt-4o',
    primary_language: 'en',
    auto_detect_language: true,
    opening_message: '',
    auto_open: true,
    open_delay: '3',
    callout_only: false,
    open_after_callout: false,
    show_once_per_session: true,
    channel: 'web',
    integration_id: '',
    confidence_threshold: 0.7,
    max_turns: 10,
    auto_close_timeout: 30,
    typing_indicator: true,
    typing_delay: 2,
    handoff_message: 'Let me connect you with a team member who can help further.',
    handoff_target: 'any',
    handoff_department: '',
    notify_email: true,
    notify_slack: false,
    slack_webhook: '',
    fallback_behavior: 'handoff',
    fallback_message: "I don't have that information. Want me to get a human to help?",
    enable_business_hours: false,
    out_of_hours_behavior: 'queue',
    out_of_hours_message: "We're currently offline. We'll get back to you during business hours.",
    theme_color: '#7c3aed',
    widget_title: 'Chat Assistant',
    welcome_message: 'Hi there! How can we help you today?',
    photo_upload_enabled: false,
    vision_ai_enabled: false,
  })

  const handleApplyToneToPrompt = (toneId: string) => {
    const selectedTone = TONE_PRESETS.find(t => t.id === toneId)
    if (!selectedTone) return
    
    const directive = `Tone & Persona Directive:\n${selectedTone.instruction}`
    if (!form.prompt.includes('Tone & Persona Directive:')) {
      setForm(prev => ({
        ...prev,
        bot_tone: toneId,
        prompt: prev.prompt ? `${prev.prompt.trim()}\n\n${directive}` : directive
      }))
    } else {
      const cleaned = form.prompt.replace(/Tone & Persona Directive:[\s\S]*?(?=\n\n|$)/, directive)
      setForm(prev => ({ ...prev, bot_tone: toneId, prompt: cleaned }))
    }
    toast.success(`Applied ${selectedTone.name} directive to System Prompt`)
  }

  // Builder States
  const [flowSections, setFlowSections] = useState({
    greeting: "Hi {{customer_name}}! I'm Aria 🌸 I can help you find the perfect product. What are you looking for today?",
    ask_name: true,
    name_prompt: "By the way, who do I have the pleasure of speaking with?",
    ask_whatsapp: true,
    whatsapp_prompt: "Want some extra discount maan? Put your WhatsApp number, I'll send you a coupon code!",
    ask_email: false,
    email_prompt: "I'll add you to our VIP list for exclusive offers, what's your email ID?",
    quick_replies: [
      { label: 'Track Order', action: 'mcp' },
      { label: 'Get Offer', action: 'trigger' },
      { label: 'Talk to Human', action: 'handoff' }
    ],
    data_collection: [
      { id: '1', question: "What's your email?", type: 'email', variable: 'customer_email', required: true }
    ],
    topics: [
      { id: '1', keywords: 'shipping, delivery, time', response: 'Standard shipping takes 3-5 business days. Express shipping is 1-2 days.', attach_kb: true }
    ]
  })

  const [triggers, setTriggers] = useState([
    { id: '1', name: 'Cart Upsell Trigger', channel: 'web', condition: 'IF cart_value >= 1500 AND cart_value < 2000', action: 'Show Popup', status: 'Active' },
    { id: '2', name: 'Pricing Page Help', channel: 'web', condition: 'IF page_url contains "/pricing" AND time_on_page > 45', action: 'Open Widget', status: 'Active' }
  ])

  const [mcpActions, setMcpActions] = useState([
    { id: '1', name: 'check_order_status', method: 'POST', endpoint: '/api/mcp/orders', description: 'Look up customer order status by email or order ID' },
    { id: '2', name: 'generate_coupon', method: 'POST', endpoint: '/api/mcp/coupons', description: 'Generate a unique discount coupon code' }
  ])

  const [botRoutingRules, setBotRoutingRules] = useState<{ id: string; intent: string; target_bot_id: string; button_label: string }[]>([])
  const [workspaceBots, setWorkspaceBots] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    if (!id) return
    async function load() {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) return

      const { data: client } = await supabase.from('clients').select('id, context_id').eq('id', activeWorkspaceId(user.id || '')).maybeSingle()
      if (client?.context_id) {
        setContextId(client.context_id)
      } else {
        // Auto-provision a context_id for this client
        try {
          const ctxRes = await fetch(`/api/client/context?client_id=${activeWorkspaceId(user.id || '')}&bot_id=${id}`)
          if (ctxRes.ok) {
            const ctxData = await ctxRes.json()
            if (ctxData?.context_id) setContextId(ctxData.context_id)
          }
        } catch {}
      }

      void fetchDashboardData<any[]>(`/api/integrations?client_id=${encodeURIComponent(activeWorkspaceId(user.id || ''))}`)
        .then(integrations=>setChannelIntegrations(Array.isArray(integrations)?integrations:[])).catch(()=>{})

      const botUrl=`/api/bots/${encodeURIComponent(id)}`
      const cachedBot=readDashboardData<any>(botUrl)
      if(cachedBot)setBot(cachedBot)
      const botData = await fetchDashboardData<any>(botUrl).catch(()=>cachedBot||null)
      setBot(botData)
      if (botData?.client_id && !client?.context_id) {
        try {
          const ctxRes = await fetch(`/api/client/context?client_id=${botData.client_id}&bot_id=${id}`)
          if (ctxRes.ok) {
            const ctxData = await ctxRes.json()
            if (ctxData?.context_id) setContextId(ctxData.context_id)
          }
        } catch {}
      }
      if (botData) {
        setForm(prev => ({
          ...prev,
          name: botData.name || '',
          prompt: botData.system_prompt || botData.prompt || botData.bot_flow?.system_prompt || botData.bot_flow?.prompt || '',
          bot_tone: botData.bot_tone || botData.tone || botData.bot_flow?.bot_tone || 'friendly',
          response_length: botData.response_length || botData.bot_flow?.response_length || 'medium',
          use_emojis: botData.use_emojis ?? (botData.bot_flow?.use_emojis ?? true),
          llm: botData.llm || 'gpt-4o',
          confidence_threshold: botData.confidence_threshold ?? 0.7,
          max_turns: botData.max_turns ?? 10,
          handoff_message: botData.handoff_message || prev.handoff_message,
          theme_color: botData.theme_color || '#7c3aed',
          widget_title: botData.widget_title || 'Chat Assistant',
          welcome_message: botData.welcome_message || prev.welcome_message,
          avatar_url: botData.bot_avatar || botData.avatar_url || '',
          channel: botData.channel || 'web',
          integration_id: botData.bot_flow?.integration_id || '',
          opening_message: botData.opening_message || botData.bot_flow?.opening_message || '',
          auto_open: botData.bot_flow?.auto_open ?? true,
          open_delay: String(botData.callout_timer ?? (botData.bot_flow?.open_delay ?? 3)),
          callout_only: botData.show_callout_only ?? (botData.bot_flow?.callout_only ?? false),
          open_after_callout: botData.bot_flow?.open_after_callout ?? false,
          show_once_per_session: botData.show_once_per_session ?? (botData.bot_flow?.show_once_per_session ?? true),
          photo_upload_enabled: !!(botData.photo_upload_enabled ?? botData.bot_flow?.photo_upload_enabled),
          vision_ai_enabled: !!(botData.vision_ai_enabled ?? botData.bot_flow?.vision_ai_enabled),
        }))
        if (botData.bot_flow?.flow_sections) {
          const fs = botData.bot_flow.flow_sections
          setFlowSections(prev => ({
            ...prev,
            ...fs,
            ask_name: fs.ask_name ?? prev.ask_name,
            name_prompt: fs.name_prompt || prev.name_prompt,
            ask_whatsapp: fs.ask_whatsapp ?? prev.ask_whatsapp,
            whatsapp_prompt: fs.whatsapp_prompt || prev.whatsapp_prompt,
            ask_email: fs.ask_email ?? prev.ask_email,
            email_prompt: fs.email_prompt || prev.email_prompt,
          }))
        }
        if (botData.bot_flow?.triggers) setTriggers(botData.bot_flow.triggers)
        if (botData.bot_flow?.mcp_actions) setMcpActions(botData.bot_flow.mcp_actions)
        if (botData.bot_flow?.bot_routing_rules) setBotRoutingRules(botData.bot_flow.bot_routing_rules)
        if (botData.bot_flow?.timed_popups && Array.isArray(botData.bot_flow.timed_popups)) {
          setTimedPopups(botData.bot_flow.timed_popups)
        }
      }

      const targetClientId = botData?.client_id || activeWorkspaceId(user.id || '')
      setLoading(false)
      void fetchDashboardData<any[]>(`/api/bots?client_id=${encodeURIComponent(targetClientId)}`)
        .then(botsData=>setWorkspaceBots((botsData||[]).filter(b=>b.id!==id))).catch(()=>{})
    }
    load()
  }, [id])

  // Knowledge sources are the largest editor payload. Load them only after
  // the operator opens that tab; revisiting the tab reuses local state.
  useEffect(() => {
    if (activeTab !== 'knowledge' || knowledgeLoaded || !bot) return
    setKnowledgeLoaded(true)
    void Promise.all([handleRefreshKnowledge(true), handleRefreshDatabases(true)])
  }, [activeTab, knowledgeLoaded, bot])

  async function handleSaveConfig() {
    setSaving(true)
    const calloutTimerInt = parseInt(form.open_delay || '3', 10)
    
    // Exact schema matching public.bots columns
    const botDataUpdate: any = {
      name: form.name,
      system_prompt: form.prompt,
      bot_tone: form.bot_tone,
      tone: form.bot_tone,
      response_length: form.response_length,
      use_emojis: form.use_emojis,
      opening_message: form.opening_message,
      callout_timer: isNaN(calloutTimerInt) ? 3 : calloutTimerInt,
      show_callout_only: form.callout_only,
      show_once_per_session: form.show_once_per_session,
      confidence_threshold: form.confidence_threshold,
      max_turns: form.max_turns,
      handoff_message: form.handoff_message,
      theme_color: form.theme_color,
      widget_title: form.widget_title,
      welcome_message: form.welcome_message,
      channel: form.channel,
      bot_avatar: form.avatar_url,
      photo_upload_enabled: !!form.photo_upload_enabled,
      vision_ai_enabled: !!form.vision_ai_enabled,
    }

    const updated_bot_flow = { 
      ...(bot?.bot_flow || {}), 
      integration_id: form.integration_id,
      flow_sections: flowSections,
      triggers: triggers,
      mcp_actions: mcpActions,
      bot_routing_rules: botRoutingRules,
      opening_message: form.opening_message,
      callout_only: form.callout_only,
      auto_open: form.auto_open,
      open_delay: form.open_delay,
      open_after_callout: form.open_after_callout,
      show_once_per_session: form.show_once_per_session,
      bot_tone: form.bot_tone,
      system_prompt: form.prompt,
      prompt: form.prompt,
      response_length: form.response_length,
      use_emojis: form.use_emojis,
      timed_popups: timedPopups,
      photo_upload_enabled: !!form.photo_upload_enabled,
      vision_ai_enabled: !!form.vision_ai_enabled,
    }
    botDataUpdate.bot_flow = updated_bot_flow

    try {
      const res = await fetch(`/api/bots/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(botDataUpdate)
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => null)
        console.warn('PUT /api/bots failed, trying direct Supabase update:', errorData)
        const { error } = await supabase.from('bots').update(botDataUpdate).eq('id', id)
        if (error) throw new Error(error.message || errorData?.error || 'Failed to save bot configuration')
      }
      invalidateDashboardData(`/api/bots/${id}`)
      invalidateDashboardData('/api/bots?')

      setBot(prev => (prev ? { ...prev, ...botDataUpdate } : botDataUpdate))
      toast.success('Bot configuration saved successfully')
    } catch (err: any) {
      console.error('Failed to save config:', err)
      toast.error(err.message || 'Failed to save config')
    } finally {
      setSaving(false)
    }
  }

  // ── Knowledge Bases Handlers ────────────────────────────────
  async function handleLinkKnowledgeBase(datasetId: string) {
    try {
      const res = await fetch('/api/bot-datasets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_id: id, dataset_id: datasetId })
      })

      if (res.ok) {
        toast.success('Knowledge base linked')
        const { data } = await supabase.from('bot_datasets').select('id, dataset_id, datasets(id, name, created_from, chunk_count)').eq('bot_id', id)
        if (data) setAssignedKnowledgeBases(data)
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to link knowledge base.')
      }
    } catch {
      toast.error('Network error linking knowledge base.')
    }
  }

  async function handleRemoveKnowledgeBase(linkId: string) {
    const link = assignedKnowledgeBases.find(d => d.id === linkId)
    if (!link) return
    try {
      const res = await fetch(`/api/bot-datasets?bot_id=${id}&dataset_id=${link.dataset_id}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        toast.success('Knowledge base unlinked')
        setAssignedKnowledgeBases(prev => prev.filter(d => d.id !== linkId))
      } else {
        toast.error('Failed to remove knowledge base.')
      }
    } catch {
      toast.error('Network error removing knowledge base.')
    }
  }

  async function handleRefreshKnowledge(silent = false) {
    setIsRefreshingKb(true)
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (!authError && user) {
        const targetClientId = bot?.client_id || activeWorkspaceId(user.id || '')
        const { data: dsets } = await supabase
          .from('datasets')
          .select('id, name, created_from, chunk_count, client_id')
          .or(`client_id.eq.${activeWorkspaceId(user.id || '')},client_id.eq.${targetClientId}`)
          .order('created_at', { ascending: false })
        if (dsets) setAvailableKnowledgeBases(dsets)

        const { data: assigned } = await supabase.from('bot_datasets').select('id, dataset_id, datasets(id, name, created_from, chunk_count)').eq('bot_id', id)
        if (assigned) setAssignedKnowledgeBases(assigned)
      }
      if (!silent) toast.success('Knowledge bases refreshed')
    } catch {
      toast.error('Failed to refresh knowledge bases')
    } finally {
      setIsRefreshingKb(false)
    }
  }

  // ── Live Databases Handlers ─────────────────────────────────
  async function handleLinkDatabase(databaseId: string) {
    try {
      const res = await fetch('/api/bot-databases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_id: id, database_id: databaseId })
      })

      if (res.ok) {
        toast.success('Database connected to bot')
        const assignedRes = await fetch(`/api/bot-databases?bot_id=${id}&t=${Date.now()}`)
        if (assignedRes.ok) {
          const data = await assignedRes.json()
          if (Array.isArray(data)) setAssignedDatabases(data)
        }
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to link database.')
      }
    } catch {
      toast.error('Network error linking database.')
    }
  }

  async function handleRemoveDatabase(linkId: string) {
    const link = assignedDatabases.find(d => d.id === linkId || d.database_id === linkId || d.data_source_id === linkId)
    const targetDbId = link?.database_id || link?.data_source_id || link?.id || linkId
    try {
      const res = await fetch(`/api/bot-databases?id=${linkId}&bot_id=${id}&database_id=${targetDbId}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        toast.success('Database disconnected from bot')
        setAssignedDatabases(prev => prev.filter(d => d.id !== linkId && d.database_id !== targetDbId && d.data_source_id !== targetDbId))
      } else {
        toast.error('Failed to disconnect database.')
      }
    } catch {
      toast.error('Network error unlinking database.')
    }
  }

  async function handleRefreshDatabases(silent = false) {
    setIsRefreshingDb(true)
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (!authError && user) {
        const [dbsRes, assignedDbsRes] = await Promise.all([
          fetch(`/api/databases?client_id=${activeWorkspaceId(user.id || '')}&bot_id=${id}${contextId ? `&context_id=${contextId}` : ''}&t=${Date.now()}`),
          fetch(`/api/bot-databases?bot_id=${id}&t=${Date.now()}`)
        ])

        if (dbsRes.ok) {
          const dbs = await dbsRes.json()
          if (Array.isArray(dbs)) setAvailableDatabases(dbs)
        }
        if (assignedDbsRes.ok) {
          const assigned = await assignedDbsRes.json()
          if (Array.isArray(assigned)) setAssignedDatabases(assigned)
        }
      }
      if (!silent) toast.success('Databases refreshed')
    } catch {
      toast.error('Failed to refresh databases')
    } finally {
      setIsRefreshingDb(false)
    }
  }

  async function handleQuickAddChunk() {
    if (!quickTitle.trim() || !quickText.trim()) {
      toast.error('Title and text are required')
      return
    }
    
    // We need the context_id for this bot's client
    const { data: clientInfo } = await supabase.from('clients').select('context_id').eq('id', bot?.client_id).single()
    if (!clientInfo?.context_id) {
      toast.error('Client context not found')
      return
    }

    setIsAddingQuickChunk(true)
    try {
      const res = await fetch('/api/chunks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context_id: clientInfo.context_id,
          title: quickTitle,
          text: quickText,
          source_type: 'manual'
        })
      })
      
      const data = await res.json()
      if (res.ok) {
        toast.success(`Successfully added ${data.chunks_added} chunks`)
        setQuickTitle('')
        setQuickText('')
      } else {
        toast.error(data.error || 'Failed to add chunk')
      }
    } catch (e) {
      toast.error('Connection error')
    }
    setIsAddingQuickChunk(false)
  }

  if (loading) return <div className="space-y-5 p-6" aria-label="Loading bot settings"><div className="h-16 rounded-xl bg-surface-muted animate-pulse"/><div className="h-12 rounded-xl bg-surface-muted animate-pulse"/><div className="grid gap-5 lg:grid-cols-2"><div className="h-96 rounded-2xl border border-surface-border bg-surface animate-pulse"/><div className="h-96 rounded-2xl border border-surface-border bg-surface animate-pulse"/></div></div>
  if (!bot) return <div className="p-20 text-center text-ink-muted">Bot not found.</div>

  const isWebBot = form.channel === 'web' || !form.channel

  const tabs = [
    { id: 'identity', label: 'Basic & Identity', icon: Cpu },
    { id: 'knowledge', label: 'Knowledge, Databases & FAQs', icon: BookOpen },
    { id: 'commerce', label: 'Booking & Commerce', icon: CalendarDays },
    { id: 'email', label: 'Email Automation', icon: Mail },
    { id: 'behavior', label: 'Behavior & Configuration', icon: LayoutTemplate },
    { id: 'proactive', label: 'Proactive Triggers', icon: Zap },
    { id: 'mcp', label: 'MCP Actions', icon: Webhook },
    ...(isWebBot ? [{ id: 'appearance', label: 'Appearance & Integration', icon: Sliders }] : [])
  ]

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <div className="max-w-[1200px] mx-auto px-2 py-4 animate-in fade-in duration-500">
        
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex flex-col gap-1">
            <Link href="/bots/all" className="flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink transition-colors w-fit">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Agents
            </Link>
            <h1 className="text-2xl font-bold text-ink tracking-tight flex items-center gap-2 mt-1">
              <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center border border-accent/20 shadow-sm">
                <Bot className="w-4 h-4 text-accent" />
              </span>
              {bot.name} Settings
            </h1>
            <p className="text-ink-secondary text-xs max-w-2xl">
              Configure knowledge, behavior, proactive triggers and advanced MCP capabilities.
            </p>
          </div>
          <div className="flex gap-2 mt-1">
            <Link href={`/bots/${id}/flow`}>
              <Button variant="outline" size="sm" className="border-surface-border text-ink bg-white shadow-sm hover:border-accent hover:text-accent transition-all h-8 text-xs px-3">
                <LayoutTemplate className="w-3.5 h-3.5 mr-1.5" /> Open Visual Builder
              </Button>
            </Link>
            <Button size="sm" onClick={handleSaveConfig} disabled={saving} className="bg-ink text-white hover:bg-ink-secondary shadow-md h-8 px-4 text-xs font-medium">
              {saving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </div>

        <BotReadinessPanel botId={id} contextId={contextId || bot?.client_id} />

        {/* Tab Navigation */}
        <div className="bg-white border-y md:border md:rounded-2xl shadow-sm border-surface-border overflow-hidden">
          <div className="flex overflow-x-auto border-b border-surface-border bg-surface-muted/30 px-1 hide-scrollbar">
            {tabs.map(tab => {
              const isActive = activeTab === tab.id
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-3 text-[13px] font-semibold transition-all relative whitespace-nowrap group",
                    isActive ? "text-accent" : "text-ink-secondary hover:text-ink hover:bg-surface-muted"
                  )}
                >
                  <Icon className={cn("w-3.5 h-3.5 transition-colors", isActive ? "text-accent" : "text-ink-muted group-hover:text-ink")} />
                  {tab.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent rounded-t-full shadow-[0_-2px_8px_rgba(var(--accent-rgb),0.5)]" />
                  )}
                </button>
              )
            })}
          </div>

          <div className="p-4 md:p-6 min-h-[500px] bg-white">
            
            {/* 1. IDENTITY TAB */}
            {activeTab === 'identity' && (
              <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                <div className="border-b border-surface-border pb-5">
                  <h2 className="text-xl font-bold text-ink">Identity & Persona</h2>
                  <p className="text-sm text-ink-secondary mt-1">Define who the bot is, how it speaks, and its initial greeting behavior.</p>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
                  <div className="lg:col-span-7 space-y-8">
                    <div className="flex gap-6 items-center">
                      <div className="w-16 h-16 rounded-full border border-surface-border bg-surface-muted flex flex-col items-center justify-center cursor-pointer hover:bg-surface transition-colors relative group shrink-0">
                        {form.avatar_url ? (
                          <img src={form.avatar_url} className="w-full h-full object-cover rounded-full" alt="Bot Avatar" />
                        ) : (
                          <Bot className="w-6 h-6 text-ink-muted group-hover:text-ink transition-colors" />
                        )}
                        <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <UploadCloud className="w-5 h-5 text-white" />
                        </div>
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label className="text-sm font-semibold">Bot Name</Label>
                        <Input value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="h-10 bg-surface shadow-sm" placeholder="e.g. Aria Support Agent" />
                        <p className="text-[11px] text-ink-muted">The primary identifier for this AI assistant across all channels and widgets.</p>
                      </div>
                    </div>

                    {/* Persona Tone & Voice Engine */}
                    <div className="space-y-3 p-5 bg-surface-muted/40 border border-surface-border rounded-2xl">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm font-semibold text-ink flex items-center gap-2">
                            <span>Persona Tone & Voice</span>
                            <span className="text-[10px] font-semibold text-accent uppercase tracking-wider bg-accent/10 px-2 py-0.5 rounded-full">Active</span>
                          </Label>
                          <p className="text-xs text-ink-secondary mt-0.5">Select how your AI communicates and shapes customer impressions.</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleApplyToneToPrompt(form.bot_tone)}
                          className="h-8 text-xs font-semibold text-accent hover:text-accent hover:bg-accent/10 flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5" /> Insert Tone Directive
                        </Button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
                        {TONE_PRESETS.map((preset) => {
                          const isSelected = form.bot_tone === preset.id
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => {
                                setForm(prev => ({ ...prev, bot_tone: preset.id }))
                              }}
                              className={cn(
                                "flex flex-col items-start p-3 rounded-xl border text-left transition-all relative overflow-hidden",
                                isSelected 
                                  ? "border-accent bg-accent/5 ring-1 ring-accent/30 shadow-sm" 
                                  : "border-surface-border bg-white hover:border-surface-border/80 hover:bg-surface-muted/60"
                              )}
                            >
                              <div className="flex items-center justify-between w-full">
                                <span className="text-lg">{preset.icon}</span>
                                {isSelected && (
                                  <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                                )}
                              </div>
                              <span className="text-xs font-bold text-ink mt-2">{preset.name}</span>
                              <span className="text-[10px] text-ink-muted leading-tight mt-0.5">{preset.tagline}</span>
                            </button>
                          )
                        })}
                      </div>

                      {/* Selected Tone Directives Card */}
                      {(() => {
                        const currentPreset = TONE_PRESETS.find(p => p.id === form.bot_tone) || TONE_PRESETS[0]
                        return (
                          <div className="p-3 bg-white border border-surface-border/80 rounded-xl flex items-start gap-2.5 mt-2">
                            <span className="text-base shrink-0 mt-0.5">{currentPreset.icon}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-semibold text-ink flex items-center justify-between">
                                <span>Configured Tone: {currentPreset.name}</span>
                                <span className="text-[10px] text-emerald-600 font-medium bg-emerald-50 border border-emerald-100 px-1.5 py-0.2 rounded">Strictly Enforced</span>
                              </div>
                              <p className="text-[11px] text-ink-secondary mt-0.5 leading-relaxed">{currentPreset.instruction}</p>
                            </div>
                          </div>
                        )
                      })()}

                      {/* Response Length & Emojis Quick Modifiers */}
                      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-surface-border">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-ink">Response Length</Label>
                          <Select value={form.response_length} onValueChange={v => setForm({ ...form, response_length: v })}>
                            <SelectTrigger className="h-9 bg-white text-xs shadow-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="concise">Concise (1-3 sentences)</SelectItem>
                              <SelectItem value="medium">Balanced (Standard)</SelectItem>
                              <SelectItem value="detailed">Thorough & Detailed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold text-ink">Emoji Usage</Label>
                          <Select value={form.use_emojis ? 'yes' : 'no'} onValueChange={v => setForm({ ...form, use_emojis: v === 'yes' })}>
                            <SelectTrigger className="h-9 bg-white text-xs shadow-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="yes">Enabled (Tasteful 😊)</SelectItem>
                              <SelectItem value="no">Disabled (Zero Emojis)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-semibold flex items-center justify-between">
                        <span>System Prompt & Core Directives</span>
                        <span className="text-[11px] font-normal text-accent bg-accent/10 px-2 py-0.5 rounded-full">AI Core</span>
                      </Label>
                      <Textarea 
                        rows={8} 
                        className="resize-none bg-surface shadow-sm text-sm"
                        value={form.prompt}
                        onChange={e => setForm({...form, prompt: e.target.value})}
                        placeholder="You are an AI assistant for this business..."
                      />
                      <p className="text-[11px] text-ink-muted">Specific business instructions, policy rules, and role definitions. The configured tone is applied automatically.</p>
                    </div>

                  </div>

                  {/* Opening Behavior Section */}
                  <div className="lg:col-span-5">
                    <div className="bg-white border border-surface-border shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-6 sticky top-8">
                      <div className="flex items-center gap-2 mb-6">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                          <Zap className="w-4 h-4 text-emerald-600" />
                        </div>
                        <h3 className="font-bold text-ink text-lg">Opening Behavior</h3>
                      </div>

                      <div className="space-y-5">
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">Opening Message / Greeting</Label>
                          <Textarea 
                            rows={3} 
                            className="resize-none bg-surface text-sm"
                            value={form.opening_message}
                            onChange={e => setForm({...form, opening_message: e.target.value})}
                            placeholder="Hey! 👋 Welcome to our store! How can I help you today?"
                          />
                          <p className="text-[11px] text-ink-muted">Guaranteed to be the first message shown to visitors when the chatbot opens.</p>
                          <div className="flex gap-2 flex-wrap pt-1">
                            {['{{customer_name}}', '{{cart_value}}', '{{store_name}}'].map(chip => (
                              <button key={chip} type="button" onClick={() => setForm({ ...form, opening_message: (form.opening_message ? form.opening_message + ' ' : '') + chip })} className="text-[10px] font-mono bg-surface-muted text-ink-secondary px-2 py-1 rounded-md border border-surface-border hover:bg-surface-border transition-colors">
                                {chip}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Website-specific popup and auto-open options */}
                        {isWebBot ? (
                          <>
                            <div className="space-y-4 pt-4 border-t border-surface-border">
                              <div className="flex items-center justify-between">
                                <div>
                                  <Label className="text-sm font-medium">Show Automatically</Label>
                                  <p className="text-[11px] text-ink-muted">Trigger message without waiting for click</p>
                                </div>
                                <Switch checked={form.auto_open} onCheckedChange={v => setForm({...form, auto_open: v})} />
                              </div>
                              
                              {form.auto_open && (
                                <>
                                  <div className="flex items-center justify-between">
                                    <Label className="text-sm">Show After</Label>
                                    <Select value={form.open_delay} onValueChange={v => setForm({...form, open_delay: v})}>
                                      <SelectTrigger className="w-[140px] h-8 text-xs"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="0">Immediately</SelectItem>
                                        <SelectItem value="3">3 Seconds</SelectItem>
                                        <SelectItem value="5">5 Seconds</SelectItem>
                                        <SelectItem value="10">10 Seconds</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div className="p-3 bg-surface-muted/60 border border-surface-border rounded-xl space-y-2">
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <Label className="text-sm font-semibold text-ink">Popup Bubble Only</Label>
                                        <p className="text-[11px] text-ink-muted">Pops up the message callout <strong>without opening the full chatbot window</strong>.</p>
                                      </div>
                                      <Switch checked={form.callout_only} onCheckedChange={v => setForm({...form, callout_only: v})} />
                                    </div>
                                    {form.callout_only && (
                                      <div className="pt-2 border-t border-surface-border/60 flex items-center justify-between">
                                        <div>
                                          <Label className="text-xs font-medium text-ink">Auto-open chatbot after callout</Label>
                                          <p className="text-[10px] text-ink-muted">Expands the chat window after 6s if not clicked</p>
                                        </div>
                                        <Switch checked={form.open_after_callout} onCheckedChange={v => setForm({...form, open_after_callout: v})} />
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex items-center justify-between">
                                    <div>
                                      <Label className="text-sm">Once per session</Label>
                                      <p className="text-[11px] text-ink-muted">Only trigger once per browser session</p>
                                    </div>
                                    <Switch checked={form.show_once_per_session} onCheckedChange={v => setForm({...form, show_once_per_session: v})} />
                                  </div>
                                </>
                              )}
                            </div>

                            {/* Live Callout Preview Widget Mockup */}
                            <div className="pt-4 border-t border-surface-border">
                              <Label className="text-xs font-semibold text-ink-muted uppercase tracking-wider block mb-2">Callout Bubble Preview</Label>
                              <div className="p-4 bg-[#111] rounded-xl relative overflow-hidden flex flex-col items-end gap-2">
                                <div className="bg-[#18181b] border border-white/15 text-white p-3 rounded-2xl max-w-[240px] shadow-lg relative text-left">
                                  <div className="text-[10px] font-semibold text-[#a1a1aa] flex items-center gap-1.5 mb-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                    {form.name || form.widget_title || 'AI Assistant'}
                                  </div>
                                  <p className="text-xs text-[#f4f4f5] leading-relaxed">
                                    {form.opening_message || form.welcome_message || 'Hi there! How can we help you today?'}
                                  </p>
                                  <div className="mt-2 text-[10px] font-semibold text-accent bg-accent/15 px-2 py-1 rounded-md text-center">
                                    Chat with us
                                  </div>
                                  {/* Bubble tail */}
                                  <div className="absolute -bottom-1.5 right-4 w-3 h-3 bg-[#18181b] border-r border-b border-white/15 transform rotate-45"></div>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center text-white shadow-md">
                                  <Bot className="w-5 h-5" />
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="pt-4 border-t border-surface-border">
                            <div className="p-3.5 bg-surface-muted/50 border border-surface-border rounded-xl">
                              <div className="flex items-center gap-2 mb-1">
                                <Bot className="w-3.5 h-3.5 text-accent" />
                                <span className="text-xs font-bold text-ink capitalize">{form.channel} Direct Messaging</span>
                              </div>
                              <p className="text-[11px] text-ink-muted leading-relaxed">
                                Website popup bubbles, callout overlays, and browser timing delays only apply to Webchat. For {form.channel}, this greeting is sent directly in chat when a customer initiates contact.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Timed Follow-up Popups & Nudges Manager (Webchat Only) */}
                {isWebBot && (
                  <div className="pt-8 border-t border-surface-border">
                    <TimedPopupsManager
                      popups={timedPopups}
                      onChange={setTimedPopups}
                      themeColor={form.theme_color}
                      botName={form.name}
                    />
                  </div>
                )}
              </div>
            )}

            {/* 2. KNOWLEDGE & DATABASES TAB */}
            {activeTab === 'knowledge' && (
              <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                <div className="border-b border-surface-border pb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-ink flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-accent" /> Knowledge Bases, Live Databases & FAQs
                    </h2>
                    <p className="text-sm text-ink-secondary mt-1">
                      Connect documents and live data, then configure approved FAQ answers for this bot.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-accent/20 bg-accent/5 p-4">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                  <div>
                    <p className="text-sm font-semibold text-ink">FAQs are now managed as knowledge</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-secondary">Add question-and-answer content here so it uses the same bot assignment, retrieval, analytics, and channel behavior as every other knowledge source. Existing Manual FAQ Overrides are imported automatically by migration 053.</p>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                  <div className="lg:col-span-2 space-y-10">
                    
                    {/* ══════════════════════════════════════════════════════════
                        SECTION 1: KNOWLEDGE BASES (DOCS & UNSTRUCTURED)
                    ══════════════════════════════════════════════════════════ */}
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h3 className="text-base font-bold text-ink flex items-center gap-2">
                            <BookOpen className="w-4 h-4 text-accent" />
                            Knowledge Bases
                            <span className="text-xs font-normal text-ink-muted bg-surface-muted px-2.5 py-0.5 rounded-full border border-surface-border">
                              {assignedKnowledgeBases.length} Linked
                            </span>
                          </h3>
                          <p className="text-xs text-ink-secondary mt-0.5">
                            Unstructured documents, web crawls, and FAQs used for semantic RAG retrieval.
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleRefreshKnowledge()}
                            disabled={isRefreshingKb}
                            className="h-8 px-2.5 text-xs border-surface-border"
                            title="Refresh knowledge list"
                          >
                            <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isRefreshingKb && "animate-spin")} />
                            Refresh
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            onClick={() => window.open('/knowledge/add', '_blank')}
                            className="h-8 bg-accent hover:bg-accent-hover text-white text-xs font-semibold gap-1.5 shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Knowledge Base
                            <ExternalLink className="w-3 h-3 opacity-70 ml-0.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Linked Knowledge Bases Cards */}
                      {assignedKnowledgeBases.length === 0 ? (
                        <div className="border-2 border-dashed border-surface-border rounded-2xl p-8 text-center bg-surface-muted/30">
                          <div className="w-12 h-12 rounded-full bg-white border border-surface-border flex items-center justify-center mx-auto mb-3 shadow-sm">
                            <BookOpen className="w-6 h-6 text-ink-muted" />
                          </div>
                          <h4 className="text-sm font-bold text-ink">No Knowledge Linked</h4>
                          <p className="text-xs text-ink-secondary mt-1 max-w-sm mx-auto">
                            Link a knowledge base to allow this bot to accurately answer questions using your documentation.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {assignedKnowledgeBases.map((link) => {
                            const ds = link.datasets
                            if (!ds) return null
                            return (
                              <div key={link.id} className="flex items-center justify-between border border-surface-border rounded-xl p-4 bg-white shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:border-accent/40 transition-colors group">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-surface-muted to-surface border border-surface-border flex items-center justify-center shadow-inner">
                                    <BookOpen className="w-5 h-5 text-accent" />
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-bold text-ink">{ds.name}</h4>
                                    <div className="flex items-center gap-3 mt-1">
                                      <span className="text-[11px] text-ink-muted uppercase tracking-wider font-semibold">
                                        {ds.created_from || 'docs'} • {ds.chunk_count || 0} Chunks
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleRemoveKnowledgeBase(link.id)} 
                                  className="text-red-600 hover:bg-red-50 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-all h-8 px-3"
                                >
                                  Remove
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Available Knowledge Bases */}
                      <div className="border border-surface-border rounded-xl bg-white shadow-sm overflow-hidden mt-4">
                        <div className="p-3 border-b border-surface-border bg-surface-muted flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">Available Knowledge Bases</h4>
                          {availableKnowledgeBases.length > 3 && (
                            <div className="relative w-48">
                              <Search className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                placeholder="Filter KBs..."
                                value={kbSearch}
                                onChange={e => setKbSearch(e.target.value)}
                                className="w-full pl-8 pr-2.5 py-1 text-xs bg-white border border-surface-border rounded-md outline-none focus:border-accent"
                              />
                            </div>
                          )}
                        </div>
                        <div className="max-h-[240px] overflow-y-auto">
                          {availableKnowledgeBases
                            .filter(d => !assignedKnowledgeBases.find(a => a.dataset_id === d.id))
                            .filter(d => !kbSearch || d.name?.toLowerCase().includes(kbSearch.toLowerCase()))
                            .length === 0 ? (
                            <div className="p-4 text-center text-xs text-ink-muted">
                              {availableKnowledgeBases.length === 0 
                                ? 'No knowledge bases found. Click "Add Knowledge Base" above to create one.'
                                : 'All available knowledge bases are already linked.'}
                            </div>
                          ) : (
                            <div className="p-2 space-y-1">
                              {availableKnowledgeBases
                                .filter(d => !assignedKnowledgeBases.find(a => a.dataset_id === d.id))
                                .filter(d => !kbSearch || d.name?.toLowerCase().includes(kbSearch.toLowerCase()))
                                .map(ds => (
                                  <div 
                                    key={ds.id} 
                                    onClick={() => handleLinkKnowledgeBase(ds.id)} 
                                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface cursor-pointer group transition-colors"
                                  >
                                    <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center group-hover:bg-accent/10 transition-colors">
                                      <BookOpen className="w-4 h-4 text-ink-muted group-hover:text-accent" />
                                    </div>
                                    <div>
                                      <h5 className="text-xs font-semibold text-ink">{ds.name}</h5>
                                      <p className="text-[11px] text-ink-muted">{ds.chunk_count || 0} chunks • {ds.created_from || 'custom'}</p>
                                    </div>
                                    <Plus className="w-4 h-4 text-ink-muted group-hover:text-accent ml-auto" />
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ══════════════════════════════════════════════════════════
                        SECTION 2: DATABASES (LIVE STRUCTURED DATA & APIS)
                    ══════════════════════════════════════════════════════════ */}
                    <div className="space-y-4 pt-6 border-t border-surface-border">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <h3 className="text-base font-bold text-ink flex items-center gap-2">
                            <Database className="w-4 h-4 text-accent" />
                            Databases (Live Structured Data)
                            <span className="text-xs font-normal text-ink-muted bg-surface-muted px-2.5 py-0.5 rounded-full border border-surface-border">
                              {assignedDatabases.length} Connected
                            </span>
                          </h3>
                          <p className="text-xs text-ink-secondary mt-0.5">
                            Connect Google Sheets, REST APIs, or CSV databases for real-time order lookups, inventory, and records.
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleRefreshDatabases(false)}
                            disabled={isRefreshingDb}
                            className="h-8 px-2.5 text-xs border-surface-border"
                            title="Refresh database list"
                          >
                            <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isRefreshingDb && "animate-spin")} />
                            Refresh
                          </Button>

                          <Button
                            type="button"
                            size="sm"
                            onClick={() => window.open('/databases/all', '_blank')}
                            className="h-8 bg-accent hover:bg-accent-hover text-white text-xs font-semibold gap-1.5 shadow-2xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Database
                            <ExternalLink className="w-3 h-3 opacity-70 ml-0.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Connected Databases Cards */}
                      {assignedDatabases.length === 0 ? (
                        <div className="border-2 border-dashed border-surface-border rounded-2xl p-8 text-center bg-surface-muted/30">
                          <div className="w-12 h-12 rounded-full bg-white border border-surface-border flex items-center justify-center mx-auto mb-3 shadow-sm">
                            <Database className="w-6 h-6 text-ink-muted" />
                          </div>
                          <h4 className="text-sm font-bold text-ink">No Databases Connected</h4>
                          <p className="text-xs text-ink-secondary mt-1 max-w-sm mx-auto">
                            Link a live database to allow this bot to fetch order status, product inventory, or query custom APIs in real-time.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2.5">
                          {assignedDatabases.map((link) => {
                            const db = link.data_sources || link
                            const dbId = link.database_id || link.data_source_id || link.id || db.id
                            const dbName = db.name || 'Untitled Database'
                            const dbType = db.data_type || db.source_type || 'Custom'
                            const dbSourceCount = db.source_count ?? 0
                            const dbPurpose = db.purpose || ''

                            return (
                              <div key={link.id || dbId} className="flex items-center justify-between border border-surface-border rounded-xl p-4 bg-white shadow-[0_2px_10px_rgb(0,0,0,0.02)] hover:border-accent/40 transition-colors group">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-surface-muted to-surface border border-surface-border flex items-center justify-center shadow-inner">
                                    <Database className="w-5 h-5 text-accent" />
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <h4 className="text-sm font-bold text-ink">{dbName}</h4>
                                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-accent/10 text-accent capitalize">
                                        {dbType}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1">
                                      <span className="text-[11px] text-ink-muted uppercase tracking-wider font-semibold">
                                        {dbSourceCount} Sources / Records {dbPurpose ? `• ${dbPurpose}` : ''}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => handleRemoveDatabase(link.id || dbId)} 
                                  className="text-red-600 hover:bg-red-50 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-all h-8 px-3"
                                >
                                  Remove
                                </Button>
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Available Databases */}
                      <div className="border border-surface-border rounded-xl bg-white shadow-sm overflow-hidden mt-4">
                        <div className="p-3 border-b border-surface-border bg-surface-muted flex items-center justify-between">
                          <h4 className="text-xs font-semibold text-ink-secondary uppercase tracking-wider">Available Databases</h4>
                          {availableDatabases.length > 3 && (
                            <div className="relative w-48">
                              <Search className="w-3.5 h-3.5 text-ink-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
                              <input
                                type="text"
                                placeholder="Filter databases..."
                                value={dbSearch}
                                onChange={e => setDbSearch(e.target.value)}
                                className="w-full pl-8 pr-2.5 py-1 text-xs bg-white border border-surface-border rounded-md outline-none focus:border-accent"
                              />
                            </div>
                          )}
                        </div>
                        <div className="max-h-[240px] overflow-y-auto">
                          {(() => {
                            const unlinked = availableDatabases.filter(d => {
                              const isLinked = assignedDatabases.some(a => 
                                a.database_id === d.id || 
                                a.data_source_id === d.id || 
                                a.id === d.id ||
                                a.data_sources?.id === d.id
                              )
                              return !isLinked
                            }).filter(d => 
                              !dbSearch || 
                              d.name?.toLowerCase().includes(dbSearch.toLowerCase()) || 
                              d.data_type?.toLowerCase().includes(dbSearch.toLowerCase()) ||
                              d.purpose?.toLowerCase().includes(dbSearch.toLowerCase())
                            )

                            if (unlinked.length === 0) {
                              return (
                                <div className="p-4 text-center text-xs text-ink-muted">
                                  {availableDatabases.length === 0 
                                    ? 'No databases connected yet. Click "Add Database" above to connect your first source.' 
                                    : 'All available databases are already connected to this bot.'}
                                </div>
                              )
                            }

                            return (
                              <div className="p-2 space-y-1">
                                {unlinked.map(db => (
                                  <div 
                                    key={db.id} 
                                    onClick={() => handleLinkDatabase(db.id)} 
                                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface cursor-pointer group transition-colors"
                                  >
                                    <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center group-hover:bg-accent/10 transition-colors">
                                      <Database className="w-4 h-4 text-ink-muted group-hover:text-accent" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <h5 className="text-xs font-semibold text-ink truncate">{db.name}</h5>
                                      <p className="text-[11px] text-ink-muted capitalize truncate">
                                        {db.data_type || 'Custom'} • {db.source_count || 0} records {db.purpose ? `— ${db.purpose}` : ''}
                                      </p>
                                    </div>
                                    <Plus className="w-4 h-4 text-ink-muted group-hover:text-accent ml-auto shrink-0" />
                                  </div>
                                ))}
                              </div>
                            )
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* FAQs are stored as ordinary chunks in a bot-linked Knowledge Base. */}
                    <BotFaqManager botId={id} onKnowledgeChanged={() => { handleRefreshKnowledge(true) }} />

                  </div>

                  <div className="space-y-6">
                    {/* Live Data Tool Calling Info */}
                    <div className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 border border-amber-500/20 rounded-2xl p-5 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="w-4 h-4 text-amber-600" />
                        <h4 className="font-bold text-ink text-sm">Live Tool Calling</h4>
                      </div>
                      <p className="text-xs text-ink-secondary leading-relaxed">
                        Connected databases are exposed as live tools to Gemini. When customers ask about order status, tracking, pricing, or stock, the bot dynamically executes API calls with a 45s cache-aside and 1.5s hard timeout.
                      </p>
                    </div>

                    {/* Advanced RAG Settings */}
                    <div className="bg-surface border border-surface-border rounded-2xl p-6 shadow-sm">
                      <div className="flex items-center gap-2 mb-5">
                        <Settings className="w-4 h-4 text-ink-secondary" />
                        <h3 className="font-bold text-ink">Advanced Retrieval</h3>
                      </div>
                      <div className="space-y-5">
                        <label className="flex items-start gap-3 cursor-pointer group">
                          <Switch checked={ragSettings.caching} onCheckedChange={v => setRagSettings({...ragSettings, caching: v})} className="mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-ink">Response Caching</p>
                            <p className="text-[11px] text-ink-muted mt-0.5 leading-relaxed">Same question returns cached answer instantly. Saves AI tokens and latency.</p>
                          </div>
                        </label>
                        <label className="flex items-start gap-3 cursor-pointer group">
                          <Switch checked={ragSettings.reranking} onCheckedChange={v => setRagSettings({...ragSettings, reranking: v})} className="mt-0.5" />
                          <div>
                            <p className="text-sm font-semibold text-ink">Semantic Reranking</p>
                            <p className="text-[11px] text-ink-muted mt-0.5 leading-relaxed">Re-ranks retrieved chunks by exact relevance before answering. Slower but highly accurate.</p>
                          </div>
                        </label>
                      </div>
                    </div>
                    
                    {/* Inline Quick Add Chunk Form */}
                    <div className="bg-accent/5 border border-accent/20 rounded-2xl p-6 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                        <UploadCloud className="w-24 h-24 text-accent" />
                      </div>
                      <h3 className="font-bold text-accent text-sm mb-2 relative z-10">Quick Add Knowledge</h3>
                      <p className="text-[12px] text-accent/80 mb-4 relative z-10 leading-relaxed">Instantly add text to this bot's primary knowledge base.</p>
                      
                      <div className="space-y-3 relative z-10">
                        <input
                          type="text"
                          placeholder="Headline (e.g. Refund Policy)"
                          value={quickTitle}
                          onChange={e => setQuickTitle(e.target.value)}
                          className="w-full bg-white border border-accent/20 rounded-lg px-3 py-2 text-xs text-ink outline-none focus:border-accent/50"
                        />
                        <textarea
                          placeholder="Paste your content here..."
                          value={quickText}
                          onChange={e => setQuickText(e.target.value)}
                          className="w-full bg-white border border-accent/20 rounded-lg px-3 py-2 text-xs text-ink outline-none focus:border-accent/50 min-h-[80px] resize-none"
                        />
                        <Button 
                          onClick={handleQuickAddChunk} 
                          disabled={isAddingQuickChunk || !quickTitle.trim() || !quickText.trim()}
                          className="w-full bg-accent hover:bg-accent/90 text-white shadow-sm transition-colors text-xs h-9 disabled:opacity-50"
                        >
                          {isAddingQuickChunk ? 'Adding...' : 'Add Knowledge'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>


              </div>
            )}

            {/* 2.5. PER-BOT BOOKING AND COMMERCE */}
            {activeTab === 'commerce' && (
              <BookingCommerceTab botId={id} />
            )}

            {activeTab === 'email' && (
              <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                <div className="flex flex-col gap-4 border-b border-surface-border pb-5 sm:flex-row sm:items-center sm:justify-between">
                  <div><h2 className="text-xl font-bold text-ink">Email automation</h2><p className="mt-1 text-sm text-ink-secondary">Give this bot its own mailbox, SMTP identity and safe reply policy.</p></div>
                  <Link href="/settings/integrations"><Button variant="outline" className="h-9"><Mail className="mr-2 h-4 w-4" />Manage mailboxes</Button></Link>
                </div>
                {channelIntegrations.filter(item => item.channel === 'email' && item.bot_id === id).length === 0 ? <div className="rounded-2xl border-2 border-dashed border-surface-border p-10 text-center"><Mail className="mx-auto mb-3 h-8 w-8 text-ink-muted" /><h3 className="text-sm font-semibold text-ink">No mailbox assigned</h3><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-ink-muted">Create an Email (SMTP) integration and assign it to this bot. Each mailbox can have a different support, service, sales, or marketing policy.</p><Link href="/settings/integrations"><Button className="mt-4 h-8 bg-ink text-xs text-white">Connect mailbox</Button></Link></div> : <div className="grid gap-4 md:grid-cols-2">{channelIntegrations.filter(item => item.channel === 'email' && item.bot_id === id).map(mailbox => <div key={mailbox.id} className="rounded-2xl border border-surface-border bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-ink">{mailbox.instance_name}</p><p className="mt-1 text-xs text-ink-muted">{mailbox.config?.email_address || mailbox.config?.from_email || mailbox.config?.smtp_user}</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase text-emerald-700">{mailbox.status}</span></div><div className="mt-4 grid grid-cols-2 gap-3 border-t border-surface-border pt-4 text-xs"><div><p className="text-ink-muted">Role</p><p className="mt-1 font-medium capitalize text-ink">{mailbox.config?.bot_role || 'support'}</p></div><div><p className="text-ink-muted">Reply policy</p><p className="mt-1 font-medium capitalize text-ink">{String(mailbox.config?.auto_reply_mode || 'safe_auto').replace(/_/g,' ')}</p></div><div><p className="text-ink-muted">Order lookup</p><p className="mt-1 font-medium text-ink">{String(mailbox.config?.allow_order_lookup ?? 'true') === 'false' ? 'Off' : 'On'}</p></div><div><p className="text-ink-muted">Bookings</p><p className="mt-1 font-medium text-ink">{String(mailbox.config?.allow_booking ?? 'true') === 'false' ? 'Off' : 'On'}</p></div></div></div>)}</div>}
                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5"><h3 className="text-sm font-semibold text-blue-950">How service email works</h3><p className="mt-1 text-xs leading-5 text-blue-900/75">Order-status requests use the native or connected order lookup first, verify the customer, and return only the requested details. Knowledge answers use this bot’s linked datasets. Complex or low-confidence messages become drafts or human handoffs according to the mailbox policy.</p></div>
              </div>
            )}

            {/* 3. BEHAVIOR & FLOW TAB */}
            {activeTab === 'behavior' && (
              <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                <div className="border-b border-surface-border pb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-ink">Behavior & Flow Rules</h2>
                    <p className="text-sm text-ink-secondary mt-1">Configure bot menus, data collection, business hours, and human handoff.</p>
                  </div>
                  <Link href={`/bots/${id}/flow`}>
                    <Button variant="outline" className="h-9 shadow-sm"><LayoutTemplate className="w-4 h-4 mr-2" /> Visual Builder</Button>
                  </Link>
                </div>

                <SupportAutomationConfig botId={id} />
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  {/* Left Column: Flow Configuration */}
                  <div className="space-y-8">
                    
                    {/* Greeting & Menu */}
                    <div className="bg-white border border-surface-border rounded-2xl shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-surface-border bg-surface-muted/30 flex items-center gap-2">
                        <MessageCircle className="w-4 h-4 text-accent" />
                        <h3 className="font-bold text-ink text-sm">Greeting & Main Menu</h3>
                      </div>
                      <div className="p-5 space-y-5">
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">First Message</Label>
                          <Textarea 
                            rows={3} 
                            value={flowSections.greeting} 
                            onChange={e => setFlowSections({...flowSections, greeting: e.target.value})}
                            className="text-sm bg-surface"
                          />
                        </div>
                        <div className="p-3 bg-surface rounded-xl border border-surface-border flex items-center justify-between text-xs">
                          <span className="text-ink-secondary font-medium">Conversational Lead Capture</span>
                          <span className="text-[11px] font-semibold text-accent">Configured below ({[flowSections.ask_whatsapp && 'WhatsApp', flowSections.ask_name && 'Name', flowSections.ask_email && 'Email'].filter(Boolean).join(', ') || 'None active'})</span>
                        </div>
                        <div className="space-y-3 pt-3 border-t border-surface-border">
                          <Label className="text-sm font-semibold">Quick Reply Buttons</Label>
                          <div className="space-y-2">
                            {flowSections.quick_replies.map((qr, i) => (
                              <div key={i} className="flex gap-2">
                                <Input value={qr.label} className="h-8 text-xs bg-surface" readOnly />
                                <Select value={qr.action}>
                                  <SelectTrigger className="w-[140px] h-8 text-xs bg-surface"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="topic">Route to Topic</SelectItem>
                                    <SelectItem value="mcp">Trigger Action</SelectItem>
                                    <SelectItem value="handoff">Talk to Human</SelectItem>
                                  </SelectContent>
                                </Select>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-ink-muted hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></Button>
                              </div>
                            ))}
                            <Button variant="outline" size="sm" className="w-full border-dashed h-8 text-xs"><Plus className="w-3 h-3 mr-1" /> Add Button</Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Topic Rules */}
                    <div className="bg-white border border-surface-border rounded-2xl shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-surface-border bg-surface-muted/30 flex items-center gap-2">
                        <Settings className="w-4 h-4 text-accent" />
                        <h3 className="font-bold text-ink text-sm">Explicit Topic Rules</h3>
                      </div>
                      <div className="p-5 space-y-4">
                        {flowSections.topics.map((t, i) => (
                          <div key={i} className="p-4 border border-surface-border rounded-xl bg-surface-muted/50 space-y-3">
                            <div className="space-y-1">
                              <Label className="text-xs uppercase tracking-wider text-ink-secondary">Keywords (comma separated)</Label>
                              <Input value={t.keywords} className="h-8 text-xs bg-white" readOnly />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs uppercase tracking-wider text-ink-secondary">Bot Response</Label>
                              <Textarea value={t.response} className="text-xs bg-white resize-none" rows={2} readOnly />
                            </div>
                            <label className="flex items-center gap-2 text-[11px] font-medium text-ink-secondary"><Switch checked={t.attach_kb} className="scale-75" /> Search KB for more detail</label>
                          </div>
                        ))}
                        <Button variant="outline" size="sm" className="w-full border-dashed h-8 text-xs"><Plus className="w-3 h-3 mr-1" /> Add Topic Rule</Button>
                      </div>
                    </div>

                    {/* Conversational Data Collection & Lead Capture */}
                    <div className="bg-white border border-surface-border rounded-2xl shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-surface-border bg-surface-muted/30 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-accent" />
                          <div>
                            <h3 className="font-bold text-ink text-sm">Conversational Lead Capture</h3>
                            <p className="text-[11px] text-ink-secondary">Weaves discount hooks & questions mid-chat to collect customer info directly into Contacts.</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="p-5 space-y-6">
                        {/* WhatsApp / Phone Number Hook */}
                        <div className={cn("p-4 border rounded-xl transition-all space-y-3", flowSections.ask_whatsapp ? "border-emerald-500/40 bg-emerald-50/20" : "border-surface-border bg-surface-muted/30")}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                                <Phone className="w-4 h-4" />
                              </div>
                              <div>
                                <span className="text-xs font-bold text-ink block">WhatsApp / Phone Number</span>
                                <span className="text-[10px] text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full inline-block font-semibold">Auto-synced to Contacts</span>
                              </div>
                            </div>
                            <Switch 
                              checked={flowSections.ask_whatsapp} 
                              onCheckedChange={v => setFlowSections({...flowSections, ask_whatsapp: v})} 
                            />
                          </div>
                          {flowSections.ask_whatsapp && (
                            <div className="space-y-1.5 pt-2 border-t border-emerald-500/20 animate-in fade-in duration-200">
                              <div className="flex items-center justify-between">
                                <Label className="text-[11px] font-semibold text-ink">Conversational Hook / Discount Offer</Label>
                                <span className="text-[10px] text-ink-muted">Asked mid-chat with discount incentive</span>
                              </div>
                              <Textarea 
                                rows={2}
                                value={flowSections.whatsapp_prompt || ''}
                                onChange={e => setFlowSections({...flowSections, whatsapp_prompt: e.target.value})}
                                placeholder="Want some extra discount maan? Put your WhatsApp number, I'll send you a coupon code!"
                                className="text-xs bg-white resize-none"
                              />
                              <p className="text-[10px] text-ink-secondary">
                                💡 The AI answers questions first, then naturally appends this hook. Captured numbers save to <code>contacts</code> table automatically.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Customer Name Ask */}
                        <div className={cn("p-4 border rounded-xl transition-all space-y-3", flowSections.ask_name ? "border-blue-500/40 bg-blue-50/20" : "border-surface-border bg-surface-muted/30")}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600">
                                <User className="w-4 h-4" />
                              </div>
                              <div>
                                <span className="text-xs font-bold text-ink block">Customer Name</span>
                                <span className="text-[10px] text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded-full inline-block font-semibold">Personalizes chat & profile</span>
                              </div>
                            </div>
                            <Switch 
                              checked={flowSections.ask_name} 
                              onCheckedChange={v => setFlowSections({...flowSections, ask_name: v})} 
                            />
                          </div>
                          {flowSections.ask_name && (
                            <div className="space-y-1.5 pt-2 border-t border-blue-500/20 animate-in fade-in duration-200">
                              <div className="flex items-center justify-between">
                                <Label className="text-[11px] font-semibold text-ink">Conversational Ask / Prompt</Label>
                                <span className="text-[10px] text-ink-muted">Asked warmly mid-chat</span>
                              </div>
                              <Textarea 
                                rows={2}
                                value={flowSections.name_prompt || ''}
                                onChange={e => setFlowSections({...flowSections, name_prompt: e.target.value})}
                                placeholder="By the way, who do I have the pleasure of speaking with?"
                                className="text-xs bg-white resize-none"
                              />
                              <p className="text-[10px] text-ink-secondary">
                                💡 When the visitor replies, the bot addresses them by name and updates their profile.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Customer Email Ask */}
                        <div className={cn("p-4 border rounded-xl transition-all space-y-3", flowSections.ask_email ? "border-rose-500/40 bg-rose-50/20" : "border-surface-border bg-surface-muted/30")}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-600">
                                <Mail className="w-4 h-4" />
                              </div>
                              <div>
                                <span className="text-xs font-bold text-ink block">Email Address</span>
                                <span className="text-[10px] text-rose-700 bg-rose-100/70 px-2 py-0.5 rounded-full inline-block font-semibold">VIP offers & updates</span>
                              </div>
                            </div>
                            <Switch 
                              checked={flowSections.ask_email} 
                              onCheckedChange={v => setFlowSections({...flowSections, ask_email: v})} 
                            />
                          </div>
                          {flowSections.ask_email && (
                            <div className="space-y-1.5 pt-2 border-t border-rose-500/20 animate-in fade-in duration-200">
                              <div className="flex items-center justify-between">
                                <Label className="text-[11px] font-semibold text-ink">Conversational Ask / VIP Prompt</Label>
                                <span className="text-[10px] text-ink-muted">Offer or updates hook</span>
                              </div>
                              <Textarea 
                                rows={2}
                                value={flowSections.email_prompt || ''}
                                onChange={e => setFlowSections({...flowSections, email_prompt: e.target.value})}
                                placeholder="I'll add you to our VIP list for exclusive offers, what's your email ID?"
                                className="text-xs bg-white resize-none"
                              />
                              <p className="text-[10px] text-ink-secondary">
                                💡 The bot asks for their email for special updates or VIP deals without being pushy.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Custom Data Collection Points */}
                        <div className="pt-4 border-t border-surface-border space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Database className="w-3.5 h-3.5 text-accent" />
                              <h4 className="text-xs font-bold text-ink">Custom Data Collection Points</h4>
                            </div>
                            <Select onValueChange={(v) => {
                              if (v === 'lead') {
                                setFlowSections(prev => ({
                                  ...prev,
                                  data_collection: [
                                    ...prev.data_collection,
                                    { id: Date.now().toString(), question: "What is your company name?", type: 'text', variable: 'company_name', required: false }
                                  ]
                                }))
                                toast.success('Added Company Name collection point')
                              } else if (v === 'intent') {
                                setFlowSections(prev => ({
                                  ...prev,
                                  data_collection: [
                                    ...prev.data_collection,
                                    { id: Date.now().toString(), question: "What's your estimated budget?", type: 'multiple_choice', variable: 'budget', required: false }
                                  ]
                                }))
                                toast.success('Added Budget Qualifier collection point')
                              } else if (v === 'csat') {
                                setFlowSections(prev => ({
                                  ...prev,
                                  data_collection: [
                                    ...prev.data_collection,
                                    { id: Date.now().toString(), question: "How would you rate our assistance today (1-5)?", type: 'number', variable: 'csat_score', required: false }
                                  ]
                                }))
                                toast.success('Added CSAT Rating collection point')
                              }
                            }}>
                              <SelectTrigger className="h-7 w-[150px] text-[11px] bg-white"><SelectValue placeholder="Add from Template" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="lead">B2B Company</SelectItem>
                                <SelectItem value="intent">Purchase Intent</SelectItem>
                                <SelectItem value="csat">Customer Satisfaction</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {flowSections.data_collection.map((dc, i) => (
                            <div key={dc.id || i} className="p-3.5 border border-surface-border rounded-xl bg-surface-muted/40 space-y-3 relative group">
                              <Button 
                                variant="ghost" size="icon" 
                                className="absolute top-2 right-2 text-ink-muted hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity w-6 h-6"
                                onClick={() => {
                                  const newDc = flowSections.data_collection.filter((_, idx) => idx !== i)
                                  setFlowSections({...flowSections, data_collection: newDc})
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>

                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase tracking-wider text-ink-secondary">Question to ask</Label>
                                <Input 
                                  value={dc.question} 
                                  onChange={e => {
                                    const newDc = [...flowSections.data_collection]
                                    newDc[i].question = e.target.value
                                    setFlowSections({...flowSections, data_collection: newDc})
                                  }} 
                                  placeholder="e.g. What's your budget range?" 
                                  className="h-8 text-xs bg-white" 
                                />
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-[10px] uppercase tracking-wider text-ink-secondary">Data Type</Label>
                                  <Select 
                                    value={dc.type} 
                                    onValueChange={v => {
                                      const newDc = [...flowSections.data_collection]
                                      newDc[i].type = v
                                      setFlowSections({...flowSections, data_collection: newDc})
                                    }}
                                  >
                                    <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="text">Text</SelectItem>
                                      <SelectItem value="email">Email</SelectItem>
                                      <SelectItem value="phone">Phone</SelectItem>
                                      <SelectItem value="number">Number</SelectItem>
                                      <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
                                      <SelectItem value="date">Date</SelectItem>
                                      <SelectItem value="boolean">Yes / No</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] uppercase tracking-wider text-ink-secondary">Variable Name</Label>
                                  <Input 
                                    value={dc.variable} 
                                    onChange={e => {
                                      const newDc = [...flowSections.data_collection]
                                      newDc[i].variable = e.target.value
                                      setFlowSections({...flowSections, data_collection: newDc})
                                    }} 
                                    placeholder="e.g. budget_range" 
                                    className="h-8 text-xs bg-white font-mono" 
                                  />
                                </div>
                              </div>

                              <div className="flex items-center gap-4 pt-2 border-t border-surface-border">
                                <label className="flex items-center gap-2 text-[11px] font-medium text-ink">
                                  <Switch 
                                    checked={dc.required} 
                                    onCheckedChange={v => {
                                      const newDc = [...flowSections.data_collection]
                                      newDc[i].required = v
                                      setFlowSections({...flowSections, data_collection: newDc})
                                    }} 
                                    className="scale-75" 
                                  /> 
                                  Required
                                </label>
                              </div>
                            </div>
                          ))}

                          <Button 
                            variant="outline" size="sm" 
                            className="w-full border-dashed h-8 text-xs" 
                            onClick={() => {
                              setFlowSections({
                                ...flowSections,
                                data_collection: [
                                  ...flowSections.data_collection, 
                                  { id: Date.now().toString(), question: '', type: 'text', variable: '', required: false }
                                ]
                              })
                            }}
                          >
                            <Plus className="w-3 h-3 mr-1" /> Add Custom Field
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Handoff & Config */}
                  <div className="space-y-8">
                    
                    {/* Handoff Rules */}
                    <div className="bg-white border border-surface-border rounded-2xl shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-surface-border bg-surface-muted/30 flex items-center gap-2">
                        <Users className="w-4 h-4 text-amber-500" />
                        <h3 className="font-bold text-ink text-sm">Human Handoff Rules</h3>
                      </div>
                      <div className="p-5 space-y-6">
                        <div className="space-y-3">
                          <Label className="text-sm font-semibold flex justify-between">Confidence Threshold <span className="text-accent">{Math.round(form.confidence_threshold * 100)}%</span></Label>
                          <input 
                            type="range" min="0" max="1" step="0.1"
                            className="w-full accent-accent cursor-pointer" 
                            value={form.confidence_threshold}
                            onChange={e => setForm({...form, confidence_threshold: parseFloat(e.target.value)})}
                          />
                          <p className="text-[11px] text-ink-muted">Hand off if bot's answer confidence drops below this.</p>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold">Max Turns</Label>
                            <Input type="number" value={form.max_turns} onChange={e => setForm({...form, max_turns: parseInt(e.target.value)})} className="h-9" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold">Auto-Close (Mins)</Label>
                            <Input type="number" value={form.auto_close_timeout} onChange={e => setForm({...form, auto_close_timeout: parseInt(e.target.value)})} className="h-9" />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">Routing Target</Label>
                          <Select value={form.handoff_target} onValueChange={v => setForm({...form, handoff_target: v})}>
                            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Any Available Agent</SelectItem>
                              <SelectItem value="department">Specific Department</SelectItem>
                              <SelectItem value="round_robin">Round Robin</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">Handoff Message</Label>
                          <Textarea rows={2} className="resize-none text-sm" value={form.handoff_message} onChange={e => setForm({...form, handoff_message: e.target.value})} />
                        </div>
                        
                        <div className="flex gap-6 pt-2 border-t border-surface-border">
                          <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={form.notify_email} onCheckedChange={v => setForm({...form, notify_email: v})} /> Email Alert</label>
                          <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={form.notify_slack} onCheckedChange={v => setForm({...form, notify_slack: v})} /> Slack Alert</label>
                        </div>
                      </div>
                    </div>

                    {/* Photo Upload & Vision AI Configuration */}
                    <div className="bg-white border border-surface-border rounded-2xl shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-surface-border bg-surface-muted/30 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Camera className="w-4 h-4 text-accent" />
                          <div>
                            <h3 className="font-bold text-ink text-sm">Photo Upload & Vision AI</h3>
                            <p className="text-[11px] text-ink-secondary">Allow visitors to attach photos and let the AI analyze images in chat.</p>
                          </div>
                        </div>
                        <Switch 
                          checked={form.photo_upload_enabled} 
                          onCheckedChange={v => setForm({
                            ...form, 
                            photo_upload_enabled: v,
                            vision_ai_enabled: v ? form.vision_ai_enabled : false
                          })} 
                        />
                      </div>
                      
                      {form.photo_upload_enabled && (
                        <div className="p-5 space-y-4 animate-in fade-in duration-200">
                          <div className={cn(
                            "p-4 border rounded-xl transition-all space-y-2",
                            form.vision_ai_enabled ? "border-purple-500/40 bg-purple-50/20" : "border-surface-border bg-surface-muted/30"
                          )}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-600">
                                  <Sparkles className="w-4 h-4" />
                                </div>
                                <div>
                                  <span className="text-xs font-bold text-ink block">Vision AI Intelligence</span>
                                  <span className="text-[10px] text-purple-700 bg-purple-100/70 px-2 py-0.5 rounded-full inline-block font-semibold">
                                    Multimodal Image Understanding
                                  </span>
                                </div>
                              </div>
                              <Switch 
                                checked={form.vision_ai_enabled} 
                                onCheckedChange={v => setForm({ ...form, vision_ai_enabled: v })} 
                              />
                            </div>
                            <p className="text-[11px] text-ink-secondary mt-1">
                              {form.vision_ai_enabled ? (
                                <span>
                                  ✨ <strong>Vision AI is ON:</strong> The AI inspects and analyzes the photo content directly in real-time, reading product labels, error screenshots, receipts, or items to give instant smart answers.
                                </span>
                              ) : (
                                <span>
                                  ℹ️ <strong>Vision AI is OFF:</strong> Photos are saved to the conversation and visible to human agents in the Inbox, but the AI responds to text only.
                                </span>
                              )}
                            </p>
                          </div>

                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 space-y-1">
                            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                              <span>🛡️ Privacy & Performance Floor:</span>
                            </div>
                            <p>• EXIF GPS/device metadata stripped server-side before storage.</p>
                            <p>• Optimized 1024px WebP compression for sub-second responses and low token overhead.</p>
                            <p>• 5 image attachments per session rate limit.</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Business Hours */}
                    <div className="bg-white border border-surface-border rounded-2xl shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-surface-border bg-surface-muted/30 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-blue-500" />
                          <h3 className="font-bold text-ink text-sm">Business Hours</h3>
                        </div>
                        <Switch checked={form.enable_business_hours} onCheckedChange={v => setForm({...form, enable_business_hours: v})} />
                      </div>
                      {form.enable_business_hours && (
                        <div className="p-5 space-y-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold">Out of hours behavior</Label>
                            <Select value={form.out_of_hours_behavior} onValueChange={v => setForm({...form, out_of_hours_behavior: v})}>
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="queue">Queue for Human</SelectItem>
                                <SelectItem value="bot_only">Bot Handles Entirely</SelectItem>
                                <SelectItem value="ticket">Create Ticket</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold">Offline Message</Label>
                            <Textarea rows={2} className="resize-none text-sm" value={form.out_of_hours_message} onChange={e => setForm({...form, out_of_hours_message: e.target.value})} />
                          </div>
                          <Button variant="link" className="px-0 h-auto text-xs text-accent">Configure Schedule in Workspace Settings →</Button>
                        </div>
                      )}
                    </div>

                    {/* Bot-to-Bot Routing */}
                    <div className="bg-white border border-surface-border rounded-2xl shadow-sm overflow-hidden">
                      <div className="p-4 border-b border-surface-border bg-surface-muted/30 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Bot className="w-4 h-4 text-purple-500" />
                          <h3 className="font-bold text-ink text-sm">Bot-to-Bot Routing</h3>
                        </div>
                      </div>
                      <div className="p-5 space-y-4">
                        <p className="text-xs text-ink-secondary">
                          Automatically redirect customers to another specialized bot (e.g. Sales to Support) when specific intents are detected.
                        </p>
                        
                        <div className="space-y-3">
                          {botRoutingRules.map((rule, i) => (
                            <div key={rule.id || i} className="p-3 border border-surface-border bg-surface-muted/30 rounded-xl space-y-3 relative group">
                              <Button 
                                variant="ghost" size="icon" 
                                className="absolute top-2 right-2 w-6 h-6 text-ink-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => setBotRoutingRules(botRoutingRules.filter((_, idx) => idx !== i))}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                              
                              <div className="space-y-1 pr-6">
                                <Label className="text-[10px] uppercase tracking-wider text-ink-muted font-bold">If intent detected</Label>
                                <Input 
                                  placeholder="e.g. Return, Replacement, Status" 
                                  className="h-8 text-xs bg-white" 
                                  value={rule.intent}
                                  onChange={e => {
                                    const newRules = [...botRoutingRules]
                                    newRules[i].intent = e.target.value
                                    setBotRoutingRules(newRules)
                                  }}
                                />
                              </div>
                              
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-[10px] uppercase tracking-wider text-ink-muted font-bold">Route to Bot</Label>
                                  <Select 
                                    value={rule.target_bot_id}
                                    onValueChange={v => {
                                      const newRules = [...botRoutingRules]
                                      newRules[i].target_bot_id = v
                                      setBotRoutingRules(newRules)
                                    }}
                                  >
                                    <SelectTrigger className="h-8 text-xs bg-white">
                                      <SelectValue placeholder="Select bot..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {workspaceBots.length === 0 ? (
                                        <SelectItem value="none" disabled>No other bots found</SelectItem>
                                      ) : (
                                        workspaceBots.map(b => (
                                          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-[10px] uppercase tracking-wider text-ink-muted font-bold">Button Label</Label>
                                  <Input 
                                    placeholder="e.g. Talk to Support" 
                                    className="h-8 text-xs bg-white" 
                                    value={rule.button_label}
                                    onChange={e => {
                                      const newRules = [...botRoutingRules]
                                      newRules[i].button_label = e.target.value
                                      setBotRoutingRules(newRules)
                                    }}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        <Button 
                          variant="outline" size="sm" 
                          className="w-full h-8 text-xs border-dashed"
                          onClick={() => setBotRoutingRules([...botRoutingRules, { id: Date.now().toString(), intent: '', target_bot_id: '', button_label: '' }])}
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" /> Add Routing Rule
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Timed Follow-up Popups & Nudges Manager (Webchat Only) */}
                {isWebBot && (
                  <div className="pt-8 border-t border-surface-border">
                    <TimedPopupsManager
                      popups={timedPopups}
                      onChange={setTimedPopups}
                      themeColor={form.theme_color}
                      botName={form.name}
                    />
                  </div>
                )}
              </div>
            )}

            {/* 5. PROACTIVE TRIGGERS TAB */}
            {activeTab === 'proactive' && (
              <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                <TriggersTab botId={id} clientId={bot?.client_id || contextId || ''} botChannel={form.channel || 'web'} />
              </div>
            )}

            {/* 6. MCP ACTIONS TAB */}
            {activeTab === 'mcp' && (
              <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                <div className="border-b border-surface-border pb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-ink">MCP Actions (Functions)</h2>
                    <p className="text-sm text-ink-secondary mt-1">Empower your bot to fetch data or trigger external actions (e.g. check order status, create tickets) via Webhooks.</p>
                  </div>
                  <Button className="bg-ink hover:bg-ink-secondary text-white h-9 shadow-sm">
                    <Plus className="w-4 h-4 mr-2" /> Add Action
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {mcpActions.map(action => (
                    <div key={action.id} className="bg-white border border-surface-border rounded-2xl shadow-sm overflow-hidden group">
                      <div className="p-5 border-b border-surface-border bg-surface-muted/30 flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-600 flex items-center justify-center shadow-inner">
                            <Webhook className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-ink">{action.name}</h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded shadow-sm">{action.method}</span>
                              <span className="text-[11px] text-ink-secondary font-mono bg-surface px-1.5 py-0.5 rounded border border-surface-border">{action.endpoint}</span>
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-ink-muted hover:text-ink"><Settings className="w-4 h-4" /></Button>
                      </div>
                      <div className="p-5 space-y-4">
                        <div>
                          <Label className="text-[11px] uppercase tracking-wider text-ink-secondary font-bold">Bot Prompt Context</Label>
                          <p className="text-sm text-ink bg-surface border border-surface-border p-3 rounded-xl mt-2 leading-relaxed shadow-sm">{action.description}</p>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <Button variant="outline" size="sm" className="h-8 text-xs font-semibold shadow-sm w-full border-surface-border hover:border-accent hover:text-accent"><Search className="w-3.5 h-3.5 mr-2" /> Test Payload</Button>
                          <Button variant="outline" size="sm" className="h-8 w-8 px-0 text-red-600 hover:text-red-700 hover:bg-red-50 border-surface-border shrink-0"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 7. APPEARANCE & INTEGRATION TAB */}
            {activeTab === 'appearance' && (
              <div className="space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                <div className="border-b border-surface-border pb-5">
                  <h2 className="text-xl font-bold text-ink">Appearance & Integration</h2>
                  <p className="text-sm text-ink-secondary mt-1">Customize the Webchat Widget and get the installation javascript snippet.</p>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                  <div className="space-y-8">
                    
                    {/* Widget Styling */}
                    <div className="bg-white border border-surface-border rounded-2xl shadow-sm p-6 space-y-6">
                      <h3 className="font-bold text-ink text-sm flex items-center gap-2"><Sliders className="w-4 h-4 text-accent" /> Widget Customization</h3>
                      
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">Widget Title</Label>
                          <Input value={form.widget_title} onChange={e => setForm({...form, widget_title: e.target.value})} className="h-10 bg-surface shadow-sm" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-semibold">Theme Color (Hex)</Label>
                          <div className="flex gap-2 h-10">
                            <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-surface-border shadow-inner shrink-0">
                              <input 
                                type="color" 
                                value={form.theme_color} 
                                onChange={e => setForm({...form, theme_color: e.target.value})}
                                className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer border-0" 
                              />
                            </div>
                            <Input value={form.theme_color} onChange={e => setForm({...form, theme_color: e.target.value})} className="font-mono uppercase h-10 flex-1 bg-surface shadow-sm" />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-semibold">Fallback Welcome Message</Label>
                        <Textarea 
                          rows={3} 
                          className="resize-none text-sm bg-surface shadow-sm"
                          value={form.welcome_message}
                          onChange={e => setForm({...form, welcome_message: e.target.value})}
                        />
                        <p className="text-[11px] text-ink-muted">Used if no dynamic opening message is triggered.</p>
                      </div>

                      {/* Photo Upload & Camera Feature Toggle */}
                      <div className="pt-2 border-t border-surface-border">
                        <div className="flex items-center justify-between p-3 rounded-xl bg-surface border border-surface-border">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                              <Camera className="w-4 h-4" />
                            </div>
                            <div>
                              <Label className="text-xs font-bold text-ink cursor-pointer">Photo Upload (Camera Icon)</Label>
                              <p className="text-[11px] text-ink-muted">Show camera attachment icon in the chatbox input bar.</p>
                            </div>
                          </div>
                          <Switch 
                            checked={form.photo_upload_enabled} 
                            onCheckedChange={v => setForm({
                              ...form, 
                              photo_upload_enabled: v,
                              vision_ai_enabled: v ? form.vision_ai_enabled : false
                            })} 
                          />
                        </div>
                      </div>
                    </div>

                    {/* Javascript Script integration */}
                    <div className="bg-gradient-to-br from-[#111] to-[#1a1a1a] p-6 rounded-2xl shadow-xl relative overflow-hidden group border border-white/10">
                      <div className="absolute -top-20 -right-20 w-40 h-40 bg-accent/20 blur-[50px] rounded-full" />
                      <div className="relative z-10">
                        <h3 className="font-bold text-white text-sm flex items-center gap-2 mb-2"><Globe className="w-4 h-4 text-[#22c55e]" /> Web Installation Snippet</h3>
                        <p className="text-xs text-white/60 mb-5">Paste this code right before the <code className="text-[#22c55e]">&lt;/body&gt;</code> tag on your website to deploy the widget.</p>
                        
                        <div className="space-y-3">
                          <div>
                            <div className="text-[11px] font-semibold text-white/80 mb-1 flex items-center justify-between">
                              <span>Embed Script Tag</span>
                              <span className="text-[10px] text-emerald-400 font-mono">Recommended</span>
                            </div>
                            <div className="bg-[#000] p-4 rounded-xl border border-white/5 relative">
                              <pre className="text-[11px] font-mono text-[#a3a3a3] overflow-x-auto whitespace-pre-wrap leading-relaxed">
{`<script src="${window.location.origin}/widget.js?v=8" data-ctx="${contextId || bot?.client_id || ''}" data-bot="${id}" defer></script>`}
                              </pre>
                              <button
                                onClick={() => {
                                  const code = `<script src="${window.location.origin}/widget.js?v=8" data-ctx="${contextId || bot?.client_id || ''}" data-bot="${id}" defer></script>`
                                  navigator.clipboard.writeText(code)
                                  toast.success('Script snippet copied!')
                                }}
                                className="absolute top-3 right-3 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg shadow-sm transition-colors text-white text-xs font-semibold flex items-center gap-2"
                              >
                                <Copy className="w-3 h-3" /> Copy
                              </button>
                            </div>
                          </div>

                          <div>
                            <div className="text-[11px] font-semibold text-white/80 mb-1 flex items-center justify-between">
                              <span>Direct Web Widget Link</span>
                              <span className="text-[10px] text-white/50 font-mono">Standalone URL</span>
                            </div>
                            <div className="bg-[#000] p-4 rounded-xl border border-white/5 relative">
                              <pre className="text-[11px] font-mono text-[#a3a3a3] overflow-x-auto whitespace-pre-wrap leading-relaxed">
{`${window.location.origin}/widget?bot=${id}&ctx=${contextId || bot?.client_id || ''}`}
                              </pre>
                              <button
                                onClick={() => {
                                  const url = `${window.location.origin}/widget?bot=${id}&ctx=${contextId || bot?.client_id || ''}`
                                  navigator.clipboard.writeText(url)
                                  toast.success('Direct widget link copied!')
                                }}
                                className="absolute top-3 right-3 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg shadow-sm transition-colors text-white text-xs font-semibold flex items-center gap-2"
                              >
                                <Copy className="w-3 h-3" /> Copy Link
                              </button>
                            </div>
                          </div>

                          <div>
                            <div className="text-[11px] font-semibold text-white/80 mb-1 flex items-center justify-between">
                              <span>Client Website Iframe Snippet</span>
                              <span className="text-[10px] text-emerald-400 font-mono">HTML Iframe</span>
                            </div>
                            <div className="bg-[#000] p-4 rounded-xl border border-white/5 relative">
                              <pre className="text-[11px] font-mono text-[#a3a3a3] overflow-x-auto whitespace-pre-wrap leading-relaxed">
{`<iframe src="${window.location.origin}/widget?bot=${id}&ctx=${contextId || bot?.client_id || ''}&iframe=true" width="432" height="720" style="border:none;border-radius:28px;box-shadow:0 24px 80px rgba(0,0,0,0.14);" allow="camera;microphone"></iframe>`}
                              </pre>
                              <button
                                onClick={() => {
                                  const code = `<iframe src="${window.location.origin}/widget?bot=${id}&ctx=${contextId || bot?.client_id || ''}&iframe=true" width="432" height="720" style="border:none;border-radius:28px;box-shadow:0 24px 80px rgba(0,0,0,0.14);" allow="camera;microphone"></iframe>`
                                  navigator.clipboard.writeText(code)
                                  toast.success('Iframe snippet copied!')
                                }}
                                className="absolute top-3 right-3 px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-lg shadow-sm transition-colors text-white text-xs font-semibold flex items-center gap-2"
                              >
                                <Copy className="w-3 h-3" /> Copy Iframe
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="text-center mt-3 flex items-center justify-center gap-1">
                           <span className="text-[9px] font-bold uppercase tracking-widest text-ink-muted">Powered by</span>
                           <Zap className="w-3 h-3 text-accent" />
                           <span className="text-[9px] font-bold uppercase tracking-widest text-ink-muted">Vittain AI</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Widget Preview Box */}
                  <div className="relative h-full min-h-[620px] flex flex-col items-center justify-center p-6 bg-surface border border-surface-border rounded-3xl shadow-inner">
                    <div className="absolute top-4 left-4 flex gap-2 items-center text-xs font-bold text-ink-muted uppercase tracking-widest">
                      <Search className="w-3 h-3" /> Live Frosted Glass Preview
                    </div>
                    
                    <div className="w-full max-w-[440px] pt-4">
                      <ChatWidget
                        mode="embedded"
                        botId={id as string}
                        contextId={contextId || bot?.client_id || ''}
                        initialOpen={true}
                        photoUploadEnabled={form.photo_upload_enabled}
                      />
                    </div>
                  </div>
                </div>

                {/* ─── DEVELOPER CART & STORE TRACKING GUIDE ─── */}
                <div className="bg-white border border-surface-border rounded-2xl shadow-sm p-6 sm:p-8 space-y-6 mt-8">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-border pb-5">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center text-accent">
                          <ShoppingCart className="w-4 h-4" />
                        </div>
                        <h3 className="font-bold text-ink text-base">Store & Cart Tracking Developer Guide</h3>
                      </div>
                      <p className="text-xs text-ink-secondary mt-1 max-w-2xl">
                        Provide this guide and ready-to-copy code snippets to your developer. Once installed, your website will stream cart updates to Vittain in real time to trigger dynamic upsells, discount unlocks, and cart abandonment campaigns.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Realtime Ready
                      </span>
                    </div>
                  </div>

                  {/* Snippet Tabs */}
                  <div className="flex flex-wrap gap-2 border-b border-surface-border pb-3">
                    {[
                      { id: 'cart', label: '🛒 Cart Updated (Upsell Triggers)', badge: 'Essential' },
                      { id: 'shopify', label: '🛍️ Shopify (theme.liquid & Auto Ajax)', badge: '1-Click' },
                      { id: 'base', label: '🔌 Universal Tracker Script', badge: 'Base' },
                      { id: 'product', label: '👁️ Product Viewed', badge: 'Optional' },
                      { id: 'purchase', label: '💳 Purchase Completed', badge: 'Conversion' },
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setTrackingSnippetTab(tab.id as any)}
                        className={cn(
                          "px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2",
                          trackingSnippetTab === tab.id
                            ? "bg-ink text-white shadow-sm"
                            : "bg-surface text-ink-secondary hover:text-ink hover:bg-surface-border/50"
                        )}
                      >
                        <span>{tab.label}</span>
                        {tab.badge && (
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-medium",
                            trackingSnippetTab === tab.id
                              ? "bg-white/20 text-white"
                              : "bg-surface-border text-ink-muted"
                          )}>
                            {tab.badge}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Tab 1: Cart Updated */}
                  {trackingSnippetTab === 'cart' && (
                    <div className="space-y-4 animate-in fade-in-50 duration-200">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-ink">Track Cart Modifications</h4>
                          <p className="text-xs text-ink-secondary">
                            Trigger this JavaScript call whenever the customer adds, updates, or removes an item from their cart or basket.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1.5 self-start sm:self-auto"
                          onClick={() => {
                            const code = `// Vittain Cart Tracking Event
window.vittain && window.vittain('track', 'cart_updated', {
  value: 1499.00,        // Total cart amount (number)
  currency: 'INR',       // ISO currency code
  cart_id: 'cart_\${Date.now()}', // Optional unique cart ID
  items: [
    {
      product_id: 'p_101',
      name: 'Wireless Noise-Canceling Headphones',
      price: 1499.00,
      quantity: 1
    }
  ]
});`
                            navigator.clipboard.writeText(code)
                            toast.success('Cart tracking snippet copied!')
                          }}
                        >
                          <Copy className="w-3.5 h-3.5" /> Copy Code
                        </Button>
                      </div>

                      <div className="bg-[#0f172a] text-slate-100 p-4 rounded-xl border border-slate-800 font-mono text-xs overflow-x-auto">
                        <pre className="text-emerald-400 font-semibold mb-1 text-[11px]">// Run this in your store's addToCart callback or AJAX cart updater:</pre>
                        <pre className="text-slate-200 whitespace-pre leading-relaxed">{`window.vittain && window.vittain('track', 'cart_updated', {
  value: 1499.00,        // Current total basket amount (number)
  currency: 'INR',       // ISO currency code (e.g. 'INR', 'USD', 'EUR')
  cart_id: 'cart_xyz',   // Optional cart token or session ID
  items: [
    {
      product_id: 'p_101',
      name: 'Wireless Noise-Canceling Headphones',
      price: 1499.00,
      quantity: 1
    }
  ]
});`}</pre>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                        <div className="p-3 bg-surface rounded-xl border border-surface-border text-xs space-y-1">
                          <span className="font-bold text-ink flex items-center gap-1.5">⚡ Instant Upsells</span>
                          <p className="text-ink-secondary text-[11px]">When cart crosses configured thresholds (e.g. ₹1,500), the bot pops dynamic discount callouts.</p>
                        </div>
                        <div className="p-3 bg-surface rounded-xl border border-surface-border text-xs space-y-1">
                          <span className="font-bold text-ink flex items-center gap-1.5">🎯 Missing Gap Math</span>
                          <p className="text-ink-secondary text-[11px]">Automatically replaces <code className="bg-white px-1 py-0.5 rounded border border-surface-border text-accent font-semibold">{"{{missing_amount}}"}</code> with the remaining ₹ needed.</p>
                        </div>
                        <div className="p-3 bg-surface rounded-xl border border-surface-border text-xs space-y-1">
                          <span className="font-bold text-ink flex items-center gap-1.5">📱 Abandoned Cart Save</span>
                          <p className="text-ink-secondary text-[11px]">If the shopper leaves without checking out, stores their basket for automated WhatsApp campaigns.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Tab 2: Shopify */}
                  {trackingSnippetTab === 'shopify' && (
                    <div className="space-y-4 animate-in fade-in-50 duration-200">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-ink">Shopify Auto-Cart Interceptor</h4>
                          <p className="text-xs text-ink-secondary">
                            Paste this single block into your Shopify <code className="font-semibold text-accent">theme.liquid</code> before <code className="font-semibold text-accent">&lt;/body&gt;</code>. It automatically intercepts all cart clicks.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1.5 self-start sm:self-auto"
                          onClick={() => {
                            const origin = typeof window !== 'undefined' ? window.location.origin : 'https://vittain.ai'
                            const cid = contextId || bot?.client_id || ''
                            const code = `<!-- Vittain Universal Tracker & Shopify Auto-Cart Interceptor -->
<script src="${origin}/tracker.js" data-client-id="${cid}" defer></script>
<script>
(function() {
  function syncShopifyCart() {
    fetch('/cart.js')
      .then(function(res) { return res.json(); })
      .then(function(cart) {
        if (window.vittain) {
          window.vittain('track', 'cart_updated', {
            value: cart.total_price / 100,
            currency: cart.currency,
            cart_id: cart.token,
            items: (cart.items || []).map(function(item) {
              return {
                product_id: String(item.product_id),
                name: item.title,
                price: item.price / 100,
                quantity: item.quantity
              };
            })
          });
        }
      }).catch(function(e) {});
  }
  var origFetch = window.fetch;
  window.fetch = function() {
    var args = arguments;
    return origFetch.apply(this, args).then(function(res) {
      var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      if (url.indexOf('/cart/add') !== -1 || url.indexOf('/cart/change') !== -1 || url.indexOf('/cart/update') !== -1) {
        setTimeout(syncShopifyCart, 400);
      }
      return res;
    });
  };
  document.addEventListener('DOMContentLoaded', syncShopifyCart);
})();
</script>`
                            navigator.clipboard.writeText(code)
                            toast.success('Shopify auto-cart code copied!')
                          }}
                        >
                          <Copy className="w-3.5 h-3.5" /> Copy Shopify Snippet
                        </Button>
                      </div>

                      <div className="bg-[#0f172a] text-slate-100 p-4 rounded-xl border border-slate-800 font-mono text-xs overflow-x-auto">
                        <pre className="text-emerald-400 font-semibold mb-1 text-[11px]">&lt;!-- Paste in Shopify theme.liquid before &lt;/body&gt; --&gt;</pre>
                        <pre className="text-slate-200 whitespace-pre leading-relaxed">{`<!-- Vittain Universal Tracker & Shopify Auto-Cart Interceptor -->
<script src="${typeof window !== 'undefined' ? window.location.origin : 'https://vittain.ai'}/tracker.js" data-client-id="${contextId || bot?.client_id || ''}" defer></script>
<script>
(function() {
  function syncShopifyCart() {
    fetch('/cart.js')
      .then(function(res) { return res.json(); })
      .then(function(cart) {
        if (window.vittain) {
          window.vittain('track', 'cart_updated', {
            value: cart.total_price / 100,
            currency: cart.currency,
            cart_id: cart.token,
            items: (cart.items || []).map(function(item) {
              return {
                product_id: String(item.product_id),
                name: item.title,
                price: item.price / 100,
                quantity: item.quantity
              };
            })
          });
        }
      }).catch(function(e) {});
  }
  var origFetch = window.fetch;
  window.fetch = function() {
    var args = arguments;
    return origFetch.apply(this, args).then(function(res) {
      var url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      if (url.indexOf('/cart/add') !== -1 || url.indexOf('/cart/change') !== -1 || url.indexOf('/cart/update') !== -1) {
        setTimeout(syncShopifyCart, 400);
      }
      return res;
    });
  };
  document.addEventListener('DOMContentLoaded', syncShopifyCart);
})();
</script>`}</pre>
                      </div>

                      <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl text-xs text-blue-900 space-y-1.5">
                        <div className="font-bold flex items-center gap-1.5">
                          <span>🚀 Platform Native Shopify Webhook Option</span>
                        </div>
                        <p className="text-[11px] leading-relaxed">
                          For zero-theme editing, you can also subscribe to Shopify Admin Webhooks at:
                          <code className="bg-white/80 px-1.5 py-0.5 rounded font-mono text-[11px] ml-1 font-semibold text-blue-800">
                            {typeof window !== 'undefined' ? window.location.origin : 'https://vittain.ai'}/api/integrations/shopify/webhook
                          </code>
                          (Topics: <code className="font-semibold">carts/update</code>, <code className="font-semibold">checkouts/create</code>).
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Tab 3: Base Script */}
                  {trackingSnippetTab === 'base' && (
                    <div className="space-y-4 animate-in fade-in-50 duration-200">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-ink">Universal Tracker Script Tag</h4>
                          <p className="text-xs text-ink-secondary">
                            Required on all pages to enable <code className="text-accent font-semibold">window.vittain('track', ...)</code> and automatic page visit logging.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1.5 self-start sm:self-auto"
                          onClick={() => {
                            const origin = typeof window !== 'undefined' ? window.location.origin : 'https://vittain.ai'
                            const cid = contextId || bot?.client_id || ''
                            const code = `<script src="${origin}/tracker.js" data-client-id="${cid}" defer></script>`
                            navigator.clipboard.writeText(code)
                            toast.success('Tracker script copied!')
                          }}
                        >
                          <Copy className="w-3.5 h-3.5" /> Copy Script Tag
                        </Button>
                      </div>

                      <div className="bg-[#0f172a] text-slate-100 p-4 rounded-xl border border-slate-800 font-mono text-xs overflow-x-auto">
                        <pre className="text-slate-200 whitespace-pre leading-relaxed">{`<script src="${typeof window !== 'undefined' ? window.location.origin : 'https://vittain.ai'}/tracker.js" data-client-id="${contextId || bot?.client_id || ''}" defer></script>`}</pre>
                      </div>
                    </div>
                  )}

                  {/* Tab 4: Product Viewed */}
                  {trackingSnippetTab === 'product' && (
                    <div className="space-y-4 animate-in fade-in-50 duration-200">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-ink">Product Detail View Tracking</h4>
                          <p className="text-xs text-ink-secondary">
                            Trigger when a visitor views a specific product to power personalized greetings or recommendations.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1.5 self-start sm:self-auto"
                          onClick={() => {
                            const code = `window.vittain && window.vittain('track', 'product_viewed', {
  product_id: 'p_101',
  name: 'Wireless Noise-Canceling Headphones',
  price: 1499.00,
  category: 'Audio',
  currency: 'INR'
});`
                            navigator.clipboard.writeText(code)
                            toast.success('Product tracking snippet copied!')
                          }}
                        >
                          <Copy className="w-3.5 h-3.5" /> Copy Code
                        </Button>
                      </div>

                      <div className="bg-[#0f172a] text-slate-100 p-4 rounded-xl border border-slate-800 font-mono text-xs overflow-x-auto">
                        <pre className="text-slate-200 whitespace-pre leading-relaxed">{`window.vittain && window.vittain('track', 'product_viewed', {
  product_id: 'p_101',
  name: 'Wireless Noise-Canceling Headphones',
  price: 1499.00,
  category: 'Audio',
  currency: 'INR'
});`}</pre>
                      </div>
                    </div>
                  )}

                  {/* Tab 5: Purchase Completed */}
                  {trackingSnippetTab === 'purchase' && (
                    <div className="space-y-4 animate-in fade-in-50 duration-200">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-bold text-ink">Order Confirmation Tracking</h4>
                          <p className="text-xs text-ink-secondary">
                            Trigger on your Thank You page to clear the customer's cart, increment total spend, and prevent unnecessary cart abandonment campaigns.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs gap-1.5 self-start sm:self-auto"
                          onClick={() => {
                            const code = `window.vittain && window.vittain('track', 'purchase', {
  order_id: 'ORD_2026_098',
  value: 1499.00,
  currency: 'INR',
  items: [
    { product_id: 'p_101', name: 'Wireless Headphones', price: 1499.00, quantity: 1 }
  ]
});`
                            navigator.clipboard.writeText(code)
                            toast.success('Purchase tracking snippet copied!')
                          }}
                        >
                          <Copy className="w-3.5 h-3.5" /> Copy Code
                        </Button>
                      </div>

                      <div className="bg-[#0f172a] text-slate-100 p-4 rounded-xl border border-slate-800 font-mono text-xs overflow-x-auto">
                        <pre className="text-slate-200 whitespace-pre leading-relaxed">{`window.vittain && window.vittain('track', 'purchase', {
  order_id: 'ORD_2026_098',
  value: 1499.00,
  currency: 'INR',
  items: [
    { product_id: 'p_101', name: 'Wireless Headphones', price: 1499.00, quantity: 1 }
  ]
});`}</pre>
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  )
}
