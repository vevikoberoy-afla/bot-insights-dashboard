-- Configurable tenant data retention. Schedule public.enforce_data_retention()
-- daily with the protected /api/cron/data-retention endpoint.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS data_retention_days integer NOT NULL DEFAULT 30
  CHECK (data_retention_days IN (3, 30, 90));

CREATE OR REPLACE FUNCTION public.enforce_data_retention()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE deleted_count integer := 0;
BEGIN
  DELETE FROM public.messages m
  USING public.clients c
  WHERE (
    m.bot_id IN (SELECT b.id FROM public.bots b WHERE b.client_id = c.id)
    OR m.session_id IN (SELECT s.session_id FROM public.sessions s WHERE s.client_id = c.id)
  )
  AND m.created_at < now() - make_interval(days => c.data_retention_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;

  DELETE FROM public.sessions s
  USING public.clients c
  WHERE s.client_id = c.id
    AND s.last_message_at < now() - make_interval(days => c.data_retention_days)
    AND NOT EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.session_id IN (s.session_id, s.id::text)
    );

  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_data_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_data_retention() TO service_role;
