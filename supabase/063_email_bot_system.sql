-- Multi-mailbox email bots, durable delivery jobs and inbound idempotency.
-- Additive and safe for existing web/chat channel installations.

ALTER TABLE public.channel_integrations
  ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS email_thread_key text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS email_message_id text;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS email_references text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS channel_integrations_email_bot_idx
  ON public.channel_integrations(client_id, bot_id, channel, status);
CREATE UNIQUE INDEX IF NOT EXISTS channel_integrations_email_address_unique
  ON public.channel_integrations(lower(coalesce(config->>'email_address', config->>'from_email', config->>'smtp_user')))
  WHERE channel = 'email' AND status <> 'deleted';
CREATE INDEX IF NOT EXISTS sessions_email_thread_idx
  ON public.sessions(client_id, bot_id, email_thread_key, last_message_at DESC)
  WHERE channel = 'email';

CREATE TABLE IF NOT EXISTS public.email_delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL,
  session_id text,
  direction text NOT NULL DEFAULT 'outbound' CHECK(direction IN ('inbound','outbound')),
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','sent','failed','ignored')),
  recipient text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  attempts integer NOT NULL DEFAULT 0,
  provider_message_id text,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_delivery_jobs_idempotency_unique
  ON public.email_delivery_jobs(client_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_delivery_jobs_queue_idx
  ON public.email_delivery_jobs(status, created_at) WHERE status IN ('queued','processing');
CREATE INDEX IF NOT EXISTS email_delivery_jobs_bot_idx
  ON public.email_delivery_jobs(client_id, bot_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.email_inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id text NOT NULL,
  recipient text NOT NULL,
  sender text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','processed','failed','ignored')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(message_id, recipient)
);

ALTER TABLE public.email_delivery_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_inbound_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_integrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated read channel integrations" ON public.channel_integrations;
DROP POLICY IF EXISTS "Tenant channel integrations" ON public.channel_integrations;
DROP POLICY IF EXISTS "Service channel integrations" ON public.channel_integrations;
CREATE POLICY "Service channel integrations" ON public.channel_integrations FOR ALL TO service_role USING(true) WITH CHECK(true);
DROP POLICY IF EXISTS "Tenant read email jobs" ON public.email_delivery_jobs;
CREATE POLICY "Tenant read email jobs" ON public.email_delivery_jobs FOR SELECT TO authenticated USING(client_id = auth.uid());
DROP POLICY IF EXISTS "Service email jobs" ON public.email_delivery_jobs;
CREATE POLICY "Service email jobs" ON public.email_delivery_jobs FOR ALL TO service_role USING(true) WITH CHECK(true);
DROP POLICY IF EXISTS "Service inbound email events" ON public.email_inbound_events;
CREATE POLICY "Service inbound email events" ON public.email_inbound_events FOR ALL TO service_role USING(true) WITH CHECK(true);

NOTIFY pgrst, 'reload schema';
