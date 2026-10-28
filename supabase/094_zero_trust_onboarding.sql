-- Zero-trust onboarding integrated with the existing clients/workspace_memberships
-- control plane. This deliberately does not introduce a second workspace model.
BEGIN;

CREATE TABLE IF NOT EXISTS public.saas_user_onboarding (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'waitlisted' CHECK(status IN ('waitlisted','approved','rejected','suspended')),
  default_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  company_name text,
  website_url text,
  use_case text,
  requested_seats integer NOT NULL DEFAULT 1 CHECK(requested_seats BETWEEN 1 AND 500),
  admin_notes text,
  reviewed_by uuid REFERENCES auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saas_user_onboarding_status_created ON public.saas_user_onboarding(status,created_at);
CREATE INDEX IF NOT EXISTS saas_invitations_verified_email_lookup ON public.saas_invitations(lower(email),status,expires_at DESC);

CREATE OR REPLACE FUNCTION public.saas_seed_onboarding() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.email IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.saas_user_onboarding(user_id,email,status)
  VALUES(NEW.id,lower(NEW.email),'waitlisted') ON CONFLICT(user_id) DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS saas_seed_onboarding ON auth.users;
CREATE TRIGGER saas_seed_onboarding AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.saas_seed_onboarding();

INSERT INTO public.saas_user_onboarding(user_id,email,status,default_client_id)
SELECT u.id,lower(u.email),CASE WHEN m.client_id IS NOT NULL OR s.user_id IS NOT NULL THEN 'approved' ELSE 'waitlisted' END,m.client_id
FROM auth.users u
LEFT JOIN LATERAL (SELECT client_id FROM public.workspace_memberships WHERE user_id=u.id AND status='active' ORDER BY created_at LIMIT 1) m ON true
LEFT JOIN public.platform_staff_memberships s ON s.user_id=u.id AND s.status='active'
ON CONFLICT(user_id) DO UPDATE SET status=CASE WHEN excluded.status='approved' THEN 'approved' ELSE saas_user_onboarding.status END,
 default_client_id=coalesce(saas_user_onboarding.default_client_id,excluded.default_client_id),email=excluded.email;

CREATE OR REPLACE FUNCTION public.saas_bootstrap_identity(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u auth.users; invitation saas_invitations; cap bigint; used bigint; destination text; target_client uuid;
BEGIN
  SELECT * INTO u FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND OR u.email IS NULL THEN RAISE EXCEPTION 'VERIFIED_EMAIL_REQUIRED'; END IF;
  INSERT INTO saas_user_onboarding(user_id,email,status) VALUES(u.id,lower(u.email),'waitlisted') ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,updated_at=now();
  IF EXISTS(SELECT 1 FROM platform_staff_memberships WHERE user_id=u.id AND status='active') THEN
    UPDATE saas_user_onboarding SET status='approved',reviewed_at=coalesce(reviewed_at,now()),updated_at=now() WHERE user_id=u.id;
    RETURN jsonb_build_object('status','approved','destination','/master-admin');
  END IF;
  SELECT * INTO invitation FROM saas_invitations WHERE lower(email)=lower(u.email) AND status='pending' AND expires_at>now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF invitation.id IS NOT NULL THEN
    target_client=invitation.client_id;
    PERFORM 1 FROM saas_workspace_accounts WHERE client_id=target_client FOR UPDATE;
    SELECT (saas_entitlements(target_client)->'limits'->>'members.seats')::bigint INTO cap;
    SELECT count(*)+(SELECT count(*) FROM saas_invitations WHERE client_id=target_client AND status='pending' AND expires_at>now() AND id<>invitation.id) INTO used FROM workspace_memberships WHERE client_id=target_client AND status='active';
    IF used>=cap THEN RAISE EXCEPTION 'TEAM_SEAT_LIMIT_REACHED'; END IF;
    INSERT INTO workspace_memberships(client_id,user_id,role_key,status,permissions) VALUES(target_client,u.id,invitation.role_key,'active',invitation.permissions)
      ON CONFLICT(client_id,user_id) DO UPDATE SET status='active',role_key=CASE WHEN workspace_memberships.role_key='owner' THEN 'owner' ELSE excluded.role_key END,permissions=CASE WHEN workspace_memberships.role_key='owner' THEN workspace_memberships.permissions ELSE excluded.permissions END;
    UPDATE saas_invitations SET status='accepted' WHERE id=invitation.id;
    UPDATE saas_user_onboarding SET status='approved',default_client_id=target_client,reviewed_at=now(),updated_at=now() WHERE user_id=u.id;
    INSERT INTO saas_audit_events(actor_id,client_id,action,reason,after_value) VALUES(u.id,target_client,'identity.invite_auto_accept','Verified email matched a pending workspace invitation',jsonb_build_object('invite_id',invitation.id));
    RETURN jsonb_build_object('status','approved','workspace_id',target_client,'destination','/overview');
  END IF;
  SELECT client_id INTO target_client FROM workspace_memberships WHERE user_id=u.id AND status='active' ORDER BY created_at LIMIT 1;
  IF target_client IS NOT NULL THEN
    UPDATE saas_user_onboarding SET status='approved',default_client_id=target_client,updated_at=now() WHERE user_id=u.id;
    RETURN jsonb_build_object('status','approved','workspace_id',target_client,'destination','/overview');
  END IF;
  RETURN jsonb_build_object('status',(SELECT status FROM saas_user_onboarding WHERE user_id=u.id),'destination','/waitlist');
END $$;

CREATE OR REPLACE FUNCTION public.saas_authorization_snapshot(p_actor uuid,p_client uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE onboard saas_user_onboarding; staff platform_staff_memberships; member workspace_memberships; target uuid; ent jsonb;
BEGIN
  SELECT * INTO onboard FROM saas_user_onboarding WHERE user_id=p_actor;
  SELECT * INTO staff FROM platform_staff_memberships WHERE user_id=p_actor AND status='active';
  target=coalesce(p_client,onboard.default_client_id);
  IF target IS NULL THEN SELECT client_id INTO target FROM workspace_memberships WHERE user_id=p_actor AND status='active' ORDER BY created_at LIMIT 1; END IF;
  IF target IS NOT NULL THEN SELECT * INTO member FROM workspace_memberships WHERE client_id=target AND user_id=p_actor; END IF;
  IF member.id IS NOT NULL AND member.status='active' THEN ent=saas_entitlements(target); END IF;
  RETURN jsonb_build_object('onboarding',coalesce(onboard.status,CASE WHEN staff.user_id IS NOT NULL THEN 'approved' ELSE 'waitlisted' END),'blocked',coalesce((SELECT blocked FROM saas_identity_controls WHERE user_id=p_actor),false),'workspace_id',target,'membership',CASE WHEN member.id IS NULL THEN NULL ELSE to_jsonb(member) END,'staff',CASE WHEN staff.user_id IS NULL THEN NULL ELSE to_jsonb(staff) END,'entitlements',ent);
END $$;

CREATE OR REPLACE FUNCTION public.saas_approve_waitlist(
 p_actor uuid,p_user uuid,p_company text,p_plan_code text,p_max_seats integer,p_max_bots integer,p_max_datasets integer,p_max_messages integer,p_valid_until timestamptz,p_notes text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE role text; entry saas_user_onboarding; cid uuid; plan_id uuid; key text; val integer;
BEGIN
  SELECT role_key INTO role FROM platform_staff_memberships WHERE user_id=p_actor AND status='active';
  IF role NOT IN ('platform_owner','operations_admin') THEN RAISE EXCEPTION 'ADMIN_PERMISSION_REQUIRED'; END IF;
  IF length(trim(coalesce(p_company,'')))<2 OR p_max_seats NOT BETWEEN 1 AND 500 OR least(p_max_bots,p_max_datasets,p_max_messages)<0 OR p_valid_until<=now() THEN RAISE EXCEPTION 'INVALID_PROVISIONING_INPUT'; END IF;
  SELECT * INTO entry FROM saas_user_onboarding WHERE user_id=p_user AND status='waitlisted' FOR UPDATE;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_user AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'WAITLIST_ENTRY_NOT_AVAILABLE'; END IF;
  SELECT id INTO plan_id FROM saas_plan_versions WHERE code=coalesce(nullif(p_plan_code,''),'trial') ORDER BY version DESC LIMIT 1;
  IF plan_id IS NULL THEN RAISE EXCEPTION 'PLAN_NOT_FOUND'; END IF;
  cid=gen_random_uuid();
  INSERT INTO clients(id,name,email) VALUES(cid,left(trim(p_company),200),entry.email);
  INSERT INTO workspace_memberships(client_id,user_id,role_key,status) VALUES(cid,p_user,'owner','active') ON CONFLICT DO NOTHING;
  UPDATE saas_workspace_accounts SET plan_version_id=plan_id,operational_state='active',access_state='active',period_end=p_valid_until,trial_ends_at=NULL,version=version+1,updated_at=now() WHERE client_id=cid;
  FOR key,val IN SELECT * FROM (VALUES ('members.seats',p_max_seats),('bots.active',p_max_bots),('knowledge.datasets',p_max_datasets),('ai.credits.monthly',p_max_messages)) x LOOP
    INSERT INTO saas_entitlement_overrides(client_id,key,value,reason,expires_at,created_by) VALUES(cid,key,to_jsonb(val),'Founder waitlist provisioning',p_valid_until,p_actor);
  END LOOP;
  UPDATE saas_user_onboarding SET status='approved',default_client_id=cid,company_name=left(trim(p_company),200),admin_notes=left(coalesce(p_notes,''),2000),reviewed_by=p_actor,reviewed_at=now(),updated_at=now() WHERE user_id=p_user;
  INSERT INTO saas_audit_events(actor_id,client_id,action,reason,after_value) VALUES(p_actor,cid,'founder.waitlist_approved','Founder approved and provisioned waitlisted identity',jsonb_build_object('user_id',p_user,'max_seats',p_max_seats,'max_bots',p_max_bots,'max_datasets',p_max_datasets,'max_messages',p_max_messages,'valid_until',p_valid_until));
  RETURN jsonb_build_object('client_id',cid,'user_id',p_user);
END $$;

ALTER TABLE public.saas_user_onboarding ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS onboarding_own_read ON public.saas_user_onboarding;
CREATE POLICY onboarding_own_read ON public.saas_user_onboarding FOR SELECT TO authenticated USING(user_id=auth.uid());
REVOKE ALL ON TABLE public.saas_user_onboarding FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.saas_user_onboarding TO authenticated;
REVOKE ALL ON FUNCTION public.saas_bootstrap_identity(uuid),public.saas_authorization_snapshot(uuid,uuid),public.saas_approve_waitlist(uuid,uuid,text,text,integer,integer,integer,integer,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_bootstrap_identity(uuid),public.saas_authorization_snapshot(uuid,uuid),public.saas_approve_waitlist(uuid,uuid,text,text,integer,integer,integer,integer,timestamptz,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
