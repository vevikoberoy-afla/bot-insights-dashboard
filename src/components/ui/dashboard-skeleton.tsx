import { Skeleton } from '@/components/ui/skeleton'

export function DashboardContentSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading dashboard" className="space-y-8 p-6">
      <span className="sr-only">Loading dashboard</span>
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-2">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-32 rounded-lg" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="rounded-xl border border-surface-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
            <Skeleton className="mt-5 h-8 w-16" />
            <Skeleton className="mt-3 h-3 w-28" />
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-xl border border-surface-border bg-surface p-5">
          <Skeleton className="h-5 w-36" />
          <div className="mt-6 flex h-44 items-end gap-3">
            {[42, 68, 51, 82, 58, 91, 64, 76].map((height, item) => (
              <Skeleton key={item} className="flex-1 rounded-t-md" style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-surface-border bg-surface p-5">
          <Skeleton className="h-5 w-32" />
          <div className="mt-5 space-y-4">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="flex items-center gap-3">
                <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function DashboardShellSkeleton() {
  return (
    <div className="flex h-screen overflow-hidden bg-surface text-ink">
      <aside className="hidden h-full w-[240px] shrink-0 border-r border-surface-border bg-surface-muted sm:flex sm:flex-col">
        <div className="flex h-12 items-center gap-2 border-b border-surface-border px-4">
          <Skeleton className="h-6 w-6 rounded-md" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="space-y-5 p-3 pt-5">
          {[2, 6, 4, 3].map((count, group) => (
            <div key={group} className="space-y-2">
              {group > 0 && <Skeleton className="ml-2 h-2.5 w-16" />}
              {Array.from({ length: count }).map((_, item) => (
                <div key={item} className="flex items-center gap-3 px-2 py-1">
                  <Skeleton className="h-4 w-4 rounded" />
                  <Skeleton className="h-3.5" style={{ width: `${84 + ((item + group) % 3) * 20}px` }} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-surface-border px-8">
          <Skeleton className="h-4 w-24" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-56 rounded-lg" />
            <Skeleton className="h-7 w-7 rounded-full" />
          </div>
        </div>
        <main className="min-h-0 flex-1 overflow-hidden p-2">
          <DashboardContentSkeleton />
        </main>
      </div>
    </div>
  )
}
