import { supabase } from '@/lib/supabase'
import { withTimeout } from '@/lib/utils/withTimeout'

export interface ResolveQaMatchParams {
  clientId?: string | null
  botId?: string | null
  contextId?: string | null
  cleanQuestion: string
  embedding: number[]
}

export interface QaMatchResult {
  matched: boolean
  answer?: string
  source?: 'manual_faq' | 'legacy_faq' | 'query_cache'
  similarity?: number
  sourceId?: string
}

const QA_VECTOR_THRESHOLD = 0.88
const AMBIGUITY_MARGIN = 0.03

/**
 * Log a near miss or ambiguous match asynchronously (fail-open)
 */
async function logNearMiss(params: {
  clientId?: string | null
  botId?: string | null
  contextId?: string | null
  question: string
  topSimilarity: number
  runnerUpSimilarity?: number | null
  matchedQaId?: string | null
  reason: 'low_confidence' | 'ambiguous_margin'
}) {
  try {
    await supabase.from('qa_near_misses').insert({
      client_id: params.clientId || null,
      bot_id: params.botId || null,
      context_id: params.contextId || null,
      question: params.question,
      top_similarity: params.topSimilarity,
      runner_up_similarity: params.runnerUpSimilarity || null,
      matched_qa_id: params.matchedQaId || null,
      reason: params.reason,
    })
  } catch {
    // Fail-open: Never fail the request if near-miss logging encounters an issue
  }
}

/**
 * Resolves whether an incoming user question semantically matches a curated Q&A pair
 * via vector cosine similarity.
 *
 * ── CALLER CONTRACT ─────────────────────────────────────────────────────────
 * This function is called ONLY after the caller (route.ts) has already exhausted
 * all zero-embedding fast paths in this strict order:
 *
 *   Stage 0.A — Exact normalized_question match on manual_qa_pairs  (Postgres index, no embed)
 *   Stage 0.B — Exact ilike match on legacy qa_pairs                (Postgres index, no embed)
 *   Stage 0.C — Redis chat_cache key lookup                          (O(1) GET, no embed)
 *
 * embed() is called ONCE by the caller and passed in as `embedding`.
 * This function NEVER triggers an embedding API call — it is purely a vector similarity resolver.
 *
 * ── PRECEDENCE ORDER ────────────────────────────────────────────────────────
 * 1. Vector cosine match in `manual_qa_pairs`  (>= 0.88, margin >= 0.03 over runner-up)
 * 2. Vector cosine match in `qa_pairs` legacy fallback (>= 0.88)
 *
 * Curated manual QA ALWAYS takes precedence over auto-generated or cache entries.
 */
export async function resolveQaMatch(params: ResolveQaMatchParams): Promise<QaMatchResult> {
  const { clientId, botId, contextId, cleanQuestion, embedding } = params
  const embeddingStr = JSON.stringify(embedding)

  // ── Stage 1: Vector Cosine Similarity Search (>= 0.88 with Ambiguity Margin) ──
  if (clientId) {
    try {
      const { data: vectorHits } = await withTimeout(
        supabase.rpc('match_manual_qa_pairs', {
          p_client_id: clientId,
          p_bot_id: botId || null,
          p_embedding: embeddingStr,
          p_threshold: 0.80, // Fetch candidates above 0.80 for ambiguity & near-miss evaluation
        }),
        450,
        { data: null } as any
      ).catch(() => ({ data: null }))

      if (vectorHits && vectorHits.length > 0) {
        const topHit = vectorHits[0]
        const topSimilarity = Number(topHit.similarity || 0)
        const runnerUp = vectorHits.length > 1 ? vectorHits[1] : null
        const runnerUpSimilarity = runnerUp ? Number(runnerUp.similarity || 0) : null

        // Check if top hit passes threshold
        if (topSimilarity >= QA_VECTOR_THRESHOLD) {
          // Ambiguity Margin Check: If a runner-up exists, top must beat it by >= 0.03
          if (runnerUpSimilarity !== null && (topSimilarity - runnerUpSimilarity) < AMBIGUITY_MARGIN) {
            // Margin is too tight — question is ambiguous between two FAQ answers!
            // Log near miss and fall through to LLM for full reasoning.
            logNearMiss({
              clientId,
              botId,
              contextId,
              question: cleanQuestion,
              topSimilarity,
              runnerUpSimilarity,
              matchedQaId: topHit.id,
              reason: 'ambiguous_margin',
            }).catch(() => {})
          } else {
            // Confirmed winner with clear margin
            return {
              matched: true,
              answer: topHit.answer,
              source: 'manual_faq',
              similarity: topSimilarity,
              sourceId: topHit.id,
            }
          }
        } else if (topSimilarity >= 0.80) {
          // Scored between 0.80 and 0.879: Log near-miss for merchant analytics
          logNearMiss({
            clientId,
            botId,
            contextId,
            question: cleanQuestion,
            topSimilarity,
            runnerUpSimilarity,
            matchedQaId: topHit.id,
            reason: 'low_confidence',
          }).catch(() => {})
        }
      }
    } catch (err) {
      console.warn('[resolveQaMatch] vector manual match error:', err)
    }
  }

  // ── Stage 2: Legacy qa_pairs Vector Fallback ───────────────────────────────
  if (contextId) {
    try {
      const { data: legacyVectorHits } = await withTimeout(
        supabase.rpc('match_qa_pairs', {
          p_context_id: contextId,
          p_embedding: embeddingStr,
          p_threshold: QA_VECTOR_THRESHOLD,
        }),
        400,
        { data: null } as any
      ).catch(() => ({ data: null }))

      if (legacyVectorHits && legacyVectorHits.length > 0) {
        const hit = legacyVectorHits[0]
        return {
          matched: true,
          answer: hit.answer,
          source: 'legacy_faq',
          similarity: Number(hit.similarity || QA_VECTOR_THRESHOLD),
          sourceId: hit.id,
        }
      }
    } catch (err) {
      console.warn('[resolveQaMatch] legacy vector match error:', err)
    }
  }

  return { matched: false }
}
