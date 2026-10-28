-- Extend the bots table
ALTER TABLE bots
  ADD COLUMN IF NOT EXISTS chatwoot_inbox_id INTEGER,
  ADD COLUMN IF NOT EXISTS whatsapp_phone_number_id TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_access_token TEXT;

-- Extend the sessions table
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS chatwoot_conversation_id INTEGER,
  ADD COLUMN IF NOT EXISTS chatwoot_contact_id INTEGER,
  ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'ai'
    CHECK (mode IN ('ai', 'waiting', 'human', 'resolved')),
  ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'widget'
    CHECK (channel IN ('widget', 'whatsapp', 'email')),
  ADD COLUMN IF NOT EXISTS campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS last_human_message_at TIMESTAMP WITH TIME ZONE;

-- Extend the messages table
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS sender_type TEXT DEFAULT 'ai'
    CHECK (sender_type IN ('ai', 'human', 'visitor')),
  ADD COLUMN IF NOT EXISTS chatwoot_message_id INTEGER;

-- Extend the contacts table (if it exists, else create it)
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  phone TEXT,
  chatwoot_contact_id INTEGER,
  dittofeed_user_id TEXT,
  segment TEXT DEFAULT 'general',
  channel TEXT DEFAULT 'widget',
  last_seen_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for fast phone lookups (WhatsApp routing)
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_client ON contacts(client_id);
CREATE INDEX IF NOT EXISTS idx_sessions_chatwoot ON sessions(chatwoot_conversation_id);
CREATE INDEX IF NOT EXISTS idx_sessions_mode ON sessions(mode);

-- Enable RLS on contacts
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- RLS policy: clients can only see their own contacts
CREATE POLICY "clients_own_contacts" ON contacts
  FOR ALL USING (
    client_id IN (
      SELECT id FROM clients WHERE id = client_id
    )
  );
