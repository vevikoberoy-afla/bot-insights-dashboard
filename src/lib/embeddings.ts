import { GoogleGenerativeAI } from '@google/generative-ai'
import crypto from 'crypto'
import { redis } from '@/lib/redis'
import { withTimeout } from '@/lib/utils/withTimeout'
import { BoundedCache } from '@/lib/boundedCache'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
// gemini-embedding-001 outputs 3072 dims by default, but supports
// outputDimensionality to constrain to 768 — matching our vector(768) schema
const model = genAI.getGenerativeModel({ model: 'gemini-embedding-001' })

const OUTPUT_DIMS = 768
const EMBED_CACHE_TTL = 86400 // 24h — embeddings are deterministic
const localEmbeddings = new BoundedCache<string, number[]>({maxEntries:256,maxBytes:2*1024*1024,ttlMs:60_000})

export function embeddingCacheKey(text: string) { return `embed_cache:${hashText(text)}` }
export function peekLocalEmbedding(text: string) { return localEmbeddings.get(embeddingCacheKey(text)) || null }

export async function generateAndCacheEmbedding(text: string): Promise<number[]> {
  const cacheKey = embeddingCacheKey(text)
  const result = await model.embedContent({
    content: { parts: [{ text }], role: 'user' },
    // @ts-ignore
    outputDimensionality: OUTPUT_DIMS,
  })
  const vector = result.embedding.values
  localEmbeddings.set(cacheKey,vector)
  // Redis replication is an optimization. Local memory is populated before
  // returning, so a remote cache write must not extend customer TTFT.
  void redis.set(cacheKey, vector, { ex: EMBED_CACHE_TTL }).catch(() => {})
  return vector
}

// Generate 768-dim embedding for a single text string, with Redis caching
export async function embed(text: string, prefetched?: number[] | null): Promise<number[]> {
  const cacheKey = embeddingCacheKey(text)

  if (Array.isArray(prefetched) && prefetched.length === OUTPUT_DIMS) return prefetched
  const local = localEmbeddings.get(cacheKey)
  if (local) return local

  // An optional cache must not delay retrieval when the Redis region is slow.
  try {
    const cached = await withTimeout(redis.get<number[]>(cacheKey), 300, null)
    if (cached && Array.isArray(cached) && cached.length === OUTPUT_DIMS) {
      localEmbeddings.set(cacheKey,cached)
      return cached
    }
  } catch {
    // Redis unavailable — fall through to Gemini
  }

  // Slow path: Gemini API call (~800ms)
  return generateAndCacheEmbedding(text)
}

// Batch embed — Gemini allows up to 100 at once
export async function embedBatch(texts: string[]): Promise<number[][]> {
  const BATCH_SIZE = 50 // stay safe under limits
  const results: number[][] = []

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE)
    const batchResult = await model.batchEmbedContents({
      requests: batch.map(text => ({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text }], role: 'user' },
        // @ts-ignore
        outputDimensionality: OUTPUT_DIMS,
      })),
    })
    results.push(...batchResult.embeddings.map(e => e.values))
  }

  return results
}

// MD5 hash of text — used to skip re-embedding unchanged chunks
export function hashText(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex')
}
