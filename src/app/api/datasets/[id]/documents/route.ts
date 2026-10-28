import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedWorkspaceResource } from '@/lib/requestAuth'
import { handleDocumentUpload } from '@/lib/knowledge/documentUpload'
import { documentPolicy, DocumentImportError } from '@/lib/knowledge/documentPolicy'

export const runtime='nodejs'
export const maxDuration=60
export async function POST(req:NextRequest,props:{params:Promise<{id:string}>}){
  const {id}=await props.params
  return handleDocumentUpload(req,id)
}
export async function GET(req:NextRequest,props:{params:Promise<{id:string}>}){
  const {id}=await props.params
  const actor=await getAuthenticatedWorkspaceResource(req,'datasets',id,'knowledge')
  if(!actor)return NextResponse.json({error:'Access denied'},{status:403})
  try{return NextResponse.json(await documentPolicy(actor.workspaceId))}
  catch(error){return NextResponse.json({error:error instanceof DocumentImportError?error.message:'Could not load document limits.'},{status:error instanceof DocumentImportError?error.status:503})}
}
