'use client'

/**
 * AppCache — Global in-memory cache for the admin dashboard.
 *
 * Design:
 *  - Wraps the entire admin layout so all pages share one cache instance.
 *  - useCachedFetch(key, fetcher): returns cached data instantly; revalidates
 *    in the background if the entry is older than TTL_MS (default 2 min).
 *  - invalidate(key): force a fresh fetch next time (e.g. after a mutation).
 *  - Works across tab switches — data never re-fetches unless truly stale.
 */

import { createContext, useContext, useRef, useCallback, ReactNode } from 'react'
import { useState, useEffect } from 'react'
import {BoundedCache} from '@/lib/boundedCache'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T
  fetchedAt: number
  promise?: Promise<T>
}

interface CacheContextValue {
  get: <T>(key: string) => CacheEntry<T> | undefined
  set: <T>(key: string, data: T) => void
  invalidate: (key: string) => void
  invalidatePrefix: (prefix: string) => void
  getPromise: <T>(key: string) => Promise<T> | undefined
  setPromise: <T>(key: string, p: Promise<T>) => void
  clearPromise: (key: string) => void
}

// ─── Context ─────────────────────────────────────────────────────────────────

const CacheContext = createContext<CacheContextValue | null>(null)

const TTL_MS = 2 * 60 * 1000 // 2 minutes

export function CacheProvider({ children }: { children: ReactNode }) {
  // Use a ref so the cache map is never recreated on re-render
  const store = useRef(new BoundedCache<string,CacheEntry<unknown>>({maxEntries:128,maxBytes:32*1024*1024,ttlMs:5*60*1000}))

  const get = useCallback(<T,>(key: string) => {
    return store.current.get(key) as CacheEntry<T> | undefined
  }, [])

  const set = useCallback(<T,>(key: string, data: T) => {
    store.current.set(key, { data, fetchedAt: Date.now() })
  }, [])

  const invalidate = useCallback((key: string) => {
    store.current.delete(key)
  }, [])

  const invalidatePrefix = useCallback((prefix: string) => {
    Array.from(store.current.keys()).forEach(key => {
      if (key.startsWith(prefix)) store.current.delete(key)
    })
  }, [])

  const getPromise = useCallback(<T,>(key: string) => {
    return store.current.get(key)?.promise as Promise<T> | undefined
  }, [])

  const setPromise = useCallback(<T,>(key: string, p: Promise<T>) => {
    const existing = store.current.get(key)
    store.current.set(key, {
      data: existing?.data as T,
      fetchedAt: existing?.fetchedAt ?? 0,
      promise: p as Promise<unknown>,
    })
  }, [])

  const clearPromise = useCallback((key: string) => {
    const existing = store.current.peek(key)
    if(existing?.data!==undefined)store.current.set(key,{...existing,promise:undefined})
    else store.current.delete(key)
  },[])

  return (
    <CacheContext.Provider value={{ get, set, invalidate, invalidatePrefix, getPromise, setPromise, clearPromise }}>
      {children}
    </CacheContext.Provider>
  )
}

function useCacheContext() {
  const ctx = useContext(CacheContext)
  if (!ctx) throw new Error('useCachedFetch must be used inside <CacheProvider>')
  return ctx
}

// ─── useCachedFetch hook ──────────────────────────────────────────────────────

interface UseCachedFetchResult<T> {
  data: T | undefined
  loading: boolean
  error: Error | null
  refresh: () => void
}

/**
 * Drop-in replacement for the fetch + useState + useEffect pattern.
 *
 * @param key     - Unique cache key (e.g. "clients", "tickets:client_abc")
 * @param fetcher - Async function that fetches data. Called only when cache is
 *                  empty or stale. Must be stable (wrap in useCallback if inline).
 * @param ttl     - Override TTL in ms. Defaults to 2 minutes.
 *
 * @example
 * const { data: clients, loading } = useCachedFetch(
 *   'clients',
 *   () => fetch('/api/clients', { headers: ... }).then(r => r.json())
 * )
 */
export function useCachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = TTL_MS,
): UseCachedFetchResult<T> {
  const cache = useCacheContext()
  const entry = cache.get<T>(key)

  const [data, setData] = useState<T | undefined>(entry?.data)
  const [loading, setLoading] = useState(!entry?.data)
  const [error, setError] = useState<Error | null>(null)

  const isStale = !entry || Date.now() - entry.fetchedAt > ttl

  const doFetch = useCallback(async (force = false) => {
    // De-duplicate: if there's already an in-flight request, attach to it
    const inflight = cache.getPromise<T>(key)
    if (inflight && !force) {
      const result = await inflight
      setData(result)
      setLoading(false)
      return
    }

    const promise = fetcher()
    cache.setPromise(key, promise)

    try {
      const result = await promise
      cache.set(key, result)
      setData(result)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      cache.clearPromise(key)
      setLoading(false)
    }
  }, [key, fetcher, cache])

  useEffect(() => {
    if (!key) return

    if (entry?.data) {
      // Return cached data instantly
      setData(entry.data)
      setLoading(false)

      // Revalidate in the background if stale
      if (isStale) {
        doFetch()
      }
    } else {
      // Nothing cached — must fetch
      setLoading(true)
      doFetch()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const refresh = useCallback(() => {
    cache.invalidate(key)
    setLoading(true)
    doFetch(true)
  }, [key, cache, doFetch])

  return { data, loading, error, refresh }
}

// ─── useInvalidate helper ─────────────────────────────────────────────────────

/** Call invalidate after mutations (creates, deletes, updates). */
export function useInvalidate() {
  const cache = useCacheContext()
  return {
    invalidate: cache.invalidate,
    invalidatePrefix: cache.invalidatePrefix,
  }
}
