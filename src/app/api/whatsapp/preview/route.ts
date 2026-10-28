import {NextRequest,NextResponse} from 'next/server'
import {requireWorkspace,saasError,SaaSError} from '@/lib/saas/context'
import {supabase} from '@/lib/supabase'
import {validateWhatsAppBindings} from '@/types/bulkWhatsApp'

export async function POST(req:NextRequest){try{
 const ctx=await requireWorkspace(null,'campaigns'),body=await req.json(),templateId=String(body.templateId||''),botId=String(body.botId||'')
 const template=(await supabase.from('whatsapp_templates').select('*').eq('id',templateId).eq('bot_id',botId).eq('client_id',ctx.workspaceId).maybeSingle()).data;if(!template)throw new SaaSError('NOT_FOUND','Template not found.',404)
 const bodyComponent=(template.components_json||[]).find((component:any)=>String(component.type).toUpperCase()==='BODY'),text=String(bodyComponent?.text||''),count=Math.max(0,...Array.from(text.matchAll(/\{\{(\d+)\}\}/g),match=>Number(match[1])))
 let bindings;try{bindings=validateWhatsAppBindings(body.bindings,count)}catch(error:any){throw new SaaSError('INVALID_INPUT',error.message,400)}
 let product:any=null
 if(body.productId){
  const productResult=await supabase.from('catalog_products').select('id,name,price,currency').eq('id',String(body.productId)).eq('client_id',ctx.workspaceId).eq('status','active').maybeSingle()
  if(productResult.error)throw productResult.error
  if(!productResult.data)throw new SaaSError('INVALID_INPUT','The featured product is unavailable.',400)
  const configured=(await supabase.from('bot_commerce_config').select('bot_id').eq('bot_id',botId).maybeSingle()).data
  if(configured){const link=(await supabase.from('bot_catalog_products').select('product_id').eq('bot_id',botId).eq('product_id',String(body.productId)).maybeSingle()).data;if(!link)throw new SaaSError('FORBIDDEN','That product is not assigned to this bot.',403)}
  product=productResult.data
 }
 const sample:any={first_name:'Alex',name:'Alex Morgan',coupon_code:String(body.couponCode||'WELCOME20')||'WELCOME20',store_name:'Your store',product_title:product?.name||'Featured product',product_price:product?`${product.currency||''} ${product.price}`.trim():'INR 1,200'},values=bindings.map(item=>sample[item])
 const rendered=text.replace(/\{\{(\d+)\}\}/g,(_,index)=>values[Number(index)-1]||'-')
 return NextResponse.json({template:{...template,rendered_body:rendered,preview_values:values}})
 }catch(error){return saasError(error)}}
