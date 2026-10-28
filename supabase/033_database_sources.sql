-- 033_database_sources.sql
-- Enables multi-source databases for live data connections.

-- ═══════════════════════════════════════════════════════════════
-- 1. EXTEND DATA_SOURCES TABLE
-- ═══════════════════════════════════════════════════════════════
-- The data_sources table is now conceptually 'databases'.
-- Adding new metadata columns to support the new UI.
ALTER TABLE public.data_sources ADD COLUMN IF NOT EXISTS purpose TEXT;
ALTER TABLE public.data_sources ADD COLUMN IF NOT EXISTS data_type TEXT DEFAULT 'custom';
    -- 'order_tracking' | 'product_catalog' | 'customer_records' | 'inventory' | 'custom'
ALTER TABLE public.data_sources ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';
    -- 'draft' | 'connected' | 'partial' | 'error'
ALTER TABLE public.data_sources ADD COLUMN IF NOT EXISTS source_count INTEGER DEFAULT 0;
ALTER TABLE public.data_sources ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
ALTER TABLE public.data_sources ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES auth.users(id);

-- Legacy field cleanup
ALTER TABLE public.data_sources ALTER COLUMN context_id DROP NOT NULL;
ALTER TABLE public.data_sources ALTER COLUMN endpoint_url DROP NOT NULL;
ALTER TABLE public.data_sources ALTER COLUMN source_type DROP NOT NULL;

-- Safely rename lookup_param to lookup_field if it exists
DO $$
BEGIN
  IF EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'data_sources'
      AND column_name = 'lookup_param'
  ) THEN
      ALTER TABLE public.data_sources RENAME COLUMN lookup_param TO lookup_field;
  END IF;
END $$;

-- Ensure lookup_field exists in case it wasn't there to be renamed
ALTER TABLE public.data_sources ADD COLUMN IF NOT EXISTS lookup_field TEXT;

-- ═══════════════════════════════════════════════════════════════
-- 2. CREATE DATABASE_SOURCES TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.database_sources (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    database_id UUID NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
        -- 'api' | 'sheets' | 'upload' | 'curl'
    source_name TEXT,
    
    -- API / cURL specifics
    endpoint_url TEXT,
    auth_header TEXT,
    http_method TEXT DEFAULT 'GET',
    request_body TEXT,
    curl_command TEXT,
    
    -- Sheets specifics
    sheet_url TEXT,
    sheet_tab TEXT,
    
    -- Upload specifics
    file_path TEXT,
    file_name TEXT,
    
    -- Shared
    field_mapping JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'pending',
        -- 'pending' | 'testing' | 'connected' | 'error'
    error_msg TEXT,
    last_tested_at TIMESTAMP WITH TIME ZONE,
    row_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ═══════════════════════════════════════════════════════════════
-- 3. RLS POLICIES FOR DATABASE_SOURCES
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.database_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to database_sources" ON public.database_sources;
CREATE POLICY "Service role full access to database_sources" 
    ON public.database_sources FOR ALL TO service_role 
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated read database_sources" ON public.database_sources;
CREATE POLICY "Authenticated read database_sources" 
    ON public.database_sources FOR SELECT TO authenticated 
    USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 4. BOT_DATABASES TABLE
-- ═══════════════════════════════════════════════════════════════
-- To assign multiple databases to a bot, with priority ordering.
-- We might already have bot_data_sources, but this new one includes priority.
CREATE TABLE IF NOT EXISTS public.bot_databases (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
    database_id UUID NOT NULL REFERENCES public.data_sources(id) ON DELETE CASCADE,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(bot_id, database_id)
);

ALTER TABLE public.bot_databases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to bot_databases" ON public.bot_databases;
CREATE POLICY "Service role full access to bot_databases" 
    ON public.bot_databases FOR ALL TO service_role 
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated read bot_databases" ON public.bot_databases;
CREATE POLICY "Authenticated read bot_databases" 
    ON public.bot_databases FOR SELECT TO authenticated 
    USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 5. INDEXES
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_database_sources_database_id ON public.database_sources(database_id);
CREATE INDEX IF NOT EXISTS idx_bot_databases_bot_id ON public.bot_databases(bot_id);
CREATE INDEX IF NOT EXISTS idx_bot_databases_database_id ON public.bot_databases(database_id);