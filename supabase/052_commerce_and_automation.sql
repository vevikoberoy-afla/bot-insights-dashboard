-- Commerce catalogue, orders, inventory holds, automation and calendar adapters.
-- Apply after 051_booking_features.sql.
CREATE TABLE IF NOT EXISTS public.catalog_products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id),
 sku text NOT NULL, name text NOT NULL, description text NOT NULL DEFAULT '', image_url text,
 price numeric(12,2) NOT NULL CHECK(price>=0), currency text NOT NULL DEFAULT 'INR',
 stock_quantity integer NOT NULL DEFAULT 0 CHECK(stock_quantity>=0), low_stock_threshold integer NOT NULL DEFAULT 5 CHECK(low_stock_threshold>=0),
 track_inventory boolean NOT NULL DEFAULT true, allow_backorder boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','archived')),
 attributes jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(client_id,sku), UNIQUE(id,client_id)
);
CREATE TABLE IF NOT EXISTS public.commerce_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id),
 reference text NOT NULL UNIQUE DEFAULT ('ORD-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 customer_name text NOT NULL, customer_email text NOT NULL, customer_phone text, channel text NOT NULL DEFAULT 'web',
 status text NOT NULL DEFAULT 'placed' CHECK(status IN ('placed','processing','fulfilled','cancelled')),
 subtotal numeric(12,2) NOT NULL DEFAULT 0, total numeric(12,2) NOT NULL DEFAULT 0, currency text NOT NULL DEFAULT 'INR',
 offer_id uuid, booking_id uuid REFERENCES public.feature_bookings(id), shipping_address jsonb NOT NULL DEFAULT '{}',
 idempotency_key text NOT NULL, receipt_number text NOT NULL UNIQUE DEFAULT ('RCT-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(client_id,idempotency_key), FOREIGN KEY(offer_id,client_id) REFERENCES public.booking_offers(id,client_id)
);
CREATE TABLE IF NOT EXISTS public.commerce_order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.commerce_orders(id) ON DELETE CASCADE,
 product_id uuid NOT NULL REFERENCES public.catalog_products(id), sku text NOT NULL, name text NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0), unit_price numeric(12,2) NOT NULL CHECK(unit_price>=0), line_total numeric(12,2) GENERATED ALWAYS AS (quantity*unit_price) STORED
);
CREATE TABLE IF NOT EXISTS public.inventory_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id), product_id uuid NOT NULL REFERENCES public.catalog_products(id),
 order_id uuid REFERENCES public.commerce_orders(id), movement_type text NOT NULL CHECK(movement_type IN ('initial','adjustment','hold','release','sale','return','sync')),
 quantity_delta integer NOT NULL, stock_after integer NOT NULL CHECK(stock_after>=0), note text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.commerce_holds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id), product_id uuid NOT NULL REFERENCES public.catalog_products(id),
 session_key text NOT NULL, quantity integer NOT NULL CHECK(quantity>0), status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','consumed','expired','released')),
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(client_id,session_key,product_id)
);
CREATE INDEX IF NOT EXISTS idx_commerce_holds_product_status_expiry ON public.commerce_holds(product_id,status,expires_at);
CREATE TABLE IF NOT EXISTS public.commerce_waitlist (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id),
 offer_id uuid NOT NULL, product_id uuid NOT NULL REFERENCES public.catalog_products(id),
 customer_name text NOT NULL, customer_email text NOT NULL, customer_phone text, channel text NOT NULL DEFAULT 'web',
 quantity integer NOT NULL CHECK(quantity>0), shipping_address jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','promoted','cancelled','expired')),
 order_id uuid REFERENCES public.commerce_orders(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(client_id,offer_id,customer_email), FOREIGN KEY(offer_id,client_id) REFERENCES public.booking_offers(id,client_id)
);
CREATE INDEX IF NOT EXISTS idx_commerce_waitlist_product_status_created ON public.commerce_waitlist(product_id,status,created_at);
CREATE TABLE IF NOT EXISTS public.automation_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id),
 entity_type text NOT NULL, entity_id uuid NOT NULL, event_type text NOT NULL, channel text NOT NULL,
 destination text, due_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','cancelled')),
 payload jsonb NOT NULL DEFAULT '{}', attempts integer NOT NULL DEFAULT 0, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(entity_type,entity_id,event_type,channel,due_at)
);
CREATE TABLE IF NOT EXISTS public.booking_flow_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id), bot_id uuid, session_key text NOT NULL,
 flow_type text NOT NULL, step text NOT NULL, contact jsonb NOT NULL DEFAULT '{}', context jsonb NOT NULL DEFAULT '{}',
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','abandoned','cancelled')),
 recover_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(client_id,session_key,flow_type)
);
ALTER TABLE public.booking_services ADD COLUMN IF NOT EXISTS integration_id uuid REFERENCES public.channel_integrations(id) ON DELETE SET NULL;
ALTER TABLE public.booking_services ADD COLUMN IF NOT EXISTS external_calendar_id text;
ALTER TABLE public.booking_services ADD COLUMN IF NOT EXISTS external_event_type_id text;
ALTER TABLE public.booking_services ADD COLUMN IF NOT EXISTS confirmation_whatsapp boolean NOT NULL DEFAULT false;
ALTER TABLE public.booking_services ADD COLUMN IF NOT EXISTS reminder_whatsapp boolean NOT NULL DEFAULT false;
ALTER TABLE public.feature_bookings ADD COLUMN IF NOT EXISTS external_event_id text;
ALTER TABLE public.feature_bookings ADD COLUMN IF NOT EXISTS external_manage_url text;
ALTER TABLE public.booking_offers ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE public.booking_offers ADD COLUMN IF NOT EXISTS segment_rule jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.booking_offers ADD COLUMN IF NOT EXISTS copy_variants jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.booking_offers DROP CONSTRAINT IF EXISTS booking_offers_product_tenant_fk;
ALTER TABLE public.booking_offers ADD CONSTRAINT booking_offers_product_tenant_fk FOREIGN KEY(product_id,client_id) REFERENCES public.catalog_products(id,client_id);
ALTER TABLE public.booking_notifications ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email';
ALTER TABLE public.booking_notifications DROP CONSTRAINT IF EXISTS booking_notifications_booking_id_kind_due_at_key;
ALTER TABLE public.booking_notifications DROP CONSTRAINT IF EXISTS booking_notifications_delivery_unique;
ALTER TABLE public.booking_notifications ADD CONSTRAINT booking_notifications_delivery_unique UNIQUE(booking_id,kind,due_at,channel);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['catalog_products','commerce_orders','commerce_order_items','inventory_movements','commerce_holds','commerce_waitlist','automation_deliveries','booking_flow_sessions'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['catalog_products','commerce_orders','inventory_movements','commerce_holds','commerce_waitlist','automation_deliveries','booking_flow_sessions'] LOOP
  EXECUTE format('DROP POLICY IF EXISTS tenant_read ON public.%I',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(client_id=auth.uid())',t);
 END LOOP;
 DROP POLICY IF EXISTS tenant_order_items_read ON commerce_order_items;
 CREATE POLICY tenant_order_items_read ON commerce_order_items FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM commerce_orders o WHERE o.id=order_id AND o.client_id=auth.uid()));
END $$;

CREATE OR REPLACE FUNCTION public.join_commerce_waitlist(p_client uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o booking_offers; w commerce_waitlist; ordered integer; waiting integer; qty integer; email text; email_domain text;
BEGIN
 qty:=(p_input->>'quantity')::integer; email:=lower(trim(p_input->>'customer_email'));
 IF qty<1 OR qty>1000 OR length(trim(p_input->>'customer_name'))<2 OR email NOT LIKE '%@%' THEN RAISE EXCEPTION 'Invalid waitlist request'; END IF;
 SELECT * INTO o FROM booking_offers WHERE id=(p_input->>'offer_id')::uuid AND client_id=p_client FOR UPDATE;
 IF NOT FOUND OR o.product_id IS NULL OR NOT o.waitlist_enabled OR o.status<>'active' OR now()<o.start_at OR now()>=o.end_at THEN RAISE EXCEPTION 'Waitlist is unavailable'; END IF;
 IF o.product_id<>(p_input->>'product_id')::uuid THEN RAISE EXCEPTION 'Offer product mismatch'; END IF;
 IF jsonb_array_length(coalesce(o.segment_rule->'channels','[]'::jsonb))>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(o.segment_rule->'channels') c WHERE c=coalesce(p_input->>'channel','web')) THEN RAISE EXCEPTION 'Offer is not available on this channel'; END IF;
 email_domain:=split_part(email,'@',2);
 IF jsonb_array_length(coalesce(o.segment_rule->'email_domains','[]'::jsonb))>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(o.segment_rule->'email_domains') d WHERE lower(d)=email_domain) THEN RAISE EXCEPTION 'Offer is not available to this customer segment'; END IF;
 SELECT coalesce(sum(i.quantity),0) INTO ordered FROM commerce_order_items i JOIN commerce_orders so ON so.id=i.order_id WHERE so.offer_id=o.id AND so.customer_email=email AND so.status<>'cancelled';
 SELECT coalesce(sum(quantity),0) INTO waiting FROM commerce_waitlist WHERE offer_id=o.id AND customer_email=email AND status='waiting';
 IF ordered+waiting+qty>o.max_per_customer THEN RAISE EXCEPTION 'Customer claim limit reached'; END IF;
 INSERT INTO commerce_waitlist(client_id,offer_id,product_id,customer_name,customer_email,customer_phone,channel,quantity,shipping_address,status,order_id,updated_at)
 VALUES(p_client,o.id,o.product_id,trim(p_input->>'customer_name'),email,p_input->>'customer_phone',coalesce(p_input->>'channel','web'),qty,coalesce(p_input->'shipping_address','{}'),'waiting',NULL,now())
 ON CONFLICT(client_id,offer_id,customer_email) DO UPDATE SET customer_name=excluded.customer_name,customer_phone=excluded.customer_phone,channel=excluded.channel,quantity=excluded.quantity,shipping_address=excluded.shipping_address,status='waiting',order_id=NULL,updated_at=now()
 RETURNING * INTO w;
 RETURN to_jsonb(w);
END $$;

CREATE OR REPLACE FUNCTION public.promote_commerce_waitlist(p_client uuid,p_product uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p catalog_products; w commerce_waitlist; o booking_offers; so commerce_orders; claimed integer; reserved integer; promoted integer:=0;
BEGIN
 SELECT * INTO p FROM catalog_products WHERE id=p_product AND client_id=p_client FOR UPDATE; IF NOT FOUND THEN RETURN 0; END IF;
 UPDATE commerce_waitlist cw SET status='expired',updated_at=now() FROM booking_offers bo WHERE cw.offer_id=bo.id AND cw.status='waiting' AND bo.end_at<=now();
 FOR w IN SELECT cw.* FROM commerce_waitlist cw JOIN booking_offers bo ON bo.id=cw.offer_id
  WHERE cw.client_id=p_client AND cw.product_id=p.id AND cw.status='waiting' AND bo.status='active' AND now()>=bo.start_at AND now()<bo.end_at ORDER BY cw.created_at FOR UPDATE OF cw LOOP
  SELECT * INTO o FROM booking_offers WHERE id=w.offer_id FOR UPDATE;
  SELECT coalesce(sum(i.quantity),0) INTO claimed FROM commerce_order_items i JOIN commerce_orders x ON x.id=i.order_id WHERE x.offer_id=o.id AND x.status<>'cancelled';
  SELECT coalesce(sum(quantity),0) INTO reserved FROM commerce_holds WHERE product_id=p.id AND status='active' AND expires_at>now();
  IF claimed+w.quantity<=o.quantity AND (NOT p.track_inventory OR p.allow_backorder OR p.stock_quantity-reserved>=w.quantity) THEN
   INSERT INTO commerce_orders(client_id,customer_name,customer_email,customer_phone,channel,subtotal,total,currency,offer_id,shipping_address,idempotency_key)
   VALUES(p_client,w.customer_name,w.customer_email,w.customer_phone,w.channel,p.price*w.quantity,p.price*w.quantity,p.currency,o.id,w.shipping_address,'waitlist:'||w.id) RETURNING * INTO so;
   INSERT INTO commerce_order_items(order_id,product_id,sku,name,quantity,unit_price) VALUES(so.id,p.id,p.sku,p.name,w.quantity,p.price);
   IF p.track_inventory THEN UPDATE catalog_products SET stock_quantity=stock_quantity-w.quantity,updated_at=now() WHERE id=p.id RETURNING * INTO p; END IF;
   INSERT INTO inventory_movements(client_id,product_id,order_id,movement_type,quantity_delta,stock_after,note) VALUES(p_client,p.id,so.id,'sale',-w.quantity,p.stock_quantity,'Automatic waitlist promotion');
   UPDATE commerce_waitlist SET status='promoted',order_id=so.id,updated_at=now() WHERE id=w.id;
   INSERT INTO automation_deliveries(client_id,entity_type,entity_id,event_type,channel,destination,payload) VALUES(p_client,'order',so.id,'waitlist_promoted','email',so.customer_email,jsonb_build_object('reference',so.reference,'receipt_number',so.receipt_number));
   IF nullif(so.customer_phone,'') IS NOT NULL THEN INSERT INTO automation_deliveries(client_id,entity_type,entity_id,event_type,channel,destination,payload) VALUES(p_client,'order',so.id,'waitlist_promoted','whatsapp',so.customer_phone,jsonb_build_object('reference',so.reference,'receipt_number',so.receipt_number)); END IF;
   promoted:=promoted+1;
  END IF;
 END LOOP;
 RETURN promoted;
END $$;

CREATE OR REPLACE FUNCTION public.hold_catalog_inventory(p_client uuid,p_product uuid,p_session text,p_quantity integer,p_minutes integer DEFAULT 15) RETURNS jsonb
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

CREATE OR REPLACE FUNCTION public.place_catalog_order(p_client uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o commerce_orders; line jsonb; p catalog_products; h commerce_holds; qty integer; amount numeric:=0; cur text; offer booking_offers; claimed integer; customer_claimed integer; cart_qty integer; first_currency text; email_domain text;
BEGIN
 IF length(trim(p_input->>'customer_name'))<2 OR lower(p_input->>'customer_email') NOT LIKE '%@%' THEN RAISE EXCEPTION 'Customer name and email are required'; END IF;
 SELECT * INTO o FROM commerce_orders WHERE client_id=p_client AND idempotency_key=p_input->>'idempotency_key'; IF FOUND THEN RETURN to_jsonb(o); END IF;
 IF jsonb_array_length(coalesce(p_input->'items','[]'))<1 THEN RAISE EXCEPTION 'Cart is empty'; END IF;
 FOR line IN SELECT jsonb_build_object('product_id',x->>'product_id','quantity',sum((x->>'quantity')::integer)) FROM jsonb_array_elements(p_input->'items') x GROUP BY x->>'product_id' ORDER BY x->>'product_id' LOOP
  qty:=(line->>'quantity')::integer; IF qty<1 OR qty>1000 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
  SELECT * INTO p FROM catalog_products WHERE id=(line->>'product_id')::uuid AND client_id=p_client AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product unavailable'; END IF;
  IF first_currency IS NULL THEN first_currency:=p.currency; ELSIF first_currency<>p.currency THEN RAISE EXCEPTION 'Cart must use one currency'; END IF;
  SELECT * INTO h FROM commerce_holds WHERE client_id=p_client AND product_id=p.id AND session_key=p_input->>'hold_key' AND status='active' AND expires_at>now() FOR UPDATE;
  IF NOT FOUND OR h.quantity<qty THEN RAISE EXCEPTION 'Inventory hold expired; check availability again'; END IF;
  IF p.track_inventory AND NOT p.allow_backorder AND p.stock_quantity<qty THEN RAISE EXCEPTION 'Insufficient inventory'; END IF;
  amount:=amount+p.price*qty;
 END LOOP;
 IF nullif(p_input->>'offer_id','') IS NOT NULL THEN
  SELECT * INTO offer FROM booking_offers WHERE id=(p_input->>'offer_id')::uuid AND client_id=p_client FOR UPDATE;
  IF NOT FOUND OR offer.status<>'active' OR now()<offer.start_at OR now()>=offer.end_at THEN RAISE EXCEPTION 'Offer is not active'; END IF;
  SELECT coalesce(sum((x->>'quantity')::integer),0) INTO cart_qty FROM jsonb_array_elements(p_input->'items') x;
  IF offer.product_id IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_input->'items') x WHERE (x->>'product_id')::uuid<>offer.product_id) THEN RAISE EXCEPTION 'Offer product mismatch'; END IF;
  IF jsonb_array_length(coalesce(offer.segment_rule->'channels','[]'::jsonb))>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(offer.segment_rule->'channels') c WHERE c=coalesce(p_input->>'channel','web')) THEN RAISE EXCEPTION 'Offer is not available on this channel'; END IF;
  email_domain:=split_part(lower(p_input->>'customer_email'),'@',2);
  IF jsonb_array_length(coalesce(offer.segment_rule->'email_domains','[]'::jsonb))>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(offer.segment_rule->'email_domains') d WHERE lower(d)=email_domain) THEN RAISE EXCEPTION 'Offer is not available to this customer segment'; END IF;
  SELECT coalesce(sum(i.quantity),0) INTO claimed FROM commerce_order_items i JOIN commerce_orders so ON so.id=i.order_id WHERE so.offer_id=offer.id AND so.status<>'cancelled';
  IF claimed+cart_qty>offer.quantity THEN RAISE EXCEPTION 'Offer exhausted'; END IF;
  SELECT coalesce(sum(i.quantity),0) INTO customer_claimed FROM commerce_order_items i JOIN commerce_orders so ON so.id=i.order_id WHERE so.offer_id=offer.id AND so.customer_email=lower(trim(p_input->>'customer_email')) AND so.status<>'cancelled';
 IF customer_claimed+cart_qty>offer.max_per_customer THEN RAISE EXCEPTION 'Customer claim limit reached'; END IF;
  IF offer.price IS NOT NULL THEN amount:=offer.price*cart_qty; END IF;
 END IF;
 INSERT INTO commerce_orders(client_id,customer_name,customer_email,customer_phone,channel,subtotal,total,currency,offer_id,shipping_address,idempotency_key)
 VALUES(p_client,trim(p_input->>'customer_name'),lower(trim(p_input->>'customer_email')),p_input->>'customer_phone',coalesce(p_input->>'channel','web'),amount,amount,coalesce(first_currency,'INR'),nullif(p_input->>'offer_id','')::uuid,coalesce(p_input->'shipping_address','{}'),p_input->>'idempotency_key') RETURNING * INTO o;
 FOR line IN SELECT jsonb_build_object('product_id',x->>'product_id','quantity',sum((x->>'quantity')::integer)) FROM jsonb_array_elements(p_input->'items') x GROUP BY x->>'product_id' ORDER BY x->>'product_id' LOOP
  qty:=(line->>'quantity')::integer; SELECT * INTO p FROM catalog_products WHERE id=(line->>'product_id')::uuid FOR UPDATE;
  INSERT INTO commerce_order_items(order_id,product_id,sku,name,quantity,unit_price) VALUES(o.id,p.id,p.sku,p.name,qty,CASE WHEN offer.id IS NOT NULL AND offer.product_id=p.id AND offer.price IS NOT NULL THEN offer.price ELSE p.price END);
  IF p.track_inventory THEN UPDATE catalog_products SET stock_quantity=stock_quantity-qty,updated_at=now() WHERE id=p.id RETURNING * INTO p; END IF;
  INSERT INTO inventory_movements(client_id,product_id,order_id,movement_type,quantity_delta,stock_after,note) VALUES(p_client,p.id,o.id,'sale',-qty,p.stock_quantity,o.reference);
  UPDATE commerce_holds SET status='consumed' WHERE client_id=p_client AND product_id=p.id AND session_key=p_input->>'hold_key';
 END LOOP;
 IF o.customer_email NOT LIKE '%@order.invalid' THEN INSERT INTO automation_deliveries(client_id,entity_type,entity_id,event_type,channel,destination,payload) VALUES(p_client,'order',o.id,'receipt','email',o.customer_email,jsonb_build_object('reference',o.reference,'receipt_number',o.receipt_number)); END IF;
 IF nullif(o.customer_phone,'') IS NOT NULL THEN INSERT INTO automation_deliveries(client_id,entity_type,entity_id,event_type,channel,destination,payload) VALUES(p_client,'order',o.id,'receipt','whatsapp',o.customer_phone,jsonb_build_object('reference',o.reference,'receipt_number',o.receipt_number)); END IF;
 RETURN to_jsonb(o);
END $$;

CREATE OR REPLACE FUNCTION public.change_sales_order(p_client uuid,p_order uuid,p_status text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o commerce_orders; i commerce_order_items; p catalog_products;
BEGIN
 SELECT * INTO o FROM commerce_orders WHERE id=p_order AND client_id=p_client FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
 IF p_status NOT IN ('processing','fulfilled','cancelled') THEN RAISE EXCEPTION 'Invalid status'; END IF;
 IF o.status IN ('fulfilled','cancelled') THEN RAISE EXCEPTION 'Order is already finalized'; END IF;
 UPDATE commerce_orders SET status=p_status,updated_at=now() WHERE id=o.id RETURNING * INTO o;
 IF p_status='cancelled' THEN
  FOR i IN SELECT * FROM commerce_order_items WHERE order_id=o.id ORDER BY product_id LOOP
   SELECT * INTO p FROM catalog_products WHERE id=i.product_id FOR UPDATE;
   IF p.track_inventory THEN UPDATE catalog_products SET stock_quantity=stock_quantity+i.quantity,updated_at=now() WHERE id=p.id RETURNING * INTO p; END IF;
   INSERT INTO inventory_movements(client_id,product_id,order_id,movement_type,quantity_delta,stock_after,note) VALUES(p_client,p.id,o.id,'return',i.quantity,p.stock_quantity,'Order cancelled');
   PERFORM promote_commerce_waitlist(p_client,p.id);
  END LOOP;
 END IF;
 INSERT INTO automation_deliveries(client_id,entity_type,entity_id,event_type,channel,destination,payload) VALUES(p_client,'order',o.id,p_status,'email',o.customer_email,jsonb_build_object('reference',o.reference)) ON CONFLICT DO NOTHING;
 RETURN to_jsonb(o);
END $$;

CREATE OR REPLACE FUNCTION public.adjust_catalog_inventory(p_client uuid,p_product uuid,p_quantity integer,p_note text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p catalog_products; old_qty integer;
BEGIN
 SELECT * INTO p FROM catalog_products WHERE id=p_product AND client_id=p_client FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
 old_qty:=p.stock_quantity; IF old_qty+p_quantity<0 THEN RAISE EXCEPTION 'Stock cannot be negative'; END IF;
 UPDATE catalog_products SET stock_quantity=old_qty+p_quantity,updated_at=now() WHERE id=p.id RETURNING * INTO p;
 INSERT INTO inventory_movements(client_id,product_id,movement_type,quantity_delta,stock_after,note) VALUES(p_client,p.id,'adjustment',p_quantity,p.stock_quantity,left(p_note,500));
 IF p_quantity>0 THEN PERFORM promote_commerce_waitlist(p_client,p.id); END IF;
 RETURN to_jsonb(p);
END $$;
REVOKE ALL ON FUNCTION public.hold_catalog_inventory(uuid,uuid,text,integer,integer),public.place_catalog_order(uuid,jsonb),public.change_sales_order(uuid,uuid,text),public.adjust_catalog_inventory(uuid,uuid,integer,text),public.join_commerce_waitlist(uuid,jsonb),public.promote_commerce_waitlist(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hold_catalog_inventory(uuid,uuid,text,integer,integer),public.place_catalog_order(uuid,jsonb),public.change_sales_order(uuid,uuid,text),public.adjust_catalog_inventory(uuid,uuid,integer,text),public.join_commerce_waitlist(uuid,jsonb),public.promote_commerce_waitlist(uuid,uuid) TO service_role;

-- Never use CREATE OR REPLACE to repair this view. PostgreSQL freezes view
-- column positions, so an installation that previously used p.* may have
-- category where available_quantity now belongs. Preserve the later bounded
-- search function (when present), rebuild the view contract, then restore it.
DO $availability_view$
DECLARE
 saved_search_function text;
BEGIN
 SELECT pg_get_functiondef(p.oid)
 INTO saved_search_function
 FROM pg_proc p
 WHERE p.oid=to_regprocedure('public.search_bot_catalog_page(uuid,uuid,text,integer)')
 LIMIT 1;

 IF saved_search_function IS NOT NULL THEN
  EXECUTE 'DROP FUNCTION public.search_bot_catalog_page(uuid,uuid,text,integer)';
 END IF;

 -- DROP + CREATE is intentional: ALTER/CREATE OR REPLACE cannot safely repair
 -- every historical column ordering of this view.
 DROP VIEW IF EXISTS public.catalog_product_availability;

 IF EXISTS(
  SELECT 1 FROM information_schema.columns
  WHERE table_schema='public' AND table_name='catalog_products' AND column_name='category'
 ) THEN
  EXECUTE $view$
   CREATE VIEW public.catalog_product_availability WITH (security_invoker=true) AS
   SELECT p.id,p.client_id,p.sku,p.name,p.description,p.image_url,p.price,p.currency,
    p.stock_quantity,p.low_stock_threshold,p.track_inventory,p.allow_backorder,p.status,
    p.attributes,p.created_at,p.updated_at,
    greatest(0,p.stock_quantity-coalesce(h.held,0))::integer AS available_quantity,
    p.category,p.images,p.supplier,p.reorder_quantity,p.tax_rate
   FROM public.catalog_products p
   LEFT JOIN (
    SELECT product_id,sum(quantity) AS held FROM public.commerce_holds
    WHERE status='active' AND expires_at>now() GROUP BY product_id
   ) h ON h.product_id=p.id
  $view$;
 ELSE
  EXECUTE $view$
   CREATE VIEW public.catalog_product_availability WITH (security_invoker=true) AS
   SELECT p.id,p.client_id,p.sku,p.name,p.description,p.image_url,p.price,p.currency,
    p.stock_quantity,p.low_stock_threshold,p.track_inventory,p.allow_backorder,p.status,
    p.attributes,p.created_at,p.updated_at,
    greatest(0,p.stock_quantity-coalesce(h.held,0))::integer AS available_quantity
   FROM public.catalog_products p
   LEFT JOIN (
    SELECT product_id,sum(quantity) AS held FROM public.commerce_holds
    WHERE status='active' AND expires_at>now() GROUP BY product_id
   ) h ON h.product_id=p.id
  $view$;
 END IF;

 IF saved_search_function IS NOT NULL THEN
  EXECUTE saved_search_function;
  REVOKE ALL ON FUNCTION public.search_bot_catalog_page(uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated;
  GRANT EXECUTE ON FUNCTION public.search_bot_catalog_page(uuid,uuid,text,integer) TO service_role;
 END IF;
END
$availability_view$;

-- Campaign statistics count product orders for product-linked offers and bookings
-- for appointment/simple offers, so the dashboard and chatbot share one truth.
DROP VIEW IF EXISTS public.booking_offer_stats;
CREATE VIEW public.booking_offer_stats WITH (security_invoker=true) AS
 SELECT o.*,
  CASE WHEN o.product_id IS NULL THEN coalesce(b.claimed,0) ELSE coalesce(s.claimed,0) END::integer AS claimed,
  greatest(0,o.quantity-CASE WHEN o.product_id IS NULL THEN coalesce(b.claimed,0) ELSE coalesce(s.claimed,0) END)::integer AS remaining,
  coalesce(b.waitlisted,0)::integer AS waitlisted
 FROM booking_offers o
 LEFT JOIN (
  SELECT offer_id,sum(quantity) FILTER(WHERE status IN ('confirmed','completed','no_show')) AS claimed,
   sum(quantity) FILTER(WHERE status='waitlisted') AS waitlisted FROM feature_bookings GROUP BY offer_id
 ) b ON b.offer_id=o.id
 LEFT JOIN (
  SELECT so.offer_id,sum(i.quantity) AS claimed FROM commerce_orders so JOIN commerce_order_items i ON i.order_id=so.id
  WHERE so.offer_id IS NOT NULL AND so.status<>'cancelled' GROUP BY so.offer_id
 ) s ON s.offer_id=o.id;

CREATE OR REPLACE FUNCTION public.audit_booking_configuration() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE claimed integer;
BEGIN
 IF TG_TABLE_NAME='booking_offers' AND TG_OP='UPDATE' THEN
  IF NEW.product_id IS NULL THEN
   SELECT coalesce(sum(quantity),0) INTO claimed FROM feature_bookings WHERE offer_id=NEW.id AND status IN ('confirmed','completed','no_show');
  ELSE
   SELECT coalesce(sum(i.quantity),0) INTO claimed FROM commerce_order_items i JOIN commerce_orders o ON o.id=i.order_id WHERE o.offer_id=NEW.id AND o.status<>'cancelled';
  END IF;
  IF NEW.quantity<claimed THEN RAISE EXCEPTION 'Stock cannot be lower than existing claims (%)',claimed; END IF;
 END IF;
 INSERT INTO booking_events(client_id,action,details) VALUES(NEW.client_id,TG_TABLE_NAME||'_'||lower(TG_OP),jsonb_build_object('id',NEW.id,'before',CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,'after',to_jsonb(NEW)));
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fanout_booking_whatsapp() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE enabled boolean;
BEGIN
 SELECT CASE WHEN NEW.kind='reminder' THEN s.reminder_whatsapp ELSE s.confirmation_whatsapp END INTO enabled
 FROM feature_bookings b JOIN booking_services s ON s.id=b.service_id WHERE b.id=NEW.booking_id;
 IF enabled THEN INSERT INTO booking_notifications(client_id,booking_id,kind,due_at,channel) VALUES(NEW.client_id,NEW.booking_id,NEW.kind,NEW.due_at,'whatsapp') ON CONFLICT DO NOTHING; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS booking_notification_whatsapp ON booking_notifications;
CREATE TRIGGER booking_notification_whatsapp AFTER INSERT ON booking_notifications FOR EACH ROW WHEN(NEW.channel='email') EXECUTE FUNCTION fanout_booking_whatsapp();

CREATE OR REPLACE FUNCTION public.promote_offer_waitlist() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE capacity integer; used integer; slot_used integer; service_capacity integer; candidate feature_bookings;
BEGIN
 IF OLD.status NOT IN ('confirmed','completed','no_show') OR NEW.status<>'cancelled' OR NEW.offer_id IS NULL THEN RETURN NEW; END IF;
 SELECT quantity INTO capacity FROM booking_offers WHERE id=NEW.offer_id FOR UPDATE;
 SELECT coalesce(sum(quantity),0) INTO used FROM feature_bookings WHERE offer_id=NEW.offer_id AND status IN ('confirmed','completed','no_show');
 FOR candidate IN SELECT * FROM feature_bookings WHERE offer_id=NEW.offer_id AND status='waitlisted' ORDER BY created_at FOR UPDATE LOOP
  slot_used:=0; service_capacity:=2147483647;
  IF candidate.service_id IS NOT NULL THEN
   SELECT s.capacity INTO service_capacity FROM booking_services s WHERE s.id=candidate.service_id;
   SELECT coalesce(sum(quantity),0) INTO slot_used FROM feature_bookings
    WHERE service_id=candidate.service_id AND status='confirmed' AND id<>candidate.id
     AND slot_start<candidate.slot_end AND slot_end>candidate.slot_start;
  END IF;
  IF used+candidate.quantity<=capacity AND slot_used+candidate.quantity<=service_capacity THEN
   UPDATE feature_bookings SET status='confirmed',updated_at=now() WHERE id=candidate.id;
   INSERT INTO booking_events(client_id,booking_id,action) VALUES(candidate.client_id,candidate.id,'waitlist_promoted');
   INSERT INTO booking_notifications(client_id,booking_id,kind,due_at,channel) VALUES(candidate.client_id,candidate.id,'waitlist_promoted',now(),'email') ON CONFLICT DO NOTHING;
   used:=used+candidate.quantity;
  END IF;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS booking_waitlist_promote ON feature_bookings;
CREATE TRIGGER booking_waitlist_promote AFTER UPDATE OF status ON feature_bookings FOR EACH ROW EXECUTE FUNCTION promote_offer_waitlist();

CREATE OR REPLACE FUNCTION public.expire_feature_holds_and_flows() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE expired_holds integer; abandoned integer;
BEGIN
 UPDATE commerce_holds SET status='expired' WHERE status='active' AND expires_at<=now(); GET DIAGNOSTICS expired_holds=ROW_COUNT;
 WITH changed AS (UPDATE booking_flow_sessions SET status='abandoned',updated_at=now() WHERE status='active' AND recover_at<=now() RETURNING *)
 INSERT INTO automation_deliveries(client_id,entity_type,entity_id,event_type,channel,destination,payload)
 SELECT client_id,'flow',id,'abandoned_recovery','email',contact->>'email',jsonb_build_object('flow_type',flow_type,'step',step)
 FROM changed WHERE contact->>'email' IS NOT NULL ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS abandoned=ROW_COUNT;
 RETURN jsonb_build_object('expired_holds',expired_holds,'abandoned_flows',abandoned);
END $$;
REVOKE ALL ON FUNCTION public.expire_feature_holds_and_flows() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.expire_feature_holds_and_flows() TO service_role;

CREATE OR REPLACE FUNCTION public.queue_feature_webhook() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE owner uuid; entity uuid; event text;
BEGIN
 owner:=NEW.client_id; entity:=NEW.id;
 event:=CASE TG_TABLE_NAME
  WHEN 'feature_bookings' THEN 'booking.'||(to_jsonb(NEW)->>'status')
  WHEN 'commerce_orders' THEN 'order.'||(to_jsonb(NEW)->>'status')
  WHEN 'commerce_waitlist' THEN 'waitlist.'||(to_jsonb(NEW)->>'status')
  ELSE 'inventory.changed'
 END;
 INSERT INTO automation_deliveries(client_id,entity_type,entity_id,event_type,channel,payload)
 VALUES(owner,TG_TABLE_NAME,entity,event,'webhook',to_jsonb(NEW)); RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS feature_booking_webhook ON feature_bookings;
DROP TRIGGER IF EXISTS commerce_order_webhook ON commerce_orders;
DROP TRIGGER IF EXISTS inventory_webhook ON inventory_movements;
DROP TRIGGER IF EXISTS commerce_waitlist_webhook ON commerce_waitlist;
CREATE TRIGGER feature_booking_webhook AFTER INSERT OR UPDATE OF status ON feature_bookings FOR EACH ROW EXECUTE FUNCTION queue_feature_webhook();
CREATE TRIGGER commerce_order_webhook AFTER INSERT OR UPDATE OF status ON commerce_orders FOR EACH ROW EXECUTE FUNCTION queue_feature_webhook();
CREATE TRIGGER inventory_webhook AFTER INSERT ON inventory_movements FOR EACH ROW EXECUTE FUNCTION queue_feature_webhook();
CREATE TRIGGER commerce_waitlist_webhook AFTER INSERT OR UPDATE OF status ON commerce_waitlist FOR EACH ROW EXECUTE FUNCTION queue_feature_webhook();

-- Ask Supabase PostgREST to expose newly created relations immediately.
NOTIFY pgrst, 'reload schema';
