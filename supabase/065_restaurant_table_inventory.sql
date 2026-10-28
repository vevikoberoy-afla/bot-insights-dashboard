-- Restaurant-grade table inventory and atomic table assignment.
-- Apply after 064_contact_auto_segmentation.sql. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.booking_table_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  service_id uuid NOT NULL,
  booking_id uuid NOT NULL REFERENCES public.feature_bookings(id) ON DELETE CASCADE,
  table_id text NOT NULL,
  table_name text NOT NULL,
  area text NOT NULL DEFAULT 'Main dining',
  seats integer NOT NULL CHECK (seats > 0),
  occupied_start timestamptz NOT NULL,
  occupied_end timestamptz NOT NULL CHECK (occupied_end > occupied_start),
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(booking_id,table_id)
);
CREATE INDEX IF NOT EXISTS idx_booking_table_assignment_availability
  ON public.booking_table_assignments(client_id,service_id,table_id,occupied_start,occupied_end)
  WHERE released_at IS NULL;
ALTER TABLE public.booking_table_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON public.booking_table_assignments;
CREATE POLICY tenant_read ON public.booking_table_assignments FOR SELECT TO authenticated USING(client_id=auth.uid());

CREATE OR REPLACE FUNCTION public.allocate_restaurant_tables(
  p_client uuid,p_booking uuid,p_input jsonb,p_allow_waitlist boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  b feature_bookings; s booking_services; restaurant jsonb; table_row jsonb; chosen jsonb[]:=ARRAY[]::jsonb[];
  chosen_group text; party integer; duration integer; max_combine integer; seats integer:=0; table_count integer:=0;
  location_id text; start_time timestamptz; end_time timestamptz; occupied_from timestamptz; occupied_until timestamptz;
  table_ids text[]; table_names text[]; table_areas text[];
BEGIN
  SELECT * INTO b FROM feature_bookings WHERE id=p_booking AND client_id=p_client FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  SELECT * INTO s FROM booking_services WHERE id=b.service_id AND client_id=p_client FOR UPDATE;
  restaurant:=coalesce(s.configuration->'restaurant','{}'::jsonb);
  IF coalesce((restaurant->>'enabled')::boolean,false)=false THEN RETURN to_jsonb(b); END IF;
  party:=b.quantity; start_time:=b.slot_start;
  SELECT coalesce((rule->>'duration_min')::integer,s.duration_min) INTO duration
  FROM jsonb_array_elements(coalesce(restaurant->'turn_times','[]'::jsonb)) rule
  WHERE (rule->>'max_party')::integer>=party ORDER BY (rule->>'max_party')::integer LIMIT 1;
  duration:=coalesce(duration,s.duration_min); end_time:=start_time+make_interval(mins=>duration);
  occupied_from:=start_time-make_interval(mins=>s.buffer_min); occupied_until:=end_time+make_interval(mins=>s.buffer_min);
  max_combine:=greatest(1,least(8,coalesce((restaurant->>'max_combined_tables')::integer,2)));
  location_id:=nullif(coalesce(p_input#>>'{details,location_id}',p_input->>'location_id',b.details->>'location_id'),'');
  PERFORM pg_advisory_xact_lock(hashtextextended(p_client::text||':'||s.id::text,0));

  -- A single best-fit table is preferred to avoid wasting larger tables.
  SELECT value INTO table_row FROM jsonb_array_elements(coalesce(restaurant->'tables','[]'::jsonb))
  WHERE coalesce((value->>'active')::boolean,true)
    AND (location_id IS NULL OR nullif(value->>'location_id','') IS NULL OR value->>'location_id'=location_id)
    AND party BETWEEN coalesce((value->>'min_party')::integer,1) AND coalesce((value->>'max_party')::integer,1)
    AND NOT EXISTS (SELECT 1 FROM booking_table_assignments a WHERE a.client_id=p_client AND a.service_id=s.id
      AND a.table_id=value->>'id' AND a.released_at IS NULL AND a.occupied_start<occupied_until AND a.occupied_end>occupied_from)
  ORDER BY coalesce((value->>'max_party')::integer,1)-party,coalesce((value->>'max_party')::integer,1) LIMIT 1;
  IF table_row IS NOT NULL THEN chosen:=array_append(chosen,table_row);seats:=coalesce((table_row->>'max_party')::integer,1); END IF;

  -- Otherwise choose the smallest viable combination group, then take tables
  -- largest-first until the party fits. Only explicitly grouped tables combine.
  IF cardinality(chosen)=0 THEN
    SELECT group_name INTO chosen_group FROM (
      SELECT group_name,sum(max_party) FILTER(WHERE rank_in_group<=max_combine) AS combinable_seats
      FROM (
        SELECT value->>'combine_group' AS group_name,coalesce((value->>'max_party')::integer,1) AS max_party,
          row_number() OVER(PARTITION BY value->>'combine_group' ORDER BY coalesce((value->>'max_party')::integer,1) DESC) AS rank_in_group
        FROM jsonb_array_elements(coalesce(restaurant->'tables','[]'::jsonb))
        WHERE coalesce((value->>'active')::boolean,true) AND nullif(value->>'combine_group','') IS NOT NULL
          AND (location_id IS NULL OR nullif(value->>'location_id','') IS NULL OR value->>'location_id'=location_id)
          AND NOT EXISTS (SELECT 1 FROM booking_table_assignments a WHERE a.client_id=p_client AND a.service_id=s.id
            AND a.table_id=value->>'id' AND a.released_at IS NULL AND a.occupied_start<occupied_until AND a.occupied_end>occupied_from)
      ) ranked GROUP BY group_name
    ) candidates WHERE combinable_seats>=party ORDER BY combinable_seats LIMIT 1;
    IF chosen_group IS NOT NULL THEN
      FOR table_row IN SELECT value FROM jsonb_array_elements(coalesce(restaurant->'tables','[]'::jsonb))
        WHERE coalesce((value->>'active')::boolean,true) AND value->>'combine_group'=chosen_group
          AND (location_id IS NULL OR nullif(value->>'location_id','') IS NULL OR value->>'location_id'=location_id)
          AND NOT EXISTS (SELECT 1 FROM booking_table_assignments a WHERE a.client_id=p_client AND a.service_id=s.id
            AND a.table_id=value->>'id' AND a.released_at IS NULL AND a.occupied_start<occupied_until AND a.occupied_end>occupied_from)
        ORDER BY coalesce((value->>'max_party')::integer,1) DESC
      LOOP
        EXIT WHEN seats>=party OR table_count>=max_combine;
        chosen:=array_append(chosen,table_row);seats:=seats+coalesce((table_row->>'max_party')::integer,1);table_count:=table_count+1;
      END LOOP;
    END IF;
  END IF;

  IF cardinality(chosen)=0 OR seats<party THEN
    IF p_allow_waitlist THEN
      UPDATE feature_bookings SET status='waitlisted',slot_end=end_time,
        details=coalesce(details,'{}'::jsonb)||coalesce(p_input->'details','{}'::jsonb)||jsonb_build_object('assignment_status','waitlisted','turn_time_min',duration),updated_at=now()
      WHERE id=b.id RETURNING * INTO b;
      DELETE FROM booking_notifications WHERE booking_id=b.id AND status='pending';
      INSERT INTO booking_events(client_id,booking_id,action,details) VALUES(p_client,b.id,'waitlisted_no_table',jsonb_build_object('party_size',party,'location_id',location_id));
      RETURN to_jsonb(b);
    END IF;
    RAISE EXCEPTION 'No table combination is available for this party size';
  END IF;

  SELECT array_agg(item->>'id'),array_agg(item->>'name'),array_agg(coalesce(item->>'area','Main dining'))
    INTO table_ids,table_names,table_areas FROM unnest(chosen) item;
  FOREACH table_row IN ARRAY chosen LOOP
    INSERT INTO booking_table_assignments(client_id,service_id,booking_id,table_id,table_name,area,seats,occupied_start,occupied_end)
    VALUES(p_client,s.id,b.id,table_row->>'id',table_row->>'name',coalesce(table_row->>'area','Main dining'),coalesce((table_row->>'max_party')::integer,1),occupied_from,occupied_until);
  END LOOP;
  UPDATE feature_bookings SET slot_end=end_time,status='confirmed',details=coalesce(details,'{}'::jsonb)||coalesce(p_input->'details','{}'::jsonb)||jsonb_build_object(
    'assignment_status','assigned','table_ids',to_jsonb(table_ids),'table_names',to_jsonb(table_names),'table_areas',to_jsonb(table_areas),'assigned_seats',seats,'turn_time_min',duration
  ),updated_at=now() WHERE id=b.id RETURNING * INTO b;
  RETURN to_jsonb(b);
END $$;

CREATE OR REPLACE FUNCTION public.reserve_restaurant_booking(p_client uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; booking_id uuid;
BEGIN
  result:=reserve_feature_booking(p_client,p_input);booking_id:=(result->>'id')::uuid;
  IF result->>'status'='waitlisted' THEN RETURN result; END IF;
  RETURN allocate_restaurant_tables(p_client,booking_id,p_input,coalesce((p_input->>'waitlist')::boolean,false));
END $$;

CREATE OR REPLACE FUNCTION public.reschedule_restaurant_booking(p_client uuid,p_id uuid,p_start timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b feature_bookings;s booking_services;result jsonb;
BEGIN
  SELECT * INTO b FROM feature_bookings WHERE id=p_id AND client_id=p_client FOR UPDATE;
  IF NOT FOUND OR b.status<>'confirmed' THEN RAISE EXCEPTION 'Booking cannot be rescheduled'; END IF;
  SELECT * INTO s FROM booking_services WHERE id=b.service_id AND client_id=p_client FOR UPDATE;
  IF p_start<now()+make_interval(hours=>s.notice_hours) OR b.slot_start<now()+make_interval(hours=>s.cancellation_hours) THEN RAISE EXCEPTION 'Change deadline has passed'; END IF;
  UPDATE booking_table_assignments SET released_at=now() WHERE booking_id=b.id AND released_at IS NULL;
  UPDATE feature_bookings SET slot_start=p_start,slot_end=p_start+make_interval(mins=>s.duration_min),updated_at=now() WHERE id=b.id;
  result:=allocate_restaurant_tables(p_client,b.id,jsonb_build_object('details',b.details),false);
  UPDATE booking_notifications SET status='cancelled',updated_at=now() WHERE booking_id=b.id AND status IN ('pending','failed');
  INSERT INTO booking_events(client_id,booking_id,action,details) VALUES(p_client,b.id,'rescheduled',jsonb_build_object('slot_start',p_start,'table_names',result#>'{details,table_names}'));
  RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.release_restaurant_tables() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.status='cancelled' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE booking_table_assignments SET released_at=now() WHERE booking_id=NEW.id AND released_at IS NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS release_restaurant_tables_on_cancel ON public.feature_bookings;
CREATE TRIGGER release_restaurant_tables_on_cancel AFTER UPDATE OF status ON public.feature_bookings
FOR EACH ROW EXECUTE FUNCTION public.release_restaurant_tables();

REVOKE ALL ON FUNCTION public.reserve_restaurant_booking(uuid,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.reschedule_restaurant_booking(uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.allocate_restaurant_tables(uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_restaurant_booking(uuid,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_restaurant_booking(uuid,uuid,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.allocate_restaurant_tables(uuid,uuid,jsonb,boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
