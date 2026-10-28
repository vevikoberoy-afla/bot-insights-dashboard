'use client'
import {useEffect,useRef,useState} from 'react'
import {FileUp,Save,Trash2} from 'lucide-react'
import {toast} from 'sonner'
import type {CampaignBlock,CampaignContent} from '@/types/bulkEmail'
import {fetchDashboardData,readDashboardData} from '@/lib/client/featureDataCache'

type Template={id:string;name:string;subject:string;previewText?:string;fromName?:string;couponCode?:string;content:CampaignContent;updatedAt:string}
type Draft={subject:string;previewText:string;fromName:string;couponCode:string;blocks:CampaignBlock[]}
const newId=()=>crypto.randomUUID?.()||`block-${Date.now()}-${Math.random()}`
const text=(value:unknown,max:number)=>String(value||'').trim().slice(0,max)

function safeBlocks(value:any):CampaignBlock[]{
 const rows=Array.isArray(value)?value.slice(0,20):[]
 return rows.flatMap((block:any):CampaignBlock[]=>{
  const id=newId(),type=String(block?.type||'')
  if(type==='heading'||type==='paragraph'||type==='coupon'){const value=text(block.text,type==='paragraph'?20000:500);return value?[{id,type,text:value} as CampaignBlock]:[]}
  if(type==='products')return[{id,type,heading:text(block.heading,120)||'Featured products'}]
  if(type==='button'){const label=text(block.label,80)||'Learn more',url=text(block.url,2000);try{const parsed=new URL(url);return parsed.protocol==='https:'&&parsed.hostname?[{id,type,label,url}]:[]}catch{return[]}}
  return[]
 })
}

function htmlBlocks(source:string):CampaignBlock[]{
 const document=new DOMParser().parseFromString(source,'text/html'),blocks:CampaignBlock[]=[]
 const visit=(element:Element)=>{if(blocks.length>=20)return;const tag=element.tagName.toLowerCase(),value=text(element.textContent,tag==='p'||tag==='div'||tag==='li'?20000:500);if(/^h[1-6]$/.test(tag)&&value)blocks.push({id:newId(),type:'heading',text:value});else if(['p','li'].includes(tag)&&value)blocks.push({id:newId(),type:'paragraph',text:value});else if(tag==='a'){const href=element.getAttribute('href')||'';try{const url=new URL(href);if(url.protocol==='https:'&&url.hostname)blocks.push({id:newId(),type:'button',label:value||'Learn more',url:url.toString()})}catch{}}else Array.from(element.children).forEach(visit)}
 Array.from(document.body.children).forEach(visit)
 if(!blocks.length&&text(document.body.textContent,20000))blocks.push({id:newId(),type:'paragraph',text:text(document.body.textContent,20000)})
 return blocks
}

export function BulkEmailTemplateLibrary({draft,onApply}:{draft:Draft;onApply:(value:Partial<Draft>)=>void}){
 const[templates,setTemplates]=useState<Template[]>(()=>readDashboardData<Template[]>('/api/email/templates')||[]),[selected,setSelected]=useState(''),[name,setName]=useState(''),[busy,setBusy]=useState(false),file=useRef<HTMLInputElement>(null)
 const load=async(force=false)=>setTemplates(await fetchDashboardData<Template[]>('/api/email/templates',{force}))
 useEffect(()=>{void load().catch(()=>{})},[])
 const body=()=>({name:name.trim(),subject:draft.subject,previewText:draft.previewText,fromName:draft.fromName,couponCode:draft.couponCode,content:{blocks:draft.blocks}})
 const apply=(id:string)=>{setSelected(id);const template=templates.find(item=>item.id===id);if(!template)return;setName(template.name);onApply({subject:template.subject,previewText:template.previewText||'',fromName:template.fromName||draft.fromName,couponCode:template.couponCode||'',blocks:safeBlocks(template.content.blocks)});toast.success(`Loaded “${template.name}”`)}
 const save=async(update=false)=>{if(!name.trim())return toast.error('Enter a template name first.');setBusy(true);try{const response=await fetch('/api/email/templates',{method:update?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body(),...(update?{id:selected}:{})})}),result=await response.json();if(!response.ok)throw new Error(result.error||'Could not save template');await load(true);setSelected(result.id);toast.success(update?'Template updated':'Template saved')}catch(error:any){toast.error(error.message)}finally{setBusy(false)}}
 const remove=async()=>{if(!selected)return;setBusy(true);try{const response=await fetch(`/api/email/templates?id=${encodeURIComponent(selected)}`,{method:'DELETE'});if(!response.ok){const result=await response.json();throw new Error(result.error||'Could not delete template')}setSelected('');setName('');await load(true);toast.success('Template deleted')}catch(error:any){toast.error(error.message)}finally{setBusy(false)}}
 const upload=async(event:React.ChangeEvent<HTMLInputElement>)=>{const picked=event.target.files?.[0];event.target.value='';if(!picked)return;if(picked.size>250_000)return toast.error('Template files must be smaller than 250 KB.');try{const source=await picked.text(),extension=picked.name.split('.').pop()?.toLowerCase();let blocks:CampaignBlock[]=[],metadata:any={};if(extension==='json'){const parsed=JSON.parse(source);metadata=parsed.document||parsed;blocks=safeBlocks(metadata.content?.blocks||metadata.blocks)}else if(extension==='html'||extension==='htm')blocks=htmlBlocks(source);else if(extension==='txt')blocks=[{id:newId(),type:'paragraph',text:text(source,20000)}];else throw new Error('Upload a .json, .html, .htm, or .txt template.');if(!blocks.length)throw new Error('No editable email content was found in this file.');setSelected('');setName(picked.name.replace(/\.[^.]+$/,''));onApply({subject:text(metadata.subject,300)||draft.subject,previewText:text(metadata.previewText,300),fromName:text(metadata.fromName,160)||draft.fromName,couponCode:text(metadata.couponCode,100),blocks});toast.success('Template imported. Review and edit it before previewing.')}catch(error:any){toast.error(error.message||'Could not import template')}}
 return <section className="rounded-2xl border bg-slate-50/70 p-4"><div className="flex flex-wrap items-end gap-3"><label className="min-w-52 flex-1 text-xs font-medium">Prebuilt email template<select value={selected} onChange={event=>apply(event.target.value)} className="mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-sm"><option value="">Start from current design</option>{templates.map(template=><option key={template.id} value={template.id}>{template.name}</option>)}</select></label><button type="button" onClick={()=>file.current?.click()} className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2.5 text-xs font-medium"><FileUp className="h-4 w-4"/>Upload custom template</button><input ref={file} type="file" accept=".json,.html,.htm,.txt,application/json,text/html,text/plain" className="hidden" onChange={upload}/></div><p className="mt-2 text-[11px] text-slate-500">HTML imports are converted into safe editable blocks. Scripts, raw styles, forms, and unsafe links are never stored.</p><div className="mt-3 flex flex-wrap gap-2"><input value={name} onChange={event=>setName(event.target.value)} placeholder="Template name" className="min-w-48 flex-1 rounded-xl border bg-white px-3 py-2 text-sm"/><button type="button" disabled={busy} onClick={()=>save(false)} className="flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"><Save className="h-3.5 w-3.5"/>Save as new</button>{selected&&<><button type="button" disabled={busy} onClick={()=>save(true)} className="rounded-xl border bg-white px-3 py-2 text-xs font-medium disabled:opacity-40">Update selected</button><button type="button" aria-label="Delete template" disabled={busy} onClick={remove} className="rounded-xl border border-red-200 bg-red-50 p-2 text-red-600 disabled:opacity-40"><Trash2 className="h-4 w-4"/></button></>}</div></section>
}
