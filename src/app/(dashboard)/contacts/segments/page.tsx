'use client'

import { useEffect, useMemo, useState } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Users, Trash2, Search, Sparkles, List, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type Segment = {
  id: string
  name: string
  description?: string | null
  color?: string
  segment_type?: 'manual'|'automatic'
  is_system?: boolean
  contact_count?: number
}

export default function SegmentsPage() {
  const [segments,setSegments] = useState<Segment[]>([])
  const [loading,setLoading] = useState(true)
  const [creating,setCreating] = useState(false)
  const [showCreate,setShowCreate] = useState(false)
  const [search,setSearch] = useState('')
  const [name,setName] = useState('')
  const [description,setDescription] = useState('')
  const [color,setColor] = useState('#2563EB')

  const load = async () => {
    try {
      const res = await fetch('/api/segments')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Segments could not be loaded')
      setSegments(Array.isArray(data) ? data : [])
    } catch (error:any) { toast.error(error.message) }
    finally { setLoading(false) }
  }
  useEffect(()=>{load()},[])

  const create = async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/segments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,description,color})})
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Segment could not be created')
      setSegments(current=>[...current,data].sort((a,b)=>a.name.localeCompare(b.name)))
      setName('');setDescription('');setColor('#2563EB');setShowCreate(false)
      toast.success('Manual segment created')
    } catch (error:any) { toast.error(error.message) }
    finally { setCreating(false) }
  }

  const remove = async (segment:Segment) => {
    if (segment.is_system || !confirm(`Delete “${segment.name}”? Contacts will not be deleted.`)) return
    const res = await fetch(`/api/segments?id=${encodeURIComponent(segment.id)}`,{method:'DELETE'})
    const data = await res.json()
    if (!res.ok) return toast.error(data.error || 'Segment could not be deleted')
    setSegments(current=>current.filter(item=>item.id!==segment.id));toast.success('Segment deleted')
  }

  const filtered = useMemo(()=>segments.filter(segment=>`${segment.name} ${segment.description || ''}`.toLowerCase().includes(search.toLowerCase())),[segments,search])
  const automatic = segments.filter(segment=>segment.is_system || segment.segment_type === 'automatic').length
  const totalMemberships = segments.reduce((sum,segment)=>sum+Number(segment.contact_count || 0),0)

  return <div className="h-full pb-12 animate-in fade-in duration-300">
    <PageHeader title="Segments" description="Automatic behavior groups and manual customer lists used across campaigns and CRM.">
      <Button onClick={()=>setShowCreate(true)} className="h-9 bg-ink text-xs text-white"><Plus className="mr-2 h-4 w-4"/>Create manual segment</Button>
    </PageHeader>

    <div className="mb-6 grid grid-cols-3 gap-4">
      {[{label:'Total segments',value:segments.length,icon:List},{label:'Automatic',value:automatic,icon:Sparkles},{label:'Memberships',value:totalMemberships,icon:Users}].map(item=><div key={item.label} className="flex items-center gap-4 rounded-xl border border-surface-border bg-white px-5 py-4"><item.icon className="h-5 w-5 text-accent"/><div><p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{item.label}</p><p className="text-xl font-bold text-ink">{item.value}</p></div></div>)}
    </div>

    <div className="relative mb-5 w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"/><Input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search segments…" className="h-9 pl-9"/></div>
    <div className="overflow-hidden rounded-xl border border-surface-border bg-white shadow-sm">
      {loading ? <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin"/></div> : <table className="w-full text-sm">
        <thead><tr className="border-b border-surface-border bg-surface-muted/50 text-[10px] font-bold uppercase tracking-wider text-ink-muted"><th className="px-5 py-3 text-left">Segment</th><th className="px-4 py-3 text-left">Type</th><th className="px-4 py-3 text-right">Contacts</th><th className="px-4 py-3 text-left">How it updates</th><th className="w-14 px-4 py-3"/></tr></thead>
        <tbody className="divide-y divide-surface-border">{filtered.map(segment=>{
          const system = segment.is_system || segment.segment_type === 'automatic'
          return <tr key={segment.id} className="hover:bg-surface-muted/30"><td className="px-5 py-4"><div className="flex items-center gap-3"><span className="h-3 w-3 rounded-full" style={{backgroundColor:segment.color || '#2563EB'}}/><div><p className="font-semibold text-ink">{segment.name}</p><p className="mt-0.5 text-xs text-ink-muted">{segment.description || 'A custom customer group'}</p></div></div></td><td className="px-4 py-4"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${system?'bg-violet-50 text-violet-700':'bg-slate-100 text-slate-700'}`}>{system?<Sparkles className="h-3 w-3"/>:<List className="h-3 w-3"/>}{system?'Automatic':'Manual'}</span></td><td className="px-4 py-4 text-right font-semibold text-ink">{segment.contact_count || 0}</td><td className="px-4 py-4 text-xs text-ink-muted">{system?'Updated from bookings, orders and support activity':'Managed from the Contacts table'}</td><td className="px-4 py-4">{!system&&<button title="Delete segment" onClick={()=>remove(segment)} className="rounded-lg p-2 text-ink-muted hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4"/></button>}</td></tr>
        })}</tbody>
      </table>}
    </div>

    {showCreate&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={()=>setShowCreate(false)}><div className="w-full max-w-md space-y-5 rounded-2xl bg-white p-6 shadow-2xl" onClick={event=>event.stopPropagation()}><div><h2 className="text-lg font-bold text-ink">Create manual segment</h2><p className="mt-1 text-xs text-ink-muted">You can add or move contacts into this segment from the Contacts page.</p></div><div><label className="mb-1.5 block text-xs font-semibold text-ink-secondary">Name</label><Input value={name} onChange={event=>setName(event.target.value)} placeholder="VIP customers"/></div><div><label className="mb-1.5 block text-xs font-semibold text-ink-secondary">Description</label><Input value={description} onChange={event=>setDescription(event.target.value)} placeholder="Customers managed by the sales team"/></div><div><label className="mb-1.5 block text-xs font-semibold text-ink-secondary">Color</label><input type="color" value={color} onChange={event=>setColor(event.target.value)} className="h-10 w-16 cursor-pointer rounded-lg border border-surface-border bg-white p-1"/></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setShowCreate(false)}>Cancel</Button><Button disabled={!name.trim()||creating} onClick={create} className="bg-ink text-white">{creating?'Creating…':'Create segment'}</Button></div></div></div>}
  </div>
}
