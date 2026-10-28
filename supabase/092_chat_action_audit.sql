-- Operator-visible record of rejected interactive actions. Successful atomic
-- order/booking commits remain in chat_operations; this table explains why a
-- duplicate or stale card click was safely rejected.
CREATE TABLE IF NOT EXISTS public.chat_action_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  flow_id text NOT NULL,
  step_id text,
  action_id text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('replay','stale')),
  expected_revision integer,
  actual_revision integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_action_audit_bot_created_idx
  ON public.chat_action_audit(client_id, bot_id, created_at DESC);
ALTER TABLE public.chat_action_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_action_audit_service_only ON public.chat_action_audit;
CREATE POLICY chat_action_audit_service_only ON public.chat_action_audit
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.chat_action_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.chat_action_audit TO service_role;

