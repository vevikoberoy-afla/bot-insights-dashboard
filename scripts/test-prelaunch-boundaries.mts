import assert from 'node:assert/strict'
import { safeRedirect } from '../src/lib/security/safeRedirect.ts'
import { assertSafeOutboundUrl } from '../src/lib/urlSecurity.ts'
import { issueWidgetSessionToken, verifyWidgetSessionToken } from '../src/lib/security/widgetSessionToken.ts'

for (const value of ['/\t/evil.example','/\n/evil.example','/%09/evil.example','//evil.example','/\\evil.example']) {
  assert.equal(safeRedirect(value), '/overview')
}
assert.equal(safeRedirect('/features?tab=bookings'), '/features?tab=bookings')
for (const address of ['127.0.0.1','169.254.169.254','10.0.0.1','[::1]','[::ffff:127.0.0.1]','[::ffff:a00:1]','[fd00::1]']) {
  await assert.rejects(assertSafeOutboundUrl(`https://${address}/`))
}
process.env.WIDGET_SESSION_HMAC_SECRET = 'local-security-test-key-not-a-production-secret'
const { token } = issueWidgetSessionToken({ workspaceId:'a', botId:'b', sessionId:'c' })
assert.equal(verifyWidgetSessionToken(token,'widget').workspaceId,'a')
assert.throws(()=>verifyWidgetSessionToken(token,'tracker'))
assert.throws(()=>verifyWidgetSessionToken(`x${token}`,'widget'))
console.log('PASS: redirect control characters, mapped IPv6 SSRF, widget token tampering and purpose isolation')
