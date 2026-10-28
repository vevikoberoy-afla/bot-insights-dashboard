/**
 * OpenRouter LLM client — Primary AI provider
 * Model: liquid/lfm-2.5-2.6b:free (LiquidAI LFM2.5-2.6B)
 *
 * Note: groq-sdk is intentionally kept in the codebase for future use
 * but all active LLM calls now go through this module.
 */

import { OpenRouter } from '@openrouter/sdk'

const MODEL_MAIN     = 'liquid/lfm-2.5-2.6b:free'   // Main chat answer generation
const MODEL_CLASSIFY = 'liquid/lfm-2.5-2.6b:free'   // Intent routing & extraction (same model, tiny output)

let _client: OpenRouter | null = null
function getClient(): OpenRouter {
  if (!_client) {
    const apiKey = (
      process.env.OPENROUTER_API_KEY ||
      process.env.Openrouter_API_KEY ||
      process.env.OPENROUTER_KEY ||
      ''
    ).trim()

    if (!apiKey) {
      console.warn('[OpenRouter] Warning: No OPENROUTER_API_KEY found in environment variables.')
    }

    _client = new OpenRouter({
      apiKey,
    })
  }
  return _client
}

export interface ORMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Full conversational completion — used for RAG answer generation and email triage.
 * Non-streaming; returns the complete text response.
 */
export async function chatComplete(
  messages: ORMessage[],
  opts: {
    maxTokens?: number
    temperature?: number
    responseFormat?: 'json_object' | 'text'
  } = {}
): Promise<string> {
  const client = getClient()

  const payload: any = {
    model: MODEL_MAIN,
    messages,
    max_tokens: opts.maxTokens ?? 512,
    temperature: opts.temperature ?? 0.7,
  }

  if (opts.responseFormat === 'json_object') {
    payload.response_format = { type: 'json_object' }
  }

  const response = await client.chat.send({
    chatRequest: { ...payload, stream: false },
  } as any)

  const text = (response as any).choices?.[0]?.message?.content ?? ''
  return text
}

/**
 * Fast classification / extraction — small max_tokens, temperature=0 for determinism.
 * Used for intent classification (10 tokens) and key extraction (10 tokens).
 */
export async function chatClassify(
  systemPrompt: string,
  userMessage: string,
  maxTokens = 16
): Promise<string> {
  const client = getClient()

  const response = await client.chat.send({
    chatRequest: {
      model: MODEL_CLASSIFY,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: maxTokens,
      temperature: 0,
      stream: false,
    },
  } as any)

  const text = (response as any).choices?.[0]?.message?.content?.trim() ?? ''
  return text
}
