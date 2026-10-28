'use client'
import { activeWorkspaceId } from '@/lib/client/workspace'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase-browser'
import Link from 'next/link'
import { Plus, Search, LayoutGrid, List, BookOpen, RefreshCw, CheckCircle, AlertTriangle, Trash2, FileText, TrendingUp, Megaphone, Headphones, Mail, Users, MoreVertical, SearchX } from 'lucide-react'
import { AddKnowledgeBaseModal } from '@/components/knowledge/AddKnowledgeBaseModal'
import { useRouter } from 'next/navigation'

const CAT: Record<string, any> = {
  general:   { bg: 'bg-[#f3f4f6]', text: 'text-[#374151]', icon: BookOpen },
  sales:     { bg: 'bg-[#eff6ff]', text: 'text-[#1d4ed8]', icon: TrendingUp },
  marketing: { bg: 'bg-[#f5f3ff]', text: 'text-[#6d28d9]', icon: Megaphone },
  support:   { bg: 'bg-[#f0fdf4]', text: 'text-[#166534]', icon: Headphones },
  campaign:  { bg: 'bg-[#fff7ed]', text: 'text-[#c2410c]', icon: Mail },
  hr:        { bg: 'bg-[#fefce8]', text: 'text-[#a16207]', icon: Users },
}

const TABS = ['All','General','Sales','Marketing','Support','Campaign','HR']

function Card({ d, onDelete }: { d: any; onDelete: (id: string) => void }) {
  const cat = CAT[d.purpose] || CAT.general
  const Icon = cat.icon
  const tags: string[] = d.tags || []
  const isDraft = d.status === 'draft'
  const isError = d.status === 'error'
  const [menu, setMenu] = useState(false)

  return (
    <div className={`bg-white rounded-xl p-5 flex flex-col gap-3 transition-all duration-150 cursor-pointer relative
      ${isDraft ? 'border border-dashed border-amber-400' : isError ? 'border border-red-200' : 'border border-[#e5e7eb] hover:border-[#d1d5db] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]'}`}>
      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${cat.bg} ${cat.text}`}>
          <Icon className="w-3 h-3" />{(d.purpose||'general').charAt(0).toUpperCase()+(d.purpose||'general').slice(1)}
        </span>
        <div className="flex items-center gap-2">
          {d.status==='ready'&&<span className="flex items-center gap-1 text-[11px] text-green-600"><span className="w-1.5 h-1.5 rounded-full bg-green-500"/>Ready</span>}
          {d.status==='processing'&&<span className="flex items-center gap-1 text-[11px] text-blue-600"><RefreshCw className="w-3 h-3 animate-spin"/>Processing</span>}
          {d.status==='error'&&<span className="flex items-center gap-1 text-[11px] text-red-500"><AlertTriangle className="w-3 h-3"/>Error</span>}
          {d.status==='draft'&&<span className="text-[11px] text-gray-400">Draft</span>}
          <div className="relative">
            <button onClick={e=>{e.preventDefault();setMenu(m=>!m)}} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100">
              <MoreVertical className="w-3.5 h-3.5 text-gray-400"/>
            </button>
            {menu&&<>
              <div className="fixed inset-0 z-10" onClick={()=>setMenu(false)}/>
              <div className="absolute right-0 top-7 z-20 w-36 bg-white border border-gray-200 rounded-xl shadow-lg py-1 text-[12px]">
                <Link href={`/knowledge/${d.id}`} className="block px-3 py-2 hover:bg-gray-50 text-gray-700">Edit</Link>
                <button onClick={()=>{setMenu(false);onDelete(d.id)}} className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600">Delete</button>
              </div>
            </>}
          </div>
        </div>
      </div>

      <Link href={`/knowledge/${d.id}`} className="flex-1">
        <h3 className="text-[15px] font-semibold text-[#111] line-clamp-1">{d.name}</h3>
        {d.description&&<p className="text-[12px] text-[#6b7280] mt-1 line-clamp-2">{d.description}</p>}
        {tags.length>0&&<div className="flex flex-wrap gap-1 mt-2">
          {tags.slice(0,3).map((t:string)=><span key={t} className="bg-[#f3f4f6] text-[#6b7280] text-[10px] px-2 py-0.5 rounded-full">{t}</span>)}
          {tags.length>3&&<span className="text-[10px] text-gray-400">+{tags.length-3}</span>}
        </div>}
      </Link>

      <div className="flex items-center justify-between pt-3 border-t border-[#f3f4f6]">
        <div className="flex items-center gap-3 text-[11px] text-[#9ca3af]">
          <span className="flex items-center gap-1"><FileText className="w-3 h-3"/>{d.chunk_count||0} chunks</span>
          <span>·</span>
          <span>{d.source_count||0} sources</span>
        </div>
        {isDraft
          ? <span className="text-[11px] text-amber-600 font-medium">Complete →</span>
          : <span className="text-[12px] text-[#9ca3af]">{new Date(d.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
        }
      </div>
    </div>
  )
}

export default function ClientKnowledgeAddPage() {
  const supabase = createClient()
  const router = useRouter()
  const [datasets, setDatasets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState<string|null>(null)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('All')
  const [status, setStatus] = useState('All Status')
  const [view, setView] = useState<'grid'|'list'>('grid')
  
  // Set modal true initially because this is the `/add` route
  const [modal, setModal] = useState(true)

  async function load() {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return
    setClientId(activeWorkspaceId(user.id || ''))
    const res = await fetch(`/api/datasets?client_id=${activeWorkspaceId(user.id || '')}`)
    const data = await res.json()
    setDatasets(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!datasets.some(d => d.status === 'processing')) return
    const id = setInterval(load, 8000)
    return () => clearInterval(id)
  }, [datasets])

  const counts = useMemo(() => {
    const c: Record<string,number> = { All: datasets.length }
    datasets.forEach(d => { const k = (d.purpose||'general'); const label = k.charAt(0).toUpperCase()+k.slice(1); c[label] = (c[label]||0)+1 })
    return c
  }, [datasets])

  const filtered = useMemo(() => {
    let list = [...datasets]
    if (tab !== 'All') list = list.filter(d => (d.purpose||'general').toLowerCase() === tab.toLowerCase())
    if (status !== 'All Status') list = list.filter(d => (d.status||'draft').toLowerCase() === status.toLowerCase())
    if (search.trim()) { const q = search.toLowerCase(); list = list.filter(d => d.name?.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q) || d.tags?.some((t:string)=>t.toLowerCase().includes(q))) }
    return list
  }, [datasets, tab, status, search])

  async function handleDelete(id: string) {
    const res = await fetch(`/api/datasets?id=${id}`)
    const check = await res.json()
    if (check.warning && !confirm(check.message)) return
    await fetch(`/api/datasets?id=${id}&force=true`, { method: 'DELETE' })
    setDatasets(p => p.filter(d => d.id !== id))
  }

  const drafts = filtered.filter(d => d.status === 'draft')
  const ready  = filtered.filter(d => d.status !== 'draft')

  const handleModalClose = () => {
    setModal(false)
    router.push('/knowledge/all') // redirect to all if closed
  }

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-widest mb-1">Knowledge / All</p>
          <h1 className="text-[24px] font-semibold text-[#111] tracking-tight">Knowledge Base</h1>
          <p className="text-[13px] text-[#6b7280] mt-0.5">Manage your AI training data.</p>
        </div>
        <button onClick={()=>setModal(true)} className="flex items-center gap-2 px-4 py-2.5 bg-[#111] text-white text-[13px] font-medium rounded-xl hover:bg-black transition-colors shadow-sm">
          <Plus className="w-4 h-4"/>Add Knowledge Base
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center justify-between gap-4 pb-4 border-b border-gray-100">
        <div className="relative w-[320px]">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search knowledge bases..."
            className="w-full h-10 pl-9 pr-4 border border-gray-200 rounded-full text-[13px] placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all bg-white"/>
        </div>
        <div className="flex items-center gap-2">
          <select value={status} onChange={e=>setStatus(e.target.value)} className="h-9 px-3 border border-gray-200 rounded-lg text-[12px] text-gray-600 bg-white focus:outline-none focus:border-gray-400">
            {['All Status','Ready','Processing','Draft','Error'].map(s=><option key={s}>{s}</option>)}
          </select>
          <div className="flex border border-gray-200 rounded-lg overflow-hidden">
            <button onClick={()=>setView('grid')} className={`w-9 h-9 flex items-center justify-center transition-colors ${view==='grid'?'bg-[#111] text-white':'bg-white text-gray-400 hover:bg-gray-50'}`}><LayoutGrid className="w-3.5 h-3.5"/></button>
            <button onClick={()=>setView('list')} className={`w-9 h-9 flex items-center justify-center transition-colors ${view==='list'?'bg-[#111] text-white':'bg-white text-gray-400 hover:bg-gray-50'}`}><List className="w-3.5 h-3.5"/></button>
          </div>
        </div>
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto scrollbar-none">
        {TABS.map(t=>(
          <button key={t} onClick={()=>setTab(t)} className={`flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg text-[13px] transition-all ${tab===t?'bg-[#111] text-white font-semibold':'text-[#6b7280] hover:bg-gray-100'}`}>
            {t}
            {(counts[t]||0)>0&&<span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab===t?'bg-white/20 text-white':'bg-gray-100 text-gray-500'}`}>{counts[t]}</span>}
          </button>
        ))}
      </div>

      {/* Processing banner */}
      {datasets.some(d=>d.status==='processing')&&(
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3"><RefreshCw className="w-4 h-4 text-blue-600 animate-spin"/><span className="text-[13px] text-blue-700 font-medium">Some knowledge bases are still processing…</span></div>
          <button onClick={load} className="text-[12px] text-blue-600 hover:text-blue-800">Refresh</button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-5 h-5 rounded-full border-2 border-[#111] border-t-transparent animate-spin"/></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          {search ? <SearchX className="w-10 h-10 text-gray-200 mb-3"/> : <BookOpen className="w-12 h-12 text-gray-200 mb-4"/>}
          <h3 className="text-[15px] font-medium text-gray-600">{search ? `No results for "${search}"` : tab !== 'All' ? `No ${tab} knowledge bases` : 'No Knowledge Bases Yet'}</h3>
          <p className="text-[13px] text-gray-400 mt-1">{search ? 'Try different keywords.' : 'Create your first knowledge base to start training your AI agents.'}</p>
          {!search&&<button onClick={()=>setModal(true)} className="mt-5 flex items-center gap-2 px-4 py-2.5 bg-[#111] text-white text-[13px] font-medium rounded-xl hover:bg-black transition-colors"><Plus className="w-4 h-4"/>Add Knowledge Base</button>}
          {search&&<button onClick={()=>setSearch('')} className="mt-3 text-[13px] text-blue-600 hover:underline">Clear search</button>}
        </div>
      ) : view === 'list' ? (
        <div className="border border-[#e5e7eb] rounded-xl overflow-hidden bg-white">
          <div className="grid grid-cols-[1fr_100px_90px_60px_100px_40px] items-center px-4 py-2.5 bg-gray-50 border-b text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">
            <span>Name</span><span>Category</span><span>Status</span><span>Chunks</span><span>Created</span><span/>
          </div>
          {filtered.map(d=>(
            <div key={d.id} className="grid grid-cols-[1fr_100px_90px_60px_100px_40px] items-center px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors">
              <Link href={`/knowledge/${d.id}`} className="text-[13px] font-medium text-[#111] truncate hover:text-blue-600">{d.name}</Link>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize w-fit ${CAT[d.purpose]?.bg||'bg-gray-100'} ${CAT[d.purpose]?.text||'text-gray-600'}`}>{d.purpose||'general'}</span>
              <span className="text-[12px] capitalize text-gray-500">{d.status||'draft'}</span>
              <span className="text-[12px] text-gray-500">{d.chunk_count||0}</span>
              <span className="text-[12px] text-gray-400">{new Date(d.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>
              <button onClick={()=>handleDelete(d.id)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 className="w-3.5 h-3.5"/></button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {ready.length > 0 && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[14px]">{ready.map(d=><Card key={d.id} d={d} onDelete={handleDelete}/>)}</div>}
          {drafts.length > 0 && (
            <details className="group">
              <summary className="flex items-center gap-2 text-[12px] font-medium text-gray-500 hover:text-gray-800 cursor-pointer list-none mb-3">
                <span className="transition-transform group-open:rotate-90">▶</span>
                Drafts ({drafts.length}) <span className="font-normal text-gray-400">— incomplete, not active</span>
              </summary>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[14px]">{drafts.map(d=><Card key={d.id} d={d} onDelete={handleDelete}/>)}</div>
            </details>
          )}
        </div>
      )}

      {modal && clientId && (
        <AddKnowledgeBaseModal
          clientId={clientId}
          onClose={handleModalClose}
          onCreated={d=>{ setDatasets(p=>[d,...p]); load(); router.push(`/knowledge/${d.id}`) }}
        />
      )}
    </div>
  )
}
