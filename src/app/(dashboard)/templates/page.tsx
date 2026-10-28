'use client'
import { useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, Plus, Mail, MessageCircle, Phone, Copy, Trash2, Edit, MoreVertical, CheckCircle, Clock, XCircle, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const TABS = ['All', 'Email', 'WhatsApp', 'SMS', 'Canned Responses']

const MOCK_TEMPLATES = [
  { id: 't1', type: 'email',    name: 'Welcome Email',           status: null,       category: 'Onboarding',    preview: 'Welcome to Vittain! We\'re excited to have you...', used: '3 days ago' },
  { id: 't2', type: 'whatsapp', name: 'abandoned_cart_v2',       status: 'approved', category: 'Marketing',     preview: 'Hey {{1}}, you left something in your cart!', used: '1 day ago' },
  { id: 't3', type: 'whatsapp', name: 'order_confirmation',      status: 'approved', category: 'Utility',       preview: 'Your order #{{1}} has been confirmed. Track it...', used: '2 hours ago' },
  { id: 't4', type: 'whatsapp', name: 'flash_sale_announcement', status: 'pending',  category: 'Marketing',     preview: 'Flash Sale! Get {{1}}% off today only. Use code...', used: 'Never' },
  { id: 't5', type: 'sms',      name: 'OTP Verification',        status: null,       category: 'Auth',          preview: 'Your verification code is {{1}}. Valid for 5 min.', used: '1 hour ago' },
  { id: 't6', type: 'email',    name: 'Weekly Newsletter',       status: null,       category: 'Newsletter',    preview: 'This week at Vittain: new features, tips, and...', used: '5 days ago' },
]

const CANNED = [
  { id: 'cr1', name: 'Greeting',        shortcut: '/hello',    category: 'Greetings', preview: 'Hi {{first_name}}! Welcome to Vittain support. How can I help you today?', count: 142 },
  { id: 'cr2', name: 'Shipping Policy', shortcut: '/shipping', category: 'Shipping',  preview: 'We ship within 2–5 business days. Free shipping on orders over $50.', count: 87 },
  { id: 'cr3', name: 'Return Policy',   shortcut: '/returns',  category: 'Returns',   preview: 'We accept returns within 30 days. Please contact us with your order number.', count: 64 },
  { id: 'cr4', name: 'Pricing Info',    shortcut: '/pricing',  category: 'Pricing',   preview: 'Our plans start from $29/month. Check our pricing page for details.', count: 39 },
]

const STATUS_BADGE: Record<string, { label: string; cls: string; icon: any }> = {
  approved: { label: 'Approved',       cls: 'bg-green-50 text-green-600 border-green-200',  icon: CheckCircle },
  pending:  { label: 'Pending Review', cls: 'bg-amber-50 text-amber-600 border-amber-200',  icon: Clock },
  rejected: { label: 'Rejected',       cls: 'bg-red-50 text-red-600 border-red-200',        icon: XCircle },
}

const TYPE_ICON: Record<string, { icon: any; color: string; bg: string }> = {
  email:    { icon: Mail,          color: 'text-red-500',   bg: 'bg-red-50' },
  whatsapp: { icon: MessageCircle, color: 'text-green-500', bg: 'bg-green-50' },
  sms:      { icon: Phone,         color: 'text-orange-500', bg: 'bg-orange-50' },
}

// WhatsApp Live Preview
function WAPreview({ body }: { body: string }) {
  return (
    <div className="flex items-end justify-center p-4 bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] bg-cover rounded-xl min-h-48">
      <div className="bg-white rounded-xl rounded-br-none px-3 py-2 shadow max-w-[220px] text-[12px] text-gray-900 leading-relaxed">
        {body || <span className="text-gray-400 italic">Your message preview...</span>}
        <p className="text-right text-[10px] text-gray-400 mt-1">10:42 AM ✓✓</p>
      </div>
    </div>
  )
}

// Create WhatsApp Template Modal
function CreateWATemplate({ onClose }: { onClose: () => void }) {
  const [body, setBody] = useState('')
  const [header, setHeader] = useState('')
  const [footer, setFooter] = useState('')
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex-1 p-6 space-y-5 border-r border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Create WhatsApp Template</h2>
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[12px] text-amber-700">
            WhatsApp requires pre-approved message templates from Meta. Submit for review after creation.
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Template Name</label><Input placeholder="e.g. welcome_offer_v1" className="h-9 text-sm" /></div>
            <div><label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Category</label>
              <select className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400">
                <option>Marketing</option><option>Utility</option><option>Authentication</option>
              </select>
            </div>
          </div>
          <div><label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Header (optional)</label><Input value={header} onChange={e => setHeader(e.target.value)} placeholder="Header text — max 60 chars" className="h-9 text-sm" maxLength={60} /></div>
          <div>
            <div className="flex justify-between mb-1.5"><label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Body (required)</label><span className="text-[10px] text-gray-400">{body.length}/1024</span></div>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={4} maxLength={1024} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none" placeholder="Hello {{1}}, your order {{2}} is ready..." />
            <div className="flex gap-2 mt-2">
              {['{{1}}','{{2}}','{{3}}'].map(v => <button key={v} onClick={() => setBody(b => b + v)} className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-[11px] font-mono text-gray-600 hover:bg-gray-200">{v}</button>)}
            </div>
          </div>
          <div><label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Footer (optional)</label><Input value={footer} onChange={e => setFooter(e.target.value)} placeholder="Footer text — max 60 chars" className="h-9 text-sm" maxLength={60} /></div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="h-9 text-sm">Cancel</Button>
            <Button onClick={() => { toast.success('Template submitted for Meta approval'); onClose() }} className="h-9 text-sm bg-ink text-white hover:bg-ink-secondary">Submit for Approval</Button>
          </div>
        </div>
        {/* Live Preview */}
        <div className="w-64 p-6 bg-gray-50 flex flex-col gap-4 shrink-0">
          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Live Preview</p>
          <WAPreview body={[header, body, footer].filter(Boolean).join('\n\n')} />
        </div>
      </div>
    </div>
  )
}

// Create Canned Response Modal
function CreateCannedModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-gray-900">Add Canned Response</h2>
        <div><label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Name</label><Input placeholder="e.g. Shipping Policy" className="h-9 text-sm" /></div>
        <div><label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Shortcut</label><Input placeholder="/shipping" className="h-9 text-sm font-mono" /></div>
        <div><label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Category</label>
          <select className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm focus:outline-none"><option>Greetings</option><option>Pricing</option><option>Returns</option><option>Shipping</option><option>Technical</option><option>Custom</option></select>
        </div>
        <div><label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider block mb-1.5">Response Body</label>
          <textarea rows={4} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none" placeholder="Hi {{first_name}}, thanks for reaching out..." />
          <div className="flex gap-2 mt-2">{['{{first_name}}','{{company}}'].map(v => <button key={v} className="px-2 py-1 bg-gray-100 border border-gray-200 rounded text-[11px] font-mono text-gray-600 hover:bg-gray-200">{v}</button>)}</div>
        </div>
        <div className="flex justify-end gap-3 pt-1">
          <Button variant="outline" onClick={onClose} className="h-9 text-sm">Cancel</Button>
          <Button onClick={() => { toast.success('Canned response saved'); onClose() }} className="h-9 text-sm bg-ink text-white hover:bg-ink-secondary">Save Response</Button>
        </div>
      </div>
    </div>
  )
}

export default function TemplatesPage() {
  const [activeTab, setActiveTab] = useState('All')
  const [search, setSearch] = useState('')
  const [showWA, setShowWA] = useState(false)
  const [showCanned, setShowCanned] = useState(false)
  const [templates, setTemplates] = useState(MOCK_TEMPLATES)
  const [canned, setCanned] = useState(CANNED)

  const isCanned = activeTab === 'Canned Responses'
  const filtered = templates.filter(t => {
    const matchTab = activeTab === 'All' || t.type === activeTab.toLowerCase()
    const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) || t.preview.toLowerCase().includes(search.toLowerCase())
    return matchTab && matchSearch
  })

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 pb-12">
      {showWA && <CreateWATemplate onClose={() => setShowWA(false)} />}
      {showCanned && <CreateCannedModal onClose={() => setShowCanned(false)} />}

      <PageHeader title="Message Templates" description="Reusable templates for campaigns, bots, and canned agent responses.">
        <Button className="h-9 text-xs bg-ink text-white hover:bg-ink-secondary" onClick={() => isCanned ? setShowCanned(true) : setShowWA(true)}>
          <Plus className="w-4 h-4 mr-2" /> Create Template
        </Button>
      </PageHeader>

      {/* Tab Bar + Search */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex border-b border-surface-border gap-1">
          {TABS.map(t => (
            <button key={t} onClick={() => setActiveTab(t)} className={cn('px-4 py-2 text-[13px] font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap', activeTab === t ? 'border-ink text-ink' : 'border-transparent text-ink-secondary hover:text-ink')}>
              {t}
            </button>
          ))}
        </div>
        <div className="relative w-56">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input placeholder="Search templates..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9 bg-surface" />
        </div>
      </div>

      {isCanned ? (
        <div className="bg-surface border border-surface-border rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead><tr className="bg-surface-muted/50 border-b border-surface-border text-[10px] font-bold text-ink-muted uppercase tracking-wider">
              <th className="text-left px-5 py-3">Name</th><th className="px-4 py-3">Shortcut</th><th className="px-4 py-3">Category</th><th className="px-4 py-3 text-left">Preview</th><th className="text-right px-4 py-3">Used</th><th className="px-4 py-3" />
            </tr></thead>
            <tbody className="divide-y divide-surface-border">
              {canned.map(c => (
                <tr key={c.id} className="hover:bg-surface-muted/30 transition-colors">
                  <td className="px-5 py-3 font-semibold text-ink">{c.name}</td>
                  <td className="px-4 py-3"><code className="bg-surface-muted border border-surface-border px-2 py-0.5 rounded text-[11px] font-mono text-ink-secondary">{c.shortcut}</code></td>
                  <td className="px-4 py-3 text-ink-secondary text-[12px]">{c.category}</td>
                  <td className="px-4 py-3 text-ink-muted text-[12px] max-w-xs truncate">{c.preview}</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">{c.count}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-ink-muted hover:text-ink"><Edit className="w-3.5 h-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-ink-muted hover:text-red-500" onClick={() => setCanned(p => p.filter(x => x.id !== c.id))}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(t => {
            const cfg = TYPE_ICON[t.type] || TYPE_ICON.email
            const Icon = cfg.icon
            const status = t.status ? STATUS_BADGE[t.status] : null
            return (
              <div key={t.id} className="bg-surface border border-surface-border rounded-xl p-4 hover:border-accent/30 hover:shadow-sm transition-all flex flex-col group">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', cfg.bg)}>
                      <Icon className={cn('w-4 h-4', cfg.color)} />
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-ink leading-tight">{t.name}</p>
                      <p className="text-[10px] text-ink-muted">{t.category}</p>
                    </div>
                  </div>
                  {status && (
                    <span className={cn('px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border', status.cls)}>{status.label}</span>
                  )}
                </div>
                <p className="text-[12px] text-ink-muted line-clamp-2 flex-1 mb-4">{t.preview}</p>
                <div className="flex items-center justify-between pt-3 border-t border-surface-border">
                  <span className="text-[10px] text-ink-muted">Used {t.used}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" variant="ghost" className="h-7 text-[11px] text-ink-secondary hover:text-ink px-2"><Copy className="w-3 h-3 mr-1" />Duplicate</Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-ink-muted hover:text-red-500" onClick={() => setTemplates(p => p.filter(x => x.id !== t.id))}><Trash2 className="w-3.5 h-3.5" /></Button>
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
