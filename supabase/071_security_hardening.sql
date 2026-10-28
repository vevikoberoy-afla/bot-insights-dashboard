-- Security hardening for platform staff activation. Apply after 070.
-- Existing staff are not modified; every future activation requires a verified factor.
BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_platform_staff_verified_mfa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NEW.status = 'active' AND (
    TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active' OR OLD.user_id IS DISTINCT FROM NEW.user_id
  ) AND NOT EXISTS (
    SELECT 1 FROM auth.mfa_factors factor
    WHERE factor.user_id = NEW.user_id AND factor.status = 'verified'
  ) THEN
    RAISE EXCEPTION 'PRE_ENROLLED_MFA_REQUIRED';
  END IF;
  NEW.require_mfa := true;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_staff_verified_mfa ON public.platform_staff_memberships;
CREATE TRIGGER platform_staff_verified_mfa
BEFORE INSERT OR UPDATE OF status, user_id ON public.platform_staff_memberships
FOR EACH ROW EXECUTE FUNCTION public.enforce_platform_staff_verified_mfa();

REVOKE ALL ON FUNCTION public.enforce_platform_staff_verified_mfa() FROM PUBLIC, anon, authenticated;
COMMIT;
