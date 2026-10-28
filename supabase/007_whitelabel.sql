-- supabase/007_whitelabel.sql
-- Adds White-labeling / Appearance configuration to clients

ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS theme_color TEXT DEFAULT '#8b5cf6',
ADD COLUMN IF NOT EXISTS widget_title TEXT DEFAULT 'AI Assistant',
ADD COLUMN IF NOT EXISTS welcome_message TEXT DEFAULT 'Hi there! How can I help you today?';
