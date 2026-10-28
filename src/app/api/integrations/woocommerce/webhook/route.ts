import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { connectionByDomain, connectorSecret, recordCommerceWebhook } from '@/lib/integrations/commerceConnector'

function validSignature(raw: string, supplied: string, secret: string) {
  if (!supplied || !secret) return false
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(raw).digest('base64'))
  const actual = Buffer.from(supplied)
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}

export async function POST(req: NextRequest) {
  if (Number(req.headers.get('content-length') || 0) > 2_000_000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  const raw = await req.text()
  if (Buffer.byteLength(raw) > 2_000_000) return NextResponse.json({ error: 'Payload too large' }, { status: 413 })
  try {
    const source = String(req.headers.get('x-wc-webhook-source') || '').replace(/\/$/, '')
    const connection = await connectionByDomain('woocommerce', source)
    if (!connection) return NextResponse.json({ error: 'Unknown store' }, { status: 404 })
    const config = await connectorSecret(connection)
    if (!validSignature(raw, req.headers.get('x-wc-webhook-signature') || '', String(config.webhook_secret || ''))) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
    const eventId = req.headers.get('x-wc-webhook-delivery-id') || crypto.createHash('sha256').update(raw).digest('hex')
    const topic = req.headers.get('x-wc-webhook-topic') || 'unknown'
    const result = await recordCommerceWebhook({ connection, eventId, topic, payload: JSON.parse(raw) })
    return NextResponse.json({ ok: true, duplicate: result.duplicate })
  } catch (error: any) {
    console.error('[Woo webhook]', error?.message || error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
