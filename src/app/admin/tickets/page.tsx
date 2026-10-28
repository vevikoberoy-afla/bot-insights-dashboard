'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import {getVerifiedAccessToken} from '@/lib/client/verifiedAuth'
import { useCachedFetch, useInvalidate } from '@/lib/cache'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Plus, X, List, LayoutGrid, ChevronsRight } from 'lucide-react'

const COLUMNS = ['open', 'in_progress', 'waiting', 'resolved', 'closed']
const COLUMN_LABELS: Record<string, string> = {
  open: 'Open', in_progress: 'In Progress', waiting: 'Waiting', resolved: 'Resolved', closed: 'Closed'
}

const PRIORITIES: Record<string, { color: string; bg: string }> = {
  urgent: { color: 'text-status-red', bg: 'bg-status-redBg border-status-red/20' },
  high: { color: 'text-status-amber', bg: 'bg-status-amberBg border-status-amber/20' },
  medium: { color: 'text-status-blue', bg: 'bg-status-blueBg border-status-blue/20' },
  low: { color: 'text-status-green', bg: 'bg-status-greenBg border-status-green/20' },
}

export default function TicketsPage() {
  const [view, setView] = useState<'kanban' | 'table'>('kanban')
  const { invalidate } = useInvalidate()
  
  const [activeClientId, setActiveClientId] = useState<string | null>(null)
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  
  // New Ticket Form
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('medium')

  const supabase = createClient()

  // --- Cached clients list: fetched once, shared across tabs ---
  const fetcherClients = useCallback(async () => {
    const accessToken=await getVerifiedAccessToken(supabase)
    if (!accessToken) return []
    const res = await fetch('/api/clients', { headers: { 'Authorization': `Bearer ${accessToken}` } })
    if (!res.ok) return []
    const data = await res.json()
    return data.clients ?? []
  }, [supabase])
  const { data: clients = [] } = useCachedFetch('clients', fetcherClients)

  // Set first client once clients load
  useEffect(() => {
    if (clients.length > 0 && !activeClientId) {
      setActiveClientId(clients[0].id)
    }
  }, [clients])

  // --- Cached tickets ---
  const fetcherTickets = useCallback(async () => {
    if (!activeClientId) return []
    const res = await fetch(`/api/tickets?client_id=${activeClientId}`)
    if (!res.ok) return []
    return await res.json()
  }, [activeClientId])
  const { data: tickets = [], loading, refresh: refreshTickets } = useCachedFetch(`tickets:${activeClientId}`, fetcherTickets)

  async function handleCreateTicket(e: React.FormEvent) {
    e.preventDefault()
    if (!activeClientId || !subject.trim()) return

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: activeClientId,
          subject,
          description,
          priority
        })
      })
      if (res.ok) {
        setIsModalOpen(false)
        setSubject('')
        setDescription('')
        setPriority('medium')
        invalidate(`tickets:${activeClientId}`)
        refreshTickets()
      }
    } catch (err) {
      console.error(err)
    }
  }

  async function updateTicketStatus(id: string, status: string) {
    try {
      const res = await fetch('/api/tickets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status })
      })
      if (res.ok) {
        invalidate(`tickets:${activeClientId}`)
        refreshTickets()
      }
    } catch (err) {
      console.error(err)
    }
  }

  if (loading && !tickets.length) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" />
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 pb-12">
      <div className="flex items-center justify-between mb-8">
        <PageHeader title="Tickets" description="Track and resolve customer issues" />
        
        <div className="flex items-center gap-4">
          {clients.length > 1 && (
            <select
              value={activeClientId || ''}
              onChange={(e) => setActiveClientId(e.target.value)}
              className="px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-ink focus:border-accent focus:outline-none"
            >
              {clients.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}

          <div className="flex items-center bg-surface-muted rounded-lg border border-surface-border p-0.5">
            <button onClick={() => setView('kanban')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center ${view === 'kanban' ? 'bg-surface shadow-sm text-ink' : 'text-ink-muted hover:text-ink'}`}><LayoutGrid className="w-3.5 h-3.5 mr-1.5" /> Kanban</button>
            <button onClick={() => setView('table')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center ${view === 'table' ? 'bg-surface shadow-sm text-ink' : 'text-ink-muted hover:text-ink'}`}><List className="w-3.5 h-3.5 mr-1.5" /> Table</button>
          </div>
          
          <Button 
            onClick={() => setIsModalOpen(true)}
            className="bg-accent hover:bg-accent-hover text-white shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" /> New Ticket
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      {view === 'kanban' && (
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          {COLUMNS.map((col) => {
            const colTickets = tickets.filter((t: any) => t.status === col)
            return (
              <div key={col} className="min-w-[320px] w-[320px] flex flex-col flex-shrink-0 bg-surface-muted/50 rounded-2xl border border-surface-border">
                <div className="flex items-center justify-between p-4 border-b border-surface-border">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink">{COLUMN_LABELS[col]}</h3>
                    <span className="text-[10px] font-medium bg-surface-subtle text-ink-secondary rounded-full px-2 py-0.5">{colTickets.length}</span>
                  </div>
                </div>
                
                <div className="flex-1 p-3 space-y-3 overflow-y-auto">
                  {colTickets.map((t: any) => {
                    const p = PRIORITIES[t.priority] || PRIORITIES['medium']
                    return (
                      <div key={t.id} className="bg-surface border border-surface-border rounded-xl p-4 cursor-grab active:cursor-grabbing hover:border-accent/40 transition-all group shadow-sm">
                        <div className="flex items-start justify-between mb-2">
                          <p className="text-[10px] font-mono text-ink-muted">{t.id.split('-')[0]}</p>
                          {t.source === 'ai_escalation' && <span className="text-[9px] font-medium bg-status-amberBg text-status-amber border border-status-amber/20 rounded-full px-2 py-0.5">AI Escalation</span>}
                        </div>
                        <p className="text-sm font-medium text-ink mb-3 group-hover:text-accent transition-colors leading-tight">{t.subject}</p>
                        <div className="flex items-center justify-between mt-4">
                          <span className={`text-[10px] font-medium border rounded-full px-2 py-0.5 capitalize ${p.bg} ${p.color}`}>{t.priority}</span>
                          <div className="flex items-center gap-2">
                            {col !== 'closed' && (
                               <Button
                                variant="ghost" size="icon"
                                onClick={() => {
                                    const nextIdx = COLUMNS.indexOf(col) + 1;
                                    if(nextIdx < COLUMNS.length) updateTicketStatus(t.id, COLUMNS[nextIdx]);
                                }}
                                className="h-6 w-6 text-ink-muted hover:text-accent transition-colors" title="Move Forward">
                                   <ChevronsRight className="w-4 h-4" />
                               </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {colTickets.length === 0 && (
                    <div className="border-2 border-dashed border-surface-border rounded-xl p-6 text-center mt-2">
                      <p className="text-xs text-ink-muted">No tickets here</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* New Ticket Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-surface border border-surface-border rounded-2xl p-6 w-[480px] shadow-2xl relative">
            <button onClick={() => setIsModalOpen(false)} className="absolute top-4 right-4 text-ink-muted hover:text-ink transition-colors">
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-ink mb-6">Create New Ticket</h2>
            
            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-ink-secondary mb-1">Subject</label>
                <Input 
                  autoFocus
                  required
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                  placeholder="E.g., Order not delivered" 
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-ink-secondary mb-1">Description (Optional)</label>
                <Textarea 
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="resize-none h-24" 
                  placeholder="Provide additional details..." 
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink-secondary mb-1">Priority</label>
                <select 
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-surface-border rounded-md text-sm text-ink focus:border-accent focus:outline-none transition-colors"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>
              
              <div className="pt-4 flex justify-end gap-3">
                <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>Cancel</Button>
                <Button type="submit" className="bg-accent hover:bg-accent-hover text-white">Create Ticket</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
