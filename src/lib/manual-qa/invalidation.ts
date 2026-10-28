import { supabase } from '@/lib/supabase'
import { redis } from '@/lib/redis'
import { normalizeQuestion } from './normalize'

export async function invalidateFaqCaches(params: {
  clientId: string
  contextId?: string | null
  botId?: string | null
  question: string
  embedding?: number[] | null
}) {
  const { clientId, contextId, botId, question, embedding } = params
  if (!question || !clientId) return

  const normalized = normalizeQuestion(question)
  const embeddingStr = embedding && embedding.length > 0 ? JSON.stringify(embedding) : null

  try {
    // 1. Resolve all relevant context identifiers for this client
    const targetContexts = new Set<string>()
    if (contextId) targetContexts.add(contextId)
    targetContexts.add(clientId)

    const { data: clientRow } = await supabase
      .from('clients')
      .select('context_id')
      .eq('id', clientId)
      .maybeSingle()

    if (clientRow?.context_id) {
      targetContexts.add(clientRow.context_id)
    }

    const contextList = Array.from(targetContexts)
    const questionsToBust = new Set<string>([question, normalized])

    // 2. Query Postgres query_cache for any cached questions that matched similarity >= 0.95
    if (embeddingStr) {
      for (const ctx of contextList) {
        try {
          const { data: similar } = await supabase.rpc('match_query_cache', {
            p_context_id: ctx,
            p_embedding: embeddingStr,
            p_threshold: 0.95,
          })

          if (similar && Array.isArray(similar)) {
            for (const item of similar) {
              if (item.question_text) {
                questionsToBust.add(item.question_text)
              }
            }
          }
        } catch {
          // Non-blocking fallback
        }
      }

      // Purge matching similar rows from query_cache table via RPC
      try {
        await supabase.rpc('purge_similar_query_cache', {
          p_client_id: clientId,
          p_embedding: embeddingStr,
          p_threshold: 0.95,
        })
      } catch {
        // Fallback to text matching if RPC not yet run
        for (const ctx of contextList) {
          try {
            await supabase
              .from('query_cache')
              .delete()
              .eq('context_id', ctx)
              .ilike('question_text', `%${question.trim()}%`)
          } catch {}
        }
      }
    } else {
      // No embedding provided, purge exact string matches
      for (const ctx of contextList) {
        try {
          await supabase
            .from('query_cache')
            .delete()
            .eq('context_id', ctx)
            .ilike('question_text', `%${question.trim()}%`)
        } catch {}
      }
    }

    // 3. Invalidate Redis chat_cache for all candidate questions across all client contexts
    const redisKeysToDelete: string[] = []
    const qList = Array.from(questionsToBust)
    for (const ctx of contextList) {
      for (const q of qList) {
        const b64 = Buffer.from(q.toLowerCase()).toString('base64')
        redisKeysToDelete.push(`chat_cache:${ctx}:${b64}`)
        if (botId) redisKeysToDelete.push(`chat_cache:${ctx}:${botId}:${b64}`)
      }
    }

    if (redisKeysToDelete.length > 0) {
      await Promise.allSettled(redisKeysToDelete.map(key => redis.del(key)))
    }
  } catch (err) {
    console.error('[FAQ Cache Invalidation Error]:', err)
  }
}
