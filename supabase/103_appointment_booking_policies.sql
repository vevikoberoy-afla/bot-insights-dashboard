-- Launch-level appointment scheduling policies.
-- Apply after 051, 057 and 098. Configuration remains in booking_services.configuration
-- so existing APIs and cached booking bundles stay backwards compatible.
BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_booking_service_policy() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 service public.booking_services;
 local_start timestamp;
 local_end timestamp;
 local_date date;
 today_local date;
 booking_window integer;
 daily_limit integer;
 daily_count integer;
 override jsonb;
BEGIN
 IF NEW.service_id IS NULL OR NEW.slot_start IS NULL OR NEW.status<>'confirmed' THEN RETURN NEW; END IF;
 SELECT * INTO service FROM public.booking_services WHERE id=NEW.service_id AND client_id=NEW.client_id FOR UPDATE;
 IF NOT FOUND OR NOT service.is_active THEN RAISE EXCEPTION 'SERVICE_NOT_BOOKABLE'; END IF;

 local_start:=NEW.slot_start AT TIME ZONE service.timezone;
 local_end:=NEW.slot_end AT TIME ZONE service.timezone;
 local_date:=local_start::date;
 today_local:=(now() AT TIME ZONE service.timezone)::date;
 booking_window:=CASE WHEN jsonb_typeof(service.configuration->'booking_window_days')='number' THEN greatest(1,least(730,(service.configuration->>'booking_window_days')::integer)) ELSE 90 END;
 daily_limit:=CASE WHEN jsonb_typeof(service.configuration->'max_bookings_per_day')='number' THEN greatest(0,least(10000,(service.configuration->>'max_bookings_per_day')::integer)) ELSE 0 END;

 IF local_date<today_local OR local_date>today_local+booking_window THEN RAISE EXCEPTION 'BOOKING_OUTSIDE_ADVANCE_WINDOW'; END IF;

 SELECT item INTO override
 FROM jsonb_array_elements(coalesce(service.configuration->'availability_overrides','[]'::jsonb)) item
 WHERE item->>'date'=to_char(local_date,'YYYY-MM-DD') LIMIT 1;
 IF override IS NOT NULL THEN
  IF coalesce((override->>'closed')::boolean,false) THEN RAISE EXCEPTION 'BOOKING_DATE_CLOSED'; END IF;
  IF jsonb_array_length(coalesce(override->'ranges','[]'::jsonb))>0 AND NOT EXISTS(
   SELECT 1 FROM jsonb_array_elements(override->'ranges') range
   WHERE local_start::time >= (range->>0)::time AND local_end::date=local_start::date AND local_end::time <= (range->>1)::time
  ) THEN RAISE EXCEPTION 'BOOKING_OUTSIDE_DATE_OVERRIDE'; END IF;
 END IF;

 IF daily_limit>0 THEN
  SELECT count(*) INTO daily_count FROM public.feature_bookings booking
  WHERE booking.client_id=NEW.client_id AND booking.service_id=NEW.service_id AND booking.status='confirmed'
   AND booking.id IS DISTINCT FROM NEW.id
   AND (booking.slot_start AT TIME ZONE service.timezone)::date=local_date;
  IF daily_count>=daily_limit THEN RAISE EXCEPTION 'DAILY_BOOKING_LIMIT_REACHED'; END IF;
 END IF;
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS feature_booking_service_policy ON public.feature_bookings;
CREATE TRIGGER feature_booking_service_policy
BEFORE INSERT OR UPDATE OF service_id,slot_start,slot_end,status ON public.feature_bookings
FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_service_policy();

REVOKE ALL ON FUNCTION public.enforce_booking_service_policy() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_booking_service_policy() TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
