-- Apply after 094. Preserve explicit identity restrictions during login.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.saas_bootstrap_identity_base(uuid)') IS NULL THEN
   ALTER FUNCTION public.saas_bootstrap_identity(uuid) RENAME TO saas_bootstrap_identity_base;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.saas_bootstrap_identity(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE state text;
BEGIN
 PERFORM 1 FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'VERIFIED_EMAIL_REQUIRED'; END IF;
 SELECT status INTO state FROM saas_user_onboarding WHERE user_id=p_actor FOR UPDATE;
 IF state IN ('suspended','rejected') OR EXISTS(SELECT 1 FROM saas_identity_controls WHERE user_id=p_actor AND blocked) THEN
   RETURN jsonb_build_object('status',coalesce(state,'suspended'),'destination','/suspended');
 END IF;
 RETURN saas_bootstrap_identity_base(p_actor);
END $$;
REVOKE ALL ON FUNCTION public.saas_bootstrap_identity_base(uuid),public.saas_bootstrap_identity(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_bootstrap_identity(uuid) TO service_role;
GRANT ALL ON public.saas_user_onboarding TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
