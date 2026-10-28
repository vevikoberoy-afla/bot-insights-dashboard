import { supabase } from './supabase'
import { NextResponse } from 'next/server'
import { redis } from './redis'
import { BoundedCache } from './boundedCache'

const websiteCache=new BoundedCache<string,string>({maxEntries:512,maxBytes:256*1024,ttlMs:5*60_000})

// Returns CORS headers allowing the embedding domain to communicate with the widget API
export async function getCorsHeaders(
  contextId: string,
  origin: string | null,
  botId?: string | null
): Promise<Record<string, string>> {
  if (!origin || origin === 'null') return buildHeaders('*')

  const explicitlyAllowed = (process.env.WIDGET_ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)

  const websiteKey=`${contextId||''}:${botId||''}`
  const cachedWebsite=websiteCache.get(websiteKey)
  let configuredWebsite: string | null = cachedWebsite || null
  try {
    if (cachedWebsite===undefined && contextId) {
      let query = supabase
        .from('clients')
        .select('website_url')
      query = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(contextId)
        ? query.or(`context_id.eq.${contextId},id.eq.${contextId}`)
        : query.eq('context_id', contextId)
      const { data } = await query.maybeSingle()
      configuredWebsite = data?.website_url || null
      websiteCache.set(websiteKey,configuredWebsite||'')
    } else if (cachedWebsite===undefined && botId) {
      const { data } = await supabase
        .from('bots')
        .select('clients(website_url)')
        .eq('id', botId)
        .maybeSingle()
      configuredWebsite = (data?.clients as any)?.website_url || null
      websiteCache.set(websiteKey,configuredWebsite||'')
    }
  } catch {
    // Preserve availability when the optional domain configuration cannot be read.
  }

  const allowedOrigins = new Set(explicitlyAllowed)
  if (configuredWebsite) {
    try { allowedOrigins.add(new URL(configuredWebsite).origin) } catch {}
  }

  // Existing tenants without a configured website remain compatible. As soon
  // as a website or explicit allow-list exists, requests fail closed.
  if (allowedOrigins.size > 0 && !allowedOrigins.has(origin)) {
    return buildHeaders('null')
  }
  return buildHeaders(origin)
}

function buildHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, X-Widget-Session-Token, Accept, Cache-Control',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
}

// Handle preflight OPTIONS requests
export function handleOptions(corsHeaders: Record<string, string>) {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}
