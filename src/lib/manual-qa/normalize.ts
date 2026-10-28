/**
 * Normalizes a question string for deterministic exact-match lookups:
 * - Converts to lower case
 * - Strips all punctuation and special characters
 * - Normalizes whitespace (collapses multiple spaces, trims ends)
 */
export function normalizeQuestion(question: string): string {
  if (!question) return ''
  return question
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // remove all punctuation
    .replace(/\s+/g, ' ')   // collapse multi-spaces
}
