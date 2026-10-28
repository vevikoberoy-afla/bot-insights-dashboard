-- Automatic behavioral segmentation plus manual contact assignment.
-- Safe to rerun after 062_customer_360_profiles.sql.

ALTER TABLE public.contact_segments ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.contact_segments ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#2563EB';
ALTER TABLE public.contact_segments ADD COLUMN IF NOT EXISTS segment_type text NOT NULL DEFAULT 'manual';
ALTER TABLE public.contact_segments ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.contact_segments ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.contact_segments ADD CONSTRAINT contact_segments_type_check
    CHECK (segment_type IN ('manual','automatic'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS contact_segments_client_slug_unique
  ON public.contact_segments(client_id, slug);

ALTER TABLE public.contact_segment_members ADD COLUMN IF NOT EXISTS assignment_source text NOT NULL DEFAULT 'manual';
ALTER TABLE public.contact_segment_members ADD COLUMN IF NOT EXISTS behavior_event text;
ALTER TABLE public.contact_segment_members ADD COLUMN IF NOT EXISTS added_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.contact_segment_members ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE public.contact_segment_members ADD CONSTRAINT contact_segment_members_source_check
    CHECK (assignment_source IN ('manual','automatic'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS contact_segment_members_contact_source_idx
  ON public.contact_segment_members(contact_id, assignment_source);

-- Remove permissive legacy read policies left by migration 012. PostgreSQL
-- combines policies with OR, so leaving these in place would bypass tenancy.
DROP POLICY IF EXISTS "Authenticated read contacts" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated read segments" ON public.contact_segments;
DROP POLICY IF EXISTS "Authenticated read segment_members" ON public.contact_segment_members;
DROP POLICY IF EXISTS "Workspace contact segments" ON public.contact_segments;
CREATE POLICY "Workspace contact segments" ON public.contact_segments FOR SELECT TO authenticated
  USING(client_id=auth.uid());
DROP POLICY IF EXISTS "Workspace segment members" ON public.contact_segment_members;
CREATE POLICY "Workspace segment members" ON public.contact_segment_members FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.contact_segments s WHERE s.id=segment_id AND s.client_id=auth.uid()));

CREATE OR REPLACE FUNCTION public.set_contact_manual_segment(
  p_client uuid, p_contact_ids uuid[], p_segment uuid DEFAULT NULL, p_mode text DEFAULT 'add'
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_owned integer; v_system boolean; v_updated integer;
BEGIN
  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_client THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_mode NOT IN ('add','move','remove') OR coalesce(array_length(p_contact_ids,1),0)=0 OR array_length(p_contact_ids,1)>1000 THEN RAISE EXCEPTION 'Invalid segment operation'; END IF;
  SELECT count(*) INTO v_owned FROM public.contacts WHERE client_id=p_client AND id=ANY(p_contact_ids);
  IF v_owned <> array_length(p_contact_ids,1) THEN RAISE EXCEPTION 'Contact does not belong to workspace'; END IF;
  IF p_segment IS NOT NULL THEN
    SELECT is_system OR segment_type='automatic' INTO v_system FROM public.contact_segments WHERE id=p_segment AND client_id=p_client;
    IF NOT FOUND THEN RAISE EXCEPTION 'Segment not found'; END IF;
    IF v_system THEN RAISE EXCEPTION 'Automatic segment membership is controlled by customer behavior'; END IF;
  ELSIF p_mode <> 'remove' THEN RAISE EXCEPTION 'Segment is required';
  END IF;
  IF p_mode='move' THEN
    DELETE FROM public.contact_segment_members WHERE contact_id=ANY(p_contact_ids) AND assignment_source='manual';
  ELSIF p_mode='remove' THEN
    DELETE FROM public.contact_segment_members WHERE contact_id=ANY(p_contact_ids) AND assignment_source='manual' AND (p_segment IS NULL OR segment_id=p_segment);
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    RETURN v_updated;
  END IF;
  INSERT INTO public.contact_segment_members(contact_id,segment_id,assignment_source,behavior_event,updated_at)
    SELECT ids.contact_id,p_segment,'manual',NULL,now() FROM unnest(p_contact_ids) AS ids(contact_id)
    ON CONFLICT(contact_id,segment_id) DO UPDATE SET assignment_source='manual',behavior_event=NULL,updated_at=now();
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;
REVOKE ALL ON FUNCTION public.set_contact_manual_segment(uuid,uuid[],uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_contact_manual_segment(uuid,uuid[],uuid,text) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.ensure_behavior_segment(p_client uuid, p_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_id uuid;
  v_name text;
  v_description text;
  v_color text;
BEGIN
  SELECT x.name, x.description, x.color INTO v_name, v_description, v_color
  FROM (VALUES
    ('contact','All Customers','Every identified customer','#64748B'),
    ('booked','Booked Appointments','Customers who created a booking or reservation','#7C3AED'),
    ('repeat_booker','Repeat Bookers','Customers with two or more bookings','#9333EA'),
    ('purchased','Purchased','Customers who placed an order','#059669'),
    ('repeat_customer','Repeat Customers','Customers with two or more orders','#047857'),
    ('support','Support Customers','Customers who raised a support ticket','#EA580C'),
    ('return_request','Return Requests','Customers who requested a return or refund','#DC2626'),
    ('cancelled_order','Cancelled Orders','Customers who cancelled an order','#64748B'),
    ('cancelled_booking','Cancelled Bookings','Customers who cancelled a booking','#64748B')
  ) AS x(key,name,description,color)
  WHERE x.key = p_key;
  IF v_name IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.contact_segments(client_id,name,rules,description,color,segment_type,slug,is_system)
  VALUES(p_client,v_name,jsonb_build_array(jsonb_build_object('behavior',p_key)),v_description,v_color,'automatic',p_key,true)
  ON CONFLICT(client_id,slug) DO UPDATE SET
    name=excluded.name, description=excluded.description, color=excluded.color,
    segment_type='automatic', is_system=true, updated_at=now()
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_behavior_segment(
  p_client uuid, p_contact uuid, p_key text, p_event text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_segment uuid;
BEGIN
  IF p_client IS NULL OR p_contact IS NULL THEN RETURN; END IF;
  v_segment := public.ensure_behavior_segment(p_client,p_key);
  IF v_segment IS NULL THEN RETURN; END IF;
  INSERT INTO public.contact_segment_members(contact_id,segment_id,assignment_source,behavior_event,added_at,updated_at)
  VALUES(p_contact,v_segment,'automatic',coalesce(p_event,p_key),now(),now())
  ON CONFLICT(contact_id,segment_id) DO UPDATE SET
    assignment_source='automatic', behavior_event=excluded.behavior_event, updated_at=now();
END;
$$;

CREATE OR REPLACE FUNCTION public.segment_new_contact() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.assign_behavior_segment(NEW.client_id,NEW.id,'contact','contact_created');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS contacts_auto_segment ON public.contacts;
CREATE TRIGGER contacts_auto_segment AFTER INSERT ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.segment_new_contact();

CREATE OR REPLACE FUNCTION public.segment_booking_behavior() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count integer;
BEGIN
  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;
  PERFORM public.assign_behavior_segment(NEW.client_id,NEW.contact_id,'booked','booking_created');
  IF NEW.status = 'cancelled' THEN
    PERFORM public.assign_behavior_segment(NEW.client_id,NEW.contact_id,'cancelled_booking','booking_cancelled');
  END IF;
  SELECT count(*) INTO v_count FROM public.feature_bookings
    WHERE client_id=NEW.client_id AND contact_id=NEW.contact_id;
  IF v_count >= 2 THEN
    PERFORM public.assign_behavior_segment(NEW.client_id,NEW.contact_id,'repeat_booker','repeat_booking');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS feature_bookings_auto_segment ON public.feature_bookings;
CREATE TRIGGER feature_bookings_auto_segment AFTER INSERT OR UPDATE OF status,contact_id ON public.feature_bookings
FOR EACH ROW EXECUTE FUNCTION public.segment_booking_behavior();

CREATE OR REPLACE FUNCTION public.segment_order_behavior() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count integer;
BEGIN
  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status = 'cancelled' THEN
    PERFORM public.assign_behavior_segment(NEW.client_id,NEW.contact_id,'cancelled_order','order_cancelled');
  ELSE
    PERFORM public.assign_behavior_segment(NEW.client_id,NEW.contact_id,'purchased','order_created');
    SELECT count(*) INTO v_count FROM public.commerce_orders
      WHERE client_id=NEW.client_id AND contact_id=NEW.contact_id AND status <> 'cancelled';
    IF v_count >= 2 THEN
      PERFORM public.assign_behavior_segment(NEW.client_id,NEW.contact_id,'repeat_customer','repeat_purchase');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS commerce_orders_auto_segment ON public.commerce_orders;
CREATE TRIGGER commerce_orders_auto_segment AFTER INSERT OR UPDATE OF status,contact_id ON public.commerce_orders
FOR EACH ROW EXECUTE FUNCTION public.segment_order_behavior();

CREATE OR REPLACE FUNCTION public.segment_ticket_behavior() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.contact_id IS NULL THEN RETURN NEW; END IF;
  PERFORM public.assign_behavior_segment(NEW.client_id,NEW.contact_id,'support','ticket_created');
  IF concat_ws(' ',NEW.subject,NEW.description) ~* '\m(return|refund|exchange)\M' THEN
    PERFORM public.assign_behavior_segment(NEW.client_id,NEW.contact_id,'return_request','return_ticket');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tickets_auto_segment ON public.tickets;
CREATE TRIGGER tickets_auto_segment AFTER INSERT OR UPDATE OF contact_id ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.segment_ticket_behavior();

-- Backfill the behavior of existing contacts and linked records.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id,client_id FROM public.contacts LOOP
    PERFORM public.assign_behavior_segment(r.client_id,r.id,'contact','contact_created');
  END LOOP;
  FOR r IN SELECT client_id,contact_id,count(*) AS total,bool_or(status='cancelled') AS cancelled
           FROM public.feature_bookings WHERE contact_id IS NOT NULL GROUP BY client_id,contact_id LOOP
    PERFORM public.assign_behavior_segment(r.client_id,r.contact_id,'booked','booking_created');
    IF r.total >= 2 THEN PERFORM public.assign_behavior_segment(r.client_id,r.contact_id,'repeat_booker','repeat_booking'); END IF;
    IF r.cancelled THEN PERFORM public.assign_behavior_segment(r.client_id,r.contact_id,'cancelled_booking','booking_cancelled'); END IF;
  END LOOP;
  FOR r IN SELECT client_id,contact_id,count(*) FILTER(WHERE status<>'cancelled') AS total,bool_or(status='cancelled') AS cancelled
           FROM public.commerce_orders WHERE contact_id IS NOT NULL GROUP BY client_id,contact_id LOOP
    IF r.total > 0 THEN PERFORM public.assign_behavior_segment(r.client_id,r.contact_id,'purchased','order_created'); END IF;
    IF r.total >= 2 THEN PERFORM public.assign_behavior_segment(r.client_id,r.contact_id,'repeat_customer','repeat_purchase'); END IF;
    IF r.cancelled THEN PERFORM public.assign_behavior_segment(r.client_id,r.contact_id,'cancelled_order','order_cancelled'); END IF;
  END LOOP;
  FOR r IN SELECT client_id,contact_id,bool_or(concat_ws(' ',subject,description) ~* '\m(return|refund|exchange)\M') AS is_return
           FROM public.tickets WHERE contact_id IS NOT NULL GROUP BY client_id,contact_id LOOP
    PERFORM public.assign_behavior_segment(r.client_id,r.contact_id,'support','ticket_created');
    IF r.is_return THEN PERFORM public.assign_behavior_segment(r.client_id,r.contact_id,'return_request','return_ticket'); END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
