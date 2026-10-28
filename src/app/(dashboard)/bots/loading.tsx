export default function BotsLoading(){
  return <div className="space-y-6 pb-12" aria-label="Loading bots">
    <div className="flex items-center justify-between">
      <div className="space-y-2"><div className="h-7 w-40 rounded-lg bg-surface-muted animate-pulse"/><div className="h-4 w-72 rounded bg-surface-muted animate-pulse"/></div>
      <div className="h-9 w-36 rounded-lg bg-surface-muted animate-pulse"/>
    </div>
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
      {[0,1,2,3,4,5].map(item=><div key={item} className="h-48 rounded-xl border border-surface-border bg-surface p-5"><div className="h-10 w-10 rounded-xl bg-surface-muted animate-pulse"/><div className="mt-4 h-4 w-32 rounded bg-surface-muted animate-pulse"/><div className="mt-3 h-3 w-4/5 rounded bg-surface-muted animate-pulse"/><div className="mt-8 h-10 rounded-lg bg-surface-muted animate-pulse"/></div>)}
    </div>
  </div>
}
