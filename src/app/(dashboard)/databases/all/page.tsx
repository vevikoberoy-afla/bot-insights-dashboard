'use client'
import { activeWorkspaceId } from '@/lib/client/workspace'
import { useState, useEffect, useMemo } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Database, Plus, Search, MoreVertical, Link2, FileJson, FileText, Bot, Webhook, Trash2
} from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

function SourceChip({ type, count }: { type: string, count: number }) {
  const getIcon = () => {
    switch (type) {
      case 'api': return <Webhook className="w-3 h-3" />
      case 'sheets': return <Link2 className="w-3 h-3" />
      case 'upload': return <FileText className="w-3 h-3" />
      case 'curl': return <FileJson className="w-3 h-3" />
      default: return <Database className="w-3 h-3" />
    }
  }

  const getLabel = () => {
    switch (type) {
      case 'api': return 'REST API'
      case 'sheets': return 'Google Sheets'
      case 'upload': return 'CSV'
      case 'curl': return 'cURL'
      default: return type
    }
  }

  return (
    <span className="flex items-center gap-1 bg-surface-muted text-ink-secondary text-[11px] px-2 py-0.5 rounded-md border border-surface-border">
      {getIcon()} {getLabel()} {count > 1 ? `×${count}` : ''}
    </span>
  )
}

export default function AllDatabasesPage() {
  const supabase = createClient()
  const router = useRouter()
  const [databases, setDatabases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dataTypeFilter, setDataTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  useEffect(() => {
    const handleGlobalClick = () => setOpenMenuId(null)
    window.addEventListener('click', handleGlobalClick)
    return () => window.removeEventListener('click', handleGlobalClick)
  }, [])

  async function load() {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return

    const res = await fetch(`/api/databases?client_id=${activeWorkspaceId(user.id || '')}`)
    const data = await res.json()
    setDatabases(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    let list = [...databases]
    if (dataTypeFilter !== 'All') list = list.filter(d => (d.data_type || 'custom').toLowerCase() === dataTypeFilter.toLowerCase())
    if (statusFilter !== 'All') list = list.filter(d => (d.status || 'draft').toLowerCase() === statusFilter.toLowerCase())
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(d => d.name?.toLowerCase().includes(q) || d.purpose?.toLowerCase().includes(q))
    }
    return list
  }, [databases, dataTypeFilter, statusFilter, search])

  async function handleAddDatabase() {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return

    const res = await fetch('/api/databases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: activeWorkspaceId(user.id || ''),
        name: 'Untitled Database',
      })
    })

    if (res.ok) {
      const db = await res.json()
      router.push(`/databases/${db.id}`)
    } else {
      alert('Failed to create database')
    }
  }

  async function handleDeleteDatabase(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this database? This will permanently remove all associated configurations.')) {
      return
    }

    const res = await fetch(`/api/databases/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setDatabases(prev => prev.filter(db => db.id !== id))
    } else {
      const data = await res.json()
      if (data.warning) {
        if (confirm(data.message)) {
          const forceRes = await fetch(`/api/databases/${id}?force=true`, { method: 'DELETE' })
          if (forceRes.ok) {
            setDatabases(prev => prev.filter(db => db.id !== id))
          } else {
            alert('Failed to delete database')
          }
        }
      } else {
        alert(data.error || 'Failed to delete database')
      }
    }
  }

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 pb-12 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-[24px] font-semibold text-[#111] tracking-tight">Databases</h1>
          <p className="text-[13px] text-[#6b7280] mt-1 max-w-2xl">
            Live data sources your bots query in real time — orders, inventory, customer records.
          </p>
        </div>
        <Button onClick={handleAddDatabase} className="bg-ink hover:bg-ink-secondary text-white shadow-sm">
          <Plus className="w-4 h-4 mr-2" /> Add Database
        </Button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <Input 
            placeholder="Search databases..." 
            className="pl-9 bg-surface border-surface-border text-sm"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select 
          value={dataTypeFilter} 
          onChange={e => setDataTypeFilter(e.target.value)}
          className="px-3 py-2 bg-surface border border-surface-border rounded-md text-[13px] text-ink focus:border-accent focus:outline-none h-10"
        >
          {['All','Order Tracking','Product Catalog','Customer Records','Inventory','Custom'].map(t => (
            <option key={t} value={t === 'Order Tracking' ? 'orders' : t === 'Product Catalog' ? 'products' : t === 'Customer Records' ? 'customers' : t === 'Inventory' ? 'inventory' : t === 'Custom' ? 'custom' : 'All'}>{t}</option>
          ))}
        </select>
        <select 
          value={statusFilter} 
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-surface border border-surface-border rounded-md text-[13px] text-ink focus:border-accent focus:outline-none h-10"
        >
          {['All', 'Connected', 'Partial', 'Error', 'Draft'].map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-5 h-5 rounded-full border-2 border-ink border-t-transparent animate-spin" />
        </div>
      ) : databases.length === 0 && !search && dataTypeFilter === 'All' && statusFilter === 'All' ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-surface-muted flex items-center justify-center mb-6">
            <Database className="w-8 h-8 text-ink-muted" />
          </div>
          <h3 className="text-lg font-medium text-ink">No databases connected</h3>
          <p className="text-sm text-ink-secondary mt-2 mb-6 max-w-sm">
            Connect your order system, spreadsheets, or APIs so your bots can look up live data for customers.
          </p>
          <Button onClick={handleAddDatabase} className="bg-ink hover:bg-ink-secondary text-white">
            <Plus className="w-4 h-4 mr-2" /> Add Your First Database
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-ink-muted text-[13px]">
          No databases match your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {filtered.map(db => {
            const isConnected = db.status === 'connected'
            const isPartial = db.status === 'partial'
            const isError = db.status === 'error'
            const isDraft = db.status === 'draft' || !db.status

            // Group sources by type
            const sources = db.database_sources || []
            const typeCounts: Record<string, number> = {}
            sources.forEach((s: any) => { typeCounts[s.source_type] = (typeCounts[s.source_type] || 0) + 1 })

            return (
              <div key={db.id} className="group relative bg-surface border border-surface-border rounded-xl p-5 hover:border-ink/20 hover:shadow-sm transition-all flex flex-col justify-between cursor-pointer min-h-[160px]" onClick={() => router.push(`/databases/${db.id}`)}>
                <div>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-ink" />
                      <h3 className="text-[15px] font-semibold text-ink group-hover:text-accent transition-colors">{db.name}</h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isConnected && <span className="flex items-center gap-1.5 text-[11px] text-green-700 font-medium bg-green-50 px-2 py-0.5 rounded-full"><div className="w-1.5 h-1.5 rounded-full bg-green-500" />Connected</span>}
                      {isPartial && <span className="flex items-center gap-1.5 text-[11px] text-amber-700 font-medium bg-amber-50 px-2 py-0.5 rounded-full"><div className="w-1.5 h-1.5 rounded-full bg-amber-500" />Partial</span>}
                      {isError && <span className="flex items-center gap-1.5 text-[11px] text-red-700 font-medium bg-red-50 px-2 py-0.5 rounded-full"><div className="w-1.5 h-1.5 rounded-full bg-red-500" />Error</span>}
                      {isDraft && <span className="flex items-center gap-1.5 text-[11px] text-gray-600 font-medium bg-gray-100 px-2 py-0.5 rounded-full"><div className="w-1.5 h-1.5 rounded-full bg-gray-400" />Draft</span>}
                      
                      {/* Menu */}
                      <div className="relative">
                        <button 
                          className="w-6 h-6 flex items-center justify-center rounded hover:bg-surface-subtle opacity-0 group-hover:opacity-100 transition-opacity ml-1" 
                          onClick={e => { 
                            e.stopPropagation()
                            setOpenMenuId(openMenuId === db.id ? null : db.id)
                          }}
                        >
                          <MoreVertical className="w-3.5 h-3.5 text-ink-muted" />
                        </button>
                        
                        {openMenuId === db.id && (
                          <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-surface-border rounded-lg shadow-lg py-1 z-10 animate-in fade-in zoom-in-95 duration-100">
                            <button 
                              onClick={(e) => {
                                setOpenMenuId(null)
                                handleDeleteDatabase(db.id, e)
                              }}
                              className="w-full text-left px-3 py-1.5 text-[13px] text-red-600 hover:bg-red-50 flex items-center gap-2"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-[12px] text-ink-secondary mb-4 line-clamp-2 min-h-[36px]">
                    {db.purpose || 'No description provided.'}
                  </p>

                  {/* Chips */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="text-[10px] font-bold tracking-wider text-accent uppercase bg-accent/10 px-2 py-0.5 rounded">{db.data_type || 'custom'}</span>
                    <span className="text-[11px] text-ink-muted ml-1 flex items-center">{sources.length} sources</span>
                    {Object.entries(typeCounts).map(([type, count]) => (
                      <SourceChip key={type} type={type} count={count} />
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-surface-border">
                  <span className="text-[11px] text-ink-muted flex items-center gap-1">
                    <Bot className="w-3 h-3" /> Used by {db.bots_count || 0} bots
                  </span>
                  <span className="text-[11px] text-ink-muted">
                    Created {new Date(db.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
