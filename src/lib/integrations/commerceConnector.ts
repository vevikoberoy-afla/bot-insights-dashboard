import crypto from 'node:crypto'
import { supabase } from '@/lib/supabase'
import { decryptConfigSecrets } from '@/lib/security/secretVault'
import { assertSafeOutboundUrl, safeOutboundFetch } from '@/lib/urlSecurity'
import { stitchContact } from '@/lib/leadCapture/stitchContact'

type Platform='shopify'|'woocommerce'
type Connection={id:string;client_id:string;integration_id:string;platform:Platform;store_domain:string;status:string;settings:any}
type Product={externalId:string;updatedAt?:string;sku:string;name:string;description:string;imageUrl?:string;price:number;currency:string;stock:number;status:'active'|'draft'|'archived';url?:string;categories:any[];tags:string[];vendor?:string;variants:Variant[];raw:any}
type Variant={externalId:string;sku?:string;barcode?:string;title:string;options:any;price:number;compareAt?:number;imageUrl?:string;stock:number;inventoryId?:string;weight?:number;weightUnit?:string;purchasable:boolean}
type Order={externalId:string;updatedAt?:string;reference:string;name:string;email:string;phone?:string;status:string;paymentStatus?:string;fulfilmentStatus?:string;subtotal:number;total:number;currency:string;address:any;tracking:any;items:any[];raw:any}

const checksum=(value:any)=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
const blockedExternalField=/password|secret|token|authorization|cookie|card|cvv|gateway|payment_method|client_ip|browser_ip|customer_note|note_attributes|internal_note/i
const sanitizeExternalPayload=(value:any,depth=0):any=>{if(depth>8)return undefined;if(Array.isArray(value))return value.slice(0,250).map(item=>sanitizeExternalPayload(item,depth+1));if(value&&typeof value==='object'){const clean:Record<string,any>={};for(const[key,child]of Object.entries(value)){if(blockedExternalField.test(key))continue;const safe=sanitizeExternalPayload(child,depth+1);if(safe!==undefined)clean[key]=safe}return clean}if(typeof value==='string')return value.slice(0,5000);return value}
const money=(value:any)=>Number.parseFloat(String(value??0))||0
const text=(value:any)=>String(value??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim()
const iso=(value:any)=>{const date=value?new Date(value):null;return date&&!Number.isNaN(date.getTime())?date.toISOString():undefined}
const orderStatus=(value:string)=>/cancel|refund|fail/i.test(value)?'cancelled':/complete|fulfill|deliver/i.test(value)?'fulfilled':/process|hold|partial/i.test(value)?'processing':'placed'

async function loadConnection(connectionId:string,clientId?:string){
 let query=supabase.from('commerce_store_connections').select('*').eq('id',connectionId)
 if(clientId)query=query.eq('client_id',clientId)
 const {data:connection,error}=await query.maybeSingle();if(error||!connection)throw new Error('Store connection not found')
 const {data:integration}=await supabase.from('channel_integrations').select('id,client_id,channel,config,status').eq('id',connection.integration_id).eq('client_id',connection.client_id).maybeSingle()
 if(!integration||integration.status!=='active'||integration.channel!==connection.platform)throw new Error('Store credentials are unavailable')
 return{connection:connection as Connection,config:decryptConfigSecrets(connection.client_id,integration.config||{})}
}

async function shopifyGraphql(connection:Connection,config:any,query:string,variables:any={}){
 const domain=String(config.shop_domain||connection.store_domain||'').toLowerCase().replace(/^https?:\/\//,'').replace(/\/$/,'')
 if(!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain))throw new Error('Use the permanent .myshopify.com store domain')
 const url=`https://${domain}/admin/api/${String(config.api_version||process.env.SHOPIFY_API_VERSION||'2026-10')}/graphql.json`
 const response=await safeOutboundFetch(url,{method:'POST',headers:{'content-type':'application/json','x-shopify-access-token':String(config.access_token||'')},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(20000)})
 const body=await response.json();if(!response.ok||body.errors?.length)throw new Error(body.errors?.[0]?.message||`Shopify returned ${response.status}`);return body.data
}

async function wooRequest(connection:Connection,config:any,path:string,params:Record<string,string|number|undefined>={},method='GET',payload?:any){
 const base=String(config.store_url||connection.store_domain||'').replace(/\/$/,'');await assertSafeOutboundUrl(base)
 const url=new URL(`${base}/wp-json/wc/v3/${path.replace(/^\//,'')}`);for(const [key,value] of Object.entries(params))if(value!==undefined)url.searchParams.set(key,String(value))
 const authorization=Buffer.from(`${config.consumer_key||''}:${config.consumer_secret||''}`).toString('base64')
 const response=await safeOutboundFetch(url,{method,headers:{accept:'application/json','content-type':'application/json',authorization:`Basic ${authorization}`},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(20000)})
 const body=await response.json();if(!response.ok)throw new Error(body?.message||`WooCommerce returned ${response.status}`);return{body,response}
}

function shopifyProduct(node:any,shopDomain:string,currency='INR'):Product{
 const variants=(node.variants?.nodes||[]).map((variant:any):Variant=>({externalId:String(variant.id),sku:variant.sku||undefined,barcode:variant.barcode||undefined,title:variant.title||'',options:Object.fromEntries((variant.selectedOptions||[]).map((option:any)=>[option.name,option.value])),price:money(variant.price),compareAt:variant.compareAtPrice?money(variant.compareAtPrice):undefined,imageUrl:variant.image?.url,stock:Number(variant.inventoryQuantity||0),inventoryId:variant.inventoryItem?.id,weight:variant.weight?Number(variant.weight):undefined,weightUnit:variant.weightUnit,purchasable:node.status==='ACTIVE'}))
 const first=variants[0]
 return{externalId:String(node.id),updatedAt:iso(node.updatedAt),sku:first?.sku||`shopify-${String(node.id).split('/').pop()}`,name:node.title||'Product',description:text(node.descriptionHtml||node.description),imageUrl:node.featuredImage?.url||node.images?.nodes?.[0]?.url,price:first?.price||0,currency,stock:variants.reduce((sum:number,item:Variant)=>sum+item.stock,0),status:node.status==='ACTIVE'?'active':node.status==='ARCHIVED'?'archived':'draft',url:`https://${shopDomain}/products/${node.handle}`,categories:(node.collections?.nodes||[]).map((item:any)=>({id:item.id,name:item.title})),tags:node.tags||[],vendor:node.vendor||undefined,variants,raw:node}
}

function shopifyRestProduct(node:any,shopDomain:string):Product{
 return shopifyProduct({...node,id:`gid://shopify/Product/${node.id}`,status:String(node.status||'draft').toUpperCase(),updatedAt:node.updated_at,descriptionHtml:node.body_html,featuredImage:node.image?{url:node.image.src}:undefined,images:{nodes:(node.images||[]).map((image:any)=>({url:image.src}))},collections:{nodes:[]},variants:{nodes:(node.variants||[]).map((variant:any)=>({...variant,id:`gid://shopify/ProductVariant/${variant.id}`,price:variant.price,compareAtPrice:variant.compare_at_price,inventoryQuantity:variant.inventory_quantity,selectedOptions:[],inventoryItem:{id:String(variant.inventory_item_id||variant.id)}}))}},shopDomain,node.variants?.[0]?.currency||'INR')
}

function wooProduct(node:any,currency='INR'):Product{
 const images=node.images||[],variations=Array.isArray(node.variations)?node.variations:[]
 const variants:Variant[]=variations.length?variations.map((entry:any)=>{const variant=typeof entry==='object'?entry:{id:entry};return{externalId:String(variant.id),sku:variant.sku||undefined,title:(variant.attributes||[]).map((item:any)=>item.option).filter(Boolean).join(' / ')||`Variant ${variant.id}`,options:Object.fromEntries((variant.attributes||[]).map((item:any)=>[item.name,item.option])),price:money(variant.price??node.price),compareAt:variant.regular_price?money(variant.regular_price):undefined,imageUrl:variant.image?.src||images[0]?.src,stock:Number(variant.stock_quantity??node.stock_quantity??0),weight:variant.weight?Number(variant.weight):undefined,purchasable:variant.purchasable!==false}}): [{externalId:String(node.id),sku:node.sku||undefined,title:node.name||'',options:Object.fromEntries((node.attributes||[]).map((item:any)=>[item.name,(item.options||[]).join(', ')])),price:money(node.price),compareAt:node.regular_price?money(node.regular_price):undefined,imageUrl:images[0]?.src,stock:Number(node.stock_quantity||0),weight:node.weight?Number(node.weight):undefined,purchasable:node.purchasable!==false}]
 return{externalId:String(node.id),updatedAt:iso(node.date_modified_gmt||node.date_modified),sku:node.sku||`woo-${node.id}`,name:node.name||'Product',description:text(node.description||node.short_description),imageUrl:images[0]?.src,price:money(node.price),currency,stock:Number(node.stock_quantity||0),status:node.status==='publish'?'active':node.status==='draft'?'draft':'archived',url:node.permalink,categories:(node.categories||[]).map((item:any)=>({id:String(item.id),name:item.name})),tags:(node.tags||[]).map((item:any)=>item.name),vendor:node.brands?.[0]?.name,variants,raw:node}
}

function shopifyOrder(node:any):Order{
 const address=node.shippingAddress||node.billingAddress||{},fulfilments=node.fulfillments||[],tracking=fulfilments.flatMap((item:any)=>item.trackingInfo||[])
 return{externalId:String(node.id),updatedAt:iso(node.updatedAt),reference:String(node.name||node.id),name:[node.customer?.firstName,node.customer?.lastName].filter(Boolean).join(' ')||node.billingAddress?.name||'Store customer',email:node.email||node.customer?.email||'',phone:node.phone||node.customer?.phone||undefined,status:orderStatus(node.cancelledAt?'cancelled':node.displayFulfillmentStatus||node.displayFinancialStatus||''),paymentStatus:node.displayFinancialStatus,fulfilmentStatus:node.displayFulfillmentStatus,subtotal:money(node.subtotalPriceSet?.shopMoney?.amount),total:money(node.totalPriceSet?.shopMoney?.amount),currency:node.totalPriceSet?.shopMoney?.currencyCode||'INR',address,tracking:{items:tracking,fulfilments},items:(node.lineItems?.nodes||[]).map((item:any)=>({externalId:String(item.id),productId:item.product?.id,variantId:item.variant?.id,sku:item.sku,name:item.name,quantity:item.quantity,price:money(item.originalUnitPriceSet?.shopMoney?.amount)})),raw:node}
}

function shopifyRestOrder(node:any):Order{
 return shopifyOrder({...node,id:`gid://shopify/Order/${node.id}`,name:node.name||String(node.order_number||node.id),updatedAt:node.updated_at,cancelledAt:node.cancelled_at,displayFinancialStatus:String(node.financial_status||'').toUpperCase(),displayFulfillmentStatus:String(node.fulfillment_status||'UNFULFILLED').toUpperCase(),customer:node.customer?{firstName:node.customer.first_name,lastName:node.customer.last_name,email:node.customer.email,phone:node.customer.phone}:undefined,billingAddress:node.billing_address?{...node.billing_address,name:node.billing_address.name}:undefined,shippingAddress:node.shipping_address?{...node.shipping_address,name:node.shipping_address.name,address1:node.shipping_address.address1,address2:node.shipping_address.address2,province:node.shipping_address.province,zip:node.shipping_address.zip,countryCodeV2:node.shipping_address.country_code}:undefined,subtotalPriceSet:{shopMoney:{amount:node.subtotal_price,currencyCode:node.currency}},totalPriceSet:{shopMoney:{amount:node.total_price,currencyCode:node.currency}},fulfillments:(node.fulfillments||[]).map((item:any)=>({...item,trackingInfo:[{company:item.tracking_company,number:item.tracking_number,url:item.tracking_url}]})),lineItems:{nodes:(node.line_items||[]).map((item:any)=>({...item,id:String(item.id),product:item.product_id?{id:`gid://shopify/Product/${item.product_id}`}:null,variant:item.variant_id?{id:`gid://shopify/ProductVariant/${item.variant_id}`}:null,originalUnitPriceSet:{shopMoney:{amount:item.price}}}))}})
}

function wooOrder(node:any):Order{
 const billing=node.billing||{},shipping=node.shipping||{},tracking=(node.meta_data||[]).filter((item:any)=>/tracking|shipment/i.test(item.key||''))
 return{externalId:String(node.id),updatedAt:iso(node.date_modified_gmt||node.date_modified),reference:String(node.number||node.id),name:[billing.first_name,billing.last_name].filter(Boolean).join(' ')||'Store customer',email:billing.email||'',phone:billing.phone||undefined,status:orderStatus(node.status||''),paymentStatus:node.status,fulfilmentStatus:/completed/.test(node.status)?'fulfilled':'unfulfilled',subtotal:(node.line_items||[]).reduce((sum:number,item:any)=>sum+money(item.subtotal),0),total:money(node.total),currency:node.currency||'INR',address:Object.keys(shipping).length?shipping:billing,tracking:{items:tracking},items:(node.line_items||[]).map((item:any)=>({externalId:String(item.id),productId:String(item.product_id),variantId:String(item.variation_id||item.product_id),sku:item.sku,name:item.name,quantity:item.quantity,price:money(item.price)})),raw:node}
}

async function upsertProduct(connection:Connection,product:Product){
 const now=new Date().toISOString(),hash=checksum({name:product.name,price:product.price,stock:product.stock,status:product.status,variants:product.variants})
 const {data:existing}=await supabase.from('catalog_products').select('id,external_updated_at,raw_checksum').eq('client_id',connection.client_id).eq('store_connection_id',connection.id).eq('external_object_id',product.externalId).maybeSingle()
 if(existing?.raw_checksum===hash){await supabase.from('catalog_products').update({last_synced_at:now,sync_status:'synced'}).eq('id',existing.id);return{changed:false,id:existing.id}}
 if(existing?.external_updated_at&&product.updatedAt&&new Date(existing.external_updated_at)>new Date(product.updatedAt))return{changed:false,id:existing.id}
 const row={client_id:connection.client_id,store_connection_id:connection.id,platform:connection.platform,external_object_id:product.externalId,sku:product.sku.slice(0,180),name:product.name,description:product.description,image_url:product.imageUrl||null,price:product.price,currency:product.currency,stock_quantity:Math.max(0,product.stock),status:product.status,attributes:{source:connection.platform,raw_id:product.externalId},product_url:product.url||null,categories:product.categories,tags:product.tags,vendor:product.vendor||null,external_updated_at:product.updatedAt||now,sync_status:'synced',last_synced_at:now,last_sync_error:null,raw_checksum:hash,updated_at:now}
 const result=existing?await supabase.from('catalog_products').update(row).eq('id',existing.id).select('id').single():await supabase.from('catalog_products').insert(row).select('id').single();if(result.error)throw new Error(result.error.message)
 const productId=result.data.id
 for(const variant of product.variants){const vhash=checksum(variant);const vrow={client_id:connection.client_id,store_connection_id:connection.id,platform:connection.platform,external_object_id:variant.externalId,product_id:productId,sku:variant.sku||null,barcode:variant.barcode||null,title:variant.title,option_values:variant.options,price:variant.price,compare_at_price:variant.compareAt||null,currency:product.currency,image_url:variant.imageUrl||null,weight:variant.weight||null,weight_unit:variant.weightUnit||null,available_quantity:Math.max(0,variant.stock),stock_management_enabled:true,backorder_policy:'deny',purchasable:variant.purchasable,external_updated_at:product.updatedAt||now,sync_status:'synced',last_synced_at:now,last_sync_error:null,raw_checksum:vhash,updated_at:now};const saved=await supabase.from('commerce_product_variants').upsert(vrow,{onConflict:'client_id,store_connection_id,external_object_id'}).select('id').single();if(saved.error)throw new Error(saved.error.message);await supabase.from('commerce_inventory_levels').upsert({client_id:connection.client_id,store_connection_id:connection.id,platform:connection.platform,external_object_id:variant.inventoryId||variant.externalId,variant_id:saved.data.id,external_location_id:'aggregate',location_name:'All locations',available_quantity:Math.max(0,variant.stock),stock_status:variant.stock>0?'in_stock':'out_of_stock',external_updated_at:product.updatedAt||now,sync_status:'synced',last_synced_at:now,raw_checksum:vhash},{onConflict:'client_id,store_connection_id,external_object_id,external_location_id'})}
 return{changed:true,id:productId}
}

async function upsertOrder(connection:Connection,order:Order){
 const now=new Date().toISOString(),hash=checksum({status:order.status,total:order.total,tracking:order.tracking,items:order.items})
 const {data:existing}=await supabase.from('commerce_orders').select('id,external_updated_at,raw_checksum').eq('client_id',connection.client_id).eq('store_connection_id',connection.id).eq('external_object_id',order.externalId).maybeSingle()
 if(existing?.raw_checksum===hash){await supabase.from('commerce_orders').update({last_synced_at:now,sync_status:'synced'}).eq('id',existing.id);return false}
 const row={client_id:connection.client_id,store_connection_id:connection.id,platform:connection.platform,external_object_id:order.externalId,reference:order.reference.replace(/^#/,'').slice(0,120),customer_name:order.name,customer_email:order.email||`unknown-${order.externalId.replace(/\W/g,'')}@order.invalid`,customer_phone:order.phone||null,channel:connection.platform,status:order.status,subtotal:order.subtotal,total:order.total,currency:order.currency,shipping_address:order.address||{},idempotency_key:`${connection.platform}:${connection.id}:${order.externalId}`,payment_status:order.paymentStatus||null,fulfilment_status:order.fulfilmentStatus||null,tracking:order.tracking||{},external_updated_at:order.updatedAt||now,sync_status:'synced',last_synced_at:now,last_sync_error:null,raw_checksum:hash,external_payload:{source:connection.platform,external_id:order.externalId},updated_at:now}
 const result=existing?await supabase.from('commerce_orders').update(row).eq('id',existing.id).select('id').single():await supabase.from('commerce_orders').insert(row).select('id').single();if(result.error)throw new Error(result.error.message)
 const orderId=result.data.id
 for(const item of order.items){
  const {data:product}=await supabase.from('catalog_products').select('id').eq('client_id',connection.client_id).eq('store_connection_id',connection.id).eq('external_object_id',String(item.productId||'')).maybeSingle()
  if(!product)continue
  const quantity=Math.max(1,Number(item.quantity||1)),unitPrice=Math.max(0,money(item.price))
  const itemRow={order_id:orderId,product_id:product.id,quantity,unit_price:unitPrice,name:String(item.name||'Product'),sku:String(item.sku||`external-${item.productId||item.externalId}`),external_line_item_id:String(item.externalId),external_variant_id:item.variantId?String(item.variantId):null,external_product_id:item.productId?String(item.productId):null}
  const itemResult=await supabase.from('commerce_order_items').upsert(itemRow,{onConflict:'order_id,external_line_item_id'})
  if(itemResult.error)throw new Error(itemResult.error.message)
 }
 await stitchContact({clientId:connection.client_id,incomingName:order.name,incomingEmail:order.email||undefined,incomingPhone:order.phone,source:'message_extraction',customProperties:{commerce_platform:connection.platform,external_order_id:order.externalId,shipping_address:order.address}})
 for(const [index,tracking] of (order.tracking?.items||[]).entries()){
  const externalId=String(tracking.id||tracking.number||tracking.tracking_number||`${order.externalId}:${index}`)
  await supabase.from('commerce_fulfilments').upsert({client_id:connection.client_id,store_connection_id:connection.id,platform:connection.platform,external_object_id:externalId,order_id:orderId,status:order.fulfilmentStatus||'pending',carrier:tracking.company||tracking.carrier||null,tracking_number:tracking.number||tracking.tracking_number||null,tracking_url:tracking.url||tracking.tracking_url||null,metadata:tracking,last_synced_at:now,sync_status:'synced',raw_checksum:checksum(tracking)},{onConflict:'client_id,store_connection_id,external_object_id'})
 }
 return true
}

export async function testCommerceConnection(platform:Platform,config:any){
 const mock={id:'test',client_id:'test',integration_id:'test',platform,store_domain:String(config.shop_domain||config.store_url||''),status:'active',settings:{}} as Connection
 if(platform==='shopify'){const data=await shopifyGraphql(mock,config,'query { shop { id name myshopifyDomain currencyCode timezoneAbbreviation } }');return{name:data.shop.name,domain:data.shop.myshopifyDomain,currency:data.shop.currencyCode}}
 const {body}=await wooRequest(mock,config,'system_status');return{name:body?.environment?.site_title||new URL(config.store_url).hostname,domain:new URL(config.store_url).hostname,currency:body?.settings?.currency||'INR'}
}

async function ensureWebhookSubscriptions(connection:Connection,config:any){
 const publicBase=String(process.env.NEXT_PUBLIC_APP_URL||process.env.APP_URL||'').replace(/\/$/,'')
 if(!publicBase.startsWith('https://'))return{configured:0,warning:'Set NEXT_PUBLIC_APP_URL to an HTTPS origin to register webhooks'}
 if(connection.platform==='shopify'){
  const callback=`${publicBase}/api/integrations/shopify/webhook`,topics=['PRODUCTS_CREATE','PRODUCTS_UPDATE','PRODUCTS_DELETE','ORDERS_CREATE','ORDERS_UPDATED','ORDERS_CANCELLED','ORDERS_FULFILLED','FULFILLMENTS_CREATE','FULFILLMENTS_UPDATE','REFUNDS_CREATE','APP_UNINSTALLED']
  const existing=await shopifyGraphql(connection,config,'query { webhookSubscriptions(first:100) { nodes { topic uri } } }')
  const installed=new Set((existing.webhookSubscriptions?.nodes||[]).filter((item:any)=>item.uri===callback).map((item:any)=>item.topic))
  let configured=0
  for(const topic of topics){if(installed.has(topic))continue;const result=await shopifyGraphql(connection,config,'mutation Hook($topic:WebhookSubscriptionTopic!,$callback:URL!){webhookSubscriptionCreate(topic:$topic,webhookSubscription:{callbackUrl:$callback,format:JSON}){userErrors{field message}webhookSubscription{id}}}',{topic,callback});if(!result.webhookSubscriptionCreate?.userErrors?.length)configured++}
  return{configured}
 }
 const callback=`${publicBase}/api/integrations/woocommerce/webhook`,listed=await wooRequest(connection,config,'webhooks',{per_page:100}),existing=Array.isArray(listed.body)?listed.body:[],topics=['product.created','product.updated','product.deleted','order.created','order.updated','order.deleted','coupon.created','coupon.updated','coupon.deleted']
 let configured=0
 for(const topic of topics){if(existing.some((hook:any)=>hook.topic===topic&&hook.delivery_url===callback&&hook.status==='active'))continue;await wooRequest(connection,config,'webhooks',{},'POST',{name:`Vittain ${topic}`,topic,delivery_url:callback,secret:String(config.webhook_secret||''),status:'active'});configured++}
 return{configured}
}

export async function runCommerceSync(connectionId:string,clientId:string,jobType:'initial'|'manual'|'reconcile'='manual'){
 const {connection,config}=await loadConnection(connectionId,clientId),started=new Date().toISOString()
 const {data:job,error:jobError}=await supabase.from('commerce_sync_jobs').insert({client_id:clientId,store_connection_id:connection.id,job_type:jobType,status:'running',started_at:started,attempts:1}).select('id').single();if(jobError)throw new Error('Apply supabase/104_ecommerce_store_connectors.sql before syncing')
 await supabase.from('commerce_store_connections').update({status:'syncing',last_sync_error:null,updated_at:started}).eq('id',connection.id)
 const stats={products:0,orders:0,skipped:0}
 try{
  try{const hooks=await ensureWebhookSubscriptions(connection,config);await supabase.from('commerce_store_connections').update({permissions:{webhooks:true,...hooks}}).eq('id',connection.id)}catch(webhookError:any){await supabase.from('commerce_store_connections').update({permissions:{webhooks:false,warning:String(webhookError?.message||'Webhook registration failed').slice(0,300)}}).eq('id',connection.id)}
  if(connection.platform==='shopify'){
   const domain=String(config.shop_domain||connection.store_domain).replace(/^https?:\/\//,'').replace(/\/$/,'')
   const shopData=await shopifyGraphql(connection,config,'query { shop { id name myshopifyDomain currencyCode timezoneAbbreviation billingAddress { countryCodeV2 } } }')
   await supabase.from('commerce_store_connections').update({external_store_id:shopData.shop.id,store_name:shopData.shop.name,store_domain:shopData.shop.myshopifyDomain,currency:shopData.shop.currencyCode||'INR',country_code:shopData.shop.billingAddress?.countryCodeV2||null,timezone:shopData.shop.timezoneAbbreviation||null}).eq('id',connection.id)
   let cursor:string|null=null
   for(let page=0;page<5;page++){const data:any=await shopifyGraphql(connection,config,`query Products($after:String){ products(first:50,after:$after,sortKey:UPDATED_AT){ pageInfo{hasNextPage endCursor} nodes{id title descriptionHtml handle status vendor tags updatedAt featuredImage{url} collections(first:20){nodes{id title}} variants(first:100){nodes{id title sku barcode price compareAtPrice inventoryQuantity weight weightUnit selectedOptions{name value} image{url} inventoryItem{id}}}}}}`,{after:cursor});for(const node of data.products.nodes){const result=await upsertProduct(connection,shopifyProduct(node,domain,shopData.shop.currencyCode));result.changed?stats.products++:stats.skipped++}if(!data.products.pageInfo.hasNextPage)break;cursor=data.products.pageInfo.endCursor}
   cursor=null
   for(let page=0;page<3;page++){const data:any=await shopifyGraphql(connection,config,`query Orders($after:String){orders(first:50,after:$after,sortKey:UPDATED_AT){pageInfo{hasNextPage endCursor}nodes{id name email phone updatedAt cancelledAt displayFinancialStatus displayFulfillmentStatus customer{firstName lastName email phone} billingAddress{name} shippingAddress{name address1 address2 city province zip countryCodeV2} subtotalPriceSet{shopMoney{amount currencyCode}} totalPriceSet{shopMoney{amount currencyCode}} fulfillments{id status trackingInfo{company number url}} lineItems(first:100){nodes{id name sku quantity product{id} variant{id} originalUnitPriceSet{shopMoney{amount}}}}}}}`,{after:cursor});for(const node of data.orders.nodes)(await upsertOrder(connection,shopifyOrder(node)))?stats.orders++:stats.skipped++;if(!data.orders.pageInfo.hasNextPage)break;cursor=data.orders.pageInfo.endCursor}
  }else{
   const {body:settings}=await wooRequest(connection,config,'settings/general');const settingMap=Object.fromEntries((Array.isArray(settings)?settings:[]).map((item:any)=>[item.id,item.value]));const storeUrl=String(config.store_url||connection.store_domain).replace(/\/$/,'')
   await supabase.from('commerce_store_connections').update({store_name:new URL(storeUrl).hostname,store_domain:storeUrl,currency:settingMap.woocommerce_currency||'INR',country_code:String(settingMap.woocommerce_default_country||'').split(':')[0]||null,timezone:settingMap.timezone_string||null}).eq('id',connection.id)
   for(let page=1;page<=5;page++){const {body}=await wooRequest(connection,config,'products',{per_page:100,page,orderby:'modified',order:'desc'});if(!Array.isArray(body)||!body.length)break;for(let start=0;start<body.length;start+=10){const hydrated=await Promise.all(body.slice(start,start+10).map(async(node:any)=>{if(node.type==='variable'&&node.variations?.length){const variants=await wooRequest(connection,config,`products/${node.id}/variations`,{per_page:100});return{...node,variations:variants.body}}return node}));for(const node of hydrated){const result=await upsertProduct(connection,wooProduct(node,settingMap.woocommerce_currency||'INR'));result.changed?stats.products++:stats.skipped++}}if(body.length<100)break}
   for(let page=1;page<=3;page++){const {body}=await wooRequest(connection,config,'orders',{per_page:100,page,orderby:'modified',order:'desc'});if(!Array.isArray(body)||!body.length)break;for(const node of body)(await upsertOrder(connection,wooOrder(node)))?stats.orders++:stats.skipped++;if(body.length<100)break}
   for(let page=1;page<=3;page++){const {body}=await wooRequest(connection,config,'coupons',{per_page:100,page});if(!Array.isArray(body)||!body.length)break;for(const coupon of body){await supabase.from('commerce_external_coupons').upsert({client_id:connection.client_id,store_connection_id:connection.id,platform:'woocommerce',external_object_id:String(coupon.id),code:String(coupon.code||'').toUpperCase(),discount_type:coupon.discount_type||'fixed_cart',discount_value:money(coupon.amount),minimum_spend:coupon.minimum_amount?money(coupon.minimum_amount):null,maximum_discount:coupon.maximum_amount?money(coupon.maximum_amount):null,eligible_product_ids:(coupon.product_ids||[]).map(String),eligible_category_ids:(coupon.product_categories||[]).map(String),usage_limit_total:coupon.usage_limit||null,usage_limit_per_customer:coupon.usage_limit_per_user||null,current_usage_count:Number(coupon.usage_count||0),expires_at:iso(coupon.date_expires_gmt||coupon.date_expires),stacking_rules:{individual_use:!!coupon.individual_use,exclude_sale_items:!!coupon.exclude_sale_items},active:!coupon.date_expires||new Date(coupon.date_expires)>new Date(),external_updated_at:iso(coupon.date_modified_gmt||coupon.date_modified),last_synced_at:new Date().toISOString(),sync_status:'synced',raw_checksum:checksum(coupon)},{onConflict:'client_id,store_connection_id,external_object_id'})}if(body.length<100)break}
  }
  const completed=new Date().toISOString();await Promise.all([supabase.from('commerce_sync_jobs').update({status:'completed',stats,completed_at:completed}).eq('id',job.id),supabase.from('commerce_store_connections').update({status:'active',last_synced_at:completed,last_reconciled_at:completed,last_sync_error:null,updated_at:completed}).eq('id',connection.id)])
  return{jobId:job.id,stats,status:'completed'}
 }catch(error:any){const message=String(error?.message||'Sync failed').slice(0,1000);await Promise.all([supabase.from('commerce_sync_jobs').update({status:'failed',error:message,completed_at:new Date().toISOString()}).eq('id',job.id),supabase.from('commerce_store_connections').update({status:'error',last_sync_error:message,updated_at:new Date().toISOString()}).eq('id',connection.id)]);throw error}
}

export async function recordCommerceWebhook(input:{connection:Connection;eventId:string;topic:string;payload:any}){
 const hash=checksum(input.payload),row={client_id:input.connection.client_id,store_connection_id:input.connection.id,platform:input.connection.platform,external_event_id:input.eventId,topic:input.topic,status:'processing',payload:sanitizeExternalPayload(input.payload),payload_checksum:hash}
 const {data,error}=await supabase.from('commerce_webhook_events').insert(row).select('id').maybeSingle();if(error?.code==='23505')return{duplicate:true};if(error)throw error;if(!data)throw new Error('Webhook event could not be recorded')
 try{if(/uninstall/i.test(input.topic)){await supabase.from('commerce_store_connections').update({status:'uninstalled',updated_at:new Date().toISOString()}).eq('id',input.connection.id)}else if(/product/i.test(input.topic)&&/delete/i.test(input.topic)){const id=input.connection.platform==='shopify'?`gid://shopify/Product/${input.payload.id}`:String(input.payload.id);await supabase.from('catalog_products').update({status:'archived',stock_quantity:0,sync_status:'synced',last_synced_at:new Date().toISOString()}).eq('store_connection_id',input.connection.id).eq('external_object_id',id)}else if(/product/i.test(input.topic)){const product=input.connection.platform==='shopify'?(Array.isArray(input.payload.variants)?shopifyRestProduct(input.payload,input.connection.store_domain):shopifyProduct(input.payload,input.connection.store_domain)):wooProduct(input.payload);await upsertProduct(input.connection,product)}else if(/order|fulfillment|refund/i.test(input.topic)){const order=input.connection.platform==='shopify'?(Array.isArray(input.payload.line_items)?shopifyRestOrder(input.payload):shopifyOrder(input.payload)):wooOrder(input.payload);await upsertOrder(input.connection,order)}await supabase.from('commerce_webhook_events').update({status:'processed',processed_at:new Date().toISOString(),payload:null}).eq('id',data.id);await supabase.from('commerce_store_connections').update({last_synced_at:new Date().toISOString()}).eq('id',input.connection.id);return{duplicate:false}}catch(error:any){await supabase.from('commerce_webhook_events').update({status:'failed',error:String(error?.message||error).slice(0,1000)}).eq('id',data.id);throw error}
}

export async function connectionByDomain(platform:Platform,domain:string){const {data}=await supabase.from('commerce_store_connections').select('*').eq('platform',platform).eq('store_domain',domain).in('status',['active','syncing','pending']).maybeSingle();return data as Connection|null}
export async function connectorSecret(connection:Connection){const {data}=await supabase.from('channel_integrations').select('config').eq('id',connection.integration_id).eq('client_id',connection.client_id).maybeSingle();return decryptConfigSecrets(connection.client_id,data?.config||{})}
