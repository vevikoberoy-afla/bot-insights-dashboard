const SECRET_KEY = /password|passphrase|secret|token|api[_-]?key|consumer[_-]?key|authorization|private[_-]?key|refresh[_-]?token|client[_-]?secret|smtp[_-]?pass|access[_-]?token/i

export function redactSecretsForBrowser(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecretsForBrowser)
  if (!value || typeof value !== 'object') return value
  const safe: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(key)) {
      const configured = typeof child === 'string' ? child.length > 0 : child != null
      safe[key] = null
      safe[`_has_${key}`] = configured
      continue
    }
    safe[key] = redactSecretsForBrowser(child)
  }
  return safe
}

export function mergeWriteOnlySecrets(existing: unknown, incoming: unknown): Record<string, unknown> {
  const oldValue = existing && typeof existing === 'object' ? existing as Record<string, unknown> : {}
  const nextValue = incoming && typeof incoming === 'object' ? incoming as Record<string, unknown> : {}
  const merged: Record<string, unknown> = { ...oldValue }
  for (const [key, value] of Object.entries(nextValue)) {
    if (key.startsWith('_has_')) continue
    if (SECRET_KEY.test(key) && (value === '' || value == null)) continue
    merged[key] = value
  }
  return merged
}
