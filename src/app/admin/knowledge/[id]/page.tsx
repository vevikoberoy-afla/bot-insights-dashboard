'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'

interface Chunk {
  id: string
  title: string | null
  text: string
  source_url: string | null
  source_type: string
  created_at: string
  active: boolean
}

export default function DatasetChunksPage() {
  const params = useParams()
  const router = useRouter()
  const datasetId = params.id as string

  const [chunks, setChunks] = useState<Chunk[]>([])
  const [loading, setLoading] = useState(true)
  const [dataset, setDataset] = useState<any>(null)
  
  const [newTitle, setNewTitle] = useState('')
  const [newText, setNewText] = useState('')
  const [newUrls, setNewUrls] = useState('')
  const [adding, setAdding] = useState(false)
  const [crawling, setCrawling] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchDataset()
    fetchChunks()
  }, [datasetId])

  async function fetchDataset() {
    const res = await fetch(`/api/datasets?id=${datasetId}`)
    if (res.ok) {
      const data = await res.json()
      setDataset(data)
    }
  }

  async function fetchChunks() {
    setLoading(true)
    const res = await fetch(`/api/chunks?dataset_id=${datasetId}`)
    const data = await res.json()
    setChunks(data.chunks ?? [])
    setLoading(false)
  }

  function showMsg(type: 'success' | 'error', msg: string) {
    if (type === 'success') {
      setSuccess(msg)
      setError('')
      setTimeout(() => setSuccess(''), 3000)
    } else {
      setError(msg)
      setSuccess('')
      setTimeout(() => setError(''), 5000)
    }
  }

  async function handleAddText() {
    if (!newText.trim() || !newTitle.trim()) {
        showMsg('error', 'Title and text are required.')
        return
    }
    setAdding(true)
    try {
      const res = await fetch('/api/chunks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataset_id: datasetId, title: newTitle.trim(), text: newText.trim(), source_type: 'manual' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setNewTitle('')
      setNewText('')
      showMsg('success', 'Text added successfully!')
      fetchChunks()
    } catch (err: any) {
      showMsg('error', err.message || 'Failed to add')
    }
    setAdding(false)
  }

  async function handleCrawlUrls() {
    const urls = newUrls.split('\n').map(u => u.trim()).filter(u => u.length > 0)
    if (urls.length === 0) return
    
    setCrawling(true)
    let successCount = 0
    let failCount = 0
    
    for (const url of urls) {
      try {
        const res = await fetch('/api/crawl/client', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataset_id: datasetId, url }),
        })
        const data = await res.json()
        if (res.ok) {
            successCount++
        } else {
            failCount++
        }
      } catch (err: any) {
        failCount++
      }
    }
    
    setNewUrls('')
    showMsg(failCount === 0 ? 'success' : 'error', `Crawled ${successCount} URL(s). Failed: ${failCount}.`)
    fetchChunks()
    setCrawling(false)
  }

  async function handleDelete(chunkId: string) {
    if (!confirm('Delete this context item?')) return
    const res = await fetch(`/api/chunks?chunk_id=${chunkId}`, { method: 'DELETE' })
    if (res.ok) {
        setChunks(prev => prev.filter(c => c.id !== chunkId))
        showMsg('success', 'Chunk deleted.')
    } else {
        showMsg('error', 'Failed to delete chunk.')
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      const formData = new FormData()
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i])
      }
      formData.append('dataset_id', datasetId)
      const res = await fetch('/api/knowledge/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showMsg('success', `${files.length} file(s) uploaded — ${data.chunks_added} chunks added!`)
      fetchChunks()
    } catch (err: any) {
      showMsg('error', err.message || 'Upload failed')
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const sourceColor = (type: string) => {
    if (type === 'crawl') return 'text-purple-400 bg-purple-500/10 border-purple-500/20'
    if (type === 'manual') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    if (type === 'file' || type === 'upload') return 'text-blue-400 bg-blue-500/10 border-blue-500/20'
    return 'text-orange-400 bg-orange-500/10 border-orange-500/20'
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.push('/admin/knowledge')} className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            {dataset ? dataset.name : 'Loading Dataset...'}
          </h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">Manage individual text chunks for this knowledge base.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Add Knowledge */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-surface-secondary border border-[var(--border-subtle)] rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-white mb-2">Add Manual Text</h3>
            <p className="text-xs text-[var(--text-tertiary)] mb-4">Type FAQs, policies, or sudden changes directly.</p>
            <input
              required
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Chunk Title (e.g., Return Policy)"
              className="w-full bg-surface-tertiary border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-sm text-white placeholder-[var(--text-tertiary)] focus:outline-none focus:border-brand mb-3"
            />
            <textarea
              required
              value={newText}
              onChange={e => setNewText(e.target.value)}
              placeholder="e.g. We are having a 20% off sale this weekend!"
              rows={4}
              className="w-full bg-surface-tertiary border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-sm text-white placeholder-[var(--text-tertiary)] focus:outline-none focus:border-brand resize-none mb-3"
            />
            <button
              onClick={handleAddText}
              disabled={adding || !newText.trim() || !newTitle.trim()}
              className="w-full bg-brand hover:bg-brand-hover disabled:opacity-50 text-white font-medium py-2 rounded-xl transition-all text-sm"
            >
              {adding ? 'Saving...' : 'Add Text'}
            </button>
          </div>

          <div className="bg-surface-secondary border border-[var(--border-subtle)] rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-white mb-2">Upload File</h3>
            <p className="text-xs text-[var(--text-tertiary)] mb-4">Add PDF, TXT, or DOCX documents to this dataset.</p>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full flex flex-col items-center justify-center gap-2 border-2 border-dashed border-[var(--border-subtle)] hover:border-brand/50 hover:bg-brand/5 text-[var(--text-tertiary)] hover:text-white py-6 rounded-xl transition-all text-sm"
            >
              {uploading ? (
                <span className="flex items-center gap-2"><span className="w-4 h-4 rounded-full border-2 border-brand/30 border-t-brand animate-spin"></span> Uploading...</span>
              ) : (
                <>
                  <svg className="w-6 h-6 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <span>Click to browse files</span>
                </>
              )}
            </button>
          </div>

          <div className="bg-surface-secondary border border-[var(--border-subtle)] rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-white mb-2">Crawl URLs</h3>
            <p className="text-xs text-[var(--text-tertiary)] mb-4">Paste multiple URLs (one per line) to scrape data.</p>
            <textarea
              value={newUrls}
              onChange={e => setNewUrls(e.target.value)}
              placeholder="https://example.com/pricing&#10;https://example.com/about"
              rows={4}
              className="w-full bg-surface-tertiary border border-[var(--border-subtle)] rounded-xl px-3 py-2 text-sm text-white placeholder-[var(--text-tertiary)] focus:outline-none focus:border-brand resize-none mb-3"
            />
            <button
              onClick={handleCrawlUrls}
              disabled={crawling || !newUrls.trim()}
              className="w-full bg-brand hover:bg-brand-hover disabled:opacity-50 text-white font-medium py-2 rounded-xl transition-all text-sm flex items-center justify-center gap-2"
            >
              {crawling ? (
                  <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"></span> Crawling...</>
              ) : (
                  'Crawl Links'
              )}
            </button>
          </div>
        </div>

        {/* Right Column: List of Chunks */}
        <div className="md:col-span-2 space-y-4">
          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-emerald-400 text-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              {success}
            </div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 border-brand/20 border-t-brand animate-spin"></div>
            </div>
          ) : chunks.length === 0 ? (
            <div className="text-center py-16 bg-surface-secondary border border-[var(--border-subtle)] rounded-2xl">
              <p className="text-[var(--text-secondary)] font-medium mb-1">No chunks in this dataset</p>
              <p className="text-sm text-[var(--text-tertiary)]">Add some text or upload a file to get started.</p>
            </div>
          ) : (
            chunks.map(chunk => (
              <div key={chunk.id} className="group bg-surface-secondary border border-[var(--border-subtle)] hover:border-brand/30 rounded-2xl p-5 transition-all">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-md border ${sourceColor(chunk.source_type)}`}>
                    {chunk.source_type}
                  </span>
                  <button
                    onClick={() => handleDelete(chunk.id)}
                    className="opacity-0 group-hover:opacity-100 text-[var(--text-tertiary)] hover:text-red-400 text-xs font-medium transition-all"
                  >
                    Delete
                  </button>
                </div>
                {chunk.title && (
                  <h4 className="text-sm font-semibold text-white mb-2">{chunk.title}</h4>
                )}
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{chunk.text}</p>
                {chunk.source_url && (
                  <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                    <span className="text-xs text-[var(--text-tertiary)]">{chunk.source_url}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
