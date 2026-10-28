-- One bounded occupancy read for every date displayed by the booking card.
-- Service configuration remains in the versioned application bundle cache.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_booking_range_occupancy(
 p_client_id uuid,p_service_id uuid,p_window_start timestamptz,p_window_end timestamptz
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_bookings jsonb;v_assignments jsonb;
BEGIN
 IF p_window_start IS NULL OR p_window_end IS NULL OR p_window_end<=p_window_start OR p_window_end-p_window_start>interval '10 days' THEN RAISE EXCEPTION 'INVALID_OCCUPANCY_WINDOW';END IF;
 IF NOT EXISTS(SELECT 1 FROM booking_services WHERE id=p_service_id AND client_id=p_client_id AND is_active=true) THEN RAISE EXCEPTION 'SERVICE_SCOPE_MISMATCH';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('slot_start',slot_start,'slot_end',slot_end,'quantity',quantity)),'[]'::jsonb)
 INTO v_bookings FROM feature_bookings WHERE client_id=p_client_id AND service_id=p_service_id AND status='confirmed'
  AND slot_start<p_window_end AND slot_end>p_window_start;
 SELECT coalesce(jsonb_agg(jsonb_build_object('table_id',table_id,'occupied_start',occupied_start,'occupied_end',occupied_end)),'[]'::jsonb)
 INTO v_assignments FROM booking_table_assignments WHERE client_id=p_client_id AND service_id=p_service_id AND released_at IS NULL
  AND occupied_start<p_window_end AND occupied_end>p_window_start;
 RETURN jsonb_build_object('bookings',v_bookings,'table_assignments',v_assignments);
END $$;
REVOKE ALL ON FUNCTION public.get_booking_range_occupancy(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_booking_range_occupancy(uuid,uuid,timestamptz,timestamptz) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
