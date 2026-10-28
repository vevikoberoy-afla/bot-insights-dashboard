import crypto from 'crypto'
import { NextRequest } from 'next/server'

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export function verifySha256Signature(rawBody: string, signature: string | null, secret: string | undefined): boolean {
  if (!signature || !secret) return false
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`
  return safeEqual(expected, signature)
}

export function verifyWebhookSecret(req: NextRequest, secret: string | undefined): boolean {
  if (!secret) return process.env.NODE_ENV !== 'production'
  const bearer = req.headers.get('authorization')
  const provided =
    req.headers.get('x-webhook-secret') ||
    (bearer?.startsWith('Bearer ') ? bearer.slice(7) : null)
  return !!provided && safeEqual(provided, secret)
}
