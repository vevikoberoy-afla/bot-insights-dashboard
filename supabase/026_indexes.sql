-- Optimize Inbox and Session Polling
CREATE INDEX IF NOT EXISTS idx_sessions_client_id_last_message_at ON public.sessions (client_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_bot_id ON public.sessions (bot_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id_created_at ON public.messages (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_bot_id_created_at ON public.messages (bot_id, created_at DESC);

-- Optimize context searches (legacy widget)
-- CREATE INDEX IF NOT EXISTS idx_sessions_context_id ON public.sessions (context_id);
CREATE INDEX IF NOT EXISTS idx_messages_context_id_created_at ON public.messages (context_id, created_at DESC);
