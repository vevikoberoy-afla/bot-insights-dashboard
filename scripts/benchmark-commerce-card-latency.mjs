import { randomUUID } from 'node:crypto'

const origin=process.env.BENCHMARK_ORIGIN||'http://127.0.0.1:3000'
const botId=process.env.BENCHMARK_BOT_ID||'a1c24249-0bf4-4219-8b0a-cdfe6667f345'
const contextId=process.env.BENCHMARK_CONTEXT_ID||'992da1b3e4b94393a1175032d3ceb53d'
const round=value=>Math.round(value)

async function timedFetch(url,options){
 const started=performance.now(),response=await fetch(url,{...options,signal:AbortSignal.timeout(90_000)})
 const headersMs=round(performance.now()-started),body=await response.json(),bodyMs=round(performance.now()-started)
 if(!response.ok)throw new Error(`${response.status}: ${JSON.stringify(body)}`)
 return {body,headersMs,bodyMs,serverTiming:response.headers.get('server-timing')}
}

async function session(){
 const externalSessionId=`commerce_latency_${randomUUID()}`
 const initialized=await timedFetch(`${origin}/api/chat/init`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({botId,sessionId:externalSessionId})})
 return {externalSessionId,initialized,auth:{'Content-Type':'application/json','X-Widget-Session-Token':initialized.body.sessionToken}}
}

async function chat(run,question){
 return timedFetch(`${origin}/api/chat?ctx=${encodeURIComponent(contextId)}&bot=${encodeURIComponent(botId)}&stream=true`,{method:'POST',headers:{...run.auth,Accept:'text/event-stream, application/json'},body:JSON.stringify({question,session_id:run.externalSessionId,history:[],active_flow_id:null})})
}

async function action(run,message,input){
 return timedFetch(`${origin}/api/chat/flow?ctx=${encodeURIComponent(contextId)}&bot=${encodeURIComponent(botId)}`,{method:'POST',headers:run.auth,body:JSON.stringify({session_id:run.externalSessionId,flow_id:message.flowId,step_id:message.stepId,input:{...input,flowId:message.flowId,stepId:message.stepId,expectedRevision:Number(message.payload?.revision||message.revision||0),actionId:randomUUID()}})})
}

const describe=result=>result&&({headersMs:result.headersMs,bodyMs:result.bodyMs,serverTiming:result.serverTiming,answer:String(result.body.answer||'').slice(0,180),types:(result.body.messages||[]).map(message=>message.type),productCount:(result.body.messages||[]).reduce((count,message)=>count+(message.payload?.products?.length||0),0)})

const deterministic=await session()
let productResult=await chat(deterministic,'I need to order lamp. Do you have it?')
let productCard=(productResult.body.messages||[]).find(message=>message.type==='product_grid')
if(!productCard){
 const searchCard=(productResult.body.messages||[]).find(message=>message.type==='product_search')
 if(searchCard){productResult=await chat(deterministic,'lamp');productCard=(productResult.body.messages||[]).find(message=>message.type==='product_grid')}
}
let cartResult=null,checkoutResult=null,cancelResult=null
const product=(productCard?.payload?.products||[]).find(item=>item.inStock!==false&&Number(item.availableQuantity??1)>0)
if(product){
 cartResult=await action(deterministic,productCard,{kind:'products',value:[{productId:String(product.value||'').replace(/^product:/,''),quantity:1}],label:'Proceed'})
 const cartCard=(cartResult.body.messages||[]).find(message=>message.type==='cart_card')
 if(cartCard){
  checkoutResult=await action(deterministic,cartCard,{kind:'choice',value:'checkout',label:'Proceed'})
  const checkoutCard=(checkoutResult.body.messages||[]).find(message=>message.type==='checkout_form'||message.type==='commerce_offer_picker')
  if(checkoutCard)cancelResult=await action(deterministic,checkoutCard,{kind:'cancel',value:'cancel',label:'Cancel order'})
 }
}

const recommendation=await session()
const recommendationResult=await chat(recommendation,'I want to gift my girlfriend something special. What would you recommend?')

console.log(JSON.stringify({origin,deterministicSearch:{initialization:describe(deterministic.initialized),productCard:describe(productResult),selectedProduct:product?{name:product.name||product.label,sku:product.sku}:null,selectionToCart:describe(cartResult),cartToCheckout:describe(checkoutResult),cleanup:cancelResult?.body?.answer||null},personalizedRecommendation:{initialization:describe(recommendation.initialized),recommendationCard:describe(recommendationResult)}},null,2))
