const PUNCTUATION = /[¿?¡!.,;:"'()[\]{}]/g
const NEGATIONS = new Set(['not', 'never', 'no', 'without', 'cancel', 'refund', 'free'])
const FOLLOW_UP = /\b(it|its|this|that|they|them|those|the price|the benefits|how much)\b/i

export type ChatTurn = { role: 'user' | 'assistant' | 'model'; content?: string }

/** Stable cache key input plus identity-sensitive tokens that semantic search must preserve. */
export function canonicalizeQuery(raw: string): { canonical: string; entitySignature: string } {
  const canonical = String(raw || '').trim().toLowerCase().replace(PUNCTUATION, ' ').replace(/\s+/g, ' ').trim()
  const words = canonical.split(' ').filter(Boolean)
  const critical = new Set<string>()
  for (const word of words) {
    if (NEGATIONS.has(word) || /\d/.test(word)) critical.add(word)
  }
  // Preserve short location phrases so "ship to Delhi" cannot reuse Mumbai.
  for (const match of canonical.matchAll(/\b(?:to|in|at|from)\s+([a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,2})/g)) {
    critical.add(`loc:${match[1]}`)
  }
  return { canonical, entitySignature: [...critical].sort().join('|') || 'general' }
}

/** Adds the previous user subject only for short, pronoun-heavy follow-ups. */
export function buildRetrievalQuery(currentQuestion: string, history: ChatTurn[] = []): string {
  const words = currentQuestion.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 12 || !FOLLOW_UP.test(currentQuestion) || history.length === 0) return currentQuestion
  const prior = [...history].reverse().find(turn => turn.role === 'user' && turn.content?.trim())?.content?.trim() || ''
  return prior ? `${prior.slice(0, 120)} — ${currentQuestion}` : currentQuestion
}

/** Removes the low-similarity tail while always retaining the top result. */
export function pruneRetrievedChunks<T extends { similarity?: number | null }>(chunks: T[]): T[] {
  if (chunks.length <= 1) return chunks
  const top = Number(chunks[0]?.similarity || 0)
  if (!Number.isFinite(top) || top <= 0) return chunks.slice(0, 5)
  const floor = Math.max(0.45, top - 0.18)
  return chunks.filter((chunk, index) => index === 0 || Number(chunk.similarity || 0) >= floor).slice(0, 5)
}

export function isContactVerifiedInRecord(contact: { email?: string | null; phone?: string | null }, record: string): boolean {
  const lower = String(record || '').toLowerCase()
  const email = String(contact.email || '').trim().toLowerCase()
  if (email && lower.includes(email)) return true
  const suppliedPhone = String(contact.phone || '').replace(/\D/g, '')
  if (suppliedPhone.length < 8) return false
  const recordDigits = lower.replace(/\D/g, '')
  return recordDigits.includes(suppliedPhone)
}

