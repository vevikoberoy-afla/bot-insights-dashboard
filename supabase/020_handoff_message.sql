-- 020_handoff_message.sql
-- Add handoff_message to bots for custom human-intervention fallback

ALTER TABLE public.bots 
ADD COLUMN IF NOT EXISTS handoff_message TEXT DEFAULT 'I am connecting you to a human agent who can assist you further. Please hold on.';
