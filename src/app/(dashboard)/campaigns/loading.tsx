export default function CampaignsLoading(){
 return <div className="space-y-6 p-4 md:p-7" aria-label="Loading campaigns">
  <div className="flex items-end justify-between"><div className="space-y-2"><div className="h-7 w-48 animate-pulse rounded bg-slate-200"/><div className="h-4 w-80 animate-pulse rounded bg-slate-100"/></div><div className="h-10 w-36 animate-pulse rounded-xl bg-slate-200"/></div>
  <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">{Array.from({length:5}).map((_,index)=><div key={index} className="h-20 animate-pulse rounded-xl border bg-white p-4"><div className="mb-3 h-2 w-20 rounded bg-slate-100"/><div className="h-5 w-12 rounded bg-slate-200"/></div>)}</div>
  <div className="h-11 animate-pulse rounded-xl border bg-white"/>
  <div className="overflow-hidden rounded-2xl border bg-white">{Array.from({length:7}).map((_,index)=><div key={index} className="flex items-center gap-6 border-b p-4 last:border-0"><div className="h-4 w-1/4 animate-pulse rounded bg-slate-200"/><div className="h-5 w-20 animate-pulse rounded-full bg-slate-100"/><div className="ml-auto h-3 w-1/3 animate-pulse rounded bg-slate-100"/></div>)}</div>
 </div>
}
