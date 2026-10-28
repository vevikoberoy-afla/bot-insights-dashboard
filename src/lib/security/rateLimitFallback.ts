const buckets = new Map<string, { count: number; resetAt: number }>()

export function localRateLimit(key: string, limit: number, windowMs = 60_000) {
  const now = Date.now()
  if (buckets.size > 5000) {
    buckets.forEach((bucket, bucketKey) => { if (bucket.resetAt <= now) buckets.delete(bucketKey) })
    if (buckets.size > 5000) buckets.clear()
  }
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { success: true, remaining: Math.max(0, limit - 1) }
  }
  bucket.count += 1
  return { success: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count) }
}
