import {BoundedCache} from '@/lib/boundedCache'

/**
 * TICKETS CLIENT-SIDE CACHE & SWR LAYER
 * 
 * Provides instantaneous (0ms) render from memory & storage cache,
 * eliminating full-page loading spinners when navigating between
 * "All Tickets", "Analytics", or switching tabs and filters.
 * 
 * Includes Stale-While-Revalidate (lazy background refresh) so the
 * frontend always feels spontaneous, snappy, and responsive.
 */

export interface CacheEntry<T> {
  data: T
  ts: number
}

// Freshness TTL: served purely from cache without any network request
export const TICKETS_FRESH_TTL = 30 * 1000        // 3 seconds fresh for near real-time updates
export const ANALYTICS_FRESH_TTL = 120 * 1000     // 30 seconds fresh

// Maximum stale window: stale data is served instantly while background lazyloading occurs
export const MAX_STALE_TTL = 15 * 60 * 1000       // 15 minutes max stale

// In-memory Level 1 cache (fastest — 0ms synchronous access, survives tab switches)
const ticketsMemCache = new BoundedCache<string,CacheEntry<{data:any[];count:number}>>({maxEntries:40,maxBytes:12*1024*1024,ttlMs:MAX_STALE_TTL})
const analyticsMemCache = new BoundedCache<string,CacheEntry<any>>({maxEntries:12,maxBytes:8*1024*1024,ttlMs:MAX_STALE_TTL})
let cachedClientId: string = ''

/**
 * Synchronously retrieves the last known client ID
 * from memory or browser storage so pages don't block
 * on asynchronous getSession() calls.
 */
export function getStoredClientId(): string {
  if (cachedClientId) return cachedClientId
  if (typeof window === 'undefined') return ''

  try {
    const direct = localStorage.getItem('rag_client_id')
    if (direct) {
      cachedClientId = direct
      return direct
    }

    // Fallback: look for Supabase auth session in localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && (key.startsWith('sb-') || key.includes('auth-token')) && key.endsWith('-auth-token')) {
        const item = localStorage.getItem(key)
        if (item) {
          const parsed = JSON.parse(item)
          const uid = parsed?.user?.id || parsed?.currentSession?.user?.id
          if (uid) {
            cachedClientId = uid
            try { localStorage.setItem('rag_client_id', uid) } catch {}
            return uid
          }
        }
      }
    }
  } catch {}

  return ''
}

export function setStoredClientId(id: string): void {
  if (!id) return
  cachedClientId = id
  if (typeof window !== 'undefined') {
    try { localStorage.setItem('rag_client_id', id) } catch {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TICKETS LIST CACHE
// ─────────────────────────────────────────────────────────────────────────────

export interface TicketsQueryParams {
  clientId: string
  page: number
  pageSize?: number
  search?: string
  status?: string
  priority?: string
  type?: string
  verification?: string
}

export function getTicketsCacheKey(params: TicketsQueryParams): string {
  const p = {
    c: params.clientId || '',
    pg: params.page || 1,
    ps: params.pageSize || 25,
    s: (params.search || '').trim().toLowerCase(),
    st: params.status || 'all',
    pr: params.priority || 'all',
    tp: params.type || 'all',
    v: params.verification || 'all',
  }
  return `rag_tk_${p.c}_${p.pg}_${p.st}_${p.pr}_${p.tp}_${p.v}_${p.s}`
}

export function getCachedTickets(key: string): { data: any[]; count: number; isStale: boolean } | null {
  if (!key) return null

  // 1. Check in-memory Map
  let entry = ticketsMemCache.get(key)

  // 2. Check storage fallback
  if (!entry && typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(key) || localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw) as CacheEntry<{ data: any[]; count: number }>
        if (parsed && typeof parsed.ts === 'number') {
          entry = parsed
          ticketsMemCache.set(key, parsed) // warm in-memory Map
        }
      }
    } catch {}
  }

  if (!entry) return null

  const age = Date.now() - entry.ts

  // Expired past max stale threshold
  if (age > MAX_STALE_TTL) {
    ticketsMemCache.delete(key)
    try {
      sessionStorage.removeItem(key)
      localStorage.removeItem(key)
    } catch {}
    return null
  }

  const isStale = age > TICKETS_FRESH_TTL

  return {
    data: entry.data.data,
    count: entry.data.count,
    isStale,
  }
}

export function setCachedTickets(key: string, value: { data: any[]; count: number }): void {
  if (!key) return
  const entry: CacheEntry<{ data: any[]; count: number }> = {
    data: value,
    ts: Date.now(),
  }

  ticketsMemCache.set(key, entry)

  if (typeof window !== 'undefined') {
    try {
      const str = JSON.stringify(entry)
      sessionStorage.setItem(key, str)
    } catch {}
  }
}

export function invalidateTicketsCache(): void {
  ticketsMemCache.clear()
  if (typeof window !== 'undefined') {
    try {
      const toRemove: string[] = []
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i)
        if (k && k.startsWith('rag_tk_')) toRemove.push(k)
      }
      toRemove.forEach(k => sessionStorage.removeItem(k))
    } catch {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS CACHE
// ─────────────────────────────────────────────────────────────────────────────

export function getAnalyticsCacheKey(clientId: string, days: number): string {
  return `rag_tka_${clientId || ''}_${days || 30}`
}

export function getCachedAnalytics(key: string): { data: any; isStale: boolean } | null {
  if (!key) return null

  // 1. Check in-memory Map
  let entry = analyticsMemCache.get(key)

  // 2. Check storage fallback
  if (!entry && typeof window !== 'undefined') {
    try {
      const raw = sessionStorage.getItem(key) || localStorage.getItem(key)
      if (raw) {
        const parsed = JSON.parse(raw) as CacheEntry<any>
        if (parsed && typeof parsed.ts === 'number') {
          entry = parsed
          analyticsMemCache.set(key, parsed)
        }
      }
    } catch {}
  }

  if (!entry) return null

  const age = Date.now() - entry.ts

  if (age > MAX_STALE_TTL) {
    analyticsMemCache.delete(key)
    try {
      sessionStorage.removeItem(key)
      localStorage.removeItem(key)
    } catch {}
    return null
  }

  const isStale = age > ANALYTICS_FRESH_TTL

  return {
    data: entry.data,
    isStale,
  }
}

export function setCachedAnalytics(key: string, data: any): void {
  if (!key) return
  const entry: CacheEntry<any> = {
    data,
    ts: Date.now(),
  }

  analyticsMemCache.set(key, entry)

  if (typeof window !== 'undefined') {
    try {
      sessionStorage.setItem(key, JSON.stringify(entry))
    } catch {}
  }
}

export function invalidateAnalyticsCache(): void {
  analyticsMemCache.clear()
  if (typeof window !== 'undefined') {
    try {
      const toRemove: string[] = []
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i)
        if (k && k.startsWith('rag_tka_')) toRemove.push(k)
      }
      toRemove.forEach(k => sessionStorage.removeItem(k))
    } catch {}
  }
}

export function invalidateAllTicketsCache(): void {
  invalidateTicketsCache()
  invalidateAnalyticsCache()
}
