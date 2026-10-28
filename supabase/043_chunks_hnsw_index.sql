-- 043_chunks_hnsw_index.sql
-- High-performance HNSW index for vector embeddings on chunks table
-- Resolves the sub-second retrieval requirement for Stage 4

CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw
  ON public.chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
