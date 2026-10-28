import type { Entitlements } from '@/lib/saas/entitlements'
import { supabase } from '@/lib/supabase'
import { botRuntimeContext } from '@/lib/chat/bootstrap'

type AtomicTurnContext={
 entitlements:Entitlements
 session:any
 bot:any
 dataset_ids:string[]
 faq_match:{answer:string;source_url:string|null}|null
 context_id:string|null
}

// Rolling deployments must not pay for a missing RPC on every message.
let atomicContextAvailable:boolean|undefined

export async function loadAtomicChatTurnContext(input:{clientId:string;botId:string;sessionId:string;question:string}){
 if(atomicContextAvailable===false)return null
 const started=performance.now()
 const {data,error}=await supabase.rpc('load_chat_turn_context_atomic',{
  p_client_id:input.clientId,p_bot_id:input.botId,p_session_id:input.sessionId,p_question:input.question,
 })
 if(error){
  if(['42883','PGRST202'].includes(error.code||'')){atomicContextAvailable=false;return null}
  throw new Error('Chat turn context could not be verified')
 }
 atomicContextAvailable=true
 const value=data as AtomicTurnContext
 if(!value?.session||!value?.bot||value.session.client_id!==input.clientId||value.session.bot_id!==input.botId||value.bot.client_id!==input.clientId)throw new Error('Chat scope mismatch')
 const contact=value.session.contact||null
 if(contact&&contact.client_id!==input.clientId)throw new Error('Chat contact scope mismatch')
 return {
  entitlements:value.entitlements,
  contextId:value.context_id,
  datasetIds:Array.isArray(value.dataset_ids)?value.dataset_ids:[],
  faqMatch:value.faq_match,
  bootstrap:{
   session:value.session,
   contact:{id:contact?.id||null,name:contact?.name||null,email:contact?.email||null,phone:contact?.phone||null,hydrated:true},
   botContext:botRuntimeContext(value.bot),
   timings:{boot_turn_context:Math.round(performance.now()-started),boot_contact:0,boot_bot_ctx:0},
  },
 }
}
