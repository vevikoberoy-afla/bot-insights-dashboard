import crypto from 'node:crypto'
import { redis } from '@/lib/redis'
import { consumeUsage, type Entitlements } from '@/lib/saas/entitlements'
import { withTimeout } from '@/lib/utils/withTimeout'
import { BoundedCache } from '@/lib/boundedCache'

const FAST_PERMIT_BATCH = 8
const LOCAL_PERMIT_BATCH = 3
const FAST_STATE_TTL_SECONDS = 15 * 60
const localPermits=new BoundedCache<string,number>({maxEntries:512,maxBytes:128*1024,ttlMs:FAST_STATE_TTL_SECONDS*1000})

const permitScript = `
local blocked = redis.call('GET', KEYS[3])
if blocked then return -2 end
local budget = tonumber(redis.call('GET', KEYS[1]))
if not budget then return -1 end
local current = tonumber(redis.call('GET', KEYS[2]) or '0')
local available = budget - current
if available <= 0 then return -1 end
local grant = math.min(available, tonumber(ARGV[2]))
local n = redis.call('INCRBY', KEYS[2], grant)
redis.call('EXPIRE', KEYS[2], ARGV[1])
if n <= budget then return grant end
return -1
`

export type DeferredUsageReservation = {
  operationId:string
  ready:Promise<void>
  commit:()=>Promise<void>
}

/**
 * Keeps the durable PostgreSQL ledger authoritative without putting its RTT in
 * every model request. One authoritative consume seeds a small Redis permit
 * batch; subsequent turns reserve atomically in Redis and write their unique
 * ledger event after the response. Every small batch re-synchronizes with the
 * database, bounding drift if a process dies or another channel consumes usage.
 */
export function reserveAiUsageFast(clientId:string, entitlements?:Entitlements):DeferredUsageReservation {
  const operationId=`answer:${crypto.randomUUID()}`
  const period=String(entitlements?.period_start||new Date().toISOString().slice(0,7)).replace(/[^0-9A-Za-z_-]/g,'_')
  const base=`saas_fast_usage:v1:${clientId}:ai.credits.monthly:${period}`
  const budgetKey=`${base}:budget`, counterKey=`${base}:counter`, blockedKey=`${base}:blocked`
  let deferredCommit=false
  let committed=false

  const local=localPermits.get(base)||0
  if(local>0){
    localPermits.set(base,local-1)
    deferredCommit=true
  }

  const authoritativeConsume=async()=>{
    const result=await consumeUsage(clientId,'ai.credits.monthly',operationId)
    committed=true
    const remaining=Math.max(0,Number(result?.limit||0)-Number(result?.used||0))
    const budget=Math.min(FAST_PERMIT_BATCH,remaining)
    const localGrant=Math.min(LOCAL_PERMIT_BATCH,budget)
    localPermits.set(base,localGrant)
    await Promise.allSettled([
      redis.set(budgetKey,budget,{ex:FAST_STATE_TTL_SECONDS}),
      redis.set(counterKey,localGrant,{ex:FAST_STATE_TTL_SECONDS}),
      redis.del(blockedKey),
    ])
  }

  const ready=(async()=>{
    if(deferredCommit)return
    try{
      const decision=Number(await withTimeout(redis.eval(permitScript,[budgetKey,counterKey,blockedKey],[String(FAST_STATE_TTL_SECONDS),String(LOCAL_PERMIT_BATCH)]),750,-1))
      if(decision>0){
        localPermits.set(base,decision-1)
        deferredCommit=true
        return
      }
      if(decision===-2)throw new Error('Your workspace allowance has been reached.')
    }catch(error){
      if(error instanceof Error&&/allowance has been reached/i.test(error.message))throw error
      // Redis is an accelerator. Its failure falls back to the authoritative RPC.
    }
    await authoritativeConsume()
  })()

  return {
    operationId,
    ready,
    commit:async()=>{
      await ready
      if(committed||!deferredCommit)return
      try{
        await consumeUsage(clientId,'ai.credits.monthly',operationId)
        committed=true
      }catch(error){
        // Stop issuing fast permits until the next authoritative reconciliation.
        await Promise.allSettled([
          redis.set(blockedKey,1,{ex:60}),
          redis.del(budgetKey),
        ])
        localPermits.delete(base)
        throw error
      }
    },
  }
}
