-- Keep audited consent and the fast campaign-eligibility columns consistent.
-- The latest consent event wins; an opt-out therefore cannot be bypassed.
BEGIN;

CREATE OR REPLACE FUNCTION public.sync_contact_consent_flags() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.channel='email' THEN
  UPDATE public.contacts SET opt_in_email=NEW.opted_in,updated_at=now() WHERE id=NEW.contact_id;
 ELSIF NEW.channel='whatsapp' THEN
  UPDATE public.contacts SET opt_in_whatsapp=NEW.opted_in,opt_in_whatsapp_marketing=NEW.opted_in,updated_at=now() WHERE id=NEW.contact_id;
 ELSIF NEW.channel='sms' THEN
  UPDATE public.contacts SET opt_in_sms=NEW.opted_in,updated_at=now() WHERE id=NEW.contact_id;
 ELSIF NEW.channel='web' THEN
  UPDATE public.contacts SET opt_in_web=NEW.opted_in,updated_at=now() WHERE id=NEW.contact_id;
 END IF;
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS consent_log_sync_contact_flags ON public.consent_log;
CREATE TRIGGER consent_log_sync_contact_flags
AFTER INSERT OR UPDATE OF opted_in,channel ON public.consent_log
FOR EACH ROW EXECUTE FUNCTION public.sync_contact_consent_flags();

WITH latest AS(
 SELECT DISTINCT ON(contact_id,channel)contact_id,channel,opted_in
 FROM public.consent_log
 WHERE channel IN('email','whatsapp','sms','web')
 ORDER BY contact_id,channel,created_at DESC,id DESC
)
UPDATE public.contacts c SET
 opt_in_email=coalesce((SELECT opted_in FROM latest WHERE contact_id=c.id AND channel='email'),c.opt_in_email),
 opt_in_whatsapp=coalesce((SELECT opted_in FROM latest WHERE contact_id=c.id AND channel='whatsapp'),c.opt_in_whatsapp),
 opt_in_whatsapp_marketing=coalesce((SELECT opted_in FROM latest WHERE contact_id=c.id AND channel='whatsapp'),c.opt_in_whatsapp_marketing),
 opt_in_sms=coalesce((SELECT opted_in FROM latest WHERE contact_id=c.id AND channel='sms'),c.opt_in_sms),
 opt_in_web=coalesce((SELECT opted_in FROM latest WHERE contact_id=c.id AND channel='web'),c.opt_in_web),
 updated_at=now()
WHERE EXISTS(SELECT 1 FROM latest WHERE contact_id=c.id);

COMMIT;
