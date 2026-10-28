-- Apply the product-wide three-day chat-history policy to existing installs.

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_data_retention_days_check;

ALTER TABLE public.clients
  ALTER COLUMN data_retention_days SET DEFAULT 3;

UPDATE public.clients
SET data_retention_days = 3
WHERE data_retention_days IS DISTINCT FROM 3;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_data_retention_days_check
  CHECK (data_retention_days BETWEEN 3 AND 3650);

-- Keep the function definition here so this migration is independently safe
-- even if an older version of 049_data_retention.sql was installed.
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
