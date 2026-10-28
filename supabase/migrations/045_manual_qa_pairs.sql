-- 045_manual_qa_pairs.sql
-- Manual FAQ Overrides with authoritative merchant answers and HNSW vector search

CREATE TABLE IF NOT EXISTS public.manual_qa_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  bot_id UUID REFERENCES public.bots(id) ON DELETE CASCADE, -- nullable: null means applies to all bots for this client
  question TEXT NOT NULL,
  normalized_question TEXT NOT NULL,
  question_embedding VECTOR(768),
  answer TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- HNSW vector index on question_embedding (m=16, ef_construction=64)
CREATE INDEX IF NOT EXISTS idx_manual_qa_pairs_embedding_hnsw
  ON public.manual_qa_pairs
  USING hnsw (question_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_manual_qa_pairs_client_id
  ON public.manual_qa_pairs (client_id);

CREATE INDEX IF NOT EXISTS idx_manual_qa_pairs_bot_id
  ON public.manual_qa_pairs (bot_id);

CREATE INDEX IF NOT EXISTS idx_manual_qa_pairs_normalized
  ON public.manual_qa_pairs (client_id, normalized_question);

CREATE INDEX IF NOT EXISTS idx_manual_qa_pairs_active
  ON public.manual_qa_pairs (client_id, is_active);

-- RPC for Cosine Similarity Search on manual_qa_pairs
-- Threshold >= 0.95, prefers bot-specific override over global on similarity ties
CREATE OR REPLACE FUNCTION match_manual_qa_pairs(
  p_client_id   UUID,
  p_bot_id      UUID,
  p_embedding   VECTOR(768),
  p_threshold   FLOAT DEFAULT 0.95
)
RETURNS TABLE (
  id          UUID,
  question    TEXT,
  answer      TEXT,
  bot_id      UUID,
  similarity  FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    q.id,
    q.question,
    q.answer,
    q.bot_id,
    1 - (q.question_embedding <=> p_embedding) AS similarity
  FROM public.manual_qa_pairs q
  WHERE
    q.client_id = p_client_id
    AND (q.bot_id IS NULL OR p_bot_id IS NULL OR q.bot_id = p_bot_id)
    AND q.is_active = true
    AND q.question_embedding IS NOT NULL
    AND (1 - (q.question_embedding <=> p_embedding)) >= p_threshold
  ORDER BY
    (CASE WHEN q.bot_id = p_bot_id THEN 0 ELSE 1 END), -- prefer bot-specific override
    q.question_embedding <=> p_embedding ASC
  LIMIT 1;
$$;

-- RPC to purge similar query_cache rows on FAQ update (similarity >= threshold)
CREATE OR REPLACE FUNCTION purge_similar_query_cache(
  p_client_id   UUID,
  p_embedding   VECTOR(768),
  p_threshold   FLOAT DEFAULT 0.95
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM public.query_cache qc
  WHERE
    (qc.context_id IN (SELECT context_id FROM public.clients WHERE id = p_client_id)
     OR qc.context_id = p_client_id::text)
    AND qc.question_embedding IS NOT NULL
    AND (1 - (qc.question_embedding <=> p_embedding)) >= p_threshold;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;
