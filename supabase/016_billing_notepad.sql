-- 016_billing_notepad.sql
-- Adds Billing/Subscriptions and the internal Notepad
-- Run after 015_channels_csat.sql

-- ═══════════════════════════════════════════════════════════════
-- 1. PLANS & SUBSCRIPTIONS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.plans (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    bot_limit INTEGER DEFAULT 1,
    message_limit INTEGER DEFAULT 1000,
    channel_limit INTEGER DEFAULT 1,
    features JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    status TEXT DEFAULT 'active', -- active, past_due, canceled, trialing
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(client_id)
);

CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL,
    status TEXT DEFAULT 'pending', -- paid, pending, failed
    stripe_invoice_id TEXT,
    period_start TIMESTAMP WITH TIME ZONE,
    period_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ═══════════════════════════════════════════════════════════════
-- 2. NOTEPAD (Internal team notes & snippets)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE, -- null means global note
    title TEXT NOT NULL,
    content TEXT,
    is_snippet BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ═══════════════════════════════════════════════════════════════
-- 3. RLS POLICIES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to billing" ON public.plans;
CREATE POLICY "Service role full access to billing" ON public.plans FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access to subscriptions" ON public.subscriptions;
CREATE POLICY "Service role full access to subscriptions" ON public.subscriptions FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access to invoices" ON public.invoices;
CREATE POLICY "Service role full access to invoices" ON public.invoices FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access to notes" ON public.notes;
CREATE POLICY "Service role full access to notes" ON public.notes FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated read billing" ON public.plans;
CREATE POLICY "Authenticated read billing" ON public.plans FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read subscriptions" ON public.subscriptions;
CREATE POLICY "Authenticated read subscriptions" ON public.subscriptions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read invoices" ON public.invoices;
CREATE POLICY "Authenticated read invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read notes" ON public.notes;
CREATE POLICY "Authenticated read notes" ON public.notes FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 4. INDEXES
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_subscriptions_client_id ON public.subscriptions(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON public.invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_notes_client_id ON public.notes(client_id);
