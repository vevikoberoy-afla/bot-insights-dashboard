import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateSupabaseClaims } from '../src/lib/security/jwtClaims.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project-ref.supabase.co'
process.env.SUPABASE_JWT_AUDIENCE = 'authenticated'

const now = 2_000_000_000
const valid = {
  sub: '8f384f95-00ca-4d73-8b61-0f3bf4234e99',
  iss: 'https://project-ref.supabase.co/auth/v1',
  aud: 'authenticated',
  iat: now - 30,
  nbf: now - 30,
  exp: now + 300,
}
assert.ok(validateSupabaseClaims(valid, now))
assert.equal(validateSupabaseClaims({ ...valid, iss: 'https://attacker.example/auth/v1' }, now), null)
assert.equal(validateSupabaseClaims({ ...valid, aud: 'service_role' }, now), null)
assert.equal(validateSupabaseClaims({ ...valid, exp: now }, now), null)
assert.equal(validateSupabaseClaims({ ...valid, iat: now + 61 }, now), null)
assert.equal(validateSupabaseClaims({ ...valid, nbf: now + 61 }, now), null)
assert.equal(validateSupabaseClaims({ ...valid, sub: 'not-a-user-id' }, now), null)

const middleware = read('src/middleware.ts')
const requestAuth = read('src/lib/requestAuth.ts')
const legacyAuth = read('src/lib/auth.ts')
const apiAuth = read('src/lib/api-auth.ts')
for (const source of [middleware, requestAuth]) {
  assert.match(source, /auth\.getClaims/)
  assert.match(source, /validateSupabaseClaims/)
}
assert.doesNotMatch(middleware, /auth\.getUser\(/)
assert.doesNotMatch(requestAuth, /auth\.getUser\(/)
assert.match(legacyAuth, /getAuthenticatedWorkspaceUser/)
assert.match(apiAuth, /getAuthenticatedWorkspaceUser/)

const guardedRoutes: Record<string, RegExp[]> = {
  'src/app/api/campaigns/[id]/send/route.ts': [/getAuthenticatedWorkspaceResource/, /actor\.workspaceId/],
  'src/app/api/catalog/sync/route.ts': [/getAuthenticatedWorkspaceUser/, /actor\.workspaceId/],
  'src/app/api/databases/[id]/query/route.ts': [/getAuthenticatedWorkspaceResource/],
  'src/app/api/knowledge/upload/route.ts': [/return handleDocumentUpload\(req\)/],
  'src/app/api/upload/route.ts': [/return handleDocumentUpload\(req\)/],
  'src/app/api/datasets/[id]/documents/route.ts': [/handleDocumentUpload/, /getAuthenticatedWorkspaceResource/],
  'src/lib/knowledge/documentUpload.ts': [/getAuthenticatedWorkspaceResource/, /getAuthenticatedWorkspaceUser/, /eq\('client_id',actor\.workspaceId\)/],
  'src/app/api/tickets/[id]/links/route.ts': [/getAuthenticatedWorkspaceResource/, /actor\.workspaceId/],
  'src/app/api/agent-actions/[id]/decide/route.ts': [/getAuthenticatedWorkspaceResource/, /actor\.workspaceId/],
  'src/app/api/bot-databases/route.ts': [/getAuthenticatedWorkspaceUser/, /actor\.workspaceId/],
  'src/app/api/bot-datasets/route.ts': [/getAuthenticatedWorkspaceUser/, /actor\.workspaceId/],
}
for (const [path, checks] of Object.entries(guardedRoutes)) {
  const source = read(path)
  for (const check of checks) assert.match(source, check, `${path} is missing ${check}`)
}

console.log('PASS: registered JWT claims and high-risk service boundaries fail closed')
