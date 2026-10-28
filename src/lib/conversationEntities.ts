export type ConversationEntities = {
  quantity?: number
  date?: string
  time?: { hour: number; minute: number }
  period?: 'morning' | 'afternoon' | 'evening'
  email?: string
  phone?: string
  name?: string
}

const isoDate = (date: Date) => {
  const year = date.getFullYear()
  return `${year}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function extractConversationEntities(text: string, now = new Date()): ConversationEntities {
  const value = String(text || '').trim()
  const result: ConversationEntities = {}
  const email = value.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0]
  const phoneCandidate = value.match(/(?:\+?\d[\d ()-]{8,}\d)/)?.[0]
  const phoneDigits = phoneCandidate?.replace(/\D/g, '') || ''
  const phone = phoneDigits.length >= 10 && phoneDigits.length <= 15 ? phoneCandidate : undefined
  const name = value.match(/\b(?:my name is|i am|i'm)\s+([a-z][a-z .'’-]{1,60}?)(?=\s*(?:,|\.|\band\b|$))/i)?.[1]
  if (email) result.email = email.toLowerCase()
  if (phone) result.phone = phone.trim()
  if (name) result.name = name.trim()

  const quantityMatch = value.match(/\b(?:party|table|booking|reservation)\s+(?:of|for)\s+(\d{1,3})\b/i)
    || value.match(/\b(?:for)\s+(\d{1,3})\s*(?:people|persons|guests|seats|units|items)?\b/i)
    || value.match(/\b(\d{1,3})\s*(?:people|persons|guests|seats|units|items|tickets)\b/i)
    || value.match(/\b(?:buy|order|get|want|need)\s+(\d{1,3})\b/i)
  if (quantityMatch) result.quantity = Number(quantityMatch[1])

  const lower = value.toLowerCase()
  if (/\btomorrow\b/.test(lower)) {
    const date = new Date(now); date.setDate(date.getDate() + 1); result.date = isoDate(date)
  } else if (/\btoday\b/.test(lower)) {
    result.date = isoDate(now)
  } else {
    const direct = value.match(/\b(20\d{2}-\d{2}-\d{2})\b/)?.[1]
    if (direct && Number.isFinite(Date.parse(`${direct}T12:00:00`))) result.date = direct
    if (!result.date) {
      const monthMatch = value.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(20\d{2}))?\b/i)
      if (monthMatch) {
        const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
        const year = Number(monthMatch[3] || now.getFullYear())
        const candidate = new Date(year, months.indexOf(monthMatch[2].slice(0,3).toLowerCase()), Number(monthMatch[1]))
        if (candidate.getTime() < now.getTime() - 86400000 && !monthMatch[3]) candidate.setFullYear(year + 1)
        result.date = isoDate(candidate)
      }
    }
  }

  const twelveHour = value.match(/\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i)
  const twentyFour = value.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
  if (twelveHour) {
    let hour = Number(twelveHour[1]) % 12
    if (twelveHour[3].toLowerCase() === 'pm') hour += 12
    result.time = { hour, minute: Number(twelveHour[2] || 0) }
  } else if (twentyFour) result.time = { hour: Number(twentyFour[1]), minute: Number(twentyFour[2]) }
  if (/\bmorning\b/i.test(value)) result.period = 'morning'
  else if (/\bafternoon\b/i.test(value)) result.period = 'afternoon'
  else if (/\b(?:evening|night)\b/i.test(value)) result.period = 'evening'
  return result
}
