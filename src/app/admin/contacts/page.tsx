'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import {getVerifiedAccessToken} from '@/lib/client/verifiedAuth'
import { useCachedFetch, useInvalidate } from '@/lib/cache'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, Download, Upload, Plus, X } from 'lucide-react'

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function ContactsPage() {
  const supabase = createClient()
  const [activeClientId, setActiveClientId] = useState<string | null>(null)
  
  const [search, setSearch] = useState('')
  const { invalidate } = useInvalidate()

  // Selected contact for detail slide-over
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [contactDetail, setContactDetail] = useState<any>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  useEffect(() => {
    if (selectedContactId) fetchContactDetail(selectedContactId)
  }, [selectedContactId])

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
    if (clients.length > 0 && !activeClientId) setActiveClientId(clients[0].id)
  }, [clients])

  // --- Cached contacts ---
  const fetcherContacts = useCallback(async () => {
    if (!activeClientId) return []
    const q = new URLSearchParams()
    q.set('client_id', activeClientId)
    if (search.trim()) q.set('search', search.trim())
    const res = await fetch(`/api/contacts?${q.toString()}`)
    if (!res.ok) return []
    return await res.json()
  }, [activeClientId, search])
  
  const { data: contacts = [], loading } = useCachedFetch(`contacts:${activeClientId}:${search}`, fetcherContacts)

  // Delay added for fetching contact details
  async function fetchContactDetail(id: string) {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/contacts/${id}`)
      if (res.ok) {
        const data = await res.json()
        setContactDetail(data)
      }
    } catch (err) {
      console.error(err)
    }
    setLoadingDetail(false)
  }

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 pb-12 relative">
      <div className="flex items-center justify-between mb-8">
        <PageHeader title="Contacts" description="Everyone who has talked to your tenant bots" />
        <div className="flex items-center gap-4">
          {clients.length > 1 && (
            <select
              value={activeClientId || ''}
              onChange={(e) => setActiveClientId(e.target.value)}
              className="px-3 py-2 bg-surface border border-surface-border rounded-lg text-sm text-ink focus:border-accent focus:outline-none"
            >
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <Button variant="outline" className="bg-surface text-ink hover:bg-surface-muted"><Upload className="w-4 h-4 mr-2" /> Import CSV</Button>
          <Button variant="outline" className="bg-surface text-ink hover:bg-surface-muted"><Download className="w-4 h-4 mr-2" /> Export CSV</Button>
          <Button className="bg-accent hover:bg-accent-hover text-white"><Plus className="w-4 h-4 mr-2" /> New Segment</Button>
        </div>
      </div>

      <div className="bg-surface border border-surface-border rounded-xl shadow-sm flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-surface-border flex items-center justify-between bg-surface-muted/50">
          <div className="relative w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <Input 
              placeholder="Search by name, email, phone..." 
              className="pl-9 bg-surface"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="bg-surface sticky top-0 z-10 shadow-sm">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[250px]">Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Last Active</TableHead>
                <TableHead className="text-center">Conversations</TableHead>
                <TableHead>Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center text-ink-muted">
                    <div className="w-5 h-5 rounded-full border-2 border-accent border-t-transparent animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : contacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-48 text-center text-ink-muted">No contacts found</TableCell>
                </TableRow>
              ) : (
                contacts.map((c: any) => (
                  <TableRow key={c.id} onClick={() => setSelectedContactId(c.id)} className="cursor-pointer group hover:bg-surface-muted">
                    <TableCell className="font-medium text-ink">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xs font-semibold uppercase">{c.name.charAt(0)}</div>
                        <span className="text-sm font-medium text-ink group-hover:text-accent transition-colors">{c.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-ink-secondary">{c.email || '-'}</TableCell>
                    <TableCell className="text-ink-secondary font-mono text-xs">{c.phone || '-'}</TableCell>
                    <TableCell className="capitalize text-ink-secondary">{c.primary_channel}</TableCell>
                    <TableCell className="text-ink-muted">{formatTime(c.last_active_at)}</TableCell>
                    <TableCell className="text-center font-medium text-ink">{c.conversations || 0}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(c.tags || []).map((t: string) => (
                          <span key={t} className="text-[10px] font-medium bg-accent/10 text-accent border border-accent/20 rounded-full px-2 py-0.5">{t}</span>
                        ))}
                        {(!c.tags || c.tags.length === 0) && <span className="text-[10px] text-ink-muted">-</span>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Slide-over Profile */}
      {selectedContactId && (
        <>
          <div className="fixed inset-0 bg-ink/20 backdrop-blur-sm z-40 transition-opacity" onClick={() => setSelectedContactId(null)} />
          <div className="fixed top-0 right-0 h-full w-[400px] bg-surface border-l border-surface-border shadow-2xl z-50 transform transition-transform overflow-y-auto">
            <div className="p-6">
              <button onClick={() => setSelectedContactId(null)} className="absolute top-6 right-6 text-ink-muted hover:text-ink transition-colors">
                <X className="w-5 h-5" />
              </button>
              
              {loadingDetail || !contactDetail ? (
                <div className="flex justify-center py-20"><div className="w-6 h-6 rounded-full border-2 border-accent border-t-transparent animate-spin" /></div>
              ) : (
                <>
                  <div className="flex items-center gap-4 mb-8">
                    <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center text-accent text-xl font-bold uppercase">{contactDetail.name.charAt(0)}</div>
                    <div>
                      <h2 className="text-xl font-bold text-ink">{contactDetail.name}</h2>
                      <p className="text-sm text-ink-secondary capitalize">{contactDetail.primary_channel} Contact</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">Contact Details</h3>
                      <div className="bg-surface-muted rounded-xl p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-ink-secondary">Email</span>
                          <span className="text-sm text-ink">{contactDetail.email || 'N/A'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-ink-secondary">Phone</span>
                          <span className="text-sm text-ink font-mono">{contactDetail.phone || 'N/A'}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-ink-secondary">First Seen</span>
                          <span className="text-sm text-ink">{new Date(contactDetail.first_seen_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">Sessions ({contactDetail.sessions?.length || 0})</h3>
                      <div className="space-y-2">
                        {contactDetail.sessions?.map((s: any) => (
                          <div key={s.id} className="bg-surface border border-surface-border rounded-xl p-3 flex items-center justify-between shadow-sm">
                            <div>
                              <p className="text-xs font-medium text-ink">{s.session_id.substring(0,8)}</p>
                              <p className="text-[10px] text-ink-muted capitalize">{s.channel} • {s.mode}</p>
                            </div>
                            <span className="text-[10px] text-ink-secondary">{formatTime(s.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">Tickets ({contactDetail.tickets?.length || 0})</h3>
                      <div className="space-y-2">
                        {contactDetail.tickets?.map((t: any) => (
                          <div key={t.id} className="bg-surface border border-surface-border rounded-xl p-3 shadow-sm">
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs font-medium text-ink truncate">{t.subject}</p>
                              <span className="text-[9px] font-medium bg-accent/10 text-accent px-1.5 py-0.5 rounded capitalize">{t.status}</span>
                            </div>
                            <p className="text-[10px] text-ink-muted">{formatTime(t.created_at)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
