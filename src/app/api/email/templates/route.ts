import {randomUUID} from 'node:crypto'
import {NextRequest,NextResponse} from 'next/server'
import {requireWorkspace,saasError,SaaSError} from '@/lib/saas/context'
import {supabase} from '@/lib/supabase'
import {validateCampaignContent} from '@/types/bulkEmail'

const CATEGORY='Email Campaign'
function payload(body:any){
 const name=String(body.name||'').trim().slice(0,120),subject=String(body.subject||'').trim().slice(0,300),previewText=String(body.previewText||'').trim().slice(0,300),fromName=String(body.fromName||'').trim().slice(0,160),couponCode=String(body.couponCode||'').trim().slice(0,100),content=validateCampaignContent(body.content)
 if(!name||!subject)throw new SaaSError('INVALID_INPUT','Template name and subject are required.',400)
 return{name,document:{version:1,subject,previewText,fromName,couponCode,content}}
}

function parse(row:any){try{const document=JSON.parse(row.body);if(document?.version!==1||!document.content)return null;return{id:row.id,name:row.title,updatedAt:row.updated_at,...document}}catch{return null}}

export async function GET(){try{const ctx=await requireWorkspace(null,'campaigns');const result=await supabase.from('templates').select('id,title,body,updated_at').eq('client_id',ctx.workspaceId).eq('category',CATEGORY).order('updated_at',{ascending:false}).limit(100);if(result.error)throw result.error;return NextResponse.json((result.data||[]).map(parse).filter(Boolean),{headers:{'Cache-Control':'private, max-age=15, stale-while-revalidate=30'}})}catch(error){return saasError(error)}}

export async function POST(req:NextRequest){try{const ctx=await requireWorkspace(null,'campaigns',true),value=payload(await req.json()),shortcode=`/email-${value.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,45)||'template'}-${randomUUID().slice(0,8)}`,result=await supabase.from('templates').insert({client_id:ctx.workspaceId,title:value.name,category:CATEGORY,body:JSON.stringify(value.document),shortcode,variables:['first_name','name','coupon_code','store_name']}).select('id,title,body,updated_at').single();if(result.error)throw result.error;return NextResponse.json(parse(result.data),{status:201})}catch(error){return saasError(error)}}

export async function PATCH(req:NextRequest){try{const ctx=await requireWorkspace(null,'campaigns',true),body=await req.json(),id=String(body.id||''),value=payload(body);if(!id)throw new SaaSError('INVALID_INPUT','Template identifier is required.',400);const result=await supabase.from('templates').update({title:value.name,body:JSON.stringify(value.document),updated_at:new Date().toISOString()}).eq('id',id).eq('client_id',ctx.workspaceId).eq('category',CATEGORY).select('id,title,body,updated_at').maybeSingle();if(result.error)throw result.error;if(!result.data)throw new SaaSError('NOT_FOUND','Email template not found.',404);return NextResponse.json(parse(result.data))}catch(error){return saasError(error)}}

export async function DELETE(req:NextRequest){try{const ctx=await requireWorkspace(null,'campaigns',true),id=String(req.nextUrl.searchParams.get('id')||'');if(!id)throw new SaaSError('INVALID_INPUT','Template identifier is required.',400);const result=await supabase.from('templates').delete().eq('id',id).eq('client_id',ctx.workspaceId).eq('category',CATEGORY).select('id').maybeSingle();if(result.error)throw result.error;if(!result.data)throw new SaaSError('NOT_FOUND','Email template not found.',404);return new NextResponse(null,{status:204})}catch(error){return saasError(error)}}
