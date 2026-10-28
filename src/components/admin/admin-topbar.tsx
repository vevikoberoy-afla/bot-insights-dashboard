'use client'
import { Search, Bell } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function AdminTopbar({ user }: { user: any }) {
  return (
    <header className="h-14 border-b border-surface-border bg-surface flex items-center justify-between px-6 shrink-0">
      <div className="flex-1 flex items-center">
        <div className="relative w-96 hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
          <Input 
            placeholder="Search across all clients and settings..." 
            className="pl-9 h-9 bg-surface-muted border-surface-border text-sm focus-visible:ring-ink"
          />
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="text-ink-secondary relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full" />
        </Button>
        <div className="h-5 w-px bg-surface-border mx-1" />
        <div className="flex items-center gap-2 pl-2">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-semibold text-ink leading-tight">{user?.name || 'Admin'}</p>
            <p className="text-[10px] text-ink-muted">Super Administrator</p>
          </div>
          <div className="w-8 h-8 rounded-full bg-surface-muted border border-surface-border flex items-center justify-center text-xs font-bold text-ink">
            {user?.name?.charAt(0).toUpperCase() || 'A'}
          </div>
        </div>
      </div>
    </header>
  )
}
