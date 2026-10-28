-- Product add-ons selected during a booking consume catalogue inventory and
-- are restored once when that booking is cancelled.
ALTER TABLE public.inventory_movements
 ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.feature_bookings(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_movements_booking ON public.inventory_movements(booking_id) WHERE booking_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_booking_addon_inventory(p_client uuid,p_booking uuid,p_items jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b feature_bookings; line jsonb; p catalog_products; qty integer; normalized jsonb:='[]'::jsonb;
BEGIN
 SELECT * INTO b FROM feature_bookings WHERE id=p_booking AND client_id=p_client FOR UPDATE;
 IF NOT FOUND OR b.status<>'confirmed' THEN RAISE EXCEPTION 'Active booking not found'; END IF;
 IF coalesce((b.details->>'addon_inventory_claimed')::boolean,false) THEN RETURN to_jsonb(b); END IF;
 IF jsonb_typeof(coalesce(p_items,'[]'::jsonb))<>'array' THEN RAISE EXCEPTION 'Invalid add-on inventory'; END IF;
 FOR line IN
  SELECT jsonb_build_object('product_id',item->>'product_id','quantity',sum((item->>'quantity')::integer))
  FROM jsonb_array_elements(p_items) item
  WHERE nullif(item->>'product_id','') IS NOT NULL
  GROUP BY item->>'product_id' ORDER BY item->>'product_id'
 LOOP
  qty:=(line->>'quantity')::integer;
  IF qty<1 OR qty>1000 THEN RAISE EXCEPTION 'Invalid add-on quantity'; END IF;
  SELECT * INTO p FROM catalog_products WHERE id=(line->>'product_id')::uuid AND client_id=p_client AND status='active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Add-on product unavailable'; END IF;
  IF p.track_inventory AND NOT p.allow_backorder AND p.stock_quantity<qty THEN RAISE EXCEPTION 'Only % of % available',greatest(0,p.stock_quantity),p.name; END IF;
  IF p.track_inventory THEN UPDATE catalog_products SET stock_quantity=greatest(0,stock_quantity-qty),updated_at=now() WHERE id=p.id RETURNING * INTO p; END IF;
  INSERT INTO inventory_movements(client_id,product_id,booking_id,movement_type,quantity_delta,stock_after,note)
   VALUES(p_client,p.id,b.id,'sale',-qty,p.stock_quantity,b.reference||' booking add-on');
  normalized:=normalized||jsonb_build_array(jsonb_build_object('product_id',p.id,'name',p.name,'sku',p.sku,'quantity',qty));
 END LOOP;
 UPDATE feature_bookings SET details=coalesce(details,'{}'::jsonb)||jsonb_build_object('addon_inventory_claimed',true,'addon_inventory_restored',false,'addon_inventory',normalized),updated_at=now() WHERE id=b.id RETURNING * INTO b;
 RETURN to_jsonb(b);
END $$;

CREATE OR REPLACE FUNCTION public.restore_cancelled_booking_addons() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE line jsonb; p catalog_products; qty integer;
BEGIN
 IF NEW.status='cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' AND coalesce((NEW.details->>'addon_inventory_claimed')::boolean,false) AND NOT coalesce((NEW.details->>'addon_inventory_restored')::boolean,false) THEN
  FOR line IN SELECT value FROM jsonb_array_elements(coalesce(NEW.details->'addon_inventory','[]'::jsonb)) LOOP
   qty:=greatest(1,(line->>'quantity')::integer);
   SELECT * INTO p FROM catalog_products WHERE id=(line->>'product_id')::uuid AND client_id=NEW.client_id FOR UPDATE;
   IF FOUND AND p.track_inventory THEN UPDATE catalog_products SET stock_quantity=stock_quantity+qty,updated_at=now() WHERE id=p.id RETURNING * INTO p; END IF;
   IF FOUND THEN INSERT INTO inventory_movements(client_id,product_id,booking_id,movement_type,quantity_delta,stock_after,note) VALUES(NEW.client_id,p.id,NEW.id,'return',qty,p.stock_quantity,'Booking cancelled'); END IF;
  END LOOP;
  NEW.details:=NEW.details||jsonb_build_object('addon_inventory_restored',true);
 END IF;
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS restore_cancelled_booking_addons_trigger ON public.feature_bookings;
CREATE TRIGGER restore_cancelled_booking_addons_trigger BEFORE UPDATE OF status ON public.feature_bookings FOR EACH ROW EXECUTE FUNCTION public.restore_cancelled_booking_addons();

REVOKE ALL ON FUNCTION public.claim_booking_addon_inventory(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_booking_addon_inventory(uuid,uuid,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
