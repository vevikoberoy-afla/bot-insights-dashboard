'use client'
import { activeWorkspaceId } from '@/lib/client/workspace'

import { useState, useEffect, useCallback } from 'react'
import { 
  Bot, Megaphone, Activity, CheckCircle2, XCircle,
  Loader2, Copy, Search, ArrowLeft, Plus, Settings,
  MessageSquare, MessageCircle, Mail, Send, Hash, Trash2, Pencil, Phone, Eye, EyeOff, CalendarDays, Link2, ShoppingBag, Store
} from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase-browser'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ─── Channel definitions ──────────────────────────────────────────────────
const CHANNEL_DEFS = [
  {
    id: 'whatsapp', name: 'WhatsApp Business', 
    desc: 'Connect your Meta WhatsApp Business account to handle customer conversations.',
    icon: MessageSquare, color: 'text-[#25D366]', bg: 'bg-[#25D366]/10',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp',
    fields: [
      { key: 'instance_name', label: 'Instance Name', placeholder: 'E.g., Sales WA Number 1', type: 'text' },
      { key: 'bot_id', label: 'Assigned Bot', placeholder: 'Choose the bot that owns this number', type: 'bot' },
      { key: 'phone_number_id', label: 'Phone Number ID', placeholder: 'From Meta Developer Dashboard', type: 'text' },
      { key: 'business_account_id', label: 'Business Account ID', placeholder: 'WABA ID from Meta', type: 'text' },
      { key: 'default_country', label: 'Default Phone Country', placeholder: 'IN', type: 'text' },
      { key: 'api_key', label: 'Permanent Access Token', placeholder: 'EAAxxxxx...', type: 'password' },
      { key: 'booking_confirmation_template', label: 'Booking Confirmation Template', placeholder: 'booking_confirmation', type: 'text' },
      { key: 'booking_reminder_template', label: 'Booking Reminder Template', placeholder: 'booking_reminder', type: 'text' },
      { key: 'order_receipt_template', label: 'Order Receipt Template', placeholder: 'order_receipt', type: 'text' },
      { key: 'order_status_template', label: 'Order Status Template', placeholder: 'order_status_update', type: 'text' },
    ]
  },
  {
    id: 'telegram', name: 'Telegram',
    desc: 'Connect a Telegram bot to handle requests and commands from your users.',
    icon: Send, color: 'text-[#229ED9]', bg: 'bg-[#229ED9]/10',
    docsUrl: 'https://core.telegram.org/bots#how-do-i-create-a-bot',
    fields: [
      { key: 'instance_name', label: 'Instance Name', placeholder: 'E.g., Support Bot', type: 'text' },
      { key: 'bot_token', label: 'Bot Token', placeholder: '123456:ABC-DEF1234...', type: 'password' },
    ]
  },
  {
    id: 'sms', name: 'SMS (Twilio)',
    desc: 'Send and receive SMS messages via Twilio for notifications and support.',
    icon: Phone, color: 'text-blue-600', bg: 'bg-blue-500/10',
    docsUrl: 'https://www.twilio.com/docs/sms',
    fields: [
      { key: 'instance_name', label: 'Instance Name', placeholder: 'E.g., Order Notifications', type: 'text' },
      { key: 'account_sid', label: 'Account SID', placeholder: 'ACxxxxxxxxxxxxxxx', type: 'text' },
      { key: 'auth_token', label: 'Auth Token', placeholder: 'Your Twilio auth token', type: 'password' },
      { key: 'from_number', label: 'From Phone Number', placeholder: '+1 415 555 2671', type: 'text' },
    ]
  },
  {
    id: 'email', name: 'Email (SMTP)',
    desc: 'Send transactional emails and manage threaded email conversations.',
    icon: Mail, color: 'text-[#EA4335]', bg: 'bg-[#EA4335]/10',
    docsUrl: 'https://support.google.com/mail/answer/7126229',
    fields: [
      { key: 'instance_name', label: 'Instance Name', placeholder: 'E.g., Support Mailbox', type: 'text' },
      { key: 'bot_id', label: 'Assigned Bot', placeholder: 'Choose the bot that owns this mailbox', type: 'bot' },
      { key: 'email_address', label: 'Inbound Mailbox Address', placeholder: 'support@yourcompany.com', type: 'email' },
      { key: 'from_name', label: 'Sender Name', placeholder: 'Acme Support', type: 'text' },
      { key: 'smtp_host', label: 'SMTP Host', placeholder: 'smtp.gmail.com', type: 'text' },
      { key: 'smtp_port', label: 'SMTP Port', placeholder: '587', type: 'text' },
      { key: 'smtp_user', label: 'SMTP Username', placeholder: 'support@yourcompany.com', type: 'text' },
      { key: 'smtp_pass', label: 'Password / App Password', placeholder: 'Your email password', type: 'password' },
      { key: 'bot_role', label: 'Mailbox Role', placeholder: 'support', type: 'select', options: [{value:'support',label:'Customer Support'},{value:'service',label:'Orders & Service'},{value:'sales',label:'Sales'},{value:'marketing',label:'Marketing'}] },
      { key: 'auto_reply_mode', label: 'Reply Policy', placeholder: 'safe_auto', type: 'select', options: [{value:'safe_auto',label:'Auto-reply to safe FAQs'},{value:'draft_all',label:'Draft everything for approval'},{value:'human_only',label:'Human replies only'}] },
      { key: 'allow_order_lookup', label: 'Order Status Lookups', placeholder: 'true', type: 'select', options: [{value:'true',label:'Enabled'},{value:'false',label:'Disabled'}] },
      { key: 'allow_booking', label: 'Bookings & Appointments', placeholder: 'true', type: 'select', options: [{value:'true',label:'Enabled'},{value:'false',label:'Disabled'}] },
    ]
  },
  {
    id: 'slack', name: 'Slack',
    desc: "Bring Vittain AI directly into your team's Slack workspace for internal support.",
    icon: Hash, color: 'text-[#E01E5A]', bg: 'bg-[#E01E5A]/10',
    docsUrl: 'https://api.slack.com/apps',
    fields: [
      { key: 'instance_name', label: 'Instance Name', placeholder: 'E.g., Team Support Workspace', type: 'text' },
      { key: 'bot_token', label: 'Bot OAuth Token', placeholder: 'xoxb-...', type: 'password' },
      { key: 'signing_secret', label: 'Signing Secret', placeholder: 'From Slack App Dashboard', type: 'password' },
    ]
  },
  {
    id: 'google_calendar', name: 'Google Calendar', desc: 'Read live free/busy information and create, reschedule, or cancel calendar events.',
    icon: CalendarDays, color: 'text-blue-600', bg: 'bg-blue-500/10', docsUrl: 'https://developers.google.com/calendar/api/guides/overview', fields: [
      { key:'instance_name',label:'Instance Name',placeholder:'Sales Calendar',type:'text' }, { key:'calendar_id',label:'Calendar ID',placeholder:'primary',type:'text' },
      { key:'access_token',label:'Access Token',placeholder:'OAuth access token',type:'password' }, { key:'refresh_token',label:'Refresh Token',placeholder:'OAuth refresh token',type:'password' },
      { key:'client_id',label:'OAuth Client ID',placeholder:'Google OAuth client ID',type:'text' }, { key:'client_secret',label:'OAuth Client Secret',placeholder:'Google OAuth client secret',type:'password' },
      { key:'token_expires_at',label:'Access Token Expires At',placeholder:'2027-01-01T00:00:00Z',type:'text' },
    ]
  },
  {
    id:'calendly',name:'Calendly',desc:'Use Calendly live availability and create invitees from the chatbot.',icon:CalendarDays,color:'text-blue-500',bg:'bg-blue-500/10',docsUrl:'https://developer.calendly.com/',fields:[
      {key:'instance_name',label:'Instance Name',placeholder:'Calendly',type:'text'},{key:'access_token',label:'Personal/OAuth Access Token',placeholder:'Token',type:'password'},{key:'event_type_uri',label:'Event Type URI',placeholder:'https://api.calendly.com/event_types/...',type:'text'}]
  },
  {
    id:'acuity',name:'Acuity Scheduling',desc:'Read Acuity availability and create appointments.',icon:CalendarDays,color:'text-violet-600',bg:'bg-violet-500/10',docsUrl:'https://developers.acuityscheduling.com/',fields:[
      {key:'instance_name',label:'Instance Name',placeholder:'Acuity',type:'text'},{key:'user_id',label:'User ID',placeholder:'Acuity user ID',type:'text'},{key:'api_key',label:'API Key',placeholder:'API key',type:'password'},{key:'appointment_type_id',label:'Appointment Type ID',placeholder:'123',type:'text'},{key:'calendar_id',label:'Calendar ID',placeholder:'Optional',type:'text'}]
  },
  {
    id:'custom_calendar',name:'Custom Calendar API',desc:'Connect a compatible availability and booking REST endpoint.',icon:Link2,color:'text-slate-700',bg:'bg-slate-500/10',docsUrl:'/features',fields:[
      {key:'instance_name',label:'Instance Name',placeholder:'Internal Scheduler',type:'text'},{key:'base_url',label:'HTTPS Base URL',placeholder:'https://calendar.example.com/api',type:'text'},{key:'auth_header',label:'Authorization Header',placeholder:'Bearer ...',type:'password'}]
  },
  {
    id:'booking_webhook',name:'Booking & Order Webhook',desc:'Send signed booking, order, stock and waitlist events to a CRM or automation platform.',icon:Link2,color:'text-emerald-700',bg:'bg-emerald-500/10',docsUrl:'/features',fields:[
      {key:'instance_name',label:'Instance Name',placeholder:'CRM webhook',type:'text'},{key:'endpoint_url',label:'HTTPS Endpoint URL',placeholder:'https://crm.example.com/hooks/vittain',type:'text'},{key:'signing_secret',label:'Signing Secret',placeholder:'Strong random secret',type:'password'}]
  },
  {
    id:'shopify',name:'Shopify',desc:'Sync products, variants, inventory, customers and orders into your chatbot catalogue.',icon:ShoppingBag,color:'text-emerald-700',bg:'bg-emerald-500/10',docsUrl:'https://shopify.dev/docs/api/admin-graphql',fields:[
      {key:'instance_name',label:'Instance Name',placeholder:'My Shopify store',type:'text'},
      {key:'bot_id',label:'Assigned Bot',placeholder:'Choose the bot that uses this catalogue',type:'bot'},
      {key:'shop_domain',label:'Permanent Shopify Domain',placeholder:'store.myshopify.com',type:'text'},
      {key:'access_token',label:'Admin API Access Token',placeholder:'shpat_...',type:'password'},
      {key:'webhook_secret',label:'App / Webhook Signing Secret',placeholder:'Shopify app client secret',type:'password'},
      {key:'api_version',label:'Admin API Version',placeholder:'2026-10',type:'text'},
      {key:'write_mode',label:'Chatbot Write Access',placeholder:'read_only',type:'select',options:[{value:'read_only',label:'Read-only + hosted checkout (recommended)'},{value:'orders',label:'Allow order actions'}]},
    ]
  },
  {
    id:'woocommerce',name:'WooCommerce',desc:'Connect a WooCommerce REST API store and keep catalogue, stock and orders synchronized.',icon:Store,color:'text-violet-700',bg:'bg-violet-500/10',docsUrl:'https://woocommerce.github.io/woocommerce-rest-api-docs/',fields:[
      {key:'instance_name',label:'Instance Name',placeholder:'My WooCommerce store',type:'text'},
      {key:'bot_id',label:'Assigned Bot',placeholder:'Choose the bot that uses this catalogue',type:'bot'},
      {key:'store_url',label:'Store URL',placeholder:'https://store.example.com',type:'text'},
      {key:'consumer_key',label:'REST API Consumer Key',placeholder:'ck_...',type:'password'},
      {key:'consumer_secret',label:'REST API Consumer Secret',placeholder:'cs_...',type:'password'},
      {key:'webhook_secret',label:'Webhook Signing Secret',placeholder:'Use a long random secret',type:'password'},
      {key:'write_mode',label:'Chatbot Write Access',placeholder:'read_only',type:'select',options:[{value:'read_only',label:'Read-only + hosted checkout (recommended)'},{value:'orders',label:'Allow order actions'}]},
    ]
  },

]

// ─── Types ────────────────────────────────────────────────────────────────
type Instance = {
  id: string
  channel: string
  instance_name: string
  config: Record<string, string>
  bot_id?: string | null
  status: 'active' | 'paused' | 'error'
  created_at: string
}

type TestResult = { success: boolean; message: string } | null

export default function IntegrationsPage() {
  const supabase = createClient()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [instances, setInstances] = useState<Instance[]>([])
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState<string | null>(null)
  const [workspaceBots, setWorkspaceBots] = useState<Array<{id:string,name:string,purpose?:string}>>([])

  // Form state
  const [isAdding, setIsAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formConfig, setFormConfig] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult>(null)
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})
  const [syncingId, setSyncingId] = useState<string | null>(null)

  const activeChannel = CHANNEL_DEFS.find(c => c.id === selectedId)
  const channelInstances = instances.filter(i => i.channel === selectedId)
  const filtered = CHANNEL_DEFS.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))

  // Fetch session + all instances
  const fetchInstances = useCallback(async (uid: string) => {
    const [res, botsRes] = await Promise.all([fetch(`/api/integrations?client_id=${uid}`), fetch(`/api/bots?client_id=${uid}`)])
    if (res.ok) {
      const data = await res.json()
      setInstances(Array.isArray(data) ? data : [])
    }
    if (botsRes.ok) {
      const data = await botsRes.json()
      setWorkspaceBots(Array.isArray(data) ? data : [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (!error && user) {
        setClientId(activeWorkspaceId(user.id || ''))
        fetchInstances(activeWorkspaceId(user.id || ''))
      } else {
        setLoading(false)
      }
    })
  }, [])

  function openAddForm() {
    setFormConfig({})
    setTestResult(null)
    setEditingId(null)
    setShowSecrets({})
    setIsAdding(true)
  }

  function openEditForm(instance: Instance) {
    setFormConfig({ ...instance.config, instance_name: instance.instance_name, bot_id: instance.bot_id || '' })
    setTestResult(null)
    setEditingId(instance.id)
    setShowSecrets({})
    setIsAdding(true)
  }

  function cancelForm() {
    setIsAdding(false)
    setEditingId(null)
    setFormConfig({})
    setTestResult(null)
  }

  async function handleTest() {
    if (!activeChannel) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/integrations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: selectedId, config: formConfig }),
      })
      const data = await res.json()
      setTestResult(data)
    } catch {
      setTestResult({ success: false, message: 'Network error. Could not reach test server.' })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    if (!clientId || !activeChannel) return
    setSaving(true)
    try {
      const { instance_name, bot_id, ...config } = formConfig
      const payload = {
        client_id: clientId,
        channel: selectedId,
        instance_name: instance_name || activeChannel.name,
        bot_id: bot_id || null,
        config,
      }

      let res: Response
      if (editingId) {
        res = await fetch('/api/integrations', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingId, ...payload }),
        })
      } else {
        res = await fetch('/api/integrations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (res.ok) {
        const saved = await res.json()
        toast.success(editingId ? 'Integration updated!' : 'Integration connected!')
        if (!editingId && ['shopify','woocommerce'].includes(String(selectedId))) {
          setSyncingId(saved.id)
          const sync = await fetch('/api/integrations/commerce/sync', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({integration_id:saved.id,initial:true})})
          const result = await sync.json()
          if (sync.ok) toast.success(`Store imported: ${result.stats?.products || 0} products and ${result.stats?.orders || 0} orders`)
          else toast.error(result.error || 'Store saved, but initial import failed. Use Sync now to retry.')
          setSyncingId(null)
        }
        if (clientId) await fetchInstances(clientId)
        cancelForm()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to save')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleCommerceSync(integrationId: string) {
    setSyncingId(integrationId)
    try {
      const response=await fetch('/api/integrations/commerce/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({integration_id:integrationId})})
      const result=await response.json()
      if(!response.ok)throw new Error(result.error||'Sync failed')
      toast.success(`Synced ${result.stats?.products||0} products and ${result.stats?.orders||0} orders`)
    } catch(error:any) { toast.error(error?.message||'Sync failed') }
    finally { setSyncingId(null) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this integration?')) return
    const res = await fetch(`/api/integrations?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Integration removed')
      if (clientId) await fetchInstances(clientId)
    } else {
      toast.error('Failed to delete')
    }
  }

  // ─── Detail View ────────────────────────────────────────────────────────
  if (selectedId && activeChannel) {
    const Icon = activeChannel.icon
    return (
      <div className="h-full flex flex-col animate-in fade-in duration-300 pb-12">
        <PageHeader title={activeChannel.name} description={activeChannel.desc}>
          <Button variant="outline" onClick={() => { setSelectedId(null); cancelForm() }} className="bg-surface">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Integrations
          </Button>
        </PageHeader>

        <div className="max-w-3xl mt-6 space-y-6">
          {/* Header card */}
          <div className="bg-surface border border-surface-border rounded-xl shadow-sm overflow-hidden">
            <div className="p-5 border-b border-surface-border flex items-center justify-between bg-surface-muted/30">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${activeChannel.bg} ${activeChannel.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-ink">{activeChannel.name}</h2>
                  <a href={activeChannel.docsUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">View Docs →</a>
                </div>
              </div>
              {!isAdding && (
                <Button onClick={openAddForm} className="bg-ink hover:bg-ink-secondary text-white h-8 text-xs">
                  <Plus className="w-4 h-4 mr-1.5" /> Add Instance
                </Button>
              )}
            </div>

            {/* Inbound Webhook Instructions Banner for Email */}
            {activeChannel.id === 'email' && !isAdding && (
              <div className="mx-5 mt-5 p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <Mail className="w-4 h-4 text-blue-600" />
                    Inbound Email Webhook Endpoint
                  </span>
                  <button 
                    onClick={() => {
                      if (typeof window !== 'undefined') {
                        navigator.clipboard.writeText(`${window.location.origin}/api/webhook/email`)
                        toast.success('Inbound email webhook URL copied!')
                      }
                    }}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                  >
                    <Copy className="w-3 h-3" /> Copy URL
                  </button>
                </div>
                <p className="text-[11px] text-blue-800/80 leading-relaxed">
                  Configure SendGrid Inbound Parse, Mailgun Routes, Postmark, or AWS SES to forward customer emails to this webhook URL. Incoming emails will be parsed, matched to contacts, routed to AI or human agents, and displayed live in your Inbox.
                </p>
                <div className="bg-white border border-blue-200/60 rounded px-2.5 py-1.5 font-mono text-[11px] text-blue-950 select-all">
                  {typeof window !== 'undefined' ? `${window.location.origin}/api/webhook/email` : '/api/webhook/email'}
                </div>
              </div>
            )}

            {/* Instances list */}
            {!isAdding && (
              <div className="p-5">
                {channelInstances.length === 0 ? (
                  <div className="border-2 border-dashed border-surface-border rounded-xl py-12 text-center">
                    <Settings className="w-10 h-10 text-ink-muted mx-auto mb-3" />
                    <p className="text-sm font-medium text-ink mb-1">No instances configured yet</p>
                    <p className="text-xs text-ink-secondary">Click "Add Instance" to connect your first {activeChannel.name} account.</p>
                    <Button onClick={openAddForm} variant="outline" className="mt-4 text-xs h-8">
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add Instance
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {channelInstances.map(inst => (
                      <div key={inst.id} className="flex items-center justify-between p-4 border border-surface-border rounded-lg hover:border-accent/30 transition-colors group">
                        <div>
                          <p className="text-sm font-bold text-ink">{inst.instance_name}</p>
                          <p className="text-xs text-ink-muted mt-0.5">{['email','whatsapp'].includes(activeChannel.id) ? `${activeChannel.id==='email'?(inst.config?.email_address || inst.config?.smtp_user || 'Mailbox'):(inst.config?.phone_number_id || 'WhatsApp number')} · ${workspaceBots.find(bot => bot.id === inst.bot_id)?.name || 'Unassigned'}` : `ID: ${inst.id.slice(0, 16)}...`}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {activeChannel.id==='google_calendar'&&<Button variant="outline" size="sm" onClick={()=>{window.location.href=`/api/integrations/google-oauth?integration_id=${inst.id}`}}>Connect OAuth</Button>}
                          {['shopify','woocommerce'].includes(activeChannel.id)&&<Button variant="outline" size="sm" disabled={syncingId===inst.id} onClick={()=>handleCommerceSync(inst.id)}>{syncingId===inst.id?<><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/>Syncing</>:'Sync now'}</Button>}
                          <span className={cn(
                            "flex items-center text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border",
                            inst.status === 'active'
                              ? "text-status-green bg-status-greenBg border-status-green/20"
                              : "text-ink-muted bg-surface-muted border-surface-border"
                          )}>
                            {inst.status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-status-green mr-1.5 animate-pulse" />}
                            {inst.status}
                          </span>
                          <Button variant="ghost" size="icon" className="w-8 h-8 text-ink-secondary hover:text-ink" onClick={() => openEditForm(inst)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-8 h-8 text-ink-secondary hover:text-red-500" onClick={() => handleDelete(inst.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Add / Edit Form */}
            {isAdding && (
              <div className="p-5 animate-in slide-in-from-right-4 duration-300">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-sm font-bold text-ink">{editingId ? 'Edit Instance' : 'Configure New Instance'}</h3>
                  <Button variant="ghost" size="sm" onClick={cancelForm} className="text-ink-secondary h-7 text-xs">Cancel</Button>
                </div>

                <div className="space-y-4">
                  {activeChannel.fields.map(field => (
                    <div key={field.key}>
                      <Label className="text-[11px] uppercase tracking-wider text-ink-muted font-bold">{field.label}</Label>
                      <div className="relative mt-1.5">
                        {field.type === 'bot' ? <select
                          value={formConfig[field.key] || ''}
                          onChange={e => setFormConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        ><option value="">Select a bot…</option>{workspaceBots.map(bot => <option key={bot.id} value={bot.id}>{bot.name}{bot.purpose ? ` · ${bot.purpose}` : ''}</option>)}</select> : field.type === 'select' ? <select
                          value={formConfig[field.key] || field.placeholder || ''}
                          onChange={e => setFormConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        >{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <Input
                          type={field.type === 'password' && showSecrets[field.key] ? 'text' : field.type}
                          placeholder={field.key === 'smtp_pass' && formConfig._has_smtp_pass === 'true' ? 'Saved securely — leave blank to keep it' : field.placeholder}
                          value={formConfig[field.key] || ''}
                          onChange={e => setFormConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                          className={cn("text-sm", field.type === 'password' && "pr-10")}
                        />}
                        {field.type === 'password' && (
                          <button
                            type="button"
                            onClick={() => setShowSecrets(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition-colors"
                          >
                            {showSecrets[field.key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Webhook callback URL for messaging channels */}
                  {['whatsapp', 'telegram', 'slack', 'sms', 'shopify', 'woocommerce'].includes(selectedId) && (
                    <div className="pt-2">
                      <Label className="text-[11px] uppercase tracking-wider text-ink-muted font-bold">Webhook Callback URL</Label>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Input readOnly value={typeof window!=='undefined'?`${window.location.origin}${['shopify','woocommerce'].includes(selectedId)?`/api/integrations/${selectedId}/webhook`:`/api/webhook/${selectedId}`}`:`/api/integrations/${selectedId}/webhook`} className="bg-surface-muted text-ink-muted text-xs font-mono" />
                        <Button variant="outline" size="icon" className="shrink-0" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}${['shopify','woocommerce'].includes(selectedId)?`/api/integrations/${selectedId}/webhook`:`/api/webhook/${selectedId}`}`); toast.success('Copied!') }}>
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                      <p className="text-[10px] text-ink-muted mt-1.5">Paste this URL into your {activeChannel.name} developer dashboard under "Webhooks".</p>
                    </div>
                  )}
                </div>

                {/* Test result banner */}
                {testResult && (
                  <div className={cn(
                    "mt-5 p-3 rounded-lg border flex items-start gap-3 text-sm",
                    testResult.success
                      ? "bg-green-50 border-green-200 text-green-800"
                      : "bg-red-50 border-red-200 text-red-800"
                  )}>
                    {testResult.success
                      ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-green-500" />
                      : <XCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-500" />}
                    <span>{testResult.message}</span>
                  </div>
                )}

                <div className="pt-5 mt-5 border-t border-surface-border flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={handleTest}
                    disabled={testing}
                    className="bg-surface-muted"
                  >
                    {testing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testing...</> : 'Test Connection'}
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-accent hover:bg-accent-hover text-white shadow-sm"
                  >
                    {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...</> : editingId ? 'Update Integration' : 'Save Integration'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ─── Main Grid View ──────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 pb-12">
      <PageHeader title="Integrations" description="Connect your channels and infrastructure to power your bots and campaigns." />

      <div className="mb-8 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted w-4 h-4" />
          <Input
            placeholder="Search integrations..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-surface shadow-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map(ch => {
          const Icon = ch.icon
          const count = instances.filter(i => i.channel === ch.id).length
          const isConnected = count > 0

          return (
            <div
              key={ch.id}
              className="bg-surface border border-surface-border rounded-xl p-5 flex flex-col hover:border-accent/40 hover:shadow-sm transition-all cursor-pointer group"
              onClick={() => setSelectedId(ch.id)}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${ch.bg} ${ch.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-ink">{ch.name}</h3>
                    {isConnected && (
                      <p className="text-[10px] text-ink-muted">{count} instance{count > 1 ? 's' : ''}</p>
                    )}
                  </div>
                </div>
                {isConnected ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 bg-status-greenBg text-status-green border border-status-green/20 font-bold text-[9px] uppercase tracking-wider rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-status-green animate-pulse" /> Connected
                  </span>
                ) : (
                  <span className="px-2 py-0.5 bg-surface-muted text-ink-muted border border-surface-border font-bold text-[9px] uppercase tracking-wider rounded-full">Available</span>
                )}
              </div>

              <p className="text-xs text-ink-secondary leading-relaxed line-clamp-2 flex-1">{ch.desc}</p>

              <div className="mt-4 pt-4 border-t border-surface-border flex justify-end">
                <span className="text-xs text-accent font-medium group-hover:underline flex items-center gap-1">
                  <Settings className="w-3.5 h-3.5" /> Configure
                </span>
              </div>
            </div>
          )
        })}

        <div className="bg-surface-muted/30 border border-dashed border-surface-border rounded-xl p-5 flex flex-col items-center justify-center text-center min-h-[160px] cursor-pointer hover:bg-surface-muted transition-colors" onClick={() => toast.info('Custom integrations coming soon!')}>
          <div className="w-10 h-10 bg-surface border border-surface-border rounded-full flex items-center justify-center text-ink-muted mb-3 shadow-sm">
            <Plus className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-ink mb-1">Request Channel</h3>
          <p className="text-xs text-ink-secondary max-w-[160px]">Need a custom channel or webhook? Let us know.</p>
        </div>
      </div>
    </div>
  )
}
