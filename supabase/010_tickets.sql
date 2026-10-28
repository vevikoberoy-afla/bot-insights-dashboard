-- 010_tickets.sql
-- Adds the ticketing system for human handoff and manual issue resolution.
-- Run after 009_multi_bot.sql

-- ═══════════════════════════════════════════════════════════════
-- 1. TICKETS TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.tickets (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    bot_id UUID REFERENCES public.bots(id) ON DELETE SET NULL,
    -- We'll add contact_id properly in Phase 4 when Contacts CRM is built.
    -- For now, store contact details as JSON or text.
    customer_email TEXT,
    customer_name TEXT,
    subject TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'open',     -- open, in_progress, waiting, resolved, closed
    priority TEXT DEFAULT 'medium',   -- low, medium, high, urgent
    assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    sla_deadline TIMESTAMP WITH TIME ZONE,
    source TEXT DEFAULT 'manual',     -- manual, ai_escalation, email, whatsapp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    first_response_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- ═══════════════════════════════════════════════════════════════
-- 2. TICKET MESSAGES TABLE (The Thread)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ticket_messages (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- Null if sent by customer
    sender_type TEXT DEFAULT 'customer', -- customer, agent, system
    content TEXT NOT NULL,
    is_internal_note BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ═══════════════════════════════════════════════════════════════
-- 3. TICKET TAGS
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.ticket_tags (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#4F46E5', -- default brand color
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(client_id, name)
);

CREATE TABLE IF NOT EXISTS public.ticket_tag_mappings (
    ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES public.ticket_tags(id) ON DELETE CASCADE,
    PRIMARY KEY(ticket_id, tag_id)
);

-- ═══════════════════════════════════════════════════════════════
-- 4. RLS POLICIES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_tag_mappings ENABLE ROW LEVEL SECURITY;

-- Service role full access
DROP POLICY IF EXISTS "Service role full access to tickets" ON public.tickets;
CREATE POLICY "Service role full access to tickets" ON public.tickets FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access to ticket_messages" ON public.ticket_messages;
CREATE POLICY "Service role full access to ticket_messages" ON public.ticket_messages FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access to ticket_tags" ON public.ticket_tags;
CREATE POLICY "Service role full access to ticket_tags" ON public.ticket_tags FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access to ticket_tag_mappings" ON public.ticket_tag_mappings;
CREATE POLICY "Service role full access to ticket_tag_mappings" ON public.ticket_tag_mappings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can read
DROP POLICY IF EXISTS "Authenticated read tickets" ON public.tickets;
CREATE POLICY "Authenticated read tickets" ON public.tickets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read ticket_messages" ON public.ticket_messages;
CREATE POLICY "Authenticated read ticket_messages" ON public.ticket_messages FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read ticket_tags" ON public.ticket_tags;
CREATE POLICY "Authenticated read ticket_tags" ON public.ticket_tags FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read ticket_tag_mappings" ON public.ticket_tag_mappings;
CREATE POLICY "Authenticated read ticket_tag_mappings" ON public.ticket_tag_mappings FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 5. INDEXES
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_tickets_client_id ON public.tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_tickets_bot_id ON public.tickets(bot_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON public.tickets(status);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON public.ticket_messages(ticket_id);
