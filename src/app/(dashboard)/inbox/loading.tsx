export default function InboxLoading(){
 return <div className="flex h-[calc(100vh)] -m-4 overflow-hidden bg-white" aria-label="Loading live inbox">
  <aside className="w-[300px] shrink-0 border-r border-gray-200 p-3">
   <div className="mb-4 h-8 animate-pulse rounded-lg bg-gray-100" />
   {Array.from({length:7}).map((_,index)=><div key={index} className="flex gap-3 border-b border-gray-100 py-4"><div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-gray-200"/><div className="flex-1 space-y-2"><div className="h-3 w-2/3 animate-pulse rounded bg-gray-200"/><div className="h-2 w-full animate-pulse rounded bg-gray-100"/></div></div>)}
  </aside>
  <main className="flex flex-1 flex-col"><div className="h-14 border-b border-gray-200 p-4"><div className="h-5 w-40 animate-pulse rounded bg-gray-100"/></div><div className="flex-1 space-y-6 p-8"><div className="h-16 w-2/5 animate-pulse rounded-xl bg-gray-100"/><div className="ml-auto h-20 w-1/2 animate-pulse rounded-xl bg-blue-50"/><div className="h-20 w-1/3 animate-pulse rounded-xl bg-gray-100"/></div></main>
 </div>
}
