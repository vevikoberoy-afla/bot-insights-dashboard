'use client'
import { useEffect, useRef, useState } from 'react'
import { FileUp, ShieldCheck } from 'lucide-react'
import { activeWorkspaceId } from '@/lib/client/workspace'

export function DocumentUploadPanel({ datasetId, onAdded }: { datasetId: string; onAdded: (source: any) => void }) {
  const [limit,setLimit]=useState<number|null>(null)
  const [busy,setBusy]=useState(false)
  const [progress,setProgress]=useState('')
  const [error,setError]=useState('')
  const fileInput=useRef<HTMLInputElement>(null)
  useEffect(()=>{
    let cancelled=false
    fetch(`/api/datasets/${datasetId}/documents`,{headers:{'X-Workspace-Id':activeWorkspaceId('')}}).then(async response=>{
      const body=await response.json();if(!response.ok)throw new Error(body.error||'Could not load upload limits')
      if(!cancelled)setLimit(body.maxFileMb)
    }).catch(error=>{if(!cancelled)setError(error.message)})
    return()=>{cancelled=true}
  },[datasetId])
  async function upload(files:FileList|null){
    if(!files?.length||busy||limit===null)return
    if(files.length>10){setError('Select at most 10 documents, or upload them in smaller batches.');return}
    const selected=Array.from(files)
    if(selected.some(file=>file.size>limit*1024*1024||!file.size)){setError(`Each document must be nonempty and no larger than ${limit} MB.`);if(fileInput.current)fileInput.current.value='';return}
    setBusy(true);setError('')
    const failures:string[]=[]
    for(let index=0;index<selected.length;index++){
      const file=selected[index]
      setProgress(`Checking and importing ${file.name} (${index+1}/${selected.length})…`)
      try{
        const body=new FormData();body.append('files',file)
        const response=await fetch(`/api/datasets/${datasetId}/documents`,{method:'POST',headers:{'X-Workspace-Id':activeWorkspaceId('')},body})
        const result=await response.json()
        if(!response.ok)throw new Error(result.error||'Import failed')
        onAdded(result.source)
      }catch(error){failures.push(`${file.name}: ${error instanceof Error?error.message:'Could not import this document'}`)}
    }
    setError(failures.join('\n'));setProgress(failures.length?'Finished with errors.':'Documents checked. Follow their indexing progress in Sources.');setBusy(false)
    if(fileInput.current)fileInput.current.value=''
  }
  return <section className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4">
    <div className="flex items-center gap-2"><FileUp className="h-4 w-4 text-blue-600"/><h3 className="text-[13px] font-semibold text-gray-900">Upload documents</h3></div>
    <p className="text-[12px] text-gray-500">PDF, TXT, DOCX, Markdown, and CSV · {limit===null?'Loading file limit…':`${limit} MB maximum per file`}</p>
    <label className="block rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center text-[12px] text-gray-600">
      <span>{busy?'Checking your documents…':'Choose documents to add to this knowledge base'}</span>
      <input ref={fileInput} aria-label="Upload knowledge documents" type="file" accept=".pdf,.txt,.docx,.md,.csv" multiple disabled={busy||limit===null||limit===0} onChange={event=>void upload(event.target.files)} className="mt-3 block w-full text-[12px] text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-white disabled:opacity-50"/>
    </label>
    <p className="flex items-center gap-1.5 text-[11px] text-gray-500"><ShieldCheck className="h-3.5 w-3.5 shrink-0"/>Files are checked before text is added. Raw documents are not published.</p>
    {limit===0&&<p className="text-[12px] text-amber-700">Document imports are disabled by your administrator.</p>}
    {progress&&<p role="status" className="break-words text-[12px] text-gray-600">{progress}</p>}
    {error&&<p role="alert" className="whitespace-pre-wrap break-words text-[12px] text-red-600">{error}</p>}
  </section>
}
