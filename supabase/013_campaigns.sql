-- 013_campaigns.sql
-- Adds the Campaign Builder for outbound messaging
-- Run after 012_contacts.sql

-- ═══════════════════════════════════════════════════════════════
-- 1. CAMPAIGNS TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    channel TEXT NOT NULL, -- whatsapp, email, sms
    status TEXT DEFAULT 'draft', -- draft, scheduled, sending, sent, failed
    segment_id UUID REFERENCES public.contact_segments(id) ON DELETE SET NULL,
    scheduled_at TIMESTAMP WITH TIME ZONE,
    sent_at TIMESTAMP WITH TIME ZONE,
    stats JSONB DEFAULT '{"sent": 0, "delivered": 0, "opened": 0, "clicked": 0, "failed": 0}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ═══════════════════════════════════════════════════════════════
-- 2. CAMPAIGN MESSAGES (The content of the campaign)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.campaign_messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    variant TEXT DEFAULT 'A', -- A/B testing
    subject TEXT, -- For email
    body_html TEXT,
    body_text TEXT,
    variables_used TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(campaign_id, variant)
);

-- ═══════════════════════════════════════════════════════════════
-- 3. CAMPAIGN RECIPIENTS (Delivery tracking per contact)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.campaign_recipients (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    variant TEXT DEFAULT 'A',
    status TEXT DEFAULT 'pending', -- pending, sent, delivered, opened, clicked, failed
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    UNIQUE(campaign_id, contact_id)
);

-- ═══════════════════════════════════════════════════════════════
-- 4. RLS POLICIES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to campaigns" ON public.campaigns;
CREATE POLICY "Service role full access to campaigns" ON public.campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access to campaign_messages" ON public.campaign_messages;
CREATE POLICY "Service role full access to campaign_messages" ON public.campaign_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access to campaign_recipients" ON public.campaign_recipients;
CREATE POLICY "Service role full access to campaign_recipients" ON public.campaign_recipients FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated read campaigns" ON public.campaigns;
CREATE POLICY "Authenticated read campaigns" ON public.campaigns FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read campaign_messages" ON public.campaign_messages;
CREATE POLICY "Authenticated read campaign_messages" ON public.campaign_messages FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read campaign_recipients" ON public.campaign_recipients;
CREATE POLICY "Authenticated read campaign_recipients" ON public.campaign_recipients FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 5. INDEXES
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_campaigns_client_id ON public.campaigns(client_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns(status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_id ON public.campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_contact_id ON public.campaign_recipients(contact_id);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_status ON public.campaign_recipients(status);
