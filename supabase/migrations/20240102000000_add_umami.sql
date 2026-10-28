ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS umami_website_id TEXT,
  ADD COLUMN IF NOT EXISTS umami_website_domain TEXT;

CREATE INDEX IF NOT EXISTS idx_clients_umami_website
  ON clients(umami_website_id);
