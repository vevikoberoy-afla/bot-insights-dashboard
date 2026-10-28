/**
 * Umami API Client
 * Self-hosted, MIT licensed. Server-side only.
 */

import type {
  UmamiWebsite,
  UmamiStats,
  UmamiPageviewSeries,
  CreateWebsiteParams,
} from '@/types/umami'

const UMAMI_URL = process.env.UMAMI_URL
const API_KEY = process.env.UMAMI_API_KEY

if (!UMAMI_URL || !API_KEY) {
  console.warn('[Umami] Missing env vars — analytics integration disabled')
}

async function umamiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${UMAMI_URL}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-umami-api-key': API_KEY!,
      ...options.headers,
    },
  })
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Umami API error ${res.status}: ${error}`)
  }
  return res.json() as Promise<T>
}

/** Create a tracked website when a new client is provisioned */
export async function createWebsite(params: CreateWebsiteParams): Promise<UmamiWebsite> {
  return umamiFetch<UmamiWebsite>('/websites', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

/** Get summary stats for a client's website over a date range */
export async function getStats(
  websiteId: string,
  startAt: number,
  endAt: number
): Promise<UmamiStats> {
  return umamiFetch<UmamiStats>(
    `/websites/${websiteId}/stats?startAt=${startAt}&endAt=${endAt}`
  )
}

/** Get daily pageview series for charting (feeds the 7-Day Traffic Chart) */
export async function getPageviewSeries(
  websiteId: string,
  startAt: number,
  endAt: number
): Promise<UmamiPageviewSeries[]> {
  const res = await umamiFetch<{ pageviews: UmamiPageviewSeries[] }>(
    `/websites/${websiteId}/pageviews?startAt=${startAt}&endAt=${endAt}&unit=day`
  )
  return res.pageviews ?? []
}
