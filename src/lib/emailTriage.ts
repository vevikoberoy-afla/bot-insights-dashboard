/**
 * NOTE: groq-sdk import kept for future use.
 * Active LLM calls now use Google Gemini Flash Lite (free tier).
 */
import Groq from 'groq-sdk' // legacy — kept for future use
import { chatComplete } from './gemini'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _groqLegacy = new Groq({ apiKey: process.env.GROQ_API_KEY || '' })

export interface EmailTriageInput {
  clientId?: string
  operationId?: string
  subject: string
  messageText: string
  fromEmail: string
  fromName?: string
  chunks: Array<{ text: string; source_url?: string | null }>
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  botName?: string
  botPrompt?: string
}

export interface EmailTriageResult {
  category: 'spam' | 'simple_faq' | 'complex_business' | 'needs_human'
  spamReason?: string
  emailSummary: string
  replySummary?: string
  draftReply?: string
  autoReply?: string
}

/**
 * Intelligent Email Triage & Classification Engine
 * 
 * 1. Detects Spam/Phishing/Marketing blasts.
 * 2. Classifies Routine FAQs vs Complex Business Inquiries.
 * 3. Checks knowledge base coverage.
 * 4. Generates 1-line email summary, full draft, and 1-line reply summary for human approval.
 */
export async function triageEmail(input: EmailTriageInput): Promise<EmailTriageResult> {
  const { subject, messageText, fromEmail, fromName, chunks, history = [], botName = 'Support Team', botPrompt } = input

  // Quick heuristic pre-filter for obvious spam/bounces
  const lowerSubject = subject.toLowerCase()
  const lowerFrom = fromEmail.toLowerCase()
  const lowerText = messageText.toLowerCase()

  const isObviousSpam =
    lowerFrom.includes('mailer-daemon') ||
    lowerFrom.includes('postmaster@') ||
    lowerSubject.startsWith('undelivered mail') ||
    lowerSubject.startsWith('delivery status notification (failure)') ||
    lowerText.includes('unsubscribe from this list') ||
    lowerSubject.includes('viagra') ||
    lowerSubject.includes('wire transfer notification') ||
    lowerSubject.includes('inheritance claim')

  if (isObviousSpam) {
    return {
      category: 'spam',
      spamReason: 'Automated bounce or unsolicited bulk email pattern',
      emailSummary: `Automated or marketing message: ${subject.slice(0, 80)}`,
    }
  }

  const contextText = chunks
    .map((c, i) => `[Source ${i + 1}${c.source_url ? ` — ${c.source_url}` : ''}]\n${c.text}`)
    .join('\n\n')

  const systemPrompt = `You are an AI Email Operations Assistant and Triage Engine for ${botName}.
Your job is to analyze an incoming customer email, determine if it is spam or a legitimate customer inquiry, and decide whether it should be auto-replied, drafted for human review, or handed over to a human.

CONTEXT FROM KNOWLEDGE BASE:
${contextText || '(No specific knowledge base context found)'}

${botPrompt ? `BOT GUIDELINES:\n${botPrompt}\n` : ''}

TRIAGE RULES:
1. "spam":
   - The email is spam, unsolicited sales/marketing, phishing, crypto solicitation, or automated bounce.
   - Output category: "spam", spam_reason: short explanation.

2. "simple_faq":
   - The customer is asking a standard, straightforward question (e.g. business hours, return policy timeframe, standard pricing tier, shipping times, contact info).
   - The knowledge base context provides a clear, direct, and complete answer.
   - Output category: "simple_faq".
   - auto_reply: A warm, clear, professional email reply addressing their question directly.
   - email_summary: EXACTLY 1 concise sentence summarizing the customer's question.

3. "complex_business":
   - The customer asks a complex, high-value, or nuanced business question (e.g. custom enterprise quotation, bulk/wholesale order, partnership, contractual terms, multi-step migration, bespoke SLA, customization).
   - The knowledge base context HAS relevant information to answer or make a strong proposal.
   - In this case, DO NOT send automatically. We must draft the reply for a human agent to review and approve!
   - Output category: "complex_business".
   - email_summary: EXACTLY 1 concise sentence describing the customer's request (e.g., "Customer asking for 100-seat enterprise volume pricing and custom SLA terms.").
   - reply_summary: EXACTLY 1 concise sentence summarizing the proposed reply (e.g., "Provided Enterprise Tier quote at $79/seat with 99.9% SLA and suggested a live setup call.").
   - draft_reply: A complete, polished, executive email reply ready for a human to review and send with 1 click.

4. "needs_human":
   - The customer is asking a legitimate question, but the knowledge base lacks sufficient information to answer accurately, or it requires manual agent intervention (e.g. custom bug investigation, sensitive account lookup, refund dispute).
   - Output category: "needs_human".
   - email_summary: EXACTLY 1 concise sentence describing the customer's request.
   - draft_reply: null.

OUTPUT FORMAT:
Return ONLY a valid JSON object with NO markdown backticks, matching:
{
  "category": "spam" | "simple_faq" | "complex_business" | "needs_human",
  "spam_reason": string | null,
  "email_summary": string,
  "reply_summary": string | null,
  "draft_reply": string | null,
  "auto_reply": string | null
}`

  try {
    if (input.clientId) {
      const { consumeUsage } = await import('@/lib/saas/entitlements')
      await consumeUsage(input.clientId,'ai.credits.monthly',input.operationId || `email-draft:${crypto.randomUUID()}`)
    }
    const raw = await chatComplete(
      [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `FROM: ${fromName || ''} <${fromEmail}>\nSUBJECT: ${subject}\n\nBODY:\n${messageText}`
        }
      ],
      {
        maxTokens: 1024,
        temperature: 0.2,
        responseFormat: 'json_object',
      }
    )

    const parsed = JSON.parse(raw || '{}')

    return {
      category: parsed.category || (chunks.length > 0 ? 'complex_business' : 'needs_human'),
      spamReason: parsed.spam_reason || undefined,
      emailSummary: parsed.email_summary || subject || 'Customer inquiry',
      replySummary: parsed.reply_summary || undefined,
      draftReply: parsed.draft_reply || undefined,
      autoReply: parsed.auto_reply || undefined,
    }
  } catch (err) {
    console.error('[triageEmail error]:', err)
    // Fallback safe classification
    const hasContext = chunks.length > 0
    const fallbackSummary = subject ? `Inquiry regarding "${subject.slice(0, 60)}"` : 'Customer email inquiry'
    return {
      category: hasContext ? 'complex_business' : 'needs_human',
      emailSummary: fallbackSummary,
      replySummary: hasContext ? 'Review knowledge base context and draft response' : undefined,
      draftReply: hasContext ? chunks[0]?.text?.slice(0, 400) : undefined,
    }
  }
}
