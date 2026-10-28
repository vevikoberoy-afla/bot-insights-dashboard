-- 019_marketing_erp.sql
-- Upgrades campaigns to a full ERP system for budgeting, expenses, and sales tracking.

-- ═══════════════════════════════════════════════════════════════
-- 1. MODIFY CAMPAIGNS TABLE
-- ═══════════════════════════════════════════════════════════════

-- We need a sequence for auto-generating campaign numbers
CREATE SEQUENCE IF NOT EXISTS seq_campaign_number START 1000;

ALTER TABLE public.campaigns
ADD COLUMN IF NOT EXISTS campaign_number TEXT DEFAULT 'CMP-' || nextval('seq_campaign_number')::TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS start_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS finish_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS target_revenue NUMERIC(12, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS sales_team_assignment TEXT;

-- ═══════════════════════════════════════════════════════════════
-- 2. BUDGETS TABLE
-- ═══════════════════════════════════════════════════════════════

CREATE SEQUENCE IF NOT EXISTS seq_budget_number START 1000;

CREATE TABLE IF NOT EXISTS public.campaign_budgets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    budget_number TEXT DEFAULT 'BGT-' || nextval('seq_budget_number')::TEXT UNIQUE NOT NULL,
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status TEXT DEFAULT 'pending', -- pending, approved, exhausted
    description TEXT,
    budget_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ═══════════════════════════════════════════════════════════════
-- 3. EXPENSES TABLE
-- ═══════════════════════════════════════════════════════════════

CREATE SEQUENCE IF NOT EXISTS seq_expense_number START 1000;

CREATE TABLE IF NOT EXISTS public.campaign_expenses (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    expense_number TEXT DEFAULT 'EXP-' || nextval('seq_expense_number')::TEXT UNIQUE NOT NULL,
    amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status TEXT DEFAULT 'pending', -- pending, paid, rejected
    description TEXT,
    expense_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ═══════════════════════════════════════════════════════════════
-- 4. SALES ORDERS TABLE
-- ═══════════════════════════════════════════════════════════════

CREATE SEQUENCE IF NOT EXISTS seq_order_number START 1000;

CREATE TABLE IF NOT EXISTS public.sales_orders (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    campaign_id UUID REFERENCES public.campaigns(id) ON DELETE SET NULL, -- optional link to campaign attribution
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    order_number TEXT DEFAULT 'ORD-' || nextval('seq_order_number')::TEXT UNIQUE NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status TEXT DEFAULT 'processing', -- pending, processing, completed, refunded
    order_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    items JSONB DEFAULT '[]'::jsonb, -- Array of { description, quantity, unit_price }
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ═══════════════════════════════════════════════════════════════
-- 5. RLS POLICIES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.campaign_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;

-- Service Role Full Access
DROP POLICY IF EXISTS "Service role full access to budgets" ON public.campaign_budgets;
CREATE POLICY "Service role full access to budgets" ON public.campaign_budgets FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access to expenses" ON public.campaign_expenses;
CREATE POLICY "Service role full access to expenses" ON public.campaign_expenses FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access to sales_orders" ON public.sales_orders;
CREATE POLICY "Service role full access to sales_orders" ON public.sales_orders FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated Read Access
DROP POLICY IF EXISTS "Authenticated read budgets" ON public.campaign_budgets;
CREATE POLICY "Authenticated read budgets" ON public.campaign_budgets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read expenses" ON public.campaign_expenses;
CREATE POLICY "Authenticated read expenses" ON public.campaign_expenses FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read sales_orders" ON public.sales_orders;
CREATE POLICY "Authenticated read sales_orders" ON public.sales_orders FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 6. INDEXES
-- ═══════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_campaign_budgets_client_id ON public.campaign_budgets(client_id);
CREATE INDEX IF NOT EXISTS idx_campaign_budgets_campaign_id ON public.campaign_budgets(campaign_id);

CREATE INDEX IF NOT EXISTS idx_campaign_expenses_client_id ON public.campaign_expenses(client_id);
CREATE INDEX IF NOT EXISTS idx_campaign_expenses_campaign_id ON public.campaign_expenses(campaign_id);

CREATE INDEX IF NOT EXISTS idx_sales_orders_client_id ON public.sales_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_campaign_id ON public.sales_orders(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_contact_id ON public.sales_orders(contact_id);
