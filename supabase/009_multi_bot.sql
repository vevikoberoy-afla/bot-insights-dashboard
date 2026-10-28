-- 009_multi_bot.sql
-- Transforms the architecture from 1-client-1-context to 1-client-many-bots with shared datasets.
-- IMPORTANT: Run this AFTER all previous migrations (001-008).

-- ═══════════════════════════════════════════════════════════════
-- 0. FIX PREVIOUS MIGRATION DATA TYPES (if needed)
-- ═══════════════════════════════════════════════════════════════
-- If the clients table was accidentally created with id as 'text' instead of 'uuid',
-- we must cast it to 'uuid' so that all our foreign keys can correctly reference it.
DO $$ 
BEGIN 
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'clients' 
      AND column_name = 'id' 
      AND data_type = 'text'
  ) THEN 
    -- Drop the existing default first — Postgres cannot auto-cast a text
    -- default expression (e.g. DEFAULT ''::text or DEFAULT uuid_generate_v4()::text)
    -- to uuid, even though USING handles casting the column's row data.
    ALTER TABLE public.clients ALTER COLUMN id DROP DEFAULT;
    ALTER TABLE public.clients ALTER COLUMN id TYPE uuid USING id::uuid;
    ALTER TABLE public.clients ALTER COLUMN id SET DEFAULT uuid_generate_v4();
  END IF; 
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 1. BOTS TABLE (replaces the concept of a single context per client)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.bots (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'My Bot',
    purpose TEXT DEFAULT 'support',  -- sales, support, hr, custom
    status TEXT DEFAULT 'active',     -- active, paused, building
    tone TEXT DEFAULT 'friendly',     -- concise, detailed, friendly, formal
    fallback_message TEXT DEFAULT 'I don''t have that information. Please contact us directly for help.',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ═══════════════════════════════════════════════════════════════
-- 2. DATASETS TABLE (knowledge bases — independent, shareable across bots)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.datasets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Untitled Dataset',
    type TEXT DEFAULT 'crawl',        -- crawl, upload, manual, database
    source_url TEXT,
    crawl_status TEXT DEFAULT 'idle',  -- idle, crawling, done, failed
    chunk_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ═══════════════════════════════════════════════════════════════
-- 3. BOT_DATASETS JOIN TABLE (many-to-many: bots ↔ datasets)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.bot_datasets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
    dataset_id UUID NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
    linked_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(bot_id, dataset_id)
);

-- ═══════════════════════════════════════════════════════════════
-- 4. ADD NEW COLUMNS TO EXISTING TABLES
-- ═══════════════════════════════════════════════════════════════

-- Add dataset_id to chunks (a chunk belongs to a dataset, not directly to a bot)
ALTER TABLE public.chunks ADD COLUMN IF NOT EXISTS dataset_id UUID REFERENCES public.datasets(id) ON DELETE CASCADE;

-- Add bot_id and channel to messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS bot_id UUID REFERENCES public.bots(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'web';

-- Add mode tracking for human handoff
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'ai';  -- ai or human

-- ═══════════════════════════════════════════════════════════════
-- 5. MIGRATE EXISTING DATA
-- For each client that has a context_id, create a bot + dataset and link them.
-- This preserves all existing functionality.
-- ═══════════════════════════════════════════════════════════════

-- Create a dataset for each client that has chunks
INSERT INTO public.datasets (id, client_id, name, type, chunk_count, created_at)
SELECT
    c.context_id::uuid,
    c.id,
    c.name || ' - Website',
    'crawl',
    COALESCE(ctx.chunk_count, 0),
    c.created_at
FROM public.clients c
LEFT JOIN public.contexts ctx ON ctx.id = c.context_id
WHERE c.context_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Create a bot for each client
INSERT INTO public.bots (id, client_id, name, purpose, status, created_at)
SELECT
    uuid_generate_v4(),
    c.id,
    c.name || ' Bot',
    'support',
    'active',
    c.created_at
FROM public.clients c
WHERE c.context_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Link each bot to its dataset
INSERT INTO public.bot_datasets (bot_id, dataset_id)
SELECT
    b.id,
    c.context_id::uuid
FROM public.clients c
JOIN public.bots b ON b.client_id = c.id
WHERE c.context_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill dataset_id on existing chunks
UPDATE public.chunks
SET dataset_id = context_id::uuid
WHERE dataset_id IS NULL 
  AND context_id IS NOT NULL
  AND context_id::uuid IN (SELECT id FROM public.datasets);

-- Backfill bot_id on existing messages
UPDATE public.messages m
SET bot_id = b.id
FROM public.bots b
JOIN public.clients c ON c.id = b.client_id
WHERE m.context_id = c.context_id AND m.bot_id IS NULL;

-- ═══════════════════════════════════════════════════════════════
-- 6. RLS POLICIES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_datasets ENABLE ROW LEVEL SECURITY;

-- Service role full access
DROP POLICY IF EXISTS "Service role full access to bots" ON public.bots;
CREATE POLICY "Service role full access to bots" ON public.bots FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access to datasets" ON public.datasets;
CREATE POLICY "Service role full access to datasets" ON public.datasets FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access to bot_datasets" ON public.bot_datasets;
CREATE POLICY "Service role full access to bot_datasets" ON public.bot_datasets FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can read
DROP POLICY IF EXISTS "Authenticated read bots" ON public.bots;
CREATE POLICY "Authenticated read bots" ON public.bots FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read datasets" ON public.datasets;
CREATE POLICY "Authenticated read datasets" ON public.datasets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read bot_datasets" ON public.bot_datasets;
CREATE POLICY "Authenticated read bot_datasets" ON public.bot_datasets FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 7. INDEXES
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_bots_client_id ON public.bots(client_id);
CREATE INDEX IF NOT EXISTS idx_datasets_client_id ON public.datasets(client_id);
CREATE INDEX IF NOT EXISTS idx_bot_datasets_bot_id ON public.bot_datasets(bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_datasets_dataset_id ON public.bot_datasets(dataset_id);
CREATE INDEX IF NOT EXISTS idx_chunks_dataset_id ON public.chunks(dataset_id);
CREATE INDEX IF NOT EXISTS idx_messages_bot_id ON public.messages(bot_id);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON public.messages(channel);