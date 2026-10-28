-- 021_dynamic_knowledge.sql
-- Adds scheduling to datasets and dynamic dataset injection to campaigns.

-- 1. Add active window to datasets
ALTER TABLE public.datasets ADD COLUMN IF NOT EXISTS active_from TIMESTAMPTZ;
ALTER TABLE public.datasets ADD COLUMN IF NOT EXISTS active_until TIMESTAMPTZ;

-- 2. Add attached datasets to campaigns
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS attached_dataset_ids UUID[] DEFAULT '{}';

-- 3. Add chunk text editing capability (no schema change needed, but good to ensure text is updatable)
-- Chunks table already has text, chunk_hash, etc.

-- Optional index for faster time-based filtering
CREATE INDEX IF NOT EXISTS idx_datasets_active_window ON public.datasets(active_from, active_until);

-- 4. New RPC for matching chunks by dataset IDs
CREATE OR REPLACE FUNCTION match_chunks_by_datasets(
  p_dataset_ids uuid[],
  p_embedding vector(768),
  p_match_count int default 5
)
RETURNS TABLE (
  id uuid,
  text text,
  source_url text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    c.id,
    c.text,
    c.source_url,
    1 - (c.embedding <=> p_embedding) as similarity
  FROM chunks c
  WHERE
    c.dataset_id = ANY(p_dataset_ids)
    AND c.active = true
    AND c.embedding IS NOT NULL
  ORDER BY c.embedding <=> p_embedding
  LIMIT p_match_count;
$$;

-- 5. RPC to increment campaign stats safely
CREATE OR REPLACE FUNCTION increment_campaign_stat(
  p_campaign_id uuid,
  p_stat text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.campaigns
  SET stats = jsonb_set(
    COALESCE(stats, '{"sent": 0, "delivered": 0, "opened": 0, "clicked": 0, "failed": 0}'::jsonb),
    array[p_stat],
    to_jsonb(COALESCE((stats->>p_stat)::int, 0) + 1)
  )
  WHERE id = p_campaign_id;
END;
$$;
