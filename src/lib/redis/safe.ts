import { redis } from '@/lib/redis'

const REDIS_TIMEOUT_MS = 3000

/**
 * Wraps any Redis read with a timeout + catch. On any failure, returns `null`
 * (treated identically to a cache miss) instead of throwing — Postgres is
 * always the fallback of last resort, so Redis being down degrades latency,
 * never availability.
 */
export async function safeRedisGet<T = string>(key: string): Promise<T | null> {
  let timer: NodeJS.Timeout | null = null
  try {
    return await Promise.race([
      redis.get<T>(key),
      new Promise<null>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), REDIS_TIMEOUT_MS)
      }),
    ])
  } catch (err: any) {
    if (err?.message === 'timeout') {
      console.warn(`[redis] fast-path read timeout (${REDIS_TIMEOUT_MS}ms) on ${key}, falling back to Postgres`)
    } else {
      console.warn(`[redis] fast-path unavailable on ${key}:`, err?.message || err)
    }
    return null // fail open — never throw out of the hot path
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * Batched multi-key lookup in a single HTTP request (replaces parallel get calls)
 */
export async function safeRedisMGet<T extends any[]>(...keys: string[]): Promise<T | null> {
  if (!keys || keys.length === 0) return null
  let timer: NodeJS.Timeout | null = null
  try {
    return await Promise.race([
      redis.mget<T>(...keys),
      new Promise<null>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), REDIS_TIMEOUT_MS)
      }),
    ])
  } catch (err: any) {
    if (err?.message === 'timeout') {
      console.warn(`[redis] fast-path mget timeout (${REDIS_TIMEOUT_MS}ms), falling back to Postgres`)
    } else {
      console.warn(`[redis] fast-path mget unavailable:`, err?.message || err)
    }
    return null
  } finally {
    if (timer) clearTimeout(timer)
  }
}
