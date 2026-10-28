-- Hybrid dense + full-text retrieval and entity-safe semantic caching.
ALTER TABLE public.chunks ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(text, ''))) STORED;
CREATE INDEX IF NOT EXISTS chunks_fts_idx ON public.chunks USING gin (fts);
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx ON public.chunks
  USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);

ALTER TABLE public.query_cache ADD COLUMN IF NOT EXISTS entity_signature text NOT NULL DEFAULT 'general';
CREATE INDEX IF NOT EXISTS query_cache_entity_idx ON public.query_cache(context_id, entity_signature);

CREATE OR REPLACE FUNCTION public.match_query_cache_safe(
  p_context_id text,
  p_embedding vector(768),
  p_entity_signature text,
  p_threshold float DEFAULT 0.92
) RETURNS TABLE(id uuid,response_text text,source_url text,similarity float,hit_count integer)
LANGUAGE sql STABLE AS $$
  SELECT qc.id,qc.response_text,qc.source_url,
    (1-(qc.question_embedding <=> p_embedding))::float,qc.hit_count
  FROM public.query_cache qc
  WHERE qc.context_id=p_context_id
    AND qc.entity_signature=p_entity_signature
    AND (1-(qc.question_embedding <=> p_embedding))>p_threshold
  ORDER BY qc.question_embedding <=> p_embedding
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.match_chunks_by_datasets_hybrid(
  p_dataset_ids uuid[],p_embedding vector(768),p_query_text text,p_match_count int DEFAULT 5
) RETURNS TABLE(id uuid,text text,source_url text,similarity float,rrf_score float)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  PERFORM set_config('hnsw.ef_search','32',true);
  RETURN QUERY WITH vec AS (
    SELECT c.id,c.text,c.source_url,(1-(c.embedding <=> p_embedding))::float sim,
      row_number() OVER(ORDER BY c.embedding <=> p_embedding) rnk
    FROM public.chunks c WHERE c.dataset_id=ANY(p_dataset_ids) AND c.active=true AND c.embedding IS NOT NULL
      AND (1-(c.embedding <=> p_embedding))>0.40 ORDER BY c.embedding <=> p_embedding LIMIT p_match_count*2
  ), kw AS (
    SELECT c.id,c.text,c.source_url,0.50::float sim,
      row_number() OVER(ORDER BY ts_rank_cd(c.fts,websearch_to_tsquery('english',p_query_text)) DESC) rnk
    FROM public.chunks c WHERE c.dataset_id=ANY(p_dataset_ids) AND c.active=true AND p_query_text<>''
      AND c.fts @@ websearch_to_tsquery('english',p_query_text)
    ORDER BY ts_rank_cd(c.fts,websearch_to_tsquery('english',p_query_text)) DESC LIMIT p_match_count*2
  ) SELECT coalesce(v.id,k.id),coalesce(v.text,k.text),coalesce(v.source_url,k.source_url),
      coalesce(v.sim,k.sim),
      (coalesce(1.0/(60+v.rnk),0)+coalesce(1.0/(60+k.rnk),0))::float
    FROM vec v FULL JOIN kw k ON v.id=k.id ORDER BY 5 DESC LIMIT p_match_count;
END $$;

CREATE OR REPLACE FUNCTION public.match_chunks_hybrid(
  p_context_id text,p_embedding vector(768),p_query_text text,p_match_count int DEFAULT 5
) RETURNS TABLE(id uuid,text text,source_url text,similarity float,rrf_score float)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  PERFORM set_config('hnsw.ef_search','32',true);
  RETURN QUERY WITH vec AS (
    SELECT c.id,c.text,c.source_url,(1-(c.embedding <=> p_embedding))::float sim,
      row_number() OVER(ORDER BY c.embedding <=> p_embedding) rnk
    FROM public.chunks c WHERE c.context_id=p_context_id AND c.active=true AND c.embedding IS NOT NULL
      AND (1-(c.embedding <=> p_embedding))>0.40 ORDER BY c.embedding <=> p_embedding LIMIT p_match_count*2
  ), kw AS (
    SELECT c.id,c.text,c.source_url,0.50::float sim,
      row_number() OVER(ORDER BY ts_rank_cd(c.fts,websearch_to_tsquery('english',p_query_text)) DESC) rnk
    FROM public.chunks c WHERE c.context_id=p_context_id AND c.active=true AND p_query_text<>''
      AND c.fts @@ websearch_to_tsquery('english',p_query_text)
    ORDER BY ts_rank_cd(c.fts,websearch_to_tsquery('english',p_query_text)) DESC LIMIT p_match_count*2
  ) SELECT coalesce(v.id,k.id),coalesce(v.text,k.text),coalesce(v.source_url,k.source_url),
      coalesce(v.sim,k.sim),
      (coalesce(1.0/(60+v.rnk),0)+coalesce(1.0/(60+k.rnk),0))::float
    FROM vec v FULL JOIN kw k ON v.id=k.id ORDER BY 5 DESC LIMIT p_match_count;
END $$;

REVOKE ALL ON FUNCTION public.match_query_cache_safe(text,vector,text,float) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.match_chunks_by_datasets_hybrid(uuid[],vector,text,int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.match_chunks_hybrid(text,vector,text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_query_cache_safe(text,vector,text,float) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_chunks_by_datasets_hybrid(uuid[],vector,text,int) TO service_role;
GRANT EXECUTE ON FUNCTION public.match_chunks_hybrid(text,vector,text,int) TO service_role;
