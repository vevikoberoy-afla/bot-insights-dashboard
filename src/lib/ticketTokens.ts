import { createHmac, timingSafeEqual } from 'crypto'

type TicketToken = { ticketId: string; purpose: 'status' | 'csat'; exp: number }

function secret() {
  const value = process.env.TICKET_LINK_SECRET || process.env.ADMIN_SECRET
  if (!value) throw new Error('TICKET_LINK_SECRET is not configured')
  return value
}

export function signTicketToken(payload: TicketToken) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createHmac('sha256', secret()).update(encoded).digest('base64url')
  return `${encoded}.${signature}`
}

export function verifyTicketToken(token: string, purpose: TicketToken['purpose']): TicketToken | null {
  try {
    const [encoded, provided] = token.split('.')
    if (!encoded || !provided) return null
    const expected = createHmac('sha256', secret()).update(encoded).digest()
    const actual = Buffer.from(provided, 'base64url')
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as TicketToken
    if (payload.purpose !== purpose || payload.exp < Date.now() || !payload.ticketId) return null
    return payload
  } catch { return null }
}

