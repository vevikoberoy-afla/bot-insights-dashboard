'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { WebsiteCrawlPanel } from '@/components/knowledge/WebsiteCrawlPanel'
import { DocumentUploadPanel } from '@/components/knowledge/DocumentUploadPanel'
import {
  ArrowLeft, RefreshCw, Trash2, Plus, FileText, Link2, BookOpen,
  Bot, AlertTriangle, CheckCircle, ChevronRight, Settings, Eye, MessageSquare, ArrowRight
} from 'lucide-react'

// ── Source type icon ─────────────────────────────────────────────
function SourceIcon({ type }: { type: string }) {
  const icons: Record<string, any> = {
    url: Link2, text: FileText, file: FileText, google_doc: BookOpen, notion: BookOpen
  }
  const Icon = icons[type] || FileText
  return <Icon className="w-4 h-4 text-gray-400 shrink-0" />
}

// ── Source status badge ──────────────────────────────────────────
function SourceStatus({ source, datasetId, onRetry, onDelete }: {
  source: any; datasetId: string; onRetry: (id: string) => void; onDelete: (id: string) => void
}) {
  return (
    <div className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 group hover:border-gray-200 transition-all">
      <div className="flex items-center gap-3 min-w-0">
        <SourceIcon type={source.source_type} />
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-gray-800 truncate">{source.source_name || source.source_ref}</p>
          {source.source_ref && source.source_ref !== source.source_name && (
            <p className="text-[11px] text-gray-400 truncate mt-0.5">{source.source_ref}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0 ml-4">
        {source.status === 'processing' && (
          <span className="flex items-center gap-1.5 text-[11px] text-blue-600">
            <RefreshCw className="w-3 h-3 animate-spin" />Processing…
          </span>
        )}
        {source.status === 'pending' && (
          <span className="text-[11px] text-gray-400">Waiting…</span>
        )}
        {source.status === 'ready' && (
          <span className="flex items-center gap-1.5 text-[11px] text-green-600">
            <CheckCircle className="w-3 h-3" />{source.chunk_count || 0} chunks
          </span>
        )}
        {source.status === 'error' && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-red-500 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              {source.error_msg ? source.error_msg.slice(0, 40) + (source.error_msg.length > 40 ? '…' : '') : 'Error'}
            </span>
            <button
              onClick={() => onRetry(source.id)}
              className="text-[11px] text-red-600 border border-red-200 px-2 py-0.5 rounded-lg hover:bg-red-50 transition-colors"
            >
              Retry
            </button>
          </div>
        )}
        <button
          onClick={() => onDelete(source.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ── Tab button ───────────────────────────────────────────────────
function Tab({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 transition-all ${
        active ? 'border-[#111] text-[#111]' : 'border-transparent text-gray-400 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

type TabKey = 'sources' | 'preview' | 'bots' | 'settings' | 'test'

export default function DatasetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [dataset, setDataset] = useState<any>(null)
  const [sources, setSources] = useState<any[]>([])
  const [chunks, setChunks] = useState<any[]>([])
  const [bots, setBots] = useState<any[]>([])
  const [availableBots, setAvailableBots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('sources')

  // Settings state
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPurpose, setEditPurpose] = useState('general')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Add source
  const [showAddSource, setShowAddSource] = useState(false)
  const [sourceTab, setSourceTab] = useState<'website_crawl' | 'document_link' | 'text' | 'file'>('website_crawl')
  const [sourceInput, setSourceInput] = useState('')
  const [sourceTitleInput, setSourceTitleInput] = useState('')
  const [addingSource, setAddingSource] = useState(false)
  const [sourceError, setSourceError] = useState('')

  // Chunk search
  const [chunkSearch, setChunkSearch] = useState('')
  const [expandedChunk, setExpandedChunk] = useState<string | null>(null)
  
  // Bot linking state
  const [selectedBotId, setSelectedBotId] = useState('')
  const [linkingBot, setLinkingBot] = useState(false)
  
  // Testing state
  const [testInput, setTestInput] = useState('')
  const [testMessages, setTestMessages] = useState<{role: 'user'|'bot', content: string}[]>([])
  const [testingBot, setTestingBot] = useState(false)

  useEffect(() => {
    if (!id) return
    async function load() {
      const res = await fetch(`/api/datasets?id=${id}`)
      const data = await res.json()
      setDataset(data)
      setEditName(data.name || '')
      setEditDescription(data.description || '')
      setEditPurpose(data.purpose || 'general')
      setSources(data.dataset_sources || [])
      setBots(data.bot_datasets?.map((bd: any) => bd.bots) || [])
      
      // Load chunks
      const chunkRes = await fetch(`/api/chunks?dataset_id=${id}`)
      if (chunkRes.ok) {
        const chunkData = await chunkRes.json()
        setChunks(chunkData.chunks || [])
      }

      // Load all available bots for this client
      if (data.client_id) {
        const { createClient } = await import('@/lib/supabase-browser')
        const supabase = createClient()
        const { data: allBots } = await supabase.from('bots').select('*').eq('client_id', data.client_id)
        if (allBots) setAvailableBots(allBots)
      }
      
      setLoading(false)
    }
    load()
  }, [id])

  // Auto-refresh while processing
  const hasProcessingSources = sources.some(s => s.status === 'processing' || s.status === 'pending')
  useEffect(() => {
    if (!hasProcessingSources) return
    let cancelled = false, timer: ReturnType<typeof setTimeout>
    const refresh = async () => {
      try {
      const sourceRes = await fetch(`/api/datasets/${id}/sources`)
      if (!sourceRes.ok || cancelled) return
      setSources(await sourceRes.json())
      const res = await fetch(`/api/datasets?id=${id}`)
      const data = await res.json()
      if (!cancelled && res.ok) setDataset(data)
      
      // Also reload chunks if processing is happening
      const chunkRes = await fetch(`/api/chunks?dataset_id=${id}`)
      if (chunkRes.ok && !cancelled) {
        const chunkData = await chunkRes.json()
        setChunks(chunkData.chunks || [])
      }
      } catch { /* Try again on the next poll without losing the saved source. */ }
      finally { if (!cancelled) timer = setTimeout(refresh, 8000) }
    }
    timer = setTimeout(refresh, 1000)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [hasProcessingSources, id])

  async function handleSaveSettings() {
    setSaving(true)
    setSaveMsg('')
    try {
    const res = await fetch('/api/datasets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, client_id: dataset?.client_id, name: editName, description: editDescription, purpose: editPurpose })
    })
    if (res.ok) {
      const saved = await res.json()
      setSaveMsg('Saved!')
      setDataset((prev: any) => ({ ...prev, ...saved }))
      setEditPurpose(saved.purpose)
    } else {
      const d = await res.json()
      setSaveMsg(d.error || 'Failed to save')
    }
    } catch { setSaveMsg('Could not save changes. Please try again.') }
    finally { setSaving(false) }
    setTimeout(() => setSaveMsg(''), 3000)
  }

  async function handleDeleteDataset() {
    if (!confirm(`Delete "${dataset?.name}"? This will remove all its chunks and unlink from all bots.`)) return
    const res = await fetch(`/api/datasets?id=${id}`)
    const data = await res.json()
    if (data.warning) {
      if (!confirm(data.message)) return
      await fetch(`/api/datasets?id=${id}&force=true`, { method: 'DELETE' })
    } else {
      await fetch(`/api/datasets?id=${id}`, { method: 'DELETE' })
    }
    router.push('/knowledge/all')
  }

  async function handleAddSource() {
    setAddingSource(true)
    setSourceError('')
    
    if (sourceTab === 'text' && (!sourceInput.trim() || !sourceTitleInput.trim())) {
      setSourceError('Both headline and text content are required.')
      setAddingSource(false)
      return
    }

    if (sourceTab === 'text') {
      const res = await fetch('/api/chunks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataset_id: id,
          title: sourceTitleInput.trim(),
          text: sourceInput.trim(),
          source_type: 'manual'
        })
      })
      const data = await res.json()
      setAddingSource(false)

      if (!res.ok) { setSourceError(data.error); return }

      // Reload chunks immediately
      const chunkRes = await fetch(`/api/chunks?dataset_id=${id}`)
      if (chunkRes.ok) {
        const chunkData = await chunkRes.json()
        setChunks(chunkData.chunks || [])
      }
      
      setSourceInput('')
      setSourceTitleInput('')
      setShowAddSource(false)
      return
    }

    const body = { source_type: sourceTab, source_ref: sourceInput.trim(), source_name: sourceInput.trim() }

    const res = await fetch(`/api/datasets/${id}/sources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await res.json()
    setAddingSource(false)

    if (!res.ok) { setSourceError(data.error); return }
    setSources(prev => [...prev, data.source])
    
    // If it's a document link that returns chunks immediately, reload chunks
    if (data.chunks_added) {
      const chunkRes = await fetch(`/api/chunks?dataset_id=${id}`)
      if (chunkRes.ok) {
        const chunkData = await chunkRes.json()
        setChunks(chunkData.chunks || [])
      }
    }
    
    setSourceInput('')
    setSourceTitleInput('')
    setShowAddSource(false)
  }

  async function handleDeleteSource(sourceId: string) {
    if (!confirm("Delete this source? Its data will be removed from the knowledge base.")) return
    await fetch(`/api/datasets/${id}/sources/${sourceId}`, { method: 'DELETE' })
    setSources(prev => prev.filter(s => s.id !== sourceId))
    
    // Reload chunks since source deletion cascades to chunks
    const chunkRes = await fetch(`/api/chunks?dataset_id=${id}`)
    if (chunkRes.ok) {
      const chunkData = await chunkRes.json()
      setChunks(chunkData.chunks || [])
    }
  }

  async function handleDeleteChunk(chunkId: string, e: React.MouseEvent) {
    e.stopPropagation() // prevent expanding/collapsing
    if (!confirm("Delete this chunk? The bot will no longer be able to use it.")) return
    const res = await fetch(`/api/chunks?chunk_id=${chunkId}`, { method: 'DELETE' })
    if (res.ok) {
      setChunks(prev => prev.filter(c => c.id !== chunkId))
    } else {
      alert("Failed to delete chunk.")
    }
  }

  async function handleRetrySource(sourceId: string) {
    try {
      const response = await fetch(`/api/datasets/${id}/sources/${sourceId}`, { method: 'POST' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not retry source')
      setSources(prev => prev.map(s => s.id === sourceId ? data.source : s))
    } catch (error) { alert(error instanceof Error ? error.message : 'Could not retry source') }
  }

  async function handleLinkBot() {
    if (!selectedBotId) return
    setLinkingBot(true)
    const res = await fetch(`/api/datasets/${id}/bots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bot_id: selectedBotId })
    })
    setLinkingBot(false)
    if (res.ok) {
      const botToAdd = availableBots.find(b => b.id === selectedBotId)
      if (botToAdd) setBots(prev => [...prev, botToAdd])
      setSelectedBotId('')
    } else {
      const data = await res.json()
      alert(data.error || 'Failed to link bot')
    }
  }

  async function handleUnlinkBot(botId: string) {
    if (!confirm('Are you sure you want to unlink this knowledge base from the bot?')) return
    const res = await fetch(`/api/datasets/${id}/bots?bot_id=${botId}`, { method: 'DELETE' })
    if (res.ok) {
      setBots(prev => prev.filter(b => b.id !== botId))
    } else {
      const data = await res.json()
      alert(data.error || 'Failed to unlink bot')
    }
  }

  async function handleTestSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!testInput.trim() || testingBot) return

    const q = testInput.trim()
    setTestInput('')
    setTestMessages(prev => [...prev, { role: 'user', content: q }])
    setTestingBot(true)

    try {
      // Pass existing history (mapped to standard expected by our prompt)
      const history = testMessages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      }))

      const res = await fetch(`/api/datasets/${id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history })
      })

      const data = await res.json()
      if (res.ok) {
        setTestMessages(prev => [...prev, { role: 'bot', content: data.answer }])
      } else {
        setTestMessages(prev => [...prev, { role: 'bot', content: `[Error]: ${data.error}` }])
      }
    } catch (err) {
      setTestMessages(prev => [...prev, { role: 'bot', content: '[Error]: Network request failed.' }])
    }
    setTestingBot(false)
  }

  const filteredChunks = chunks.filter(c =>
    !chunkSearch || c.content?.toLowerCase().includes(chunkSearch.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-5 h-5 rounded-full border-2 border-[#111] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!dataset) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400">
        <p className="text-[15px]">Knowledge base not found.</p>
        <Link href="/knowledge/all" className="mt-3 text-[13px] text-blue-600 hover:underline">← Back to all</Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto pb-20 animate-in fade-in duration-300">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/knowledge/all" className="flex items-center gap-1 text-[12px] text-gray-400 hover:text-gray-700 mb-2 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />Back to Knowledge Base
          </Link>
          <h1 className="text-[22px] font-semibold text-[#111] tracking-tight">{dataset.name}</h1>
          <p className="text-[12px] text-gray-400 mt-1">
            {dataset.chunk_count || 0} chunks · {sources.length} sources · {dataset.purpose || 'general'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-medium px-3 py-1 rounded-full capitalize ${
            dataset.status === 'ready' ? 'bg-green-50 text-green-700 border border-green-200'
            : dataset.status === 'processing' ? 'bg-blue-50 text-blue-700 border border-blue-200'
            : dataset.status === 'error' ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-gray-100 text-gray-500 border border-gray-200'
          }`}>
            {dataset.status}
          </span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-100 mb-6">
        <Tab active={activeTab === 'sources'} onClick={() => setActiveTab('sources')}>
          <FileText className="w-3.5 h-3.5" />Sources
        </Tab>
        <Tab active={activeTab === 'preview'} onClick={() => setActiveTab('preview')}>
          <Eye className="w-3.5 h-3.5" />Content Preview
        </Tab>
        <Tab active={activeTab === 'test'} onClick={() => setActiveTab('test')}>
          <MessageSquare className="w-3.5 h-3.5" />Test Knowledge
        </Tab>
        <Tab active={activeTab === 'bots'} onClick={() => setActiveTab('bots')}>
          <Bot className="w-3.5 h-3.5" />Bots Using This
        </Tab>
        <Tab active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>
          <Settings className="w-3.5 h-3.5" />Settings
        </Tab>
      </div>

      {/* ── Tab: Sources ── */}
      {activeTab === 'sources' && (
        <div className="space-y-3">
          {sources.length === 0 && !showAddSource && (
            <div className="text-center py-10 text-gray-400">
              <FileText className="w-10 h-10 mx-auto mb-3 text-gray-200" />
              <p className="text-[13px]">No sources yet. Add one to start training your AI.</p>
            </div>
          )}
          {sources.map(source => (
            <SourceStatus
              key={source.id}
              source={source}
              datasetId={id}
              onRetry={handleRetrySource}
              onDelete={handleDeleteSource}
            />
          ))}

          {/* Add source form */}
          {showAddSource ? (
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                <button onClick={() => setSourceTab('website_crawl')} className={`flex-1 py-1.5 text-[12px] font-medium rounded-md transition-all ${sourceTab === 'website_crawl' ? 'bg-white text-[#111] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Website Crawl</button>
                <button onClick={() => setSourceTab('document_link')} className={`flex-1 py-1.5 text-[12px] font-medium rounded-md transition-all ${sourceTab === 'document_link' ? 'bg-white text-[#111] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Document Link</button>
                <button onClick={() => setSourceTab('file')} className={`flex-1 py-1.5 text-[12px] font-medium rounded-md transition-all ${sourceTab === 'file' ? 'bg-white text-[#111] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Upload Documents</button>
                <button onClick={() => setSourceTab('text')} className={`flex-1 py-1.5 text-[12px] font-medium rounded-md transition-all ${sourceTab === 'text' ? 'bg-white text-[#111] shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Plain Text</button>
              </div>
              
              {sourceTab === 'website_crawl' && <WebsiteCrawlPanel datasetId={id as string} onAdded={source => { setSources(previous => [...previous, source]); setShowAddSource(false) }} />}
              {sourceTab === 'file' && <DocumentUploadPanel datasetId={id as string} onAdded={source => setSources(previous=>[...previous.filter(item=>item.id!==source.id),source])} />}
              {sourceTab === 'document_link' && <p className="text-[11px] text-gray-500 px-1">Extracts a single page (e.g. Google Doc, Notion, PDF link).</p>}
              
              {sourceTab === 'text' && (
                <input
                  value={sourceTitleInput}
                  onChange={e => setSourceTitleInput(e.target.value)}
                  placeholder="Headline / Title (e.g., Refund Policy)"
                  className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-gray-400"
                />
              )}
              
              {(sourceTab === 'text' || sourceTab === 'document_link') && <textarea
                value={sourceInput}
                onChange={e => setSourceInput(e.target.value)}
                placeholder={sourceTab === 'text' ? 'Paste your text content here…' : 'https://example.com/page'}
                rows={sourceTab === 'text' ? 5 : 1}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-gray-400 resize-none"
              />}
              {sourceError && <p className="text-[12px] text-red-500">{sourceError}</p>}
              <div className="flex gap-2">
                {(sourceTab === 'text' || sourceTab === 'document_link') && <button onClick={handleAddSource} disabled={addingSource || !sourceInput.trim()} className="flex items-center gap-1.5 px-4 py-2 bg-[#111] text-white text-[12px] font-medium rounded-xl hover:bg-black disabled:opacity-50 transition-colors">
                  {addingSource ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  {sourceTab === 'text' ? 'Add Text' : 'Import'}
                </button>}
                <button onClick={() => setShowAddSource(false)} className="px-4 py-2 text-[12px] text-gray-500 hover:text-gray-800 transition-colors">Cancel</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddSource(true)}
              className="w-full flex items-center justify-center gap-2 py-3 border border-dashed border-gray-200 rounded-xl text-[13px] text-gray-400 hover:border-gray-400 hover:text-gray-700 transition-all"
            >
              <Plus className="w-4 h-4" />Add Source
            </button>
          )}
        </div>
      )}

      {/* ── Tab: Content Preview ── */}
      {activeTab === 'preview' && (
        <div className="space-y-3">
          <input
            value={chunkSearch}
            onChange={e => setChunkSearch(e.target.value)}
            placeholder="Search chunks..."
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-gray-400 transition-all"
          />
          {filteredChunks.length === 0 ? (
            <div className="text-center py-10 text-gray-400 text-[13px]">
              {chunkSearch ? 'No chunks match your search.' : 'No content chunks yet. Add a source to generate chunks.'}
            </div>
          ) : filteredChunks.map(chunk => (
            <div
              key={chunk.id}
              onClick={() => setExpandedChunk(expandedChunk === chunk.id ? null : chunk.id)}
              className="bg-white border border-gray-100 rounded-xl px-4 py-3 cursor-pointer hover:border-gray-200 transition-all relative group"
            >
              {chunk.title && <h4 className="text-[13px] font-semibold text-gray-900 mb-1">{chunk.title}</h4>}
              <p className={`text-[12px] text-gray-700 ${expandedChunk === chunk.id ? '' : 'line-clamp-2'}`}>
                {chunk.content || chunk.text}
              </p>
              <div className="flex items-center justify-between mt-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400 uppercase bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">{chunk.source_type || 'text'}</span>
                  {chunk.source_url && (
                    <a href={chunk.source_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <Link2 className="w-3 h-3" /> Source
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => handleDeleteChunk(chunk.id, e)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-[11px] text-red-500 hover:text-red-700 flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                  <span className="text-[11px] text-gray-400 group-hover:text-gray-600 transition-colors">{expandedChunk === chunk.id ? 'Collapse ↑' : 'Expand ↓'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab: Bots ── */}
      {activeTab === 'bots' && (
        <div className="space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex gap-2">
            <select
              value={selectedBotId}
              onChange={e => setSelectedBotId(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-gray-400 transition-all bg-white"
            >
              <option value="">Select a bot to attach to this knowledge base...</option>
              {availableBots.filter(b => !bots.find(linked => linked.id === b.id)).map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            <button
              onClick={handleLinkBot}
              disabled={linkingBot || !selectedBotId}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-[#111] text-white text-[13px] font-medium rounded-xl hover:bg-black disabled:opacity-50 transition-colors shrink-0"
            >
              {linkingBot ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Attach Bot
            </button>
          </div>

          <div className="space-y-3 mt-4">
            {bots.length === 0 ? (
              <div className="text-center py-10 text-gray-400">
                <Bot className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                <p className="text-[13px]">This knowledge base isn't assigned to any bots yet.</p>
              </div>
            ) : bots.map(bot => (
              <div key={bot.id} className="flex items-center justify-between bg-white border border-gray-100 rounded-xl px-4 py-3 hover:border-gray-200 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#f3f4f6] flex items-center justify-center">
                    <Bot className="w-4 h-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-gray-800">{bot.name}</p>
                    <p className="text-[11px] text-gray-400 capitalize">{bot.purpose || 'support'}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleUnlinkBot(bot.id)}
                  className="text-[12px] text-gray-400 border border-gray-200 px-3 py-1 rounded-lg hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors"
                >
                  Unlink
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tab: Test Knowledge ── */}
      {activeTab === 'test' && (
        <div className="bg-white border border-gray-100 rounded-xl flex flex-col h-[500px] shadow-sm overflow-hidden">
          <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex justify-between items-center">
            <div>
              <h3 className="text-[13px] font-semibold text-gray-800">Test Knowledge Base</h3>
              <p className="text-[11px] text-gray-500">Ask questions to see how the AI uses this specific dataset.</p>
            </div>
            {testMessages.length > 0 && (
              <button onClick={() => setTestMessages([])} className="text-[11px] text-gray-500 hover:text-gray-800">Clear Chat</button>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
            {testMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400">
                <MessageSquare className="w-10 h-10 mb-3 text-gray-200" />
                <p className="text-[13px]">Send a message to test retrieval.</p>
              </div>
            ) : (
              testMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-[#111] text-white rounded-br-sm' 
                      : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))
            )}
            {testingBot && (
              <div className="flex justify-start">
                <div className="bg-white border border-gray-200 text-gray-400 rounded-2xl rounded-bl-sm px-4 py-2.5 text-[13px] shadow-sm flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" />
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{animationDelay: '150ms'}} />
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce" style={{animationDelay: '300ms'}} />
                </div>
              </div>
            )}
          </div>

          <form onSubmit={handleTestSubmit} className="border-t border-gray-100 p-3 bg-white flex gap-2">
            <input
              type="text"
              value={testInput}
              onChange={e => setTestInput(e.target.value)}
              placeholder="Ask a question..."
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 text-[13px] focus:outline-none focus:border-gray-400 transition-all"
            />
            <button
              type="submit"
              disabled={!testInput.trim() || testingBot}
              className="w-10 h-10 rounded-xl bg-[#111] text-white flex items-center justify-center hover:bg-black disabled:opacity-50 transition-colors"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      {/* ── Tab: Settings ── */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1.5">Name</label>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                maxLength={80}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-gray-400 transition-all"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1.5">Description</label>
              <textarea
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-gray-400 transition-all resize-none"
              />
            </div>
            <div>
              <label className="block text-[12px] font-medium text-gray-600 mb-1.5">Purpose</label>
              <select
                value={editPurpose}
                onChange={e => setEditPurpose(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-gray-400 transition-all"
              >
                {['general','support','sales','marketing','hr','campaign'].map(p => (
                  <option key={p} value={p} className="capitalize">{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveSettings}
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-[#111] text-white text-[13px] font-medium rounded-xl hover:bg-black disabled:opacity-50 transition-colors"
            >
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              Save Changes
            </button>
            {saveMsg && (
              <span className={`text-[12px] ${saveMsg === 'Saved!' ? 'text-green-600' : 'text-red-500'}`}>{saveMsg}</span>
            )}
          </div>

          {/* Danger zone */}
          <div className="border border-red-100 rounded-xl p-5 bg-red-50/30">
            <h3 className="text-[13px] font-semibold text-red-700 mb-1">Danger Zone</h3>
            <p className="text-[12px] text-red-500 mb-3">Deleting this knowledge base will remove all its content and unlink it from all bots. This cannot be undone.</p>
            <button
              onClick={handleDeleteDataset}
              className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 text-[13px] font-medium rounded-xl hover:bg-red-100 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />Delete Knowledge Base
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
