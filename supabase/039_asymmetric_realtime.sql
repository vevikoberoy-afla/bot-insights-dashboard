-- 039_asymmetric_realtime.sql
-- Asymmetric Routing: Multi-tenant RLS, composite index, and Realtime publication

-- 1. Enable Row-Level Security on messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- 2. Service role full access to messages
DROP POLICY IF EXISTS "Service role full access to messages" ON public.messages;
CREATE POLICY "Service role full access to messages"
ON public.messages FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 3. Multi-tenant RLS: Agents can view their store/client messages
DROP POLICY IF EXISTS "Agents view own store messages" ON public.messages;
CREATE POLICY "Agents view own store messages"
ON public.messages FOR SELECT
TO authenticated
USING (
  bot_id IN (SELECT id FROM public.bots WHERE client_id = auth.uid()) OR
  session_id IN (SELECT session_id FROM public.sessions WHERE client_id = auth.uid())
);

-- 4. Composite Index for instant historical queries
CREATE INDEX IF NOT EXISTS idx_messages_chat_cursor 
ON public.messages (session_id, created_at DESC);

-- 5. Ensure messages table is in supabase_realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;
