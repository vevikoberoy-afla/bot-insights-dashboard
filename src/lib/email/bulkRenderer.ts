import {randomUUID} from 'node:crypto'
import {createClickToken,createEmailToken} from './bulkCrypto'
import type {CampaignBlock,CampaignContent} from '@/types/bulkEmail'

type Product={id:string;name:string;description?:string;image_url?:string;price:number;currency:string;url?:string}
type DynamicVariables={first_name:string;name:string}
export type CompiledBulkEmail={origin:string;html:string;text:string;nonce:string;clickTargets:string[]}
const escape=(value:unknown)=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')
const paragraph=(value:string)=>`<p style="margin:0 0 16px;line-height:1.65;color:#1d1d1f;font-size:15px">${escape(value).replace(/\n/g,'<br>')}</p>`
const mark=(nonce:string,key:string)=>`__VITTAIN_EMAIL_${nonce}_${key}__`

/** Builds the invariant HTML/text layout once for an entire worker batch. */
export function compileBulkEmailTemplate(input:{origin:string;content:CampaignContent;products:Product[];constants:{coupon_code:string;store_name:string};previewText?:string}):CompiledBulkEmail{
 const nonce=randomUUID().replaceAll('-',''),clickTargets:string[]=[]
 const interpolate=(value:string)=>value.replace(/\{\{\s*(first_name|name|coupon_code|store_name)\s*\}\}/gi,(_,rawKey)=>{const key=String(rawKey).toLowerCase();return key==='first_name'||key==='name'?mark(nonce,key):input.constants[key as keyof typeof input.constants]||''})
 const click=(target:string)=>{const index=clickTargets.push(target)-1;return mark(nonce,`CLICK_${index}`)}
 const products=()=>input.products.slice(0,6).map(product=>`<td style="width:50%;padding:8px;vertical-align:top"><div style="border:1px solid #e5e5e7;border-radius:14px;padding:12px;min-height:210px">${product.image_url?`<img src="${escape(product.image_url)}" alt="${escape(product.name)}" width="240" style="width:100%;height:130px;object-fit:cover;border-radius:9px">`:''}<p style="font-size:14px;font-weight:600;margin:10px 0 4px;color:#1d1d1f">${escape(product.name)}</p><p style="font-size:13px;margin:0 0 10px;color:#6e6e73">${escape(product.currency)} ${Number(product.price).toLocaleString()}</p>${product.url?`<a href="${click(product.url)}" style="font-size:13px;color:#0071e3;text-decoration:none">View product →</a>`:''}</div></td>`).reduce((rows,cell,index)=>rows+(index%2===0?`<tr>${cell}`:`${cell}</tr>`),'')+(input.products.length%2?'<td></td></tr>':'')
 const button=(label:string,url:string)=>`<p style="margin:24px 0"><a href="${click(url)}" style="display:inline-block;background:#0071e3;color:white;text-decoration:none;border-radius:10px;padding:12px 20px;font-weight:600">${escape(label||'Learn more')}</a></p>`
 let content='',text=''
 if(input.content.blocks?.length){
  for(const block of input.content.blocks as CampaignBlock[]){
   if(block.type==='heading'){const value=interpolate(block.text);content+=`<h2 style="font-size:24px;line-height:1.2;margin:0 0 16px;color:#1d1d1f">${escape(value)}</h2>`;text+=`${value}\n\n`}
   else if(block.type==='paragraph'){const value=interpolate(block.text);content+=paragraph(value);text+=`${value}\n\n`}
   else if(block.type==='coupon'){const value=interpolate(block.text);content+=`<div style="margin:18px 0;padding:16px;border:1px solid #f2c94c;background:#fff8dd;border-radius:12px;color:#6b4e00;font-size:15px;font-weight:600;text-align:center">${escape(value)}</div>`;text+=`${value}\n\n`}
   else if(block.type==='products'&&input.products.length){content+=`<h2 style="font-size:17px;margin:28px 0 10px">${escape(interpolate(block.heading))}</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${products()}</table>`;text+=`${input.products.map(product=>`${product.name} — ${product.currency} ${product.price}`).join('\n')}\n\n`}
   else if(block.type==='button'){content+=button(block.label,block.url);text+=`${block.label}: ${block.url}\n\n`}
  }
 }else{
  const body=interpolate(input.content.body);content=body.split(/\n\n+/).map(paragraph).join('');text=body
  if(input.content.buttonUrl){content+=button(input.content.buttonLabel||'Learn more',input.content.buttonUrl);text+=`\n\n${input.content.buttonLabel||'Learn more'}: ${input.content.buttonUrl}`}
  if(input.products.length){content+=`<h2 style="font-size:17px;margin:28px 0 10px">Featured products</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${products()}</table>`}
 }
 const unsubscribe=mark(nonce,'UNSUBSCRIBE'),open=mark(nonce,'OPEN')
 const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(input.constants.store_name)}</title></head><body style="margin:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escape(input.previewText||'')}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:white;border:1px solid #e5e5e7;border-radius:18px"><tr><td style="padding:24px 28px;border-bottom:1px solid #eee;font-weight:700">${escape(input.constants.store_name)}</td></tr><tr><td style="padding:30px 28px">${content}</td></tr><tr><td style="padding:20px 28px;background:#fafafa;border-top:1px solid #eee;font-size:12px;line-height:1.5;color:#6e6e73">You received this marketing email because you opted in to updates from ${escape(input.constants.store_name)}. <a href="${unsubscribe}" style="color:#424245">Unsubscribe instantly</a>.</td></tr></table></td></tr></table><img src="${open}" width="1" height="1" alt="" style="display:none"></body></html>`
 return{origin:input.origin,html,text:text.trim(),nonce,clickTargets}
}

/** Injects recipient-specific values and signed links without rebuilding layout. */
export function personalizeCompiledBulkEmail(compiled:CompiledBulkEmail,input:{recipientId:string;variables:DynamicVariables}){
 const unsubscribeToken=createEmailToken(input.recipientId,'unsubscribe'),openToken=createEmailToken(input.recipientId,'open'),unsubscribeUrl=`${compiled.origin}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
 const openUrl=`${compiled.origin}/api/track/open?token=${encodeURIComponent(openToken)}`
 let html=compiled.html.replaceAll(mark(compiled.nonce,'first_name'),escape(input.variables.first_name)).replaceAll(mark(compiled.nonce,'name'),escape(input.variables.name)).replaceAll(mark(compiled.nonce,'UNSUBSCRIBE'),escape(unsubscribeUrl)).replaceAll(mark(compiled.nonce,'OPEN'),escape(openUrl))
 const text=compiled.text.replaceAll(mark(compiled.nonce,'first_name'),input.variables.first_name).replaceAll(mark(compiled.nonce,'name'),input.variables.name)
 compiled.clickTargets.forEach((target,index)=>{const tracked=`${compiled.origin}/api/track/click?token=${encodeURIComponent(createClickToken(input.recipientId,target))}`;html=html.replaceAll(mark(compiled.nonce,`CLICK_${index}`),escape(tracked))})
 return{html,text,unsubscribeUrl}
}

export function renderBulkEmail(input:{origin:string;recipientId:string;campaignId?:string;content:CampaignContent;products:Product[];variables:Record<string,string>;previewText?:string}){
 const compiled=compileBulkEmailTemplate({origin:input.origin,content:input.content,products:input.products,constants:{coupon_code:input.variables.coupon_code||'',store_name:input.variables.store_name||'Updates'},previewText:input.previewText})
 return personalizeCompiledBulkEmail(compiled,{recipientId:input.recipientId,variables:{first_name:input.variables.first_name||'there',name:input.variables.name||input.variables.first_name||'there'}})
}
