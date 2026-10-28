-- Release abandoned cart holds immediately. This migration is safe to rerun.
CREATE OR REPLACE FUNCTION public.release_catalog_holds(p_client uuid,p_session text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE released integer;
BEGIN
 IF length(coalesce(p_session,''))<8 THEN RAISE EXCEPTION 'Invalid hold'; END IF;
 UPDATE commerce_holds SET status='released'
 WHERE client_id=p_client AND session_key=p_session AND status='active';
 GET DIAGNOSTICS released = ROW_COUNT;
 RETURN released;
END $$;

REVOKE ALL ON FUNCTION public.release_catalog_holds(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.release_catalog_holds(uuid,text) TO service_role;
