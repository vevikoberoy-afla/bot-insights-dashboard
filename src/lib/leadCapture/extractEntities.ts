/**
 * High-precision, low-latency Regex Entity Extractor for Conversational Lead Capture.
 * Extracts email addresses, phone numbers (with E.164 normalization), and self-declared names.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/

// Matches phone numbers in international (+...), US/UK, and Indian formats
const PHONE_RE = /(?:\+?(\d{1,3}))?[-.\s]?(?:\(?(\d{2,4})\)?[-.\s]?)?(\d{3,4})[-.\s]?(\d{3,4})\b/

// Matches conversational introductions: "my name is Alex", "I'm Sarah Jenkins", "call me Dave", "it's Rahul"
const NAME_INTRO_RE = /(?:my name is|i am|i'm|call me|myself|this is|it's)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i
const CONTACT_SIGNAL_RE = /@|\+?\d[\d\s\-()]{6,}|\b(my name|i am|i'm|call me|reach me|name is)\b/i

export function shouldInjectExtractDirective(userMessage: string, awaitingLeadField = false): boolean {
  if (awaitingLeadField) return true
  const clean = String(userMessage || '').trim()
  if (!clean) return false
  // Short replies can be names or answers to a previously displayed lead prompt.
  if (clean.split(/\s+/).length <= 4) return true
  return CONTACT_SIGNAL_RE.test(clean)
}

export interface ExtractedEntities {
  email?: string
  phone?: string
  name?: string
  confidence: 'regex'
}

export interface LLMExtractedData {
  name?: string | null
  email?: string | null
  phone?: string | null
  company?: string | null
  role?: string | null
  custom?: Record<string, any> | null
  [key: string]: any
}

export interface ValidatedContactData {
  name?: string
  email?: string
  phone?: string
  company?: string
  role?: string
  customProperties?: Record<string, any>
  hasValidData: boolean
}

const WORD_DIGIT_MAP: Record<string, string> = {
  zero: '0',
  oh: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
}

/**
 * Converts word digits (e.g. "nine eight eight zero") into numeric digits ("9 8 8 0").
 */
export function wordsToDigits(text: string): string {
  if (!text || typeof text !== 'string') return ''
  return text.replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/gi, (match) => {
    return WORD_DIGIT_MAP[match.toLowerCase()] || match
  })
}

/**
 * Parses the silent [EXTRACT]...[/EXTRACT] JSON block from the LLM output.
 * Returns the clean, customer-facing response text and the raw parsed JSON.
 */
export function parseExtractTag(llmOutput: string): {
  cleanText: string
  rawExtract: LLMExtractedData | null
} {
  if (!llmOutput || typeof llmOutput !== 'string') {
    return { cleanText: '', rawExtract: null }
  }

  const tagIndex = llmOutput.indexOf('[EXTRACT]')
  if (tagIndex === -1) {
    return { cleanText: llmOutput, rawExtract: null }
  }

  const cleanText = llmOutput.slice(0, tagIndex).trim()
  let rawExtractString = llmOutput.slice(tagIndex + '[EXTRACT]'.length).trim()

  const closingIndex = rawExtractString.indexOf('[/EXTRACT]')
  if (closingIndex !== -1) {
    rawExtractString = rawExtractString.slice(0, closingIndex).trim()
  }

  if (!rawExtractString) {
    return { cleanText, rawExtract: null }
  }

  try {
    // Strip markdown code fences if wrapped by LLM
    const cleanedJson = rawExtractString
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim()

    if (!cleanedJson || cleanedJson === '{}' || cleanedJson === 'null') {
      return { cleanText, rawExtract: null }
    }

    const parsed = JSON.parse(cleanedJson)
    if (typeof parsed === 'object' && parsed !== null) {
      return { cleanText, rawExtract: parsed }
    }
    return { cleanText, rawExtract: null }
  } catch {
    return { cleanText, rawExtract: null }
  }
}

/**
 * Post-LLM Validation Pass:
 * Validates extracted entities using strict regex rules:
 * - Email: RFC-compliant format verification.
 * - Phone: E.164 normalization (10-15 digits). Rejects order numbers and dates.
 * - Name: Sanitizes casing and filters out false positives/stopwords.
 * - Company & Role: String sanitization and length checks.
 * - Custom Fields: Merged into customProperties.
 */
export function validateExtractedEntities(
  raw: LLMExtractedData | null | undefined,
  fallbackUserText?: string
): ValidatedContactData {
  const result: ValidatedContactData = {
    hasValidData: false,
  }

  if (!raw || typeof raw !== 'object') {
    // Fallback: If no LLM JSON block, check if user message contains an explicit RFC email
    if (fallbackUserText) {
      const emailMatch = fallbackUserText.match(EMAIL_RE)
      if (emailMatch) {
        result.email = emailMatch[0].trim().toLowerCase()
        result.hasValidData = true
      }
    }
    return result
  }

  // 1. Email validation (Strict RFC regex check)
  if (typeof raw.email === 'string' && raw.email.trim() && raw.email.toLowerCase() !== 'null') {
    const trimmedEmail = raw.email.trim().toLowerCase()
    if (EMAIL_RE.test(trimmedEmail)) {
      result.email = trimmedEmail
      result.hasValidData = true
    }
  } else if (fallbackUserText) {
    const emailMatch = fallbackUserText.match(EMAIL_RE)
    if (emailMatch) {
      result.email = emailMatch[0].trim().toLowerCase()
      result.hasValidData = true
    }
  }

  // 2. Phone validation (Word conversion + E.164 normalization)
  if (typeof raw.phone === 'string' && raw.phone.trim() && raw.phone.toLowerCase() !== 'null') {
    const phoneConverted = wordsToDigits(raw.phone)
    const normalized = normalizePhone(phoneConverted)
    if (normalized) {
      result.phone = normalized
      result.hasValidData = true
    }
  }

  // 3. Name validation & sanitization
  if (typeof raw.name === 'string' && raw.name.trim() && raw.name.toLowerCase() !== 'null') {
    const trimmedName = raw.name.trim().replace(/^["']|["']$/g, '')
    const invalidNames = new Set([
      'stranger', 'customer', 'visitor', 'user', 'someone', 'unknown', 'none', 'n/a',
      'null', 'undefined', 'friend', 'sir', 'madam', 'mr', 'ms', 'client'
    ])
    if (
      trimmedName.length >= 2 &&
      trimmedName.length <= 60 &&
      !invalidNames.has(trimmedName.toLowerCase())
    ) {
      // Capitalize first letter of each name component
      result.name = trimmedName
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')
      result.hasValidData = true
    }
  }

  // 4. Company validation
  if (typeof raw.company === 'string' && raw.company.trim() && raw.company.toLowerCase() !== 'null') {
    const trimmed = raw.company.trim().replace(/^["']|["']$/g, '')
    if (trimmed.length >= 2 && trimmed.length <= 100 && !['none', 'n/a', 'unknown', 'null'].includes(trimmed.toLowerCase())) {
      result.company = trimmed
      result.hasValidData = true
    }
  }

  // 5. Role validation
  if (typeof raw.role === 'string' && raw.role.trim() && raw.role.toLowerCase() !== 'null') {
    const trimmed = raw.role.trim().replace(/^["']|["']$/g, '')
    if (trimmed.length >= 2 && trimmed.length <= 100 && !['none', 'n/a', 'unknown', 'null'].includes(trimmed.toLowerCase())) {
      result.role = trimmed
      result.hasValidData = true
    }
  }

  // 6. Custom properties & configured fields
  const customProps: Record<string, any> = {}
  if (result.company) customProps.company = result.company
  if (result.role) customProps.role = result.role

  if (raw.custom && typeof raw.custom === 'object') {
    for (const [k, v] of Object.entries(raw.custom)) {
      if (v !== null && v !== undefined && String(v).trim() && String(v).toLowerCase() !== 'null') {
        customProps[k] = v
        result.hasValidData = true
      }
    }
  }

  // Check any additional non-standard keys in raw (e.g. { "location": "NYC" })
  for (const [k, v] of Object.entries(raw)) {
    if (!['name', 'email', 'phone', 'company', 'role', 'custom'].includes(k)) {
      if (v !== null && v !== undefined && String(v).trim() && String(v).toLowerCase() !== 'null') {
        customProps[k] = v
        result.hasValidData = true
      }
    }
  }

  if (Object.keys(customProps).length > 0) {
    result.customProperties = customProps
  }

  return result
}

/**
 * Normalizes phone numbers into clean international or E.164 format.
 * Strips formatting artifacts like hyphens, dots, and spaces.
 */
export function normalizePhone(rawPhone: string): string | undefined {
  const digitsOnly = rawPhone.replace(/\D/g, '')

  // Reject numbers with fewer than 10 or more than 15 digits
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    return undefined
  }

  // If already starts with +, format as +<digits>
  if (rawPhone.trim().startsWith('+')) {
    return `+${digitsOnly}`
  }

  // 10-digit number defaults to international format if country code is obvious or prefix +
  // E.g., Indian mobile numbers starting with 6, 7, 8, 9
  if (digitsOnly.length === 10) {
    return `+${digitsOnly}`
  }

  // 11-digit US number starting with 1
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return `+${digitsOnly}`
  }

  return `+${digitsOnly}`
}

/**
 * Extracts entities synchronously from chat messages.
 */
export function extractEntitiesRegex(text: string): ExtractedEntities {
  if (!text || typeof text !== 'string') {
    return { confidence: 'regex' }
  }

  const clean = text.trim()

  // 1. Email extraction
  const emailMatch = clean.match(EMAIL_RE)
  const email = emailMatch ? emailMatch[0].trim().toLowerCase() : undefined

  // 2. Phone extraction
  let phone: string | undefined
  const phoneMatch = clean.match(PHONE_RE)
  if (phoneMatch) {
    const raw = phoneMatch[0]
    // Filter out common false positives like dates (2024-05-12) or order IDs
    if (!/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(raw.trim())) {
      phone = normalizePhone(raw)
    }
  } else {
    // Check if user replied with raw 10-13 digits (e.g. "9876543210" or "whatsapp: 9876543210")
    const digitsMatch = clean.match(/(?:whatsapp|phone|number|mobile|no)?\s*[:=-]?\s*(\+?\d[\d\s-]{9,15}\d)/i)
    if (digitsMatch && digitsMatch[1]) {
      phone = normalizePhone(digitsMatch[1])
    }
  }

  // 3. Name extraction (conversational intro or direct 1-2 capitalized words)
  let name: string | undefined
  const nameMatch = clean.match(NAME_INTRO_RE)
  if (nameMatch && nameMatch[1]) {
    const candidate = nameMatch[1].trim()
    if (!/^(here|ready|looking|wondering|asking|happy|trying|calling|fine|good|okay)$/i.test(candidate)) {
      name = candidate
    }
  } else {
    // If the entire message is just 1 or 2 capitalized words answering "can I know your name?"
    // e.g. "Rahul", "Rahul Sharma", "Alex", "David Miller"
    const words = clean.split(/\s+/)
    if (words.length <= 2 && /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?$/.test(clean)) {
      const stopwords = new Set([
        'hi', 'hello', 'hey', 'yes', 'no', 'okay', 'ok', 'sure', 'fine', 'thanks', 'thank',
        'cool', 'menu', 'order', 'help', 'bye', 'good', 'nice', 'food', 'price', 'cost'
      ])
      if (!stopwords.has(clean.toLowerCase())) {
        name = clean
      }
    }
  }

  return {
    email,
    phone,
    name,
    confidence: 'regex',
  }
}
