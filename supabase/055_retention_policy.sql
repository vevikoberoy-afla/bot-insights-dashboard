-- Purpose-specific retention policy:
-- widget history 3 days (browser), return drafts 3 days (Redis),
-- booking/order drafts 24 hours (Redis), inventory holds 15 minutes,
-- tenant chat history 3/30/90 days, closed tickets 365 days.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS data_retention_days integer NOT NULL DEFAULT 30;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_data_retention_days_check;

-- Upgrade the previous global three-day rollout once. On reruns the default is
-- already 30, so explicit tenant selections (including 3 days) are preserved.
DO $$
DECLARE current_default text;
BEGIN
  SELECT column_default INTO current_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'clients'
    AND column_name = 'data_retention_days';

  IF coalesce(current_default, '') NOT LIKE '%30%' THEN
    UPDATE public.clients SET data_retention_days = 30 WHERE data_retention_days = 3;
  END IF;
END $$;

ALTER TABLE public.clients
  ALTER COLUMN data_retention_days SET DEFAULT 30;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_data_retention_days_check
  CHECK (data_retention_days IN (3, 30, 90));

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS ticket_retention_days integer NOT NULL DEFAULT 365;

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_ticket_retention_days_check;

UPDATE public.clients SET ticket_retention_days = 365;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_ticket_retention_days_check
  CHECK (ticket_retention_days = 365);

-- The cleanup route removes these objects from private storage before the
-- database rows are deleted. Ticket evidence is protected until its closed
-- ticket reaches the independent 365-day policy.
CREATE OR REPLACE FUNCTION public.retention_media_candidates()
RETURNS TABLE(kind text, storage_path text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH expired_chat AS (
    SELECT DISTINCT COALESCE(
      NULLIF(m.metadata->>'media_storage_path', ''),
      NULLIF(split_part(split_part(m.media_url, '/chat-media/', 2), '?', 1), '')
    ) AS storage_path
    FROM public.messages m
    WHERE m.media_url IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.clients c
        WHERE m.created_at < now() - make_interval(days => c.data_retention_days)
          AND (
            m.bot_id IN (SELECT b.id FROM public.bots b WHERE b.client_id = c.id)
            OR m.session_id IN (
              SELECT s.session_id FROM public.sessions s WHERE s.client_id = c.id
              UNION ALL
              SELECT s.id::text FROM public.sessions s WHERE s.client_id = c.id
            )
          )
      )
  ), expired_ticket_media AS (
    SELECT DISTINCT ta.storage_path
    FROM public.ticket_attachments ta
    JOIN public.tickets t ON t.id = ta.ticket_id
    JOIN public.clients c ON c.id = t.client_id
    WHERE t.status IN ('resolved', 'solved', 'closed')
      AND COALESCE(t.closed_at, t.resolved_at, t.updated_at, t.created_at)
        < now() - make_interval(days => c.ticket_retention_days)
  )
  SELECT 'chat'::text, ec.storage_path
  FROM expired_chat ec
  WHERE ec.storage_path IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.ticket_attachments ta WHERE ta.storage_path = ec.storage_path
    )
  UNION
  SELECT 'ticket'::text, etm.storage_path
  FROM expired_ticket_media etm
  WHERE etm.storage_path IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.retention_media_candidates() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retention_media_candidates() TO service_role;

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
    OR m.session_id IN (
      SELECT s.session_id FROM public.sessions s WHERE s.client_id = c.id
      UNION ALL
      SELECT s.id::text FROM public.sessions s WHERE s.client_id = c.id
    )
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

  DELETE FROM public.tickets t
  USING public.clients c
  WHERE t.client_id = c.id
    AND t.status IN ('resolved', 'solved', 'closed')
    AND COALESCE(t.closed_at, t.resolved_at, t.updated_at, t.created_at)
      < now() - make_interval(days => c.ticket_retention_days);

  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_data_retention() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_data_retention() TO service_role;

-- Replace the inventory hold function so every caller is capped at 15 minutes.
CREATE OR REPLACE FUNCTION public.hold_catalog_inventory(
  p_client uuid,
  p_product uuid,
  p_session text,
  p_quantity integer,
  p_minutes integer DEFAULT 15
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p catalog_products; existing commerce_holds; reserved integer;
BEGIN
 IF p_quantity<1 OR p_quantity>1000 OR length(p_session)<8 THEN RAISE EXCEPTION 'Invalid hold'; END IF;
 SELECT * INTO p FROM catalog_products WHERE id=p_product AND client_id=p_client AND status='active' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product unavailable'; END IF;
 UPDATE commerce_holds SET status='expired' WHERE product_id=p.id AND status='active' AND expires_at<=now();
 SELECT * INTO existing FROM commerce_holds WHERE client_id=p_client AND product_id=p.id AND session_key=p_session FOR UPDATE;
 SELECT coalesce(sum(quantity),0) INTO reserved FROM commerce_holds WHERE product_id=p.id AND status='active' AND (existing.id IS NULL OR id<>existing.id);
 IF p.track_inventory AND NOT p.allow_backorder AND reserved+p_quantity>p.stock_quantity THEN RAISE EXCEPTION 'Only % available',greatest(0,p.stock_quantity-reserved); END IF;
 INSERT INTO commerce_holds(client_id,product_id,session_key,quantity,status,expires_at) VALUES(p_client,p.id,p_session,p_quantity,'active',now()+make_interval(mins=>least(greatest(p_minutes,1),15)))
 ON CONFLICT(client_id,session_key,product_id) DO UPDATE SET quantity=excluded.quantity,status='active',expires_at=excluded.expires_at RETURNING * INTO existing;
 RETURN to_jsonb(existing)||jsonb_build_object('available',greatest(0,p.stock_quantity-reserved-p_quantity));
END $$;
