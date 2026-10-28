import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { safeRedirect } from '../src/lib/security/safeRedirect.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const migration = read('supabase/094_zero_trust_onboarding.sql')
const middleware = read('src/middleware.ts')
const setup = read('src/app/api/auth/setup/route.ts')
const callback = read('src/app/auth/callback/route.ts')
const adminControl = read('src/app/api/admin/control/route.ts')
const account360 = read('src/components/admin/ControlPlane.tsx')

assert.equal(safeRedirect('/overview'), '/overview')
assert.equal(safeRedirect('/features?tab=booking'), '/features?tab=booking')
for (const unsafe of ['https://evil.example', '//evil.example', '/\\evil.example', '/%5cevil.example']) assert.equal(safeRedirect(unsafe), '/overview')

assert.match(migration, /email_confirmed_at IS NOT NULL/)
assert.match(migration, /FOR UPDATE SKIP LOCKED/)
assert.match(migration, /TEAM_SEAT_LIMIT_REACHED/)
assert.match(migration, /GRANT EXECUTE[\s\S]+TO service_role/)
assert.doesNotMatch(migration, /GRANT EXECUTE[\s\S]+TO authenticated/)
assert.match(middleware, /saas_authorization_snapshot/)
assert.match(middleware, /auth\.getClaims/)
assert.match(middleware, /validateSupabaseClaims/)
assert.doesNotMatch(middleware, /auth\.getUser\(/)
assert.match(middleware, /code: 'WAITLISTED'/)
assert.match(callback, /exchangeCodeForSession/)
assert.match(callback, /safeRedirect/)
assert.match(setup, /saas_bootstrap_identity/)
assert.doesNotMatch(setup, /from\('clients'\)\.insert/)
assert.match(adminControl, /staff\.role_key!=='platform_owner'/)
assert.match(adminControl, /identity_password_reset/)
assert.match(adminControl, /identity_mfa_reset/)
assert.match(adminControl, /saas_audit_events/)
assert.match(adminControl, /RATE_LIMITED/)
assert.match(account360, /Passwords are never visible to platform staff/)
assert.match(account360, /Send password reset/)

console.log('Zero-trust onboarding checks passed')
