-- supabase/005_webhooks.sql
-- Enables Webhook configuration for clients

-- First, ensure context_id is unique so it can be referenced by the webhooks table
ALTER TABLE clients ADD CONSTRAINT clients_context_id_key UNIQUE (context_id);

CREATE TABLE IF NOT EXISTS webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  context_id TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL DEFAULT '{"message.received"}',
  secret TEXT,
  is_active BOOLEAN DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Context ID must match a client's context_id
  CONSTRAINT fk_context FOREIGN KEY (context_id) REFERENCES clients(context_id) ON DELETE CASCADE
);

-- Enable RLS
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

-- Note: RLS policies will be managed by the application logic using Service Role for now
