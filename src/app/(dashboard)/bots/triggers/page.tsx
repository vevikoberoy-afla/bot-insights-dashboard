'use client'
import { activeWorkspaceId } from '@/lib/client/workspace'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { 
  Zap, Plus, Play, Pause, Edit2, Trash2, BarChart2, 
  ShoppingCart, Gift, RefreshCw, Bot, ArrowUpRight, CheckCircle2 
} from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue, SelectLabel } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { PREBUILT_TEMPLATES, TriggerRule } from '@/components/bots/triggers-tab'
import { fetchDashboardData, invalidateDashboardData, readDashboardData } from '@/lib/client/featureDataCache'

export default function BotTriggersPage() {
  const [clientId] = useState(() => activeWorkspaceId('') || null)
  const [bots, setBots] = useState<any[]>([])
  const [rules, setRules] = useState<TriggerRule[]>([])
  const [loading, setLoading] = useState(true)

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [targetBotId, setTargetBotId] = useState<string>('all')
  const [name, setName] = useState('')
  const [actionType, setActionType] = useState('whatsapp_gate')
  const [property, setProperty] = useState('cart_updated')
  const [operator, setOperator] = useState('>=')
  const [value, setValue] = useState('1000')
  const [value2, setValue2] = useState('')
  const [message, setMessage] = useState('Enter your WhatsApp number to unlock your coupon code and save your cart.')
  const [couponCode, setCouponCode] = useState('SAVE500')
  const [discountText, setDiscountText] = useState('FLAT ₹500 OFF (Code: SAVE500)')
  const [delay, setDelay] = useState('2')
  const [displayType, setDisplayType] = useState('callout')

  useEffect(() => {
    if (clientId) loadData(clientId)
  }, [clientId])

  const loadData = async (cId: string, force = false) => {
    const rulesUrl=`/api/bots/triggers?client_id=${encodeURIComponent(cId)}`
    const botsUrl=`/api/bots?client_id=${encodeURIComponent(cId)}`
    const cachedRules=readDashboardData<TriggerRule[]>(rulesUrl)
    const cachedBots=readDashboardData<any[]>(botsUrl)
    if(cachedRules){setRules(cachedRules);setLoading(false)}
    if(cachedBots)setBots(cachedBots)
    if(!cachedRules)setLoading(true)
    try {
      const [rulesData, botsData] = await Promise.all([
        fetchDashboardData<TriggerRule[]>(rulesUrl,{force}),
        fetchDashboardData<any[]>(botsUrl,{force})
      ])
      setRules(Array.isArray(rulesData) ? rulesData : [])
      setBots(Array.isArray(botsData) ? botsData : [])
    } catch {}
    setLoading(false)
  }

  const openCreateModal = () => {
    setEditingId(null)
    setTargetBotId('all')
    setName('')
    setActionType('whatsapp_gate')
    setProperty('cart_updated')
    setOperator('>=')
    setValue('1000')
    setValue2('')
    setMessage('Enter your WhatsApp number to unlock your coupon code and save your cart.')
    setCouponCode('SAVE500')
    setDiscountText('FLAT ₹500 OFF (Code: SAVE500)')
    setDelay('2')
    setDisplayType('callout')
    setIsDialogOpen(true)
  }

  const openEditModal = (rule: TriggerRule) => {
    setEditingId(rule.id)
    setTargetBotId(rule.bot_id || 'all')
    setName(rule.name)
    const firstCond = rule.conditions?.[0]
    if (firstCond) {
      setProperty(firstCond.event)
      setOperator(firstCond.operator)
      setValue(firstCond.value || '')
      setValue2(firstCond.value2 || '')
    }
    const firstAct = rule.actions?.[0]
    if (firstAct) {
      setActionType(firstAct.type)
      setMessage(firstAct.message || '')
      setCouponCode(firstAct.coupon_code || '')
      setDiscountText(firstAct.discount_text || '')
      setDelay((firstAct.delay_seconds || 0).toString())
      setDisplayType(firstAct.message_type || 'callout')
    }
    setIsDialogOpen(true)
  }

  const applyTemplate = (tpl: typeof PREBUILT_TEMPLATES[0]) => {
    setName(tpl.rule.name)
    const firstCond = tpl.rule.conditions[0]
    setProperty(firstCond.event)
    setOperator(firstCond.operator)
    setValue(firstCond.value)
    setValue2((firstCond as any).value2 || '')

    const firstAct = tpl.rule.actions[0]
    setActionType(firstAct.type)
    setMessage((firstAct as any).message || '')
    setCouponCode((firstAct as any).coupon_code || '')
    setDiscountText((firstAct as any).discount_text || '')
    setDelay((firstAct.delay_seconds || 0).toString())
    setDisplayType((firstAct as any).message_type || 'callout')
    setIsDialogOpen(true)
    toast.info(`Loaded "${tpl.name}" template. Select a target bot and save.`)
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please enter a trigger rule name')
      return
    }

    if (!clientId) {
      toast.error('Client authentication required')
      return
    }

    const conditions = [{
      id: Date.now().toString(),
      event: property,
      operator,
      value,
      value2: operator === 'between' ? value2 : undefined
    }]

    const actions = [{
      id: Date.now().toString(),
      type: actionType,
      channel: 'web',
      message,
      message_type: displayType,
      coupon_code: actionType === 'whatsapp_gate' ? couponCode : undefined,
      discount_text: actionType === 'whatsapp_gate' ? discountText : undefined,
      delay_seconds: parseInt(delay) || 0
    }]

    const payload = {
      id: editingId || undefined,
      client_id: clientId,
      bot_id: targetBotId === 'all' ? null : targetBotId,
      name,
      status: 'active',
      conditions,
      actions,
      frequency_per_session: 1,
      frequency_per_day: 3,
      min_gap_minutes: 5,
    }

    try {
      const method = editingId ? 'PUT' : 'POST'
      const res = await fetch('/api/bots/triggers', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (res.ok) {
        toast.success(editingId ? 'Trigger updated' : 'Trigger rule created')
        setIsDialogOpen(false)
        invalidateDashboardData('/api/bots/triggers')
        if (clientId) loadData(clientId, true)
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to save trigger')
      }
    } catch {
      toast.error('Failed to save trigger rule')
    }
  }

  const toggleStatus = async (rule: TriggerRule) => {
    const newStatus = rule.status === 'active' ? 'paused' : 'active'
    try {
      const res = await fetch('/api/bots/triggers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, status: newStatus })
      })
      if (res.ok) {
        setRules(prev => prev.map(r => r.id === rule.id ? { ...r, status: newStatus } : r))
        invalidateDashboardData('/api/bots/triggers')
        toast.success(`Rule ${newStatus === 'active' ? 'activated' : 'paused'}`)
      }
    } catch {
      toast.error('Failed to update status')
    }
  }

  const deleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this trigger rule?')) return
    try {
      const res = await fetch(`/api/bots/triggers?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Trigger rule deleted')
        invalidateDashboardData('/api/bots/triggers')
        if (clientId) loadData(clientId, true)
      }
    } catch {
      toast.error('Failed to delete rule')
    }
  }

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto space-y-6">
      
      <PageHeader 
        title="Proactive Triggers" 
        description="Automatically engage customers based on cart value, idle time, exit intent, or behavior across your storefront."
      >
        <div className="flex items-center gap-2">
          <Link href="/bots/triggers/analytics">
            <Button variant="outline" className="border-surface-border text-ink hover:border-accent shadow-sm font-medium">
              <BarChart2 className="w-4 h-4 mr-2 text-accent" /> Cart & WA Analytics
            </Button>
          </Link>

          <Button 
            onClick={openCreateModal}
            className="bg-ink hover:bg-ink-secondary text-white shadow-sm font-medium"
          >
            <Plus className="w-4 h-4 mr-2" /> Create Trigger
          </Button>
        </div>
      </PageHeader>

      {/* Pre-Built Templates Strip */}
      <div className="bg-gradient-to-r from-accent/5 via-blue-50/40 to-emerald-50/30 border border-surface-border rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-ink flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent" /> Start with a Pre-Built Strategy
            </h3>
            <p className="text-xs text-ink-muted">
              Pre-configured triggers with proven conversion logic for cart upsells and WhatsApp lead capture.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {PREBUILT_TEMPLATES.slice(0, 3).map(tpl => (
            <div 
              key={tpl.id}
              onClick={() => applyTemplate(tpl)}
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
                <span>Add This Trigger</span>
                <Plus className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Rules Table */}
      <div className="bg-surface border border-surface-border rounded-xl shadow-sm overflow-hidden flex flex-col">
        <div className="px-5 py-3.5 border-b border-surface-border flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink">All Configured Trigger Rules ({rules.length})</h3>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => clientId && loadData(clientId, true)}
            className="h-8 text-xs text-ink-muted hover:text-ink"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>

        {loading ? (
          <div className="space-y-3 p-5" aria-label="Loading trigger rules">{[0,1,2,3].map(item=><div key={item} className="h-12 rounded-lg bg-surface-muted animate-pulse"/>)}</div>
        ) : rules.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Zap className="w-8 h-8 text-ink-muted mx-auto" />
            <p className="text-sm font-semibold text-ink">No proactive triggers configured yet</p>
            <p className="text-xs text-ink-muted max-w-md mx-auto">
              Create a trigger or click one of the pre-built templates above to start proactively nudging shoppers.
            </p>
            <Button size="sm" onClick={openCreateModal} className="h-8 text-xs bg-accent text-white">
              Create First Trigger
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-surface-muted/50">
              <TableRow>
                <TableHead className="w-[280px]">Rule Name</TableHead>
                <TableHead>Condition Logic</TableHead>
                <TableHead>Target Bot</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Fired</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => {
                const firstCond = rule.conditions?.[0]
                const firstAct = rule.actions?.[0]
                const isWaGate = firstAct?.type === 'whatsapp_gate'

                return (
                  <TableRow key={rule.id} className="hover:bg-surface-muted/30 group cursor-pointer" onClick={() => openEditModal(rule)}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-accent shrink-0" />
                        <div>
                          <p className="font-semibold text-ink text-sm group-hover:text-accent transition-colors">{rule.name}</p>
                          {rule.description && <p className="text-[11px] text-ink-muted line-clamp-1">{rule.description}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <code className="px-1.5 py-0.5 rounded bg-surface border border-surface-border text-[11px] text-ink-secondary font-mono">
                        {firstCond?.event} {firstCond?.operator} {firstCond?.value}
                        {firstCond?.value2 ? ` and ${firstCond.value2}` : ''}
                      </code>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-xs text-ink-secondary">
                        <Bot className="w-3.5 h-3.5 text-ink-muted" />
                        {rule.bots?.name || (rule.bot_id ? 'Assigned Bot' : 'All Bots (Shared)')}
                      </span>
                    </TableCell>
                    <TableCell>
                      {isWaGate ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-500/10 text-green-700 text-xs font-semibold">
                          <Gift className="w-3 h-3" /> WhatsApp Gate ({firstAct.coupon_code || 'Coupon'})
                        </span>
                      ) : (
                        <span className="text-xs text-ink-secondary">
                          {firstAct?.message_type === 'full' ? 'Open Window' : 'Callout Bubble'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-2">
                        <Switch 
                          checked={rule.status === 'active'} 
                          onCheckedChange={() => toggleStatus(rule)} 
                        />
                        <span className="text-xs text-ink-secondary font-medium">
                          {rule.status === 'active' ? 'Active' : 'Paused'}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs text-ink-secondary font-bold">
                      {rule.fire_count || 0}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-ink-muted hover:text-ink"
                          onClick={() => openEditModal(rule)}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-ink-muted hover:text-red-500"
                          onClick={() => deleteRule(rule.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Create / Edit Modal Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[640px] bg-surface text-ink border border-surface-border shadow-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-ink">
              {editingId ? 'Edit Trigger Rule' : 'Create Proactive Trigger'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-5 py-4 text-ink">
            {/* Rule Name */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-ink">Rule Name</Label>
              <Input 
                placeholder="e.g. VIP Cart Upsell or WhatsApp Coupon Gate" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            {/* Target Bot */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-ink">Apply To Bot</Label>
              <Select value={targetBotId} onValueChange={setTargetBotId}>
                <SelectTrigger className="h-9 text-xs bg-surface">
                  <SelectValue placeholder="Select target bot" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Bots (Shared Storewide)</SelectItem>
                  {bots.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      🤖 {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Condition Logic */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-ink">IF Condition</Label>
              <div className="grid grid-cols-3 gap-2 bg-surface-muted/50 p-3 rounded-xl border border-surface-border">
                <div>
                  <Select value={property} onValueChange={setProperty}>
                    <SelectTrigger className="h-8 text-xs bg-surface">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cart_updated">🛒 Cart Value (₹)</SelectItem>
                      <SelectItem value="exit_intent">🏃 Exit Intent</SelectItem>
                      <SelectItem value="idle_time">⏳ Idle Time (sec)</SelectItem>
                      <SelectItem value="time_on_page">⏱️ Time on Page (sec)</SelectItem>
                      <SelectItem value="page_url">🌐 Page URL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Select value={operator} onValueChange={setOperator}>
                    <SelectTrigger className="h-8 text-xs bg-surface font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value=">=">{'>='}</SelectItem>
                      <SelectItem value="<=">{'<='}</SelectItem>
                      <SelectItem value="between">between</SelectItem>
                      <SelectItem value="is_true">is_true</SelectItem>
                      <SelectItem value="contains">contains</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Input 
                    placeholder="Value (e.g. 1000)" 
                    value={value} 
                    onChange={e => setValue(e.target.value)}
                    className="h-8 text-xs bg-surface"
                  />
                </div>

                {operator === 'between' && (
                  <div className="col-span-3 pt-1 flex items-center gap-2">
                    <span className="text-xs text-ink-muted">and upper value:</span>
                    <Input 
                      placeholder="Upper threshold" 
                      value={value2} 
                      onChange={e => setValue2(e.target.value)}
                      className="h-8 text-xs bg-surface w-32"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Action Type */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-ink">THEN Action</Label>
              <Select value={actionType} onValueChange={setActionType}>
                <SelectTrigger className="h-9 text-xs bg-surface">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp_gate">🎁 Show WhatsApp Coupon Gate (Lead Capture Magnet)</SelectItem>
                  <SelectItem value="send_message">💬 Send Widget Message (Callout or Full)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* WhatsApp Gate Inputs */}
            {actionType === 'whatsapp_gate' ? (
              <div className="p-3 bg-green-500/5 border border-green-500/20 rounded-xl space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] font-semibold text-ink">Coupon Code to Award</Label>
                    <Input 
                      value={couponCode} 
                      onChange={e => setCouponCode(e.target.value.toUpperCase())}
                      className="h-8 text-xs uppercase font-mono font-bold mt-1" 
                      placeholder="SAVE500" 
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-ink">Discount Headline</Label>
                    <Input 
                      value={discountText} 
                      onChange={e => setDiscountText(e.target.value)}
                      className="h-8 text-xs mt-1" 
                      placeholder="FLAT ₹500 OFF Your Order" 
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-[11px] font-semibold text-ink">Prompt Copy in Widget</Label>
                  <Textarea 
                    rows={2} 
                    value={message} 
                    onChange={e => setMessage(e.target.value)}
                    className="text-xs mt-1 resize-none" 
                    placeholder="Enter your WhatsApp number to receive your coupon code and save your cart."
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-[11px] font-semibold text-ink">Display Mode</Label>
                    <Select value={displayType} onValueChange={setDisplayType}>
                      <SelectTrigger className="h-8 text-xs bg-surface mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="callout">Callout Bubble</SelectItem>
                        <SelectItem value="full">Open Full Chat Window</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-ink">Delay (Seconds)</Label>
                    <Input 
                      type="number" 
                      value={delay} 
                      onChange={e => setDelay(e.target.value)}
                      className="h-8 text-xs mt-1" 
                      placeholder="2" 
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <Label className="text-[11px] font-semibold text-ink">Message Copy</Label>
                    <span className="text-[10px] text-ink-muted font-mono">{`{{cart_value}}, {{missing_amount}}`}</span>
                  </div>
                  <Textarea 
                    rows={2} 
                    value={message} 
                    onChange={e => setMessage(e.target.value)}
                    className="text-xs resize-none" 
                    placeholder="You're just ₹{{missing_amount}} away from FLAT ₹500 OFF!"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-surface-border pt-4">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsDialogOpen(false)}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button 
              size="sm"
              className="h-8 text-xs bg-accent hover:bg-accent/90 text-white font-medium" 
              onClick={handleSave}
            >
              {editingId ? 'Save Changes' : 'Create Trigger'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
