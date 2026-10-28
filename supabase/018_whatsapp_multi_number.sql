-- 018_whatsapp_multi_number.sql
-- Enables multiple WhatsApp numbers per bot by changing the unique constraint.
-- Run after 017_tracking.sql

-- ═══════════════════════════════════════════════════════════════
-- 1. DROP OLD CONSTRAINT (bot_id, channel_type) — allows only 1 channel type per bot
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.bot_channels DROP CONSTRAINT IF EXISTS bot_channels_bot_id_channel_type_key;

-- ═══════════════════════════════════════════════════════════════
-- 2. ADD NEW CONSTRAINT — a phone number (identifier) can only be linked once globally
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE public.bot_channels 
    ADD CONSTRAINT bot_channels_channel_identifier_unique 
    UNIQUE (channel_type, identifier);

-- ═══════════════════════════════════════════════════════════════
-- 3. INDEX on identifier for fast webhook routing
-- ═══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_bot_channels_identifier ON public.bot_channels(identifier);
CREATE INDEX IF NOT EXISTS idx_bot_channels_channel_type_identifier ON public.bot_channels(channel_type, identifier);
