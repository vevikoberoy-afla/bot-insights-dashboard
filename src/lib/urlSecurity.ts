import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { Agent, fetch as undiciFetch } from 'undici'

function isPrivateIp(address: string): boolean {
  const normalized = address.trim().toLowerCase()
  // URL canonicalization converts mapped IPv4 into hexadecimal IPv6 groups.
  const mapped = normalized.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (mapped) {
    const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16)
    return isPrivateIp(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`)
  }
  if (normalized.startsWith('::ffff:')) return isPrivateIp(normalized.slice(7))
  if (normalized === '::1' || normalized === '::' || normalized === '0.0.0.0') return true
  if (normalized.startsWith('fc') || normalized.startsWith('fd') || /^fe[89ab]/.test(normalized) || normalized.startsWith('ff') || normalized.startsWith('2001:db8:')) return true
  const parts = normalized.split('.').map(Number)
  if (parts.length !== 4 || parts.some(Number.isNaN)) return false
  return parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 192 && parts[1] === 0 && (parts[2] === 0 || parts[2] === 2)) ||
    (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19 || (parts[1] === 51 && parts[2] === 100))) ||
    (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) || parts[0] >= 224
}

/** Reject URLs capable of reaching loopback, cloud metadata, or private networks. */
export async function assertSafeOutboundUrl(value: string): Promise<URL> {
  const url = new URL(value)
  if (url.protocol !== 'https:') throw new Error('Only HTTPS URLs are supported')
  if (url.username || url.password) throw new Error('URLs with embedded credentials are not allowed')
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (hostname === 'localhost' || hostname === 'metadata.google.internal' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('Private network URLs are not allowed')
  }
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true })
  if (!addresses.length || addresses.some(item => isPrivateIp(item.address))) {
    throw new Error('Private network URLs are not allowed')
  }
  return url
}

export async function safeOutboundFetch(value: string | URL, init: RequestInit = {}): Promise<Response> {
  const { response, buffer } = await pinnedFetchBuffer(value, init, 10 * 1024 * 1024)
  return new Response(buffer, { status: response.status, statusText: response.statusText, headers: response.headers as any })
}

export async function safeOutboundFetchBuffer(value: string | URL, init: RequestInit & { maxBytes?: number; allowedTypes?: string[]; allowPublicRedirects?: boolean } = {}) {
  const { maxBytes = 5 * 1024 * 1024, allowedTypes = [], allowPublicRedirects = false, ...requestInit } = init
  if (allowPublicRedirects && ((requestInit.method || 'GET') !== 'GET' || requestInit.body || Array.from(new Headers(requestInit.headers).keys()).some(key => !['accept','accept-language','user-agent'].includes(key)))) throw new Error('Public redirects require an anonymous GET request')
  const { response, buffer } = await pinnedFetchBuffer(value, requestInit, maxBytes, allowPublicRedirects)
  const contentType = (response.headers.get('content-type') || 'application/octet-stream').split(';')[0].toLowerCase()
  if (allowedTypes.length && !allowedTypes.some(type => contentType === type || contentType.startsWith(`${type}/`))) throw new Error('Remote content type is not allowed')
  return { response, buffer, contentType }
}

async function pinnedFetchBuffer(value: string | URL, init: RequestInit, maxBytes: number, allowPublicRedirects = false) {
  let current = value.toString()
  for (let redirects = 0; redirects <= 3; redirects++) {
    const url = await assertSafeOutboundUrl(current)
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    const records = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true, verbatim: true })
    if (!records.length || records.some(record => isPrivateIp(record.address))) throw new Error('Private network URLs are not allowed')
    const pinned = records[0]
    const dispatcher = new Agent({ connect: { timeout: 5000, lookup: (_host, _options, callback) => callback(null, pinned.address, pinned.family as 4 | 6) } })
    try {
      const headers = new Headers(init.headers)
      headers.set('accept-encoding', 'identity')
      const response = await undiciFetch(url, { ...(init as any), headers: Object.fromEntries(headers.entries()), redirect: 'manual', dispatcher })
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location')
        await response.body?.cancel()
        if (!location || redirects === 3) throw new Error('Unsafe or excessive redirect')
        const next = new URL(location, url)
        // Connector credentials and request bodies must never follow another origin.
        if (next.origin !== url.origin) {
          if (!allowPublicRedirects) throw new Error('Cross-origin redirects are not allowed')
          // Document downloads are anonymous; never forward headers across origins.
          init = { ...init, headers: { Accept: '*/*' } }
        }
        current = next.toString()
        continue
      }
      const declared = Number(response.headers.get('content-length') || 0)
      if (declared > maxBytes) throw new Error('Remote response is too large')
      const chunks: Uint8Array[] = []
      let total = 0
      if (response.body) {
        const reader = response.body.getReader()
        while (true) {
          const { done, value: chunk } = await reader.read()
          if (done) break
          if (!chunk) continue
          total += chunk.byteLength
          if (total > maxBytes) { await reader.cancel(); throw new Error('Remote response is too large') }
          chunks.push(chunk)
        }
      }
      return { response, buffer: Buffer.concat(chunks, total) }
    } finally {
      await dispatcher.close()
    }
  }
  throw new Error('Unsafe redirect')
}
