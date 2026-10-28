-- 046_qa_margin_and_precedence.sql
-- Near-miss logging and ambiguity tracking table for QA fast-path

CREATE TABLE IF NOT EXISTS public.qa_near_misses (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            UUID REFERENCES public.clients(id) ON DELETE CASCADE,
  bot_id               UUID REFERENCES public.bots(id) ON DELETE CASCADE,
  context_id           TEXT,
  question             TEXT NOT NULL,
  top_similarity       FLOAT,
  runner_up_similarity FLOAT,
  matched_qa_id        UUID,
  reason               TEXT NOT NULL, -- 'low_confidence' | 'ambiguous_margin'
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup index for analytics & dashboard insights
CREATE INDEX IF NOT EXISTS idx_qa_near_misses_client 
ON public.qa_near_misses (client_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.qa_near_misses ENABLE ROW LEVEL SECURITY;

-- Service role full access
DROP POLICY IF EXISTS "Service role full access to qa_near_misses" ON public.qa_near_misses;
CREATE POLICY "Service role full access to qa_near_misses"
ON public.qa_near_misses FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
