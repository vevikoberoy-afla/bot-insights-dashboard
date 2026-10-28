import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getAuthenticatedWorkspaceUser, getAuthenticatedWorkspaceResource } from '@/lib/requestAuth'
import { documentImportRateLimit } from '@/lib/ratelimit'
import { acquireDocumentImport, documentFilename, documentPolicy, DocumentImportError } from '@/lib/knowledge/documentPolicy'
import { ingestDocumentBuffer } from '@/lib/knowledge/documentIngestion'

export async function boundedRequestBuffer(req: Request, maxBytes: number) {
  const declared=Number(req.headers.get('content-length'))
  if(Number.isFinite(declared)&&declared>maxBytes)throw new DocumentImportError('The upload exceeds your workspace file-size limit.',413)
  const reader=req.body?.getReader()
  if(!reader)throw new DocumentImportError('The upload is empty.')
  const parts:Uint8Array[]=[];let size=0
  let timedOut=false
  const timer=setTimeout(()=>{timedOut=true;void reader.cancel().catch(()=>{})},15_000)
  try{
    while(true){const result=await reader.read();if(timedOut)throw new DocumentImportError('The upload timed out. Please retry.',408);if(result.done)break;size+=result.value.byteLength;if(size>maxBytes||parts.length>=4096){await reader.cancel();throw new DocumentImportError('The upload exceeds the safe request limit.',413)}parts.push(result.value)}
  }finally{clearTimeout(timer);reader.releaseLock()}
  return Buffer.concat(parts,size)
}
export async function handleDocumentUpload(req:NextRequest,datasetId?:string){
  let release:(()=>void)|undefined
  try{
    // Authenticate before buffering or decoding any attacker-controlled body.
    const actor=datasetId?await getAuthenticatedWorkspaceResource(req,'datasets',datasetId,'knowledge',true):await getAuthenticatedWorkspaceUser(req,'knowledge',true)
    if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
    const policy=await documentPolicy(actor.workspaceId)
    if(!policy.maxBytes)throw new DocumentImportError('Document uploads are disabled for your workspace.',403)
    const rate=await documentImportRateLimit.limit(`documents:${actor.workspaceId}`)
    if(!rate.success)throw new DocumentImportError('Too many document imports. Please try again later.',429)
    const contentType=req.headers.get('content-type')||''
    if(!contentType.startsWith('multipart/form-data;'))throw new DocumentImportError('Choose a file using the document upload form.')
    release=acquireDocumentImport()
    const body=await boundedRequestBuffer(req,policy.maxBytes+256*1024)
    const form=await new Request(req.url,{method:'POST',headers:{'Content-Type':contentType},body}).formData()
    let target=datasetId||String(form.get('dataset_id')||'')
    const contextId=String(form.get('context_id')||'')
    if(!target&&contextId){
      // Legacy context imports still live in a tenant-owned knowledge base.
      const owner=await supabase.from('clients').select('id').eq('id',actor.workspaceId).eq('context_id',contextId).maybeSingle()
      if(owner.error||!owner.data)throw new DocumentImportError('Workspace context not found.',404)
      const existing=await supabase.from('datasets').select('id').eq('client_id',actor.workspaceId).eq('source_url',`context-documents://${contextId}`).maybeSingle()
      if(existing.error)throw new DocumentImportError('Could not load the document knowledge base.',503)
      if(existing.data)target=existing.data.id
      else{
        const created=await supabase.from('datasets').insert({client_id:actor.workspaceId,name:'Uploaded documents',type:'upload',source_url:`context-documents://${contextId}`,purpose:'general',status:'draft'}).select('id').single()
        if(created.error)throw new DocumentImportError('Could not create the document knowledge base.',503)
        target=created.data.id
      }
    }
    if(!target)throw new DocumentImportError('Choose a knowledge base for these documents.')
    if(!datasetId){const owned=await supabase.from('datasets').select('id').eq('id',target).eq('client_id',actor.workspaceId).maybeSingle();if(owned.error||!owned.data)throw new DocumentImportError('Knowledge base not found.',404)}
    const files=form.getAll('files')
    if(files.length!==1||typeof files[0]==='string')throw new DocumentImportError('Upload one document at a time.')
    const file=files[0]
    const {filename,extension}=documentFilename(file.name)
    if(!file.size||file.size>policy.maxBytes)throw new DocumentImportError(`Choose a nonempty document no larger than ${policy.maxFileMb} MB.`,413)
    const result=await ingestDocumentBuffer({datasetId:target,clientId:actor.workspaceId,filename,extension,buffer:Buffer.from(await file.arrayBuffer())})
    return NextResponse.json({success:true,...result,chunks_added:result.duplicate?0:result.source.chunk_count||0,dataset_id:target},{status:201})
  }catch(error){return NextResponse.json({error:error instanceof DocumentImportError?error.message:'The document could not be imported. Please try again.'},{status:error instanceof DocumentImportError?error.status:503})}
  finally{release?.()}
}
