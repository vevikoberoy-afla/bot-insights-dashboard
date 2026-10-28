'use client'

import { SettingsSidebar } from '@/components/settings/SettingsSidebar'

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-[calc(100vh-5rem)] bg-surface rounded-2xl border border-surface-border overflow-hidden shadow-2xs">
      <SettingsSidebar />
      <div className="flex-1 min-w-0 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
