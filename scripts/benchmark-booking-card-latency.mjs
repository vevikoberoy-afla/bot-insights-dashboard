import { randomUUID } from 'node:crypto'

const origin=process.env.BENCHMARK_ORIGIN||'http://127.0.0.1:3000'
const botId=process.env.BENCHMARK_BOT_ID||'a1c24249-0bf4-4219-8b0a-cdfe6667f345'
const contextId=process.env.BENCHMARK_CONTEXT_ID||'992da1b3e4b94393a1175032d3ceb53d'
const round=value=>Math.round(value)

async function timedFetch(url,options){
 const started=performance.now(),response=await fetch(url,{...options,signal:AbortSignal.timeout(60_000)})
 const headersMs=round(performance.now()-started),body=await response.json(),bodyMs=round(performance.now()-started)
 if(!response.ok)throw new Error(`${response.status}: ${JSON.stringify(body)}`)
 return {body,headersMs,bodyMs,serverTiming:response.headers.get('server-timing')}
}

const externalSessionId=`booking_latency_${randomUUID()}`
const initialized=await timedFetch(`${origin}/api/chat/init`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({botId,sessionId:externalSessionId})})
const auth={'Content-Type':'application/json','X-Widget-Session-Token':initialized.body.sessionToken}
const first=await timedFetch(`${origin}/api/chat?ctx=${encodeURIComponent(contextId)}&bot=${encodeURIComponent(botId)}&stream=true`,{
 method:'POST',headers:{...auth,Accept:'text/event-stream, application/json'},body:JSON.stringify({question:'I want to book a table',session_id:externalSessionId,history:[],active_flow_id:null}),
})
const firstMessage=first.body.messages?.[0],firstOption=firstMessage?.payload?.branches?.[0]||firstMessage?.payload?.choices?.[0]
let scheduler=null
if(firstMessage&&firstOption){
 scheduler=await timedFetch(`${origin}/api/chat/flow?ctx=${encodeURIComponent(contextId)}&bot=${encodeURIComponent(botId)}`,{
  method:'POST',headers:auth,body:JSON.stringify({session_id:externalSessionId,flow_id:firstMessage.flowId,step_id:firstMessage.stepId,input:{kind:'choice',value:firstOption.value||firstOption.id,label:firstOption.label||firstOption.name,flowId:firstMessage.flowId,stepId:firstMessage.stepId,expectedRevision:Number(firstMessage.payload?.revision||firstMessage.revision||0),actionId:randomUUID()}}),
 })
}
const describe=result=>result&&({headersMs:result.headersMs,bodyMs:result.bodyMs,serverTiming:result.serverTiming,answer:result.body.answer,type:result.body.messages?.[0]?.type,slotCount:result.body.messages?.[0]?.payload?.slots?.length||0,prefetchedDates:Object.keys(result.body.messages?.[0]?.payload?.slotsByDate||{}).length})
console.log(JSON.stringify({origin,initialization:{headersMs:initialized.headersMs,bodyMs:initialized.bodyMs,serverTiming:initialized.serverTiming,path:initialized.body.isNewSession?'new':'existing'},bookingIntent:describe(first),locationToScheduler:describe(scheduler)},null,2))
