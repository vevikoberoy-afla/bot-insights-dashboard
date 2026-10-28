'use client'
import { activeWorkspaceId } from '@/lib/client/workspace'

import { useState, useEffect, useMemo, useRef } from 'react'
import Papa from 'papaparse'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Users, Search, Download, Upload, Plus, MoreVertical, LayoutGrid, List, MessageSquare, Tag, Layers, ChevronDown, Sparkles
} from 'lucide-react'
import { FaLinkedin, FaFacebook, FaInstagram, FaTelegram, FaTiktok, FaXTwitter, FaGithub } from 'react-icons/fa6'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from 'sonner'

export default function ContactsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [segments, setSegments] = useState<any[]>([])
  const [segmentFilter, setSegmentFilter] = useState('all')
  const [segmentAction, setSegmentAction] = useState<{ contactIds: string[]; mode: 'add'|'move' } | null>(null)
  const [targetSegmentId, setTargetSegmentId] = useState('')
  const [segmentBusy, setSegmentBusy] = useState(false)

  // Filters
  const [search, setSearch] = useState('')
  const [channelFilter, setChannelFilter] = useState('All')
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 50

  useEffect(() => {
    let active = true
    const controller=new AbortController()
    let channel: ReturnType<typeof supabase.channel> | null = null
    async function load() {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error || !user) return

        const [res, segmentRes] = await Promise.all([fetch('/api/contacts',{signal:controller.signal}),fetch('/api/segments',{signal:controller.signal})])
        if (res.ok) {
          const result = await res.json()
          if (active) {
            setContacts(Array.isArray(result) ? result : (result.data || []))
            setLoadError('')
          }
        } else {
          const result = await res.json().catch(() => ({}))
          setLoadError(result.error || 'Contacts could not be loaded.')
        }
        if (segmentRes.ok) {
          const segmentRows = await segmentRes.json()
          if (active) setSegments(Array.isArray(segmentRows) ? segmentRows : [])
        }
      } catch (e:any) {
        if(e.name!=='AbortError')setLoadError('Contacts could not be loaded.')
      } finally {
        if (active) setLoading(false)
      }
    }
    async function start() {
      await load()
      const { data: { user }, error } = await supabase.auth.getUser()
      if (!active || error || !user) return
      channel = supabase.channel(`contacts-dashboard:${activeWorkspaceId(user.id || '')}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'contacts', filter: `client_id=eq.${activeWorkspaceId(user.id || '')}` }, () => { load() })
        .subscribe()
    }
    start()
    const onFocus = () => { load() }
    window.addEventListener('focus', onFocus)
    return () => {
      active = false
      controller.abort()
      window.removeEventListener('focus', onFocus)
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  const filtered = useMemo(()=>contacts.filter(c => {
    if (search) {
      const s = search.toLowerCase()
      const profileText = [c.custom_fields?.company, c.custom_fields?.address, c.custom_fields?.city, c.custom_fields?.postal_code, c.custom_fields?.country].filter(Boolean).join(' ').toLowerCase()
      if (!c.name?.toLowerCase().includes(s) && !c.email?.toLowerCase().includes(s) && !c.phone?.includes(s) && !profileText.includes(s)) {
        return false
      }
    }
    if (channelFilter !== 'All' && c.source_channel !== channelFilter.toLowerCase()) {
      return false
    }
    if (segmentFilter !== 'all' && !c.segment_details?.some((segment:any) => segment.id === segmentFilter)) return false
    return true
  }),[contacts,search,channelFilter,segmentFilter])
  const totalPages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE))
  const visibleContacts=useMemo(()=>filtered.slice((Math.min(page,totalPages)-1)*PAGE_SIZE,Math.min(page,totalPages)*PAGE_SIZE),[filtered,page,totalPages])
  useEffect(()=>setPage(1),[search,channelFilter,segmentFilter])

  const assignSegment = async () => {
    if (!segmentAction || !targetSegmentId) return
    setSegmentBusy(true)
    try {
      const res = await fetch('/api/segments/members',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contact_ids:segmentAction.contactIds,segment_id:targetSegmentId,mode:segmentAction.mode})})
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || 'Segment could not be updated')
      const contactsRes = await fetch('/api/contacts')
      if (contactsRes.ok) setContacts(await contactsRes.json())
      setSelectedIds(new Set())
      setSegmentAction(null)
      setTargetSegmentId('')
      toast.success(`${result.updated} contact${result.updated === 1 ? '' : 's'} ${segmentAction.mode === 'move' ? 'moved' : 'added'} to ${result.segment}`)
    } catch (error:any) {
      toast.error(error.message)
    } finally { setSegmentBusy(false) }
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(c => c.id)))
    }
  }

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const formatRelDate = (isoString: string | null) => {
    if (!isoString) return 'Never'
    const ms = Date.now() - new Date(isoString).getTime()
    const days = Math.floor(ms / (1000 * 60 * 60 * 24))
    if (days === 0) {
      const hours = Math.floor(ms / (1000 * 60 * 60))
      return hours > 0 ? `${hours} hours ago` : 'Just now'
    }
    if (days === 1) return 'Yesterday'
    if (days < 30) return `${days} days ago`
    return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)

  // Add Contact Form State (Added phoneCode to state)
  const [addForm, setAddForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phoneCode: '+91',
    phone: '',
    city: '',
    country: '',
    bio: '',
    company: '',
    linkedin: '',
    facebook: '',
    instagram: '',
    telegram: '',
    tiktok: '',
    twitter: '',
    github: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleExportCSV = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (filtered.length === 0) {
      alert("No contacts to export.")
      return
    }
    const headers = ['Name', 'Email', 'Phone', 'Channel', 'Tags', 'Segments', 'Conversations']
    const rows = filtered.map(c => [
      c.name || 'Anonymous',
      c.email || '',
      c.phone || '',
      c.source_channel || '',
      (c.tags || []).join(', '),
      (c.segments || []).join(', '),
      c.conversation_count || 0
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `contacts_export_${new Date().getTime()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const handleBulkExport = () => {
    if (selectedIds.size === 0) return
    const exportData = contacts.filter(c => selectedIds.has(c.id))
    
    const headers = ['Name', 'Email', 'Phone', 'Channel', 'Tags', 'Segments', 'Conversations']
    const rows = exportData.map(c => [
      c.name || 'Anonymous',
      c.email || '',
      c.phone || '',
      c.source_channel || '',
      (c.tags || []).join(', '),
      (c.segments || []).join(', '),
      c.conversation_count || 0
    ])
    
    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `bulk_contacts_export_${new Date().getTime()}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const startSelectedCampaign = (channel: 'email'|'whatsapp') => {
    sessionStorage.setItem('campaign-selected-contacts', JSON.stringify(Array.from(selectedIds)))
    router.push(`/campaigns/${channel}?compose=1`)
  }

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Are you sure you want to delete ${selectedIds.size} contacts?`)) return

    try {
      for (const id of Array.from(selectedIds)) {
        await fetch(`/api/contacts/${id}`, { method: 'DELETE' })
      }
      setContacts(contacts.filter(c => !selectedIds.has(c.id)))
      setSelectedIds(new Set())
    } catch (e) {
      console.error(e)
      alert("Failed to delete contacts.")
    }
  }

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const { data: { user }, error: authError } = await supabase.auth.getUser()
          if (authError || !user) return

          const newContacts: any[] = []
          for (const row of results.data as any[]) {
            const res = await fetch('/api/contacts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                client_id: activeWorkspaceId(user.id || ''),
                name: row.Name || row.name || 'Imported Contact',
                email: row.Email || row.email || null,
                phone: row.Phone || row.phone || null,
                source_channel: 'web'
              })
            })
            if (res.ok) {
              newContacts.push(await res.json())
            }
          }

          setContacts(prev => [...newContacts, ...prev])
          setIsImportModalOpen(false)
        } catch (err) {
          console.error(err)
          alert("Import failed")
        } finally {
          setImporting(false)
          if (fileInputRef.current) fileInputRef.current.value = ''
        }
      }
    })
  }

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) return

      const name = `${addForm.firstName} ${addForm.lastName}`.trim()

      // Combine phone code and number before sending to the backend
      const fullPhoneNumber = addForm.phone ? `${addForm.phoneCode}${addForm.phone}` : ''

      const custom_fields = {
        city: addForm.city,
        country: addForm.country,
        bio: addForm.bio,
        company: addForm.company,
        socials: {
          linkedin: addForm.linkedin,
          facebook: addForm.facebook,
          instagram: addForm.instagram,
          telegram: addForm.telegram,
          tiktok: addForm.tiktok,
          twitter: addForm.twitter,
          github: addForm.github
        }
      }

      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: activeWorkspaceId(user.id || ''),
          name,
          email: addForm.email,
          phone: fullPhoneNumber,
          source_channel: 'web',
          custom_fields
        })
      })

      if (!res.ok) {
        const errObj = await res.json()
        alert(`Failed to save contact. Error from Supabase: ${JSON.stringify(errObj)}`)
        throw new Error(errObj.error)
      }

      if (res.ok) {
        const newContact = await res.json()
        setContacts([newContact, ...contacts])
        setIsAddModalOpen(false)

        // Reset state, preserving the default phone code
        setAddForm({
          firstName: '', lastName: '', email: '', phoneCode: '+91', phone: '', city: '', country: '', bio: '', company: '',
          linkedin: '', facebook: '', instagram: '', telegram: '', tiktok: '', twitter: '', github: ''
        })
      }
    } catch (e) {
      console.error(e)
    } finally {
      setIsSubmitting(false)
    }
  }

  const getChannelIcon = (c: string) => {
    switch (c) {
      case 'web': return '💬'
      case 'whatsapp': return '📱'
      case 'email': return '📧'
      case 'sms': return '💬'
      case 'instagram': return '📸'
      default: return '💬'
    }
  }

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 max-w-[1400px] mx-auto pb-24 relative">
      <div className="flex items-start justify-between mb-8">
        <PageHeader
          title="Contacts"
          description="Unified customer profiles across conversations, orders, bookings and support."
        />
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setIsImportModalOpen(true)} className="h-9 text-[13px] text-ink-secondary hover:text-ink border-surface-border">
            <Upload className="w-4 h-4 mr-2" /> Import CSV
          </Button>
          <Button variant="outline" onClick={handleExportCSV} className="h-9 text-[13px] text-ink-secondary hover:text-ink border-surface-border">
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)} className="h-9 text-[13px] bg-ink hover:bg-ink-secondary text-white shadow-sm">
            <Plus className="w-4 h-4 mr-2" /> Add Contact
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex items-center justify-between mb-6 bg-surface border border-surface-border p-2 rounded-xl shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="pl-3 pr-2">
            <input
              type="checkbox"
              className="rounded border-surface-border text-accent focus:ring-accent w-4 h-4"
              checked={filtered.length > 0 && selectedIds.size === filtered.length}
              onChange={toggleSelectAll}
            />
          </div>
          <div className="relative w-[280px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <Input
              placeholder="Search by name, email, or phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9 border-none bg-surface-subtle focus-visible:ring-0 focus-visible:bg-white text-[13px]"
            />
          </div>
          <div className="h-5 w-px bg-surface-border mx-1" />

          <select
            value={channelFilter}
            onChange={e => setChannelFilter(e.target.value)}
            className="h-9 bg-transparent border-none text-[13px] font-medium text-ink-secondary focus:ring-0 cursor-pointer hover:text-ink"
          >
            {['All', 'Web', 'WhatsApp', 'Email', 'SMS', 'Instagram'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <div className="flex items-center gap-1.5 px-2">
            <Layers className="w-3.5 h-3.5 text-ink-muted" />
            <select value={segmentFilter} onChange={event=>setSegmentFilter(event.target.value)} className="h-9 max-w-[190px] bg-transparent border-none text-[13px] font-medium text-ink-secondary focus:ring-0 cursor-pointer">
              <option value="all">All segments</option>
              {segments.map(segment=><option key={segment.id} value={segment.id}>{segment.name} ({segment.contact_count || 0})</option>)}
            </select>
          </div>
          <Button variant="ghost" className="h-9 text-[13px] text-ink-secondary font-medium hover:text-ink px-3">
            <Tag className="w-3.5 h-3.5 mr-2 text-ink-muted" />
            All Tags
          </Button>
        </div>

        <div className="flex items-center gap-4 pr-3">
          <span className="text-[12px] font-medium text-ink-muted">{filtered.length} contacts</span>
          <div className="flex bg-surface-subtle rounded-md p-0.5 border border-surface-border">
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-sm transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-ink' : 'text-ink-muted hover:text-ink'}`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('card')}
              className={`p-1.5 rounded-sm transition-all ${viewMode === 'card' ? 'bg-white shadow-sm text-ink' : 'text-ink-muted hover:text-ink'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="w-5 h-5 rounded-full border-2 border-ink border-t-transparent animate-spin" /></div>
      ) : loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{loadError}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-muted flex items-center justify-center mb-6">
            <Users className="w-8 h-8 text-ink-muted" />
          </div>
          <h3 className="text-lg font-medium text-ink">No contacts found</h3>
          <p className="text-sm text-ink-secondary mt-2 mb-6 max-w-sm">
            {search || channelFilter !== 'All' ? 'Try adjusting your search or clearing the filters.' : 'Contacts are automatically created when someone messages your bots.'}
          </p>
          {(search || channelFilter !== 'All') && (
            <Button onClick={() => { setSearch(''); setChannelFilter('All'); }} variant="outline">Clear All Filters</Button>
          )}
        </div>
      ) : viewMode === 'table' ? (
        <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-muted/50 border-b border-surface-border text-[11px] font-bold text-ink-muted uppercase tracking-wider">
                <th className="px-5 py-3 w-10"></th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3 text-center">Channel</th>
                <th className="px-5 py-3">Segments</th>
                <th className="px-5 py-3">Tags</th>
                <th className="px-5 py-3 text-right">Conversations</th>
                <th className="px-5 py-3">Last Active</th>
                <th className="px-5 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {visibleContacts.map(c => (
                <tr key={c.id} className="group border-b border-surface-border last:border-0 hover:bg-surface-subtle transition-colors cursor-pointer" onClick={() => router.push(`/contacts/${c.id}`)}>
                  <td className="px-5 py-4" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="rounded border-surface-border text-accent focus:ring-accent w-4 h-4"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                    />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-accent text-white flex items-center justify-center font-bold text-sm shrink-0">
                        {c.name ? c.name.substring(0, 2).toUpperCase() : '??'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-ink truncate">{c.name || <span className="italic text-ink-muted">Anonymous</span>}</p>
                        <p className="text-[12px] text-ink-secondary truncate">{c.email || c.phone || 'No contact info'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-center" title={`Contacted via ${c.source_channel}`}>
                    <span className="text-lg">{getChannelIcon(c.source_channel)}</span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {c.segment_details?.map((s: any) => (
                        <span key={s.id} style={{backgroundColor:`${s.color || '#2563EB'}12`,color:s.color || '#2563EB'}} className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider inline-flex items-center gap-1">{s.is_system && <Sparkles className="h-2.5 w-2.5" />}{s.name}</span>
                      ))}
                      {!c.segments?.length && <span className="text-ink-muted text-[12px]">—</span>}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {c.tags?.map((t: string) => (
                        <span key={t} className="px-2 py-0.5 rounded bg-surface-muted text-ink-secondary text-[11px] font-medium">#{t}</span>
                      ))}
                      {!c.tags?.length && <span className="text-ink-muted text-[12px]">—</span>}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span className="text-[13px] font-semibold text-ink">{c.conversation_count}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-[12px] font-medium ${c.last_active_at ? 'text-green-700' : 'text-red-600'}`}>
                      {formatRelDate(c.last_active_at)}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <button title="Move to segment" className="w-7 h-7 flex items-center justify-center rounded hover:bg-surface-border opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => {e.stopPropagation();setSegmentAction({contactIds:[c.id],mode:'move'})}}>
                      <MoreVertical className="w-4 h-4 text-ink-muted" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {visibleContacts.map(c => (
            <div key={c.id} className="group bg-white border border-surface-border rounded-xl p-5 hover:border-ink/20 hover:shadow-sm transition-all cursor-pointer relative" onClick={() => router.push(`/contacts/${c.id}`)}>
              <div 
                className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2"
                onClick={e => e.stopPropagation()}
              >
                <input
                  type="checkbox"
                  className="rounded border-surface-border text-accent focus:ring-accent w-4 h-4"
                  checked={selectedIds.has(c.id)}
                  onChange={e => toggleSelect(c.id)}
                />
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-accent text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {c.name ? c.name.substring(0, 2).toUpperCase() : '??'}
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold text-ink">{c.name || <span className="italic text-ink-muted">Anonymous</span>}</h3>
                  <p className="text-[12px] text-ink-secondary">{c.email || c.phone}</p>
                  {(c.custom_fields?.company || c.custom_fields?.city) && <p className="mt-0.5 text-[11px] text-ink-muted">{[c.custom_fields?.company, c.custom_fields?.city].filter(Boolean).join(' · ')}</p>}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-[14px]" title={`Via ${c.source_channel}`}>{getChannelIcon(c.source_channel)}</span>
                {c.segment_details?.map((s: any) => (
                  <span key={s.id} style={{backgroundColor:`${s.color || '#2563EB'}12`,color:s.color || '#2563EB'}} className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider inline-flex items-center gap-1">{s.is_system && <Sparkles className="h-2.5 w-2.5" />}{s.name}</span>
                ))}
              </div>

              {c.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {c.tags.map((t: string) => (
                    <span key={t} className="px-2 py-0.5 rounded bg-surface-muted text-ink-secondary text-[10px] font-medium">#{t}</span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 text-[11px] text-ink-muted pt-3 border-t border-surface-border mt-auto">
                <span className="flex items-center font-medium"><MessageSquare className="w-3 h-3 mr-1" /> {c.conversation_count}</span>
                <span>•</span>
                <span>{formatRelDate(c.last_active_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length>PAGE_SIZE&&<div className="mt-5 flex items-center justify-between rounded-xl border border-surface-border bg-white px-4 py-3"><span className="text-[12px] text-ink-muted">Showing {(Math.min(page,totalPages)-1)*PAGE_SIZE+1}–{Math.min(Math.min(page,totalPages)*PAGE_SIZE,filtered.length)} of {filtered.length}</span><div className="flex items-center gap-2"><Button variant="outline" disabled={page<=1} onClick={()=>setPage(value=>Math.max(1,value-1))} className="h-8 text-xs">Previous</Button><span className="px-2 text-xs font-medium">{Math.min(page,totalPages)} / {totalPages}</span><Button variant="outline" disabled={page>=totalPages} onClick={()=>setPage(value=>Math.min(totalPages,value+1))} className="h-8 text-xs">Next</Button></div></div>}

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#111] text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-10">
          <span className="text-[14px] font-medium">{selectedIds.size} contacts selected</span>
          <div className="w-px h-5 bg-white/20" />
          <div className="flex items-center gap-2">
            <button onClick={() => startSelectedCampaign('email')} className="text-[13px] font-medium hover:bg-white/10 px-3 py-1.5 rounded transition-colors">Email campaign</button>
            <button onClick={() => startSelectedCampaign('whatsapp')} className="text-[13px] font-medium hover:bg-white/10 px-3 py-1.5 rounded transition-colors">WhatsApp campaign</button>
            <button onClick={() => setSegmentAction({contactIds:Array.from(selectedIds),mode:'add'})} className="text-[13px] font-medium hover:bg-white/10 px-3 py-1.5 rounded transition-colors">Add to Segment</button>
            <button onClick={() => setSegmentAction({contactIds:Array.from(selectedIds),mode:'move'})} className="text-[13px] font-medium hover:bg-white/10 px-3 py-1.5 rounded transition-colors">Move Segment</button>
            <button onClick={() => alert("Bulk Tag assignment coming soon!")} className="text-[13px] font-medium hover:bg-white/10 px-3 py-1.5 rounded transition-colors">Add Tag</button>
            <button onClick={handleBulkExport} className="text-[13px] font-medium hover:bg-white/10 px-3 py-1.5 rounded transition-colors">Export</button>
            <button onClick={handleDeleteSelected} className="text-[13px] font-medium text-red-400 hover:bg-red-500/20 px-3 py-1.5 rounded transition-colors">Delete</button>
          </div>
          <button onClick={() => setSelectedIds(new Set())} className="ml-2 p-1 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white">
            <Plus className="w-5 h-5 rotate-45" />
          </button>
        </div>
      )}

      <Dialog open={!!segmentAction} onOpenChange={open=>{if(!open){setSegmentAction(null);setTargetSegmentId('')}}}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{segmentAction?.mode === 'move' ? 'Move to a segment' : 'Add to a segment'}</DialogTitle>
            <DialogDescription>
              {segmentAction?.mode === 'move' ? 'This replaces manual segment assignments. Automatic behavior segments remain unchanged.' : 'Add a manual segment without changing existing assignments.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3">
            <label className="text-xs font-semibold text-ink-secondary">Manual segment</label>
            <select value={targetSegmentId} onChange={event=>setTargetSegmentId(event.target.value)} className="h-11 w-full rounded-xl border border-surface-border bg-white px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-accent/20">
              <option value="">Choose a segment</option>
              {segments.filter(segment=>!segment.is_system && segment.segment_type !== 'automatic').map(segment=><option key={segment.id} value={segment.id}>{segment.name}</option>)}
            </select>
            {!segments.some(segment=>!segment.is_system && segment.segment_type !== 'automatic') && <p className="text-xs text-ink-muted">Create a manual segment from Contacts → Segments first.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={()=>setSegmentAction(null)}>Cancel</Button>
            <Button disabled={!targetSegmentId || segmentBusy} onClick={assignSegment} className="bg-ink text-white">{segmentBusy ? 'Updating…' : `${segmentAction?.mode === 'move' ? 'Move' : 'Add'} ${segmentAction?.contactIds.length || 0} contact${segmentAction?.contactIds.length === 1 ? '' : 's'}`}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Contact Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-3xl p-8">
          <DialogTitle className="text-xl font-semibold mb-2 text-ink">Edit contact details</DialogTitle>
          <form onSubmit={handleAddContact} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <Input required value={addForm.firstName} onChange={e => setAddForm({ ...addForm, firstName: e.target.value })} placeholder="Enter the first name" className="bg-surface-subtle border-none h-11 rounded-full text-ink placeholder:text-gray-400 px-5" />
              <Input required value={addForm.lastName} onChange={e => setAddForm({ ...addForm, lastName: e.target.value })} placeholder="Enter the last name" className="bg-surface-subtle border-none h-11 rounded-full text-ink placeholder:text-gray-400 px-5" />
              <Input type="email" value={addForm.email} onChange={e => setAddForm({ ...addForm, email: e.target.value })} placeholder="Enter the email address" className="bg-surface-subtle border-none h-11 rounded-full text-ink placeholder:text-gray-400 px-5" />

              {/* Updated Phone Field with Country Selection */}
              <div className="flex bg-surface-subtle rounded-full h-11 items-center pl-2 pr-4 relative focus-within:ring-2 focus-within:ring-blue-500/50">
                <div className="flex items-center relative border-r border-gray-300 pr-2 mr-2">
                  <select
                    value={addForm.phoneCode}
                    onChange={e => setAddForm({ ...addForm, phoneCode: e.target.value })}
                    className="appearance-none bg-transparent border-none text-base cursor-pointer focus:outline-none pl-2 pr-6 z-10 text-ink-muted"
                  >
                    <option value="+91">🇮🇳 +91</option>
                    <option value="+1">🇺🇸 +1</option>
                    <option value="+44">🇬🇧 +44</option>
                    <option value="+61">🇦🇺 +61</option>
                    <option value="+81">🇯🇵 +81</option>
                    <option value="+49">🇩🇪 +49</option>
                    <option value="+33">🇫🇷 +33</option>
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-ink-muted absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none z-0" />
                </div>
                <input
                  type="tel"
                  value={addForm.phone}
                  onChange={e => setAddForm({ ...addForm, phone: e.target.value })}
                  placeholder="Enter the phone number"
                  className="bg-transparent border-none flex-1 focus:outline-none text-sm text-ink placeholder:text-gray-400"
                />
              </div>

              <Input value={addForm.city} onChange={e => setAddForm({ ...addForm, city: e.target.value })} placeholder="Enter the city name" className="bg-surface-subtle border-none h-11 rounded-full text-ink placeholder:text-gray-400 px-5" />
              <select
                value={addForm.country}
                onChange={e => setAddForm({ ...addForm, country: e.target.value })}
                className="bg-surface-subtle border-none h-11 rounded-full px-5 text-sm focus:outline-none appearance-none text-ink"
                style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'%3E%3C/polyline%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1.25rem top 50%', backgroundSize: '1rem auto' }}
              >
                <option value="" className="text-gray-400">Select country</option>
                <option value="IN">India</option>
                <option value="US">United States</option>
                <option value="GB">United Kingdom</option>
              </select>
              <Input value={addForm.bio} onChange={e => setAddForm({ ...addForm, bio: e.target.value })} placeholder="Enter the bio" className="bg-surface-subtle border-none h-11 rounded-full text-ink placeholder:text-gray-400 px-5" />
              <Input value={addForm.company} onChange={e => setAddForm({ ...addForm, company: e.target.value })} placeholder="Enter the company name" className="bg-surface-subtle border-none h-11 rounded-full text-ink placeholder:text-gray-400 px-5" />
            </div>

            <div className="pt-2">
              <h3 className="text-lg font-semibold mb-4 text-ink">Edit social links</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'linkedin', label: 'Add LinkedIn', icon: <FaLinkedin className="w-4 h-4 text-gray-500" /> },
                  { id: 'facebook', label: 'Add Facebook', icon: <FaFacebook className="w-4 h-4 text-gray-500" /> },
                  { id: 'instagram', label: 'Add Instagram', icon: <FaInstagram className="w-4 h-4 text-gray-500" /> },
                  { id: 'telegram', label: 'Add Telegram', icon: <FaTelegram className="w-4 h-4 text-gray-500" /> },
                  { id: 'tiktok', label: 'Add TikTok', icon: <FaTiktok className="w-4 h-4 text-gray-500" /> },
                  { id: 'twitter', label: 'Add Twitter', icon: <FaXTwitter className="w-4 h-4 text-gray-500" /> },
                  { id: 'github', label: 'Add Github', icon: <FaGithub className="w-4 h-4 text-gray-500" /> }
                ].map(social => (
                  <div key={social.id} className="flex bg-surface-subtle rounded-full h-11 items-center px-4">
                    <span className="flex items-center justify-center mr-2">{social.icon}</span>
                    <input
                      value={(addForm as any)[social.id]}
                      onChange={e => setAddForm({ ...addForm, [social.id]: e.target.value })}
                      placeholder={social.label}
                      className="bg-transparent border-none flex-1 focus:outline-none text-sm text-ink placeholder:text-gray-400"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 mt-4">
              <button type="button" onClick={() => setIsAddModalOpen(false)} className="text-blue-600 underline font-medium text-sm hover:text-blue-700">Cancel</button>

              {/* Updated Save Button to solid blue */}
              <Button type="submit" className="bg-blue-500 text-white hover:bg-blue-600 h-10 px-8 font-medium rounded-full transition-colors" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save contact'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Import CSV Modal */}
      <Dialog open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Contacts</DialogTitle>
            <DialogDescription>
              Upload a CSV file to bulk import contacts into your workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="py-8 flex flex-col items-center justify-center border-2 border-dashed border-surface-border rounded-xl bg-surface-subtle relative hover:bg-surface transition-colors">
            <Upload className="w-8 h-8 text-ink-muted mb-4" />
            <p className="text-[14px] font-medium text-ink mb-1">Click to upload or drag and drop</p>
            <p className="text-[12px] text-ink-secondary mb-4">CSV file (columns: Name, Email, Phone)</p>
            <Button variant="outline" className="h-8 text-[12px] relative pointer-events-none">Select File</Button>
            <input
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleImportCSV}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            {importing && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-xl backdrop-blur-sm z-10">
                <div className="flex flex-col items-center">
                  <div className="w-6 h-6 rounded-full border-2 border-ink border-t-transparent animate-spin mb-2" />
                  <span className="text-sm font-medium text-ink">Importing...</span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsImportModalOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
