import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

import { redis } from './redis'

// 60 requests per IP per 1 minute on the chat endpoint
export const chatRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  analytics: false,
  prefix: 'rag_chat',
})

// 30 requests per session per 1 minute (prevents single-session abuse behind shared IPs)
export const sessionRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 m'),
  analytics: false,
  prefix: 'rag_chat_session',
})

// Get real IP from Vercel headers
export function getIP(request: Request): string {
  // Only trust a header when deployment configuration guarantees the proxy
  // overwrites it. Unknown deployments share a conservative fallback bucket.
  const header = process.env.VERCEL === '1' ? 'x-vercel-forwarded-for'
    : process.env.TRUSTED_PROXY === 'cloudflare' ? 'cf-connecting-ip'
    : process.env.TRUSTED_PROXY === 'reverse-proxy' ? 'x-real-ip' : null
  const value = header ? request.headers.get(header)?.split(',')[0].trim() : null
  return value && value.length <= 45 && /^[0-9a-fA-F:.]+$/.test(value) ? value : 'untrusted-proxy'
}

// 5 requests per IP per hour on the public crawl endpoint
export const crawlRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  analytics: false,
  prefix: 'rag_crawl_client',
})

export const documentImportRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 h'),
  analytics: false,
  prefix: 'rag_document_import',
})

export const mediaRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 h'),
  analytics: false,
  prefix: 'rag_media_ip',
})

export const waitlistRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  analytics: false,
  prefix: 'rag_waitlist_ip',
})

export const eventRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(120, '1 m'),
  analytics: false,
  prefix: 'rag_events_ip',
})
