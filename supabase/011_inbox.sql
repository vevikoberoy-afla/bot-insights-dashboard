-- 011_inbox.sql
-- Upgrades the messaging system for the omnichannel inbox and human handoff.
-- Run after 010_tickets.sql

-- ═══════════════════════════════════════════════════════════════
-- 1. UPGRADE MESSAGES TABLE
-- ═══════════════════════════════════════════════════════════════
-- Note: 'channel' and 'mode' were added in 009_multi_bot.sql, but we ensure they exist.
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'web';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'ai';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════
-- 2. SESSIONS (Conversations) TABLE
-- To track a continuous conversation thread and its handoff state
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    bot_id UUID REFERENCES public.bots(id) ON DELETE CASCADE,
    contact_id UUID, -- Will link to contacts table in Phase 4
    session_id TEXT NOT NULL, -- The tracking ID from the frontend/widget
    channel TEXT DEFAULT 'web',
    mode TEXT DEFAULT 'ai', -- ai, waiting (for human), human
    assigned_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    snoozed_until TIMESTAMP WITH TIME ZONE,
    last_message_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(session_id)
);

-- Backfill sessions from existing messages
INSERT INTO public.sessions (client_id, bot_id, session_id, channel, last_message_at, created_at)
SELECT 
    b.client_id,
    m.bot_id,
    m.session_id,
    MAX(m.channel),
    MAX(m.created_at),
    MIN(m.created_at)
FROM public.messages m
JOIN public.bots b ON b.id = m.bot_id
GROUP BY b.client_id, m.bot_id, m.session_id
ON CONFLICT (session_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 3. HANDOFF REQUESTS TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.handoff_requests (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES public.sessions(session_id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    reason TEXT,
    status TEXT DEFAULT 'pending', -- pending, accepted, resolved
    agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    resolved_at TIMESTAMP WITH TIME ZONE
);

-- ═══════════════════════════════════════════════════════════════
-- 4. RLS POLICIES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
-- Compatibility fields used by omnichannel senders and older inbox clients.
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS visitor_name TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.handoff_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to sessions" ON public.sessions;
CREATE POLICY "Service role full access to sessions" ON public.sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access to handoff_requests" ON public.handoff_requests;
CREATE POLICY "Service role full access to handoff_requests" ON public.handoff_requests FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated read sessions" ON public.sessions;
CREATE POLICY "Authenticated read sessions" ON public.sessions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read handoff_requests" ON public.handoff_requests;
CREATE POLICY "Authenticated read handoff_requests" ON public.handoff_requests FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 5. INDEXES
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_sessions_client_id ON public.sessions(client_id);
CREATE INDEX IF NOT EXISTS idx_sessions_bot_id ON public.sessions(bot_id);
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON public.sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON public.messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_is_read ON public.messages(is_read);
CREATE INDEX IF NOT EXISTS idx_handoff_requests_session_id ON public.handoff_requests(session_id);
