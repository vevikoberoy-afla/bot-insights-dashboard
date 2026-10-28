'use client'
import { useState, useEffect } from 'react'
import { X, Plus, Trash2, Globe, FileText, Link2, ChevronRight, Loader2, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react'
import { WebsiteCrawlPanel } from '@/components/knowledge/WebsiteCrawlPanel'
import { DocumentUploadPanel } from '@/components/knowledge/DocumentUploadPanel'
import { activeWorkspaceId } from '@/lib/client/workspace'

const PURPOSES = ['general','support','sales','marketing','hr','campaign']

interface SourceEntry { id: string; url: string; status: 'idle'|'processing'|'ready'|'error'; msg?: string; chunks?: number }
interface Props { clientId: string; onClose: () => void; onCreated: (d: any) => void }

function UrlList({ label, icon: Icon, placeholder, color, sources, onAdd, onRemove, onSubmit, loading, error }:any) {
  const [input, setInput] = useState('')
  return (
    <div className="border border-gray-100 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className="text-[13px] font-semibold text-gray-800">{label}</span>
      </div>
      {sources.map((s: SourceEntry) => (
        <div key={s.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] border ${s.status==='error'?'border-red-100 bg-red-50':s.status==='ready'?'border-green-100 bg-green-50':'border-gray-100 bg-gray-50'}`}>
          {s.status==='processing' && <RefreshCw className="w-3 h-3 text-blue-500 animate-spin shrink-0"/>}
          {s.status==='ready'      && <CheckCircle className="w-3 h-3 text-green-500 shrink-0"/>}
          {s.status==='error'      && <AlertTriangle className="w-3 h-3 text-red-500 shrink-0"/>}
          <span className={`flex-1 truncate ${s.status==='error'?'text-red-600':s.status==='ready'?'text-green-700':'text-gray-600'}`}>
            {s.status==='ready'?`${s.url} — ${s.chunks} chunks`:s.status==='error'?s.msg||'Error':s.url}
          </span>
          {s.status==='idle' && <button onClick={()=>onRemove(s.id)} className="text-gray-300 hover:text-red-400"><Trash2 className="w-3.5 h-3.5"/></button>}
        </div>
      ))}
      <div className="flex gap-2">
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&input.trim()&&(onAdd(input.trim()),setInput(''))}
          placeholder={placeholder}
          className="flex-1 h-9 px-3 border border-gray-200 rounded-xl text-[12px] placeholder-gray-400 focus:outline-none focus:border-gray-400 transition-all"/>
        <button onClick={()=>{if(input.trim()){onAdd(input.trim());setInput('')}}}
          className="w-9 h-9 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
          <Plus className="w-4 h-4 text-gray-500"/>
        </button>
      </div>
      {sources.some((s:SourceEntry)=>s.status==='idle') && (
        <button onClick={()=>onSubmit(sources.filter((s:SourceEntry)=>s.status==='idle').map((s:SourceEntry)=>s.url))}
          disabled={loading}
          className="w-full h-9 flex items-center justify-center gap-2 bg-[#111] text-white text-[12px] font-medium rounded-xl hover:bg-black disabled:opacity-50 transition-colors">
          {loading?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<Globe className="w-3.5 h-3.5"/>}
          Start Processing ({sources.filter((s:SourceEntry)=>s.status==='idle').length} URL{sources.filter((s:SourceEntry)=>s.status==='idle').length>1?'s':''})
        </button>
      )}
      {error && <p className="text-[11px] text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3"/>{error}</p>}
    </div>
  )
}

export function AddKnowledgeBaseModal({ clientId, onClose, onCreated }: Props) {
  const [step, setStep] = useState<1|2|3>(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [datasetId, setDatasetId] = useState<string|null>(null)

  // Step 1
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [purpose, setPurpose] = useState('general')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])

  // Step 2 — document links (Jina Reader)
  const [docSources, setDocSources] = useState<SourceEntry[]>([])
  const [docLoading, setDocLoading] = useState(false)
  const [docError, setDocError] = useState('')

  // Step 2 — text paste
  const [textContent, setTextContent] = useState('')
  const [textAdding, setTextAdding] = useState(false)

  // Track all submitted source IDs
  const [submittedSources, setSubmittedSources] = useState<any[]>([])

  const hasPendingSources = submittedSources.some(source => ['pending', 'processing'].includes(source?.status))
  useEffect(() => {
    if (!datasetId || !hasPendingSources) return
    let cancelled = false, timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      try {
        const response = await fetch(`/api/datasets/${datasetId}/sources`, { headers: { 'X-Workspace-Id': activeWorkspaceId(clientId) } })
        if (response.ok && !cancelled) {
          const sources=await response.json()
          setSubmittedSources(sources)
          setDocSources(previous=>previous.map(item=>{
            const source=sources.find((source:any)=>source.id===item.id)
            return source?{...item,status:source.status==='ready'?'ready':source.status==='error'?'error':'processing',chunks:source.chunk_count,msg:source.error_msg}:item
          }))
        }
      } finally { if (!cancelled) timer = setTimeout(() => { void refresh().catch(() => {}) }, 8000) }
    }
    timer = setTimeout(() => { void refresh().catch(() => {}) }, 1000)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [datasetId, hasPendingSources, clientId])

  function addDocUrl(url: string) {
    setDocSources(p=>[...p,{id:Math.random().toString(36).slice(2),url,status:'idle'}])
  }
  function removeDocUrl(id: string) { setDocSources(p=>p.filter(s=>s.id!==id)) }

  async function handleStep1() {
    setError('')
    if (!name.trim()||name.trim().length<3){setError('Name must be at least 3 characters');return}
    setSaving(true)
    try {
    const res = await fetch('/api/datasets',{method:datasetId?'PUT':'POST',headers:{'Content-Type':'application/json','X-Workspace-Id':activeWorkspaceId(clientId)},body:JSON.stringify({...(datasetId?{id:datasetId}:{}),client_id:clientId,name:name.trim(),description,purpose,tags,created_from:'manual'})})
    const data = await res.json()
    if(!res.ok){setError(data.error||'Failed');return}
    setDatasetId(data.id)
    setPurpose(data.purpose)
    setStep(2)
    } catch { setError('Could not save knowledge-base details. Please try again.') }
    finally { setSaving(false) }
  }

  async function publish() {
    setSaving(true); setError('')
    try {
      const response = await fetch(`/api/datasets?id=${datasetId}`, { headers: { 'X-Workspace-Id': activeWorkspaceId(clientId) } })
      const dataset = await response.json()
      if (!response.ok) throw new Error(dataset.error || 'Could not finish setup')
      onCreated(dataset)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not finish setup') }
    finally { setSaving(false) }
  }

  async function submitDocUrls(urls: string[]) {
    if(!datasetId) return
    setDocLoading(true); setDocError('')
    for (const url of urls) {
      setDocSources(p=>p.map(s=>s.url===url?{...s,status:'processing'}:s))
      try {
        const res = await fetch(`/api/datasets/${datasetId}/sources`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source_type:'document_link',source_ref:url})})
        const data = await res.json()
        if(res.ok) {
          setDocSources(p=>p.map(s=>s.url===url?{...s,id:data.source.id,status:data.source?.status==='ready'?'ready':'processing',chunks:data.chunks_added}:s))
          setSubmittedSources(p=>[...p.filter(source=>source.id!==data.source.id),data.source])
        } else {
          setDocSources(p=>p.map(s=>s.url===url?{...s,status:'error',msg:data.error}:s))
          setDocError(data.error)
        }
      } catch { setDocSources(p=>p.map(s=>s.url===url?{...s,status:'error',msg:'Network error'}:s)) }
    }
    setDocLoading(false)
  }

  async function addTextSource() {
    if(!datasetId||!textContent.trim()) return
    setTextAdding(true)
    const res = await fetch(`/api/datasets/${datasetId}/sources`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source_type:'text',content:textContent.trim()})})
    const data = await res.json()
    if(res.ok){setSubmittedSources(p=>[...p,data.source]);setTextContent('')}
    setTextAdding(false)
  }

  const totalSources = submittedSources.length
  const readySources = submittedSources.filter(s=>s?.status==='ready').length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="text-[15px] font-semibold text-[#111]">New Knowledge Base</h2>
            <div className="flex items-center gap-2 mt-1">
              {[1,2,3].map(s=>(
                <div key={s} className="flex items-center gap-1">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${s<=step?'bg-[#111] text-white':'bg-gray-100 text-gray-400'}`}>{s}</div>
                  {s<3&&<div className={`w-8 h-px ${s<step?'bg-[#111]':'bg-gray-200'}`}/>}
                </div>
              ))}
              <span className="text-[11px] text-gray-400 ml-1">{step===1?'Details':step===2?'Add Sources':'Review'}</span>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors">
            <X className="w-4 h-4 text-gray-500"/>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* ── STEP 1: Metadata ── */}
          {step===1 && (
            <>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Name *</label>
                <input autoFocus value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Product FAQ" maxLength={80}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] focus:outline-none focus:border-gray-400 transition-all"/>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Description</label>
                <textarea value={description} onChange={e=>setDescription(e.target.value)} rows={2} placeholder="What is this knowledge base for?" maxLength={200}
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] focus:outline-none focus:border-gray-400 transition-all resize-none"/>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Purpose</label>
                <div className="grid grid-cols-3 gap-2">
                  {PURPOSES.map(p=>(
                    <button type="button" aria-pressed={purpose===p} key={p} onClick={()=>setPurpose(p)}
                      className={`py-2 px-3 text-[12px] font-medium rounded-xl border capitalize transition-all ${purpose===p?'border-[#111] bg-gray-50 text-[#111]':'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Tags</label>
                <input value={tagInput} onChange={e=>setTagInput(e.target.value)}
                  onKeyDown={e=>{if(e.key==='Enter'&&tagInput.trim()){setTags(t=>[...t,tagInput.trim()]);setTagInput('')}}}
                  placeholder="Type a tag and press Enter…"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13px] focus:outline-none focus:border-gray-400 transition-all"/>
                {tags.length>0&&<div className="flex flex-wrap gap-1.5 mt-2">
                  {tags.map(t=>(
                    <span key={t} className="flex items-center gap-1 bg-gray-100 text-[#111] text-[11px] px-2.5 py-1 rounded-full">
                      {t}<button onClick={()=>setTags(ts=>ts.filter(x=>x!==t))} className="text-gray-400 hover:text-gray-700">×</button>
                    </span>
                  ))}
                </div>}
              </div>
              {error&&<p className="text-[12px] text-red-500 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5"/>{error}</p>}
            </>
          )}

          {/* ── STEP 2: Sources ── */}
          {step===2 && (
            <>
              {/* Website Crawl */}
              {datasetId && <WebsiteCrawlPanel datasetId={datasetId} onAdded={source => setSubmittedSources(previous => [...previous, source])} />}
              {submittedSources.filter(source => source?.source_type === 'website_crawl').map(source => <div key={source.id} className="rounded-xl border border-gray-100 p-3 text-[12px] text-gray-600"><p className="truncate font-medium">{source.source_name}</p><p className={source.status==='error'?'text-red-600':''}>{source.status==='ready'?`${source.chunk_count} chunks ready`:source.status==='error'?source.error_msg:'Importing website pages…'}</p></div>)}

              {datasetId && <DocumentUploadPanel datasetId={datasetId} onAdded={source=>setSubmittedSources(previous=>[...previous.filter(item=>item.id!==source.id),source])} />}
              {submittedSources.filter(source=>source?.source_type==='file').map(source=><div key={source.id} className="rounded-xl border border-gray-100 p-3 text-[12px] text-gray-600"><p className="truncate font-medium">{source.source_name}</p><p className={source.status==='error'?'text-red-600':''}>{source.status==='ready'?`${source.chunk_count} chunks ready`:source.status==='error'?source.error_msg:'Checked · indexing document…'}</p></div>)}

              {/* Document Links */}
              <UrlList
                label="Document & Article Links" icon={Link2} color="bg-purple-100 text-purple-600"
                placeholder="Public Google Doc, PDF, TXT, or web page link"
                sources={docSources} onAdd={addDocUrl} onRemove={removeDocUrl}
                onSubmit={submitDocUrls} loading={docLoading} error={docError}
              />

              {/* Supported hint */}
              <div className="bg-purple-50 border border-purple-100 rounded-xl px-4 py-2.5">
                <p className="text-[11px] text-purple-600 font-medium">Supported document links:</p>
                <p className="text-[11px] text-purple-500 mt-0.5">Public Google Docs and Sheets · PDFs · Text and Markdown files · Publicly readable web pages</p>
              </div>

              {/* Text paste */}
              <div className="border border-gray-100 rounded-2xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-green-100 text-green-600">
                    <FileText className="w-3.5 h-3.5"/>
                  </div>
                  <span className="text-[13px] font-semibold text-gray-800">Paste Text Directly</span>
                </div>
                <textarea value={textContent} onChange={e=>setTextContent(e.target.value)} rows={4}
                  placeholder="Paste any text content — FAQs, policies, product descriptions…"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-[12px] focus:outline-none focus:border-gray-400 resize-none transition-all"/>
                <button onClick={addTextSource} disabled={textAdding||!textContent.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#111] text-white text-[12px] font-medium rounded-xl hover:bg-black disabled:opacity-40 transition-colors">
                  {textAdding?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<Plus className="w-3.5 h-3.5"/>}
                  Embed Text
                </button>
              </div>

              {/* Sources summary */}
              {totalSources>0&&(
                <div className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-[12px] text-gray-600 font-medium">{totalSources} source{totalSources!==1?'s':''} added</span>
                  <span className="text-[11px] text-gray-400">{readySources} ready</span>
                </div>
              )}
            </>
          )}

          {/* ── STEP 3: Review ── */}
          {step===3 && (
            <div className="space-y-4">
              <p className="text-[13px] text-gray-500">Review before publishing.</p>
              <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
                {[['Name',name],['Purpose',purpose],['Description',description]].map(([k,v])=>v?(
                  <div key={k} className="flex justify-between text-[13px]">
                    <span className="text-gray-500">{k}</span><span className="font-medium text-gray-800 capitalize">{v}</span>
                  </div>
                ):null)}
                {tags.length>0&&<div className="flex justify-between text-[13px]"><span className="text-gray-500">Tags</span><div className="flex gap-1">{tags.map(t=><span key={t} className="bg-gray-200 text-gray-600 text-[10px] px-2 py-0.5 rounded-full">{t}</span>)}</div></div>}
                <div className="flex justify-between text-[13px]">
                  <span className="text-gray-500">Sources</span>
                  <span className="text-gray-800">{totalSources} added · {submittedSources.filter(s=>s?.status==='processing').length} still importing</span>
                </div>
              </div>
              {submittedSources.some(s=>s?.status==='processing')&&(
                <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-[12px] text-blue-700 flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0"/>
                  Website pages are still importing. Open this knowledge base to follow their progress.
                </div>
              )}
              {totalSources===0&&<div className="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-[12px] text-amber-700 flex items-center gap-2"><AlertTriangle className="w-3.5 h-3.5 shrink-0"/>No sources added. Go back and add at least one.</div>}
              {error&&<p className="text-[12px] text-red-500">{error}</p>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
          <button onClick={()=>step>1?setStep(s=>(s-1) as any):onClose()} className="text-[13px] text-gray-500 hover:text-gray-800 transition-colors">
            {step===1?'Cancel':'← Back'}
          </button>
          <div className="flex items-center gap-3">
            {step===2&&<button onClick={()=>setStep(3)} className="text-[12px] text-gray-400 hover:text-gray-700 transition-colors">Skip to Review →</button>}
            {step<3?(
              <button onClick={step===1?handleStep1:()=>setStep(3)} disabled={saving}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-[#111] text-white text-[13px] font-medium rounded-xl hover:bg-black disabled:opacity-50 transition-colors">
                {saving?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:null}
                {step===1?'Save & Continue':'Review'}<ChevronRight className="w-3.5 h-3.5"/>
              </button>
            ):(
              <button onClick={publish}
                disabled={saving || totalSources===0}
                className="flex items-center gap-1.5 px-5 py-2.5 bg-[#111] text-white text-[13px] font-medium rounded-xl hover:bg-black disabled:opacity-50 transition-colors">
                <CheckCircle className="w-3.5 h-3.5"/>Publish Knowledge Base
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
