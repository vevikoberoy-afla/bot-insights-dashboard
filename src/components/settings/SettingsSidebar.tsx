'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  CreditCard,
  Lock,
  ShieldCheck,
  BarChart2,
  Users,
  FileText,
  Plug,
  Clock,
  MessageSquare,
  Webhook,
  HelpCircle,
  Settings,
  ChevronRight,
} from 'lucide-react'

interface SettingsNavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  exact?: boolean
}

interface SettingsGroup {
  category: string
  items: SettingsNavItem[]
}

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    category: 'Account & Plan',
    items: [
      {
        href: '/settings/billing',
        label: 'Plan & Subscription',
        icon: CreditCard,
        badge: 'Pro',
      },
      {
        href: '/settings/security',
        label: 'Account Security',
        icon: Lock,
      },
      {
        href: '/settings/usage',
        label: 'Usage & Limits',
        icon: BarChart2,
      },
      {
        href: '/settings/team',
        label: 'Team & Access',
        icon: Users,
      },
    ],
  },
  {
    category: 'Data & Privacy',
    items: [
      {
        href: '/settings',
        label: 'Data Retention',
        icon: ShieldCheck,
        exact: true,
      },
      {
        href: '/settings/data-privacy',
        label: 'Data Privacy & Exports',
        icon: FileText,
      },
    ],
  },
  {
    category: 'Workspace & Channels',
    items: [
      {
        href: '/settings/integrations',
        label: 'Integrations',
        icon: Plug,
      },
      {
        href: '/settings/hours',
        label: 'Business Hours',
        icon: Clock,
      },
      {
        href: '/settings/canned',
        label: 'Canned Responses',
        icon: MessageSquare,
      },
      {
        href: '/webhooks',
        label: 'Webhooks',
        icon: Webhook,
      },
      {
        href: '/settings/support',
        label: 'Platform Support',
        icon: HelpCircle,
      },
    ],
  },
]

export function SettingsSidebar() {
  const pathname = usePathname()

  const isActive = (item: SettingsNavItem) => {
    if (item.exact) {
      return pathname === item.href
    }
    return pathname === item.href || pathname.startsWith(`${item.href}/`)
  }

  return (
    <aside className="w-64 flex-shrink-0 border-r border-surface-border bg-surface-muted/50 flex flex-col h-full">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-surface-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-surface border border-surface-border flex items-center justify-center text-ink shadow-2xs">
          <Settings className="w-4 h-4 text-ink" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink leading-tight">Settings</h2>
          <p className="text-[11px] text-ink-muted truncate">Workspace & Account</p>
        </div>
      </div>

      {/* Navigation Groups */}
      <div className="flex-1 overflow-y-auto p-3 space-y-6">
        {SETTINGS_GROUPS.map((group) => (
          <div key={group.category} className="space-y-1">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted px-2.5 py-1">
              {group.category}
            </h3>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item)
                const Icon = item.icon

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'group flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium transition-all',
                      active
                        ? 'bg-surface text-ink font-semibold shadow-2xs border border-surface-border'
                        : 'text-ink-secondary hover:bg-surface-subtle hover:text-ink'
                    )}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={cn(
                          'w-4 h-4 shrink-0 transition-colors',
                          active ? 'text-accent' : 'text-ink-muted group-hover:text-ink'
                        )}
                      />
                      <span className="truncate">{item.label}</span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {item.badge && (
                        <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                          {item.badge}
                        </span>
                      )}
                      {active && (
                        <ChevronRight className="w-3.5 h-3.5 text-accent opacity-80" />
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
