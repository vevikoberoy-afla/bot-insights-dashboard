-- 1. Create the base table (skips if it already exists)
CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority TEXT DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assignee TEXT,
  subject TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

-- 2. Safely patch the table (adds the column if you ran an older version of the script)
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;

-- 3. Create the indexes for performance
CREATE INDEX IF NOT EXISTS idx_tickets_client ON tickets(client_id);
CREATE INDEX IF NOT EXISTS idx_tickets_session ON tickets(session_id);

-- 4. Enable Row Level Security
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- 5. Create the corrected RLS Policy (matching client_id to the authenticated Supabase user)
-- Note: DROP POLICY ensures you don't get an error if the policy already exists when re-running
DROP POLICY IF EXISTS "clients_own_tickets" ON tickets;
CREATE POLICY "clients_own_tickets" ON tickets
  FOR ALL USING (
    client_id = auth.uid()
  );