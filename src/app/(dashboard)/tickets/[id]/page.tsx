'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, Bot, Check, Clock3, Copy, ExternalLink, FileText, Mail, MessageSquare, Package, Phone, RefreshCw, Send, ShieldCheck, Star, StickyNote, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase-browser'
import { cn } from '@/lib/utils'
import { invalidateAllTicketsCache } from '@/lib/tickets-cache'

const statusOptions = ['open', 'in_progress', 'pending', 'on_hold', 'solved', 'closed']
const priorityOptions = ['low', 'normal', 'medium', 'high', 'urgent']

export default function TicketDetailPage() {
  const params = useParams(); const id = params?.id as string; const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [ticket, setTicket] = useState<any>(null)
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [composer, setComposer] = useState('')
  const [internal, setInternal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); const res = await fetch(`/api/tickets/${id}`); const body = await res.json()
    if (res.ok) setTicket(body); else toast.error(body.error || 'Ticket not found')
    setLoading(false)
  }, [id])
  useEffect(() => { load(); supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || '')) }, [load, supabase])
  useEffect(() => {
    const channel = supabase.channel(`ticket-detail:${id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'tickets', filter: `id=eq.${id}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ticket_events', filter: `ticket_id=eq.${id}` }, load).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [id, load, supabase])

  const update = async (changes: Record<string, any>) => {
    setSaving(true); const res = await fetch(`/api/tickets/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) })
    const body = await res.json(); setSaving(false)
    if (!res.ok) return toast.error(body.error || 'Update failed')
    setTicket((prev: any) => ({ ...prev, ...body })); toast.success('Ticket updated')
    invalidateAllTicketsCache()
  }
  const send = async () => {
    if (!composer.trim()) return
    setSaving(true); const res = await fetch(`/api/tickets/${id}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: composer, is_internal_note: internal }) })
    const body = await res.json(); setSaving(false)
    if (!res.ok) return toast.error(body.error || 'Could not send')
    setComposer('')
    if (!internal && body.delivery_status === 'channel_not_configured') toast.warning('Reply saved, but this channel is not configured for delivery')
    else if (!internal && body.delivery_status === 'failed') toast.warning('Reply saved, but channel delivery failed')
    else toast.success(internal ? 'Internal note added' : 'Reply sent')
    invalidateAllTicketsCache()
    load()
  }
  const copyCustomerLink = async (purpose: 'status' | 'csat') => {
    const res = await fetch(`/api/tickets/${id}/links`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ purpose }) })
    const body = await res.json()
    if (!res.ok) return toast.error(body.error || 'Could not create link')
    await navigator.clipboard.writeText(body.endpoint)
    toast.success(`${purpose === 'csat' ? 'Feedback' : 'Status'} link copied`)
  }

  if (loading && !ticket) return <div className="h-full flex items-center justify-center text-sm text-ink-muted"><RefreshCw className="w-5 h-5 animate-spin mr-2" />Loading ticket…</div>
  if (!ticket) return <div className="p-8"><Button variant="outline" onClick={() => router.push('/tickets/all')}><ArrowLeft />Back to tickets</Button></div>
  const due = ticket.resolution_due_at ? new Date(ticket.resolution_due_at) : null
  const late = due && !ticket.resolved_at && due < new Date()
  const timeline = [
    ...(ticket.messages || []).map((item: any) => ({ ...item, kind: 'message', date: item.created_at })),
    ...(ticket.notes || []).map((item: any) => ({ ...item, kind: 'note', date: item.created_at })),
    ...(ticket.events || []).map((item: any) => ({ ...item, kind: 'event', date: item.created_at })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return <div className="p-3 md:p-5 lg:p-7 max-w-[1600px] mx-auto animate-in fade-in duration-300">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div className="flex items-center gap-3"><Button variant="outline" size="icon" onClick={() => router.push('/tickets/all')}><ArrowLeft /></Button><div><div className="flex items-center gap-2"><span className="text-xs font-mono font-bold text-accent">{ticket.ticket_number || ticket.id.slice(0, 8)}</span>{ticket.verification_status === 'verified' && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10px] font-bold"><ShieldCheck className="w-3 h-3" />Verified</span>}</div><h1 className="text-xl font-bold text-ink mt-0.5">{ticket.subject}</h1></div></div>
      <div className="flex items-center gap-2"><Button variant="outline" onClick={() => navigator.clipboard.writeText(ticket.ticket_number || ticket.id).then(() => toast.success('Ticket number copied'))}><Copy />Copy ID</Button><Button variant="outline" onClick={load}><RefreshCw className={cn(saving && 'animate-spin')} />Refresh</Button></div>
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5">
      <div className="space-y-5 min-w-0">
        <div className="bg-white border border-surface-border rounded-2xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-surface-border"><div className="flex items-center justify-between gap-4"><div><p className="text-[10px] uppercase tracking-wider font-bold text-ink-muted">Customer issue</p><p className="text-sm text-ink-secondary mt-2 whitespace-pre-wrap leading-relaxed">{ticket.description || 'No description was provided.'}</p></div></div></div>
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-surface-border bg-surface-muted/20">
            <Meta label="Created" value={format(new Date(ticket.created_at), 'MMM d, yyyy · h:mm a')} />
            <Meta label="Source" value={ticket.source || 'manual'} />
            <Meta label="Type" value={(ticket.type || 'general').replace('_', ' ')} />
            <Meta label="Bot" value={ticket.bots?.name || 'No bot'} />
          </div>
        </div>

        {ticket.returns?.length > 0 && <div className="bg-white border border-surface-border rounded-2xl shadow-sm p-5"><div className="flex items-center gap-2 mb-4"><Package className="w-4 h-4 text-accent" /><h2 className="text-sm font-bold">Return request</h2></div>{ticket.returns.map((item: any) => <div key={item.id} className="grid sm:grid-cols-4 gap-3 text-xs bg-surface-muted/30 rounded-xl p-4"><Meta label="Item" value={item.support_order_items?.name || 'Order item'} /><Meta label="Reason" value={item.reason_code || 'Not specified'} /><Meta label="Requested" value={item.requested_resolution || 'Review'} /><Meta label="Status" value={item.status} /></div>)}</div>}

        <div className="bg-white border border-surface-border rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-surface-border flex items-center justify-between"><div className="flex items-center gap-2"><MessageSquare className="w-4 h-4 text-accent" /><h2 className="text-sm font-bold">Conversation & activity</h2></div><span className="text-[11px] text-ink-muted">{timeline.length} activities</span></div>
          <div className="p-5 max-h-[620px] overflow-auto space-y-4 bg-surface-muted/10">
            {!timeline.length && <p className="text-sm text-ink-muted text-center py-10">Activity will appear here as the ticket is handled.</p>}
            {timeline.map((item: any) => item.kind === 'event' ? <Event key={`e-${item.id}`} item={item} /> : <Message key={`${item.kind}-${item.id}`} item={item} />)}
          </div>
          <div className={cn('border-t p-4', internal ? 'bg-amber-50/60 border-amber-200' : 'bg-white border-surface-border')}>
            <div className="flex items-center gap-1 mb-3"><button onClick={() => setInternal(false)} className={cn('px-3 py-1.5 rounded-md text-xs font-bold', !internal ? 'bg-ink text-white' : 'text-ink-muted hover:bg-white')}>Reply</button><button onClick={() => setInternal(true)} className={cn('px-3 py-1.5 rounded-md text-xs font-bold', internal ? 'bg-amber-500 text-white' : 'text-ink-muted hover:bg-white')}>Internal note</button></div>
            <Textarea value={composer} onChange={e => setComposer(e.target.value)} placeholder={internal ? 'Add context visible only to your team…' : 'Write a customer reply…'} className="min-h-24 bg-white resize-y" />
            <div className="flex justify-between items-center mt-3"><p className="text-[11px] text-ink-muted">{internal ? 'Private: customers cannot see this note.' : `Channel: ${ticket.source || 'web'}`}</p><Button onClick={send} disabled={saving || !composer.trim()} className={cn(internal ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-ink text-white hover:bg-ink-secondary')}><Send />{internal ? 'Add note' : 'Send reply'}</Button></div>
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="bg-white border border-surface-border rounded-2xl shadow-sm p-5 space-y-4">
          <h2 className="text-sm font-bold">Ticket controls</h2>
          <Control label="Status" value={ticket.status} options={statusOptions} onChange={value => update({ status: value })} />
          <Control label="Priority" value={ticket.priority} options={priorityOptions} onChange={value => update({ priority: value })} />
          <Control label="Verification" value={ticket.verification_status || 'unverified'} options={['unverified','verified']} onChange={value => update({ verification_status: value })} />
          <div><p className="text-[10px] uppercase tracking-wider font-bold text-ink-muted mb-1.5">Assignee</p><Button variant="outline" className="w-full justify-start" onClick={() => update({ assignee_id: ticket.assignee_id ? null : userId })}><UserRound />{ticket.assignee_id ? (ticket.assignee_id === userId ? 'Assigned to you · Unassign' : 'Assigned · Take over') : 'Assign to me'}</Button></div>
          <div className="grid grid-cols-2 gap-2 pt-1"><Button variant="outline" className="text-xs" onClick={() => copyCustomerLink('status')}><Copy />Status link</Button><Button variant="outline" className="text-xs" disabled={!['resolved','solved','closed'].includes(ticket.status)} onClick={() => copyCustomerLink('csat')}><Star className="w-3.5 h-3.5" />CSAT link</Button></div>
        </div>

        <div className={cn('border rounded-2xl p-5', late ? 'bg-red-50 border-red-200' : 'bg-white border-surface-border')}>
          <div className="flex items-center gap-2"><Clock3 className={cn('w-4 h-4', late ? 'text-red-600' : 'text-accent')} /><h2 className="text-sm font-bold">Service level</h2></div>
          <p className={cn('text-lg font-bold mt-3', late ? 'text-red-700' : 'text-ink')}>{ticket.resolved_at ? 'Resolved' : due ? formatDistanceToNow(due, { addSuffix: true }) : 'Not configured'}</p>
          <p className="text-xs text-ink-muted mt-1">{due ? `Resolution target ${format(due, 'MMM d, h:mm a')}` : 'No resolution deadline'}</p>
          {late && <p className="text-xs text-red-700 mt-3 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />This ticket is past its resolution target.</p>}
        </div>

        <div className="bg-white border border-surface-border rounded-2xl shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4"><UserRound className="w-4 h-4 text-accent" /><h2 className="text-sm font-bold">Customer</h2></div>
          <p className="font-semibold text-sm text-ink">{ticket.contacts?.name || ticket.customer_name || 'Anonymous customer'}</p>
          {(ticket.contacts?.email || ticket.customer_email) && <a className="flex items-center gap-2 text-xs text-ink-secondary mt-3 hover:text-accent" href={`mailto:${ticket.contacts?.email || ticket.customer_email}`}><Mail className="w-3.5 h-3.5" />{ticket.contacts?.email || ticket.customer_email}</a>}
          {ticket.contacts?.phone && <a className="flex items-center gap-2 text-xs text-ink-secondary mt-2 hover:text-accent" href={`tel:${ticket.contacts.phone}`}><Phone className="w-3.5 h-3.5" />{ticket.contacts.phone}</a>}
          {ticket.contacts?.id && <Link href={`/contacts/${ticket.contacts.id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent mt-4">View contact <ExternalLink className="w-3 h-3" /></Link>}
        </div>

        {(ticket.order_number || ticket.support_orders) && <div className="bg-white border border-surface-border rounded-2xl shadow-sm p-5"><div className="flex items-center gap-2 mb-4"><Package className="w-4 h-4 text-accent" /><h2 className="text-sm font-bold">Order context</h2></div><Meta label="Order" value={ticket.order_number || ticket.support_orders?.order_number} /><div className="grid grid-cols-2 gap-3 mt-4"><Meta label="Status" value={ticket.support_orders?.status || 'Not synced'} /><Meta label="Total" value={ticket.support_orders?.total_amount ? `${ticket.support_orders.currency} ${ticket.support_orders.total_amount}` : '—'} /></div></div>}

        {ticket.attachments?.length > 0 && <div className="bg-white border border-surface-border rounded-2xl shadow-sm p-5"><div className="flex items-center gap-2 mb-3"><FileText className="w-4 h-4 text-accent" /><h2 className="text-sm font-bold">Damage evidence</h2></div><div className="grid grid-cols-2 gap-3">{ticket.attachments.map((file: any) => <a key={file.id} href={file.signed_url || '#'} target="_blank" rel="noreferrer" className="group rounded-xl border border-surface-border overflow-hidden bg-surface-muted/30"><div className="aspect-square bg-surface-muted flex items-center justify-center">{file.signed_url && file.mime_type?.startsWith('image/') ? <img src={file.signed_url} alt="Customer damage evidence" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform" /> : <FileText className="w-6 h-6 text-ink-muted" />}</div><div className="p-2"><p className="text-[11px] font-semibold truncate">{file.file_name}</p><p className="text-[9px] text-ink-muted capitalize mt-0.5">{file.scan_status}</p></div></a>)}</div></div>}
      </aside>
    </div>
  </div>
}

function Meta({ label, value }: { label: string; value: any }) { return <div className="p-3 min-w-0"><p className="text-[9px] uppercase tracking-wider font-bold text-ink-muted">{label}</p><p className="text-xs font-semibold text-ink mt-1 capitalize truncate">{value || '—'}</p></div> }
function Control({ label, value, options, onChange }: any) { return <div><p className="text-[10px] uppercase tracking-wider font-bold text-ink-muted mb-1.5">{label}</p><select value={value || ''} onChange={e => onChange(e.target.value)} className="w-full h-10 px-3 border border-surface-border bg-white rounded-md text-sm capitalize outline-none focus:border-accent">{options.map((item: string) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}</select></div> }
function Event({ item }: any) { const label = String(item.event_type || 'updated').replaceAll('_', ' '); return <div className="flex items-center gap-3"><div className="w-7 h-7 rounded-full bg-surface border border-surface-border flex items-center justify-center"><Check className="w-3 h-3 text-ink-muted" /></div><p className="text-xs text-ink-secondary"><span className="font-semibold capitalize">{label}</span> <span className="text-ink-muted">· {formatDistanceToNow(new Date(item.date), { addSuffix: true })}</span></p></div> }
function Message({ item }: any) { const note = item.kind === 'note'; return <div className={cn('max-w-[82%] rounded-xl p-3 border', note ? 'bg-amber-50 border-amber-200' : item.sender_type === 'customer' ? 'bg-white border-surface-border' : 'bg-accent/5 border-accent/20 ml-auto')}><div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-1.5 text-ink-muted">{note ? <StickyNote className="w-3 h-3" /> : item.sender_type === 'customer' ? <UserRound className="w-3 h-3" /> : <Bot className="w-3 h-3" />}{note ? 'Internal note' : item.sender_type || 'Agent'}</div><p className="text-sm whitespace-pre-wrap text-ink leading-relaxed">{item.body || item.content}</p><p className="text-[10px] text-ink-muted mt-2">{format(new Date(item.date), 'MMM d, h:mm a')}</p></div> }
