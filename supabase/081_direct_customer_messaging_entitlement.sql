-- Founder-controlled access to one-to-one contact messaging.
-- Customer channel consent remains mandatory and is deliberately not overridden here.
BEGIN;

UPDATE public.saas_plan_versions
SET features = features || '{"contacts.messaging.enabled":true}'::jsonb
WHERE NOT (features ? 'contacts.messaging.enabled');

INSERT INTO public.saas_release_gates(key,enabled)
VALUES('contacts.messaging.enabled',true)
ON CONFLICT(key) DO NOTHING;

COMMIT;
