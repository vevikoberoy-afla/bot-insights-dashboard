'use client'
import { activeWorkspaceId } from '@/lib/client/workspace'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from '@/components/ui/dialog'
import { 
  ArrowRight, 
  ArrowLeft, 
  Globe, 
  MessageCircle, 
  Send, 
  Hash, 
  BookOpen, 
  Database, 
  CheckCircle2, 
  Check, 
  Copy, 
  Plus, 
  ExternalLink, 
  RefreshCw, 
  Search, 
  Tag, 
  X, 
  Sparkles, 
  Clock, 
  Bot, 
  Headset, 
  Megaphone,
  UserCheck,
  ShieldCheck,
  AlertCircle,
  Mail,
  Settings,
  ShoppingCart
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { fetchDashboardData, invalidateDashboardData } from '@/lib/client/featureDataCache'

interface StepItem {
  id: number
  title: string
  subtitle: string
  icon: any
}

const STEPS: StepItem[] = [
  { id: 1, title: 'Basics & Channels', subtitle: 'Identity, type & platform', icon: Bot },
  { id: 2, title: 'Knowledge Bases', subtitle: 'Documentation & citations', icon: BookOpen },
  { id: 3, title: 'Databases', subtitle: 'Live structured data', icon: Database },
  { id: 4, title: 'Launch & Config', subtitle: 'Greeting, handoff & schedule', icon: Sparkles },
]

const QUICK_TAGS = ['Support', 'Marketing', 'Sales', 'E-commerce', 'Lead Gen', 'Internal']

export default function CreateBotWizard() {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // Stepper state
  const [step, setStep] = useState(1)

  // Remote data state
  const [knowledgeList, setKnowledgeList] = useState<any[]>([])
  const [dbList, setDbList] = useState<any[]>([])
  const [channelIntegrations, setChannelIntegrations] = useState<any[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [isLoadingKnowledge, setIsLoadingKnowledge] = useState(false)
  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false)
  const [loadedSteps, setLoadedSteps] = useState<number[]>([])
  const [isRefreshingKb, setIsRefreshingKb] = useState(false)
  const [isRefreshingDb, setIsRefreshingDb] = useState(false)

  // Auth / Context state
  const [clientId, setClientId] = useState<string | null>(null)
  const [contextId, setContextId] = useState<string | null>(null)
  const [isDeploying, setIsDeploying] = useState(false)
  const [showWebScriptModal, setShowWebScriptModal] = useState(false)
  const [deployedBotId, setDeployedBotId] = useState<string | null>(null)

  // Filters for Step 2 & 3
  const [kbSearch, setKbSearch] = useState('')
  const [dbSearch, setDbSearch] = useState('')

  // Tag input temporary state
  const [tagInput, setTagInput] = useState('')

  // Unified Form State
  const [form, setForm] = useState({
    name: '',
    tags: ['Support'] as string[],
    oneliner: '',
    type: 'support', // 'support' | 'service' | 'sales' | 'marketing' | 'both'
    channel: 'web', // 'web' | 'whatsapp' | 'telegram' | 'slack'
    channelAccount: '',
    knowledgeBases: [] as string[],
    databases: [] as string[],
    openingMessage: 'Hi there! How can I help you today?',
    handoffMessage: 'Let me connect you with a human agent who can assist you further. Please hold on.',
    autoTicket: true,
    schedule: '24_7', // '24_7' | 'business_hours'
  })

  // Channel config state
  const [activeChannelConfig, setActiveChannelConfig] = useState<string | null>(null)

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) return
        setClientId(activeWorkspaceId(user.id || ''))

        const { data: client } = await supabase
          .from('clients')
          .select('id, context_id')
          .eq('id', activeWorkspaceId(user.id || ''))
          .maybeSingle()

        if (client?.context_id) {
          setContextId(client.context_id)
        } else {
          try {
            const ctxRes = await fetch(`/api/client/context?client_id=${activeWorkspaceId(user.id || '')}`)
            if (ctxRes.ok) {
              const ctxData = await ctxRes.json()
              if (ctxData?.context_id) setContextId(ctxData.context_id)
            }
          } catch {}
        }

        await loadIntegrations(activeWorkspaceId(user.id || ''))
      } catch (err) {
        console.error('Failed to fetch config data', err)
      } finally {
        setIsLoadingData(false)
      }
    }
    fetchData()
  }, [])

  useEffect(() => {
    if(!clientId || loadedSteps.includes(step)) return
    if(step===2){setIsLoadingKnowledge(true);loadKnowledgeBases(clientId).finally(()=>{setIsLoadingKnowledge(false);setLoadedSteps(prev=>prev.includes(2)?prev:[...prev,2])})}
    if(step===3){setIsLoadingDatabases(true);loadDatabases(clientId).finally(()=>{setIsLoadingDatabases(false);setLoadedSteps(prev=>prev.includes(3)?prev:[...prev,3])})}
  },[step,clientId,loadedSteps])

  async function loadKnowledgeBases(userId: string) {
    const dsets=await fetchDashboardData<any[]>(`/api/datasets?client_id=${encodeURIComponent(userId)}`)
    setKnowledgeList(dsets || [])
  }

  async function loadDatabases(userId: string) {
    const dbs=await fetchDashboardData<any[]>(`/api/databases?client_id=${encodeURIComponent(userId)}`)
    setDbList(dbs || [])
  }

  async function loadIntegrations(userId: string) {
    const integrations=await fetchDashboardData<any[]>(`/api/integrations?client_id=${encodeURIComponent(userId)}`)
    setChannelIntegrations(Array.isArray(integrations) ? integrations : [])
  }

  async function handleRefreshKnowledge() {
    if (!clientId) return
    setIsRefreshingKb(true)
    invalidateDashboardData('/api/datasets')
    await loadKnowledgeBases(clientId)
    setIsRefreshingKb(false)
    toast.success('Knowledge bases refreshed')
  }

  async function handleRefreshDatabases() {
    if (!clientId) return
    setIsRefreshingDb(true)
    invalidateDashboardData('/api/databases')
    await loadDatabases(clientId)
    setIsRefreshingDb(false)
    toast.success('Databases refreshed')
  }

  function selectChannel(channelId: string) {
    setForm(prev => ({ ...prev, channel: channelId, channelAccount: '' }))
    if (channelId !== 'web') {
      setActiveChannelConfig(channelId)
    } else {
      setActiveChannelConfig(null)
    }
  }

  function toggleArrayItem(field: 'knowledgeBases' | 'databases', id: string) {
    setForm(prev => {
      const current = prev[field]
      const updated = current.includes(id) ? current.filter(x => x !== id) : [...current, id]
      return { ...prev, [field]: updated }
    })
  }

  function addTag(tagText: string) {
    const clean = tagText.trim().replace(/^#/, '')
    if (!clean) return
    if (!form.tags.includes(clean)) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, clean] }))
    }
    setTagInput('')
  }

  function removeTag(tagToRemove: string) {
    setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tagToRemove) }))
  }

  function handleKeyDownTag(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(tagInput)
    }
  }

  // Calculate progress percentage
  const progressPercent = Math.round(((step - 1) / (STEPS.length - 1)) * 100)

  // Validation before advancing step
  function handleNextStep() {
    if (step === 1) {
      if (!form.name.trim()) {
        toast.error('Please enter a name for your bot.')
        return
      }
      if (!form.type) {
        toast.error('Please select a bot type.')
        return
      }
    }
    setStep(s => Math.min(s + 1, STEPS.length))
  }

  // Deploy Bot
  async function handleDeployBot() {
    if (!clientId) {
      toast.error('Session expired. Please re-login.')
      return
    }
    if (!form.name.trim()) {
      toast.error('Please specify a bot name.')
      setStep(1)
      return
    }

    setIsDeploying(true)
    try {
      const res = await fetch('/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          name: form.name.trim(),
          type: form.type,
          channel: form.channel,
          channelAccount: form.channelAccount,
          tags: form.tags,
          oneliner: form.oneliner.trim(),
          knowledgeBases: form.knowledgeBases,
          databases: form.databases,
          openingMessage: form.openingMessage,
          handoffMessage: form.handoffMessage,
          autoTicket: form.autoTicket,
          schedule: form.schedule,
        })
      })

      if (res.ok) {
        const botData = await res.json()
        if (form.channel === 'web') {
          setDeployedBotId(botData.id)
          setShowWebScriptModal(true)
        } else {
          toast.success('Bot successfully deployed!')
          setTimeout(() => router.push('/bots/all'), 1000)
        }
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to deploy bot')
      }
    } catch (err) {
      toast.error('Network error during bot deployment')
    } finally {
      setIsDeploying(false)
    }
  }

  // Filtered knowledge bases & databases
  const filteredKnowledge = knowledgeList.filter(kb => 
    kb.name?.toLowerCase().includes(kbSearch.toLowerCase()) ||
    kb.created_from?.toLowerCase().includes(kbSearch.toLowerCase())
  )

  const filteredDatabases = dbList.filter(db =>
    db.name?.toLowerCase().includes(dbSearch.toLowerCase()) ||
    db.data_type?.toLowerCase().includes(dbSearch.toLowerCase())
  )

  return (
    <div className="max-w-6xl mx-auto pb-24 animate-in fade-in duration-300">
      <PageHeader
        title="Create New Bot"
        description="Set up your AI assistant's identity, knowledge, databases, and deployment settings."
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mt-6 items-start">
        
        {/* ============================================================
            LEFT COLUMN: COMPLETION BAR & NAVIGATION
        ============================================================ */}
        <div className="lg:col-span-4 sticky top-6 space-y-5">
          <div className="bg-surface border border-surface-border rounded-2xl p-5 shadow-sm">
            {/* Progress Header */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">Progress</span>
              <span className="text-xs font-bold text-accent">{progressPercent}% Completed</span>
            </div>

            {/* Visual Progress Bar */}
            <div className="w-full h-2 bg-surface-muted rounded-full overflow-hidden mb-6">
              <div 
                className="h-full bg-accent transition-all duration-300 ease-out rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Vertical Step Checklist */}
            <nav className="space-y-2">
              {STEPS.map((s) => {
                const isCurrent = step === s.id
                const isPast = step > s.id
                const Icon = s.icon

                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      // Allow navigation to past or current step, or step 2 if step 1 is valid
                      if (isPast || isCurrent) {
                        setStep(s.id)
                      } else if (s.id === step + 1 && form.name.trim()) {
                        setStep(s.id)
                      }
                    }}
                    className={cn(
                      "w-full flex items-start gap-3.5 p-3 rounded-xl text-left transition-all group",
                      isCurrent 
                        ? "bg-accent/10 border border-accent/30 text-ink shadow-sm" 
                        : isPast 
                          ? "hover:bg-surface-muted text-ink cursor-pointer" 
                          : "opacity-60 cursor-not-allowed hover:bg-transparent"
                    )}
                  >
                    {/* Circle Indicator */}
                    <div 
                      className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 transition-colors mt-0.5",
                        isPast
                          ? "bg-emerald-500 text-white"
                          : isCurrent
                            ? "bg-accent text-white shadow-sm ring-2 ring-accent/30"
                            : "bg-surface-muted text-ink-muted border border-surface-border"
                      )}
                    >
                      {isPast ? <Check className="w-4 h-4 stroke-[2.5]" /> : s.id}
                    </div>

                    {/* Step Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className={cn(
                          "text-sm font-semibold truncate",
                          isCurrent ? "text-accent" : "text-ink"
                        )}>
                          {s.title}
                        </p>
                        {isCurrent && (
                          <span className="text-[10px] bg-accent/20 text-accent px-2 py-0.5 rounded-full font-medium shrink-0 ml-2">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink-muted mt-0.5 truncate">{s.subtitle}</p>

                      {/* Micro summary chips for completed steps */}
                      {s.id === 1 && form.name && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <span className="text-[10px] font-medium bg-surface-muted text-ink-secondary px-1.5 py-0.5 rounded border border-surface-border truncate max-w-[140px]">
                            {form.name}
                          </span>
                          <span className="text-[10px] font-medium bg-surface-muted text-ink-secondary px-1.5 py-0.5 rounded border border-surface-border capitalize">
                            {form.type}
                          </span>
                        </div>
                      )}

                      {s.id === 2 && form.knowledgeBases.length > 0 && (
                        <p className="text-[11px] text-emerald-600 font-medium mt-1">
                          ✓ {form.knowledgeBases.length} attached
                        </p>
                      )}

                      {s.id === 3 && form.databases.length > 0 && (
                        <p className="text-[11px] text-emerald-600 font-medium mt-1">
                          ✓ {form.databases.length} connected
                        </p>
                      )}
                    </div>
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Quick Bot Preview Card */}
          <div className="bg-surface border border-surface-border rounded-2xl p-5 shadow-sm space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-accent" /> Live Summary
            </h4>

            <div className="bg-surface-muted/60 rounded-xl p-3.5 border border-surface-border space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-ink truncate">
                  {form.name || 'Untitled Bot'}
                </span>
                <span className="text-[10px] font-semibold bg-accent/15 text-accent px-2 py-0.5 rounded-md capitalize shrink-0">
                  {form.type} Bot
                </span>
              </div>

              {form.oneliner && (
                <p className="text-xs text-ink-secondary line-clamp-2 leading-relaxed italic">
                  "{form.oneliner}"
                </p>
              )}

              <div className="pt-2 border-t border-surface-border/60 flex items-center justify-between text-[11px] text-ink-muted">
                <span className="flex items-center gap-1 capitalize">
                  {form.channel === 'whatsapp' ? <MessageCircle className="w-3.5 h-3.5 text-emerald-500" /> :
                   form.channel === 'telegram' ? <Send className="w-3.5 h-3.5 text-sky-500" /> :
                   form.channel === 'slack' ? <Hash className="w-3.5 h-3.5 text-amber-500" /> :
                   form.channel === 'email' ? <Mail className="w-3.5 h-3.5 text-rose-500" /> :
                   <Globe className="w-3.5 h-3.5 text-blue-500" />}
                  {form.channel}
                </span>

                <span>
                  {form.knowledgeBases.length} KBs · {form.databases.length} DBs
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================
            RIGHT COLUMN: ACTIVE STEP CONTENT
        ============================================================ */}
        <div className="lg:col-span-8 bg-surface border border-surface-border rounded-2xl p-6 sm:p-8 shadow-sm min-h-[560px] flex flex-col justify-between">
          
          <div>
            {/* ============================================================
                STEP 1: BASICS & CHANNELS
            ============================================================ */}
            {step === 1 && (
              <div className="space-y-7 animate-in fade-in slide-in-from-right-3 duration-200">
                <div className="border-b border-surface-border pb-4">
                  <h2 className="text-xl font-bold text-ink flex items-center gap-2">
                    <Bot className="w-5 h-5 text-accent" /> Basics & Channels
                  </h2>
                  <p className="text-sm text-ink-secondary mt-1">
                    Set up your bot's name, purpose, tags, and select where it will engage customers.
                  </p>
                </div>

                <div className="space-y-6">
                  {/* Name of the Bot */}
                  <div className="space-y-2">
                    <Label htmlFor="bot-name" className="text-sm font-semibold text-ink flex items-center gap-1">
                      Name of the Bot <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="bot-name"
                      placeholder="e.g. Aria Support Concierge"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="h-11 text-base focus-visible:ring-accent"
                      autoFocus
                    />
                    <p className="text-xs text-ink-muted">
                      This name will identify the bot in your dashboard and to visitors.
                    </p>
                  </div>

                  {/* Tags */}
                  <div className="space-y-2.5">
                    <Label className="text-sm font-semibold text-ink flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-ink-muted" /> Tags
                    </Label>
                    <div className="flex flex-wrap items-center gap-2 p-2.5 bg-surface-muted/40 rounded-xl border border-surface-border min-h-[46px]">
                      {form.tags.map((tag) => (
                        <span 
                          key={tag}
                          className="inline-flex items-center gap-1 text-xs font-medium bg-surface border border-surface-border text-ink px-2.5 py-1 rounded-lg shadow-2xs group"
                        >
                          #{tag}
                          <button
                            type="button"
                            onClick={() => removeTag(tag)}
                            className="text-ink-muted hover:text-red-500 transition-colors p-0.5 rounded-full"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      <input
                        type="text"
                        placeholder="Add tag (press Enter)..."
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={handleKeyDownTag}
                        className="bg-transparent border-none text-xs text-ink placeholder:text-ink-muted focus:outline-none flex-1 min-w-[130px]"
                      />
                    </div>

                    {/* Quick suggestion tags */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] text-ink-muted mr-1">Suggestions:</span>
                      {QUICK_TAGS.map(qt => {
                        const isAdded = form.tags.includes(qt)
                        return (
                          <button
                            key={qt}
                            type="button"
                            onClick={() => isAdded ? removeTag(qt) : addTag(qt)}
                            className={cn(
                              "text-[11px] px-2 py-0.5 rounded-md border transition-all",
                              isAdded 
                                ? "bg-accent/15 border-accent/30 text-accent font-medium" 
                                : "bg-surface text-ink-muted border-surface-border hover:border-accent/40 hover:text-ink"
                            )}
                          >
                            +{qt}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* One-liner Summary */}
                  <div className="space-y-2">
                    <Label htmlFor="bot-oneliner" className="text-sm font-semibold text-ink">
                      One-liner <span className="text-ink-muted font-normal text-xs">(What it does)</span>
                    </Label>
                    <Textarea
                      id="bot-oneliner"
                      rows={2}
                      placeholder="e.g. 24/7 AI agent that assists customers with product questions, handles returns, and escalates to human agents."
                      value={form.oneliner}
                      onChange={(e) => setForm({ ...form, oneliner: e.target.value })}
                      className="resize-none text-sm focus-visible:ring-accent"
                    />
                  </div>

                  {/* Select Type of Bot (DROPDOWN, NO CARDS!) */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-ink flex items-center gap-1">
                      Select Type of Bot <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={form.type}
                      onValueChange={(val) => setForm({ ...form, type: val })}
                    >
                      <SelectTrigger className="h-12 text-sm bg-surface border-surface-border focus:ring-accent">
                        <SelectValue placeholder="Choose a bot type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="support">
                          <div className="flex items-center gap-2 py-0.5">
                            <Headset className="w-4 h-4 text-emerald-500" />
                            <div>
                              <span className="font-semibold text-ink">Support Bot</span>
                              <span className="text-xs text-ink-muted ml-2">— Resolves inbound inquiries, creates tickets, 24/7 support</span>
                            </div>
                          </div>
                        </SelectItem>
                        <SelectItem value="marketing">
                          <div className="flex items-center gap-2 py-0.5">
                            <Megaphone className="w-4 h-4 text-purple-500" />
                            <div>
                              <span className="font-semibold text-ink">Marketing Bot</span>
                              <span className="text-xs text-ink-muted ml-2">— Handles outreach campaigns, lead gen, and promotional messaging</span>
                            </div>
                          </div>
                        </SelectItem>
                        <SelectItem value="service">
                          <div className="flex items-center gap-2 py-0.5">
                            <Settings className="w-4 h-4 text-blue-500" />
                            <div><span className="font-semibold text-ink">Service Bot</span><span className="text-xs text-ink-muted ml-2">— Handles orders, appointments, returns, and service requests</span></div>
                          </div>
                        </SelectItem>
                        <SelectItem value="sales">
                          <div className="flex items-center gap-2 py-0.5">
                            <ShoppingCart className="w-4 h-4 text-amber-500" />
                            <div><span className="font-semibold text-ink">Sales Bot</span><span className="text-xs text-ink-muted ml-2">— Answers product questions, qualifies buyers, and takes orders</span></div>
                          </div>
                        </SelectItem>
                        <SelectItem value="both">
                          <div className="flex items-center gap-2 py-0.5">
                            <Bot className="w-4 h-4 text-blue-500" />
                            <div>
                              <span className="font-semibold text-ink">Omnichannel Bot</span>
                              <span className="text-xs text-ink-muted ml-2">— Complete AI agent combining outreach campaigns and inbound support</span>
                            </div>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Select Channel */}
                  <div className="space-y-3 pt-2">
                    <Label className="text-sm font-semibold text-ink flex items-center justify-between">
                      <span>Select Channel <span className="text-ink-muted font-normal text-xs">(one per bot)</span></span>
                      {form.channel === 'web' && (
                        <span className="text-xs text-emerald-600 font-medium">Ready to embed</span>
                      )}
                    </Label>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                      {[
                        { id: 'web', name: 'Webchat', icon: Globe, desc: 'Website Widget' },
                        { id: 'whatsapp', name: 'WhatsApp', icon: MessageCircle, desc: 'Meta Cloud' },
                        { id: 'telegram', name: 'Telegram', icon: Send, desc: 'Bot API' },
                        { id: 'slack', name: 'Slack', icon: Hash, desc: 'Workspace App' },
                        { id: 'email', name: 'Email', icon: Mail, desc: 'SMTP / Inbound' },
                      ].map((ch) => {
                        const isSelected = form.channel === ch.id
                        const Icon = ch.icon
                        return (
                          <div
                            key={ch.id}
                            onClick={() => selectChannel(ch.id)}
                            className={cn(
                              "relative flex flex-col items-center justify-center p-3.5 rounded-xl border-2 cursor-pointer transition-all text-center gap-1.5 h-28 group",
                              isSelected 
                                ? "border-accent bg-accent/5 shadow-xs" 
                                : "border-surface-border hover:border-accent/40 bg-surface hover:bg-surface-muted"
                            )}
                          >
                            <div className={cn(
                              "w-9 h-9 rounded-full flex items-center justify-center transition-colors",
                              isSelected ? "bg-accent text-white" : "bg-surface-muted text-ink-secondary group-hover:text-ink"
                            )}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <p className="text-xs font-bold text-ink">{ch.name}</p>
                            <p className="text-[10px] text-ink-muted">{ch.desc}</p>
                            {isSelected && (
                              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-accent" />
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {/* Non-web Instance selector */}
                    {activeChannelConfig && activeChannelConfig !== 'web' && (() => {
                      const available = channelIntegrations.filter(i => i.channel === activeChannelConfig)
                      return (
                        <div className="p-4 bg-surface-muted/60 border border-surface-border rounded-xl animate-in fade-in duration-200">
                          <h4 className="text-xs font-bold text-ink uppercase tracking-wider mb-1 capitalize">
                            Connected {activeChannelConfig} Account
                          </h4>
                          <p className="text-xs text-ink-muted mb-3">Select which registered instance this bot will operate on.</p>
                          {isLoadingData ? (
                            <p className="text-xs text-ink-muted">Loading available instances...</p>
                          ) : available.length === 0 ? (
                            <div className="text-center py-3 border border-dashed border-surface-border rounded-lg bg-surface">
                              <p className="text-xs text-ink-secondary mb-1">No {activeChannelConfig} accounts connected yet.</p>
                              <Link 
                                href="/settings/integrations" 
                                target="_blank" 
                                className="text-xs text-accent hover:underline font-semibold inline-flex items-center gap-1"
                              >
                                Connect account in Integrations <ExternalLink className="w-3 h-3" />
                              </Link>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {available.map((inst: any) => (
                                <div 
                                  key={inst.id} 
                                  onClick={() => setForm(prev => ({ ...prev, channelAccount: prev.channelAccount === inst.id ? '' : inst.id }))} 
                                  className={cn(
                                    "flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer hover:bg-surface transition-colors",
                                    form.channelAccount === inst.id ? 'border-accent bg-accent/5' : 'border-surface-border bg-surface'
                                  )}
                                >
                                  <div className={cn(
                                    "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                                    form.channelAccount === inst.id ? 'border-accent' : 'border-ink-muted'
                                  )}>
                                    {form.channelAccount === inst.id && <div className="w-2 h-2 rounded-full bg-accent" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <span className="text-xs text-ink font-semibold">{inst.instance_name || inst.phone_number || inst.bot_username || inst.identifier || inst.email_address}</span>
                                    <span className="text-[10px] text-ink-muted ml-2 capitalize">({inst.status || 'connected'})</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {form.channel === 'web' && (
                      <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center gap-3 text-xs text-blue-700 dark:text-blue-300">
                        <Globe className="w-4 h-4 text-blue-500 shrink-0" />
                        <span>Webchat script snippet will be generated automatically upon bot launch.</span>
                      </div>
                    )}

                    {form.channel === 'email' && (
                      <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-xs text-rose-700 dark:text-rose-300">
                        <Mail className="w-4 h-4 text-rose-500 shrink-0" />
                        <span>Inbound customer emails are intelligently triaged under Bots &gt; Emails with spam filtering, AI summaries, and human-in-the-loop review.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ============================================================
                STEP 2: KNOWLEDGE
            ============================================================ */}
            {step === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-3 duration-200">
                <div className="border-b border-surface-border pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-ink flex items-center gap-2">
                      <BookOpen className="w-5 h-5 text-accent" /> Connect Knowledge Bases
                    </h2>
                    <p className="text-sm text-ink-secondary mt-1">
                      Choose which knowledge sources your bot should cite when answering questions.
                    </p>
                  </div>

                  {/* Add Knowledge Button redirecting to /knowledge/add */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRefreshKnowledge}
                      disabled={isRefreshingKb}
                      className="h-9 px-3 text-xs border-surface-border"
                      title="Refresh knowledge list"
                    >
                      <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isRefreshingKb && "animate-spin")} />
                      Refresh
                    </Button>

                    <Button
                      type="button"
                      onClick={() => window.open('/knowledge/add', '_blank')}
                      className="h-9 bg-accent hover:bg-accent-hover text-white text-xs font-semibold gap-1.5 shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Knowledge Base
                      <ExternalLink className="w-3 h-3 opacity-70 ml-0.5" />
                    </Button>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    placeholder="Search existing knowledge bases..."
                    value={kbSearch}
                    onChange={(e) => setKbSearch(e.target.value)}
                    className="pl-9 h-10 text-xs focus-visible:ring-accent"
                  />
                </div>

                {/* Knowledge Base Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[380px] overflow-y-auto pr-1">
                  {isLoadingKnowledge ? (
                    <div className="col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Loading knowledge bases">{[0,1,2,3].map(item=><div key={item} className="h-24 rounded-xl border border-surface-border bg-surface-muted animate-pulse"/>)}</div>
                  ) : filteredKnowledge.length === 0 ? (
                    <div className="col-span-2 text-center py-10 border border-dashed border-surface-border rounded-xl bg-surface-muted/30">
                      <BookOpen className="w-8 h-8 text-ink-muted mx-auto mb-2 opacity-50" />
                      <p className="text-sm font-semibold text-ink">No knowledge bases found</p>
                      <p className="text-xs text-ink-muted mt-1 mb-4">
                        Create a knowledge base with your website or uploaded documents to train this bot.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => window.open('/knowledge/add', '_blank')}
                        className="bg-accent hover:bg-accent-hover text-white text-xs"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Create Knowledge Base
                      </Button>
                    </div>
                  ) : (
                    filteredKnowledge.map((kb) => {
                      const isSelected = form.knowledgeBases.includes(kb.id)
                      return (
                        <div
                          key={kb.id}
                          onClick={() => toggleArrayItem('knowledgeBases', kb.id)}
                          className={cn(
                            "p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 select-none",
                            isSelected 
                              ? "border-accent bg-accent/5 shadow-2xs" 
                              : "border-surface-border hover:border-accent/40 bg-surface hover:bg-surface-muted"
                          )}
                        >
                          <div className={cn(
                            "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                            isSelected ? "bg-accent text-white" : "bg-surface-muted text-ink-secondary"
                          )}>
                            <BookOpen className="w-4 h-4" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-bold text-ink truncate">{kb.name}</h4>
                            <p className="text-[10px] text-ink-muted mt-0.5 capitalize truncate">
                              {kb.created_from || 'custom'} • {kb.chunk_count || 0} Chunks
                            </p>
                          </div>

                          <div className={cn(
                            "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all",
                            isSelected 
                              ? "bg-accent border-accent text-white" 
                              : "border-surface-border bg-surface"
                          )}>
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                <div className="p-3 bg-surface-muted/50 rounded-xl border border-surface-border flex items-center justify-between text-xs text-ink-muted">
                  <span>Selected: <strong className="text-ink">{form.knowledgeBases.length}</strong> knowledge base(s)</span>
                  <span className="text-[11px]">Can be changed anytime in bot settings</span>
                </div>
              </div>
            )}

            {/* ============================================================
                STEP 3: DATABASES
            ============================================================ */}
            {step === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-3 duration-200">
                <div className="border-b border-surface-border pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-ink flex items-center gap-2">
                      <Database className="w-5 h-5 text-accent" /> Connect Databases (Structured Data)
                    </h2>
                    <p className="text-sm text-ink-secondary mt-1">
                      Allow your bot to look up live orders, inventory items, user accounts, or query custom APIs.
                    </p>
                  </div>

                  {/* Add Database Button redirecting to /databases/all */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRefreshDatabases}
                      disabled={isRefreshingDb}
                      className="h-9 px-3 text-xs border-surface-border"
                      title="Refresh database list"
                    >
                      <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", isRefreshingDb && "animate-spin")} />
                      Refresh
                    </Button>

                    <Button
                      type="button"
                      onClick={() => window.open('/databases/all', '_blank')}
                      className="h-9 bg-accent hover:bg-accent-hover text-white text-xs font-semibold gap-1.5 shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Database
                      <ExternalLink className="w-3 h-3 opacity-70 ml-0.5" />
                    </Button>
                  </div>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="w-4 h-4 text-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    placeholder="Search existing databases and API sources..."
                    value={dbSearch}
                    onChange={(e) => setDbSearch(e.target.value)}
                    className="pl-9 h-10 text-xs focus-visible:ring-accent"
                  />
                </div>

                {/* Databases Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-h-[380px] overflow-y-auto pr-1">
                  {isLoadingDatabases ? (
                    <div className="col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="Loading databases">{[0,1,2,3].map(item=><div key={item} className="h-24 rounded-xl border border-surface-border bg-surface-muted animate-pulse"/>)}</div>
                  ) : filteredDatabases.length === 0 ? (
                    <div className="col-span-2 text-center py-10 border border-dashed border-surface-border rounded-xl bg-surface-muted/30">
                      <Database className="w-8 h-8 text-ink-muted mx-auto mb-2 opacity-50" />
                      <p className="text-sm font-semibold text-ink">No databases connected yet</p>
                      <p className="text-xs text-ink-muted mt-1 mb-4">
                        Connect a REST API, Google Sheet, or CSV database to enable live data lookups.
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => window.open('/databases/all', '_blank')}
                        className="bg-accent hover:bg-accent-hover text-white text-xs"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Create Database Source
                      </Button>
                    </div>
                  ) : (
                    filteredDatabases.map((db) => {
                      const isSelected = form.databases.includes(db.id)
                      return (
                        <div
                          key={db.id}
                          onClick={() => toggleArrayItem('databases', db.id)}
                          className={cn(
                            "p-3.5 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3 select-none",
                            isSelected 
                              ? "border-accent bg-accent/5 shadow-2xs" 
                              : "border-surface-border hover:border-accent/40 bg-surface hover:bg-surface-muted"
                          )}
                        >
                          <div className={cn(
                            "w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors",
                            isSelected ? "bg-accent text-white" : "bg-surface-muted text-ink-secondary"
                          )}>
                            <Database className="w-4 h-4" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-bold text-ink truncate">{db.name}</h4>
                            <p className="text-[10px] text-ink-muted mt-0.5 capitalize truncate">
                              {db.data_type || 'Custom'} • {db.source_count || 0} Records
                            </p>
                          </div>

                          <div className={cn(
                            "w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all",
                            isSelected 
                              ? "bg-accent border-accent text-white" 
                              : "border-surface-border bg-surface"
                          )}>
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[2.5]" />}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

                <div className="p-3 bg-surface-muted/50 rounded-xl border border-surface-border flex items-center justify-between text-xs text-ink-muted">
                  <span>Selected: <strong className="text-ink">{form.databases.length}</strong> database(s)</span>
                  <span className="text-[11px]">Optional: bots can operate purely on knowledge bases</span>
                </div>
              </div>
            )}

            {/* ============================================================
                STEP 4: LAUNCH & CONFIGURATION (IN ONE UNIFIED SECTION)
            ============================================================ */}
            {step === 4 && (
              <div className="space-y-7 animate-in fade-in slide-in-from-right-3 duration-200">
                <div className="border-b border-surface-border pb-4">
                  <h2 className="text-xl font-bold text-ink flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-accent" /> Launch & Configuration
                  </h2>
                  <p className="text-sm text-ink-secondary mt-1">
                    Set up your opening message, agent handoff rules, availability schedule, and launch your bot.
                  </p>
                </div>

                <div className="space-y-6">
                  {/* 1. First Opening Message */}
                  <div className="bg-surface-muted/40 p-4.5 rounded-xl border border-surface-border space-y-3">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="opening-msg" className="text-sm font-semibold text-ink">
                        First Opening Message
                      </Label>
                      <span className="text-[11px] text-ink-muted">Greeting sent when chat opens</span>
                    </div>
                    
                    <Textarea
                      id="opening-msg"
                      rows={2}
                      value={form.openingMessage}
                      onChange={(e) => setForm({ ...form, openingMessage: e.target.value })}
                      placeholder="Hi there! How can I help you today?"
                      className="resize-none text-sm bg-surface focus-visible:ring-accent"
                    />

                    {/* Chat bubble mini preview */}
                    <div className="flex items-start gap-2.5 pt-1">
                      <div className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center text-xs shrink-0">
                        🤖
                      </div>
                      <div className="bg-surface border border-surface-border px-3 py-2 rounded-2xl rounded-tl-xs text-xs text-ink max-w-[85%] shadow-2xs">
                        {form.openingMessage || 'Hi there! How can I help you today?'}
                      </div>
                    </div>
                  </div>

                  {/* 2. Fallback & Handoff */}
                  <div className="bg-surface-muted/40 p-4.5 rounded-xl border border-surface-border space-y-4">
                    <div>
                      <h4 className="text-sm font-semibold text-ink mb-1 flex items-center gap-1.5">
                        <UserCheck className="w-4 h-4 text-accent" /> Human Agent Handoff
                      </h4>
                      <p className="text-xs text-ink-muted">
                        Configure what happens when the customer requests a human or AI cannot resolve the request.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="handoff-msg" className="text-xs font-semibold text-ink">
                        Handoff Message
                      </Label>
                      <Input
                        id="handoff-msg"
                        value={form.handoffMessage}
                        onChange={(e) => setForm({ ...form, handoffMessage: e.target.value })}
                        placeholder="Let me connect you with a human agent..."
                        className="h-10 text-xs bg-surface focus-visible:ring-accent"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-surface-border/60">
                      <div>
                        <p className="text-xs font-semibold text-ink">Auto-Create Ticket</p>
                        <p className="text-[11px] text-ink-muted">
                          Automatically create an inbox ticket when handoff is triggered.
                        </p>
                      </div>
                      <Switch
                        checked={form.autoTicket}
                        onCheckedChange={(v) => setForm({ ...form, autoTicket: v })}
                      />
                    </div>
                  </div>

                  {/* 3. Schedule & Availability */}
                  <div className="bg-surface-muted/40 p-4.5 rounded-xl border border-surface-border space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-ink flex items-center gap-1.5">
                        <Clock className="w-4 h-4 text-accent" /> Schedule & Availability
                      </h4>
                      <Link 
                        href="/settings/business-hours" 
                        target="_blank" 
                        className="text-[11px] text-accent hover:underline flex items-center gap-1"
                      >
                        Configure hours <ExternalLink className="w-2.5 h-2.5" />
                      </Link>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div
                        onClick={() => setForm({ ...form, schedule: '24_7' })}
                        className={cn(
                          "p-3 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-2.5",
                          form.schedule === '24_7' 
                            ? "border-accent bg-accent/5" 
                            : "border-surface-border bg-surface hover:bg-surface-muted"
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
                          form.schedule === '24_7' ? "border-accent" : "border-ink-muted"
                        )}>
                          {form.schedule === '24_7' && <div className="w-2 h-2 rounded-full bg-accent" />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-ink">24/7 Always Active</p>
                          <p className="text-[10px] text-ink-muted">Responds immediately at any hour of the day.</p>
                        </div>
                      </div>

                      <div
                        onClick={() => setForm({ ...form, schedule: 'business_hours' })}
                        className={cn(
                          "p-3 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-2.5",
                          form.schedule === 'business_hours' 
                            ? "border-accent bg-accent/5" 
                            : "border-surface-border bg-surface hover:bg-surface-muted"
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5",
                          form.schedule === 'business_hours' ? "border-accent" : "border-ink-muted"
                        )}>
                          {form.schedule === 'business_hours' && <div className="w-2 h-2 rounded-full bg-accent" />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-ink">Business Hours Only</p>
                          <p className="text-[10px] text-ink-muted">Queues offline requests outside business hours.</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 4. Final Review & Launch Button */}
                  <div className="bg-surface p-4.5 rounded-xl border border-surface-border space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                      Review & Deploy
                    </h4>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-ink-muted block text-[10px]">Name</span>
                        <span className="font-semibold text-ink truncate block">{form.name || 'Unnamed'}</span>
                      </div>
                      <div>
                        <span className="text-ink-muted block text-[10px]">Type</span>
                        <span className="font-semibold text-ink capitalize block">{form.type} Bot</span>
                      </div>
                      <div>
                        <span className="text-ink-muted block text-[10px]">Channel</span>
                        <span className="font-semibold text-ink capitalize block">{form.channel}</span>
                      </div>
                      <div>
                        <span className="text-ink-muted block text-[10px]">Resources</span>
                        <span className="font-semibold text-ink block">{form.knowledgeBases.length} KBs · {form.databases.length} DBs</span>
                      </div>
                    </div>

                    <Button
                      disabled={isDeploying || !clientId}
                      onClick={handleDeployBot}
                      className="w-full h-12 bg-accent hover:bg-accent-hover text-white text-base font-bold shadow-md mt-2 transition-all"
                    >
                      {isDeploying ? (
                        <span className="flex items-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin" /> Deploying Bot...
                        </span>
                      ) : (
                        `Launch ${form.name || 'Bot'} Now 🚀`
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ============================================================
              NAVIGATION FOOTER BUTTONS
          ============================================================ */}
          <div className="mt-8 pt-5 border-t border-surface-border flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep(s => Math.max(s - 1, 1))}
              disabled={step === 1}
              className="text-ink-secondary text-xs h-9 px-3"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>

            {step < STEPS.length && (
              <Button
                type="button"
                onClick={handleNextStep}
                className="bg-ink hover:bg-ink-secondary text-white text-xs font-semibold h-9 px-4 gap-1.5 shadow-2xs"
              >
                Continue to {STEPS[step]?.title}
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>

        </div>

      </div>

      {/* ============================================================
          WEB EMBED SCRIPT MODAL
      ============================================================ */}
      <Dialog open={showWebScriptModal} onOpenChange={(open) => {
        if (!open) router.push('/bots/all')
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-ink">
              <Sparkles className="w-5 h-5 text-accent" /> Bot Deployed Successfully!
            </DialogTitle>
            <DialogDescription className="text-ink-secondary text-xs mt-1">
              Your webchat bot is live. Copy this script tag and paste it right before the closing <code>&lt;/body&gt;</code> tag on your website:
            </DialogDescription>
          </DialogHeader>

          <div className="bg-surface-muted p-4 rounded-xl border border-surface-border relative mt-2 group">
            <pre className="text-[11px] font-mono text-ink-secondary overflow-x-auto whitespace-pre-wrap pr-8">
              {`<script src="${typeof window !== 'undefined' ? window.location.origin : 'https://api.vittain.com'}/widget.js?v=7" data-ctx="${contextId || clientId || ''}" data-bot="${deployedBotId}" defer></script>`}
            </pre>
            <button
              onClick={() => {
                const code = `<script src="${window.location.origin}/widget.js?v=7" data-ctx="${contextId || clientId || ''}" data-bot="${deployedBotId}" defer></script>`
                navigator.clipboard.writeText(code)
                toast.success('Script tag copied to clipboard!')
              }}
              className="absolute top-3 right-3 p-1.5 bg-surface border border-surface-border rounded-md shadow-2xs opacity-80 hover:opacity-100 transition-opacity hover:bg-surface-hover"
              title="Copy script"
            >
              <Copy className="w-3.5 h-3.5 text-ink-muted hover:text-ink" />
            </button>
          </div>

          <DialogFooter className="sm:justify-end mt-4">
            <Button
              type="button"
              onClick={() => router.push('/bots/all')}
              className="bg-accent hover:bg-accent-hover text-white text-xs font-semibold"
            >
              Go to Bots Dashboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
