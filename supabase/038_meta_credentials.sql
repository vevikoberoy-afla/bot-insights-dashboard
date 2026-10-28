-- Migration to add Meta Graph API credentials for WhatsApp Templates
ALTER TABLE clients ADD COLUMN IF NOT EXISTS meta_waba_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS meta_access_token TEXT;
