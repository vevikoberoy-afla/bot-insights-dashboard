'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, BookOpen, Bot, ChevronDown, FlaskConical, Package, RefreshCw, ShieldCheck, TicketCheck, X } from 'lucide-react'

type Diagnostics = {
  capabilities: Record<string, number | boolean>
  samples: { product?: string; service?: string }
  operations: Array<any>
  rejected_actions: Array<any>
  audit_installed: boolean
}

export function BotReadinessPanel({ botId, contextId }: { botId: string; contextId?: string | null }) {
  const [data, setData] = useState<Diagnostics | null>(null)
  const [open, setOpen] = useState<'test' | 'audit' | null>(null)
  const [loading, setLoading] = useState(true)
  const [pendingPrompt, setPendingPrompt] = useState('')
  const iframe = useRef<HTMLIFrameElement>(null)
  const load = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/bots/${encodeURIComponent(botId)}/runtime-diagnostics`)
      if (response.ok) setData(await response.json())
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [botId])

  const capabilities = useMemo(() => data ? [
    { label: `${data.capabilities.products || 0} products`, icon: Package, ready: Number(data.capabilities.products) > 0 },
    { label: `${data.capabilities.services || 0} services`, icon: BookOpen, ready: Number(data.capabilities.services) > 0 },
    { label: `${data.capabilities.knowledge_sources || 0} knowledge sources`, icon: Bot, ready: Number(data.capabilities.knowledge_sources) > 0 },
    { label: `${data.capabilities.channels || 0} channels`, icon: Activity, ready: Number(data.capabilities.channels) > 0 },
    { label: 'Order support', icon: TicketCheck, ready: Boolean(data.capabilities.order_status) },
  ] : [], [data])
  const scenarios = useMemo(() => [
    data?.samples.product && { label: 'Product facts', prompt: `What is the price and stock of ${data.samples.product}?` },
    data?.samples.product && { label: 'Safety / allergen', prompt: `Does ${data.samples.product} contain any allergens?` },
    data?.samples.service && { label: 'Book service', prompt: `I want to book ${data.samples.service}.` },
    { label: 'Track order', prompt: 'I want to track my order.' },
    { label: 'Return item', prompt: 'I want to return an item from my order.' },
  ].filter(Boolean) as Array<{ label: string; prompt: string }>, [data])
  const sendScenario = (prompt: string) => {
    setOpen('test')
    setPendingPrompt(prompt)
    iframe.current?.contentWindow?.postMessage({ type: 'rag_widget_test_prompt', prompt }, window.location.origin)
  }
  const postPending = () => {
    if (!pendingPrompt) return
    iframe.current?.contentWindow?.postMessage({ type: 'rag_widget_test_prompt', prompt: pendingPrompt }, window.location.origin)
    setPendingPrompt('')
  }

  return <section className="mb-4 overflow-hidden rounded-2xl border border-surface-border bg-white shadow-sm">
    <div className="flex flex-wrap items-center gap-2 px-4 py-3">
      <div className="mr-2 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600"/><div><p className="text-sm font-semibold text-ink">Bot readiness</p><p className="text-[11px] text-ink-muted">Live configuration and safety signals</p></div></div>
      {loading ? <div className="h-7 w-72 animate-pulse rounded-full bg-surface-muted"/> : capabilities.map(item => <span key={item.label} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${item.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}><item.icon className="h-3 w-3"/>{item.label}</span>)}
      <div className="ml-auto flex gap-2">
        <button onClick={() => setOpen(open === 'audit' ? null : 'audit')} className="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium hover:bg-surface-muted"><Activity className="h-3.5 w-3.5"/>Audit</button>
        <button onClick={() => setOpen(open === 'test' ? null : 'test')} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-xs font-medium text-white"><FlaskConical className="h-3.5 w-3.5"/>Test this bot</button>
      </div>
    </div>
    {open === 'test' && <div className="border-t bg-slate-50/60 p-4">
      <div className="mb-3 flex items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">Scenario test console</h3><p className="text-xs text-ink-muted">Runs the real embedded widget and real bot configuration.</p></div><button aria-label="Close test console" onClick={() => setOpen(null)}><X className="h-4 w-4"/></button></div>
      <div className="mb-3 flex flex-wrap gap-2">{scenarios.map(item => <button key={item.label} onClick={() => sendScenario(item.prompt)} className="rounded-full border bg-white px-3 py-1.5 text-xs hover:border-blue-300 hover:text-blue-700">{item.label}</button>)}</div>
      <div className="mx-auto h-[620px] max-w-[430px] overflow-hidden rounded-[28px] border bg-white shadow-xl"><iframe ref={iframe} onLoad={postPending} title="Bot test console" className="h-full w-full" src={`/widget?bot=${encodeURIComponent(botId)}${contextId ? `&ctx=${encodeURIComponent(contextId)}` : ''}&iframe=true`}/></div>
    </div>}
    {open === 'audit' && <div className="grid gap-4 border-t bg-slate-50/60 p-4 lg:grid-cols-2">
      <AuditList title="Atomic operations" empty="No booking or order commits recorded yet." rows={data?.operations || []} render={row => <><span className="font-medium capitalize">{String(row.operation_type || 'operation').replaceAll('_', ' ')}</span><span className="text-ink-muted">{row.status} · {new Date(row.created_at).toLocaleString()}</span></>}/>
      <AuditList title="Protected card actions" empty={data?.audit_installed === false ? 'Apply supabase/092_chat_action_audit.sql to display rejected duplicate actions.' : 'No stale or duplicate actions rejected.'} rows={data?.rejected_actions || []} render={row => <><span className="font-medium capitalize">{row.outcome} action blocked</span><span className="text-ink-muted">revision {row.expected_revision ?? '—'} → {row.actual_revision} · {new Date(row.created_at).toLocaleString()}</span></>}/>
      <button onClick={load} className="inline-flex w-fit items-center gap-1 text-xs text-ink-muted hover:text-ink"><RefreshCw className="h-3 w-3"/>Refresh activity</button>
    </div>}
  </section>
}

function AuditList({ title, empty, rows, render }: { title: string; empty: string; rows: any[]; render: (row: any) => React.ReactNode }) {
  return <div className="rounded-xl border bg-white p-3"><div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</h3><ChevronDown className="h-3.5 w-3.5 text-ink-muted"/></div>{rows.length ? <div className="max-h-52 space-y-2 overflow-auto">{rows.map((row, index) => <div key={row.id || row.operation_id || index} className="flex flex-col rounded-lg bg-surface-muted/60 px-3 py-2 text-xs">{render(row)}</div>)}</div> : <p className="py-5 text-center text-xs text-ink-muted">{empty}</p>}</div>
}
