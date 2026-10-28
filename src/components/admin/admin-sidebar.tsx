'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, MessageSquare, Ticket, Users, MessageCircle, Database, Megaphone,
  BarChart2, Building2, Plus, FileText, Layers, Webhook, Key, ShieldCheck, CreditCard,
  NotebookPen, Activity, ChevronDown, LogOut, Plug
} from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

const NAV_MAIN = [
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Inbox', href: '/admin/inbox', icon: MessageSquare },
  { label: 'Tickets', href: '/admin/tickets', icon: Ticket },
  { label: 'Contacts', href: '/admin/contacts', icon: Users },
  { label: 'Conversations', href: '/admin/conversations', icon: MessageCircle },
  { label: 'Knowledge Base', href: '/admin/knowledge', icon: Database },
  { label: 'Campaigns', href: '/admin/campaigns', icon: Megaphone },
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart2 },
  { label: 'Clients', href: '/admin', icon: Building2, match: '/admin/client' },
  { label: 'New Chatbot', href: '/admin/new', icon: Plus },
]

const NAV_SETTINGS = [
  { label: 'Templates', href: '/admin/templates', icon: FileText },
  { label: 'Integrations', href: '/admin/integrations', icon: Plug },
  { label: 'Webhooks', href: '/admin/webhooks', icon: Webhook },
  { label: 'API Keys', href: '/admin/settings', icon: Key },
  { label: 'Audit Logs', href: '/admin/audit', icon: ShieldCheck },
  { label: 'Billing', href: '/admin/billing', icon: CreditCard },
  { label: 'Notepad', href: '/admin/notepad', icon: NotebookPen },
  { label: 'Platform Health', href: '/admin/tracking', icon: Activity },
]

export function AdminSidebar({ user, onLogout }: { user: any, onLogout: () => void }) {
  const pathname = usePathname()
  const [settingsOpen, setSettingsOpen] = useState(true)

  const isActive = (href: string, match?: string) => {
    if (match && pathname.startsWith(match)) return true
    return pathname === href
  }

  return (
    <div className="w-[240px] flex-shrink-0 bg-surface-muted border-r border-surface-border h-full flex flex-col">
      {/* Logo Area */}
      <div className="h-12 border-b border-surface-border px-4 flex items-center gap-2 flex-shrink-0">
        <div className="w-6 h-6 bg-ink text-white rounded-md flex items-center justify-center font-bold text-xs">V</div>
        <span className="font-semibold text-ink tracking-tight">Vittain SuperAdmin</span>
      </div>

      <div className="flex-1 overflow-y-auto py-2 scrollbar-none flex flex-col">
        {/* Main Nav */}
        <div className="mt-4 mb-1 px-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">Core</p>
        </div>
        <div className="space-y-0.5">
          {NAV_MAIN.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href, item.match)
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-1.5 text-sm rounded-lg mx-2 transition-all",
                  active ? "bg-surface-subtle text-ink font-medium" : "text-ink-secondary hover:bg-surface-subtle hover:text-ink"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-ink" : "text-ink-muted")} />
                {item.label}
              </Link>
            )
          })}
        </div>

        {/* Settings Nav */}
        <div className="mt-6 mb-1 px-4 flex items-center justify-between cursor-pointer group" onClick={() => setSettingsOpen(!settingsOpen)}>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted group-hover:text-ink transition-colors">Settings</p>
          <ChevronDown className={cn("w-3 h-3 text-ink-muted transition-transform", settingsOpen && "rotate-180")} />
        </div>
        
        {settingsOpen && (
          <div className="space-y-0.5 animate-in slide-in-from-top-2">
            {NAV_SETTINGS.map((item) => {
              const Icon = item.icon
              const active = isActive(item.href)
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-1.5 text-sm rounded-lg mx-2 transition-all",
                    active ? "bg-surface-subtle text-ink font-medium" : "text-ink-secondary hover:bg-surface-subtle hover:text-ink"
                  )}
                >
                  <Icon className={cn("h-4 w-4 shrink-0", active ? "text-ink" : "text-ink-muted")} />
                  {item.label}
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Account Footer */}
      <div className="border-t border-surface-border p-3 flex-shrink-0">
        <div className="flex items-center gap-2.5 p-2 rounded-lg mb-1">
          <div className="w-7 h-7 rounded-full bg-accent text-white flex items-center justify-center text-xs font-semibold">
            {user?.name?.charAt(0).toUpperCase() || 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink truncate">{user?.name || 'Admin User'}</p>
            <p className="text-[10px] text-ink-muted font-medium truncate">{user?.email || 'admin@vittain.ai'}</p>
          </div>
        </div>
        <button 
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-status-red hover:bg-status-redBg hover:text-status-red rounded-lg transition-colors font-medium"
        >
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>
    </div>
  )
}
