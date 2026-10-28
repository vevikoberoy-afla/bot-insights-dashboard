-- Per-employee workspace access. Run after 072 and 073.
BEGIN;

CREATE OR REPLACE FUNCTION public.saas_permissions_valid(value jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
 SELECT value IS NULL OR (
  jsonb_typeof(value)='object'
  AND NOT EXISTS(SELECT 1 FROM jsonb_each_text(value) item WHERE item.key NOT IN (
   'overview','inbox','bookings','services','offers','booking_analytics','products','orders','inventory',
   'bots','campaigns','tickets','contacts','knowledge','sources','analytics','templates','settings','team','billing','usage'
  ) OR item.value NOT IN ('none','read','write'))
 )
$$;

ALTER TABLE public.workspace_memberships ADD COLUMN IF NOT EXISTS permissions jsonb;
ALTER TABLE public.saas_invitations ADD COLUMN IF NOT EXISTS permissions jsonb;
ALTER TABLE public.workspace_memberships DROP CONSTRAINT IF EXISTS workspace_memberships_permissions_valid;
ALTER TABLE public.workspace_memberships ADD CONSTRAINT workspace_memberships_permissions_valid CHECK(public.saas_permissions_valid(permissions));
ALTER TABLE public.saas_invitations DROP CONSTRAINT IF EXISTS saas_invitations_permissions_valid;
ALTER TABLE public.saas_invitations ADD CONSTRAINT saas_invitations_permissions_valid CHECK(public.saas_permissions_valid(permissions));

CREATE OR REPLACE FUNCTION public.saas_member_access(p_client uuid,p_area text,p_write boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r text; grants jsonb; e jsonb; role_allowed boolean=false; level text; child text;
BEGIN
 IF EXISTS(SELECT 1 FROM saas_identity_controls WHERE user_id=auth.uid() AND blocked) THEN RETURN false; END IF;
 SELECT m.role_key,m.permissions INTO r,grants FROM workspace_memberships m
 WHERE m.client_id=p_client AND m.user_id=auth.uid() AND m.status='active';
 IF r IS NULL THEN RETURN false; END IF;
 e=saas_entitlements(p_client);
 IF e->>'restriction_stage'='stopped' AND p_area NOT IN ('account','billing') THEN RETURN false; END IF;
 IF r IN ('owner','workspace_admin') THEN role_allowed=true;
 ELSIF grants IS NOT NULL THEN
  IF p_area='features' THEN
   FOREACH child IN ARRAY ARRAY['bookings','services','offers','booking_analytics'] LOOP
    level=grants->>child; role_allowed=role_allowed OR (CASE WHEN p_write THEN level='write' ELSE level IN ('read','write') END);
   END LOOP;
  ELSIF p_area='commerce' THEN
   FOREACH child IN ARRAY ARRAY['products','orders','inventory'] LOOP
    level=grants->>child; role_allowed=role_allowed OR (CASE WHEN p_write THEN level='write' ELSE level IN ('read','write') END);
   END LOOP;
  ELSE
   level=grants->>CASE WHEN p_area='account' THEN 'overview' ELSE p_area END;
   role_allowed=CASE WHEN p_write THEN level='write' ELSE level IN ('read','write') END;
  END IF;
 ELSIF p_write THEN
  role_allowed=CASE r WHEN 'agent' THEN p_area IN ('inbox','tickets','contacts') WHEN 'booking_commerce_operator' THEN p_area IN ('commerce','features','products','orders','inventory','bookings','services','offers') WHEN 'billing_manager' THEN p_area='billing' ELSE false END;
 ELSE
  role_allowed=CASE r WHEN 'agent' THEN p_area IN ('account','overview','bots','inbox','tickets','contacts','commerce','products','orders','inventory','features','bookings','services','offers','knowledge')
   WHEN 'booking_commerce_operator' THEN p_area IN ('account','overview','bots','commerce','products','orders','inventory','features','bookings','services','offers','contacts')
   WHEN 'analyst' THEN p_area IN ('account','overview','analytics','booking_analytics','features','bookings','commerce','products','orders','inventory','usage')
   WHEN 'billing_manager' THEN p_area IN ('account','overview','billing','usage') ELSE false END;
 END IF;
 IF NOT role_allowed OR NOT p_write THEN RETURN role_allowed; END IF;
 IF p_area='billing' THEN RETURN true; END IF;
 IF p_area='inbox' THEN RETURN coalesce((e->>'human_support_allowed')::boolean,false); END IF;
 RETURN coalesce((e->>'dashboard_write_allowed')::boolean,false);
END $$;
REVOKE ALL ON FUNCTION public.saas_member_access(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_member_access(uuid,text,boolean) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.saas_team_mutate(p_actor uuid,p_client uuid,p_action text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_role text; e jsonb; seats bigint; invitation saas_invitations; member workspace_memberships; email_address text; result jsonb; grants jsonb;
BEGIN
 PERFORM 1 FROM saas_workspace_accounts WHERE client_id=p_client FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
 IF p_action='accept' THEN
  SELECT * INTO invitation FROM saas_invitations WHERE client_id=p_client AND token_hash=p_payload->>'token_hash' AND status='pending' AND expires_at>now() FOR UPDATE;
  SELECT lower(email) INTO email_address FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL;
  IF invitation.id IS NULL OR invitation.email IS DISTINCT FROM email_address THEN RAISE EXCEPTION 'INVALID_INVITATION'; END IF;
  INSERT INTO workspace_memberships(client_id,user_id,role_key,status,permissions) VALUES(p_client,p_actor,invitation.role_key,'active',invitation.permissions)
   ON CONFLICT(client_id,user_id) DO UPDATE SET status='active',role_key=CASE WHEN workspace_memberships.role_key='owner' THEN 'owner' ELSE excluded.role_key END,permissions=CASE WHEN workspace_memberships.role_key='owner' THEN workspace_memberships.permissions ELSE excluded.permissions END;
  UPDATE saas_invitations SET status='accepted' WHERE id=invitation.id;
 ELSE
  SELECT role_key INTO actor_role FROM workspace_memberships WHERE client_id=p_client AND user_id=p_actor AND status='active';
  IF actor_role IS NULL OR actor_role NOT IN ('owner','workspace_admin') THEN RAISE EXCEPTION 'TEAM_PERMISSION_REQUIRED'; END IF;
  grants=p_payload->'permissions';
  IF p_action IN ('invite','member') AND (grants IS NULL OR NOT saas_permissions_valid(grants)) THEN RAISE EXCEPTION 'INVALID_MEMBER_PERMISSIONS'; END IF;
  IF p_action='invite' THEN
   email_address=lower(trim(p_payload->>'email'));
   IF email_address NOT LIKE '%@%.%' THEN RAISE EXCEPTION 'INVALID_EMAIL'; END IF;
   IF EXISTS(SELECT 1 FROM workspace_memberships m JOIN auth.users u ON u.id=m.user_id WHERE m.client_id=p_client AND m.status='active' AND lower(u.email)=email_address) THEN RAISE EXCEPTION 'ALREADY_A_MEMBER'; END IF;
   IF EXISTS(SELECT 1 FROM saas_invitations WHERE client_id=p_client AND email=email_address AND status='pending' AND expires_at>now()) THEN RAISE EXCEPTION 'INVITATION_ALREADY_PENDING'; END IF;
   e=saas_entitlements(p_client);
   SELECT count(*) INTO seats FROM workspace_memberships WHERE client_id=p_client AND status='active';
   seats=seats+(SELECT count(*) FROM saas_invitations WHERE client_id=p_client AND status='pending' AND expires_at>now());
   IF seats>=(e->'limits'->>'members.seats')::bigint THEN RAISE EXCEPTION 'TEAM_SEAT_LIMIT_REACHED'; END IF;
   INSERT INTO saas_invitations(client_id,email,role_key,permissions,token_hash) VALUES(p_client,email_address,p_payload->>'role_key',grants,p_payload->>'token_hash') RETURNING jsonb_build_object('id',id) INTO result;
  ELSIF p_action='revoke_invite' THEN
   UPDATE saas_invitations SET status='revoked' WHERE id=(p_payload->>'id')::uuid AND client_id=p_client AND status='pending';
  ELSIF p_action='member' THEN
   SELECT * INTO member FROM workspace_memberships WHERE id=(p_payload->>'id')::uuid AND client_id=p_client FOR UPDATE;
   IF member.id IS NULL OR member.role_key='owner' OR member.user_id=p_actor OR p_payload->>'role_key'='owner' THEN RAISE EXCEPTION 'CANNOT_MODIFY_OWNER_OR_SELF'; END IF;
   IF member.status='revoked' AND p_payload->>'status'='active' THEN
    e=saas_entitlements(p_client);
    SELECT count(*) INTO seats FROM workspace_memberships WHERE client_id=p_client AND status='active';
    seats=seats+(SELECT count(*) FROM saas_invitations WHERE client_id=p_client AND status='pending' AND expires_at>now());
    IF seats>=(e->'limits'->>'members.seats')::bigint THEN RAISE EXCEPTION 'TEAM_SEAT_LIMIT_REACHED'; END IF;
   END IF;
   UPDATE workspace_memberships SET role_key=p_payload->>'role_key',status=p_payload->>'status',permissions=grants WHERE id=member.id;
  ELSE RAISE EXCEPTION 'UNKNOWN_ACTION'; END IF;
 END IF;
 INSERT INTO saas_audit_events(actor_id,client_id,action,reason,after_value) VALUES(p_actor,p_client,'team.'||p_action,'Workspace team access management',p_payload-'token_hash');
 RETURN coalesce(result,'{}');
END $$;
REVOKE ALL ON FUNCTION public.saas_team_mutate(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_team_mutate(uuid,uuid,text,jsonb) TO service_role;

-- Replace broad feature/commerce RLS areas with the same granular modules used by the dashboard.
DO $$ DECLARE item record; policy record; BEGIN
 FOR item IN SELECT * FROM (VALUES
  ('feature_bookings','bookings'),('booking_flow_sessions','bookings'),('booking_table_assignments','bookings'),('booking_holds','bookings'),('booking_waitlist','bookings'),('booking_notifications','bookings'),
  ('booking_services','services'),('booking_offers','offers'),('catalog_products','products'),('commerce_orders','orders'),('commerce_order_items','orders'),('commerce_order_events','orders'),('inventory_movements','inventory')
 ) AS mapped(table_name,area) LOOP
  IF to_regclass('public.'||item.table_name) IS NULL OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=item.table_name AND column_name='client_id') THEN CONTINUE; END IF;
  FOR policy IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=item.table_name AND policyname IN ('saas_member_read','saas_member_write') LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',policy.policyname,item.table_name);
  END LOOP;
  EXECUTE format('CREATE POLICY saas_member_read ON public.%I FOR SELECT TO authenticated USING(public.saas_member_access(client_id,%L,false))',item.table_name,item.area);
  EXECUTE format('CREATE POLICY saas_member_write ON public.%I FOR ALL TO authenticated USING(public.saas_member_access(client_id,%L,true)) WITH CHECK(public.saas_member_access(client_id,%L,true))',item.table_name,item.area,item.area);
 END LOOP;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
