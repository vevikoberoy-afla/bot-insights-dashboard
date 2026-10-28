-- supabase/004_api_keys.sql
-- Enables API Keys for backend integration

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  prefix TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Note: RLS policies will be managed by the application logic using Service Role for now,
-- but you can add explicit policies if needed:
-- CREATE POLICY "Users can manage their own API keys" ON api_keys FOR ALL USING (true); 
