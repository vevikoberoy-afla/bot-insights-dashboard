import { broadcastRealtime, supabase } from '@/lib/supabase'
import { chatRoomChannel, storeInboxChannel } from '@/lib/realtime/channels'
import { redis } from '@/lib/redis'

type PersistFlowTurnInput = {
  contextId: string
  clientId: string
  botId: string
  sessionId: string
  answer: string
  messages: any[]
  interaction: any
  userMessage?: { content:string; clientMessageId?:string; mediaUrl?:string|null; mediaType?:string|null; mediaSizeBytes?:number|null; mediaStoragePath?:string|null }
  /** Session already verified against this workspace by the flow route. */
  verifiedSession?: { id: string; session_id: string }
}

let atomicPersistenceAvailable:boolean|undefined
function fanOut(input:PersistFlowTurnInput,resolvedSessionId:string,now:string,inserted:any[]){
 void Promise.allSettled([
  ...inserted.map(row=>broadcastRealtime(chatRoomChannel(resolvedSessionId),'new_message',row)),
  broadcastRealtime(storeInboxChannel(input.clientId),'inbox_update',{session_id:resolvedSessionId,snippet:(input.userMessage?.content||input.answer).slice(0,40),created_at:now}),
  redis.del(`inbox:msgs:${resolvedSessionId}`).catch(()=>{}),redis.del(`inbox:convos:${input.clientId}`).catch(()=>{}),
 ])
}

/**
 * Durably persists one structured-card action without routing it back through
 * the general chat endpoint. The widget already owns the action visually, so
 * only assistant output is written; the selected card is updated in place.
 */
export async function persistFlowTurn(input: PersistFlowTurnInput) {
  const now = new Date().toISOString()
  const { data: session, error: sessionError } = input.verifiedSession
    ? { data: input.verifiedSession, error: null }
    : await supabase
    .from('sessions')
    .select('id,session_id')
    .eq('client_id', input.clientId)
    .eq('session_id', input.sessionId)
    .maybeSingle()

  if (sessionError) throw sessionError
  if (!session) throw new Error('FLOW_SESSION_NOT_FOUND')
  const resolvedSessionId = session.session_id || input.sessionId

  const lockPreviousCard = async () => {
   if (input.interaction?.flowId) {
    const { data: recent, error } = await supabase
      .from('messages')
      .select('id,metadata')
      .eq('session_id', resolvedSessionId)
      // The next card is inserted concurrently with a timestamp after `now`.
      // Exclude it even when a preview reuses the same step identity.
      .lt('created_at', now)
      .order('created_at', { ascending: false })
      .limit(20)
    if (error) throw error
    const target = (recent || []).find((row: any) =>
      input.interaction.stepId
        ? row.metadata?.stepId === input.interaction.stepId
        : row.metadata?.flowId === input.interaction.flowId
    )
    if (target) {
      const { error: updateError } = await supabase.from('messages').update({
        metadata: {
          ...(target.metadata || {}),
          locked: true,
          selectedValue: input.interaction.value,
          selectedLabel: input.interaction.label
            || (typeof input.interaction.value === 'string' ? input.interaction.value : undefined),
        },
      }).eq('id', target.id)
      if (updateError) throw updateError
    }
   }
  }

  const assistantRows: any[] = input.messages.length > 0
    ? input.messages.map((message, index) => ({
        context_id: input.contextId,
        session_id: resolvedSessionId,
        bot_id: input.botId,
        channel: 'website',
        role: 'assistant',
        content: message.payload?.title || message.payload?.text || message.payload?.name || message.content || input.answer || 'Interactive card',
        message_type: message.type || 'chat',
        metadata: {
          flowId: message.flowId,
          stepId: message.stepId,
          interactive: message.interactive,
          payload: message.payload,
          selectedValue: message.selectedValue,
          selectedLabel: message.selectedLabel,
          locked: Boolean(message.locked),
        },
        created_at: new Date(Date.now() + 10 + index * 15).toISOString(),
      }))
    : [{
        context_id: input.contextId,
        session_id: resolvedSessionId,
        bot_id: input.botId,
        channel: 'website',
        role: 'assistant',
        content: input.answer,
        message_type: 'chat',
        metadata: {},
        created_at: new Date(Date.now() + 10).toISOString(),
      }]
  const rows:any[]=[...(input.userMessage?[{
    context_id:input.contextId,session_id:resolvedSessionId,bot_id:input.botId,channel:'website',role:'user',content:input.userMessage.content,message_type:'chat',
    metadata:{...(input.userMessage.clientMessageId?{client_id:input.userMessage.clientMessageId}:{}),...(input.userMessage.mediaStoragePath?{media_storage_path:input.userMessage.mediaStoragePath}:{})},created_at:now,
    ...(input.userMessage.mediaUrl?{media_url:input.userMessage.mediaUrl,media_type:input.userMessage.mediaType||'image/webp',media_size_bytes:input.userMessage.mediaSizeBytes||null}:{}),
  }]:[]),...assistantRows]

  if(atomicPersistenceAvailable!==false&&typeof (supabase as any).rpc==='function'){
    const originUpdates=input.interaction?.flowId?{locked:true,selectedValue:input.interaction.value,selectedLabel:input.interaction.label||(typeof input.interaction.value==='string'?input.interaction.value:undefined),lockedAt:now}:null
    const atomic=await supabase.rpc('persist_flow_turn_atomic',{p_client_id:input.clientId,p_context_id:input.contextId,p_bot_id:input.botId,p_session_id:resolvedSessionId,p_origin_flow_id:input.interaction?.flowId||null,p_origin_step_id:input.interaction?.stepId||null,p_origin_updates:originUpdates,p_rows:rows})
    if(!atomic.error){atomicPersistenceAvailable=true;const inserted=Array.isArray(atomic.data)?atomic.data:[];fanOut(input,resolvedSessionId,now,inserted);return}
    if(!['42883','PGRST202'].includes(atomic.error.code||'')&&!/persist_flow_turn_atomic|schema cache|does not exist/i.test(atomic.error.message||''))throw atomic.error
    atomicPersistenceAvailable=false
  }

  const [insertResult, sessionUpdate] = await Promise.all([
    supabase
    .from('messages')
    .insert(rows)
    .select('id,session_id,role,content,mode,source_url,channel,media_url,media_type,message_type,metadata,created_at'),
    // Do not overwrite a concurrent human handoff with mode: 'ai'.
    supabase.from('sessions').update({ last_message_at: now }).eq('id', session.id),
    lockPreviousCard(),
  ])
  const { data: inserted, error: insertError } = insertResult
  if (insertError) throw insertError
  if (sessionUpdate.error) throw sessionUpdate.error

  // PostgreSQL is the source of truth. Realtime/cache fan-out is deliberately
  // best effort and may not extend the customer's response critical path.
  fanOut(input,resolvedSessionId,now,inserted||[])
}
