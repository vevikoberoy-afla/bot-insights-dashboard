import { NextRequest,NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { getAuthenticatedWorkspaceUser } from '@/lib/requestAuth'
import { supabase } from '@/lib/supabase'
import { embed,hashText } from '@/lib/embeddings'
import { invalidateFaqCaches } from '@/lib/manual-qa/invalidation'

type Owner={id:string;client_id:string;name:string}
const faqText=(question:string,answer:string)=>`Question: ${question.trim()}\nAnswer: ${answer.trim()}`
const isFaqDataset=(dataset:any)=>dataset?.created_from==='faq_manager'||dataset?.created_from==='faq_migration'||String(dataset?.source_url||'').startsWith('faq://')||String(dataset?.source_url||'').startsWith('manual-faq://')
function parseFaq(chunk:any,dataset:any){
 const matched=String(chunk.text||'').match(/^Question:\s*([\s\S]*?)\nAnswer:\s*([\s\S]*)$/i)
 return {id:chunk.id,dataset_id:chunk.dataset_id,question:(matched?.[1]||String(chunk.title||'').replace(/^FAQ:\s*/i,'')).trim(),answer:(matched?.[2]||chunk.text||'').trim(),is_active:chunk.active!==false,scope:String(dataset?.source_url||'').includes('global')?'workspace':'bot',created_at:chunk.created_at,updated_at:chunk.updated_at||chunk.created_at};
}
async function getOwner(req:NextRequest,id:string):Promise<Owner|null>{const user=await getAuthenticatedWorkspaceUser(req,'knowledge',req.method!=='GET');if(!user)return null;const {data}=await supabase.from('bots').select('id,client_id,name').eq('id',id).eq('client_id',user.workspaceId).maybeSingle();return data}
async function faqDatasets(bot:Owner){
 const {data:links,error}=await supabase.from('bot_datasets').select('dataset_id,datasets(id,name,source_url,created_from)').eq('bot_id',bot.id)
 if(error)throw error
 return(links||[]).map((link:any)=>link.datasets).filter(isFaqDataset)
}
async function ensureDataset(bot:Owner){
 const sourceUrl=`faq://bot/${bot.id}`
 let {data:dataset,error}=await supabase.from('datasets').select('*').eq('client_id',bot.client_id).eq('source_url',sourceUrl).maybeSingle()
 if(error)throw error
 if(!dataset){const created=await supabase.from('datasets').insert({client_id:bot.client_id,name:'FAQs · '+bot.name,type:'manual',source_url:sourceUrl,crawl_status:'done',description:'Question-and-answer knowledge managed from this bot',purpose:'support',tags:['faq','bot-specific'],status:'ready',chunk_count:0,source_count:0,created_from:'faq_manager'}).select('*').single();if(created.error)throw created.error;dataset=created.data}
 const linked=await supabase.from('bot_datasets').upsert({bot_id:bot.id,dataset_id:dataset.id},{onConflict:'bot_id,dataset_id'});if(linked.error)throw linked.error
 return dataset
}
async function getOwnedChunk(bot:Owner,id:string){
 const datasets=await faqDatasets(bot),ids=datasets.map((x:any)=>x.id)
 if(!ids.length)return null
 const {data,error}=await supabase.from('chunks').select('id,dataset_id,title,text,active,created_at').eq('id',id).in('dataset_id',ids).maybeSingle()
 if(error)throw error
 if(!data)return null
 return{chunk:data,dataset:datasets.find((x:any)=>x.id===data.dataset_id)}
}
async function updateCount(datasetId:string){
 const {count}=await supabase.from('chunks').select('id',{count:'exact',head:true}).eq('dataset_id',datasetId).eq('active',true)
 await supabase.from('datasets').update({chunk_count:count||0,status:'ready',updated_at:new Date().toISOString()}).eq('id',datasetId)
}
function validate(question:any,answer:any){const q=String(question||'').trim(),a=String(answer||'').trim();if(q.length<3||q.length>500)throw new Error('Question must be between 3 and 500 characters');if(a.length<1||a.length>5000)throw new Error('Answer must be between 1 and 5,000 characters');return{question:q,answer:a}}
async function ensureUnique(bot:Owner,question:string,excludeId?:string){const datasets=await faqDatasets(bot),ids=datasets.map((item:any)=>item.id);if(!ids.length)return;const {data,error}=await supabase.from('chunks').select('id,dataset_id,title,text,active').in('dataset_id',ids);if(error)throw error;const normalized=question.trim().toLocaleLowerCase();const duplicate=(data||[]).find((chunk:any)=>chunk.id!==excludeId&&parseFaq(chunk,datasets.find((item:any)=>item.id===chunk.dataset_id)).question.toLocaleLowerCase()===normalized);if(duplicate)throw new Error('This bot already has that FAQ question')}

export async function GET(req:NextRequest, props:{params: Promise<{id:string}>}) {
 const params = await props.params;
 try{const bot=await getOwner(req,params.id);if(!bot)return NextResponse.json({error:'Bot not found'},{status:404});const datasets=await faqDatasets(bot),ids=datasets.map((x:any)=>x.id);if(!ids.length)return NextResponse.json({faqs:[]});const {data,error}=await supabase.from('chunks').select('id,dataset_id,title,text,active,created_at').in('dataset_id',ids).order('created_at',{ascending:false});if(error)throw error;return NextResponse.json({faqs:(data||[]).map((chunk:any)=>parseFaq(chunk,datasets.find((x:any)=>x.id===chunk.dataset_id))).filter((faq:any)=>faq.question&&faq.answer)})}catch(error:any){return NextResponse.json({error:error.message||'Could not load FAQs'},{status:500})}
}

export async function POST(req:NextRequest, props:{params: Promise<{id:string}>}) {
 const params = await props.params;
 try{const bot=await getOwner(req,params.id);if(!bot)return NextResponse.json({error:'Bot not found'},{status:404});const body=await req.json(),input=validate(body.question,body.answer);await ensureUnique(bot,input.question);const dataset=await ensureDataset(bot),text=faqText(input.question,input.answer),embedding=await embed(text),id=randomUUID();const {data,error}=await supabase.from('chunks').insert({id,dataset_id:dataset.id,title:'FAQ: '+input.question.slice(0,180),text,chunk_hash:hashText(text),embedding:JSON.stringify(embedding),source_url:`faq://entry/${id}`,source_type:'faq',active:true}).select('id,dataset_id,title,text,active,created_at').single();if(error)throw error;await updateCount(dataset.id);invalidateFaqCaches({clientId:bot.client_id,question:input.question,embedding,botId:bot.id}).catch(()=>{});return NextResponse.json({faq:parseFaq(data,dataset)},{status:201})}catch(error:any){return NextResponse.json({error:error.message||'Could not create FAQ'},{status:400})}
}

export async function PUT(req:NextRequest, props:{params: Promise<{id:string}>}) {
 const params = await props.params;
 try{const bot=await getOwner(req,params.id);if(!bot)return NextResponse.json({error:'Bot not found'},{status:404});const body=await req.json();if(!body.id)return NextResponse.json({error:'FAQ id is required'},{status:400});const owned=await getOwnedChunk(bot,body.id);if(!owned)return NextResponse.json({error:'FAQ not found'},{status:404});const previous=parseFaq(owned.chunk,owned.dataset),input=validate(body.question??previous.question,body.answer??previous.answer);await ensureUnique(bot,input.question,body.id);const text=faqText(input.question,input.answer),embedding=await embed(text);const {data,error}=await supabase.from('chunks').update({title:'FAQ: '+input.question.slice(0,180),text,chunk_hash:hashText(text),embedding:JSON.stringify(embedding),active:body.is_active===undefined?previous.is_active:Boolean(body.is_active)}).eq('id',body.id).select('id,dataset_id,title,text,active,created_at').single();if(error)throw error;await updateCount(owned.chunk.dataset_id);await Promise.allSettled([invalidateFaqCaches({clientId:bot.client_id,question:previous.question,botId:bot.id}),invalidateFaqCaches({clientId:bot.client_id,question:input.question,embedding,botId:bot.id})]);return NextResponse.json({faq:parseFaq(data,owned.dataset)})}catch(error:any){return NextResponse.json({error:error.message||'Could not update FAQ'},{status:400})}
}

export async function DELETE(req:NextRequest, props:{params: Promise<{id:string}>}) {
 const params = await props.params;
 try{const bot=await getOwner(req,params.id);if(!bot)return NextResponse.json({error:'Bot not found'},{status:404});const faqId=req.nextUrl.searchParams.get('faq_id');if(!faqId)return NextResponse.json({error:'faq_id is required'},{status:400});const owned=await getOwnedChunk(bot,faqId);if(!owned)return NextResponse.json({error:'FAQ not found'},{status:404});const previous=parseFaq(owned.chunk,owned.dataset),deleted=await supabase.from('chunks').delete().eq('id',faqId);if(deleted.error)throw deleted.error;await updateCount(owned.chunk.dataset_id);invalidateFaqCaches({clientId:bot.client_id,question:previous.question,botId:bot.id}).catch(()=>{});return NextResponse.json({success:true})}catch(error:any){return NextResponse.json({error:error.message||'Could not delete FAQ'},{status:400})}
}
