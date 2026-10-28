-- Add provisioning_status for robust auto-provisioning
ALTER TABLE clients ADD COLUMN IF NOT EXISTS provisioning_status TEXT DEFAULT 'pending';
-- Values: 'pending', 'tiledesk_done', 'complete'
