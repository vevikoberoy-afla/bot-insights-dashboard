import { NextRequest,NextResponse } from 'next/server'
import { createHash,randomBytes } from 'crypto'
import { supabase } from '@/lib/supabase'
import { checked,identity,requireWorkspace,saasError,SaaSError,uuid } from '@/lib/saas/context'
import { ACCESS_LEVELS,ACCESS_MODULE_KEYS,MEMBER_ROLES } from '@/lib/saas/catalog'
function permissions(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new SaaSError('INVALID_INPUT','Choose employee access.',400)
 const input=value as Record<string,unknown>,result:Record<string,string>={}
 for(const key of ACCESS_MODULE_KEYS){const level=input[key];if(!(ACCESS_LEVELS as readonly unknown[]).includes(level))throw new SaaSError('INVALID_INPUT',`Invalid access for ${key}.`,400);result[key]=String(level)}
 if(Object.keys(input).some(key=>!ACCESS_MODULE_KEYS.includes(key as any)))throw new SaaSError('INVALID_INPUT','Unknown access module.',400)
 return result
}
export async function GET(){
 try{
  const ctx=await requireWorkspace(null,'team')
  const members=checked(await supabase.from('workspace_memberships').select('*').eq('client_id',ctx.workspaceId))
  const rows=await Promise.all((members || []).map(async m=>{const {data,error}=await supabase.auth.admin.getUserById(m.user_id);if(error)throw error;return {...m,email:data.user.email,name:data.user.user_metadata?.full_name || ''}}))
  const invites=checked(await supabase.from('saas_invitations').select('id,email,role_key,permissions,status,expires_at').eq('client_id',ctx.workspaceId))
  const limit=Number(ctx.entitlements.limits?.['members.seats']||0),used=rows.filter(member=>member.status==='active').length+(invites||[]).filter(invite=>invite.status==='pending'&&Date.parse(invite.expires_at)>Date.now()).length
  return NextResponse.json({members:rows,invitations:invites,seats:{used,limit,remaining:Math.max(0,limit-used)}})
 }catch(e){return saasError(e)}
}
export async function POST(req:NextRequest){
 try{
  const body=await req.json()
  if(body.action==='accept'){
   const {user}=await identity();if(typeof body.token!=='string'||body.token.length!==64)throw new SaaSError('INVALID_INPUT','Invalid invitation.',400)
   const hash=createHash('sha256').update(body.token).digest('hex')
   const invite=checked(await supabase.from('saas_invitations').select('client_id').eq('token_hash',hash).eq('status','pending').maybeSingle())
   if(!invite)throw new SaaSError('INVALID_INPUT','Invitation is invalid or already used.',400)
   checked(await supabase.rpc('saas_team_mutate',{p_actor:user.id,p_client:invite.client_id,p_action:'accept',p_payload:{token_hash:hash}}))
   const response=NextResponse.json({success:true});response.cookies.set('vittain_workspace',invite.client_id,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:30*86400});return response
  }
  const ctx=await requireWorkspace(null,'team',true)
  if(!['invite','member','revoke_invite'].includes(body.action))throw new SaaSError('INVALID_INPUT','Unknown team action.',400)
  if(body.action!=='revoke_invite'&&(!(MEMBER_ROLES as readonly string[]).includes(body.role_key)||body.role_key==='owner'))throw new SaaSError('INVALID_INPUT','Choose a team role.',400)
  if(body.action==='member'&&!['active','revoked'].includes(body.status))throw new SaaSError('INVALID_INPUT','Invalid member status.',400)
  if(body.action!=='invite')uuid(body.id)
  const grants=body.action==='revoke_invite'?undefined:permissions(body.permissions)
  const token=body.action==='invite'?randomBytes(32).toString('hex'):null
  const result=checked(await supabase.rpc('saas_team_mutate',{p_actor:ctx.user.id,p_client:ctx.workspaceId,p_action:body.action,p_payload:{id:body.id,email:String(body.email||'').trim().toLowerCase(),role_key:body.role_key,status:body.status,permissions:grants,token_hash:token?createHash('sha256').update(token).digest('hex'):undefined}}))
  return NextResponse.json({success:true,result,invitation_path:token?`/auth/invitation?token=${token}`:undefined})
 }catch(e){return saasError(e)}
}
export const dynamic = 'force-dynamic'
