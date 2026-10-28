-- 032_knowledge_base.sql
-- Extends datasets table and adds dataset_sources for multi-source knowledge bases.

-- ═══════════════════════════════════════════════════════════════
-- 1. EXTEND DATASETS TABLE
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.datasets ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.datasets ADD COLUMN IF NOT EXISTS purpose TEXT DEFAULT 'general';
  -- 'support' | 'sales' | 'marketing' | 'general' | 'campaign' | 'hr'
ALTER TABLE public.datasets ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE public.datasets ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
  -- 'draft' | 'processing' | 'ready' | 'error' | 'updating'
ALTER TABLE public.datasets ADD COLUMN IF NOT EXISTS source_count INTEGER DEFAULT 0;
ALTER TABLE public.datasets ADD COLUMN IF NOT EXISTS created_from TEXT DEFAULT 'manual';
  -- 'manual' | 'bot_wizard'

-- ═══════════════════════════════════════════════════════════════
-- 2. CREATE DATASET_SOURCES TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.dataset_sources (
    id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    dataset_id   UUID NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
    source_type  TEXT NOT NULL, -- 'text' | 'file' | 'url' | 'google_doc' | 'notion'
    source_ref   TEXT,          -- URL, file path, or doc ID
    source_name  TEXT,          -- display label (filename, page title, URL)
    status       TEXT DEFAULT 'pending',
                 -- 'pending' | 'processing' | 'ready' | 'error' | 'cancelled'
    error_msg    TEXT,
    chunk_count  INTEGER DEFAULT 0,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ═══════════════════════════════════════════════════════════════
-- 3. ADD SOURCE TRACEABILITY TO CHUNKS
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.chunks
    ADD COLUMN IF NOT EXISTS dataset_source_id UUID
    REFERENCES public.dataset_sources(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════
-- 4. BACKFILL STATUS ON EXISTING DATASETS
-- Mark any dataset that has chunks as 'ready', others stay 'draft'
-- ═══════════════════════════════════════════════════════════════
UPDATE public.datasets SET status = 'ready'
WHERE chunk_count > 0 AND status = 'draft';

-- ═══════════════════════════════════════════════════════════════
-- 5. RLS
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.dataset_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to dataset_sources" ON public.dataset_sources;
CREATE POLICY "Service role full access to dataset_sources"
    ON public.dataset_sources FOR ALL TO service_role
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated read dataset_sources" ON public.dataset_sources;
CREATE POLICY "Authenticated read dataset_sources"
    ON public.dataset_sources FOR SELECT TO authenticated
    USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 6. INDEXES
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_dataset_sources_dataset_id ON public.dataset_sources(dataset_id);
CREATE INDEX IF NOT EXISTS idx_dataset_sources_status ON public.dataset_sources(status);
CREATE INDEX IF NOT EXISTS idx_chunks_dataset_source_id ON public.chunks(dataset_source_id);
CREATE INDEX IF NOT EXISTS idx_datasets_status ON public.datasets(status);
CREATE INDEX IF NOT EXISTS idx_datasets_purpose ON public.datasets(purpose);
