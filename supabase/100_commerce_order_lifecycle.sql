-- End-to-end commerce operations: fulfilment, shipping, delivery, returns,
-- exchanges, inventory disposition, customer notifications and audit history.
-- Apply after 050_ticketing_system.sql, 052_commerce_and_automation.sql and
-- 057_features_experience.sql. This migration is additive and safe to re-run.

ALTER TABLE public.commerce_orders DROP CONSTRAINT IF EXISTS commerce_orders_status_check;
ALTER TABLE public.commerce_orders ADD CONSTRAINT commerce_orders_status_check CHECK(status IN (
  'placed','confirmed','processing','packed','fulfilled','shipped','out_for_delivery','delivered',
  'delivery_failed','return_requested','return_in_transit','returned',
  'partially_returned','exchanged','cancelled'
)) NOT VALID;
ALTER TABLE public.commerce_orders
  ADD COLUMN IF NOT EXISTS promised_delivery_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancellation_reason text,
  ADD COLUMN IF NOT EXISTS internal_note text;

CREATE TABLE IF NOT EXISTS public.commerce_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.commerce_orders(id) ON DELETE CASCADE,
  reference text NOT NULL DEFAULT ('SHP-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','label_created','picked_up','in_transit','out_for_delivery','delivered','delivery_failed','returned','cancelled')),
  carrier text, service_level text, tracking_number text, tracking_url text,
  package_count integer NOT NULL DEFAULT 1 CHECK(package_count BETWEEN 1 AND 100),
  shipped_at timestamptz, estimated_delivery_at timestamptz, delivered_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id,reference)
);
CREATE INDEX IF NOT EXISTS commerce_shipments_order_idx ON public.commerce_shipments(client_id,order_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.commerce_shipment_items (
  shipment_id uuid NOT NULL REFERENCES public.commerce_shipments(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.commerce_order_items(id) ON DELETE CASCADE,
  quantity integer NOT NULL CHECK(quantity>0),
  PRIMARY KEY(shipment_id,order_item_id)
);

CREATE TABLE IF NOT EXISTS public.commerce_shipment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL REFERENCES public.commerce_shipments(id) ON DELETE CASCADE,
  status text NOT NULL, label text NOT NULL, location text,
  occurred_at timestamptz NOT NULL DEFAULT now(), details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commerce_shipment_events_idx ON public.commerce_shipment_events(shipment_id,occurred_at);

CREATE TABLE IF NOT EXISTS public.commerce_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.commerce_orders(id) ON DELETE CASCADE,
  reference text NOT NULL DEFAULT ('RET-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'return' CHECK(kind IN ('return','exchange','replacement')),
  status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','under_review','approved','rejected','pickup_scheduled','in_transit','received','refunded','exchanged','closed','cancelled')),
  reason_code text, customer_note text, admin_note text,
  pickup_carrier text, pickup_tracking_number text,
  refund_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK(refund_amount>=0),
  exchange_order_id uuid REFERENCES public.commerce_orders(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(), approved_at timestamptz,
  received_at timestamptz, resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id,reference)
);
CREATE INDEX IF NOT EXISTS commerce_returns_order_idx ON public.commerce_returns(client_id,order_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.commerce_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES public.commerce_returns(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.commerce_order_items(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK(quantity>0),
  received_quantity integer NOT NULL DEFAULT 0 CHECK(received_quantity>=0),
  condition text NOT NULL DEFAULT 'uninspected' CHECK(condition IN ('uninspected','sealed','resellable','opened','damaged','missing_parts')),
  inventory_disposition text NOT NULL DEFAULT 'quarantine' CHECK(inventory_disposition IN ('quarantine','restock','damaged','lost')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(return_id,order_item_id)
);

ALTER TABLE public.commerce_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_shipment_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_shipment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_return_items ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['commerce_shipments','commerce_shipment_events','commerce_returns'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_access ON public.%I',table_name);
    EXECUTE format('CREATE POLICY tenant_access ON public.%I FOR ALL TO authenticated USING(client_id=auth.uid()) WITH CHECK(client_id=auth.uid())',table_name);
  END LOOP;
END $$;
DROP POLICY IF EXISTS tenant_access ON public.commerce_shipment_items;
CREATE POLICY tenant_access ON public.commerce_shipment_items FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.commerce_shipments s WHERE s.id=shipment_id AND s.client_id=auth.uid()))
 WITH CHECK(EXISTS(SELECT 1 FROM public.commerce_shipments s WHERE s.id=shipment_id AND s.client_id=auth.uid()));
DROP POLICY IF EXISTS tenant_access ON public.commerce_return_items;
CREATE POLICY tenant_access ON public.commerce_return_items FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.commerce_returns r WHERE r.id=return_id AND r.client_id=auth.uid()))
 WITH CHECK(EXISTS(SELECT 1 FROM public.commerce_returns r WHERE r.id=return_id AND r.client_id=auth.uid()));

CREATE OR REPLACE FUNCTION public.transition_commerce_order(
 p_client uuid,p_order uuid,p_status text,p_note text DEFAULT NULL,p_actor uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o commerce_orders; allowed boolean:=false;
BEGIN
 SELECT * INTO o FROM commerce_orders WHERE id=p_order AND client_id=p_client FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
 IF o.status=p_status THEN RETURN to_jsonb(o); END IF;
 allowed:=CASE o.status
  WHEN 'placed' THEN p_status IN ('confirmed','processing','cancelled')
  WHEN 'confirmed' THEN p_status IN ('processing','cancelled')
  WHEN 'processing' THEN p_status IN ('packed','fulfilled','cancelled')
  WHEN 'packed' THEN p_status IN ('shipped','cancelled')
  WHEN 'fulfilled' THEN p_status IN ('shipped','delivered','return_requested')
  WHEN 'shipped' THEN p_status IN ('out_for_delivery','delivered','delivery_failed','return_in_transit')
  WHEN 'out_for_delivery' THEN p_status IN ('delivered','delivery_failed')
  WHEN 'delivery_failed' THEN p_status IN ('out_for_delivery','return_in_transit','cancelled')
  WHEN 'delivered' THEN p_status IN ('return_requested','partially_returned','returned','exchanged')
  WHEN 'return_requested' THEN p_status IN ('return_in_transit','delivered','partially_returned','returned')
  WHEN 'return_in_transit' THEN p_status IN ('partially_returned','returned')
  WHEN 'partially_returned' THEN p_status IN ('return_requested','returned','exchanged')
  ELSE false END;
 IF NOT allowed THEN RAISE EXCEPTION 'Invalid order transition from % to %',o.status,p_status; END IF;
 IF p_status='cancelled' THEN RETURN public.change_sales_order(p_client,p_order,'cancelled'); END IF;
 UPDATE commerce_orders SET status=p_status,
  delivered_at=CASE WHEN p_status='delivered' THEN coalesce(delivered_at,now()) ELSE delivered_at END,
  updated_at=now() WHERE id=o.id RETURNING * INTO o;
 IF nullif(trim(coalesce(p_note,'')),'') IS NOT NULL THEN
  INSERT INTO commerce_order_events(client_id,order_id,kind,label,details,actor_id)
  VALUES(p_client,o.id,'transition_note','Operations note',jsonb_build_object('status',p_status,'note',left(p_note,500)),p_actor);
 END IF;
 RETURN to_jsonb(o);
END $$;

CREATE OR REPLACE FUNCTION public.queue_commerce_status_notification() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.customer_email IS NOT NULL AND NEW.customer_email NOT LIKE '%@order.invalid' THEN
  INSERT INTO automation_deliveries(client_id,entity_type,entity_id,event_type,channel,destination,payload)
  VALUES(NEW.client_id,'order',NEW.id,'order_'||NEW.status,'email',NEW.customer_email,jsonb_build_object('reference',NEW.reference,'status',NEW.status)) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS commerce_order_status_notification ON public.commerce_orders;
CREATE TRIGGER commerce_order_status_notification AFTER UPDATE OF status ON public.commerce_orders
FOR EACH ROW EXECUTE FUNCTION public.queue_commerce_status_notification();

CREATE OR REPLACE FUNCTION public.process_commerce_return(
 p_client uuid,p_return uuid,p_status text,p_items jsonb DEFAULT '[]'::jsonb,p_note text DEFAULT NULL,p_actor uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r commerce_returns; line record; requested integer; received integer; disposition text; product catalog_products; order_status text;
BEGIN
 SELECT * INTO r FROM commerce_returns WHERE id=p_return AND client_id=p_client FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Return not found'; END IF;
 IF p_status NOT IN ('under_review','approved','rejected','pickup_scheduled','in_transit','received','refunded','exchanged','closed','cancelled') THEN RAISE EXCEPTION 'Invalid return status'; END IF;
 IF r.status IN ('rejected','closed','cancelled') THEN RAISE EXCEPTION 'Return is already finalized'; END IF;
 IF p_status='received' AND r.received_at IS NULL THEN
  FOR line IN SELECT ri.*,oi.product_id FROM commerce_return_items ri JOIN commerce_order_items oi ON oi.id=ri.order_item_id WHERE ri.return_id=r.id FOR UPDATE OF ri LOOP
   requested:=line.quantity;
   received:=coalesce((SELECT (x->>'received_quantity')::integer FROM jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x WHERE x->>'item_id'=line.id::text),requested);
   disposition:=coalesce((SELECT x->>'inventory_disposition' FROM jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x WHERE x->>'item_id'=line.id::text),line.inventory_disposition);
   IF received<0 OR received>requested OR disposition NOT IN ('quarantine','restock','damaged','lost') THEN RAISE EXCEPTION 'Invalid received return item'; END IF;
   UPDATE commerce_return_items SET received_quantity=received,inventory_disposition=disposition,updated_at=now() WHERE id=line.id;
   IF disposition='restock' AND received>0 THEN
    SELECT * INTO product FROM catalog_products WHERE id=line.product_id AND client_id=p_client FOR UPDATE;
    IF product.track_inventory THEN UPDATE catalog_products SET stock_quantity=stock_quantity+received,updated_at=now() WHERE id=product.id RETURNING * INTO product; END IF;
    INSERT INTO inventory_movements(client_id,product_id,order_id,movement_type,quantity_delta,stock_after,note)
    VALUES(p_client,product.id,r.order_id,'return',received,product.stock_quantity,r.reference||' returned to stock');
   END IF;
  END LOOP;
 END IF;
 UPDATE commerce_returns SET status=p_status,admin_note=coalesce(nullif(left(p_note,1000),''),admin_note),
  approved_at=CASE WHEN p_status='approved' THEN coalesce(approved_at,now()) ELSE approved_at END,
  received_at=CASE WHEN p_status='received' THEN coalesce(received_at,now()) ELSE received_at END,
  resolved_at=CASE WHEN p_status IN ('refunded','exchanged','closed','rejected','cancelled') THEN coalesce(resolved_at,now()) ELSE resolved_at END,
  updated_at=now() WHERE id=r.id RETURNING * INTO r;
 IF p_status IN ('approved','pickup_scheduled') THEN order_status:='return_requested';
 ELSIF p_status='in_transit' THEN order_status:='return_in_transit';
 ELSIF p_status IN ('received','refunded','closed') THEN
  SELECT CASE WHEN bool_and(coalesce((SELECT sum(ri.received_quantity) FROM commerce_return_items ri JOIN commerce_returns cr ON cr.id=ri.return_id WHERE cr.order_id=r.order_id AND cr.status IN ('received','refunded','exchanged','closed') AND ri.order_item_id=oi.id),0)>=oi.quantity) THEN 'returned' ELSE 'partially_returned' END INTO order_status
  FROM commerce_order_items oi WHERE oi.order_id=r.order_id;
 ELSIF p_status='exchanged' THEN order_status:='exchanged'; END IF;
 IF order_status IS NOT NULL THEN UPDATE commerce_orders SET status=order_status,updated_at=now() WHERE id=r.order_id; END IF;
 IF p_status IN ('under_review','rejected','cancelled','refunded','exchanged','closed') THEN
  INSERT INTO automation_deliveries(client_id,entity_type,entity_id,event_type,channel,destination,payload)
  SELECT p_client,'order',o.id,'return_'||p_status,'email',o.customer_email,jsonb_build_object('reference',o.reference,'return_reference',r.reference,'status',p_status)
  FROM commerce_orders o WHERE o.id=r.order_id AND o.customer_email IS NOT NULL AND o.customer_email NOT LIKE '%@order.invalid' ON CONFLICT DO NOTHING;
 END IF;
 INSERT INTO commerce_order_events(client_id,order_id,kind,label,details,actor_id)
 VALUES(p_client,r.order_id,'return_'||p_status,'Return '||replace(p_status,'_',' '),jsonb_build_object('return_id',r.id,'reference',r.reference,'note',left(coalesce(p_note,''),500)),p_actor);
 RETURN to_jsonb(r);
END $$;

REVOKE ALL ON FUNCTION public.transition_commerce_order(uuid,uuid,text,text,uuid),public.process_commerce_return(uuid,uuid,text,jsonb,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.transition_commerce_order(uuid,uuid,text,text,uuid),public.process_commerce_return(uuid,uuid,text,jsonb,text,uuid) TO service_role;

-- Secure workspace payment configuration and order payment ledger. Secrets are
-- AES-256-GCM ciphertext produced only by the server; plaintext is never stored.
ALTER TABLE public.commerce_orders
 ADD COLUMN IF NOT EXISTS payment_rail text NOT NULL DEFAULT 'cash_on_delivery',
 ADD COLUMN IF NOT EXISTS payment_due_at timestamptz,
 ADD COLUMN IF NOT EXISTS payment_verified_at timestamptz,
 ADD COLUMN IF NOT EXISTS payment_reference text;

CREATE TABLE IF NOT EXISTS public.commerce_payment_settings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
 cash_on_delivery_enabled boolean NOT NULL DEFAULT true,
 direct_upi_enabled boolean NOT NULL DEFAULT false,
 gateway_enabled boolean NOT NULL DEFAULT false,
 active_gateway text CHECK(active_gateway IS NULL OR active_gateway IN ('razorpay','stripe')),
 upi_vpa_ciphertext text,
 upi_vpa_masked text,
 payee_name text,
 seller_phone text,
 bank_details_ciphertext text,
 bank_account_masked text,
 gateway_account_id_ciphertext text,
 key_version integer NOT NULL DEFAULT 1,
 platform_fee_bps integer NOT NULL DEFAULT 0 CHECK(platform_fee_bps BETWEEN 0 AND 10000),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commerce_payment_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 order_id uuid NOT NULL REFERENCES public.commerce_orders(id) ON DELETE CASCADE,
 rail text NOT NULL CHECK(rail IN ('cash_on_delivery','direct_upi','gateway')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','submitted','verified','rejected','failed','expired','refunded')),
 amount numeric(12,2) NOT NULL CHECK(amount>=0),
 currency text NOT NULL DEFAULT 'INR',
 public_token_hash text,
 utr_fingerprint text,
 utr_last4 text,
 gateway_provider text,
 gateway_order_id text,
 gateway_payment_id text,
 verified_by uuid,
 verified_at timestamptz,
 expires_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(client_id,order_id)
);
DROP INDEX IF EXISTS public.commerce_payment_utr_replay_guard;
CREATE UNIQUE INDEX commerce_payment_utr_replay_guard
 ON public.commerce_payment_transactions(utr_fingerprint)
 WHERE utr_fingerprint IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS commerce_payment_gateway_order_unique
 ON public.commerce_payment_transactions(gateway_provider,gateway_order_id)
 WHERE gateway_order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS commerce_payment_gateway_payment_unique
 ON public.commerce_payment_transactions(gateway_provider,gateway_payment_id)
 WHERE gateway_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commerce_payment_transactions_queue
 ON public.commerce_payment_transactions(client_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS public.commerce_payment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 transaction_id uuid REFERENCES public.commerce_payment_transactions(id) ON DELETE SET NULL,
 order_id uuid NOT NULL REFERENCES public.commerce_orders(id) ON DELETE CASCADE,
 event_type text NOT NULL,
 actor_type text NOT NULL CHECK(actor_type IN ('customer','workspace_user','webhook','system')),
 actor_id text,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commerce_payment_events_order ON public.commerce_payment_events(client_id,order_id,created_at DESC);

ALTER TABLE public.commerce_payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_payment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_payment_events ENABLE ROW LEVEL SECURITY;
DO $payment_policies$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['commerce_payment_settings','commerce_payment_transactions','commerce_payment_events'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS saas_member_read ON public.%I',t);
  EXECUTE format('DROP POLICY IF EXISTS saas_member_write ON public.%I',t);
  IF to_regprocedure('public.saas_member_access(uuid,text,boolean)') IS NOT NULL THEN
   EXECUTE format('CREATE POLICY saas_member_read ON public.%I FOR SELECT TO authenticated USING(public.saas_member_access(client_id,''orders'',false))',t);
  END IF;
 END LOOP;
END $payment_policies$;

-- Payment writes deliberately have no authenticated-user RLS policy. Dashboard,
-- checkout, and webhook mutations must pass through the authenticated server API
-- and its service-role/RPC validation; a browser Supabase client is read-only.

-- Only the service-role backend may execute payment mutations. The UTR passed
-- here is already an HMAC-SHA256 fingerprint; the raw reference never reaches DB.
CREATE OR REPLACE FUNCTION public.submit_commerce_payment_reference(
 p_client uuid,p_order uuid,p_fingerprint text,p_last4 text,p_actor text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tx commerce_payment_transactions; o commerce_orders;
BEGIN
 IF p_fingerprint !~ '^[a-f0-9]{64}$' OR p_last4 !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'Invalid payment reference'; END IF;
 SELECT * INTO o FROM commerce_orders WHERE id=p_order AND client_id=p_client FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
 SELECT * INTO tx FROM commerce_payment_transactions WHERE client_id=p_client AND order_id=p_order FOR UPDATE;
 IF NOT FOUND OR tx.rail<>'direct_upi' OR tx.status NOT IN ('pending','rejected') OR coalesce(tx.expires_at,now()+interval '1 minute')<=now() THEN RAISE EXCEPTION 'Payment session is unavailable'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_fingerprint,0));
 IF EXISTS(SELECT 1 FROM commerce_payment_transactions WHERE utr_fingerprint=p_fingerprint AND id<>tx.id) THEN
  INSERT INTO commerce_payment_events(client_id,transaction_id,order_id,event_type,actor_type,actor_id,details)
  VALUES(p_client,tx.id,o.id,'utr_replay_blocked','customer',left(p_actor,120),jsonb_build_object('last4',p_last4));
  RETURN jsonb_build_object('id',tx.id,'status','replayed','order_id',o.id,'last4',p_last4);
 END IF;
 UPDATE commerce_payment_transactions SET utr_fingerprint=p_fingerprint,utr_last4=p_last4,status='submitted',updated_at=now() WHERE id=tx.id RETURNING * INTO tx;
 UPDATE commerce_orders SET payment_status='pending_verification',payment_reference='UPI •••• '||p_last4,updated_at=now() WHERE id=o.id;
 INSERT INTO commerce_payment_events(client_id,transaction_id,order_id,event_type,actor_type,actor_id,details)
 VALUES(p_client,tx.id,o.id,'utr_submitted','customer',left(p_actor,120),jsonb_build_object('last4',p_last4));
 RETURN jsonb_build_object('id',tx.id,'status',tx.status,'order_id',o.id,'last4',p_last4);
END $$;

CREATE OR REPLACE FUNCTION public.decide_commerce_payment(
 p_client uuid,p_transaction uuid,p_decision text,p_actor uuid,p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tx commerce_payment_transactions; o commerce_orders;
BEGIN
 IF p_decision NOT IN ('verified','rejected') THEN RAISE EXCEPTION 'Invalid payment decision'; END IF;
 SELECT * INTO tx FROM commerce_payment_transactions WHERE id=p_transaction AND client_id=p_client FOR UPDATE;
 IF NOT FOUND OR (tx.status<>'submitted' AND NOT(tx.rail='cash_on_delivery' AND tx.status='pending' AND p_decision='verified')) THEN RAISE EXCEPTION 'Payment is not awaiting verification'; END IF;
 UPDATE commerce_payment_transactions SET status=p_decision,verified_by=p_actor,verified_at=CASE WHEN p_decision='verified' THEN now() ELSE NULL END,updated_at=now() WHERE id=tx.id RETURNING * INTO tx;
 UPDATE commerce_orders SET payment_status=CASE WHEN p_decision='verified' THEN 'paid' ELSE 'payment_rejected' END,payment_verified_at=CASE WHEN p_decision='verified' THEN now() ELSE NULL END,status=CASE WHEN p_decision='verified' AND status='placed' THEN 'confirmed' ELSE status END,updated_at=now() WHERE id=tx.order_id RETURNING * INTO o;
 INSERT INTO commerce_payment_events(client_id,transaction_id,order_id,event_type,actor_type,actor_id,details)
 VALUES(p_client,tx.id,tx.order_id,'payment_'||p_decision,'workspace_user',p_actor::text,jsonb_build_object('note',left(coalesce(p_note,''),500)));
 RETURN jsonb_build_object('transaction',to_jsonb(tx),'order',to_jsonb(o));
END $$;
REVOKE ALL ON FUNCTION public.submit_commerce_payment_reference(uuid,uuid,text,text,text),public.decide_commerce_payment(uuid,uuid,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.submit_commerce_payment_reference(uuid,uuid,text,text,text),public.decide_commerce_payment(uuid,uuid,text,uuid,text) TO service_role;
NOTIFY pgrst, 'reload schema';
