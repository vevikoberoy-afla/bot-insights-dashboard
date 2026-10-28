'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, BookOpen, CalendarDays, Check, CircleStop, GitBranch, Grip,
  Headphones, LayoutTemplate, Link2, Loader2, LockKeyhole, Maximize2,
  Minus, PackageSearch, Phone, Play, Plus, Redo2, RotateCcw, Save,
  Undo2, Users, ZoomIn, ZoomOut,
} from 'lucide-react'
import { toast } from 'sonner'
import BotJourneyInspector from '@/components/bots/BotJourneyInspector'
import BotJourneyTemplateGallery from '@/components/bots/BotJourneyTemplateGallery'
import { fetchDashboardData, invalidateDashboardData, readDashboardData } from '@/lib/client/featureDataCache'
import {
  createJourneyTemplate, fullServiceJourneyTemplate, journeyPolicyFromFlow,
  supportJourneyTemplate, type BotJourney, type BotJourneyNode,
  type BotJourneyNodeType, type BotJourneyTemplateKey,
} from '@/lib/botJourney'

const NODE_WIDTH = 224
const NODE_HEIGHT = 82
const CANVAS_WIDTH = 1900
const CANVAS_HEIGHT = 1000
const MIN_ZOOM = .5
const MAX_ZOOM = 1.35

const nodeMeta: Record<BotJourneyNodeType, { label: string; description: string; icon: any; color: string }> = {
  start: { label: 'Start', description: 'Entry point for every message', icon: Play, color: 'border-blue-200 bg-blue-50 text-blue-700' },
  verify_phone: { label: 'Verify phone', description: 'Require the registered phone', icon: Phone, color: 'border-amber-200 bg-amber-50 text-amber-700' },
  verify_order: { label: 'Verify order', description: 'Match phone and order ID', icon: LockKeyhole, color: 'border-amber-200 bg-amber-50 text-amber-700' },
  support: { label: 'Customer support', description: 'Returns, status and tickets', icon: Headphones, color: 'border-violet-200 bg-violet-50 text-violet-700' },
  knowledge: { label: 'Knowledge answer', description: 'Answer from approved sources', icon: BookOpen, color: 'border-cyan-200 bg-cyan-50 text-cyan-700' },
  commerce: { label: 'Product shopping', description: 'Catalogue, cart and orders', icon: PackageSearch, color: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  booking: { label: 'Booking', description: 'Services and appointments', icon: CalendarDays, color: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700' },
  handoff: { label: 'Human handoff', description: 'Transfer to an available agent', icon: Users, color: 'border-orange-200 bg-orange-50 text-orange-700' },
  end: { label: 'End', description: 'Finish the journey', icon: CircleStop, color: 'border-slate-200 bg-slate-50 text-slate-700' },
}
const palette: BotJourneyNodeType[] = ['verify_phone', 'verify_order', 'support', 'knowledge', 'commerce', 'booking', 'handoff', 'end']
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
const cloneJourney = (journey: BotJourney) => JSON.parse(JSON.stringify(journey)) as BotJourney
const normalizeJourney = (flow: any): BotJourney => flow?.version === 1 && Array.isArray(flow.nodes)
  ? flow
  : flow?.type === 'support' ? supportJourneyTemplate(flow || {}) : fullServiceJourneyTemplate(flow || {})

export default function BotJourneyPage() {
  const params = useParams()
  const id = String(params?.id || '')
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ id: string; dx: number; dy: number; before: BotJourney; moved: boolean } | null>(null)
  const historyRef = useRef<BotJourney[]>([])
  const futureRef = useRef<BotJourney[]>([])

  const [bot, setBot] = useState<any>(null)
  const [journey, setJourney] = useState<BotJourney>(() => fullServiceJourneyTemplate())
  const [selectedId, setSelectedId] = useState('start')
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [connectionDrag, setConnectionDrag] = useState<{ source: string; x: number; y: number } | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [zoom, setZoom] = useState(.8)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!id) return
    const url = `/api/bots/${encodeURIComponent(id)}`
    const cached = readDashboardData<any>(url)
    if (cached) {
      setBot(cached)
      setJourney(normalizeJourney(cached.bot_flow))
      setLoading(false)
    }
    fetchDashboardData<any>(url).then(data => {
      setBot(data)
      setJourney(normalizeJourney(data.bot_flow))
    }).catch(() => toast.error('Could not load this bot.')).finally(() => setLoading(false))
  }, [id])

  const selected = journey.nodes.find(node => node.id === selectedId) || null
  const policy = useMemo(() => journeyPolicyFromFlow(journey), [journey])

  const recordHistory = useCallback((before: BotJourney) => {
    historyRef.current = [...historyRef.current.slice(-29), cloneJourney(before)]
    futureRef.current = []
    setHistoryVersion(value => value + 1)
    setDirty(true)
  }, [])

  const update = useCallback((updater: (current: BotJourney) => BotJourney) => {
    const next = updater(journey)
    if (next === journey) return
    recordHistory(journey)
    setJourney(next)
  }, [journey, recordHistory])

  const undo = () => {
    const previous = historyRef.current.pop()
    if (!previous) return
    futureRef.current.push(cloneJourney(journey))
    setJourney(previous)
    setHistoryVersion(value => value + 1)
    setDirty(true)
  }
  const redo = () => {
    const next = futureRef.current.pop()
    if (!next) return
    historyRef.current.push(cloneJourney(journey))
    setJourney(next)
    setHistoryVersion(value => value + 1)
    setDirty(true)
  }

  const centerJourney = useCallback((target = journey, targetZoom = zoom) => {
    const viewport = viewportRef.current
    if (!viewport || !target.nodes.length) return
    const minX = Math.min(...target.nodes.map(node => node.position.x))
    const maxX = Math.max(...target.nodes.map(node => node.position.x + NODE_WIDTH))
    const minY = Math.min(...target.nodes.map(node => node.position.y))
    const maxY = Math.max(...target.nodes.map(node => node.position.y + NODE_HEIGHT))
    viewport.scrollTo({
      left: Math.max(0, ((minX + maxX) / 2) * targetZoom - viewport.clientWidth / 2),
      top: Math.max(0, ((minY + maxY) / 2) * targetZoom - viewport.clientHeight / 2),
      behavior: 'smooth',
    })
  }, [journey, zoom])

  const fitJourney = () => {
    const viewport = viewportRef.current
    if (!viewport || !journey.nodes.length) return
    const minX = Math.min(...journey.nodes.map(node => node.position.x))
    const maxX = Math.max(...journey.nodes.map(node => node.position.x + NODE_WIDTH))
    const minY = Math.min(...journey.nodes.map(node => node.position.y))
    const maxY = Math.max(...journey.nodes.map(node => node.position.y + NODE_HEIGHT))
    const next = Math.max(MIN_ZOOM, Math.min(1, Math.min((viewport.clientWidth - 100) / Math.max(1, maxX - minX), (viewport.clientHeight - 120) / Math.max(1, maxY - minY))))
    setZoom(next)
    requestAnimationFrame(() => centerJourney(journey, next))
  }

  const chooseNode = (nodeId: string) => {
    if (connectFrom && connectFrom !== nodeId && !connectionDrag) {
      update(current => current.edges.some(edge => edge.source === connectFrom && edge.target === nodeId)
        ? current
        : { ...current, edges: [...current.edges, { id: uid('edge'), source: connectFrom, target: nodeId, label: '', condition: 'always' }] })
      setConnectFrom(null)
    }
    setSelectedId(nodeId)
  }

  const addNode = (type: BotJourneyNodeType) => {
    const nodeId = uid(type)
    const viewport = viewportRef.current
    const x = viewport ? (viewport.scrollLeft + viewport.clientWidth / 2) / zoom - NODE_WIDTH / 2 : 400
    const y = viewport ? (viewport.scrollTop + viewport.clientHeight / 2) / zoom - NODE_HEIGHT / 2 : 240
    update(current => ({ ...current, nodes: [...current.nodes, { id: nodeId, type, label: nodeMeta[type].label, enabled: true, position: { x: Math.max(30, x), y: Math.max(70, y) }, config: {} }] }))
    setSelectedId(nodeId)
  }

  const removeNode = (nodeId: string) => {
    const node = journey.nodes.find(item => item.id === nodeId)
    if (!node || node.type === 'start') return
    update(current => ({ ...current, nodes: current.nodes.filter(item => item.id !== nodeId), edges: current.edges.filter(edge => edge.source !== nodeId && edge.target !== nodeId) }))
    setSelectedId('start')
  }

  const canvasPoint = (event: React.PointerEvent) => {
    const viewport = viewportRef.current
    if (!viewport) return { x: 0, y: 0 }
    const rect = viewport.getBoundingClientRect()
    return { x: (event.clientX - rect.left + viewport.scrollLeft) / zoom, y: (event.clientY - rect.top + viewport.scrollTop) / zoom }
  }

  const beginNodeDrag = (event: React.PointerEvent, node: BotJourneyNode) => {
    if ((event.target as HTMLElement).closest('button')) return
    const point = canvasPoint(event)
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    dragRef.current = { id: node.id, dx: point.x - node.position.x, dy: point.y - node.position.y, before: cloneJourney(journey), moved: false }
    setSelectedId(node.id)
  }

  const beginConnection = (event: React.PointerEvent, node: BotJourneyNode) => {
    event.preventDefault()
    event.stopPropagation()
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
    setSelectedId(node.id)
    setConnectFrom(node.id)
    setConnectionDrag({ source: node.id, x: node.position.x + NODE_WIDTH, y: node.position.y + NODE_HEIGHT / 2 })
  }

  const pointerMove = (event: React.PointerEvent) => {
    const point = canvasPoint(event)
    if (connectionDrag) {
      setConnectionDrag(current => current ? { ...current, ...point } : null)
      return
    }
    const drag = dragRef.current
    if (!drag) return
    drag.moved = true
    setJourney(current => ({ ...current, nodes: current.nodes.map(node => node.id === drag.id ? { ...node, position: { x: Math.max(20, Math.min(CANVAS_WIDTH - NODE_WIDTH - 20, point.x - drag.dx)), y: Math.max(60, Math.min(CANVAS_HEIGHT - NODE_HEIGHT - 20, point.y - drag.dy)) } } : node) }))
    setDirty(true)
  }

  const finishPointer = (event: React.PointerEvent) => {
    const drag = dragRef.current
    if (drag?.moved) recordHistory(drag.before)
    dragRef.current = null
    if (!connectionDrag) return
    const target = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-node-input]')?.dataset.nodeInput
    if (target && target !== connectionDrag.source) {
      update(current => current.edges.some(edge => edge.source === connectionDrag.source && edge.target === target)
        ? current
        : { ...current, edges: [...current.edges, { id: uid('edge'), source: connectionDrag.source, target, label: '', condition: 'always' }] })
    }
    setConnectionDrag(null)
    setConnectFrom(null)
  }

  const applyTemplate = (key: BotJourneyTemplateKey) => {
    if (dirty && !window.confirm('Replace the current unsaved canvas with this template?')) return
    const next = createJourneyTemplate(key, journey)
    recordHistory(journey)
    setJourney(next)
    setSelectedId('start')
    setConnectFrom(null)
    setConnectionDrag(null)
    setTemplatesOpen(false)
    requestAnimationFrame(() => centerJourney(next, zoom))
  }

  const save = async () => {
    setSaving(true)
    try {
      const response = await fetch(`/api/bots/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bot_flow: journey }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not save journey')
      setBot(data)
      setJourney(normalizeJourney(data.bot_flow))
      invalidateDashboardData(`/api/bots/${encodeURIComponent(id)}`)
      historyRef.current = []
      futureRef.current = []
      setHistoryVersion(value => value + 1)
      setDirty(false)
      toast.success('Journey published. New conversations now use this routing policy.')
    } catch (error: any) {
      toast.error(error?.message || 'Could not save journey')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="mx-auto max-w-[1700px] space-y-3 p-4"><div className="h-16 animate-pulse rounded-2xl bg-surface-muted"/><div className="h-[720px] animate-pulse rounded-2xl border border-surface-border bg-surface"/></div>
  if (!bot) return <div className="p-20 text-center text-ink-muted">Bot not found.</div>

  return <main className="mx-auto flex h-[calc(100vh-72px)] min-h-[720px] max-w-[1800px] flex-col overflow-hidden px-3 pb-3 pt-2">
    <header className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-surface-border bg-white px-4 py-3 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <Link href={`/bots/${id}/edit`} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-surface-border text-ink-secondary hover:bg-surface-muted" aria-label="Back to bot settings"><ArrowLeft className="h-4 w-4"/></Link>
        <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-lg font-bold text-ink">{bot.name} journey</h1><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${policy.supportOnly ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>{policy.supportOnly ? 'SUPPORT ONLY' : 'CUSTOM'}</span></div><p className="truncate text-xs text-ink-muted">Build the conversation from left to right, then publish it.</p></div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={undo} disabled={!historyRef.current.length} title="Undo" className="grid h-9 w-9 place-items-center rounded-xl border border-surface-border bg-white text-ink-secondary hover:bg-surface-muted disabled:opacity-35"><Undo2 className="h-4 w-4"/></button>
        <button type="button" onClick={redo} disabled={!futureRef.current.length} title="Redo" className="grid h-9 w-9 place-items-center rounded-xl border border-surface-border bg-white text-ink-secondary hover:bg-surface-muted disabled:opacity-35"><Redo2 className="h-4 w-4"/></button>
        <button type="button" onClick={() => setTemplatesOpen(true)} className="flex h-9 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100"><LayoutTemplate className="h-4 w-4"/>Templates</button>
        <button type="button" onClick={save} disabled={saving || !dirty} className="flex h-9 items-center gap-2 rounded-xl bg-ink px-4 text-xs font-semibold text-white disabled:opacity-45">{saving ? <Loader2 className="h-4 w-4 animate-spin"/> : dirty ? <Save className="h-4 w-4"/> : <Check className="h-4 w-4"/>}{saving ? 'Publishing…' : dirty ? 'Publish' : 'Published'}</button>
      </div>
    </header>

    <BotJourneyTemplateGallery open={templatesOpen} onClose={() => setTemplatesOpen(false)} onSelect={applyTemplate}/>

    <section className="grid min-h-0 flex-1 gap-2 lg:grid-cols-[238px_minmax(420px,1fr)_328px]">
      <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-surface-border bg-white shadow-sm">
        <div className="shrink-0 border-b border-surface-border px-3 py-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Plus className="h-4 w-4"/><h2 className="text-xs font-bold uppercase tracking-wide text-ink-secondary">Add a step</h2></div><span className="rounded-full bg-surface-muted px-2 py-0.5 text-[9px] font-bold text-ink-muted">{journey.nodes.length}/40</span></div><p className="mt-1 text-[10px] text-ink-muted">Click a step to place it in the canvas.</p></div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
          {palette.map(type => { const item = nodeMeta[type], Icon = item.icon; return <button key={type} type="button" onClick={() => addNode(type)} className="group flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 text-left transition hover:-translate-y-px hover:border-blue-300 hover:shadow-md"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${item.color}`}><Icon className="h-4 w-4"/></span><span className="min-w-0"><strong className="block text-xs text-ink">{item.label}</strong><small className="mt-0.5 block text-[10px] leading-4 text-ink-muted">{item.description}</small></span><Plus className="ml-auto h-3.5 w-3.5 shrink-0 text-slate-300 group-hover:text-blue-600"/></button> })}
        </div>
        <div className="shrink-0 border-t border-surface-border p-3"><button type="button" onClick={() => setTemplatesOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-50 px-3 py-2.5 text-xs font-bold text-blue-700 hover:bg-blue-100"><LayoutTemplate className="h-4 w-4"/>Start from a template</button></div>
      </aside>

      <section className="relative min-h-0 overflow-hidden rounded-2xl border border-surface-border bg-[#f7f8fa] shadow-sm">
        <div className="absolute left-3 top-3 z-30 flex items-center gap-2 rounded-xl border border-surface-border bg-white/95 px-3 py-2 text-[10px] text-ink-secondary shadow-sm backdrop-blur"><Grip className="h-3.5 w-3.5"/><span className="hidden sm:inline">Drag cards to move · drag the blue dot to connect</span><span className="sm:hidden">Drag to build</span></div>
        {connectFrom && <div className="absolute right-3 top-3 z-30 flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-[10px] font-semibold text-white shadow-lg"><Link2 className="h-3.5 w-3.5"/>{connectionDrag ? 'Drop on a grey input dot' : 'Select a destination'}<button type="button" onClick={() => { setConnectFrom(null); setConnectionDrag(null) }} className="rounded-md bg-white/20 px-1.5 py-0.5">Cancel</button></div>}
        <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-surface-border bg-white/95 p-1 shadow-lg backdrop-blur">
          <button type="button" onClick={() => setZoom(value => Math.max(MIN_ZOOM, +(value - .1).toFixed(2)))} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-muted" title="Zoom out"><ZoomOut className="h-4 w-4"/></button>
          <button type="button" onClick={() => setZoom(1)} className="min-w-12 rounded-lg px-2 py-1.5 text-[10px] font-bold hover:bg-surface-muted">{Math.round(zoom * 100)}%</button>
          <button type="button" onClick={() => setZoom(value => Math.min(MAX_ZOOM, +(value + .1).toFixed(2)))} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-muted" title="Zoom in"><ZoomIn className="h-4 w-4"/></button>
          <span className="mx-1 h-5 w-px bg-surface-border"/>
          <button type="button" onClick={fitJourney} className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[10px] font-semibold hover:bg-surface-muted" title="Fit journey"><Maximize2 className="h-3.5 w-3.5"/>Fit</button>
          <button type="button" onClick={() => centerJourney()} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-surface-muted" title="Center journey"><RotateCcw className="h-3.5 w-3.5"/></button>
        </div>
        <div ref={viewportRef} onPointerMove={pointerMove} onPointerUp={finishPointer} onPointerCancel={() => { dragRef.current = null; setConnectionDrag(null); setConnectFrom(null) }} className="h-full min-h-[560px] overflow-auto bg-[radial-gradient(circle,#cfd5df_1px,transparent_1px)] [background-size:22px_22px]">
          <div style={{ width: CANVAS_WIDTH * zoom, height: CANVAS_HEIGHT * zoom }} className="relative">
            <div style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT, transform: `scale(${zoom})`, transformOrigin: 'top left' }} className="absolute left-0 top-0">
              <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
                <defs><marker id="journey-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8"/></marker></defs>
                {journey.edges.map(edge => {
                  const source = journey.nodes.find(node => node.id === edge.source), target = journey.nodes.find(node => node.id === edge.target)
                  if (!source || !target) return null
                  const x1 = source.position.x + NODE_WIDTH, y1 = source.position.y + NODE_HEIGHT / 2, x2 = target.position.x, y2 = target.position.y + NODE_HEIGHT / 2, bend = Math.max(46, Math.abs(x2 - x1) * .45)
                  const stroke = edge.condition === 'failure' ? '#ef4444' : edge.condition === 'success' ? '#10b981' : edge.condition === 'intent' ? '#8b5cf6' : '#94a3b8'
                  return <g key={edge.id}><path d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`} fill="none" stroke={stroke} strokeWidth="2" markerEnd="url(#journey-arrow)"/>{edge.label && <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 8} textAnchor="middle" className="fill-slate-500 text-[10px] font-semibold">{edge.label}</text>}</g>
                })}
                {connectionDrag && (() => { const source = journey.nodes.find(node => node.id === connectionDrag.source); if (!source) return null; const x1 = source.position.x + NODE_WIDTH, y1 = source.position.y + NODE_HEIGHT / 2, bend = Math.max(46, Math.abs(connectionDrag.x - x1) * .4); return <path d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${connectionDrag.x - bend} ${connectionDrag.y}, ${connectionDrag.x} ${connectionDrag.y}`} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeDasharray="7 5"/> })()}
              </svg>
              {journey.nodes.map(node => {
                const item = nodeMeta[node.type], Icon = item.icon, active = selectedId === node.id
                return <article key={node.id} onPointerDown={event => beginNodeDrag(event, node)} onClick={() => chooseNode(node.id)} style={{ left: node.position.x, top: node.position.y, width: NODE_WIDTH, height: NODE_HEIGHT, touchAction: 'none' }} className={`absolute z-10 cursor-grab select-none rounded-2xl border bg-white p-3 shadow-sm transition-[box-shadow,border-color,opacity] active:cursor-grabbing ${active ? 'border-blue-500 ring-4 ring-blue-100 shadow-lg' : 'border-slate-200 hover:border-slate-300 hover:shadow-md'} ${node.enabled === false ? 'opacity-45 grayscale' : ''}`}>
                  <div className="flex items-center gap-2.5"><span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${item.color}`}><Icon className="h-4 w-4"/></span><span className="min-w-0"><strong className="block truncate text-[12px] text-ink">{node.label}</strong><small className="mt-0.5 block truncate text-[10px] text-ink-muted">{item.description}</small></span></div>
                  {node.type !== 'end' && <button type="button" aria-label={`Connect from ${node.label}`} title="Drag to create a connection" onPointerDown={event => beginConnection(event, node)} className="absolute -right-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-[4px] border-white bg-blue-500 shadow ring-1 ring-blue-300 transition hover:scale-125"/>}
                  <button type="button" data-node-input={node.id} aria-label={`Connect to ${node.label}`} title="Connection input" className="absolute -left-2.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full border-[4px] border-white bg-slate-400 shadow ring-1 ring-slate-300 transition hover:scale-125 hover:bg-blue-500"/>
                </article>
              })}
            </div>
          </div>
        </div>
      </section>

      <aside className="flex min-h-0 flex-col gap-2 overflow-hidden">
        <div className="min-h-0 flex-1"><BotJourneyInspector journey={journey} selected={selected} connectFrom={connectFrom} setConnectFrom={setConnectFrom} update={update} removeNode={removeNode} icon={selected ? (() => { const Icon = nodeMeta[selected.type].icon; return <span className={`grid h-9 w-9 place-items-center rounded-xl border ${nodeMeta[selected.type].color}`}><Icon className="h-4 w-4"/></span> })() : null}/></div>
        <section className="shrink-0 rounded-2xl border border-surface-border bg-white p-3 shadow-sm"><div className="mb-2 flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Live routing</p><GitBranch className="h-3.5 w-3.5 text-ink-muted"/></div><div className="grid grid-cols-2 gap-1.5">{[['Support', policy.allowSupport], ['Knowledge', policy.allowKnowledge], ['Shopping', policy.allowCommerce], ['Booking', policy.allowBooking], ['Handoff', policy.allowHandoff], ['Phone gate', policy.requirePhone], ['Order gate', policy.requireOrder]].map(([label, enabled]) => <div key={String(label)} className={`rounded-lg px-2 py-1.5 text-[10px] font-semibold ${enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{enabled ? '✓' : '—'} {label}</div>)}</div></section>
      </aside>
    </section>
  </main>
}
