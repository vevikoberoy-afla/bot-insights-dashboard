import { createHash, randomUUID } from 'node:crypto'
import { supabase } from '@/lib/supabase'
import { embedBatch, hashText } from '@/lib/embeddings'
import { DocumentImportError, MAX_DOCUMENT_TEXT } from '@/lib/knowledge/documentPolicy'
import { parseQuarantinedDocument } from '@/lib/knowledge/documentParser'

function publicSource(source:any){
  return Object.fromEntries(['id','dataset_id','source_type','source_ref','source_name','status','error_msg','chunk_count','created_at'].map(key=>[key,source[key]]))
}

export function documentChunks(text: string) {
  if (text.length > MAX_DOCUMENT_TEXT) throw new DocumentImportError('Split this document into smaller documents.')
  const result: string[] = []
  for (let start=0;start<text.length;) {
    let end=Math.min(start+1600,text.length)
    if(end<text.length){const boundary=text.lastIndexOf(' ',end);if(boundary>start+800)end=boundary}
    const chunk=text.slice(start,end).trim();if(chunk)result.push(chunk)
    if(end>=text.length)break
    start=Math.max(start+1,end-200)
  }
  return result
}
export function documentIndexingFailure(error:unknown,stage:'embedding'|'storage'){
  const code=typeof(error as any)?.code==='string'?(error as any).code:''
  const status=Number((error as any)?.status)
  if(stage==='storage'&&['42703','42P01','42883','PGRST202','PGRST204','23502'].includes(code))return 'Document storage needs an update. Re-run supabase/106_secure_knowledge_documents.sql, then click Retry on this source. Your checked document text is saved.'
  if(stage==='embedding'&&(status===401||status===403))return 'The embedding provider rejected the configured credentials. Ask your administrator to check the embedding API key, then retry this source.'
  if(stage==='embedding'&&status===429)return 'The embedding provider reached its rate or usage limit. Wait for the provider allowance to recover, then retry this source.'
  if(stage==='embedding')return 'The document passed its security checks, but embedding failed. Retry this source; your checked text is saved.'
  return 'The document passed its security checks, but saving its chunks failed. Retry this source; your checked text is saved.'
}
export async function ingestDocumentBuffer(input: { datasetId: string; clientId: string; filename: string; sourceUrl?: string; extension: string; buffer: Buffer }) {
  const sha256=createHash('sha256').update(input.buffer).digest('hex')
  const started=await supabase.rpc('knowledge_start_document',{
    p_client:input.clientId,p_dataset:input.datasetId,p_name:input.filename.slice(0,200),p_type:input.sourceUrl?'document_link':'file',
    p_ref:input.sourceUrl||input.filename,p_bytes:input.buffer.length,p_hash:sha256,
  })
  if(started.error||!started.data)throw new DocumentImportError(started.error?.code==='PGRST202'?'Apply supabase/106_secure_knowledge_documents.sql to enable document imports.':started.error?.message||'Could not save document import.',503)
  const source=started.data
  if(source.duplicate)return {source:publicSource(source),duplicate:true}
  try{
    // No chunks, embeddings or raw-file storage before quarantine succeeds.
    const parsed=await parseQuarantinedDocument(input.buffer,input.extension)
    const staged=await supabase.rpc('knowledge_stage_document',{p_source:source.id,p_hash:sha256,p_text:parsed.text,p_scanner:parsed.scanner})
    if(staged.error||!staged.data)throw new Error('Could not stage checked document')
  }catch(error){
    await supabase.from('dataset_sources').update({status:'error',error_msg:error instanceof DocumentImportError?error.message:'This document could not be checked safely.',document_state:{...source.document_state,scan_status:'rejected'}}).eq('id',source.id).eq('dataset_id',input.datasetId)
    throw error
  }
  await processDocumentSource(source.id)
  const complete=await supabase.from('dataset_sources').select('id,dataset_id,source_type,source_ref,source_name,status,error_msg,chunk_count,created_at').eq('id',source.id).single()
  if(complete.error)throw new DocumentImportError('Could not read document import progress.',503)
  if(complete.data.status==='error')throw new DocumentImportError(complete.data.error_msg||'Could not index this document.',502)
  return {source:complete.data,duplicate:false}
}
export async function processDocumentSource(sourceId:string){
  const token=randomUUID()
  const claim=await supabase.rpc('knowledge_claim_document',{p_source:sourceId,p_token:token})
  if(claim.error)throw new DocumentImportError('Document import storage is unavailable. Apply migration 106.',503)
  if(!claim.data)return
  const source=claim.data,state=source.document_state
  let stage:'embedding'|'storage'='embedding'
  try{
    const chunks=documentChunks(state.text),offset=Number(state.offset||0),batch=chunks.slice(offset,offset+32)
    if(!batch.length)throw new Error('Empty document batch')
    const vectors=await embedBatch(batch)
    if(vectors.length!==batch.length||vectors.some(v=>!Array.isArray(v)||v.length!==768||v.some(n=>!Number.isFinite(n))))throw new Error('Invalid embedding result')
    const next=offset+batch.length
    stage='storage'
    const commit=await supabase.rpc('knowledge_commit_document',{
      p_source:sourceId,p_token:token,p_chunks:batch.map((text,index)=>({text,chunk_hash:hashText(text),embedding:JSON.stringify(vectors[index])})),
      p_offset:offset,p_next:next,p_done:next>=chunks.length,
    })
    if(commit.error)throw commit.error
  }catch(error){
    // Keep checked text for a retry, but expose no half-success result.
    console.error('[knowledge document indexing]',{stage,sourceId,code:(error as any)?.code||null,status:Number((error as any)?.status)||null})
    await supabase.from('dataset_sources').update({status:'error',error_msg:documentIndexingFailure(error,stage),crawl_lease:null,crawl_lease_until:null}).eq('id',sourceId).eq('crawl_lease',token)
  }
}
