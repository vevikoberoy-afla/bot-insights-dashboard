import { createHash } from 'crypto'
import { supabase } from '@/lib/supabase'
import { checked } from '@/lib/booking'

const int=(value:unknown,min:number,max:number,label:string)=>{const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new Error(`${label} must be ${min}–${max}`);return n}

const importKey=(value:string)=>value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')
const importNumber=(value:unknown,fallback=0)=>{const parsed=Number(String(value??'').replace(/[^0-9.-]/g,''));return Number.isFinite(parsed)?parsed:fallback}
const importBoolean=(value:unknown,fallback:boolean)=>{if(value==null||value==='')return fallback;return !['false','no','n','0','off'].includes(String(value).trim().toLowerCase())}
const importValue=(row:Record<string,any>,aliases:string[])=>aliases.map(importKey).map(key=>row[key]).find(value=>value!=null&&String(value).trim()!=='')
const importSku=(name:string,index:number)=>`${name.toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,72)||'PRODUCT'}-${String(index+1).padStart(3,'0')}`

/** Converts human spreadsheet headings into the catalogue schema. */
export function normalizeProductImportRow(input:any,index=0){
 const row=Object.fromEntries(Object.entries(input||{}).map(([key,value])=>[importKey(key),value]))
 const name=String(importValue(row,['name','product_name','product','item_name','item','title'])||'').trim()
 const rawImages=importValue(row,['images','image_urls','photos']),image=String(importValue(row,['image_url','image','photo','thumbnail','product_image'])||'').trim()
 const images=String(rawImages||'').split(/[|,;\n]/).map(value=>value.trim()).filter(value=>/^https?:\/\//i.test(value))
 const rawCurrency=String(importValue(row,['currency','currency_code'])||'INR').trim().toUpperCase(),currency=rawCurrency==='₹'?'INR':rawCurrency==='$'?'USD':rawCurrency==='£'?'GBP':rawCurrency==='€'?'EUR':rawCurrency
 const rawStatus=String(importValue(row,['status','product_status','state'])||'draft').trim().toLowerCase()
 const sku=String(importValue(row,['sku','product_sku','item_sku','stock_keeping_unit','item_code','product_code','code'])||importSku(name,index)).trim()
 return {
  name,sku,category:String(importValue(row,['category','product_category','type','collection'])||'').trim(),
  description:String(importValue(row,['description','product_description','details','summary'])||'').trim(),
  image_url:image||images[0]||'',images:image&&!images.includes(image)?[image,...images]:images,
  price:importNumber(importValue(row,['price','unit_price','selling_price','sale_price','retail_price','mrp']),0),currency,
  stock_quantity:Math.max(0,Math.trunc(importNumber(importValue(row,['stock_quantity','stock','stock_qty','quantity','inventory','inventory_quantity','available_quantity']),0))),
  low_stock_threshold:Math.max(0,Math.trunc(importNumber(importValue(row,['low_stock_threshold','low_stock','reorder_level','minimum_stock']),5))),
  reorder_quantity:Math.max(0,Math.trunc(importNumber(importValue(row,['reorder_quantity','reorder_qty','restock_quantity']),0))),
  tax_rate:Math.max(0,importNumber(importValue(row,['tax_rate','tax','gst','vat']),0)),
  track_inventory:importBoolean(importValue(row,['track_inventory','track_stock','inventory_tracking']),true),
  allow_backorder:importBoolean(importValue(row,['allow_backorder','backorder','allow_backorders']),false),
  status:['draft','active','archived'].includes(rawStatus)?rawStatus:'draft',
  supplier:{name:String(importValue(row,['supplier','supplier_name','vendor'])||'').trim(),email:String(importValue(row,['supplier_email','vendor_email'])||'').trim(),phone:String(importValue(row,['supplier_phone','vendor_phone'])||'').trim()},
  attributes:{variants:[],related_product_ids:[]},
 }
}

export function validateProduct(input:any) {
 if(typeof input.name!=='string'||input.name.trim().length<2||input.name.length>200)throw new Error('Product name is required')
 if(typeof input.sku!=='string'||!/^[A-Za-z0-9._-]{1,100}$/.test(input.sku))throw new Error('SKU may contain letters, numbers, dots, dashes and underscores')
 const price=Number(input.price);if(!Number.isFinite(price)||price<0||price>100000000)throw new Error('Invalid price')
 if(!['draft','active','archived'].includes(input.status))throw new Error('Invalid product status')
 const attributes=input.attributes&&typeof input.attributes==='object'?input.attributes:{}
 const variants=Array.isArray(attributes.variants)?attributes.variants.slice(0,100).map((v:any)=>({id:String(v.id||crypto.randomUUID()).slice(0,100),name:String(v.name||'').slice(0,150),sku:String(v.sku||'').slice(0,100),price:Number.isFinite(Number(v.price))?Math.max(0,Number(v.price)):price,stock:Math.max(0,Math.trunc(Number(v.stock)||0),),active:v.active!==false})).filter((v:any)=>v.name):[]
 const images=Array.isArray(input.images)?input.images.slice(0,10).map((v:any)=>String(v).slice(0,1500)).filter((v:string)=>/^https?:\/\//i.test(v)):[]
 return {name:input.name.trim(),sku:input.sku.trim(),description:String(input.description||'').slice(0,5000),image_url:input.image_url||images[0]||null,images,
  price:Math.round(price*100)/100,currency:/^[A-Z]{3}$/.test(input.currency)?input.currency:'INR',stock_quantity:int(input.stock_quantity,0,100000000,'Stock'),
  low_stock_threshold:int(input.low_stock_threshold,0,100000000,'Low stock threshold'),track_inventory:input.track_inventory!==false,
  allow_backorder:input.allow_backorder===true,status:input.status,category:String(input.category||'').slice(0,100)||null,
  supplier:input.supplier&&typeof input.supplier==='object'?{name:String(input.supplier.name||'').slice(0,200),email:String(input.supplier.email||'').slice(0,254),phone:String(input.supplier.phone||'').slice(0,50)}:{},
  reorder_quantity:int(input.reorder_quantity||0,0,100000000,'Reorder quantity'),tax_rate:Math.min(100,Math.max(0,Number(input.tax_rate)||0)),
  attributes:{...attributes,variants,related_product_ids:Array.isArray(attributes.related_product_ids)?attributes.related_product_ids.slice(0,20):[]},updated_at:new Date().toISOString()}
}
export async function holdInventory(clientId:string,input:any){return checked(await supabase.rpc('hold_catalog_inventory',{p_client:clientId,p_product:input.product_id,p_session:input.hold_key,p_quantity:int(input.quantity,1,1000,'Quantity'),p_minutes:15}))}
export async function holdInventoryBatch(clientId:string,holdKey:string,items:Array<{product_id:string;quantity:number}>){
 if(typeof holdKey!=='string'||holdKey.length<8)throw new Error('Invalid inventory hold')
 if(!Array.isArray(items)||!items.length||items.length>50)throw new Error('Cart must contain 1–50 products')
 const normalized=items.map(item=>({product_id:item.product_id,quantity:int(item.quantity,1,1000,'Quantity')}))
 const result=await supabase.rpc('hold_catalog_inventory_batch',{p_client:clientId,p_session:holdKey,p_items:normalized,p_minutes:15})
 if(!result.error)return result.data
 // Rolling deployments remain compatible until migration 089 reaches every DB.
 if(!/hold_catalog_inventory_batch|schema cache|does not exist/i.test(result.error.message||''))throw new Error(result.error.message)
 const held:any[]=[]
 for(const item of [...normalized].sort((a,b)=>a.product_id.localeCompare(b.product_id)))held.push(await holdInventory(clientId,{...item,hold_key:holdKey}))
 return{holds:held,count:held.length}
}
export async function releaseInventoryHolds(clientId:string,holdKey:string){
 if(typeof holdKey!=='string'||holdKey.length<8)throw new Error('Invalid inventory hold')
 return checked(await supabase.rpc('release_catalog_holds',{p_client:clientId,p_session:holdKey}))
}
export async function placeOrder(clientId:string,input:any){
 if(typeof input.customer_name!=='string'||input.customer_name.trim().length<2)throw new Error('Customer name is required')
 const email=typeof input.customer_email==='string'?input.customer_email.trim().toLowerCase():''
 const phone=typeof input.customer_phone==='string'?input.customer_phone.trim():''
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter a valid email address')
 if(!/^\+?[0-9\s()-]{7,20}$/.test(phone))throw new Error('A valid phone number is required')
 if(!Array.isArray(input.items)||!input.items.length||input.items.length>50)throw new Error('Cart must contain 1–50 products')
 if(input.coupon_id){
  const [{data:coupon,error:couponError},{data:products,error:productError}]=await Promise.all([supabase.from('coupons').select('id,is_active,expires_at,max_uses,used_count,product_ids,categories,stackable,compatible_offer_ids').eq('client_id',clientId).eq('id',input.coupon_id).maybeSingle(),supabase.from('catalog_products').select('id,category').eq('client_id',clientId).in('id',input.items.map((item:any)=>item.product_id))])
  if(couponError||productError)throw new Error(couponError?.message||productError?.message)
  if(!coupon||coupon.is_active===false||(coupon.expires_at&&new Date(coupon.expires_at)<=new Date())||(coupon.max_uses!=null&&Number(coupon.used_count)>=Number(coupon.max_uses)))throw new Error('Coupon is unavailable')
  const ids=Array.isArray(coupon.product_ids)?coupon.product_ids:[],categories=(Array.isArray(coupon.categories)?coupon.categories:[]).map((value:string)=>value.toLowerCase()),matches=(products||[]).length===new Set(input.items.map((item:any)=>item.product_id)).size&&(products||[]).every((product:any)=>!ids.length&&!categories.length||ids.includes(product.id)||categories.includes(String(product.category||'').toLowerCase()))
  if(!matches)throw new Error('Coupon does not apply to every item in this cart')
  if(input.offer_id&&!(coupon.stackable===true&&Array.isArray(coupon.compatible_offer_ids)&&coupon.compatible_offer_ids.includes(input.offer_id)))throw new Error('This coupon cannot be combined with the selected offer')
 }
 const storedEmail=email||`phone-${phone.replace(/\D/g,'')}@order.invalid`
 const payload={...input,customer_email:storedEmail,customer_phone:phone}
 const operationId=String(input.operation_id||input.idempotency_key||'')
 const sessionId=String(input.session_id||input.hold_key||'')
 const requestHash=createHash('sha256').update(JSON.stringify(payload)).digest('hex')
 const atomic=await supabase.rpc('commit_chat_order',{p_client:clientId,p_session:sessionId,p_operation:operationId,p_request_hash:requestHash,p_input:payload})
 if(!atomic.error)return atomic.data
 if(!/commit_chat_order|schema cache|does not exist/i.test(atomic.error.message||''))throw new Error(atomic.error.message)
 console.warn('[commerce] atomic commit unavailable; apply supabase/091_atomic_chat_commits.sql')
 return checked(await supabase.rpc('place_catalog_order',{p_client:clientId,p_input:payload}))
}
export async function joinCommerceWaitlist(clientId:string,input:any){
 if(typeof input.customer_name!=='string'||input.customer_name.trim().length<2)throw new Error('Customer name is required')
 const email=typeof input.customer_email==='string'?input.customer_email.trim().toLowerCase():''
 const phone=typeof input.customer_phone==='string'?input.customer_phone.trim():''
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('Enter a valid email address')
 if(!email&&!/^\+?[0-9\s()-]{7,20}$/.test(phone))throw new Error('A valid phone number or email address is required')
 return checked(await supabase.rpc('join_commerce_waitlist',{p_client:clientId,p_input:{...input,customer_email:email||`phone-${phone.replace(/\D/g,'')}@order.invalid`,customer_phone:phone||null,quantity:int(input.quantity,1,1000,'Quantity')}}))
}
export async function changeOrder(clientId:string,id:string,status:string){return checked(await supabase.rpc('change_sales_order',{p_client:clientId,p_order:id,p_status:status}))}
export async function adjustInventory(clientId:string,productId:string,delta:number,note:string){return checked(await supabase.rpc('adjust_catalog_inventory',{p_client:clientId,p_product:productId,p_quantity:int(delta,-100000000,100000000,'Adjustment'),p_note:String(note||'Manual adjustment')}))}
export async function orderWithItems(clientId:string,id:string){
 return checked(await supabase.from('commerce_orders').select('*,commerce_order_items(*)').eq('client_id',clientId).eq('id',id).single())
}
