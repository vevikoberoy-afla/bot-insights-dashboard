'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { 
  Zap, Plus, Trash2, Play, Pause, Save, Clock, Settings2, 
  ArrowUpRight, BarChart2, CheckCircle2, ShoppingCart, Phone, 
  Search, Gift, ChevronDown, Check, Globe, RefreshCw, Copy,
  Layout, MessageSquare, Radio, Sparkles, ExternalLink, ShieldCheck, Mail, MessageCircle
} from 'lucide-react'
import { 
  Select, SelectContent, SelectGroup, SelectItem, 
  SelectTrigger, SelectValue, SelectLabel 
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ─── TYPES ───────────────────────────────────────────────
export type Condition = { 
  id: string
  event: string
  operator: string
  value: string
  value2?: string 
}

export type Action = { 
  id: string
  type: string
  channel: string
  message?: string
  message_type?: string
  delay_seconds?: number
  coupon_code?: string
  discount_text?: string
  webhook_url?: string
  target_section?: string 
  popup_style?: string
  tone?: string
  auto_dismiss_seconds?: number
  cta_text?: string
  cta_url?: string
  returns_ask_order_msg?: string
  returns_check_7_days?: boolean
  returns_ask_issue_msg?: string
  returns_ticket_msg?: string
}

export type TriggerRule = {
  id: string
  bot_id?: string | null
  client_id?: string
  name: string
  description: string
  status: string
  conditions: Condition[]
  actions: Action[]
  frequency_per_session: number
  frequency_per_day: number
  min_gap_minutes: number
  fire_count?: number
  created_at?: string
  bots?: { id: string; name: string } | null
  channels?: string[]
  tone?: string
  popup_style?: string
  delay_seconds?: number
  auto_dismiss_seconds?: number
  cta_text?: string
  cta_url?: string
}

const EVENT_TYPES = [
  { val: 'intent_detected', label: 'Intent Detected (Natural Language)', icon: MessageCircle },
  { val: 'cart_updated', label: 'Cart Updated (Basket Value)', icon: ShoppingCart },
  { val: 'exit_intent', label: 'Exit Intent (Mouse Leaves Viewport)', icon: ArrowUpRight },
  { val: 'idle_time', label: 'User Inactive / Idle Time', icon: Clock },
  { val: 'page_url', label: 'Page URL Visited', icon: Globe },
  { val: 'time_on_page', label: 'Time Spent on Page', icon: Clock },
  { val: 'product_viewed', label: 'Product Viewed', icon: Search },
  { val: 'visit_count', label: 'Visit Frequency', icon: RefreshCw },
  { val: 'scroll_depth', label: 'Scroll Depth (%)', icon: ArrowUpRight },
  { val: 'custom_event', label: 'Custom Javascript Event', icon: Zap },
]

const OPERATORS: Record<string, string[]> = {
  intent_detected: ['equals', 'contains'],
  cart_updated: ['>=', '<=', 'between'],
  exit_intent: ['is_true'],
  idle_time: ['>='],
  page_url: ['contains', 'equals', 'starts_with', 'ends_with'],
  time_on_page: ['>='],
  product_viewed: ['count >=', 'product_id =', 'category ='],
  visit_count: ['=', '>=', 'is_first_visit', 'is_returning'],
  scroll_depth: ['>='],
  custom_event: ['event_name ='],
}

const ACTION_TYPES = [
  { val: 'whatsapp_gate', label: '🎁 Show WhatsApp Coupon Gate (Lead Magnet)' },
  { val: 'send_message', label: '💬 Send Widget Message (Callout or Full)' },
  { val: 'send_whatsapp', label: '📱 Send WhatsApp Message' },
  { val: 'fire_mcp', label: '⚡ Fire MCP Action (Webhook)' },
  { val: 'trigger_flow', label: '🤖 Trigger Bot Flow Section' },
  { val: 'returns_flow', label: '🔄 Interactive Returns & Replacement Flow' },
]

// Pre-built trigger templates specifically tailored for cart recovery & upsell
export const PREBUILT_TEMPLATES = [
  {
    id: 'tpl_wa_coupon_gate',
    category: 'Lead Capture & Cart Recovery',
    name: 'WhatsApp Coupon Unlock Gate',
    badge: 'Lead Magnet',
    icon: '🎁',
    description: 'Pops an inline WhatsApp number gate in chat when cart reaches ₹1000. Visitor enters phone to receive coupon, immediately turning them into a qualified WhatsApp lead.',
    rule: {
      name: 'WhatsApp Coupon Unlock Gate (Cart >= ₹1000)',
      description: 'Captures shopper WhatsApp phone in exchange for unlocking coupon discount',
      status: 'active',
      conditions: [{ event: 'cart_updated', operator: '>=', value: '1000' }],
      actions: [{
        type: 'whatsapp_gate',
        channel: 'web',
        coupon_code: 'SAVE500',
        discount_text: 'FLAT ₹500 OFF (Code: SAVE500)',
        message: 'Enter your WhatsApp number to unlock your exclusive discount and save your cart!',
        delay_seconds: 3,
      }],
      frequency_per_session: 1,
      frequency_per_day: 2,
      min_gap_minutes: 5,
    }
  },
  {
    id: 'tpl_returns_flow',
    category: 'Customer Service & Handoff',
    name: 'Returns & Replacements Handoff Flow',
    badge: 'Support automation',
    icon: '🔄',
    description: 'When a user asks to return an item, automatically asks for Order ID, checks the 7-day return policy, collects issue details, and raises a ticket before handing off to a human agent.',
    rule: {
      name: 'Returns & Replacements Flow',
      description: 'Automated return triage and ticket creation',
      status: 'active',
      conditions: [{ event: 'intent_detected', operator: 'contains', value: 'return, replacement, refund' }],
      actions: [{
        type: 'returns_flow',
        channel: 'web',
        returns_ask_order_msg: 'I can certainly help you with your return/replacement. Could you please provide your Order ID?',
        returns_check_7_days: true,
        returns_ask_issue_msg: 'Thank you. Could you briefly describe the issue with the item?',
        returns_ticket_msg: "I've created a support ticket for your return request. A team member will assist you shortly.",
        delay_seconds: 0,
      }],
      frequency_per_session: 1,
      frequency_per_day: 1,
      min_gap_minutes: 0,
    }
  },
  {
    id: 'tpl_cart_upsell_gap',
    category: 'E-Commerce Upsell',
    name: 'Cart Upsell (Dynamic Gap Callout)',
    badge: 'AOV Booster',
    icon: '🛒',
    description: 'Dynamic callout bubble calculating the exact amount needed to unlock discount: "You are only ₹{{missing_amount}} away from FLAT ₹500 OFF!"',
    rule: {
      name: 'Cart Upsell Gap Callout (Target ₹2000)',
      description: 'Nudges shoppers close to ₹2000 threshold to add more items',
      status: 'active',
      conditions: [{ event: 'cart_updated', operator: 'between', value: '1000', value2: '1999' }],
      actions: [{
        type: 'send_message',
        channel: 'web',
        message_type: 'callout',
        message: "You're only ₹{{missing_amount}} away from unlocking FLAT ₹500 OFF! Add a little more to qualify.",
        delay_seconds: 2,
      }],
      frequency_per_session: 1,
      frequency_per_day: 3,
      min_gap_minutes: 3,
    }
  },
  {
    id: 'tpl_exit_intent_wa',
    category: 'Cart Abandonment',
    name: 'Exit Intent WhatsApp Cart Saver',
    badge: 'Bounce Recovery',
    icon: '🏃',
    description: 'Fires when mouse leaves viewport. Offers an instant 15% discount code delivered to their WhatsApp before they close the tab.',
    rule: {
      name: 'Exit Intent Cart Saver (WhatsApp Gate)',
      description: 'Captures phone number when user shows exit intent with items in cart',
      status: 'active',
      conditions: [
        { event: 'exit_intent', operator: 'is_true', value: '' },
        { event: 'cart_updated', operator: '>=', value: '300' }
      ],
      actions: [{
        type: 'whatsapp_gate',
        channel: 'web',
        coupon_code: 'CART15',
        discount_text: '15% OFF Your Cart (Code: CART15)',
        message: "Wait! Don't leave your items behind. Enter your WhatsApp number to claim your 15% coupon now.",
        delay_seconds: 0,
      }],
      frequency_per_session: 1,
      frequency_per_day: 1,
      min_gap_minutes: 10,
    }
  },
  {
    id: 'tpl_high_value_vip',
    category: 'VIP Concierge',
    name: 'High Value Cart VIP Greeting',
    badge: 'High Ticket',
    icon: '💎',
    description: 'Automatically greets shoppers with carts exceeding ₹3,000 with priority concierge support and VIP discount code.',
    rule: {
      name: 'High Value Cart VIP Greeting (₹3000+)',
      description: 'Offers VIP assistance and exclusive VIP20 coupon for high-order shoppers',
      status: 'active',
      conditions: [{ event: 'cart_updated', operator: '>=', value: '3000' }],
      actions: [{
        type: 'send_message',
        channel: 'web',
        message_type: 'full',
        message: "Hello VIP! 🌟 You've qualified for complimentary priority shipping + 20% off using code VIP20 at checkout. How can I help you today?",
        delay_seconds: 2,
      }],
      frequency_per_session: 1,
      frequency_per_day: 2,
      min_gap_minutes: 10,
    }
  },
  {
    id: 'tpl_idle_cart_help',
    category: 'Assistance',
    name: 'Idle Cart Assistance Reminder',
    badge: 'Checkout Help',
    icon: '⏳',
    description: 'Triggers when a visitor has cart items but remains inactive for 45+ seconds. Helps unblock doubts on sizing, shipping or checkout.',
    rule: {
      name: 'Idle Cart Reminder (45s Inactivity)',
      description: 'Prompts shoppers hesitating on cart or checkout pages',
      status: 'active',
      conditions: [
        { event: 'idle_time', operator: '>=', value: '45' },
        { event: 'cart_updated', operator: '>=', value: '100' }
      ],
      actions: [{
        type: 'send_message',
        channel: 'web',
        message_type: 'callout',
        message: "Still thinking about your cart? I'm right here if you have any questions about sizes, delivery or returns!",
        delay_seconds: 0,
      }],
      frequency_per_session: 1,
      frequency_per_day: 2,
      min_gap_minutes: 5,
    }
  },
]

function newCondition(): Condition {
  return { id: Date.now().toString() + Math.random().toString(36).substr(2, 4), event: 'cart_updated', operator: '>=', value: '1000' }
}

function newAction(channel: string = 'web'): Action {
  if (channel !== 'web') {
    return { 
      id: Date.now().toString() + Math.random().toString(36).substr(2, 4), 
      type: channel === 'whatsapp' ? 'send_whatsapp' : 'send_message', 
      channel: channel, 
      message: 'Hello! How can I assist you today?' 
    }
  }
  return { 
    id: Date.now().toString() + Math.random().toString(36).substr(2, 4), 
    type: 'whatsapp_gate', 
    channel: 'web', 
    coupon_code: 'SAVE500',
    discount_text: 'FLAT ₹500 OFF (Code: SAVE500)',
    message: 'Enter your WhatsApp number to receive your coupon code and save your cart.' 
  }
}

function newEmptyRule(botId: string, channel: string = 'web'): TriggerRule {
  const isWeb = channel === 'web' || !channel
  return {
    id: `new_${Date.now()}`,
    bot_id: botId,
    name: isWeb ? 'New Cart Upsell Trigger' : 'New Inbound Trigger Rule',
    description: '',
    status: 'active',
    conditions: [newCondition()],
    actions: [newAction(channel)],
    frequency_per_session: 1,
    frequency_per_day: 3,
    min_gap_minutes: 5,
    fire_count: 0,
    channels: [isWeb ? 'web_chat' : (channel === 'whatsapp' ? 'whatsapp' : channel === 'email' ? 'email' : channel)],
    tone: 'casual',
    popup_style: 'callout',
    delay_seconds: 3,
    auto_dismiss_seconds: 0,
    cta_text: '',
    cta_url: '',
  }
}

export function TriggersTab({ botId, clientId, botChannel = 'web' }: { botId: string; clientId: string; botChannel?: string }) {
  const isWeb = botChannel === 'web' || !botChannel
  const [rules, setRules] = useState<TriggerRule[]>([])
  const [clientWideRules, setClientWideRules] = useState<TriggerRule[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<TriggerRule | null>(null)
  
  // Live simulation test state
  const [simEvent, setSimEvent] = useState('cart_updated')
  const [simValue, setSimValue] = useState('1450')
  const [simResult, setSimResult] = useState<{ 
    fired: boolean; 
    reason: string; 
    output?: string; 
    type?: string; 
    coupon?: string;
    style?: string;
    tone?: string;
    ctaText?: string;
    ctaUrl?: string;
  } | null>(null)

  useEffect(() => {
    fetchRules()
    fetchClientWideRules()
  }, [botId, clientId])

  const fetchRules = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/bots/${botId}/triggers`)
      if (res.ok) {
        const data = await res.json()
        setRules(Array.isArray(data) ? data : [])
      }
    } catch {}
    setLoading(false)
  }

  const fetchClientWideRules = async () => {
    if (!clientId) return
    try {
      const res = await fetch(`/api/bots/triggers?client_id=${clientId}`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data)) {
          // Filter to rules not specifically assigned to this bot
          setClientWideRules(data.filter(r => r.bot_id !== botId))
        }
      }
    } catch {}
  }

  const saveRule = async (rule: TriggerRule) => {
    try {
      const isNew = rule.id.startsWith('new_')
      const method = isNew ? 'POST' : 'PUT'
      const payload = isNew 
        ? { ...rule, client_id: clientId, bot_id: botId, id: undefined }
        : { ...rule, client_id: clientId, bot_id: botId }
      
      const res = await fetch(`/api/bots/${botId}/triggers`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        toast.success(isNew ? 'Trigger rule created' : 'Trigger rule updated')
        setEditing(null)
        fetchRules()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to save rule')
      }
    } catch {
      toast.error('Failed to save trigger rule')
    }
  }

  const toggleRuleStatus = async (rule: TriggerRule) => {
    const newStatus = rule.status === 'active' ? 'paused' : 'active'
    try {
      const res = await fetch(`/api/bots/${botId}/triggers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, status: newStatus })
      })
      if (res.ok) {
        setRules(prev => prev.map(r => r.id === rule.id ? { ...r, status: newStatus } : r))
        toast.success(`Rule ${newStatus === 'active' ? 'activated' : 'paused'}`)
      }
    } catch {
      toast.error('Failed to update status')
    }
  }

  const deleteRule = async (id: string) => {
    if (id.startsWith('new_')) {
      setEditing(null)
      return
    }
    if (!confirm('Are you sure you want to delete this trigger rule?')) return
    try {
      const res = await fetch(`/api/bots/${botId}/triggers?triggerId=${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Trigger rule deleted')
        if (editing?.id === id) setEditing(null)
        fetchRules()
      }
    } catch {
      toast.error('Failed to delete rule')
    }
  }

  const applyPrebuiltTemplate = (tpl: typeof PREBUILT_TEMPLATES[0]) => {
    const fresh = newEmptyRule(botId, botChannel)
    fresh.name = tpl.rule.name
    fresh.description = tpl.rule.description
    fresh.status = tpl.rule.status
    fresh.conditions = tpl.rule.conditions.map(c => ({
      id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
      event: c.event,
      operator: c.operator,
      value: c.value,
      value2: (c as any).value2 || ''
    }))
    fresh.actions = tpl.rule.actions.map(a => ({
      id: Date.now().toString() + Math.random().toString(36).substr(2, 4),
      type: a.type,
      channel: a.channel,
      coupon_code: (a as any).coupon_code || '',
      discount_text: (a as any).discount_text || '',
      message: a.message || '',
      message_type: (a as any).message_type || 'callout',
      delay_seconds: a.delay_seconds || 0,
      returns_ask_order_msg: (a as any).returns_ask_order_msg,
      returns_check_7_days: (a as any).returns_check_7_days,
      returns_ask_issue_msg: (a as any).returns_ask_issue_msg,
      returns_ticket_msg: (a as any).returns_ticket_msg,
    }))
    fresh.frequency_per_session = tpl.rule.frequency_per_session
    fresh.frequency_per_day = tpl.rule.frequency_per_day
    fresh.min_gap_minutes = tpl.rule.min_gap_minutes
    fresh.channels = isWeb ? ((tpl.rule as any).channels || ['web_chat']) : [botChannel === 'whatsapp' ? 'whatsapp' : botChannel === 'email' ? 'email' : botChannel]
    fresh.tone = (tpl.rule as any).tone || 'casual'
    fresh.popup_style = (tpl.rule as any).popup_style || 'callout'
    fresh.delay_seconds = (tpl.rule as any).delay_seconds ?? 3
    fresh.auto_dismiss_seconds = (tpl.rule as any).auto_dismiss_seconds || 0
    fresh.cta_text = (tpl.rule as any).cta_text || ''
    fresh.cta_url = (tpl.rule as any).cta_url || ''

    setEditing(fresh)
    toast.info(`Loaded "${tpl.name}" template. Review and click Save.`)
  }

  const copyClientWideRule = (sourceRule: TriggerRule) => {
    const fresh = newEmptyRule(botId, botChannel)
    fresh.name = `${sourceRule.name} (Copy)`
    fresh.description = sourceRule.description || ''
    fresh.status = 'active'
    fresh.conditions = (sourceRule.conditions || []).map(c => ({ ...c, id: Date.now().toString() + Math.random() }))
    fresh.actions = (sourceRule.actions || []).map(a => ({ ...a, id: Date.now().toString() + Math.random() }))
    fresh.frequency_per_session = sourceRule.frequency_per_session || 1
    fresh.frequency_per_day = sourceRule.frequency_per_day || 3
    fresh.min_gap_minutes = sourceRule.min_gap_minutes || 5
    fresh.channels = isWeb ? (sourceRule.channels || ['web_chat']) : [botChannel === 'whatsapp' ? 'whatsapp' : botChannel === 'email' ? 'email' : botChannel]
    fresh.tone = sourceRule.tone || 'casual'
    fresh.popup_style = sourceRule.popup_style || 'callout'
    fresh.delay_seconds = sourceRule.delay_seconds || 0
    fresh.auto_dismiss_seconds = sourceRule.auto_dismiss_seconds || 0
    fresh.cta_text = sourceRule.cta_text || ''
    fresh.cta_url = sourceRule.cta_url || ''

    setEditing(fresh)
    toast.info(`Loaded "${sourceRule.name}" into editor.`)
  }

  // Live simulation evaluator
  const runSimulation = () => {
    if (!editing) return
    const mockVal = parseFloat(simValue) || 0
    let wouldFire = true
    let failureReason = ''

    for (const cond of editing.conditions) {
      if (cond.event === simEvent) {
        const targetVal = parseFloat(cond.value) || 0
        const targetVal2 = parseFloat(cond.value2 || '0') || 0

        if (cond.operator === '>=' && !(mockVal >= targetVal)) {
          wouldFire = false
          failureReason = `Mock value (${mockVal}) is less than required threshold (${targetVal})`
          break
        }
        if (cond.operator === '<=' && !(mockVal <= targetVal)) {
          wouldFire = false
          failureReason = `Mock value (${mockVal}) is greater than maximum (${targetVal})`
          break
        }
        if (cond.operator === 'between' && !(mockVal >= targetVal && mockVal <= targetVal2)) {
          wouldFire = false
          failureReason = `Mock value (${mockVal}) is not between ${targetVal} and ${targetVal2}`
          break
        }
        if (cond.operator === 'is_true') {
          // exit_intent matches
        }
      }
    }

    if (!wouldFire) {
      setSimResult({ fired: false, reason: failureReason })
      return
    }

    const firstAction = editing.actions[0]
    let missing = 0
    const cartCond = editing.conditions.find(c => c.event === 'cart_updated')
    if (cartCond) {
      const target = cartCond.value2 ? parseFloat(cartCond.value2) : parseFloat(cartCond.value) + 500
      missing = Math.max(0, target - mockVal)
    }

    const renderedMsg = (firstAction?.message || '')
      .replace(/\{\{cart_value\}\}/g, `₹${mockVal}`)
      .replace(/\{\{missing_amount\}\}/g, `₹${missing}`)
      .replace(/\{\{customer_name\}\}/g, 'Alex')
      .replace(/\{\{currency\}\}/g, 'INR')

    setSimResult({
      fired: true,
      reason: `All conditions matched for ${simEvent}!`,
      output: renderedMsg,
      type: firstAction?.type,
      coupon: firstAction?.coupon_code,
      style: editing.popup_style || firstAction?.message_type || 'callout',
      tone: editing.tone || 'casual',
      ctaText: editing.cta_text || '',
      ctaUrl: editing.cta_url || '',
    })
  }

  // ─── EDITING VIEW ───────────────────────────────────────────
  if (editing) {
    return (
      <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-md bg-accent/10 flex items-center justify-center text-accent text-xs font-bold">
                <Zap className="w-3.5 h-3.5" />
              </span>
              <h2 className="text-lg font-bold text-ink">
                {editing.id.startsWith('new_') ? 'Create Proactive Trigger' : 'Edit Proactive Trigger'}
              </h2>
            </div>
            <p className="text-xs text-ink-secondary mt-1">
              Configure visitor behavior conditions, cart upsell rules, and WhatsApp lead capture gates.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(null)} className="h-8 text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={() => saveRule(editing)} className="h-8 text-xs bg-ink text-white hover:bg-ink-secondary">
              <Save className="w-3.5 h-3.5 mr-1.5" /> Save Rule
            </Button>
          </div>
        </div>

        {/* 2-column layout: Config form + Live Simulator */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">

            {/* Basic Info */}
            <div className="bg-surface border border-surface-border rounded-xl p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1.5 block">
                    Trigger Rule Name
                  </Label>
                  <Input 
                    value={editing.name} 
                    onChange={e => setEditing({ ...editing, name: e.target.value })} 
                    className="h-9 text-sm" 
                    placeholder="e.g. Cart Upsell ₹1000 threshold"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1.5 block">
                    Internal Description
                  </Label>
                  <Input 
                    value={editing.description} 
                    onChange={e => setEditing({ ...editing, description: e.target.value })} 
                    className="h-9 text-sm" 
                    placeholder="Optional notes for your team"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Switch 
                  checked={editing.status === 'active'} 
                  onCheckedChange={v => setEditing({ ...editing, status: v ? 'active' : 'paused' })} 
                />
                <span className="text-sm font-semibold text-ink">
                  {editing.status === 'active' ? 'Rule Active' : 'Rule Paused'}
                </span>
                <span className="text-xs text-ink-muted">
                  {editing.status === 'active' ? '(Will fire automatically for eligible visitors)' : '(Temporarily disabled)'}
                </span>
              </div>
            </div>

            {/* Strict Channel Gating */}
            <div className="bg-surface border border-surface-border rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-surface-border pb-3">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-accent" />
                  <h3 className="text-sm font-bold text-ink">Channel Delivery (Strict Channel Gating)</h3>
                </div>
                <span className="text-[11px] text-ink-muted">Only selected channels will execute this trigger</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { id: 'web_chat', label: 'Web Chatbot', icon: MessageCircle, desc: 'Realtime widget popup / callout' },
                  { id: 'whatsapp', label: 'WhatsApp', icon: Phone, desc: 'Direct WhatsApp message campaign' },
                  { id: 'email', label: 'Email', icon: Mail, desc: 'Email triage / campaign alert' },
                ].map(ch => {
                  const currentChannels = editing.channels || ['web_chat']
                  const isChecked = currentChannels.includes(ch.id)
                  const Icon = ch.icon
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => {
                        const updated = isChecked
                          ? currentChannels.filter(c => c !== ch.id)
                          : [...currentChannels, ch.id]
                        if (updated.length === 0) return
                        setEditing({ ...editing, channels: updated })
                      }}
                      className={cn(
                        "p-3 rounded-xl border text-left transition-all flex flex-col justify-between",
                        isChecked
                          ? "bg-accent/5 border-accent/40 shadow-sm ring-1 ring-accent/20"
                          : "bg-surface-muted/10 border-surface-border hover:bg-surface-muted/20 opacity-70"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="flex items-center gap-1.5 font-bold text-xs text-ink">
                          <Icon className={cn("w-3.5 h-3.5", isChecked ? "text-accent" : "text-ink-muted")} />
                          {ch.label}
                        </span>
                        <div className={cn(
                          "w-4 h-4 rounded-full flex items-center justify-center text-[10px]",
                          isChecked ? "bg-accent text-white font-bold" : "border border-surface-border"
                        )}>
                          {isChecked ? '✓' : ''}
                        </div>
                      </div>
                      <span className="text-[10px] text-ink-secondary">{ch.desc}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* IF Conditions */}
            <div className="bg-surface border border-surface-border rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-3.5 border-b border-surface-border bg-blue-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-blue-500 text-white flex items-center justify-center text-[10px] font-bold">IF</span>
                  <h3 className="text-sm font-bold text-ink">Customer Behavior Conditions</h3>
                </div>
                <span className="text-xs text-ink-muted">All conditions must match (AND)</span>
              </div>

              <div className="p-5 space-y-3 bg-surface-muted/5">
                {editing.conditions.map((cond, i) => (
                  <div key={cond.id} className="flex flex-wrap items-center gap-2 bg-surface p-3 rounded-lg border border-surface-border">
                    <span className="text-[10px] font-bold text-blue-600 w-12 text-center uppercase shrink-0">
                      {i === 0 ? 'WHEN' : 'AND'}
                    </span>

                    {/* Event Type */}
                    <select 
                      value={cond.event} 
                      onChange={e => {
                        const evt = e.target.value
                        const newConds = [...editing.conditions]
                        newConds[i] = { ...cond, event: evt, operator: OPERATORS[evt]?.[0] || '>=' }
                        setEditing({ ...editing, conditions: newConds })
                      }} 
                      className="h-8 border border-surface-border rounded-md px-2 text-xs bg-surface font-medium text-ink"
                    >
                      {EVENT_TYPES.map(e => <option key={e.val} value={e.val}>{e.label}</option>)}
                    </select>

                    {/* Operator */}
                    <select 
                      value={cond.operator} 
                      onChange={e => {
                        const newConds = [...editing.conditions]
                        newConds[i] = { ...cond, operator: e.target.value }
                        setEditing({ ...editing, conditions: newConds })
                      }} 
                      className="h-8 border border-surface-border rounded-md px-2 text-xs bg-surface font-mono text-ink"
                    >
                      {(OPERATORS[cond.event] || ['=']).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>

                    {/* Value */}
                    {!['is_true', 'is_first_visit', 'is_returning'].includes(cond.operator) && (
                      <Input 
                        value={cond.value} 
                        onChange={e => {
                          const newConds = [...editing.conditions]
                          newConds[i] = { ...cond, value: e.target.value }
                          setEditing({ ...editing, conditions: newConds })
                        }} 
                        className="h-8 flex-1 min-w-[120px] text-xs" 
                        placeholder={cond.event === 'cart_updated' ? 'Cart value in ₹ (e.g. 1000)' : 'Threshold value'} 
                      />
                    )}

                    {/* Between second value */}
                    {cond.operator === 'between' && (
                      <>
                        <span className="text-xs text-ink-muted">and</span>
                        <Input 
                          value={cond.value2 || ''} 
                          onChange={e => {
                            const newConds = [...editing.conditions]
                            newConds[i] = { ...cond, value2: e.target.value }
                            setEditing({ ...editing, conditions: newConds })
                          }} 
                          className="h-8 w-24 text-xs" 
                          placeholder="Upper ₹" 
                        />
                      </>
                    )}

                    {editing.conditions.length > 1 && (
                      <button 
                        onClick={() => setEditing({ ...editing, conditions: editing.conditions.filter((_, j) => j !== i) })} 
                        className="w-7 h-7 flex items-center justify-center rounded text-ink-muted hover:bg-red-50 hover:text-red-500 transition-colors ml-auto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}

                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setEditing({ ...editing, conditions: [...editing.conditions, newCondition()] })} 
                  className="h-8 text-xs text-blue-600 border-blue-200 hover:bg-blue-50 mt-1"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add AND Condition
                </Button>
              </div>
            </div>

            {/* THEN Actions */}
            <div className="bg-surface border border-surface-border rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-3.5 border-b border-surface-border bg-emerald-50/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold">THEN</span>
                  <h3 className="text-sm font-bold text-ink">Action & Proactive Message</h3>
                </div>
                <span className="text-xs text-ink-muted">Supports WhatsApp Capture & Dynamic Variables</span>
              </div>

              <div className="p-5 space-y-4 bg-surface-muted/5">
                {editing.actions.map((act, i) => (
                  <div key={act.id} className="border border-surface-border rounded-xl p-4 space-y-4 bg-surface shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <Label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-1 block">
                          Action Type
                        </Label>
                        <select 
                          value={act.type} 
                          onChange={e => {
                            const newActs = [...editing.actions]
                            newActs[i] = { ...act, type: e.target.value }
                            setEditing({ ...editing, actions: newActs })
                          }} 
                          className="h-9 border border-surface-border rounded-lg px-3 text-xs font-semibold bg-surface text-ink w-full max-w-md"
                        >
                          {(isWeb ? ACTION_TYPES : ACTION_TYPES.filter(a => a.val !== 'whatsapp_gate')).map(a => <option key={a.val} value={a.val}>{a.label}</option>)}
                        </select>
                      </div>

                      {editing.actions.length > 1 && (
                        <button 
                          onClick={() => setEditing({ ...editing, actions: editing.actions.filter((_, j) => j !== i) })} 
                          className="text-ink-muted hover:text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* WhatsApp Gate Specific Config */}
                    {act.type === 'whatsapp_gate' && (
                      <div className="p-4 bg-green-500/5 border border-green-500/20 rounded-xl space-y-3">
                        <div className="flex items-center gap-2 text-green-700 font-semibold text-xs">
                          <Gift className="w-4 h-4 text-green-600" />
                          <span>WhatsApp Coupon Unlock Lead Magnet</span>
                        </div>
                        <p className="text-[11px] text-green-800/80">
                          Renders a specialized interactive card inside the chat. When the customer enters their phone number, it binds to the session and marks <code className="bg-green-100 px-1 rounded font-mono">opt_in_whatsapp = true</code> for automated abandoned cart recovery.
                        </p>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div>
                            <Label className="text-[11px] font-semibold text-ink">Coupon Code to Award</Label>
                            <Input 
                              value={act.coupon_code || ''} 
                              onChange={e => {
                                const newActs = [...editing.actions]
                                newActs[i] = { ...act, coupon_code: e.target.value.toUpperCase() }
                                setEditing({ ...editing, actions: newActs })
                              }}
                              className="h-8 text-xs mt-1 uppercase font-mono font-bold" 
                              placeholder="e.g. SAVE500" 
                            />
                          </div>
                          <div>
                            <Label className="text-[11px] font-semibold text-ink">Discount Headline</Label>
                            <Input 
                              value={act.discount_text || ''} 
                              onChange={e => {
                                const newActs = [...editing.actions]
                                newActs[i] = { ...act, discount_text: e.target.value }
                                setEditing({ ...editing, actions: newActs })
                              }}
                              className="h-8 text-xs mt-1" 
                              placeholder="e.g. FLAT ₹500 OFF Your Order" 
                            />
                          </div>
                        </div>

                        <div>
                          <Label className="text-[11px] font-semibold text-ink">Prompt Copy</Label>
                          <Textarea 
                            rows={2} 
                            value={act.message || ''} 
                            onChange={e => {
                              const newActs = [...editing.actions]
                              newActs[i] = { ...act, message: e.target.value }
                              setEditing({ ...editing, actions: newActs })
                            }} 
                            className="text-xs mt-1 resize-none" 
                            placeholder="Enter your WhatsApp number to unlock your coupon code and save your cart."
                          />
                        </div>
                      </div>
                    )}

                    {/* Returns Flow Specific Config */}
                    {act.type === 'returns_flow' && (
                      <div className="p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl space-y-3">
                        <div className="flex items-center gap-2 text-orange-700 font-semibold text-xs">
                          <RefreshCw className="w-4 h-4 text-orange-600" />
                          <span>Returns & Replacements Handoff Flow</span>
                        </div>
                        <p className="text-[11px] text-orange-800/80">
                          Automatically handles return/replacement requests by collecting Order ID and issue details, optionally checking the 7-day policy, and raising a human handoff ticket.
                        </p>
                        
                        <div className="space-y-3 pt-2">
                          <div>
                            <Label className="text-[11px] font-semibold text-ink">Ask for Order ID</Label>
                            <Input 
                              value={act.returns_ask_order_msg || ''} 
                              onChange={e => {
                                const newActs = [...editing.actions]
                                newActs[i] = { ...act, returns_ask_order_msg: e.target.value }
                                setEditing({ ...editing, actions: newActs })
                              }}
                              className="h-8 text-xs mt-1" 
                              placeholder="e.g. Please provide your Order ID" 
                            />
                          </div>
                          
                          <label className="flex items-center gap-2 text-xs font-semibold text-ink">
                            <Switch 
                              checked={act.returns_check_7_days ?? true} 
                              onCheckedChange={v => {
                                const newActs = [...editing.actions]
                                newActs[i] = { ...act, returns_check_7_days: v }
                                setEditing({ ...editing, actions: newActs })
                              }}
                              className="scale-90"
                            />
                            Verify 7-day returnable window policy
                          </label>

                          <div>
                            <Label className="text-[11px] font-semibold text-ink">Ask for Issue Details</Label>
                            <Input 
                              value={act.returns_ask_issue_msg || ''} 
                              onChange={e => {
                                const newActs = [...editing.actions]
                                newActs[i] = { ...act, returns_ask_issue_msg: e.target.value }
                                setEditing({ ...editing, actions: newActs })
                              }}
                              className="h-8 text-xs mt-1" 
                              placeholder="e.g. Briefly describe the issue with the item." 
                            />
                          </div>
                          
                          <div>
                            <Label className="text-[11px] font-semibold text-ink">Ticket Creation Confirmation</Label>
                            <Input 
                              value={act.returns_ticket_msg || ''} 
                              onChange={e => {
                                const newActs = [...editing.actions]
                                newActs[i] = { ...act, returns_ticket_msg: e.target.value }
                                setEditing({ ...editing, actions: newActs })
                              }}
                              className="h-8 text-xs mt-1" 
                              placeholder="e.g. I've created a ticket for you." 
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Standard Widget Message */}
                    {act.type === 'send_message' && (
                      <div className="space-y-3">
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <Label className="text-[11px] font-bold text-ink-muted uppercase">Message Copy</Label>
                            <span className="text-[10px] text-ink-muted font-mono">
                              Variables: {'{{cart_value}}, {{missing_amount}}, {{customer_name}}'}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                            <span className="text-[10px] font-bold text-ink-muted uppercase mr-1">Insert dynamic tag:</span>
                            {['{{missing_amount}}', '{{cart_value}}', '{{customer_name}}', '{{currency}}'].map(tag => (
                              <button
                                key={tag}
                                type="button"
                                onClick={() => {
                                  const currentMsg = act.message || ''
                                  const updatedMsg = currentMsg + (currentMsg.endsWith(' ') || currentMsg === '' ? '' : ' ') + tag
                                  const newActs = [...editing.actions]
                                  newActs[i] = { ...act, message: updatedMsg }
                                  setEditing({ ...editing, actions: newActs })
                                }}
                                className="px-2 py-0.5 rounded-md bg-accent/10 hover:bg-accent/20 text-accent font-mono text-[10px] font-semibold border border-accent/20 transition-colors"
                              >
                                + {tag}
                              </button>
                            ))}
                          </div>
                          <Textarea 
                            rows={2} 
                            value={act.message || ''} 
                            onChange={e => {
                              const newActs = [...editing.actions]
                              newActs[i] = { ...act, message: e.target.value }
                              setEditing({ ...editing, actions: newActs })
                            }} 
                            className="text-xs resize-none" 
                            placeholder="You're just ₹{{missing_amount}} away from FLAT ₹500 OFF! Add a little more to qualify."
                          />
                        </div>

                        <div className="flex flex-wrap items-center gap-4 pt-1">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-ink-secondary">Display Mode:</Label>
                            <select 
                              value={act.message_type || 'callout'} 
                              onChange={e => {
                                const newActs = [...editing.actions]
                                newActs[i] = { ...act, message_type: e.target.value }
                                setEditing({ ...editing, actions: newActs, popup_style: e.target.value })
                              }} 
                              className="h-8 border border-surface-border rounded-md px-2 text-xs bg-surface"
                            >
                              <option value="callout">Callout Bubble (Subtle notification)</option>
                              <option value="full">Open Full Chat Window</option>
                              <option value="banner">Floating Top Banner</option>
                              <option value="modal">Centered Lightbox Modal</option>
                            </select>
                          </div>

                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-ink-secondary">Delay (sec):</Label>
                            <Input 
                              type="number" 
                              value={act.delay_seconds || 0} 
                              onChange={e => {
                                const newActs = [...editing.actions]
                                const delay = parseInt(e.target.value) || 0
                                newActs[i] = { ...act, delay_seconds: delay }
                                setEditing({ ...editing, actions: newActs, delay_seconds: delay })
                              }} 
                              className="h-8 w-16 text-xs" 
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Popup System Controls & Presentation Options (Web Chatbot Only) */}
            {isWeb && (
              <div className="bg-surface border border-surface-border rounded-xl p-5 space-y-5">
                <div className="flex items-center justify-between border-b border-surface-border pb-3">
                  <div className="flex items-center gap-2">
                    <Layout className="w-4 h-4 text-accent" />
                    <h3 className="text-sm font-bold text-ink">Popup System Controls & Presentation</h3>
                  </div>
                  <span className="text-xs text-ink-muted">Configures widget appearance, timing, and action buttons</span>
                </div>

                {/* 1. Presentation Styles */}
                <div>
                  <Label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-2 block">
                    Popup Presentation Style
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      {
                        id: 'callout',
                        label: 'Callout Bubble',
                        desc: 'Subtle notification bubble hovering above chat launcher',
                        icon: '🎈'
                      },
                      {
                        id: 'full',
                        label: 'Full Chat Window',
                        desc: 'Automatically expands the chatbot window with offer',
                        icon: '💬'
                      },
                      {
                        id: 'banner',
                        label: 'Floating Banner',
                        desc: 'Full-width sticky top banner with direct CTA button',
                        icon: '📢'
                      },
                      {
                        id: 'modal',
                        label: 'Centered Modal Card',
                        desc: 'High-visibility lightbox card for maximum conversion',
                        icon: '🗂️'
                      },
                    ].map(style => {
                      const isSelected = (editing.popup_style || 'callout') === style.id
                      return (
                        <button
                          key={style.id}
                          type="button"
                          onClick={() => setEditing({ ...editing, popup_style: style.id })}
                          className={cn(
                            "p-3 rounded-xl border text-left transition-all flex flex-col justify-between",
                            isSelected
                              ? "bg-accent/5 border-accent text-ink shadow-sm ring-2 ring-accent/20"
                              : "bg-surface border-surface-border text-ink-secondary hover:bg-surface-muted/30"
                          )}
                        >
                          <div>
                            <div className="text-lg mb-1">{style.icon}</div>
                            <div className="font-bold text-xs text-ink">{style.label}</div>
                            <div className="text-[10px] text-ink-secondary mt-1 leading-snug">{style.desc}</div>
                          </div>
                          <div className="mt-2 text-right">
                            <span className={cn(
                              "inline-block w-2 h-2 rounded-full",
                              isSelected ? "bg-accent" : "bg-transparent"
                            )} />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 2. Timing & Delivery Controls */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-surface-border">
                  <div>
                    <Label className="text-[11px] font-bold text-ink-muted uppercase block mb-1">
                      Display Delay (Timing)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={60}
                        value={editing.delay_seconds ?? 3}
                        onChange={e => setEditing({ ...editing, delay_seconds: parseInt(e.target.value) || 0 })}
                        className="h-8 w-24 text-xs font-semibold"
                      />
                      <span className="text-xs text-ink-secondary">seconds after condition met</span>
                    </div>
                    <span className="text-[10px] text-ink-muted mt-1 block">
                      (0s = instant trigger. 3-5s feels natural and non-intrusive)
                    </span>
                  </div>

                  <div>
                    <Label className="text-[11px] font-bold text-ink-muted uppercase block mb-1">
                      Auto-Dismiss Countdown
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={120}
                        value={editing.auto_dismiss_seconds ?? 0}
                        onChange={e => setEditing({ ...editing, auto_dismiss_seconds: parseInt(e.target.value) || 0 })}
                        className="h-8 w-24 text-xs font-semibold"
                      />
                      <span className="text-xs text-ink-secondary">seconds</span>
                    </div>
                    <span className="text-[10px] text-ink-muted mt-1 block">
                      (0 = stays visible until shopper interacts or dismisses)
                    </span>
                  </div>
                </div>

                {/* 3. Tone of Voice */}
                <div className="pt-2 border-t border-surface-border">
                  <Label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider mb-2 block">
                    Tone of Voice
                  </Label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {[
                      { id: 'casual', label: 'Casual & Friendly', icon: '😊', example: 'Ooh nice pick! Add ₹500 and get 10% off!' },
                      { id: 'formal', label: 'Formal & Polished', icon: '💼', example: 'You are eligible for a 10% discount on orders over ₹2,000.' },
                      { id: 'urgent', label: 'Urgent & Scarcity', icon: '⚡', example: 'Hurry! Only ₹500 away from your limited-time unlock!' },
                      { id: 'playful', label: 'Playful & Fun', icon: '🎉', example: 'Woohoo! Toss in ₹500 more for a sweet secret perk!' },
                    ].map(t => {
                      const isSelected = (editing.tone || 'casual') === t.id
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setEditing({ ...editing, tone: t.id })}
                          className={cn(
                            "p-2.5 rounded-xl border text-left transition-all",
                            isSelected
                              ? "bg-accent/5 border-accent shadow-sm ring-1 ring-accent/30"
                              : "bg-surface border-surface-border hover:bg-surface-muted/20 text-ink-secondary"
                          )}
                        >
                          <div className="flex items-center gap-1.5 font-bold text-xs text-ink mb-1">
                            <span>{t.icon}</span>
                            <span>{t.label}</span>
                          </div>
                          <p className="text-[10px] text-ink-muted italic line-clamp-2 leading-tight">
                            "{t.example}"
                          </p>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 4. Action Button (CTA) */}
                <div className="pt-2 border-t border-surface-border space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] font-bold text-ink-muted uppercase tracking-wider">
                      Interactive CTA Button (Optional)
                    </Label>
                    <span className="text-[10px] text-ink-muted">Adds a clickable button directly inside the popup</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold text-ink">Button Label</Label>
                      <Input
                        value={editing.cta_text || ''}
                        onChange={e => setEditing({ ...editing, cta_text: e.target.value })}
                        className="h-8 text-xs mt-1"
                        placeholder="e.g. Add ₹500 & Save 10%"
                      />
                    </div>
                    <div>
                      <Label className="text-xs font-semibold text-ink">Button Target URL or Action</Label>
                      <Input
                        value={editing.cta_url || ''}
                        onChange={e => setEditing({ ...editing, cta_url: e.target.value })}
                        className="h-8 text-xs mt-1"
                        placeholder="e.g. /collections/all (or leave blank to open chat)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Anti-Spam & Limits */}
            <div className="bg-surface border border-surface-border rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-surface-border pb-3">
                <Settings2 className="w-4 h-4 text-ink-muted" />
                <h3 className="text-sm font-bold text-ink">Frequency & Anti-Spam Controls</h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <Label className="text-[11px] font-bold text-ink-muted uppercase block mb-1.5">Max per session</Label>
                  <div className="flex items-center gap-2">
                    <Input 
                      type="number" 
                      value={editing.frequency_per_session} 
                      onChange={e => setEditing({ ...editing, frequency_per_session: parseInt(e.target.value) || 1 })} 
                      className="h-8 w-20 text-xs" 
                    />
                    <span className="text-xs text-ink-secondary">time(s)</span>
                  </div>
                </div>
                <div>
                  <Label className="text-[11px] font-bold text-ink-muted uppercase block mb-1.5">Max per day</Label>
                  <div className="flex items-center gap-2">
                    <Input 
                      type="number" 
                      value={editing.frequency_per_day} 
                      onChange={e => setEditing({ ...editing, frequency_per_day: parseInt(e.target.value) || 3 })} 
                      className="h-8 w-20 text-xs" 
                    />
                    <span className="text-xs text-ink-secondary">time(s)</span>
                  </div>
                </div>
                <div>
                  <Label className="text-[11px] font-bold text-ink-muted uppercase block mb-1.5">Min gap between triggers</Label>
                  <div className="flex items-center gap-2">
                    <Input 
                      type="number" 
                      value={editing.min_gap_minutes} 
                      onChange={e => setEditing({ ...editing, min_gap_minutes: parseInt(e.target.value) || 5 })} 
                      className="h-8 w-20 text-xs" 
                    />
                    <span className="text-xs text-ink-secondary">minutes</span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Live Testing Panel (Right Sidebar) */}
          <div className="lg:col-span-4">
            <div className="bg-surface border border-surface-border rounded-xl p-5 shadow-sm sticky top-4 space-y-4">
              <div className="flex items-center gap-2 border-b border-surface-border pb-3">
                <Search className="w-4 h-4 text-accent" />
                <h3 className="font-bold text-ink text-sm">Interactive Live Simulator</h3>
              </div>
              <p className="text-xs text-ink-secondary leading-relaxed">
                Test how your conditions evaluate against mock visitor behavior before publishing.
              </p>

              <div className="space-y-3">
                <div>
                  <Label className="text-xs font-semibold text-ink">Simulate Event</Label>
                  <select 
                    value={simEvent} 
                    onChange={e => setSimEvent(e.target.value)} 
                    className="h-8 border border-surface-border rounded-md px-2 text-xs bg-surface w-full mt-1 font-medium"
                  >
                    <option value="cart_updated">cart_updated</option>
                    <option value="exit_intent">exit_intent</option>
                    <option value="idle_time">idle_time</option>
                    <option value="page_url">page_url</option>
                  </select>
                </div>

                {simEvent === 'cart_updated' && (
                  <div>
                    <Label className="text-xs font-semibold text-ink">Mock Cart Value (₹)</Label>
                    <Input 
                      type="number" 
                      value={simValue} 
                      onChange={e => setSimValue(e.target.value)} 
                      className="h-8 text-xs mt-1" 
                    />
                  </div>
                )}

                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={runSimulation} 
                  className="w-full text-xs h-8 border-accent text-accent hover:bg-accent/5 font-semibold"
                >
                  <Play className="w-3.5 h-3.5 mr-1.5" /> Run Condition Test
                </Button>

                {simResult && (
                  <div className={cn(
                    "p-3 rounded-lg border text-xs space-y-2 mt-2",
                    simResult.fired ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"
                  )}>
                    <div className="flex items-center gap-1.5 font-bold">
                      {simResult.fired ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>Trigger WOULD Fire!</span>
                        </>
                      ) : (
                        <>
                          <span className="w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center text-[10px]">✕</span>
                          <span>Trigger Would NOT Fire</span>
                        </>
                      )}
                    </div>
                    <p className="text-[11px] opacity-90">{simResult.reason}</p>

                    {simResult.fired && (
                      <div className="pt-2 border-t border-emerald-200/60 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                            Simulated Live Output
                          </span>
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 capitalize border border-emerald-200">
                            {simResult.style || 'callout'} • {simResult.tone || 'casual'}
                          </span>
                        </div>

                        {!isWeb ? (
                          <div className="p-3 bg-white rounded-xl border border-surface-border text-ink text-xs shadow-sm space-y-1.5">
                            <div className="flex items-center justify-between text-[9px] font-bold text-ink-muted uppercase">
                              <span className="capitalize">{botChannel} Direct Message</span>
                              <span className="text-emerald-600 font-semibold">Sent ✓</span>
                            </div>
                            <p className="text-[11px] leading-relaxed text-ink">{simResult.output}</p>
                          </div>
                        ) : simResult.type === 'whatsapp_gate' ? (
                          <div className="p-2.5 bg-[#0d1f16] border border-[#1a4731] rounded-xl text-white space-y-1.5">
                            <div className="text-[11px] font-bold text-green-400 flex items-center gap-1">
                              <span>🎁 {editing.actions[0]?.discount_text || 'Unlock Discount'}</span>
                            </div>
                            <p className="text-[10px] text-white/70 leading-relaxed">{simResult.output}</p>
                            <div className="bg-black/40 border border-white/10 rounded px-2 py-1 text-[10px] text-white/50 flex items-center justify-between">
                              <span>+91 98765 43210</span>
                              <span className="text-white/30 text-[9px]">WhatsApp</span>
                            </div>
                            <div className="bg-green-600 text-white text-[10px] font-bold py-1 text-center rounded">
                              📲 Send coupon to WhatsApp
                            </div>
                          </div>
                        ) : simResult.style === 'banner' ? (
                          /* Floating Banner Preview */
                          <div className="p-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg shadow-sm space-y-1.5 animate-in slide-in-from-top-1">
                            <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-wider text-white/80">
                              <span>📢 Top Notification Bar</span>
                              <span>✕</span>
                            </div>
                            <p className="text-[11px] font-medium leading-snug">{simResult.output}</p>
                            {simResult.ctaText && (
                              <div className="pt-0.5">
                                <button className="px-2.5 py-1 bg-white text-orange-600 rounded-md font-bold text-[10px] shadow-sm flex items-center gap-1">
                                  <span>{simResult.ctaText}</span>
                                  <ArrowUpRight className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        ) : simResult.style === 'modal' ? (
                          /* Centered Modal Card Preview */
                          <div className="p-3 bg-slate-900 text-white rounded-xl border border-slate-700 shadow-xl space-y-2 text-xs relative overflow-hidden">
                            <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                              <span className="text-[10px] font-bold text-amber-400 flex items-center gap-1 uppercase tracking-wider">
                                <span>⚡ Exclusive Offer</span>
                              </span>
                              <span className="text-[10px] text-white/40">✕</span>
                            </div>
                            <p className="text-[11px] text-slate-200 leading-relaxed">{simResult.output}</p>
                            {simResult.ctaText ? (
                              <button className="w-full py-1.5 bg-accent text-white font-bold rounded-lg text-[10px] shadow-sm flex items-center justify-center gap-1">
                                <span>{simResult.ctaText}</span>
                                <ArrowUpRight className="w-3 h-3" />
                              </button>
                            ) : (
                              <button className="w-full py-1.5 bg-white/10 text-white font-medium rounded-lg text-[10px]">
                                Open Chat
                              </button>
                            )}
                          </div>
                        ) : (
                          /* Callout Bubble Preview */
                          <div className="space-y-1">
                            <div className="p-3 bg-white rounded-2xl rounded-br-sm border border-emerald-200 text-ink text-xs shadow-md space-y-2 relative">
                              <div className="flex items-center justify-between text-[9px] font-bold text-ink-muted uppercase">
                                <span>Bot Notification</span>
                                <span className="text-ink-muted/60">✕</span>
                              </div>
                              <p className="text-[11px] leading-relaxed">{simResult.output}</p>
                              {simResult.ctaText && (
                                <div className="pt-0.5">
                                  <button className="px-2.5 py-1 bg-accent text-white font-semibold rounded-lg text-[10px] shadow-sm flex items-center gap-1">
                                    <span>{simResult.ctaText}</span>
                                    <ArrowUpRight className="w-2.5 h-2.5" />
                                  </button>
                                </div>
                              )}
                            </div>
                            <div className="flex justify-end pr-2">
                              <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center text-white shadow-sm">
                                <MessageCircle className="w-3 h-3" />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const visibleTemplates = isWeb 
    ? PREBUILT_TEMPLATES 
    : PREBUILT_TEMPLATES.filter(t => 
        !t.description.toLowerCase().includes('popup') && 
        !t.description.toLowerCase().includes('viewport') && 
        !t.description.toLowerCase().includes('callout') &&
        !t.name.toLowerCase().includes('gap') && 
        !t.name.toLowerCase().includes('exit intent')
      )

  // ─── LIST VIEW ──────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Templates Row */}
      {visibleTemplates.length > 0 && (
        <div className="bg-surface border border-surface-border rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                <Zap className="w-4 h-4 text-accent" /> 
                {isWeb ? 'Pre-Built Cart & Lead Recovery Templates' : `${botChannel.toUpperCase()} Action & Automation Templates`}
              </h3>
              <p className="text-xs text-ink-muted">
                {isWeb ? 'One-click install battle-tested triggers for coupon unlocks, upsells and WhatsApp recovery.' : `Pre-configured triggers and flows tailored for ${botChannel}.`}
              </p>
            </div>
            {isWeb && (
              <Link href="/bots/triggers/analytics">
                <Button variant="outline" size="sm" className="h-7 text-xs border-surface-border hover:border-accent text-ink">
                  <BarChart2 className="w-3.5 h-3.5 mr-1 text-accent" /> View Cart Analytics
                </Button>
              </Link>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {visibleTemplates.slice(0, 3).map(tpl => (
              <div 
                key={tpl.id}
                onClick={() => applyPrebuiltTemplate(tpl)}
                className="p-3.5 bg-white border border-surface-border rounded-xl hover:border-accent/50 hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xl">{tpl.icon}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-muted text-ink-muted group-hover:text-accent group-hover:bg-accent/10 transition-colors">
                      {tpl.badge}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-ink group-hover:text-accent transition-colors">
                    {tpl.name}
                  </p>
                  <p className="text-[11px] text-ink-muted mt-1 line-clamp-2 leading-relaxed">
                    {tpl.description}
                  </p>
                </div>
                <div className="pt-2.5 mt-2 border-t border-surface-border flex items-center justify-between text-[11px] text-accent font-semibold">
                  <span>Use Template</span>
                  <Plus className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <div>
          <h2 className="text-base font-bold text-ink">Active Trigger Rules for This Bot</h2>
          <p className="text-xs text-ink-secondary">
            {isWeb ? (
              <>These rules are evaluated in real-time on your store via <code className="bg-surface-muted px-1 py-0.5 rounded font-mono text-[11px]">tracker.js</code>.</>
            ) : (
              <>These trigger rules are evaluated automatically for incoming messages on <strong className="capitalize">{botChannel}</strong>.</>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Add Prebuilt Dropdown */}
          <Select onValueChange={val => {
            if (val.startsWith('tpl:')) {
              const tpl = visibleTemplates.find(t => t.id === val.replace('tpl:', '')) || PREBUILT_TEMPLATES.find(t => t.id === val.replace('tpl:', ''))
              if (tpl) applyPrebuiltTemplate(tpl)
            } else if (val.startsWith('rule:')) {
              const r = clientWideRules.find(r => r.id === val.replace('rule:', ''))
              if (r) copyClientWideRule(r)
            }
          }}>
            <SelectTrigger className="h-9 text-xs bg-white shadow-sm border-surface-border w-[220px]">
              <SelectValue placeholder="Add Pre-Built Trigger..." />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel className="text-[10px] uppercase font-bold text-ink-muted">Pre-Built Templates</SelectLabel>
                {visibleTemplates.map(t => (
                  <SelectItem key={t.id} value={`tpl:${t.id}`} className="text-xs">
                    {t.icon} {t.name}
                  </SelectItem>
                ))}
              </SelectGroup>

              {clientWideRules.length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-[10px] uppercase font-bold text-ink-muted">From Proactive Triggers Section</SelectLabel>
                  {clientWideRules.map(r => (
                    <SelectItem key={r.id} value={`rule:${r.id}`} className="text-xs">
                      📋 {r.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              )}
            </SelectContent>
          </Select>

          <Button 
            onClick={() => setEditing(newEmptyRule(botId, botChannel))} 
            className="h-9 text-xs bg-ink text-white hover:bg-ink-secondary shadow-sm"
          >
            <Plus className="w-4 h-4 mr-1.5" /> Create Custom Trigger
          </Button>
        </div>
      </div>

      {/* Rules Table / Cards */}
      {loading ? (
        <div className="h-32 flex items-center justify-center">
          <p className="text-xs text-ink-muted animate-pulse">Loading proactive trigger rules...</p>
        </div>
      ) : rules.length === 0 ? (
        <div className="text-center p-10 bg-surface border border-dashed border-surface-border rounded-2xl space-y-3">
          <div className="w-10 h-10 rounded-full bg-accent/10 flex items-center justify-center mx-auto text-accent">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-ink">No proactive triggers configured yet</p>
            <p className="text-xs text-ink-muted max-w-sm mx-auto mt-1">
              Select a pre-built template above (like the WhatsApp Coupon Gate) or create a custom trigger to start proactively engaging shoppers.
            </p>
          </div>
          <div className="pt-2 flex justify-center gap-2">
            <Button 
              size="sm" 
              onClick={() => applyPrebuiltTemplate(PREBUILT_TEMPLATES[0])}
              className="h-8 text-xs bg-accent text-white hover:bg-accent/90"
            >
              🎁 Add WhatsApp Coupon Gate
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden divide-y divide-surface-border">
          {rules.map(rule => {
            const firstCond = rule.conditions?.[0]
            const firstAct = rule.actions?.[0]
            const isWaGate = firstAct?.type === 'whatsapp_gate'

            return (
              <div 
                key={rule.id} 
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-surface-muted/30 transition-colors group cursor-pointer"
                onClick={() => setEditing(rule)}
              >
                <div className="flex items-start gap-3">
                  <div 
                    onClick={e => { e.stopPropagation(); toggleRuleStatus(rule) }}
                    className="pt-0.5 cursor-pointer"
                    title="Toggle active status"
                  >
                    <div className={cn(
                      "w-2.5 h-2.5 rounded-full transition-colors",
                      rule.status === 'active' ? "bg-emerald-500 ring-4 ring-emerald-500/20" : "bg-gray-300"
                    )} />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-ink group-hover:text-accent transition-colors">
                        {rule.name}
                      </p>
                      {isWaGate && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-700 text-[10px] font-bold">
                          <Gift className="w-3 h-3" /> WhatsApp Gate
                        </span>
                      )}
                      <span className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.2 rounded",
                        rule.status === 'active' ? "text-emerald-700 bg-emerald-50" : "text-gray-500 bg-gray-100"
                      )}>
                        {rule.status === 'active' ? 'Active' : 'Paused'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-1.5">
                      {/* Condition badge */}
                      <code className="text-[11px] bg-surface-muted border border-surface-border px-1.5 py-0.5 rounded text-ink-secondary font-mono">
                        IF {firstCond?.event || 'event'} {firstCond?.operator || '='} {firstCond?.value || ''}
                      </code>

                      {/* Action badge */}
                      <span className="text-[11px] text-ink-muted">
                        → {isWaGate ? `Unlock ${firstAct.coupon_code || 'Coupon'}` : (firstAct?.message_type === 'full' ? 'Open Window' : 'Callout Bubble')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-5 sm:self-center shrink-0">
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-bold text-ink-muted">Fired</p>
                    <p className="text-sm font-bold text-ink">{rule.fire_count || 0} times</p>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 text-xs text-ink-muted hover:text-ink"
                      onClick={e => { e.stopPropagation(); setEditing(rule) }}
                    >
                      Edit
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-ink-muted hover:text-red-500" 
                      onClick={e => { e.stopPropagation(); deleteRule(rule.id) }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
