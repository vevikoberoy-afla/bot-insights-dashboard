/**
 * Detects whether a user message signifies a refusal, decline, or objection
 * to providing contact information (WhatsApp, phone, email, name).
 */
export function isLeadCaptureDecline(text: string): boolean {
  if (!text) return false
  const t = text.trim().toLowerCase()

  // 1. Explicit refusal phrases
  const refusalPhrases = [
    "don't want", "dont want", "do not want",
    "won't give", "wont give", "will not give",
    "not giving", "not gonna give", "not going to give",
    "not sharing", "don't share", "dont share",
    "prefer not", "rather not",
    "no thanks", "no thank you", "no thx",
    "stop asking", "don't ask", "dont ask", "quit asking",
    "leave it", "never mind", "nevermind", "skip it", "pass on that",
    "keep it private", "it's private", "its private",
    "none of your business", "not your business",
    "why do you need", "why do you want", "why would i",
    "i will not", "i wont", "i won't",
  ]
  if (refusalPhrases.some(phrase => t.includes(phrase))) {
    return true
  }

  // 2. Direct short negative responses
  if (/^(no|nah|nope|skip|pass|not now|never|no way|nopes)\b/i.test(t)) {
    return true
  }

  // 3. Negative answers mentioning contact channels
  if (/\b(no|not|neither|without)\b.*\b(email|phone|whatsapp|number|details|info|contact)\b/i.test(t)) {
    return true
  }

  return false
}
