const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')

const candidates = Array.from({length:15},(_,index)=>({
  offering_type:'product',
  id:`product-${index+1}`,
  name:index===0?'Anniversary Lamp':`Gift option ${index+1}`,
  description:'A thoughtful present',
  price:1000+index,
  currency:'INR',
  available_quantity:5,
  compressed_catalog_line:'premium romantic gift',
  score:1-index/100,
}))
let rpcArgs
let prompt=''
let rpcData=candidates
const supabase={
 rpc:async(name,args)=>{assert.equal(name,'match_bot_offerings_hybrid');rpcArgs=args;return{data:rpcData,error:null}},
 from(table){const q={select(){return q},eq(){return q},limit(){return q},maybeSingle(){return Promise.resolve({data:null,error:null})},then(resolve){resolve({data:table==='catalog_product_availability'?candidates.slice(0,5).map(item=>({...item,status:'active',track_inventory:true,allow_backorder:false})):[],error:null})}};return q},
}
const redis={get:async()=>null,set:async()=>true}
const mocks={
  '@/lib/embeddings':{embed:async()=>[0.1,0.2,0.3]},
  '@/lib/redis':{redis},
  '@/lib/supabase':{supabase},
  '@/lib/gemini':{chatComplete:async messages=>{prompt=messages[1].content;return JSON.stringify({brief:'That is a lovely idea. Here are a few thoughtful options.',items:[{id:'invented-id',reason:'Not allowed'},{id:'product-1',reason:'Thoughtful romantic choice'},{id:'product-2',reason:'Premium gift option'}]})}},
}
const code=ts.transpileModule(fs.readFileSync('src/lib/offeringDiscovery.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
const moduleObject={exports:{}}
vm.runInNewContext(code,{exports:moduleObject.exports,module:moduleObject,require:name=>mocks[name]||require(name),Buffer,Date,console,Intl,Set,Map,Array,String,Number,Math})

async function main(){
 const migration=fs.readFileSync('supabase/066_universal_offering_discovery.sql','utf8')
 assert.doesNotMatch(migration,/FROM\s+(?:catalog_products|booking_services)\s+\w+,\s*\w+\s+configured/i)
 assert.match(migration,/FROM catalog_products p CROSS JOIN configured c/)
 assert.match(migration,/FROM booking_services s CROSS JOIN configured c/)
 const {recommendationScope,discoverOfferings}=moduleObject.exports
 assert.equal(recommendationScope('I want to gift my girlfriend something special'),'product')
 assert.equal(recommendationScope('I feel stressed, can you suggest a relaxing session?'),'service')
 assert.equal(recommendationScope('I need to return a damaged order'),null)
 assert.equal(recommendationScope('Track my order status'),null)
 assert.equal(recommendationScope('Cancel my appointment'),null)
 const result=await discoverOfferings({clientId:'client-1',botId:'bot-1',query:'a special anniversary gift',scope:'product'})
 assert.equal(rpcArgs.p_limit,15)
 assert.equal((prompt.match(/^\[product:/gm)||[]).length,15)
 assert.deepEqual(Array.from(result.items,item=>item.id),['product-1','product-2'])
 assert.equal(result.items.some(item=>item.id==='invented-id'),false)
 assert.match(result.brief,/lovely idea/i)
 assert.equal(result.source,'hybrid_rrf')
 rpcData=[]
 const fallback=await discoverOfferings({clientId:'client-1',botId:'bot-1',query:'a thoughtful romantic surprise',scope:'product'})
 assert.ok(fallback.items.length>0,'empty successful RPC must fall back to real catalogue rows')
 assert.equal(fallback.source,'local_fallback')
 assert.ok(fallback.items.every(item=>candidates.some(candidate=>candidate.id===item.id)))
 console.log('PASS: intent guardrails, Hybrid RRF top-15 prefilter, compact LLM reranking, hallucinated-ID rejection')
}
main().catch(error=>{console.error(error);process.exitCode=1})
