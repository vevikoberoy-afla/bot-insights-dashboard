'use client'
import { useEffect, useState } from 'react'
import { activeWorkspaceId } from '@/lib/client/workspace'
import type { CrawlMode, CrawlPolicy } from '@/lib/knowledgeCrawlPolicy'

export function WebsiteCrawlPanel({ datasetId, onAdded }: { datasetId: string; onAdded: (source: any) => void }) {
  const [policy, setPolicy] = useState<CrawlPolicy | null>(null)
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<CrawlMode>('single')
  const [pages, setPages] = useState<string[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const headers = () => ({ 'Content-Type': 'application/json', 'X-Workspace-Id': activeWorkspaceId('') })
  useEffect(() => {
    let active = true
    fetch(`/api/datasets/${datasetId}/sources?crawl_policy=1`, { headers: headers() }).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not load website import settings')
      if (active) setPolicy(data)
    }).catch(error => { if (active) setError(error.message) })
    return () => { active = false }
  }, [datasetId])

  async function submit(discover = false) {
    if (busy) return
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/datasets/${datasetId}/sources`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ source_type: 'website_crawl', source_ref: url.trim(), mode, selected_urls: selected, ...(discover ? { action: 'discover' } : {}) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Website import failed')
      if (discover) { setPages(data.pages || []); setSelected([]) }
      else { onAdded(data.source); setPages([]); setSelected([]); setUrl('') }
    } catch (error) { setError(error instanceof Error ? error.message : 'Website import failed') }
    finally { setBusy(false) }
  }
  const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-100'
  return <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
    <div><h3 className="text-[13px] font-semibold text-gray-900">Import website pages</h3><p className="mt-1 text-[12px] text-gray-500">Choose the pages your bot should learn from.</p></div>
    <label className="block space-y-1 text-[12px] text-gray-600"><span>Website address</span><input type="url" value={url} onChange={event => { setUrl(event.target.value); setPages([]); setSelected([]) }} placeholder="https://yourwebsite.com" className={inputClass} /></label>
    {policy && <label className="block space-y-1 text-[12px] text-gray-600"><span>What to import</span><select value={mode} disabled={busy} onChange={event => { setMode(event.target.value as CrawlMode); setPages([]); setSelected([]) }} className={inputClass}>
      <option value="single">Only this page</option>
      {policy.modes.includes('selected') && <option value="selected">Find pages and choose what to import</option>}
      {policy.modes.includes('deep') && <option value="deep">Website pages automatically</option>}
    </select></label>}
    {policy && <p className="text-[11px] text-gray-500">{mode === 'single' ? 'Imports the exact page only.' : mode === 'deep' ? `Reserves up to ${policy.maxPages} pages from your allowance.` : `Select up to ${policy.maxPages} pages per import.`} {policy.monthlyPages} website pages allowed per billing cycle.</p>}
    {policy?.configured === false && <p className="text-[12px] text-amber-700">Website import is awaiting administrator setup.</p>}
    {mode === 'selected' && pages.length > 0 && <div className="space-y-2">
      <input aria-label="Filter website pages" placeholder="Filter pages…" value={filter} onChange={event => setFilter(event.target.value)} className={inputClass} />
      <p className="text-[12px] text-gray-600">{selected.length} selected · {pages.length} pages found</p>
      <div className="max-h-52 space-y-1 overflow-y-auto rounded-xl border border-gray-100 p-2">
        {pages.filter(page => page.toLowerCase().includes(filter.toLowerCase())).map(page => <label key={page} className="flex items-start gap-2 rounded-lg p-2 text-[12px] text-gray-700 hover:bg-gray-50">
          <input type="checkbox" checked={selected.includes(page)} disabled={busy || (!selected.includes(page) && selected.length >= (policy?.maxPages || 1))} onChange={event => setSelected(previous => event.target.checked ? [...previous, page] : previous.filter(value => value !== page))} />
          <span className="break-all">{page}</span>
        </label>)}
      </div>
    </div>}
    {error && <p role="alert" className="text-[12px] text-red-600">{error}</p>}
    <div className="flex flex-wrap gap-2">
      {mode === 'selected' && <button type="button" disabled={busy || !url.trim() || !policy?.configured} onClick={() => submit(true)} className="rounded-xl border border-gray-200 px-4 py-2 text-[12px] font-medium text-gray-800 disabled:opacity-40">{busy ? 'Working…' : 'Find pages'}</button>}
      <button type="button" disabled={busy || !policy?.configured || !url.trim() || (mode === 'selected' && !selected.length)} onClick={() => submit()} className="rounded-xl bg-gray-900 px-4 py-2 text-[12px] font-medium text-white disabled:opacity-40">{busy ? 'Working…' : mode === 'selected' ? `Import selected pages (${selected.length})` : mode === 'deep' ? 'Import website' : 'Import this page'}</button>
    </div>
  </section>
}
