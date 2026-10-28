-- Apply after 050_ticketing_system.sql. Existing marketing campaigns are untouched.
CREATE TABLE IF NOT EXISTS public.booking_services (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id),
 name text NOT NULL, description text NOT NULL DEFAULT '', timezone text NOT NULL DEFAULT 'Asia/Kolkata',
 duration_min integer NOT NULL DEFAULT 30 CHECK(duration_min BETWEEN 5 AND 480),
 buffer_min integer NOT NULL DEFAULT 0 CHECK(buffer_min BETWEEN 0 AND 240),
 capacity integer NOT NULL DEFAULT 1 CHECK(capacity BETWEEN 1 AND 1000),
 notice_hours integer NOT NULL DEFAULT 2 CHECK(notice_hours BETWEEN 0 AND 720),
 cancellation_hours integer NOT NULL DEFAULT 2 CHECK(cancellation_hours BETWEEN 0 AND 720),
 working_hours jsonb NOT NULL DEFAULT '{"1":[["09:00","17:00"]],"2":[["09:00","17:00"]],"3":[["09:00","17:00"]],"4":[["09:00","17:00"]],"5":[["09:00","17:00"]]}',
 blackout_dates jsonb NOT NULL DEFAULT '[]', is_active boolean NOT NULL DEFAULT false,
 confirmation_email boolean NOT NULL DEFAULT false, reminder_minutes integer[] NOT NULL DEFAULT '{1440,60}',
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,client_id)
);
CREATE TABLE IF NOT EXISTS public.booking_offers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id),
 name text NOT NULL, description text NOT NULL DEFAULT '', quantity integer NOT NULL CHECK(quantity >= 0),
 max_per_customer integer NOT NULL DEFAULT 1 CHECK(max_per_customer BETWEEN 1 AND 1000),
 displayed_claimed_override integer CHECK(displayed_claimed_override >= 0),
 price numeric CHECK(price >= 0), currency text NOT NULL DEFAULT 'INR',
 service_id uuid, waitlist_enabled boolean NOT NULL DEFAULT true,
 start_at timestamptz NOT NULL, end_at timestamptz NOT NULL CHECK(end_at > start_at),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','paused','ended')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,client_id),
 FOREIGN KEY(service_id,client_id) REFERENCES public.booking_services(id,client_id)
);
CREATE TABLE IF NOT EXISTS public.feature_bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id),
 reference text NOT NULL UNIQUE DEFAULT ('BKG-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,12))),
 service_id uuid, offer_id uuid, customer_name text NOT NULL, customer_email text,
 customer_phone text, channel text NOT NULL DEFAULT 'web', quantity integer NOT NULL DEFAULT 1 CHECK(quantity > 0),
 slot_start timestamptz, slot_end timestamptz,
 status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled','completed','no_show','waitlisted')),
 payment_status text NOT NULL DEFAULT 'not_required', payment_ref text,
 idempotency_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(client_id,idempotency_key),
 FOREIGN KEY(service_id,client_id) REFERENCES public.booking_services(id,client_id),
 FOREIGN KEY(offer_id,client_id) REFERENCES public.booking_offers(id,client_id),
 CHECK(service_id IS NOT NULL OR offer_id IS NOT NULL),
 CHECK((service_id IS NULL AND slot_start IS NULL AND slot_end IS NULL) OR (service_id IS NOT NULL AND slot_end > slot_start))
);
CREATE INDEX IF NOT EXISTS idx_feature_bookings_client_service_slot ON public.feature_bookings(client_id,service_id,slot_start);
CREATE INDEX IF NOT EXISTS idx_feature_bookings_client_offer_email ON public.feature_bookings(client_id,offer_id,customer_email);
CREATE TABLE IF NOT EXISTS public.booking_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id),
 booking_id uuid REFERENCES public.feature_bookings(id), action text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.booking_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id),
 booking_id uuid NOT NULL REFERENCES public.feature_bookings(id), kind text NOT NULL,
 due_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0, last_error text, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(booking_id,kind,due_at)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['booking_services','booking_offers','feature_bookings','booking_events','booking_notifications'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS tenant_read ON public.%I',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(client_id=auth.uid())',t);
 END LOOP;
END $$;

-- Ask Supabase PostgREST to expose newly created relations immediately.
NOTIFY pgrst, 'reload schema';

-- All writers serialize on the service/offer rows, including reschedules and cancellations.
CREATE OR REPLACE FUNCTION public.reserve_feature_booking(p_client uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s booking_services; o booking_offers; b feature_bookings; n integer; used integer;
 start_time timestamptz; end_time timestamptz; email text; phone text; sid uuid; oid uuid;
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
  IF used+n>o.quantity THEN
   IF NOT o.waitlist_enabled OR coalesce((p_input->>'waitlist')::boolean,false)=false THEN RAISE EXCEPTION 'Offer exhausted'; END IF;
  END IF;
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
  SELECT coalesce(sum(quantity),0) INTO n FROM feature_bookings WHERE service_id=sid AND status='confirmed'
   AND slot_start<end_time+make_interval(mins=>s.buffer_min) AND slot_end+make_interval(mins=>s.buffer_min)>start_time;
  IF n+(p_input->>'quantity')::integer>s.capacity THEN RAISE EXCEPTION 'Slot is full'; END IF;
  n := (p_input->>'quantity')::integer;
 END IF;
 INSERT INTO feature_bookings(client_id,service_id,offer_id,customer_name,customer_email,customer_phone,channel,quantity,slot_start,slot_end,idempotency_key,status)
 VALUES(p_client,sid,oid,p_input->>'customer_name',email,phone,coalesce(p_input->>'channel','web'),n,start_time,end_time,p_input->>'idempotency_key',
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

CREATE OR REPLACE FUNCTION public.change_feature_booking(p_client uuid,p_id uuid,p_status text,p_start timestamptz DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b feature_bookings; s booking_services; replacement jsonb;
BEGIN
 SELECT * INTO b FROM feature_bookings WHERE id=p_id AND client_id=p_client;
 IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
 IF b.offer_id IS NOT NULL THEN PERFORM 1 FROM booking_offers WHERE id=b.offer_id FOR UPDATE; END IF;
 IF b.service_id IS NOT NULL THEN SELECT * INTO s FROM booking_services WHERE id=b.service_id FOR UPDATE; END IF;
 SELECT * INTO b FROM feature_bookings WHERE id=p_id AND client_id=p_client FOR UPDATE;
 IF b.status NOT IN ('confirmed','waitlisted') THEN RAISE EXCEPTION 'Booking is already finalized'; END IF;
 IF p_start IS NOT NULL OR p_status='cancelled' THEN
  IF b.slot_start IS NOT NULL AND b.slot_start<now()+make_interval(hours=>s.cancellation_hours) THEN RAISE EXCEPTION 'Change deadline has passed'; END IF;
 END IF;
 IF p_start IS NOT NULL THEN
  IF b.status<>'confirmed' OR b.service_id IS NULL THEN RAISE EXCEPTION 'Booking cannot be rescheduled'; END IF;
  -- Reuse the same capacity/working-hours checks in one transaction, then retain the original reference.
  UPDATE feature_bookings SET status='cancelled' WHERE id=b.id;
  replacement := reserve_feature_booking(p_client,to_jsonb(b)||jsonb_build_object('slot_start',p_start,'idempotency_key','reschedule:'||gen_random_uuid()::text));
  DELETE FROM booking_notifications WHERE booking_id=(replacement->>'id')::uuid;
  DELETE FROM booking_events WHERE booking_id=(replacement->>'id')::uuid;
  DELETE FROM feature_bookings WHERE id=(replacement->>'id')::uuid;
  UPDATE feature_bookings SET status='confirmed',slot_start=p_start,slot_end=(replacement->>'slot_end')::timestamptz,updated_at=now() WHERE id=b.id RETURNING * INTO b;
 ELSE
  IF p_status NOT IN ('cancelled','completed','no_show') THEN RAISE EXCEPTION 'Invalid transition'; END IF;
  IF p_status IN ('completed','no_show') AND (b.status<>'confirmed' OR b.slot_start>now()) THEN RAISE EXCEPTION 'Appointment has not started'; END IF;
  UPDATE feature_bookings SET status=p_status,updated_at=now() WHERE id=b.id RETURNING * INTO b;
 END IF;
 UPDATE booking_notifications SET status='cancelled',updated_at=now() WHERE booking_id=b.id AND status IN ('pending','failed');
 IF s.confirmation_email THEN
  INSERT INTO booking_notifications(client_id,booking_id,kind,due_at) VALUES(p_client,b.id,CASE WHEN p_start IS NULL THEN p_status ELSE 'reschedule' END,now());
  IF p_start IS NOT NULL THEN
   INSERT INTO booking_notifications(client_id,booking_id,kind,due_at)
    SELECT p_client,b.id,'reminder',p_start-make_interval(mins=>m) FROM unnest(s.reminder_minutes) m WHERE p_start-make_interval(mins=>m)>now() ON CONFLICT DO NOTHING;
  END IF;
 END IF;
 INSERT INTO booking_events(client_id,booking_id,action,details) VALUES(p_client,b.id,CASE WHEN p_start IS NULL THEN p_status ELSE 'rescheduled' END,jsonb_build_object('slot_start',b.slot_start));
 RETURN to_jsonb(b);
END $$;
REVOKE ALL ON FUNCTION public.change_feature_booking(uuid,uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.change_feature_booking(uuid,uuid,text,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.audit_booking_configuration() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
DECLARE claimed integer;
BEGIN
 IF TG_TABLE_NAME='booking_offers' AND TG_OP='UPDATE' THEN
  SELECT coalesce(sum(quantity),0) INTO claimed FROM feature_bookings WHERE offer_id=NEW.id AND status IN ('confirmed','completed','no_show');
  IF NEW.quantity<claimed THEN RAISE EXCEPTION 'Stock cannot be lower than existing claims (%)',claimed; END IF;
 END IF;
 INSERT INTO booking_events(client_id,action,details) VALUES(NEW.client_id,TG_TABLE_NAME||'_'||lower(TG_OP),jsonb_build_object('id',NEW.id,'before',CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END,'after',to_jsonb(NEW)));
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS booking_service_audit ON booking_services;
DROP TRIGGER IF EXISTS booking_offer_audit ON booking_offers;
CREATE TRIGGER booking_service_audit AFTER INSERT OR UPDATE ON booking_services FOR EACH ROW EXECUTE FUNCTION audit_booking_configuration();
CREATE TRIGGER booking_offer_audit AFTER INSERT OR UPDATE ON booking_offers FOR EACH ROW EXECUTE FUNCTION audit_booking_configuration();

DO $$ BEGIN
 IF to_regclass('public.booking_offer_stats') IS NULL THEN
  EXECUTE $view$CREATE VIEW public.booking_offer_stats WITH (security_invoker=true) AS
   SELECT o.*,coalesce(c.claimed,0)::integer AS claimed, greatest(0,o.quantity-coalesce(c.claimed,0))::integer AS remaining,
   coalesce(c.waitlisted,0)::integer AS waitlisted
   FROM booking_offers o LEFT JOIN (
    SELECT offer_id,sum(quantity) FILTER(WHERE status IN ('confirmed','completed','no_show')) AS claimed,
     sum(quantity) FILTER(WHERE status='waitlisted') AS waitlisted FROM feature_bookings GROUP BY offer_id
   ) c ON c.offer_id=o.id$view$;
 END IF;
END $$;
