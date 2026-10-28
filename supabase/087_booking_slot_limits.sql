-- Enforce the dashboard's per-time-period booking limit inside the same
-- serialized transaction that enforces seat capacity. Configuration stays in
-- booking_services.configuration, so no table rewrite is required.
CREATE OR REPLACE FUNCTION public.reserve_feature_booking(p_client uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s booking_services; o booking_offers; b feature_bookings; n integer; used integer;
 start_time timestamptz; end_time timestamptz; email text; phone text; sid uuid; oid uuid;
 booking_count integer; booking_limit integer;
BEGIN
 sid := nullif(p_input->>'service_id','')::uuid; oid := nullif(p_input->>'offer_id','')::uuid;
 email := nullif(lower(trim(p_input->>'customer_email')),''); phone := nullif(trim(p_input->>'customer_phone'),''); n := (p_input->>'quantity')::integer;
 IF n IS NULL OR n < 1 OR n > 1000 OR nullif(trim(p_input->>'customer_name'),'') IS NULL OR (email IS NULL AND phone IS NULL) OR (email IS NOT NULL AND email NOT LIKE '%@%') THEN RAISE EXCEPTION 'Invalid customer or quantity'; END IF;
 IF oid IS NOT NULL THEN
  SELECT * INTO o FROM booking_offers WHERE id=oid AND client_id=p_client FOR UPDATE;
  IF NOT FOUND OR o.status <> 'active' OR now()<o.start_at OR now()>=o.end_at THEN RAISE EXCEPTION 'Offer is not active'; END IF;
  IF o.service_id IS DISTINCT FROM sid THEN RAISE EXCEPTION 'Offer service mismatch'; END IF;
 END IF;
 IF sid IS NOT NULL THEN
  SELECT * INTO s FROM booking_services WHERE id=sid AND client_id=p_client FOR UPDATE;
  IF NOT FOUND OR NOT s.is_active THEN RAISE EXCEPTION 'Service is not active'; END IF;
 END IF;
 SELECT * INTO b FROM feature_bookings WHERE client_id=p_client AND idempotency_key=p_input->>'idempotency_key';
 IF FOUND THEN RETURN to_jsonb(b); END IF;
 IF oid IS NOT NULL THEN
  SELECT coalesce(sum(quantity),0) INTO used FROM feature_bookings WHERE offer_id=oid AND status IN ('confirmed','completed','no_show');
  IF used+n>o.quantity AND (NOT o.waitlist_enabled OR coalesce((p_input->>'waitlist')::boolean,false)=false) THEN RAISE EXCEPTION 'Offer exhausted'; END IF;
  SELECT coalesce(sum(quantity),0) INTO n FROM feature_bookings WHERE offer_id=oid AND status<>'cancelled' AND ((email IS NOT NULL AND customer_email=email) OR (email IS NULL AND regexp_replace(coalesce(customer_phone,''),'[^0-9]','','g')=regexp_replace(phone,'[^0-9]','','g')));
  IF n+(p_input->>'quantity')::integer>o.max_per_customer THEN RAISE EXCEPTION 'Customer claim limit reached'; END IF;
  n := (p_input->>'quantity')::integer;
 END IF;
 IF sid IS NOT NULL THEN
  start_time := (p_input->>'slot_start')::timestamptz; end_time := start_time+make_interval(mins=>s.duration_min);
  IF start_time IS NULL OR start_time<now()+make_interval(hours=>s.notice_hours) THEN RAISE EXCEPTION 'Slot is too soon'; END IF;
  IF s.blackout_dates ? to_char(start_time AT TIME ZONE s.timezone,'YYYY-MM-DD') OR NOT EXISTS (
   SELECT 1 FROM jsonb_array_elements(s.working_hours->extract(dow FROM start_time AT TIME ZONE s.timezone)::integer::text) r
   WHERE (start_time AT TIME ZONE s.timezone)::time >= (r->>0)::time
   AND (end_time AT TIME ZONE s.timezone)::date=(start_time AT TIME ZONE s.timezone)::date
   AND (end_time AT TIME ZONE s.timezone)::time <= (r->>1)::time
  ) THEN RAISE EXCEPTION 'Slot outside working hours'; END IF;
  SELECT coalesce(sum(quantity),0),count(*) INTO n,booking_count FROM feature_bookings WHERE service_id=sid AND status='confirmed'
   AND slot_start<end_time+make_interval(mins=>s.buffer_min) AND slot_end+make_interval(mins=>s.buffer_min)>start_time;
  booking_limit := greatest(1,coalesce(nullif(s.configuration->>'slots_per_interval','')::integer,s.capacity,1));
  IF n+(p_input->>'quantity')::integer>s.capacity OR booking_count>=booking_limit THEN RAISE EXCEPTION 'Slot is full'; END IF;
  n := (p_input->>'quantity')::integer;
 END IF;
 INSERT INTO feature_bookings(client_id,service_id,offer_id,customer_name,customer_email,customer_phone,channel,quantity,slot_start,slot_end,idempotency_key,status)
 VALUES(p_client,sid,oid,trim(p_input->>'customer_name'),email,phone,coalesce(p_input->>'channel','web'),n,start_time,end_time,p_input->>'idempotency_key',
 CASE WHEN oid IS NOT NULL AND used+n>o.quantity THEN 'waitlisted' ELSE 'confirmed' END) RETURNING * INTO b;
 INSERT INTO booking_events(client_id,booking_id,action) VALUES(p_client,b.id,b.status);
 IF sid IS NOT NULL AND s.confirmation_email AND b.status='confirmed' THEN
  INSERT INTO booking_notifications(client_id,booking_id,kind,due_at) VALUES(p_client,b.id,'confirmation',now());
  INSERT INTO booking_notifications(client_id,booking_id,kind,due_at)
   SELECT p_client,b.id,'reminder',start_time-make_interval(mins=>m) FROM unnest(s.reminder_minutes) m WHERE start_time-make_interval(mins=>m)>now() ON CONFLICT DO NOTHING;
 END IF;
 RETURN to_jsonb(b);
END $$;

REVOKE ALL ON FUNCTION public.reserve_feature_booking(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_feature_booking(uuid,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
