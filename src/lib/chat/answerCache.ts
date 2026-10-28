import { createHash } from 'node:crypto'
import { BoundedCache } from '@/lib/boundedCache'
import { redis } from '@/lib/redis'
import { withTimeout } from '@/lib/utils/withTimeout'

export type PureAnswer = { answer: string; source_url: string | null }
const PURE_ANSWER_TTL_SECONDS = 60 * 60
const localAnswers = new BoundedCache<string, PureAnswer>({maxEntries:512,maxBytes:4*1024*1024,ttlMs:PURE_ANSWER_TTL_SECONDS*1000})
const normalize = (text: string) => text.trim().toLowerCase().replace(/\s+/g,' ')

/**
 * Standalone knowledge questions are safe to reuse without conversation history.
 * Anything operational, personalized, entity-bearing, or referential remains
 * session scoped so a cached answer can never leak one visitor's state to another.
 */
export function isStandaloneKnowledgeQuestion(question:string) {
  const value=normalize(question)
  if(!value||value.length>180)return false
  if(/\b(i|i'm|i've|me|my|mine|we|our|this|that|these|those|it|they|them|above|previous|earlier|again)\b/i.test(value))return false
  if(/\b(order|book|booking|appointment|reservation|return|refund|cancel|track|tracking|ticket|cart|checkout|buy|purchase|stock|inventory|price|cost|availability|available|email|phone|address|account|status)\b/i.test(value))return false
  if(/\b(?:ord|tkt|bkg|sku|trk|inv)[-_a-z0-9]*\b/i.test(value)||/\d/.test(value)||/@/.test(value))return false
  return true
}

export function appendScheduledLeadPrompt(answer: string, prompt?: string) {
  // Preserve the existing no-lead-collection-on-unknown-answers policy.
  const unknown = /do not have|don't have|not available|cannot find|don't know|do not know|unable to find|no information|not mentioned in the knowledge/i.test(answer)
  return prompt && answer.trim() && !unknown && !answer.includes('[HANDOFF]')
    ? `${answer}\n\n${prompt}` : answer
}

export function pureAnswerKey(input: {clientId:string;botId:string;sessionId:string;question:string;history:any[];runtime:unknown;contact:unknown}) {
  const standalone=isStandaloneKnowledgeQuestion(input.question)
  const history = standalone?[]:[...input.history]
  // Back-to-back repetition refers to the same question, not a new subject.
  while (history.length >= 2 && history[history.length-2]?.role === 'user' &&
    history[history.length-1]?.role === 'assistant' &&
    normalize(String(history[history.length-2].content||'')) === normalize(input.question)) history.splice(-2)
  const digest = createHash('sha256').update(JSON.stringify([normalize(input.question),history,input.runtime,input.contact])).digest('hex')
  // Standalone factual answers are shared only inside the same workspace+bot
  // configuration/contact shape. Contextual replies remain session isolated.
  const scope=standalone?'shared':input.sessionId
  return `chat_pure_v3:${input.clientId}:${input.botId}:${scope}:${digest}`
}

export async function readPureAnswer(key: string) {
  const local = localAnswers.get(key)
  if (local) return local
  const remote = await withTimeout(redis.get<PureAnswer>(key),300,null).catch(()=>null)
  if (remote && typeof remote.answer === 'string') { localAnswers.set(key,remote); return remote }
  return null
}

export function rememberPureAnswer(key:string, value:PureAnswer) { localAnswers.set(key,value) }
export async function persistPureAnswer(key:string,value:PureAnswer) { await redis.set(key,value,{ex:PURE_ANSWER_TTL_SECONDS}) }
