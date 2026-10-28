-- Rich feature configuration, commerce operations, audit history and notification controls.
-- Additive and safe to re-run after 051_booking_features.sql and 052_commerce_and_automation.sql.

ALTER TABLE public.booking_services
  ADD COLUMN IF NOT EXISTS configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS price numeric(12,2),
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR';

ALTER TABLE public.feature_bookings
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.catalog_products
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS images jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS supplier jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS reorder_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate numeric(7,4) NOT NULL DEFAULT 0;

-- Preserve the original availability-view column positions and append the
-- richer catalogue fields. This remains compatible with both a fresh 052
-- install and an older frozen view that ends at available_quantity.
CREATE OR REPLACE VIEW public.catalog_product_availability WITH (security_invoker=true) AS
SELECT p.id,p.client_id,p.sku,p.name,p.description,p.image_url,p.price,p.currency,
 p.stock_quantity,p.low_stock_threshold,p.track_inventory,p.allow_backorder,p.status,
 p.attributes,p.created_at,p.updated_at,
 greatest(0,p.stock_quantity-coalesce(h.held,0))::integer AS available_quantity,
 p.category,p.images,p.supplier,p.reorder_quantity,p.tax_rate
FROM public.catalog_products p
LEFT JOIN (
 SELECT product_id,sum(quantity) AS held FROM public.commerce_holds
 WHERE status='active' AND expires_at>now() GROUP BY product_id
) h ON h.product_id=p.id;

ALTER TABLE public.commerce_orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS refunded_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS carrier text,
  ADD COLUMN IF NOT EXISTS tracking_number text,
  ADD COLUMN IF NOT EXISTS tracking_url text,
  ADD COLUMN IF NOT EXISTS estimated_delivery_at timestamptz;

ALTER TABLE public.commerce_order_items
  ADD COLUMN IF NOT EXISTS fulfilled_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refunded_quantity integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.commerce_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.commerce_orders(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_commerce_order_events_order_created ON public.commerce_order_events(order_id,created_at);

CREATE TABLE IF NOT EXISTS public.feature_notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  channel text NOT NULL,
  kind text NOT NULL,
  subject text,
  body text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id,channel,kind)
);

ALTER TABLE public.commerce_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_notification_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON public.commerce_order_events;
CREATE POLICY tenant_read ON public.commerce_order_events FOR SELECT TO authenticated USING(client_id=auth.uid());
DROP POLICY IF EXISTS tenant_read ON public.feature_notification_templates;
CREATE POLICY tenant_read ON public.feature_notification_templates FOR SELECT TO authenticated USING(client_id=auth.uid());

CREATE OR REPLACE FUNCTION public.audit_commerce_order_status() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO commerce_order_events(client_id,order_id,kind,label,details)
    VALUES(NEW.client_id,NEW.id,'placed','Order placed',jsonb_build_object('status',NEW.status));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO commerce_order_events(client_id,order_id,kind,label,details)
    VALUES(NEW.client_id,NEW.id,NEW.status,'Order '||replace(NEW.status,'_',' '),jsonb_build_object('from',OLD.status,'to',NEW.status));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS commerce_order_status_audit ON public.commerce_orders;
CREATE TRIGGER commerce_order_status_audit AFTER INSERT OR UPDATE OF status ON public.commerce_orders
FOR EACH ROW EXECUTE FUNCTION public.audit_commerce_order_status();

-- Seed a placed event for existing orders without fabricating later transitions.
INSERT INTO public.commerce_order_events(client_id,order_id,kind,label,details,created_at)
SELECT o.client_id,o.id,'placed','Order placed',jsonb_build_object('status',o.status),o.created_at
FROM public.commerce_orders o
WHERE NOT EXISTS (SELECT 1 FROM public.commerce_order_events e WHERE e.order_id=o.id);

CREATE OR REPLACE FUNCTION public.record_commerce_refund(
  p_client uuid,p_order uuid,p_amount numeric,p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o commerce_orders;
BEGIN
  SELECT * INTO o FROM commerce_orders WHERE id=p_order AND client_id=p_client FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF p_amount<=0 OR o.refunded_amount+p_amount>o.total THEN RAISE EXCEPTION 'Refund amount exceeds the refundable balance'; END IF;
  UPDATE commerce_orders SET refunded_amount=refunded_amount+p_amount,
    payment_status=CASE WHEN refunded_amount+p_amount>=total THEN 'refunded' ELSE 'partially_refunded' END,
    updated_at=now() WHERE id=o.id RETURNING * INTO o;
  INSERT INTO commerce_order_events(client_id,order_id,kind,label,details)
  VALUES(p_client,o.id,'refund','Refund recorded',jsonb_build_object('amount',p_amount,'currency',o.currency,'note',left(coalesce(p_note,''),500)));
  RETURN to_jsonb(o);
END $$;
REVOKE ALL ON FUNCTION public.record_commerce_refund(uuid,uuid,numeric,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_commerce_refund(uuid,uuid,numeric,text) TO service_role;

CREATE OR REPLACE FUNCTION public.fulfil_commerce_item(
  p_client uuid,p_order uuid,p_item uuid,p_quantity integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o commerce_orders; i commerce_order_items; complete boolean;
BEGIN
  SELECT * INTO o FROM commerce_orders WHERE id=p_order AND client_id=p_client FOR UPDATE;
  IF NOT FOUND OR o.status='cancelled' THEN RAISE EXCEPTION 'Order cannot be fulfilled'; END IF;
  SELECT * INTO i FROM commerce_order_items WHERE id=p_item AND order_id=o.id FOR UPDATE;
  IF NOT FOUND OR p_quantity<0 OR p_quantity>i.quantity THEN RAISE EXCEPTION 'Invalid fulfilled quantity'; END IF;
  UPDATE commerce_order_items SET fulfilled_quantity=p_quantity WHERE id=i.id RETURNING * INTO i;
  SELECT bool_and(fulfilled_quantity>=quantity) INTO complete FROM commerce_order_items WHERE order_id=o.id;
  IF complete AND o.status<>'fulfilled' THEN UPDATE commerce_orders SET status='fulfilled',updated_at=now() WHERE id=o.id; END IF;
  INSERT INTO commerce_order_events(client_id,order_id,kind,label,details)
  VALUES(p_client,o.id,'item_fulfilment','Item fulfilment updated',jsonb_build_object('item_id',i.id,'name',i.name,'fulfilled_quantity',i.fulfilled_quantity,'quantity',i.quantity));
  RETURN to_jsonb(i);
END $$;
REVOKE ALL ON FUNCTION public.fulfil_commerce_item(uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fulfil_commerce_item(uuid,uuid,uuid,integer) TO service_role;

NOTIFY pgrst, 'reload schema';
