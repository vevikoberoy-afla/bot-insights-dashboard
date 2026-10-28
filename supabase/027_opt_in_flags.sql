-- 027_opt_in_flags.sql
-- Adds strict opt-in tracking for Meta and CAN-SPAM compliance

ALTER TABLE public.contacts
ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS email_opt_in BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS sms_opt_in BOOLEAN DEFAULT false;

-- Create an index to quickly filter out users who haven't opted in during bulk sends
CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp_opt_in ON public.contacts(whatsapp_opt_in);
CREATE INDEX IF NOT EXISTS idx_contacts_email_opt_in ON public.contacts(email_opt_in);
