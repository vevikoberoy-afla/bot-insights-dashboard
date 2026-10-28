'use client'
import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  ArrowLeft, Plus, Play, Pause, Trash2, ChevronRight,
  Mail, MessageCircle, Phone, Clock, GitBranch, Users,
  LogIn, LogOut, Timer, Filter, Settings, Zap
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {fetchDashboardData,readDashboardData,writeDashboardData} from '@/lib/client/featureDataCache'

const MOCK_JOURNEYS = [
  { id: 'j-1', name: 'Abandoned Cart Recovery', status: 'active',  enrolled: 342, completed: 198, conversion: '18%', created: '2026-08-01' },
  { id: 'j-2', name: 'New User Onboarding',      status: 'active',  enrolled: 891, completed: 652, conversion: '12%', created: '2026-07-15' },
  { id: 'j-3', name: 'Win-Back Lapsed Users',    status: 'paused',  enrolled: 124, completed: 41,  conversion: '6%',  created: '2026-08-10' },
  { id: 'j-4', name: 'VIP Loyalty Campaign',     status: 'draft',   enrolled: 0,   completed: 0,   conversion: '—',   created: '2026-08-27' },
]

const NODE_TYPES = [
  { type: 'entry',   label: 'Entry Trigger',    icon: LogIn,         color: 'border-green-300 bg-green-50',   iconColor: 'text-green-600',  desc: 'Who enters this journey' },
  { type: 'message', label: 'Send Message',      icon: Mail,          color: 'border-blue-300 bg-blue-50',     iconColor: 'text-blue-600',   desc: 'Send email, WhatsApp, or SMS' },
  { type: 'wait',    label: 'Wait For',          icon: Timer,         color: 'border-amber-300 bg-amber-50',   iconColor: 'text-amber-600',  desc: 'Pause until condition is met' },
  { type: 'delay',   label: 'Delay',             icon: Clock,         color: 'border-purple-300 bg-purple-50', iconColor: 'text-purple-600', desc: 'Fixed wait before next step' },
  { type: 'split',   label: 'Segment Split',     icon: GitBranch,     color: 'border-indigo-300 bg-indigo-50', iconColor: 'text-indigo-600', desc: 'Branch based on segment' },
  { type: 'exit',    label: 'Exit',              icon: LogOut,        color: 'border-red-300 bg-red-50',       iconColor: 'text-red-500',    desc: 'End journey for user' },
]

// A visual canvas node
function FlowNode({ node, onRemove }: { node: any; onRemove: () => void }) {
  const cfg = NODE_TYPES.find(n => n.type === node.type) || NODE_TYPES[0]
  const Icon = cfg.icon
  return (
    <div className="relative group">
      <div className={cn('border-2 rounded-xl p-4 w-64 shadow-sm cursor-pointer hover:shadow-md transition-all', cfg.color)}>
        <div className="flex items-start justify-between mb-2">
          <div className={cn('w-8 h-8 rounded-lg bg-white flex items-center justify-center shadow-sm')}>
            <Icon className={cn('w-4 h-4', cfg.iconColor)} />
          </div>
          <button onClick={onRemove} className="opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 p-1">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[13px] font-bold text-ink">{cfg.label}</p>
        <p className="text-[11px] text-ink-muted mt-0.5">{node.detail || cfg.desc}</p>
      </div>
      {/* Connector arrow down */}
      {node.type !== 'exit' && (
        <div className="flex justify-center mt-1 mb-1">
          <div className="w-px h-6 bg-surface-border" />
        </div>
      )}
    </div>
  )
}

// Canvas view for building a journey
function JourneyCanvas({ journey, onBack }: { journey: any; onBack: () => void }) {
  const [nodes, setNodes] = useState([
    { id: 'n1', type: 'entry',   detail: 'Trigger: Cart abandoned for > 1 hour' },
    { id: 'n2', type: 'message', detail: 'Send Email: "You left something behind"' },
    { id: 'n3', type: 'delay',   detail: 'Wait 24 hours' },
    { id: 'n4', type: 'wait',    detail: 'If email not opened in 12h → continue' },
    { id: 'n5', type: 'message', detail: 'Send WhatsApp: "Still interested? Here\'s 10% off"' },
    { id: 'n6', type: 'exit',    detail: 'End of journey' },
  ])

  const addNode = (type: string) => {
    const cfg = NODE_TYPES.find(n => n.type === type)
    setNodes(prev => {
      const exitIdx = prev.findIndex(n => n.type === 'exit')
      const newNode = { id: `n${Date.now()}`, type, detail: cfg?.desc || '' }
      if (exitIdx >= 0) {
        const next = [...prev]
        next.splice(exitIdx, 0, newNode)
        return next
      }
      return [...prev, newNode]
    })
    toast.success(`${cfg?.label} node added`)
  }

  return (
    <div className="h-full flex flex-col">
      <PageHeader title={journey.name} description="Visual journey builder — drag nodes to reorder">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onBack}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> All Journeys
          </Button>
          <Button size="sm" className="h-8 text-xs bg-ink text-white hover:bg-ink-secondary" onClick={() => toast.success('Journey saved!')}>
            Save Journey
          </Button>
        </div>
      </PageHeader>

      <div className="flex gap-5 flex-1 min-h-0 mt-6">
        {/* Node Palette */}
        <aside className="w-52 shrink-0">
          <div className="bg-surface border border-surface-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-surface-border bg-surface-muted/30">
              <p className="text-xs font-bold text-ink uppercase tracking-wider">Add Node</p>
            </div>
            <div className="p-3 space-y-2">
              {NODE_TYPES.map(n => {
                const Icon = n.icon
                return (
                  <button
                    key={n.type}
                    onClick={() => addNode(n.type)}
                    className="w-full flex items-center gap-2.5 p-2.5 rounded-lg border border-surface-border hover:border-accent/40 hover:bg-surface-muted transition-colors text-left group"
                  >
                    <div className={cn('w-7 h-7 rounded-md flex items-center justify-center shrink-0', n.color)}>
                      <Icon className={cn('w-3.5 h-3.5', n.iconColor)} />
                    </div>
                    <div>
                      <p className="text-[12px] font-semibold text-ink">{n.label}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Journey Settings */}
          <div className="bg-surface border border-surface-border rounded-xl overflow-hidden shadow-sm mt-4">
            <div className="px-4 py-3 border-b border-surface-border bg-surface-muted/30">
              <p className="text-xs font-bold text-ink uppercase tracking-wider">Journey Settings</p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block mb-1">Entry Frequency</label>
                <select className="w-full h-8 border border-surface-border rounded-lg px-2 text-xs bg-surface focus:outline-none focus:ring-1 focus:ring-accent">
                  <option>Enter once per user</option>
                  <option>Re-enter after 7 days</option>
                  <option>Enter every time</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-ink-muted uppercase tracking-wider block mb-1">Status</label>
                <span className="px-2 py-1 rounded-full text-[10px] font-bold bg-status-greenBg text-status-green border border-status-green/20 uppercase tracking-wider">Active</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Canvas */}
        <div className="flex-1 bg-surface-muted/30 border border-surface-border rounded-xl overflow-auto p-8">
          <div className="flex flex-col items-center min-h-full">
            {nodes.map((node, i) => (
              <FlowNode
                key={node.id}
                node={node}
                onRemove={() => setNodes(prev => prev.filter(n => n.id !== node.id))}
              />
            ))}
            <button
              onClick={() => addNode('message')}
              className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-surface-border rounded-xl text-sm font-medium text-ink-muted hover:border-accent/50 hover:text-accent transition-colors mt-2"
            >
              <Plus className="w-4 h-4" /> Add Step
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function JourneysPage() {
  const cached=readDashboardData<any[]>('/api/campaigns/journeys')
  const [journeys, setJourneys] = useState(cached||MOCK_JOURNEYS)
  const [selected, setSelected] = useState<any>(null)
  useEffect(()=>{void fetchDashboardData<any[]>('/api/campaigns/journeys').then(setJourneys).catch(()=>{})},[])

  if (selected) {
    return <JourneyCanvas journey={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-300 pb-12">
      <PageHeader title="Journey Builder" description="Create automated multi-step sequences triggered by events.">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
            <Link href="/campaigns/all"><ArrowLeft className="w-3.5 h-3.5 mr-1.5" /> All Campaigns</Link>
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs bg-ink text-white hover:bg-ink-secondary"
            onClick={() => {
              const newJ = { id: `j-${Date.now()}`, name: 'New Journey', status: 'draft', enrolled: 0, completed: 0, conversion: '—', created: new Date().toISOString().split('T')[0] }
              setJourneys(p => {const next=[newJ,...p];writeDashboardData('/api/campaigns/journeys',next);return next})
              setSelected(newJ)
            }}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Create Journey
          </Button>
        </div>
      </PageHeader>
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Preview builder: journeys are not dispatched until the automation service is connected.</div>

      {/* Summary Row */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Active Journeys', value: journeys.filter(j => j.status === 'active').length, icon: Play, color: 'text-green-500', bg: 'bg-green-50 border-green-100' },
          { label: 'Total Enrolled', value: journeys.reduce((a, j) => a + j.enrolled, 0).toLocaleString(), icon: Users, color: 'text-blue-500', bg: 'bg-blue-50 border-blue-100' },
          { label: 'Total Completed', value: journeys.reduce((a, j) => a + j.completed, 0).toLocaleString(), icon: Zap, color: 'text-purple-500', bg: 'bg-purple-50 border-purple-100' },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className={cn('rounded-xl border px-5 py-4 flex items-center gap-4', s.bg)}>
              <Icon className={cn('w-5 h-5', s.color)} />
              <div>
                <p className="text-[10px] font-bold text-ink-muted uppercase tracking-wider">{s.label}</p>
                <p className="text-xl font-bold text-ink">{s.value}</p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Journeys Table */}
      <div className="bg-surface border border-surface-border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-muted/50 border-b border-surface-border text-[10px] font-bold text-ink-muted uppercase tracking-wider">
              <th className="text-left px-5 py-3">Journey Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="text-right px-4 py-3">Enrolled</th>
              <th className="text-right px-4 py-3">Completed</th>
              <th className="text-right px-4 py-3">Conversion</th>
              <th className="text-left px-4 py-3">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-border">
            {journeys.map(j => {
              const statusCfg = j.status === 'active' ? 'bg-status-greenBg text-status-green border-status-green/20'
                : j.status === 'paused' ? 'bg-amber-50 text-amber-600 border-amber-200'
                : 'bg-surface-muted text-ink-muted border-surface-border'
              return (
                <tr key={j.id} className="hover:bg-surface-muted/30 transition-colors cursor-pointer" onClick={() => setSelected(j)}>
                  <td className="px-5 py-3.5 font-semibold text-ink text-[13px]">{j.name}</td>
                  <td className="px-4 py-3.5">
                    <span className={cn('px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border', statusCfg)}>{j.status}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right font-medium text-ink">{j.enrolled.toLocaleString()}</td>
                  <td className="px-4 py-3.5 text-right text-ink-secondary">{j.completed.toLocaleString()}</td>
                  <td className="px-4 py-3.5 text-right font-bold text-emerald-600">{j.conversion}</td>
                  <td className="px-4 py-3.5 text-ink-muted text-[12px]">{j.created}</td>
                  <td className="px-4 py-3.5">
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-accent hover:bg-accent/5" onClick={e => { e.stopPropagation(); setSelected(j) }}>
                      Edit <ChevronRight className="w-3 h-3 ml-1" />
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
