'use client'
import { activeWorkspaceId } from '@/lib/client/workspace'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'

// IMPORTANT: Import your custom UI components here. Adjust paths as needed.
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import {
  ArrowLeft, Plus, Database, CheckCircle, RefreshCw, AlertTriangle,
  Trash2, ChevronDown, ChevronRight, Webhook, Link2, FileText, FileJson, Search, Save
} from 'lucide-react'

// Icon helper
function SourceIcon({ type, className }: { type: string, className?: string }) {
  if (type === 'api') return <Webhook className={className} />
  if (type === 'sheets') return <Link2 className={className} />
  if (type === 'upload') return <FileText className={className} />
  if (type === 'curl') return <FileJson className={className} />
  return <Database className={className} />
}

const ORDER_MAPPING_FIELDS = [
  { key: 'order_number', label: 'Order ID', required: true },
  { key: 'customer_email', label: 'Customer email', identity: true },
  { key: 'customer_phone', label: 'Customer phone', identity: true },
  { key: 'customer_name', label: 'Customer name' },
  { key: 'status', label: 'Order status' },
  { key: 'fulfillment_status', label: 'Delivery status' },
  { key: 'placed_at', label: 'Order date' },
  { key: 'delivered_at', label: 'Delivery date' },
  { key: 'item_name', label: 'Item name' },
  { key: 'item_sku', label: 'Item SKU' },
  { key: 'item_quantity', label: 'Quantity' },
  { key: 'item_price', label: 'Unit price' },
  { key: 'total_amount', label: 'Order total' },
  { key: 'currency', label: 'Currency' },
]

export default function DatabaseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string
  const supabase = createClient()

  const [db, setDb] = useState<any>(null)
  const [sources, setSources] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // General Info
  const [name, setName] = useState('')
  const [purpose, setPurpose] = useState('')
  const [dataType, setDataType] = useState('custom')
  const [lookupField, setLookupField] = useState('id')
  const [savingGeneral, setSavingGeneral] = useState(false)

  // Add Source UI
  const [showAddSource, setShowAddSource] = useState(false)
  const [addSourceType, setAddSourceType] = useState('api')
  const [newSourceName, setNewSourceName] = useState('')
  const [addingSource, setAddingSource] = useState(false)

  // Preview & Mapping
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, any>>({}) // sourceId -> data
  const [testingSource, setTestingSource] = useState<string | null>(null)
  const [activePreviewTab, setActivePreviewTab] = useState<string | null>(null)

  // Lookup Test
  const [testLookupValue, setTestLookupValue] = useState('')
  const [testingLookup, setTestingLookup] = useState(false)
  const [lookupResult, setLookupResult] = useState<any>(null)

  useEffect(() => {
    if (!id) return

    async function load() {
      try {
        const { data: userData, error: authError } = await supabase.auth.getUser()
        if (authError) throw authError
        const userId = activeWorkspaceId(userData.user?.id || '')

        if (!userId && !id.startsWith('mock-db-')) {
          setLoading(false)
          return
        }

        const res = await fetch(`/api/databases?client_id=${userId}`)
        if (!res.ok) throw new Error('Failed to fetch databases')

        const data = await res.json()
        let currentDb = Array.isArray(data) ? data.find((d: any) => d.id === id) : null

        // If we are testing the UI with a mocked db id
        if (!currentDb && id.startsWith('mock-db-')) {
          currentDb = {
            id,
            name: 'Untitled Database',
            purpose: '',
            data_type: 'custom',
            lookup_field: 'id',
            database_sources: []
          }
        }

        if (currentDb) {
          setDb(currentDb)
          setName(currentDb.name || '')
          setPurpose(currentDb.purpose || '')
          setDataType(currentDb.data_type || 'custom')
          setLookupField(currentDb.lookup_field || 'id')
          setSources(currentDb.database_sources || [])
          if (currentDb.database_sources?.length > 0) {
            setActivePreviewTab(currentDb.database_sources[0].id)
          }
        }
      } catch (error) {
        console.error("Error loading database:", error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, supabase.auth])

  async function handleSaveGeneral() {
    setSavingGeneral(true)
    try {
      await fetch(`/api/databases/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, purpose, data_type: dataType, lookup_field: lookupField })
      })
    } catch (error) {
      console.error("Failed to save changes", error)
    } finally {
      setSavingGeneral(false)
    }
  }

  async function handleAddSource() {
    if (!newSourceName.trim()) return
    setAddingSource(true)
    try {
      const res = await fetch(`/api/databases/${id}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_type: addSourceType, source_name: newSourceName })
      })
      if (res.ok) {
        const newSource = await res.json()
        setSources(prev => [...prev, newSource])
        setExpandedSourceId(newSource.id)
        setActivePreviewTab(newSource.id)
        setNewSourceName('')
        setShowAddSource(false)
      } else {
        alert('Failed to add source')
      }
    } catch (error) {
      console.error(error)
      alert('Failed to add source')
    } finally {
      setAddingSource(false)
    }
  }

  async function handleDeleteSource(sourceId: string) {
    if (!confirm('Remove this source?')) return
    try {
      await fetch(`/api/databases/${id}/sources/${sourceId}`, { method: 'DELETE' })
      setSources(prev => prev.filter(s => s.id !== sourceId))
      if (activePreviewTab === sourceId) setActivePreviewTab(null)
    } catch (error) {
      console.error("Error deleting source", error)
    }
  }

  async function handleUpdateSource(sourceId: string, updates: any) {
    setSources(prev => prev.map(s => s.id === sourceId ? { ...s, ...updates } : s))
    try {
      await fetch(`/api/databases/${id}/sources/${sourceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })
    } catch (error) {
      console.error("Error updating source", error)
    }
  }

  async function handleTestConnection(sourceId: string) {
    setTestingSource(sourceId)
    try {
      const res = await fetch(`/api/databases/${id}/sources/${sourceId}/test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lookup_value: testLookupValue.trim() || null })
      })
      const data = await res.json()

      if (res.ok) {
        setTestResults(prev => ({ ...prev, [sourceId]: data }))
        handleUpdateSource(sourceId, { status: 'connected', row_count: data.row_count, error_msg: null })
        setActivePreviewTab(sourceId)
      } else {
        handleUpdateSource(sourceId, { status: 'error', error_msg: data.error })
      }
    } catch (error) {
      handleUpdateSource(sourceId, { status: 'error', error_msg: 'Network or server error' })
    } finally {
      setTestingSource(null)
    }
  }

  async function handleTestLookup() {
    if (!testLookupValue.trim()) return
    setTestingLookup(true)
    setLookupResult(null)
    try {
      const res = await fetch(`/api/databases/${id}/query?lookup_value=${encodeURIComponent(testLookupValue)}`)
      const data = await res.json()
      setLookupResult(data)
    } catch (error) {
      console.error("Error testing lookup", error)
    } finally {
      setTestingLookup(false)
    }
  }

  if (loading) return <div className="p-20 text-center"><div className="w-5 h-5 rounded-full border-2 border-ink border-t-transparent animate-spin mx-auto" /></div>
  if (!db) return <div className="p-20 text-center text-ink-muted">Database not found.</div>

  const isConnected = sources.some(s => s.status === 'connected')

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 pb-20 max-w-7xl mx-auto px-4">
      {/* Header */}
      <div className="mb-6">
        <Link href="/databases/all" className="flex items-center gap-1 text-[12px] text-ink-muted hover:text-ink transition-colors mb-3">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Databases
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-[22px] font-semibold text-ink tracking-tight">{name || 'Untitled Database'}</h1>
          <button onClick={handleSaveGeneral} disabled={savingGeneral} className="flex items-center bg-ink hover:bg-ink-secondary text-white shadow-sm h-9 px-4 rounded text-[13px]">
            {savingGeneral ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Save Changes
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* LEFT COLUMN (65%) */}
        <div className="flex-1 w-full space-y-6">

          {/* General Information */}
          <div className="bg-surface border border-surface-border rounded-xl p-6 shadow-sm">
            <h2 className="text-[11px] font-bold text-ink-muted uppercase tracking-widest mb-5">General Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-[13px] font-medium text-ink mb-1.5">Database Name</label>
                <Input value={name} onChange={e => setName(e.target.value)} className="bg-white border-surface-border" />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-ink mb-1.5">Purpose</label>
                <textarea
                  value={purpose} onChange={e => setPurpose(e.target.value)}
                  rows={2} placeholder="E.g., Contains order statuses and shipping details."
                  className="w-full bg-white border border-surface-border rounded-lg p-3 text-[13px] resize-none focus:outline-none focus:border-accent"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-medium text-ink mb-1.5">Data Type</label>
                  <select value={dataType} onChange={e => setDataType(e.target.value)} className="w-full bg-white border border-surface-border rounded-lg p-2.5 text-[13px] focus:outline-none focus:border-accent">
                    <option value="orders">Order Tracking</option>
                    <option value="products">Product Catalog</option>
                    <option value="customers">Customer Records</option>
                    <option value="inventory">Inventory</option>
                    <option value="custom">Custom Data</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-ink mb-1.5">Lookup Field</label>
                  <Input value={lookupField} onChange={e => setLookupField(e.target.value)} className="bg-white border-surface-border" placeholder="e.g. order_id" />
                  <p className="text-[11px] text-ink-muted mt-1">The field customers use to search.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Connection Sources */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-[11px] font-bold text-ink-muted uppercase tracking-widest">Connection Sources</h2>
                <p className="text-[12px] text-ink-secondary mt-0.5">Add multiple sources. Bot searches them in order.</p>
              </div>
              {!showAddSource && (
                <Button variant="outline" size="sm" onClick={() => setShowAddSource(true)} className="flex items-center h-8 text-[12px]">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Source
                </Button>
              )}
            </div>

            <div className="space-y-3">
              {sources.map((source, index) => {
                const isExpanded = expandedSourceId === source.id
                const isTested = source.status === 'connected'
                const isTesting = testingSource === source.id

                return (
                  <div key={source.id} className="bg-surface border border-surface-border rounded-xl overflow-hidden shadow-sm transition-all">
                    {/* Source Header */}
                    <div
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-subtle"
                      onClick={() => setExpandedSourceId(isExpanded ? null : source.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className="text-ink-muted">{isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</div>
                        <SourceIcon type={source.source_type} className="w-4 h-4 text-accent" />
                        <span className="text-[14px] font-semibold text-ink">{source.source_name}</span>
                        {source.status === 'connected' && <span className="flex items-center gap-1 text-[11px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full"><div className="w-1.5 h-1.5 bg-green-500 rounded-full" />Connected</span>}
                        {source.status === 'error' && <span className="flex items-center gap-1 text-[11px] text-red-600 bg-red-50 px-2 py-0.5 rounded-full"><div className="w-1.5 h-1.5 bg-red-500 rounded-full" />Error</span>}
                        {source.status === 'pending' && <span className="flex items-center gap-1 text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full"><div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />Pending test</span>}
                      </div>
                      <div className="flex items-center gap-4 text-[12px] text-ink-muted">
                        {isTested && <span>{source.row_count?.toLocaleString()} rows</span>}
                        <div className="flex items-center gap-2">
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteSource(source.id); }} className="p-1 hover:text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    </div>

                    {/* Source Expanded Body */}
                    {isExpanded && (
                      <div className="p-5 border-t border-surface-border bg-white space-y-5">
                        {(source.source_type === 'api' || source.source_type === 'curl') && (
                          <div className="space-y-4">
                            <div className="flex gap-3">
                              <select
                                value={source.http_method || 'GET'}
                                onChange={e => handleUpdateSource(source.id, { http_method: e.target.value })}
                                className="w-24 border border-surface-border rounded-lg text-[13px] px-2 focus:border-accent focus:outline-none"
                              >
                                <option>GET</option><option>POST</option>
                              </select>
                              <Input
                                placeholder="https://api.example.com/v1/orders"
                                value={source.endpoint_url || ''}
                                onChange={e => handleUpdateSource(source.id, { endpoint_url: e.target.value })}
                                className="flex-1"
                              />
                            </div>
                            <Input
                              placeholder="Authorization Header (e.g., Bearer token)"
                              value={source.auth_header || ''}
                              onChange={e => handleUpdateSource(source.id, { auth_header: e.target.value })}
                            />
                            {(source.http_method || 'GET') === 'POST' && <textarea
                              placeholder={'JSON request body, e.g. {"order_id":"{{identifier}}"}'}
                              value={source.request_body || ''}
                              onChange={e => handleUpdateSource(source.id, { request_body: e.target.value })}
                              className="w-full min-h-20 border border-surface-border rounded-lg p-3 text-xs font-mono resize-y focus:outline-none focus:border-accent"
                            />}
                            <p className="text-[11px] text-ink-muted">For GET requests, the lookup field is added as a query parameter. URL and JSON templates may use <code>{'{{identifier}}'}</code>.</p>
                          </div>
                        )}
                        {source.source_type === 'sheets' && (
                          <div className="space-y-3">
                            <Input
                              placeholder="Google Sheet URL (must be viewable by anyone with link)"
                              value={source.sheet_url || ''}
                              onChange={e => handleUpdateSource(source.id, { sheet_url: e.target.value })}
                            />
                            <Input
                              placeholder="Tab Name (optional, defaults to first tab)"
                              value={source.sheet_tab || ''}
                              onChange={e => handleUpdateSource(source.id, { sheet_tab: e.target.value })}
                            />
                          </div>
                        )}
                        {source.source_type === 'upload' && (
                          <div className="space-y-3">
                            <Input placeholder="HTTPS URL to a CSV file" value={source.endpoint_url || ''}
                              onChange={e => handleUpdateSource(source.id, { endpoint_url: e.target.value })} />
                            <p className="text-[11px] text-ink-muted">Use a stable, access-controlled export URL. Responses are limited to 2 MB.</p>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2">
                          <div><p className="text-[11px] text-ink-muted">
                            {source.last_tested_at ? `Last tested: ${new Date(source.last_tested_at).toLocaleString()}` : 'Never tested'}
                          </p>{(source.source_type === 'api' || source.source_type === 'curl') && <p className="text-[10px] text-ink-muted mt-1">If the API requires an ID, enter a sample in “Test a Lookup” before testing.</p>}</div>
                          <Button
                            onClick={() => handleTestConnection(source.id)}
                            disabled={isTesting}
                            size="sm"
                            className="flex items-center bg-accent hover:bg-accent-hover text-white h-8 text-[12px]"
                          >
                            {isTesting && <RefreshCw className="w-3 h-3 mr-2 animate-spin" />}
                            {isTesting ? 'Testing...' : 'Test Connection'}
                          </Button>
                        </div>

                        {/* Field Mapping appears after test */}
                        {isTested && (
                          <div className="mt-6 pt-5 border-t border-surface-border">
                            <h4 className="text-[12px] font-semibold text-ink uppercase tracking-wider mb-1">Order field mapping</h4>
                            <p className="text-[12px] text-ink-muted mb-4">Map standard ticket fields to the exact column or JSON path returned by this source.</p>
                            {(() => {
                              const detectedFields = testResults[source.id]?.detected_fields || []
                              const mapping = source.field_mapping || {}
                              const hasOrderId = !!mapping.order_number || detectedFields.some((field: string) => /^(order[_ ]?(id|number|no)|id)$/i.test(field))
                              const hasIdentity = !!mapping.customer_email || !!mapping.customer_phone || detectedFields.some((field: string) => /(email|phone|mobile)/i.test(field))
                              return <>
                                <div className={`mb-4 rounded-lg border p-3 text-[11px] ${hasOrderId && hasIdentity ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                                  {hasOrderId && hasIdentity ? 'Ready for verified ticket flows: order ID and customer identity fields are available.' : 'Verified returns require an Order ID plus either Customer email or Customer phone.'}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  {ORDER_MAPPING_FIELDS.map(field => <div key={field.key}>
                                    <label className="text-[11px] text-ink-muted mb-1 block">{field.label}{field.required ? ' *' : field.identity ? ' (verification)' : ''}</label>
                                    {detectedFields.length ? <select value={mapping[field.key] || ''}
                                      onChange={e => handleUpdateSource(source.id, { field_mapping: { ...mapping, [field.key]: e.target.value } })}
                                      className="w-full border border-surface-border rounded-md px-3 py-2 text-[12px] bg-white">
                                      <option value="">Auto-detect / not mapped</option>
                                      {detectedFields.map((name: string) => <option key={name} value={name}>{name}</option>)}
                                    </select> : <Input value={mapping[field.key] || ''} placeholder="Column or JSON path"
                                      onChange={e => setSources(prev => prev.map(item => item.id === source.id ? { ...item, field_mapping: { ...mapping, [field.key]: e.target.value } } : item))}
                                      onBlur={e => handleUpdateSource(source.id, { field_mapping: { ...mapping, [field.key]: e.target.value } })}
                                      className="h-9 text-xs" />}
                                  </div>)}
                                </div>
                              </>
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* Add Source Form */}
              {showAddSource && (
                <div className="bg-surface border border-surface-border rounded-xl p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[14px] font-semibold text-ink">Add New Source</h3>
                    <button onClick={() => setShowAddSource(false)} className="text-[12px] text-ink-muted hover:text-ink">Cancel</button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-[12px] font-medium text-ink mb-1.5 block">Source Name</label>
                      <Input value={newSourceName} onChange={e => setNewSourceName(e.target.value)} placeholder="E.g., Live Shopify API" autoFocus />
                    </div>
                    <div>
                      <label className="text-[12px] font-medium text-ink mb-1.5 block">Source Type</label>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { id: 'api', icon: Webhook, label: 'REST API' },
                          { id: 'sheets', icon: Link2, label: 'Google Sheets' },
                          { id: 'upload', icon: FileText, label: 'Upload CSV' },
                          { id: 'curl', icon: FileJson, label: 'Custom cURL' }
                        ].map(type => (
                          <button
                            key={type.id}
                            type="button"
                            onClick={() => setAddSourceType(type.id)}
                            className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border text-[11px] font-medium transition-all ${addSourceType === type.id ? 'border-accent bg-accent/5 text-accent' : 'border-surface-border bg-white text-ink-secondary hover:border-ink/20'
                              }`}
                          >
                            <type.icon className="w-4 h-4" /> {type.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <Button onClick={handleAddSource} disabled={!newSourceName.trim() || addingSource} className="flex items-center justify-center w-full bg-ink hover:bg-ink-secondary text-white">
                      {addingSource && <RefreshCw className="w-4 h-4 mr-2 animate-spin" />}
                      Create Source
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (35%) - STICKY */}
        <div className="w-full lg:w-[35%] lg:sticky lg:top-6 space-y-5">

          {/* Preview Panel */}
          <div className="bg-surface border border-surface-border rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-surface-border bg-surface-muted/50 flex items-center gap-2">
              <Database className="w-4 h-4 text-ink-muted" />
              <h3 className="text-[13px] font-semibold text-ink uppercase tracking-widest">Data Preview</h3>
            </div>

            <div className="p-0 max-h-[300px] overflow-auto bg-white min-h-[150px]">
              {!isConnected ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-8">
                  <Database className="w-8 h-8 text-surface-border mb-3" />
                  <p className="text-[13px] font-medium text-ink-muted mb-1">No connection established.</p>
                  <p className="text-[11px] text-ink-secondary">Enter connection details and click Test Connection on a source to preview data.</p>
                </div>
              ) : (
                <>
                  {/* Source Tabs for Preview */}
                  {sources.filter(s => s.status === 'connected').length > 1 && (
                    <div className="flex border-b border-surface-border bg-surface-muted/30 overflow-x-auto">
                      {sources.filter(s => s.status === 'connected').map(s => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setActivePreviewTab(s.id)}
                          className={`px-4 py-2 text-[11px] font-medium whitespace-nowrap transition-colors ${activePreviewTab === s.id ? 'border-b-2 border-accent text-ink bg-white' : 'text-ink-muted hover:bg-surface-subtle border-b-2 border-transparent'}`}
                        >
                          {s.source_name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-surface-border bg-surface/50">
                          {activePreviewTab && testResults[activePreviewTab]?.preview_rows?.[0] && Object.keys(testResults[activePreviewTab].preview_rows[0]).map(k => (
                            <th key={k} className="px-4 py-2.5 text-[10px] font-bold text-ink-muted uppercase tracking-wider whitespace-nowrap">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {activePreviewTab && testResults[activePreviewTab]?.preview_rows?.map((row: any, i: number) => (
                          <tr key={i} className="border-b border-surface-border last:border-0 hover:bg-surface-subtle transition-colors">
                            {row && Object.values(row).map((v: any, j: number) => (
                              <td key={j} className="px-4 py-2 text-[12px] text-ink-secondary whitespace-nowrap">
                                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2 bg-surface-muted/30 border-t border-surface-border text-[10px] text-ink-muted">
                    Showing preview rows · {activePreviewTab && sources.find(s => s.id === activePreviewTab)?.row_count?.toLocaleString()} total rows
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Test Lookup Panel */}
          <div className="bg-surface border border-surface-border rounded-xl p-5 shadow-sm">
            <h3 className="text-[12px] font-bold text-ink-muted uppercase tracking-widest mb-3">Test a Lookup</h3>
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
                <Input
                  value={testLookupValue}
                  onChange={e => setTestLookupValue(e.target.value)}
                  placeholder={`Enter a ${lookupField || 'ID'}...`}
                  className="pl-9 h-9 text-[13px]"
                  onKeyDown={e => e.key === 'Enter' && handleTestLookup()}
                />
              </div>
              <Button onClick={handleTestLookup} disabled={!testLookupValue || testingLookup || !isConnected} className="flex items-center h-9 bg-ink hover:bg-ink-secondary text-white px-4">
                {testingLookup ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Look up'}
              </Button>
            </div>

            {/* Result */}
            {lookupResult && (
              <div className="border border-surface-border rounded-lg bg-white overflow-hidden text-[12px]">
                {lookupResult.found ? (
                  <>
                    <div className="px-3 py-2 bg-green-50 border-b border-green-100 flex items-center gap-1.5 text-green-700 font-medium">
                      <CheckCircle className="w-3.5 h-3.5" /> Match found in "{lookupResult.source_name}"
                    </div>
                    <div className="p-3 grid grid-cols-[100px_1fr] gap-y-2 gap-x-4">
                      {Object.entries(lookupResult.data).map(([k, v]) => (
                        <div key={k} className="contents">
                          <span className="text-ink-muted font-medium">{k}:</span>
                          <span className="text-ink truncate">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="px-3 py-4 text-center text-ink-muted">
                    <AlertTriangle className="w-5 h-5 mx-auto mb-2 text-amber-500" />
                    No match found across all sources for '{testLookupValue}'
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
