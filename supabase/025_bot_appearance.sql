/* 025_bot_appearance.sql */
/* Adds per-bot appearance/branding columns */

ALTER TABLE public.bots
ADD COLUMN IF NOT EXISTS purpose TEXT DEFAULT 'support',
ADD COLUMN IF NOT EXISTS widget_title TEXT DEFAULT 'AI Assistant',
ADD COLUMN IF NOT EXISTS welcome_message TEXT DEFAULT 'Hi there! How can I help you today?',
ADD COLUMN IF NOT EXISTS theme_color TEXT DEFAULT '#8b5cf6',
ADD COLUMN IF NOT EXISTS bot_avatar TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS handoff_message TEXT DEFAULT 'I am connecting you to a human agent. Please hold on.',
ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'website';
