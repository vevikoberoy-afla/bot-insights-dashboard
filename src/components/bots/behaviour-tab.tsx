'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

// ─── TYPES ───────────────────────────────────────────────
type ButtonAction = { label: string; action: string; value: string }
type DataCollectionPoint = {
  id: string; question: string; dataType: string; variableName: string;
  required: boolean; errorMsg: string; saveTo: string; options: string[]
}
type TopicRule = { id: string; keywords: string; response: string; useKB: boolean; buttons: { label: string }[] }
type BotFlow = {
  greeting: string; askName: boolean; askEmail: boolean; greetingButtons: ButtonAction[]
  mainMenuButtons: ButtonAction[]; dataCollection: DataCollectionPoint[]; topicRules: TopicRule[]
}

const ACTION_OPTIONS = [
  'Go to Section', 'Trigger KB Search', 'Collect Data', 'Human Handoff', 'Open URL', 'Trigger MCP Action'
]
const DATA_TYPES = ['Text', 'Email', 'Phone', 'Number', 'Multiple Choice', 'Date', 'Yes/No']
const SAVE_TO = ['Contact Record', 'Session Only', 'Both', 'Dittofeed User Property']

const COLLECTION_TEMPLATES = [
  { name: 'Lead Capture', fields: [{ question: "What's your name?", dataType: 'Text', variableName: 'customer_name' }, { question: "What's your email?", dataType: 'Email', variableName: 'customer_email' }] },
  { name: 'WhatsApp Opt-In', fields: [{ question: 'Drop your WhatsApp number for exclusive offers!', dataType: 'Phone', variableName: 'customer_phone' }] },
  { name: 'Purchase Intent', fields: [{ question: "What's your budget?", dataType: 'Multiple Choice', variableName: 'budget_range', options: ['Under ₹500', '₹500-1500', '₹1500+'] }] },
  { name: 'Support Ticket', fields: [{ question: 'Please share your Order ID', dataType: 'Text', variableName: 'order_id' }] },
]

const TOPIC_TEMPLATES = [
  { keywords: 'price, pricing, cost, how much', response: 'Our pricing starts from ₹299. Check our website for the latest offers!' },
  { keywords: 'shipping, delivery, ship, deliver', response: 'We deliver in 2-5 business days. Free shipping on orders above ₹999!' },
  { keywords: 'return, refund, exchange', response: 'We accept returns within 30 days. Contact us with your order number.' },
  { keywords: 'discount, offer, coupon, promo', response: 'Use code WELCOME10 for 10% off your first order!' },
  { keywords: 'track, order status, where is my order', response: "I'll help you track your order. Please share your order ID." },
]

function newDataPoint(): DataCollectionPoint {
  return { id: Date.now().toString(), question: '', dataType: 'Text', variableName: '', required: true, errorMsg: "That doesn't look right. Try again?", saveTo: 'Contact Record', options: [] }
}
function newTopicRule(): TopicRule {
  return { id: Date.now().toString(), keywords: '', response: '', useKB: false, buttons: [] }
}

// ─── MAIN COMPONENT ──────────────────────────────────────
export function BehaviourTab({ botId, initial }: { botId: string; initial?: Partial<BotFlow> }) {
  const [flow, setFlow] = useState<BotFlow>({
    greeting: initial?.greeting || "Hi {{customer_name}}! I'm Aria 🌸 How can I help you today?",
    askName: initial?.askName ?? true,
    askEmail: initial?.askEmail ?? false,
    greetingButtons: initial?.greetingButtons || [
      { label: '🛍️ Browse Products', action: 'Trigger KB Search', value: '' },
      { label: '📦 Track Order', action: 'Trigger MCP Action', value: '' },
      { label: '💬 Talk to Human', action: 'Human Handoff', value: '' },
    ],
    mainMenuButtons: initial?.mainMenuButtons || [],
    dataCollection: initial?.dataCollection || [],
    topicRules: initial?.topicRules || [],
  })
  const [saving, setSaving] = useState(false)
  const [openSection, setOpenSection] = useState<string>('greeting')

  const toggle = (s: string) => setOpenSection(p => p === s ? '' : s)

  const updateFlow = (key: keyof BotFlow, val: any) => setFlow(p => ({ ...p, [key]: val }))

  const addGreetingButton = () => {
    if (flow.greetingButtons.length >= 4) return toast.error('Max 4 buttons')
    updateFlow('greetingButtons', [...flow.greetingButtons, { label: '', action: 'Go to Section', value: '' }])
  }

  const addMenuButton = () => {
    if (flow.mainMenuButtons.length >= 6) return toast.error('Max 6 buttons')
    updateFlow('mainMenuButtons', [...flow.mainMenuButtons, { label: '', action: 'Go to Section', value: '' }])
  }

  const saveFlow = async () => {
    setSaving(true)
    try {
      await fetch(`/api/bots/${botId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: botId, bot_flow: flow }),
      })
      toast.success('Bot behaviour saved')
    } catch { toast.error('Save failed') }
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      {/* ── GREETING SECTION ── */}
      <SectionCard title="Section 1: Greeting & First Message" open={openSection === 'greeting'} onToggle={() => toggle('greeting')}>
        <div className="space-y-4">
          <div>
            <Label className="text-[11px] uppercase tracking-wider text-ink-muted font-bold">Greeting Message</Label>
            <div className="relative mt-1.5">
              <textarea value={flow.greeting} onChange={e => updateFlow('greeting', e.target.value)} rows={3}
                className="w-full border border-surface-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-accent resize-none" />
              <div className="flex gap-1.5 mt-1.5 flex-wrap">
                {['{{customer_name}}','{{store_name}}','{{current_offer}}','{{cart_value}}'].map(v => (
                  <button key={v} onClick={() => updateFlow('greeting', flow.greeting + v)}
                    className="px-2 py-0.5 bg-accent/10 border border-accent/30 rounded text-[10px] font-mono text-accent hover:bg-accent/20">
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ToggleRow label="Ask for name if unknown" checked={flow.askName} onChange={v => updateFlow('askName', v)} />
            <ToggleRow label="Ask for email before chatting" checked={flow.askEmail} onChange={v => updateFlow('askEmail', v)} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-[11px] uppercase tracking-wider text-ink-muted font-bold">Quick Reply Buttons (after greeting)</Label>
              <Button size="sm" variant="outline" onClick={addGreetingButton} className="h-7 text-xs"><Plus className="w-3 h-3 mr-1" />Add</Button>
            </div>
            <div className="space-y-2">
              {flow.greetingButtons.map((btn, i) => (
                <ButtonRow key={i} btn={btn}
                  onChange={val => updateFlow('greetingButtons', flow.greetingButtons.map((b, j) => j === i ? val : b))}
                  onRemove={() => updateFlow('greetingButtons', flow.greetingButtons.filter((_, j) => j !== i))} />
              ))}
            </div>
          </div>
        </div>
      </SectionCard>

      {/* ── MAIN MENU ── */}
      <SectionCard title="Section 2: Main Menu Buttons" open={openSection === 'menu'} onToggle={() => toggle('menu')}>
        <div className="space-y-3">
          <p className="text-xs text-ink-muted">These buttons appear after the greeting. Each button leads to a different bot behaviour.</p>
          {flow.mainMenuButtons.map((btn, i) => (
            <ButtonRow key={i} btn={btn}
              onChange={val => updateFlow('mainMenuButtons', flow.mainMenuButtons.map((b, j) => j === i ? val : b))}
              onRemove={() => updateFlow('mainMenuButtons', flow.mainMenuButtons.filter((_, j) => j !== i))} />
          ))}
          <Button size="sm" variant="outline" onClick={addMenuButton} className="h-8 text-xs w-full border-dashed">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Button (max 6)
          </Button>
        </div>
      </SectionCard>

      {/* ── DATA COLLECTION ── */}
      <SectionCard title="Section 3: Data Collection Points" open={openSection === 'data'} onToggle={() => toggle('data')}>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 pb-3 border-b border-surface-border">
            <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wider self-center mr-1">Templates:</span>
            {COLLECTION_TEMPLATES.map(t => (
              <button key={t.name} onClick={() => {
                const newPoints = t.fields.map((f: any) => ({ ...newDataPoint(), ...f, id: Date.now().toString() + Math.random() }))
                updateFlow('dataCollection', [...flow.dataCollection, ...newPoints])
              }} className="px-2.5 py-1 bg-surface-muted border border-surface-border rounded-lg text-[11px] font-medium text-ink hover:border-accent/50 hover:bg-accent/5 transition-colors">
                {t.name}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {flow.dataCollection.map((dp, i) => (
              <DataPointRow key={dp.id} dp={dp}
                onChange={val => updateFlow('dataCollection', flow.dataCollection.map((d, j) => j === i ? val : d))}
                onRemove={() => updateFlow('dataCollection', flow.dataCollection.filter((_, j) => j !== i))} />
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => updateFlow('dataCollection', [...flow.dataCollection, newDataPoint()])} className="h-8 text-xs w-full border-dashed">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Collection Point
          </Button>
        </div>
      </SectionCard>

      {/* ── TOPIC RULES ── */}
      <SectionCard title="Section 4: Bot Responses by Topic" open={openSection === 'topics'} onToggle={() => toggle('topics')}>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 pb-3 border-b border-surface-border">
            <span className="text-[11px] font-bold text-ink-muted uppercase tracking-wider self-center mr-1">Templates:</span>
            {TOPIC_TEMPLATES.map(t => (
              <button key={t.keywords} onClick={() => updateFlow('topicRules', [...flow.topicRules, { ...newTopicRule(), keywords: t.keywords, response: t.response }])}
                className="px-2.5 py-1 bg-surface-muted border border-surface-border rounded-lg text-[11px] font-medium text-ink hover:border-accent/50 hover:bg-accent/5 transition-colors">
                + {t.keywords.split(',')[0]}
              </button>
            ))}
          </div>
          <div className="space-y-3">
            {flow.topicRules.map((rule, i) => (
              <TopicRuleRow key={rule.id} rule={rule}
                onChange={val => updateFlow('topicRules', flow.topicRules.map((r, j) => j === i ? val : r))}
                onRemove={() => updateFlow('topicRules', flow.topicRules.filter((_, j) => j !== i))} />
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => updateFlow('topicRules', [...flow.topicRules, newTopicRule()])} className="h-8 text-xs w-full border-dashed">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Topic Rule
          </Button>
        </div>
      </SectionCard>

      <div className="flex justify-end pt-2">
        <Button onClick={saveFlow} disabled={saving} className="h-9 bg-ink text-white hover:bg-ink-secondary">
          {saving ? 'Saving...' : 'Save Behaviour Configuration'}
        </Button>
      </div>
    </div>
  )
}

// ─── SUB-COMPONENTS ──────────────────────────────────────
function SectionCard({ title, open, onToggle, children }: any) {
  return (
    <div className="bg-surface border border-surface-border rounded-xl overflow-hidden shadow-sm">
      <button className="w-full flex items-center justify-between px-5 py-3.5 border-b border-surface-border bg-surface-muted/30 hover:bg-surface-muted/50 transition-colors" onClick={onToggle}>
        <h3 className="text-sm font-bold text-ink">{title}</h3>
        {open ? <ChevronUp className="w-4 h-4 text-ink-muted" /> : <ChevronDown className="w-4 h-4 text-ink-muted" />}
      </button>
      {open && <div className="p-5">{children}</div>}
    </div>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between p-3 border border-surface-border rounded-lg">
      <p className="text-sm font-medium text-ink">{label}</p>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function ButtonRow({ btn, onChange, onRemove }: { btn: ButtonAction; onChange: (b: ButtonAction) => void; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 p-2.5 border border-surface-border rounded-lg bg-surface-muted/20">
      <Input value={btn.label} onChange={e => onChange({ ...btn, label: e.target.value })} placeholder="Button label" className="h-8 text-xs flex-1" />
      <select value={btn.action} onChange={e => onChange({ ...btn, action: e.target.value })} className="h-8 border border-surface-border rounded-lg px-2 text-xs bg-surface focus:outline-none flex-1">
        {ACTION_OPTIONS.map(a => <option key={a}>{a}</option>)}
      </select>
      <button onClick={onRemove} className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-ink-muted hover:text-red-500 shrink-0">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function DataPointRow({ dp, onChange, onRemove }: { dp: DataCollectionPoint; onChange: (d: DataCollectionPoint) => void; onRemove: () => void }) {
  return (
    <div className="border border-surface-border rounded-xl p-4 space-y-3 bg-surface-muted/10">
      <div className="flex items-start justify-between">
        <div className="grid grid-cols-2 gap-3 flex-1 mr-3">
          <div>
            <label className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block mb-1">Question</label>
            <Input value={dp.question} onChange={e => onChange({ ...dp, question: e.target.value })} placeholder="What's your name?" className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block mb-1">Variable Name</label>
            <Input value={dp.variableName} onChange={e => onChange({ ...dp, variableName: e.target.value })} placeholder="customer_name" className="h-8 text-xs font-mono" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block mb-1">Data Type</label>
            <select value={dp.dataType} onChange={e => onChange({ ...dp, dataType: e.target.value })} className="w-full h-8 border border-surface-border rounded-lg px-2 text-xs bg-surface focus:outline-none">
              {DATA_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block mb-1">Save To</label>
            <select value={dp.saveTo} onChange={e => onChange({ ...dp, saveTo: e.target.value })} className="w-full h-8 border border-surface-border rounded-lg px-2 text-xs bg-surface focus:outline-none">
              {SAVE_TO.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <button onClick={onRemove} className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-ink-muted hover:text-red-500 shrink-0 mt-5">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {dp.dataType === 'Multiple Choice' && (
        <div>
          <label className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block mb-1">Options</label>
          <div className="flex flex-wrap gap-1.5">
            {dp.options.map((opt, i) => (
              <div key={i} className="flex items-center gap-1 bg-surface border border-surface-border rounded px-2 py-1">
                <input value={opt} onChange={e => { const opts = [...dp.options]; opts[i] = e.target.value; onChange({ ...dp, options: opts }) }} className="text-xs outline-none w-20 bg-transparent" />
                <button onClick={() => onChange({ ...dp, options: dp.options.filter((_, j) => j !== i) })} className="text-ink-muted hover:text-red-500"><Trash2 className="w-2.5 h-2.5" /></button>
              </div>
            ))}
            <button onClick={() => onChange({ ...dp, options: [...dp.options, ''] })} className="px-2 py-1 border border-dashed border-surface-border rounded text-xs text-ink-muted hover:border-accent hover:text-accent">+ Option</button>
          </div>
        </div>
      )}
      <div className="flex items-center gap-4 pt-1">
        <div className="flex items-center gap-2"><Switch checked={dp.required} onCheckedChange={v => onChange({ ...dp, required: v })} /><span className="text-xs text-ink-secondary">Required</span></div>
        {dp.required && (
          <Input value={dp.errorMsg} onChange={e => onChange({ ...dp, errorMsg: e.target.value })} placeholder="Error message" className="h-7 text-xs flex-1" />
        )}
      </div>
    </div>
  )
}

function TopicRuleRow({ rule, onChange, onRemove }: { rule: TopicRule; onChange: (r: TopicRule) => void; onRemove: () => void }) {
  return (
    <div className="border border-surface-border rounded-xl p-4 space-y-3 bg-surface-muted/10">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          <div>
            <label className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block mb-1">Keywords / Phrases (comma separated)</label>
            <Input value={rule.keywords} onChange={e => onChange({ ...rule, keywords: e.target.value })} placeholder="price, pricing, cost, how much" className="h-8 text-xs" />
          </div>
          <div>
            <label className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block mb-1">Bot Response</label>
            <textarea value={rule.response} onChange={e => onChange({ ...rule, response: e.target.value })} rows={2}
              className="w-full border border-surface-border rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-accent resize-none" placeholder="Response message..." />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={rule.useKB} onCheckedChange={v => onChange({ ...rule, useKB: v })} />
            <span className="text-xs text-ink-secondary">Also search Knowledge Base for more detail</span>
          </div>
        </div>
        <button onClick={onRemove} className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-50 text-ink-muted hover:text-red-500 shrink-0">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
