-- supabase/006_audit_logs.sql
-- Enables Audit Logging for Security and Accountability

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Who performed the action
  action TEXT NOT NULL, -- e.g., 'API_KEY_CREATED', 'CONTEXT_UPDATED'
  target_id TEXT, -- e.g., the client's context_id or the api_key id
  metadata JSONB DEFAULT '{}'::jsonb, -- Additional details
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON audit_logs;
CREATE POLICY "Admins can view audit logs" ON audit_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND role = 'admin')
);
