'use client'
import { Search } from 'lucide-react'
import { usePathname } from 'next/navigation'
import {NotificationCenter} from '@/components/notifications/NotificationCenter'

export function TopBar({ clientData }: { clientData?: any }) {
  const pathname = usePathname()
  
  // Simple breadcrumb generator
  const paths = pathname.split('/').filter(Boolean)
  const breadcrumb = paths.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' / ') || 'Overview'

  return (
    <div className="h-12 border-b border-surface-border bg-surface flex items-center justify-between px-8 flex-shrink-0">
      
      {/* Breadcrumb */}
      <div className="text-sm text-ink-secondary font-medium">
        {breadcrumb}
      </div>

      {/* Global Actions */}
      <div className="flex items-center gap-4">
        {/* Search Trigger */}
        <button className="flex items-center gap-2 text-sm text-ink-muted bg-surface-subtle hover:bg-surface-border transition-colors px-3 py-1.5 rounded-lg border border-transparent">
          <Search className="w-4 h-4" />
          <span>Search...</span>
          <kbd className="ml-4 font-mono text-[10px] bg-surface rounded px-1.5 py-0.5 border border-surface-border text-ink-secondary">⌘K</kbd>
        </button>

        <NotificationCenter workspaceId={clientData?.id}/>
      </div>
    </div>
  )
}
