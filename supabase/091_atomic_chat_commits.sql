-- Durable idempotency and all-or-nothing chat checkout commits.
-- Apply after 061, 065, 087, 088 and 090. Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS public.chat_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  session_id text NOT NULL CHECK (length(session_id) BETWEEN 8 AND 180),
  operation_id text NOT NULL CHECK (length(operation_id) BETWEEN 8 AND 200),
  operation_type text NOT NULL CHECK (operation_type IN ('booking','order')),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
  result_payload jsonb,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id,session_id,operation_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_operations_client_created ON public.chat_operations(client_id,created_at DESC);
ALTER TABLE public.chat_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_operations_service_only ON public.chat_operations;
CREATE POLICY chat_operations_service_only ON public.chat_operations FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.commit_chat_order(
  p_client uuid,p_session text,p_operation text,p_request_hash text,p_input jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE op chat_operations; result jsonb;
BEGIN
 IF length(p_session) NOT BETWEEN 8 AND 180 OR length(p_operation) NOT BETWEEN 8 AND 200 OR p_request_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid operation identity'; END IF;
 INSERT INTO chat_operations(client_id,session_id,operation_id,operation_type,request_hash)
 VALUES(p_client,p_session,p_operation,'order',p_request_hash) ON CONFLICT(client_id,session_id,operation_id) DO NOTHING;
 SELECT * INTO op FROM chat_operations WHERE client_id=p_client AND session_id=p_session AND operation_id=p_operation FOR UPDATE;
 IF op.operation_type<>'order' OR op.request_hash<>p_request_hash THEN RAISE EXCEPTION 'Operation identity was reused with different input'; END IF;
 IF op.status='succeeded' THEN RETURN op.result_payload; END IF;
 result:=place_catalog_order(p_client,p_input);
 UPDATE chat_operations SET status='succeeded',result_payload=result,error_code=null,updated_at=now() WHERE id=op.id;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.commit_chat_booking(
  p_client uuid,p_session text,p_operation text,p_request_hash text,p_input jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE op chat_operations; result jsonb; booking_id uuid; coupon coupons; service_id uuid; subtotal numeric; offer_id uuid;
BEGIN
 IF length(p_session) NOT BETWEEN 8 AND 180 OR length(p_operation) NOT BETWEEN 8 AND 200 OR p_request_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid operation identity'; END IF;
 INSERT INTO chat_operations(client_id,session_id,operation_id,operation_type,request_hash)
 VALUES(p_client,p_session,p_operation,'booking',p_request_hash) ON CONFLICT(client_id,session_id,operation_id) DO NOTHING;
 SELECT * INTO op FROM chat_operations WHERE client_id=p_client AND session_id=p_session AND operation_id=p_operation FOR UPDATE;
 IF op.operation_type<>'booking' OR op.request_hash<>p_request_hash THEN RAISE EXCEPTION 'Operation identity was reused with different input'; END IF;
 IF op.status='succeeded' THEN RETURN op.result_payload; END IF;

 IF coalesce((p_input->>'restaurant_mode')::boolean,false) THEN result:=reserve_restaurant_booking(p_client,p_input); ELSE result:=reserve_feature_booking(p_client,p_input); END IF;
 booking_id:=(result->>'id')::uuid; service_id:=nullif(result->>'service_id','')::uuid;
 IF booking_id IS NULL THEN RAISE EXCEPTION 'Booking was not created'; END IF;

 IF jsonb_array_length(coalesce(p_input->'addon_items','[]'::jsonb))>0 AND result->>'status'='confirmed' THEN
   result:=claim_booking_addon_inventory(p_client,booking_id,p_input->'addon_items');
 END IF;

 IF nullif(p_input->>'coupon_id','') IS NOT NULL AND result->>'status'='confirmed' THEN
   SELECT * INTO coupon FROM coupons WHERE id=(p_input->>'coupon_id')::uuid AND client_id=p_client AND is_active=true FOR UPDATE;
   IF NOT FOUND OR (coupon.expires_at IS NOT NULL AND coupon.expires_at<=now()) OR (coupon.max_uses IS NOT NULL AND coupon.used_count>=coupon.max_uses) THEN RAISE EXCEPTION 'Coupon is unavailable'; END IF;
   IF coalesce(cardinality(coupon.service_ids),0)>0 AND NOT service_id=ANY(coupon.service_ids) THEN RAISE EXCEPTION 'Coupon does not apply to this service'; END IF;
   subtotal:=greatest(0,coalesce((p_input->>'subtotal')::numeric,0));
   IF subtotal<coalesce(coupon.min_cart_value,0) THEN RAISE EXCEPTION 'Coupon minimum value is not met'; END IF;
   offer_id:=nullif(p_input->>'offer_id','')::uuid;
   IF offer_id IS NOT NULL AND NOT (coupon.stackable AND offer_id=ANY(coupon.compatible_offer_ids)) THEN RAISE EXCEPTION 'Coupon cannot be combined with this offer'; END IF;
   UPDATE coupons SET used_count=used_count+1,updated_at=now() WHERE id=coupon.id;
 END IF;

 UPDATE feature_bookings SET details=coalesce(details,'{}'::jsonb)||coalesce(p_input->'final_details','{}'::jsonb),updated_at=now()
 WHERE id=booking_id AND client_id=p_client RETURNING to_jsonb(feature_bookings) INTO result;
 result:=result||jsonb_build_object('_atomic_commit',true);
 UPDATE chat_operations SET status='succeeded',result_payload=result,error_code=null,updated_at=now() WHERE id=op.id;
 RETURN result;
END $$;

REVOKE ALL ON TABLE public.chat_operations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON TABLE public.chat_operations TO service_role;
REVOKE ALL ON FUNCTION public.commit_chat_order(uuid,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.commit_chat_booking(uuid,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.commit_chat_order(uuid,text,text,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_chat_booking(uuid,text,text,text,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
