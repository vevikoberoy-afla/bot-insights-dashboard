-- 017_tracking.sql
-- Adds Central Platform Tracking (Usage, Revenue, Health)
-- Run after 016_billing_notepad.sql

-- ═══════════════════════════════════════════════════════════════
-- 1. API USAGE LOG
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.api_usage_log (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    bot_id UUID REFERENCES public.bots(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- gemini, groq, firecrawl, whatsapp, resend
    calls_count INTEGER DEFAULT 1,
    tokens_used INTEGER DEFAULT 0,
    cost_estimate DECIMAL(10, 6) DEFAULT 0,
    date DATE DEFAULT CURRENT_DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(client_id, bot_id, provider, date)
);

-- ═══════════════════════════════════════════════════════════════
-- 2. SYSTEM INCIDENTS (Health Log)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.system_incidents (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    service TEXT NOT NULL, -- supabase, groq, gemini, etc.
    status TEXT NOT NULL, -- degraded, down, resolved
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- ═══════════════════════════════════════════════════════════════
-- 3. RLS POLICIES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.api_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to api_usage" ON public.api_usage_log;
CREATE POLICY "Service role full access to api_usage" ON public.api_usage_log FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access to incidents" ON public.system_incidents;
CREATE POLICY "Service role full access to incidents" ON public.system_incidents FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Only platform admins (superusers) should really see these globally, but we'll allow authenticated read for now
DROP POLICY IF EXISTS "Authenticated read api_usage" ON public.api_usage_log;
CREATE POLICY "Authenticated read api_usage" ON public.api_usage_log FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read incidents" ON public.system_incidents;
CREATE POLICY "Authenticated read incidents" ON public.system_incidents FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 4. INDEXES
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_api_usage_client_id ON public.api_usage_log(client_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_date ON public.api_usage_log(date);
