'use client'
import { useState } from 'react'
import Link from 'next/link'
import { RefreshCw, MoreVertical, Bot, Trash2, FileText, CheckSquare, Square } from 'lucide-react'

const CATEGORY_COLORS: Record<string, string> = {
  general:   'bg-[#f3f4f6] text-[#374151]',
  sales:     'bg-[#eff6ff] text-[#1d4ed8]',
  marketing: 'bg-[#f5f3ff] text-[#6d28d9]',
  support:   'bg-[#f0fdf4] text-[#166534]',
  campaign:  'bg-[#fff7ed] text-[#c2410c]',
  hr:        'bg-[#fefce8] text-[#a16207]',
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ready: 'bg-green-500', processing: 'bg-blue-500', error: 'bg-red-500', draft: 'bg-gray-400'
  }
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-gray-600 capitalize">
      {status === 'processing'
        ? <RefreshCw className="w-3 h-3 text-blue-500 animate-spin" />
        : <span className={`w-2 h-2 rounded-full ${colors[status] || 'bg-gray-300'}`} />
      }
      {status}
    </span>
  )
}

interface Props {
  datasets: any[]
  onDelete: (id: string) => void
}

export function KnowledgeBaseListView({ datasets, onDelete }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggleAll = () => {
    if (selected.size === datasets.length) setSelected(new Set())
    else setSelected(new Set(datasets.map(d => d.id)))
  }
  const toggleOne = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  return (
    <div className="relative">
      <div className="border border-[#e5e7eb] rounded-xl overflow-hidden bg-white">
        {/* Table header */}
        <div className="grid grid-cols-[40px_1fr_100px_90px_70px_120px_100px_44px] items-center px-4 py-2.5 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">
          <button onClick={toggleAll} className="flex items-center justify-center">
            {selected.size === datasets.length && datasets.length > 0
              ? <CheckSquare className="w-4 h-4 text-[#111]" />
              : <Square className="w-4 h-4 text-gray-300" />
            }
          </button>
          <span>Name</span>
          <span>Category</span>
          <span>Status</span>
          <span>Chunks</span>
          <span>Tags</span>
          <span>Created</span>
          <span />
        </div>

        {/* Rows */}
        {datasets.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-gray-400">No knowledge bases found.</div>
        ) : datasets.map(dataset => {
          const tags: string[] = dataset.tags || []
          const catClass = CATEGORY_COLORS[dataset.purpose] || CATEGORY_COLORS.general
          const isSelected = selected.has(dataset.id)

          return (
            <div
              key={dataset.id}
              className={`grid grid-cols-[40px_1fr_100px_90px_70px_120px_100px_44px] items-center px-4 py-3 border-b border-gray-50 transition-colors hover:bg-gray-50 ${isSelected ? 'bg-blue-50/40' : ''}`}
            >
              <button onClick={() => toggleOne(dataset.id)} className="flex items-center justify-center">
                {isSelected
                  ? <CheckSquare className="w-4 h-4 text-[#111]" />
                  : <Square className="w-4 h-4 text-gray-300" />
                }
              </button>
              <Link href={`/knowledge/${dataset.id}`} className="flex items-center gap-2 min-w-0">
                <span className="text-[13px] font-medium text-[#111] truncate hover:text-blue-600 transition-colors">
                  {dataset.name}
                </span>
              </Link>
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full capitalize w-fit ${catClass}`}>
                {dataset.purpose || 'general'}
              </span>
              <StatusDot status={dataset.status || 'draft'} />
              <span className="text-[12px] text-gray-500">{dataset.chunk_count || 0}</span>
              <div className="flex flex-wrap gap-1">
                {tags.slice(0, 2).map(t => (
                  <span key={t} className="bg-gray-100 text-gray-500 text-[10px] px-1.5 py-0.5 rounded-full">{t}</span>
                ))}
                {tags.length > 2 && <span className="text-[10px] text-gray-400">+{tags.length - 2}</span>}
              </div>
              <span className="text-[12px] text-gray-400">
                {new Date(dataset.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <button className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-100 transition-colors">
                <MoreVertical className="w-3.5 h-3.5 text-gray-400" />
              </button>
            </div>
          )
        })}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#111] text-white px-5 py-3 rounded-2xl shadow-xl flex items-center gap-4 text-[13px]">
          <span className="font-medium">{selected.size} selected</span>
          <div className="w-px h-4 bg-white/20" />
          <button className="flex items-center gap-1.5 hover:text-blue-300 transition-colors">
            <Bot className="w-4 h-4" />Assign to Bot
          </button>
          <button
            className="flex items-center gap-1.5 hover:text-red-300 transition-colors"
            onClick={() => { selected.forEach(id => onDelete(id)); setSelected(new Set()) }}
          >
            <Trash2 className="w-4 h-4" />Delete
          </button>
          <button onClick={() => setSelected(new Set())} className="text-white/50 hover:text-white transition-colors">
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
