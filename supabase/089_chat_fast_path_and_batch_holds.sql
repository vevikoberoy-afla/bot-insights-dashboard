-- Chat fast-path support: batch inventory holds with deterministic row order.
-- Existing order/booking idempotency constraints remain the final authority.

CREATE OR REPLACE FUNCTION public.hold_catalog_inventory_batch(
  p_client uuid,
  p_session text,
  p_items jsonb,
  p_minutes integer DEFAULT 15
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  line record;
  held jsonb := '[]'::jsonb;
  result jsonb;
BEGIN
  IF length(coalesce(p_session, '')) < 8
     OR jsonb_typeof(p_items) <> 'array'
     OR jsonb_array_length(p_items) < 1
     OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Invalid inventory hold request';
  END IF;

  -- Aggregate duplicate product lines and acquire locks in a stable order.
  FOR line IN
    SELECT (item->>'product_id')::uuid AS product_id,
           sum((item->>'quantity')::integer)::integer AS quantity
    FROM jsonb_array_elements(p_items) item
    GROUP BY (item->>'product_id')::uuid
    ORDER BY (item->>'product_id')::uuid
  LOOP
    IF line.quantity < 1 OR line.quantity > 1000 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;
    result := public.hold_catalog_inventory(
      p_client, line.product_id, p_session, line.quantity,
      least(greatest(coalesce(p_minutes, 15), 1), 15)
    );
    held := held || jsonb_build_array(result);
  END LOOP;

  RETURN jsonb_build_object('holds', held, 'count', jsonb_array_length(held));
END;
$$;

REVOKE ALL ON FUNCTION public.hold_catalog_inventory_batch(uuid,text,jsonb,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hold_catalog_inventory_batch(uuid,text,jsonb,integer) TO service_role;
