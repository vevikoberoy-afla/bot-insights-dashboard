import crypto from 'node:crypto'

export type WidgetSessionClaims = {
  v: 1
  workspaceId: string
  contextId?: string | null
  botId: string
  sessionId?: string
  purpose: 'widget' | 'tracker'
  iat: number
  exp: number
}

function signingKey() {
  const value = process.env.WIDGET_SESSION_HMAC_SECRET || (process.env.NODE_ENV !== 'production' ? process.env.SUPABASE_SERVICE_ROLE_KEY : undefined)
  if (!value || value.length < 32) throw new Error('Widget session signing is not configured')
  return Buffer.from(value)
}

export function issueWidgetSessionToken(input: {
  workspaceId: string
  contextId?: string | null
  botId: string
  sessionId?: string
  purpose?: 'widget' | 'tracker'
  ttlSeconds?: number
}) {
  const now = Math.floor(Date.now() / 1000)
  const claims: WidgetSessionClaims = {
    v: 1,
    workspaceId: input.workspaceId,
    contextId: input.contextId || null,
    botId: input.botId,
    sessionId: input.sessionId,
    purpose: input.purpose || 'widget',
    iat: now,
    exp: now + Math.min(Math.max(input.ttlSeconds || 3 * 86400, 60), 3 * 86400),
  }
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = crypto.createHmac('sha256', signingKey()).update(payload).digest('base64url')
  return { token: `${payload}.${signature}`, expiresAt: claims.exp * 1000 }
}

export function verifyWidgetSessionToken(token: string, purpose?: WidgetSessionClaims['purpose']) {
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) throw new Error('INVALID_WIDGET_TOKEN')
  const expected = crypto.createHmac('sha256', signingKey()).update(payload).digest()
  const actual = Buffer.from(signature, 'base64url')
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw new Error('INVALID_WIDGET_TOKEN')
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as WidgetSessionClaims
  const now = Math.floor(Date.now() / 1000)
  if (claims.v !== 1 || !claims.workspaceId || !claims.botId || !claims.purpose || claims.exp <= now || claims.iat > now + 60) {
    throw new Error('INVALID_WIDGET_TOKEN')
  }
  if (purpose && claims.purpose !== purpose) throw new Error('INVALID_WIDGET_TOKEN_SCOPE')
  return claims
}
