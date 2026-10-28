import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { embed } from '@/lib/embeddings'
import { generateAnswer } from '@/lib/groq'
import { createClient } from '@supabase/supabase-js'
import { getCorsHeaders, handleOptions } from '@/lib/cors'
import { lookupInDataSource, extractLookupKey } from '@/lib/datasource'
import { fireWebhook } from '@/lib/webhooks'
import { featureAllowed, getEffectiveEntitlements, consumeUsage } from '@/lib/saas/entitlements'

// We need service role to query api_keys without RLS blocking us
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get('origin')
  const cors = await getCorsHeaders('', origin)
  return handleOptions(cors)
}

async function hashKey(key: string) {
  const encoder = new TextEncoder()
  const data = encoder.encode(key)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const cors = await getCorsHeaders('', origin)

  try {
    // 1. Authenticate the API Key
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer vt_')) {
      return NextResponse.json({ error: 'Unauthorized. Valid Bearer token required.' }, { status: 401, headers: cors })
    }

    const rawKey = authHeader.split(' ')[1]
    const prefix = rawKey.substring(0, 8)
    const hashedKey = await hashKey(rawKey)

    const { data: apiKey, error: keyError } = await adminSupabase
      .from('api_keys')
      .select('id, client_id')
      .eq('prefix', prefix)
      .eq('key_hash', hashedKey)
      .single()

    if (keyError || !apiKey) {
      return NextResponse.json({ error: 'Unauthorized. Invalid API key.' }, { status: 401, headers: cors })
    }
    if (!apiKey.client_id || !featureAllowed(await getEffectiveEntitlements(apiKey.client_id),'api.enabled')) return NextResponse.json({error:'API access is unavailable for this workspace.'},{status:403,headers:cors})

    // Update last used
    await adminSupabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', apiKey.id)

    // 2. Parse Request
    const { question, context_id, session_id = crypto.randomUUID(), history = [], visitor_language } = await req.json()

    if (!question?.trim() || !context_id) {
      return NextResponse.json({ error: 'question and context_id are required' }, { status: 400, headers: cors })
    }

    const cleanQuestion = question.trim().slice(0, 1000)

    // 3. Verify Context ID exists
    const { data: clientCtx } = await supabase
      .from('clients')
      .select('id')
      .eq('context_id', context_id)
      .eq('id', apiKey.client_id)
      .single()
    if (!clientCtx) {
      return NextResponse.json({ error: 'Invalid context_id' }, { status: 404, headers: cors })
    }

    // 4. Data Source Lookup
    const { data: dataSource } = await supabase
      .from('data_sources')
      .select('id')
      .eq('context_id', context_id)
      .eq('enabled', true)
      .single()

    const hasDataSource = !!dataSource

    if (hasDataSource) {
      const extractedId = await extractLookupKey(cleanQuestion)
      if (extractedId) {
        const dataSourceResult = await lookupInDataSource(context_id, extractedId)
        if (dataSourceResult) {
          await consumeUsage(apiKey.client_id,'ai.credits.monthly',`api-answer:${crypto.randomUUID()}`)
          const { answer, source_url } = await generateAnswer(cleanQuestion, [], history, dataSourceResult, visitor_language)
          await logMessages(context_id, session_id, cleanQuestion, answer, source_url)
          return NextResponse.json({ answer, source_url, source: 'data_source', session_id }, { headers: cors })
        }
      }
    }

    // 5. RAG Pipeline
    const questionEmbedding = await embed(cleanQuestion)
    const embeddingStr = JSON.stringify(questionEmbedding)

    const { data: chunks } = await supabase.rpc('match_chunks', {
      p_context_id: context_id,
      p_embedding: embeddingStr,
      p_match_count: 5,
    })

    if (!chunks?.length && !hasDataSource) {
      const fallback = "I don't have enough information about that."
      await logMessages(context_id, session_id, cleanQuestion, fallback, null)
      return NextResponse.json({ answer: fallback, source_url: null, source: 'fallback', session_id }, { headers: cors })
    }

    await consumeUsage(apiKey.client_id,'ai.credits.monthly',`api-answer:${crypto.randomUUID()}`)
    let { answer, source_url } = await generateAnswer(
      cleanQuestion,
      chunks ?? [],
      history,
      null, // data_source_result
      visitor_language
    )

    let finalAnswer = answer

    const needsHandoff = finalAnswer.includes('[HANDOFF]') || finalAnswer.includes('[HUMAN]')
    if (needsHandoff) {
      const { data: bot } = await supabase.from('bots').select('handoff_message').eq('client_id', clientCtx.id).single()
      finalAnswer = bot?.handoff_message || 'Let me connect you with a human agent who can help further.'

      // Update session to human mode
      await supabase.from('sessions').upsert({
        session_id: session_id,
        client_id: clientCtx.id,
        mode: 'waiting'
      }, { onConflict: 'session_id' })

      // Create handoff request
      await supabase.from('handoff_requests').insert({
        session_id: session_id,
        client_id: clientCtx.id,
        reason: 'User requested human agent'
      })
    }

    await logMessages(context_id, session_id, cleanQuestion, finalAnswer, source_url)

    return NextResponse.json({
      answer: finalAnswer,
      source_url,
      source: 'rag',
      session_id,
      ...(needsHandoff ? { handoff: true } : {})
    }, { headers: cors })

  } catch (err: any) {
    console.error('[/api/v1/chat]', err.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: cors })
  }
}

async function logMessages(contextId: string, sessionId: string, question: string, answer: string, sourceUrl: string | null) {
  // Fire and forget logging
  supabase.from('messages').insert([
    { context_id: contextId, session_id: sessionId, role: 'user', content: question },
    { context_id: contextId, session_id: sessionId, role: 'assistant', content: answer, source_url: sourceUrl },
  ]).then()

  fireWebhook(contextId, 'message.received', {
    session_id: sessionId,
    question,
    answer,
    source_url: sourceUrl
  })
}
