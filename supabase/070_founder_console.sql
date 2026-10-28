-- Founder console. Apply after 069. Existing control tables remain authoritative.
BEGIN;
CREATE TABLE IF NOT EXISTS public.saas_identity_controls (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),blocked boolean NOT NULL DEFAULT false,reason text NOT NULL,
 updated_by uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.saas_account_notes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid NOT NULL REFERENCES clients(id),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 10000),author_id uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.saas_enterprise_agreements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid NOT NULL REFERENCES clients(id),reference text NOT NULL,
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,payment_terms text NOT NULL,sla_hours integer NOT NULL CHECK(sla_hours>0),
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),CHECK(ends_at>starts_at)
);
CREATE TABLE IF NOT EXISTS public.saas_platform_settings (
 id boolean PRIMARY KEY DEFAULT true CHECK(id),trial_days integer NOT NULL DEFAULT 14 CHECK(trial_days BETWEEN 1 AND 90),
 grace_days integer NOT NULL DEFAULT 7 CHECK(grace_days BETWEEN 1 AND 60),notice text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO saas_platform_settings(id) VALUES(true) ON CONFLICT DO NOTHING;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['saas_account_notes','saas_enterprise_agreements','saas_platform_settings','saas_identity_controls'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
 -- Preserve the existing, tested command implementation on reruns.
 IF to_regprocedure('public.saas_admin_mutate_base(uuid,text,uuid,jsonb,text)') IS NULL THEN
  ALTER FUNCTION public.saas_admin_mutate(uuid,text,uuid,jsonb,text) RENAME TO saas_admin_mutate_base;
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.saas_control_snapshot(p_client uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object('account',to_jsonb(a),'profile',(SELECT jsonb_build_object('name',c.name,'email',c.email) FROM clients c WHERE c.id=p_client),'overrides',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.created_at,o.id) FROM saas_entitlement_overrides o WHERE o.client_id=p_client),'[]'::jsonb),
 'members',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM workspace_memberships m WHERE m.client_id=p_client),'[]'::jsonb))
 FROM saas_workspace_accounts a WHERE a.client_id=p_client
$$;

CREATE OR REPLACE FUNCTION public.saas_admin_mutate(p_actor uuid,p_action text,p_client uuid,p_payload jsonb,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE role text; before_state jsonb; after_state jsonb; current_version bigint; result jsonb; target uuid; days integer;
BEGIN
 SELECT role_key INTO role FROM platform_staff_memberships WHERE user_id=p_actor AND status='active';
 IF role IS NULL OR p_reason IS NULL OR length(trim(p_reason))<10 THEN RAISE EXCEPTION 'ADMIN_PERMISSION_REQUIRED'; END IF;
 IF p_client IS NOT NULL THEN
  SELECT version INTO current_version FROM saas_workspace_accounts WHERE client_id=p_client FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
  IF p_payload ? 'expected_version' AND (p_payload->>'expected_version')::bigint<>current_version THEN
   RAISE EXCEPTION 'CONCURRENT_MODIFICATION_CONFLICT' USING ERRCODE='40001';
  END IF;
  before_state=saas_control_snapshot(p_client);
 END IF;
 IF p_action IN ('note','profile','bot','revoke_invite','ownership','enterprise','settings','identity','provision') THEN
  IF role<>'platform_owner' AND NOT (role='operations_admin' AND p_action IN ('note','profile','bot','revoke_invite')) AND NOT (role='support_specialist' AND p_action='note') AND NOT (role='security_operator' AND p_action='identity') THEN RAISE EXCEPTION 'ADMIN_PERMISSION_REQUIRED'; END IF;
  IF p_action='provision' THEN
   target=(p_payload->>'owner_user_id')::uuid;
   IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=target AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'VERIFIED_OWNER_REQUIRED'; END IF;
   IF length(trim(p_payload->>'name'))<1 THEN RAISE EXCEPTION 'INVALID_NAME'; END IF;
   p_client=gen_random_uuid();
   INSERT INTO clients(id,name,email) SELECT p_client,left(trim(p_payload->>'name'),200),email FROM auth.users WHERE id=target;
   INSERT INTO workspace_memberships(client_id,user_id,role_key) VALUES(p_client,target,'owner');
   SELECT version INTO current_version FROM saas_workspace_accounts WHERE client_id=p_client FOR UPDATE;
   result=jsonb_build_object('client_id',p_client,'owner_user_id',target);
  ELSIF p_action='identity' THEN
   target=(p_payload->>'user_id')::uuid;
   IF target=p_actor OR EXISTS(SELECT 1 FROM platform_staff_memberships WHERE user_id=target AND status='active') THEN RAISE EXCEPTION 'REVOKE_STAFF_ACCESS_FIRST'; END IF;
   SELECT to_jsonb(i) INTO before_state FROM saas_identity_controls i WHERE user_id=target FOR UPDATE;
   INSERT INTO saas_identity_controls(user_id,blocked,reason,updated_by) VALUES(target,(p_payload->>'blocked')::boolean,p_reason,p_actor)
   ON CONFLICT(user_id) DO UPDATE SET blocked=excluded.blocked,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now() RETURNING to_jsonb(saas_identity_controls.*) INTO result;
  ELSIF p_action='note' THEN
   INSERT INTO saas_account_notes(client_id,body,author_id) VALUES(p_client,p_payload->>'body',p_actor) RETURNING to_jsonb(saas_account_notes.*) INTO result;
  ELSIF p_action='profile' THEN
   IF length(trim(p_payload->>'name'))<1 THEN RAISE EXCEPTION 'INVALID_NAME'; END IF;
   UPDATE clients SET name=left(trim(p_payload->>'name'),200) WHERE id=p_client;
   result=jsonb_build_object('name',p_payload->>'name');
  ELSIF p_action='bot' THEN
   IF p_payload->>'status' NOT IN ('active','paused') THEN RAISE EXCEPTION 'INVALID_STATUS'; END IF;
   UPDATE bots SET status=p_payload->>'status' WHERE id=(p_payload->>'id')::uuid AND client_id=p_client RETURNING jsonb_build_object('id',id,'status',status) INTO result;
   IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND'; END IF;
  ELSIF p_action='revoke_invite' THEN
   UPDATE saas_invitations SET status='revoked' WHERE id=(p_payload->>'id')::uuid AND client_id=p_client AND status='pending' RETURNING jsonb_build_object('id',id,'status',status) INTO result;
   IF NOT FOUND THEN RAISE EXCEPTION 'RESOURCE_NOT_FOUND'; END IF;
  ELSIF p_action='ownership' THEN
   target=(p_payload->>'user_id')::uuid;
   IF NOT EXISTS(SELECT 1 FROM workspace_memberships m JOIN auth.users u ON u.id=m.user_id WHERE m.client_id=p_client AND m.user_id=target AND m.status='active' AND u.email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'VERIFIED_MEMBER_REQUIRED'; END IF;
   UPDATE workspace_memberships SET role_key='workspace_admin' WHERE client_id=p_client AND role_key='owner';
   UPDATE workspace_memberships SET role_key='owner' WHERE client_id=p_client AND user_id=target;
   result=jsonb_build_object('owner_user_id',target);
  ELSIF p_action='enterprise' THEN
   INSERT INTO saas_enterprise_agreements(client_id,reference,starts_at,ends_at,payment_terms,sla_hours,created_by)
   VALUES(p_client,left(p_payload->>'reference',200),(p_payload->>'starts_at')::timestamptz,(p_payload->>'ends_at')::timestamptz,left(p_payload->>'payment_terms',500),(p_payload->>'sla_hours')::integer,p_actor)
   RETURNING to_jsonb(saas_enterprise_agreements.*) INTO result;
  ELSIF p_action='settings' THEN
   SELECT to_jsonb(s) INTO before_state FROM saas_platform_settings s WHERE id FOR UPDATE;
   UPDATE saas_platform_settings SET trial_days=(p_payload->>'trial_days')::integer,grace_days=(p_payload->>'grace_days')::integer,notice=left(coalesce(p_payload->>'notice',''),2000),updated_at=now() WHERE id RETURNING to_jsonb(saas_platform_settings.*) INTO result;
  END IF;
 ELSE
  IF p_action='staff' THEN
   PERFORM pg_advisory_xact_lock(hashtext('saas_staff_mutate'));
   SELECT to_jsonb(s) INTO before_state FROM platform_staff_memberships s WHERE user_id=(p_payload->>'user_id')::uuid;
   IF before_state->>'role_key'='platform_owner' AND before_state->>'status'='active' AND (p_payload->>'role_key'<>'platform_owner' OR p_payload->>'status'<>'active') AND (SELECT count(*) FROM platform_staff_memberships WHERE role_key='platform_owner' AND status='active')<=1 THEN RAISE EXCEPTION 'LAST_FOUNDER_REQUIRED'; END IF;
  ELSIF p_action='release' THEN
   SELECT to_jsonb(g) INTO before_state FROM saas_release_gates g WHERE key=p_payload->>'key' FOR UPDATE;
  END IF;
  IF p_action='override' THEN
   UPDATE saas_entitlement_overrides SET revoked_at=now() WHERE client_id=p_client AND key=p_payload->>'key' AND revoked_at IS NULL;
  END IF;
  result=saas_admin_mutate_base(p_actor,p_action,p_client,p_payload,p_reason);
 END IF;
 IF p_client IS NOT NULL THEN
  UPDATE saas_workspace_accounts SET version=greatest(version,current_version+1),updated_at=now() WHERE client_id=p_client;
  after_state=saas_control_snapshot(p_client);
 ELSE after_state=coalesce(result,p_payload); END IF;
 INSERT INTO saas_audit_events(actor_id,client_id,action,reason,before_value,after_value) VALUES(p_actor,p_client,'founder.'||p_action,p_reason,before_state,after_state||jsonb_build_object('result',result));
 RETURN jsonb_build_object('result',result,'version',CASE WHEN p_client IS NOT NULL THEN (SELECT version FROM saas_workspace_accounts WHERE client_id=p_client) ELSE NULL END);
END $$;

-- Membership policies consult the global identity block on every database request.
CREATE OR REPLACE FUNCTION public.saas_member_access(p_client uuid,p_area text,p_write boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r text; state text; BEGIN
 IF EXISTS(SELECT 1 FROM saas_identity_controls WHERE user_id=auth.uid() AND blocked) THEN RETURN false; END IF;
 SELECT m.role_key,a.operational_state INTO r,state FROM workspace_memberships m JOIN saas_workspace_accounts a ON a.client_id=m.client_id WHERE m.client_id=p_client AND m.user_id=auth.uid() AND m.status='active';
 IF r IS NULL OR state='suspended' THEN RETURN false; END IF;
 IF r IN ('owner','workspace_admin') THEN RETURN true; END IF;
 IF p_write THEN RETURN CASE r WHEN 'agent' THEN p_area IN ('inbox','tickets','contacts') WHEN 'booking_commerce_operator' THEN p_area IN ('commerce','features') ELSE false END; END IF;
 RETURN CASE r WHEN 'agent' THEN p_area IN ('bots','inbox','tickets','contacts','commerce','features','knowledge') WHEN 'booking_commerce_operator' THEN p_area IN ('bots','commerce','features','contacts') WHEN 'analyst' THEN p_area IN ('analytics','features','commerce','usage') WHEN 'billing_manager' THEN p_area IN ('billing','usage') ELSE false END;
END $$;

-- New-account defaults are real provisioning controls, not merely UI preferences.
CREATE OR REPLACE FUNCTION public.saas_provision_account() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE plan_id uuid; trial_length integer; BEGIN
 SELECT id INTO plan_id FROM saas_plan_versions WHERE code='trial' ORDER BY version DESC LIMIT 1;
 SELECT trial_days INTO trial_length FROM saas_platform_settings WHERE id;
 INSERT INTO saas_workspace_accounts(client_id,plan_version_id,access_state,trial_ends_at,period_end) VALUES(NEW.id,plan_id,'trialing',now()+make_interval(days=>coalesce(trial_length,14)),now()+make_interval(days=>coalesce(trial_length,14))) ON CONFLICT DO NOTHING;
 INSERT INTO workspace_memberships(client_id,user_id,role_key) SELECT NEW.id,id,'owner' FROM auth.users WHERE id=NEW.id ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.saas_founder_accounts(p_search text DEFAULT '',p_state text DEFAULT '',p_plan text DEFAULT '',p_page integer DEFAULT 0) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH matches AS (
 SELECT a.*,jsonb_build_object('id',c.id,'name',c.name,'email',c.email,'created_at',c.created_at) clients,to_jsonb(p) saas_plan_versions,
 CASE WHEN a.access_state='trialing' AND coalesce(a.trial_ends_at,a.period_end)<=now() OR a.access_state='past_due_grace' AND coalesce(a.grace_ends_at,a.period_end)<=now() THEN 'unpaid_restricted' ELSE a.access_state END effective_access_state
 FROM saas_workspace_accounts a JOIN clients c ON c.id=a.client_id JOIN saas_plan_versions p ON p.id=a.plan_version_id
 WHERE (p_search='' OR c.name ILIKE '%'||p_search||'%' OR c.email ILIKE '%'||p_search||'%' OR c.id::text ILIKE '%'||p_search||'%')
 AND (p_state='' OR a.operational_state=p_state) AND (p_plan='' OR p.code=p_plan)
 ), page AS (SELECT * FROM matches ORDER BY updated_at DESC,client_id LIMIT 50 OFFSET greatest(p_page,0)*50)
 SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(page)) FROM page),'[]'::jsonb),'total',(SELECT count(*) FROM matches),'page',p_page)
$$;

CREATE OR REPLACE FUNCTION public.saas_founder_overview(p_days integer DEFAULT 30) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH accounts AS (SELECT a.*,p.code,p.currency,p.price_minor,p.billing_interval,saas_entitlements(a.client_id)->>'access_state' effective FROM saas_workspace_accounts a JOIN saas_plan_versions p ON p.id=a.plan_version_id),
 distribution AS (SELECT code,count(*) count FROM accounts GROUP BY code),
 recurring AS (SELECT currency,sum(CASE WHEN billing_interval='year' THEN price_minor/12.0 ELSE price_minor END)/100 mrr FROM accounts WHERE effective='active' AND operational_state='active' AND billing_interval IN ('month','year') AND price_minor IS NOT NULL GROUP BY currency),
 growth AS (SELECT created_at::date AS "day",count(*) count FROM clients WHERE created_at>=now()-make_interval(days=>least(greatest(p_days,1),90)) GROUP BY 1 ORDER BY 1),
 usage AS (SELECT meter,sum(amount) amount FROM saas_usage_events WHERE state<>'released' AND created_at>=now()-make_interval(days=>least(greatest(p_days,1),90)) GROUP BY meter)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM clients),'active',(SELECT count(*) FROM accounts WHERE operational_state='active'),'restricted',(SELECT count(*) FROM accounts WHERE operational_state='restricted'),'suspended',(SELECT count(*) FROM accounts WHERE operational_state='suspended'),
 'subscriptions',(SELECT count(*) FROM accounts WHERE effective='active'),'trials',(SELECT count(*) FROM accounts WHERE effective='trialing'),'grace',(SELECT count(*) FROM accounts WHERE effective='past_due_grace'),
 'expiring_trials',(SELECT count(*) FROM accounts WHERE effective='trialing' AND coalesce(trial_ends_at,period_end)<now()+interval '72 hours'),
 'open_requests',(SELECT count(*) FROM saas_requests WHERE status IN ('open','in_progress')),'delivery_alerts',(SELECT count(*) FROM saas_delivery_operations WHERE status IN ('failed','unknown')),
 'disabled_features',(SELECT count(*) FROM saas_release_gates WHERE NOT enabled),'distribution',coalesce((SELECT jsonb_agg(to_jsonb(distribution)) FROM distribution),'[]'::jsonb),
 'recurring',coalesce((SELECT jsonb_agg(to_jsonb(recurring)) FROM recurring),'[]'::jsonb),'growth',coalesce((SELECT jsonb_agg(to_jsonb(growth)) FROM growth),'[]'::jsonb),'usage',coalesce((SELECT jsonb_agg(to_jsonb(usage)) FROM usage),'[]'::jsonb),
 'recent_audit',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT * FROM saas_audit_events ORDER BY created_at DESC LIMIT 15) x),'[]'::jsonb),'computed_at',now())
$$;
REVOKE ALL ON FUNCTION public.saas_admin_mutate_base(uuid,text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.saas_admin_mutate(uuid,text,uuid,jsonb,text),public.saas_control_snapshot(uuid),public.saas_founder_accounts(text,text,text,integer),public.saas_founder_overview(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_admin_mutate(uuid,text,uuid,jsonb,text),public.saas_control_snapshot(uuid),public.saas_founder_accounts(text,text,text,integer),public.saas_founder_overview(integer) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
