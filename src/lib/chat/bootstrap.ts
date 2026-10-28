import { supabase } from '@/lib/supabase'
import { redis } from '@/lib/redis'
import { withTimeout } from '@/lib/utils/withTimeout'
import { isUUID } from '@/lib/utils'
import { journeyPolicyFromFlow } from '@/lib/botJourney'

export const BOT_RUNTIME_COLUMNS = 'id,client_id,system_prompt,bot_tone,tone,response_length,use_emojis,bot_flow,vision_ai_enabled'

export function botRuntimeContext(bot: any) {
  const flow = bot?.bot_flow || {}
  const sections = flow.flow_sections || flow
  return {
    botId: bot.id, datasetIds: [],
    botPrompt: bot.system_prompt || flow.system_prompt || flow.prompt || null,
    botTone: bot.bot_tone || bot.tone || flow.bot_tone || null,
    responseLength: bot.response_length || flow.response_length || null,
    useEmojis: bot.use_emojis ?? flow.use_emojis ?? null,
    visionAiEnabled: !!(bot.vision_ai_enabled ?? flow.vision_ai_enabled),
    journeyPolicy: journeyPolicyFromFlow(flow),
    dataCollectionConfig: {
      askName: !!sections.ask_name, namePrompt: sections.name_prompt || undefined,
      askWhatsapp: !!sections.ask_whatsapp, whatsappPrompt: sections.whatsapp_prompt || undefined,
      askEmail: !!sections.ask_email, emailPrompt: sections.email_prompt || undefined,
      customPoints: Array.isArray(sections.data_collection) ? sections.data_collection : undefined,
    },
  }
}

export async function loadChatLeadState(sessionId:string, extraCacheKey?:string|null) {
  const keys=[
    `sess_contact:${sessionId}`, `lead_declined:${sessionId}`, `lead_ask_count:${sessionId}`,
    `lead_last_ask_turn:${sessionId}`, `lead_asked_fields:${sessionId}`,
  ]
  if(extraCacheKey)keys.push(extraCacheKey)
  const fallback:any[]=[null,true,2,null,[]]
  if(extraCacheKey)fallback.push(null)
  return withTimeout(redis.mget<any>(...keys),300,fallback).catch(()=>fallback)
}

export async function loadChatBootstrap(clientId: string, botId: string, sessionId: string, prefetchedLeadState?:any[]) {
  const timings: Record<string, number> = {}
  const timed = async <T>(name: string, task: PromiseLike<T>) => {
    const start = performance.now()
    try { return await task } finally { timings[name] = Math.round(performance.now() - start) }
  }
  let query = supabase.from('sessions')
    .select(`id,session_id,contact_id,client_id,bot_id,mode,contacts(id,client_id,name,email,phone),bots(${BOT_RUNTIME_COLUMNS})`)
    .eq('client_id', clientId).eq('bot_id', botId)
  query = isUUID(sessionId) ? query.or(`id.eq.${sessionId},session_id.eq.${sessionId}`) : query.eq('session_id', sessionId)
  const [leadState, sessionResult] = await Promise.all([
    timed('boot_lead_redis', prefetchedLeadState ? Promise.resolve(prefetchedLeadState) : loadChatLeadState(sessionId)),
    timed('boot_session', query.maybeSingle()),
  ])
  if (sessionResult.error || !sessionResult.data) throw new Error('Chat session could not be verified')
  const session: any = sessionResult.data
  const contact = Array.isArray(session.contacts) ? session.contacts[0] : session.contacts
  const bot = Array.isArray(session.bots) ? session.bots[0] : session.bots
  if (!bot || bot.client_id !== clientId || (contact && contact.client_id !== clientId)) throw new Error('Chat scope mismatch')
  // A joined database row is authoritative, including nulls for anonymous visitors.
  const hydrated = { id: contact?.id || null, name: contact?.name || null, email: contact?.email || null, phone: contact?.phone || null, hydrated: true }
  timings.boot_contact = 0
  timings.boot_bot_ctx = 0
  return { session, contact: hydrated, botContext: botRuntimeContext(bot), leadState: leadState as any[], timings }
}
