import { cn } from '@/lib/utils'

interface KpiCardProps {
  label: string
  value: string | number
  delta?: string
  trend?: 'up' | 'down' | 'neutral'
  icon?: any
}

export function KpiCard({ label, value, delta, trend = 'neutral', icon: Icon }: KpiCardProps) {
  return (
    <div className="border border-surface-border rounded-lg p-4 bg-surface hover:bg-surface-muted transition-colors flex flex-col justify-between h-[120px]">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-muted">{label}</p>
        {Icon && <Icon className="w-4 h-4 text-ink-muted" />}
      </div>
      
      <div>
        <div className="flex items-end gap-3 mt-4">
          <p className="text-2xl font-semibold text-ink font-mono leading-none">{value}</p>
          {delta && (
            <p className={cn(
              "text-xs font-medium mb-0.5",
              trend === 'up' && "text-status-green",
              trend === 'down' && "text-status-red",
              trend === 'neutral' && "text-ink-secondary"
            )}>
              {delta}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
