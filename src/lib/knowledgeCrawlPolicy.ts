export const KNOWLEDGE_PURPOSES = ['general', 'support', 'sales', 'marketing', 'hr', 'campaign'] as const
export function normalizeKnowledgePurpose(value: unknown) {
  if (typeof value !== 'string') throw new Error('Choose a valid knowledge-base purpose.')
  const purpose = value.trim().toLowerCase()
  if (!(KNOWLEDGE_PURPOSES as readonly string[]).includes(purpose)) throw new Error('Choose a valid knowledge-base purpose.')
  return purpose
}

export type CrawlMode = 'single' | 'selected' | 'deep'
export type CrawlPolicy = { modes: CrawlMode[]; maxPages: number; maxDepth: number; monthlyPages: number; configured?: boolean }
// These exclusions are server policy; customers cannot remove or override them.
export const CRAWL_EXCLUDE_PATHS = [
  '.*(?:blog|product|news|article|tag|category|author|privacy|terms|legal|cookie|cart|checkout|login|signin|sign-in|account|admin|wp-admin|cdn-cgi).*',
  '.*\\.(?:pdf|zip|png|jpe?g|svg|webp|gif|mp4|mp3|css|js)(?:[?#].*)?$',
]
export function allowedKnowledgeUrl(value: string, root?: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.username || url.password) return false
    if (root && url.origin !== new URL(root).origin) return false
    const path = decodeURIComponent(url.pathname + url.search).toLowerCase()
    return !CRAWL_EXCLUDE_PATHS.some(pattern => new RegExp(pattern, 'i').test(path))
  } catch { return false }
}
export function canonicalKnowledgeUrl(value: string) {
  const url = new URL(value)
  url.hash = ''
  // Do not spend credits scraping multiple tracking/query variants of a page.
  url.search = ''
  return url.toString()
}
export function crawlPolicyFromEntitlements(e: { features: Record<string, boolean>; limits: Record<string, number> }): CrawlPolicy {
  const cap = (key: string, fallback: number, ceiling: number) => Math.max(0, Math.min(ceiling, Math.floor(e.limits[key] ?? fallback)))
  const modes: CrawlMode[] = ['single']
  if (e.features['knowledge.crawl.discovery']) modes.push('selected')
  if (e.features['knowledge.crawl.autonomous']) modes.push('deep')
  return { modes, maxPages: cap('knowledge.crawl.pages_per_job', 1, 500), maxDepth: cap('knowledge.crawl.max_depth', 0, 4), monthlyPages: cap('knowledge.crawl.pages.monthly', 3, 100_000) }
}
export function selectKnowledgeUrls(values: unknown, root: string, limit: number) {
  if (!Array.isArray(values) || !values.length || values.length > limit) throw new Error(`Select between 1 and ${limit} pages.`)
  if (values.some(value => typeof value !== 'string' || !allowedKnowledgeUrl(value, root))) throw new Error('Select permitted pages from the same website.')
  return [...new Set(values.map(value => canonicalKnowledgeUrl(value)))]
}
