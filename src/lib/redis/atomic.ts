import { redis } from '@/lib/redis'

/**
 * Atomic Compare-And-Set (CAS) for message IDs in Redis.
 * Because Postgres message IDs are UUIDs, we track chronological order
 * using epoch millisecond timestamps (ARGV[2]) while storing the UUID (ARGV[1]).
 *
 * Prevents an out-of-order write or a slower read query from regressing the cached latest ID.
 */
const SET_LAST_ID_IF_GREATER = `
local current_ts = redis.call("GET", KEYS[1] .. ":ts")
local new_ts = tonumber(ARGV[2])

if (not current_ts) or (new_ts >= tonumber(current_ts)) then
  redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[3])
  redis.call("SET", KEYS[1] .. ":ts", ARGV[2], "EX", ARGV[3])
  return 1
end
return 0
`

export async function setLastIdIfGreater(
  sessionId: string,
  newId: string,
  createdAtIso: string,
  ttlSeconds = 3600
): Promise<boolean> {
  if (!sessionId || !newId) return false
  const tsMs = new Date(createdAtIso || Date.now()).getTime()

  try {
    const result = await redis.eval(
      SET_LAST_ID_IF_GREATER,
      [`session_last_id:${sessionId}`],
      [newId, String(tsMs), String(ttlSeconds)]
    )
    return result === 1
  } catch (err) {
    console.warn('[Redis Atomic] setLastIdIfGreater failed:', err)
    return false
  }
}
