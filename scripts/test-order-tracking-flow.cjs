const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript')
const cache=new Map()
const redis={get:async key=>cache.get(key)||null,set:async(key,value)=>cache.set(key,structuredClone(value)),del:async key=>cache.delete(key),exists:async key=>cache.has(key)?1:0}
const native={id:'native-1',reference:'ORD-NATIVE-1',receipt_number:'RCT-NATIVE-1',customer_email:'native@example.com',customer_phone:'+911234567890',status:'processing',total:500,currency:'INR',created_at:'2030-01-01T00:00:00Z',updated_at:'2030-01-02T00:00:00Z'}
const nativeLines=[{id:'line-1',name:'Tea',sku:'T-1',quantity:2,unit_price:250}]
const legacy={id:'sales-1',order_number:'ORD-LEGACY-1',status:'completed',total_amount:900,currency:'INR',order_date:'2030-01-15T00:00:00Z',updated_at:'2030-01-16T00:00:00Z',contacts:{name:'Legacy Customer',email:'legacy@example.com',phone:'+919999999999'},items:[{id:'erp-line',description:'Internal Product',sku:'IP-1',quantity:3,unit_price:300}]}
const connected={id:'support-1',order_number:'EXT-100',customer_email:'external@example.com',customer_phone:'+919876543210',status:'shipped',fulfillment_status:'in_transit',total_amount:1200,currency:'INR',placed_at:'2030-02-01T00:00:00Z',metadata:{source_snapshot:{tracking_number:'AWB-999',tracking_url:'https://carrier.example/AWB-999',carrier:'Example Express'}},synced_at:new Date().toISOString()}
const connectedLines=[{id:'line-2',name:'Coffee',sku:'C-1',quantity:1,unit_price:1200}]
let externalLookups=0
const supabase={from(table){const filters={};let write=false;const q={select(){return q},eq(column,value){filters[column]=value;return q},ilike(column,value){filters[column]=value;return q},order(){return q},maybeSingle(){return q},upsert(){write=true;return q},single(){return q},then(resolve){let data=null;if(!write&&table==='commerce_orders'&&(filters.reference==='ORD-NATIVE-1'||filters.receipt_number==='RCT-NATIVE-1'))data=native;else if(!write&&table==='commerce_order_items'&&filters.order_id===native.id)data=nativeLines;else if(!write&&table==='commerce_order_events'&&filters.order_id===native.id)data=[{label:'Order placed',created_at:native.created_at}];else if(!write&&table==='sales_orders'&&filters.order_number==='ORD-LEGACY-1')data=legacy;else if(!write&&table==='support_orders'&&filters.order_number==='EXT-100')data=connected;else if(!write&&table==='support_order_items'&&filters.order_id===connected.id)data=connectedLines;resolve({data,error:null})}};return q}}
const mocks={'@/lib/redis':{redis},'@/lib/supabase':{supabase},'@/lib/commerce':{releaseInventoryHolds:async()=>1},'@/lib/customerContacts':{upsertCustomerContact:async input=>({id:'contact-1',...input})},'@/lib/orderResolver':{resolveConnectedOrder:async()=>{externalLookups++;return {status:'not_found'}},persistResolvedOrder:async()=>null}}
const code=ts.transpileModule(fs.readFileSync('src/lib/orderTrackingFlow.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,moduleObject={exports:{}}
vm.runInNewContext(code,{exports:moduleObject.exports,module:moduleObject,require:name=>mocks[name]||require(name),Date,console,String,Number,Object,Array,Math})
const flow=moduleObject.exports.handleOrderTrackingFlow
async function main(){
 assert.equal(await flow({clientId:'client',botId:'bot',sessionId:'unrelated',text:'I want to return ORD-NATIVE-1'}),null)
 cache.set('commerce_flow:client:bot:native',{step:'review'})
 let response=await flow({clientId:'client',botId:'bot',sessionId:'native',text:'Order status Delivered'})
 assert.match(response.answer,/order ID/i)
 assert.equal(cache.has('commerce_flow:client:bot:native'),false)
 response=await flow({clientId:'client',botId:'bot',sessionId:'native',text:'ORD-NATIVE-1'})
 assert.match(response.answer,/security/i)
 response=await flow({clientId:'client',botId:'bot',sessionId:'native',text:'wrong@example.com'})
 assert.match(response.answer,/did not match/i)
 response=await flow({clientId:'client',botId:'bot',sessionId:'native',text:'native@example.com'})
 assert.equal(response.messages[0].type,'order_status_card');assert.equal(response.messages[0].payload.items[0].name,'Tea');assert.equal(response.flow,null)
 assert.equal(externalLookups,0)
 response=await flow({clientId:'client',botId:'bot',sessionId:'receipt',text:'Track order RCT-NATIVE-1'})
 assert.match(response.answer,/security/i)
 response=await flow({clientId:'client',botId:'bot',sessionId:'receipt',text:'+91 12345 67890'})
 assert.equal(response.messages[0].payload.reference,'ORD-NATIVE-1');assert.equal(response.messages[0].payload.source,'commerce')
 assert.equal(externalLookups,0)
 response=await flow({clientId:'client',botId:'bot',sessionId:'legacy',text:'Where is order ORD-LEGACY-1?'})
 assert.match(response.answer,/security/i)
 response=await flow({clientId:'client',botId:'bot',sessionId:'legacy',text:'legacy@example.com'})
 assert.equal(response.messages[0].payload.source,'sales');assert.equal(response.messages[0].payload.items[0].name,'Internal Product')
 assert.equal(externalLookups,0)
 response=await flow({clientId:'client',botId:'bot',sessionId:'connected',text:'Where is order EXT-100?'})
 assert.match(response.answer,/security/i)
 response=await flow({clientId:'client',botId:'bot',sessionId:'connected',text:'+91 98765 43210'})
 assert.equal(response.messages[0].payload.status,'shipped');assert.equal(response.messages[0].payload.trackingNumber,'AWB-999');assert.equal(response.messages[0].payload.items[0].name,'Coffee')
 console.log('PASS: tracking routing, native reference/receipt lookup, legacy internal orders, internal-first resolution, connected orders, identity verification, item/status/total/tracking card')
}
main().catch(error=>{console.error(error);process.exitCode=1})
