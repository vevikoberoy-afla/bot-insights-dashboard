-- 040_email_triage.sql
-- Adds email triage and human-in-the-loop approval fields to the sessions table.

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS email_status TEXT; -- 'draft_pending', 'auto_replied', 'needs_human', 'spam'
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS email_subject TEXT;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS email_summary TEXT; -- 1-line customer email summary
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS reply_summary TEXT; -- 1-line proposed reply summary
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS draft_reply TEXT; -- Full draft reply awaiting human approval
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS spam_reason TEXT; -- Classification reason for spam

CREATE INDEX IF NOT EXISTS idx_sessions_email_status ON public.sessions(email_status);
CREATE INDEX IF NOT EXISTS idx_sessions_channel_email ON public.sessions(channel) WHERE channel = 'email';
