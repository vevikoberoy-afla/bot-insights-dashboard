-- Atomic coupon support for chatbot catalogue checkout.
-- Apply after 059_chatbot_commerce_checkout.sql. Safe to run repeatedly.
ALTER TABLE public.commerce_orders ADD COLUMN IF NOT EXISTS coupon_code text;
ALTER TABLE public.commerce_orders ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK(discount_amount>=0);

CREATE OR REPLACE FUNCTION public.place_catalog_order(p_client uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
 o commerce_orders; line jsonb; p catalog_products; h commerce_holds;
 qty integer; amount numeric:=0; discount numeric:=0; offer booking_offers; coupon coupons;
 claimed integer; customer_claimed integer; cart_qty integer; first_currency text; email_domain text;
BEGIN
 IF length(trim(p_input->>'customer_name'))<2 OR lower(p_input->>'customer_email') NOT LIKE '%@%' THEN RAISE EXCEPTION 'Customer name and email are required'; END IF;
 SELECT * INTO o FROM commerce_orders WHERE client_id=p_client AND idempotency_key=p_input->>'idempotency_key';
 IF FOUND THEN RETURN to_jsonb(o); END IF;
 IF jsonb_array_length(coalesce(p_input->'items','[]'))<1 THEN RAISE EXCEPTION 'Cart is empty'; END IF;

 FOR line IN SELECT jsonb_build_object('product_id',x->>'product_id','quantity',sum((x->>'quantity')::integer)) FROM jsonb_array_elements(p_input->'items') x GROUP BY x->>'product_id' ORDER BY x->>'product_id' LOOP
  qty:=(line->>'quantity')::integer;
  IF qty<1 OR qty>1000 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
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

 IF nullif(p_input->>'coupon_id','') IS NOT NULL THEN
  SELECT * INTO coupon FROM coupons WHERE id=(p_input->>'coupon_id')::uuid AND client_id=p_client AND is_active=true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Coupon is unavailable'; END IF;
  IF amount<coalesce(coupon.min_cart_value,0) THEN RAISE EXCEPTION 'Coupon minimum cart value is not met'; END IF;
  IF coupon.discount_type='percentage' THEN discount:=amount*least(100,greatest(0,coupon.discount_value))/100;
  ELSIF coupon.discount_type='fixed' THEN discount:=greatest(0,coupon.discount_value);
  ELSE RAISE EXCEPTION 'Unsupported coupon type'; END IF;
  discount:=least(amount,round(discount,2));
 END IF;

 INSERT INTO commerce_orders(client_id,customer_name,customer_email,customer_phone,channel,subtotal,total,currency,offer_id,coupon_code,discount_amount,shipping_address,idempotency_key)
 VALUES(p_client,trim(p_input->>'customer_name'),lower(trim(p_input->>'customer_email')),p_input->>'customer_phone',coalesce(p_input->>'channel','web'),amount,amount-discount,coalesce(first_currency,'INR'),nullif(p_input->>'offer_id','')::uuid,coupon.code,discount,coalesce(p_input->'shipping_address','{}'),p_input->>'idempotency_key') RETURNING * INTO o;

 FOR line IN SELECT jsonb_build_object('product_id',x->>'product_id','quantity',sum((x->>'quantity')::integer)) FROM jsonb_array_elements(p_input->'items') x GROUP BY x->>'product_id' ORDER BY x->>'product_id' LOOP
  qty:=(line->>'quantity')::integer;
  SELECT * INTO p FROM catalog_products WHERE id=(line->>'product_id')::uuid FOR UPDATE;
  INSERT INTO commerce_order_items(order_id,product_id,sku,name,quantity,unit_price) VALUES(o.id,p.id,p.sku,p.name,qty,CASE WHEN offer.id IS NOT NULL AND offer.product_id=p.id AND offer.price IS NOT NULL THEN offer.price ELSE p.price END);
  IF p.track_inventory THEN UPDATE catalog_products SET stock_quantity=stock_quantity-qty,updated_at=now() WHERE id=p.id RETURNING * INTO p; END IF;
  INSERT INTO inventory_movements(client_id,product_id,order_id,movement_type,quantity_delta,stock_after,note) VALUES(p_client,p.id,o.id,'sale',-qty,p.stock_quantity,o.reference);
  UPDATE commerce_holds SET status='consumed' WHERE client_id=p_client AND product_id=p.id AND session_key=p_input->>'hold_key';
 END LOOP;

 IF o.customer_email NOT LIKE '%@order.invalid' THEN INSERT INTO automation_deliveries(client_id,entity_type,entity_id,event_type,channel,destination,payload) VALUES(p_client,'order',o.id,'receipt','email',o.customer_email,jsonb_build_object('reference',o.reference,'receipt_number',o.receipt_number)); END IF;
 IF nullif(o.customer_phone,'') IS NOT NULL THEN INSERT INTO automation_deliveries(client_id,entity_type,entity_id,event_type,channel,destination,payload) VALUES(p_client,'order',o.id,'receipt','whatsapp',o.customer_phone,jsonb_build_object('reference',o.reference,'receipt_number',o.receipt_number)); END IF;
 RETURN to_jsonb(o);
END $$;

REVOKE ALL ON FUNCTION public.place_catalog_order(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.place_catalog_order(uuid,jsonb) TO service_role;
