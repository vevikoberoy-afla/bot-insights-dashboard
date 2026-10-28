-- 1. HNSW index for query_cache table (Semantic Cache)
CREATE INDEX IF NOT EXISTS idx_query_cache_embedding_hnsw
  ON public.query_cache
  USING hnsw (question_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Fast scoped filtering on context_id
CREATE INDEX IF NOT EXISTS idx_query_cache_context_id
  ON public.query_cache (context_id);

-- 2. HNSW index for qa_pairs table (Manual FAQ Pairs)
CREATE INDEX IF NOT EXISTS idx_qa_pairs_embedding_hnsw
  ON public.qa_pairs
  USING hnsw (question_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_qa_pairs_context_id
  ON public.qa_pairs (context_id);