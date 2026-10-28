import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { checked, requireWorkspace, saasError, SaaSError } from '@/lib/saas/context'
export async function POST(req:NextRequest){
 try {
  const ctx=await requireWorkspace(),body=await req.json()
  if(!['support','plan_change','export','deletion'].includes(body.kind)||typeof body.subject!=='string'||!body.subject.trim()||typeof body.message!=='string'||body.message.trim().length<10)throw new SaaSError('INVALID_INPUT','Provide a subject and a message of at least 10 characters.',400)
  if(body.kind!=='support'&&!['owner','workspace_admin','billing_manager'].includes(ctx.membership.role_key))throw new SaaSError('PERMISSION_DENIED','An account administrator must make this request.')
  if(body.kind==='deletion'&&ctx.membership.role_key!=='owner')throw new SaaSError('PERMISSION_DENIED','Only the owner can request deletion.')
  const data=checked(await supabase.from('saas_requests').insert({client_id:ctx.workspaceId,requester_id:ctx.user.id,kind:body.kind,subject:body.subject.trim().slice(0,200),message:body.message.trim().slice(0,10000)}).select('*').single())
  return NextResponse.json(data,{status:201})
 }catch(e){return saasError(e)}
}
