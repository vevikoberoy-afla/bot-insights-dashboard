import crypto from 'node:crypto'

function workspaceKey(workspaceId: string, version = 'v1') {
  const encoded = version === 'v1'
    ? (process.env.SAAS_VAULT_MASTER_KEY_V1 || (process.env.NODE_ENV !== 'production' ? Buffer.from(process.env.SUPABASE_SERVICE_ROLE_KEY || '').toString('base64') : undefined))
    : process.env.SAAS_VAULT_MASTER_KEY_PREV
  if (!encoded) throw new Error(`Missing vault key ${version}`)
  const master = Buffer.from(encoded, 'base64')
  if (master.length < 32) throw new Error('Vault master key must contain at least 32 random bytes')
  return Buffer.from(crypto.hkdfSync('sha256', master, Buffer.from(workspaceId), Buffer.from(`vittain-vault:${version}`), 32))
}

export function encryptTenantSecret(workspaceId: string, plaintext: string) {
  const version = 'v1', iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', workspaceKey(workspaceId, version), iv)
  cipher.setAAD(Buffer.from(`${workspaceId}:${version}`))
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return `enc:${version}:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ciphertext.toString('base64')}`
}

export function decryptTenantSecret(workspaceId: string, packed: string) {
  if (!packed.startsWith('enc:')) return packed
  const [, version, iv, tag, ciphertext] = packed.split(':')
  if (!version || !iv || !tag || !ciphertext) throw new Error('Invalid encrypted secret')
  const decipher = crypto.createDecipheriv('aes-256-gcm', workspaceKey(workspaceId, version), Buffer.from(iv, 'base64'))
  decipher.setAAD(Buffer.from(`${workspaceId}:${version}`))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8')
}

const SECRET_FIELD = /password|passphrase|secret|token|api[_-]?key|consumer[_-]?key|authorization|private[_-]?key|refresh[_-]?token|client[_-]?secret|smtp[_-]?pass|access[_-]?token|auth[_-]?header/i

export function encryptConfigSecrets(workspaceId: string, input: unknown): unknown {
  if (Array.isArray(input)) return input.map(value => encryptConfigSecrets(workspaceId, value))
  if (!input || typeof input !== 'object') return input
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    output[key] = SECRET_FIELD.test(key) && typeof value === 'string' && value && !value.startsWith('enc:')
      ? encryptTenantSecret(workspaceId, value)
      : encryptConfigSecrets(workspaceId, value)
  }
  return output
}

export function decryptConfigSecrets(workspaceId: string, input: unknown): any {
  if (Array.isArray(input)) return input.map(value => decryptConfigSecrets(workspaceId, value))
  if (!input || typeof input !== 'object') return input
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    output[key] = SECRET_FIELD.test(key) && typeof value === 'string' && value.startsWith('enc:')
      ? decryptTenantSecret(workspaceId, value)
      : decryptConfigSecrets(workspaceId, value)
  }
  return output
}
