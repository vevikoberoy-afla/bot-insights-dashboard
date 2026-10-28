-- 015_channels_csat.sql
-- Adds the Channels configuration and CSAT (Feedback) tables
-- Run after 014_templates.sql

-- ═══════════════════════════════════════════════════════════════
-- 1. BOT CHANNELS TABLE (Integration configs)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.bot_channels (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
    channel_type TEXT NOT NULL, -- web, whatsapp, email, sms, instagram, messenger, telegram
    identifier TEXT, -- phone number, email address, page ID
    credentials JSONB, -- encrypted or plain tokens/secrets depending on security needs
    status TEXT DEFAULT 'disconnected', -- disconnected, connected, error
    connected_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(bot_id, channel_type)
);

-- ═══════════════════════════════════════════════════════════════
-- 2. FEEDBACK (CSAT) TABLE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.feedback (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    bot_id UUID NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES public.sessions(session_id) ON DELETE CASCADE,
    message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE, -- specific AI reply
    rating TEXT NOT NULL, -- positive, negative
    comment TEXT, -- user's explanation of why it was helpful/unhelpful
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ═══════════════════════════════════════════════════════════════
-- 3. RLS POLICIES
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.bot_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to bot_channels" ON public.bot_channels;
CREATE POLICY "Service role full access to bot_channels" ON public.bot_channels FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access to feedback" ON public.feedback;
CREATE POLICY "Service role full access to feedback" ON public.feedback FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated read bot_channels" ON public.bot_channels;
CREATE POLICY "Authenticated read bot_channels" ON public.bot_channels FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated read feedback" ON public.feedback;
CREATE POLICY "Authenticated read feedback" ON public.feedback FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════
-- 4. INDEXES
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_bot_channels_bot_id ON public.bot_channels(bot_id);
CREATE INDEX IF NOT EXISTS idx_feedback_bot_id ON public.feedback(bot_id);
CREATE INDEX IF NOT EXISTS idx_feedback_session_id ON public.feedback(session_id);
