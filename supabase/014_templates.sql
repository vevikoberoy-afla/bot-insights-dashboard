-- 014_templates.sql
-- Adds the Templates / Canned Responses library
-- Run after 013_campaigns.sql

-- ═══════════════════════════════════════════════════════════════
-- 1. TEMPLATES TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.templates (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT DEFAULT 'Greeting', -- Greeting, FAQ, Troubleshooting, Closing, Upsell
    body TEXT NOT NULL,
    shortcode TEXT NOT NULL, -- e.g., /welcome
    variables TEXT[] DEFAULT '{}', -- e.g., ['customer_name', 'order_id']
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(client_id, shortcode)
);

-- ═══════════════════════════════════════════════════════════════
-- 2. RLS POLICIES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to templates" ON public.templates;
CREATE POLICY "Service role full access to templates" ON public.templates FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated read templates" ON public.templates;
CREATE POLICY "Authenticated read templates" ON public.templates FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 3. INDEXES
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_templates_client_id ON public.templates(client_id);
CREATE INDEX IF NOT EXISTS idx_templates_shortcode ON public.templates(client_id, shortcode);
