-- 044_query_cache_qa_pairs_hnsw_index.sql
-- High-performance HNSW index for vector embeddings on query_cache and qa_pairs tables
-- Eliminates sequential table scans during Stage 1 (QA pairs) and Stage 2 (query cache) fast-path checks

-- 1. HNSW index for query_cache table (Semantic Cache)
CREATE INDEX IF NOT EXISTS idx_query_cache_embedding_hnsw
  ON public.query_cache
  USING hnsw (question_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Also add composite index on context_id if not already present for fast scoped filtering
CREATE INDEX IF NOT EXISTS idx_query_cache_context_id
  ON public.query_cache (context_id);

-- 2. HNSW index for qa_pairs table (Manual FAQ Pairs)
CREATE INDEX IF NOT EXISTS idx_qa_pairs_embedding_hnsw
  ON public.qa_pairs
  USING hnsw (question_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_qa_pairs_context_id
  ON public.qa_pairs (context_id);
