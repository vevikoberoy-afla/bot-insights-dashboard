-- 038_abandoned_cart.sql
-- Adds abandoned cart tracking columns to contacts table
-- Run after 034_contacts_segments.sql

-- Add lead scoring + cart tracking columns to contacts if not already present
DO $$
BEGIN
  -- track last_cart_value if missing (may already exist from 012_contacts.sql)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='contacts' AND column_name='last_cart_value') THEN
    ALTER TABLE public.contacts ADD COLUMN last_cart_value NUMERIC DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='contacts' AND column_name='cart_peak_value') THEN
    ALTER TABLE public.contacts ADD COLUMN cart_peak_value NUMERIC DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='contacts' AND column_name='lead_status') THEN
    ALTER TABLE public.contacts ADD COLUMN lead_status TEXT DEFAULT 'new'; -- 'new' | 'engaged' | 'qualified' | 'won' | 'lost'
  END IF;

  -- Core anti-spam column: timestamp of the last abandoned-cart recovery message sent.
  -- The cron compares NOW() against this to enforce the 23-hour cooldown window.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='contacts' AND column_name='abandoned_cart_sent_at') THEN
    ALTER TABLE public.contacts ADD COLUMN abandoned_cart_sent_at TIMESTAMPTZ DEFAULT NULL;
  END IF;

  -- opt_in columns may already exist from 034; only add if missing
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='contacts' AND column_name='opt_in_whatsapp') THEN
    ALTER TABLE public.contacts ADD COLUMN opt_in_whatsapp BOOLEAN DEFAULT false;
  END IF;
END $$;

-- Index for the cron query (contact_id, opt_in_whatsapp, last_active_at, last_cart_value)
CREATE INDEX IF NOT EXISTS idx_contacts_abandoned_cart
  ON public.contacts (client_id, opt_in_whatsapp, last_cart_value, last_active_at, abandoned_cart_sent_at)
  WHERE opt_in_whatsapp = true AND phone IS NOT NULL;
