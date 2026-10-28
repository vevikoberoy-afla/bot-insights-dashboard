-- Compatibility columns used by omnichannel inbox, WhatsApp and legacy sessions.
-- Email inbox reads no longer depend on them, but channel ingestion may populate them.
BEGIN;

ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS visitor_name text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

UPDATE public.sessions s
SET visitor_name=coalesce(c.name,c.email,c.phone,'Customer '||left(coalesce(s.session_id,s.id::text),6))
FROM public.contacts c
WHERE s.contact_id=c.id AND nullif(trim(s.visitor_name),'') IS NULL;

UPDATE public.sessions
SET status=CASE WHEN mode='resolved' THEN 'resolved' ELSE coalesce(nullif(mode,''),'active') END
WHERE status IS NULL OR status='';

COMMIT;
