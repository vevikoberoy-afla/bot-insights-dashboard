import { redis } from '@/lib/redis'

const FLOW_REVISION_TTL_SECONDS = 3 * 24 * 60 * 60

const CLAIM_FLOW_ACTION = `
local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local replay = redis.call('GET', KEYS[2])
if replay then
  return {2, tonumber(replay)}
end
local expected = tonumber(ARGV[1])
if current ~= expected then
  return {0, current}
end
local next = current + 1
redis.call('SET', KEYS[1], tostring(next), 'EX', ARGV[2])
redis.call('SET', KEYS[2], tostring(next), 'EX', ARGV[2])
return {1, next}
`

const safePart = (value: string) => value.replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 180)

function revisionKey(clientId: string, botId: string, sessionId: string, flowId: string) {
  return `chat:flow-revision:${safePart(clientId)}:${safePart(botId)}:${safePart(sessionId)}:${safePart(flowId)}`
}

function resultKey(clientId: string, botId: string, sessionId: string, flowId: string, actionId: string) {
  return `${revisionKey(clientId, botId, sessionId, flowId)}:result:${safePart(actionId)}`
}

function latestResultKey(clientId: string, botId: string, sessionId: string, flowId: string) {
  return `${revisionKey(clientId, botId, sessionId, flowId)}:latest-result`
}

export async function currentFlowRevision(clientId: string, botId: string, sessionId: string, flowId: string) {
  return Number(await redis.get<number | string>(revisionKey(clientId, botId, sessionId, flowId)) || 0)
}

export async function claimFlowAction(input: { clientId: string; botId: string; sessionId: string; flowId: string; expectedRevision: number; actionId: string }) {
  const key = revisionKey(input.clientId, input.botId, input.sessionId, input.flowId)
  const actionKey = `${key}:action:${safePart(input.actionId)}`
  const raw = await redis.eval(CLAIM_FLOW_ACTION, [key, actionKey], [String(input.expectedRevision), String(FLOW_REVISION_TTL_SECONDS)]) as [number | string, number | string]
  const code = Number(raw?.[0] ?? 0)
  return { accepted: code === 1, replay: code === 2, revision: Number(raw?.[1] ?? 0) }
}

export async function initializeFlowRevision(clientId: string, botId: string, sessionId: string, flowId: string) {
  const key = revisionKey(clientId, botId, sessionId, flowId)
  await redis.set(key, 0, { nx: true, ex: FLOW_REVISION_TTL_SECONDS })
  return currentFlowRevision(clientId, botId, sessionId, flowId)
}

export async function completedFlowAction(clientId: string, botId: string, sessionId: string, flowId: string, actionId: string) {
  return redis.get<any>(resultKey(clientId, botId, sessionId, flowId, actionId))
}

export async function latestFlowAction(clientId: string, botId: string, sessionId: string, flowId: string) {
  return redis.get<{revision:number;result:any}>(latestResultKey(clientId,botId,sessionId,flowId))
}

export async function completeFlowAction(clientId: string, botId: string, sessionId: string, flowId: string, actionId: string, result: any) {
  const revision=Number(result?.revision||0)
  await Promise.all([
    redis.set(resultKey(clientId, botId, sessionId, flowId, actionId), result, { ex: FLOW_REVISION_TTL_SECONDS }),
    redis.set(latestResultKey(clientId,botId,sessionId,flowId),{revision,result},{ex:FLOW_REVISION_TTL_SECONDS}),
  ])
}

export function attachFlowRevision<T extends { flow?: any; messages?: any[] }>(result: T, revision: number) {
  if (result.flow) result.flow = { ...result.flow, revision }
  if (Array.isArray(result.messages)) result.messages = result.messages.map(message => ({ ...message, revision, payload: { ...(message.payload || {}), revision } }))
  return result
}
