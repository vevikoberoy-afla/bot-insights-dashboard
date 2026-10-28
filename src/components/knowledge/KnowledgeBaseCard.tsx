'use client'
import { useState } from 'react'
import Link from 'next/link'
import {
  BookOpen, TrendingUp, Megaphone, Headphones, Mail, Users,
  FileText, MoreVertical, RefreshCw, Trash2, Bot, Plus, Copy
} from 'lucide-react'

// ── Category config (from spec) ──────────────────────────────────
const CATEGORY_CONFIG: Record<string, { label: string; bg: string; text: string; icon: any }> = {
  general:   { label: 'General',   bg: 'bg-[#f3f4f6]', text: 'text-[#374151]', icon: BookOpen },
  sales:     { label: 'Sales',     bg: 'bg-[#eff6ff]', text: 'text-[#1d4ed8]', icon: TrendingUp },
  marketing: { label: 'Marketing', bg: 'bg-[#f5f3ff]', text: 'text-[#6d28d9]', icon: Megaphone },
  support:   { label: 'Support',   bg: 'bg-[#f0fdf4]', text: 'text-[#166534]', icon: Headphones },
  campaign:  { label: 'Campaign',  bg: 'bg-[#fff7ed]', text: 'text-[#c2410c]', icon: Mail },
  hr:        { label: 'HR',        bg: 'bg-[#fefce8]', text: 'text-[#a16207]', icon: Users },
}

function getCategoryConfig(purpose: string) {
  return CATEGORY_CONFIG[purpose?.toLowerCase()] || CATEGORY_CONFIG.general
}

// ── Status badge ─────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  if (status === 'ready') return (
    <span className="flex items-center gap-1.5 text-[11px] text-[#166534]">
      <span className="w-1.5 h-1.5 rounded-full bg-[#166534] shrink-0" />Ready
    </span>
  )
  if (status === 'processing') return (
    <span className="flex items-center gap-1.5 text-[11px] text-[#1d4ed8]">
      <RefreshCw className="w-3 h-3 animate-spin shrink-0" />Processing
    </span>
  )
  if (status === 'error') return (
    <span className="flex items-center gap-1.5 text-[11px] text-red-600">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />Error
    </span>
  )
  // draft
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-[#6b7280]">
      <span className="w-1.5 h-1.5 rounded-full bg-[#9ca3af] shrink-0" />Draft
    </span>
  )
}

// ── 3-dot dropdown menu ──────────────────────────────────────────
function CardMenu({ dataset, onDelete }: { dataset: any; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o) }}
        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 transition-colors"
      >
        <MoreVertical className="w-4 h-4 text-[#6b7280]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 z-20 w-44 bg-white border border-gray-200 rounded-xl shadow-lg py-1 text-sm">
            <Link href={`/knowledge/${dataset.id}`} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-gray-700">
              <FileText className="w-3.5 h-3.5" />Edit
            </Link>
            <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-gray-700">
              <Plus className="w-3.5 h-3.5" />Add Source
            </button>
            <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-gray-700">
              <Bot className="w-3.5 h-3.5" />Assign to Bot
            </button>
            <button className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-gray-700">
              <Copy className="w-3.5 h-3.5" />Duplicate
            </button>
            <div className="border-t border-gray-100 my-1" />
            <button
              onClick={e => { e.stopPropagation(); setOpen(false); onDelete(dataset.id) }}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-red-600"
            >
              <Trash2 className="w-3.5 h-3.5" />Delete
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Main card ────────────────────────────────────────────────────
export function KnowledgeBaseCard({ dataset, onDelete }: { dataset: any; onDelete: (id: string) => void }) {
  const cat = getCategoryConfig(dataset.purpose)
  const CatIcon = cat.icon
  const botCount = dataset.bot_datasets?.length || 0
  const sourceCount = dataset.dataset_sources?.length || dataset.source_count || 0
  const tags: string[] = dataset.tags || []
  const isDraft = dataset.status === 'draft'
  const isError = dataset.status === 'error'

  return (
    <Link href={`/knowledge/${dataset.id}`}>
      <div
        className={`
          bg-white rounded-xl p-5 cursor-pointer transition-all duration-150 flex flex-col gap-3
          ${isDraft ? 'border border-dashed border-amber-400' : isError ? 'border border-[#fca5a5]' : 'border border-[#e5e7eb]'}
          hover:border-[#d1d5db] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]
        `}
        style={{ minHeight: 160 }}
      >
        {/* Draft banner */}
        {isDraft && (
          <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl bg-amber-400" />
        )}
        {isError && (
          <div className="absolute top-0 left-0 right-0 h-1 rounded-t-xl bg-red-400" />
        )}

        {/* Top row: category + status */}
        <div className="flex items-center justify-between">
          <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${cat.bg} ${cat.text}`}>
            <CatIcon className="w-3 h-3" />
            {cat.label}
          </span>
          <StatusBadge status={dataset.status || 'draft'} />
        </div>

        {/* Name + description + tags */}
        <div className="flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[15px] font-semibold text-[#111111] leading-snug line-clamp-1 flex-1">
              {dataset.name}
            </h3>
            <div className="shrink-0" onClick={e => e.preventDefault()}>
              <CardMenu dataset={dataset} onDelete={onDelete} />
            </div>
          </div>
          {dataset.description && (
            <p className="text-[12px] text-[#6b7280] mt-1 line-clamp-2">{dataset.description}</p>
          )}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tags.slice(0, 3).map((tag: string) => (
                <span key={tag} className="bg-[#f3f4f6] text-[#6b7280] text-[11px] px-2 py-0.5 rounded-full">
                  {tag}
                </span>
              ))}
              {tags.length > 3 && (
                <span className="text-[11px] text-[#9ca3af]">+{tags.length - 3} more</span>
              )}
            </div>
          )}
        </div>

        {/* Bottom row: stats */}
        <div className="flex items-center justify-between pt-3 border-t border-[#f3f4f6]">
          <div className="flex items-center gap-3 text-[11px] text-[#9ca3af]">
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />{dataset.chunk_count || 0} chunks
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <BookOpen className="w-3 h-3" />{sourceCount} sources
            </span>
            {botCount > 0 && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Bot className="w-3 h-3" />{botCount} bot{botCount !== 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>

          {isDraft ? (
            <span className="text-[11px] text-amber-600 font-medium">Complete Setup →</span>
          ) : isError ? (
            <button
              onClick={e => e.preventDefault()}
              className="text-[11px] text-red-500 border border-red-300 px-2 py-0.5 rounded hover:bg-red-50 transition-colors"
            >
              Retry
            </button>
          ) : (
            <span className="text-[12px] text-[#9ca3af]">
              {new Date(dataset.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
