-- Extend audit_logs so a future agent shows up as a distinct actor type
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS actor_type TEXT DEFAULT 'human'
    CHECK (actor_type IN ('human', 'agent', 'system'));

-- Tracks any action a future agent proposes, before/after approval.
-- This table exists NOW even though nothing writes to it yet except
-- your own dashboard actions — it's the audit trail an agent will
-- use later, and building it early means it's already proven.
CREATE TABLE IF NOT EXISTS agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,        -- e.g. 'launch_campaign', 'send_whatsapp_blast'
  payload JSONB NOT NULL,           -- the function arguments
  status TEXT DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'approved', 'rejected', 'executed', 'failed')),
  requested_by TEXT DEFAULT 'agent',
  approved_by UUID,                 -- references an admin user, nullable
  result JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  decided_at TIMESTAMP WITH TIME ZONE,
  executed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_agent_actions_client ON agent_actions(client_id);
CREATE INDEX IF NOT EXISTS idx_agent_actions_status ON agent_actions(status);

ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients_own_agent_actions" ON agent_actions
  FOR ALL USING (
    client_id IN (SELECT id FROM clients WHERE id = client_id)
  );
