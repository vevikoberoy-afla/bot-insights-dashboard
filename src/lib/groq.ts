import Groq from 'groq-sdk' // legacy — kept for future use
import { generateAnswerUnified, generateAnswerStream, type GeminiMessage } from './gemini'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _groqLegacy = new Groq({ apiKey: process.env.GROQ_API_KEY || '' })

export { generateAnswerUnified, generateAnswerStream }

export interface ChatContext {
  text: string
  source_url: string | null
}

export interface HistoryMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function generateAnswer(
  question: string,
  context: ChatContext[],
  history: HistoryMessage[] = [],
  dataSourceResult?: string | null,
  visitorLanguage?: string | null,
  botPrompt?: string | null,
  clientId?: string,
  botId?: string
): Promise<{ answer: string; source_url: string | null }> {
  return generateAnswerUnified({
    question,
    knowledgeChunks: context,
    history,
    clientId,
    botId,
    botPrompt,
    dataSourceResult,
  })
}
