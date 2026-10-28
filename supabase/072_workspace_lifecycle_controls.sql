-- Timed workspace restriction and service-shutdown controls.
-- Apply after 071. Re-runnable and safe for existing active workspaces.
BEGIN;

ALTER TABLE public.saas_workspace_accounts
  ADD COLUMN IF NOT EXISTS restricted_at timestamptz,
  ADD COLUMN IF NOT EXISTS service_stops_at timestamptz,
  ADD COLUMN IF NOT EXISTS restriction_reason text,
  ADD COLUMN IF NOT EXISTS grace_policy jsonb NOT NULL DEFAULT '{"bots":true,"human_inbox":true,"campaigns":true,"commerce":true,"booking":true,"support":true}'::jsonb;

ALTER TABLE public.saas_workspace_accounts DROP CONSTRAINT IF EXISTS saas_workspace_grace_policy_object;
ALTER TABLE public.saas_workspace_accounts ADD CONSTRAINT saas_workspace_grace_policy_object
  CHECK (jsonb_typeof(grace_policy)='object');

CREATE OR REPLACE FUNCTION public.saas_entitlements(p_client uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
 a saas_workspace_accounts; p saas_plan_versions; o record; f jsonb; l jsonb; state text;
 runtime_f jsonb; subscription_live boolean; grace_live boolean; runtime_live boolean;
 stage text; dashboard_write boolean; human_live boolean; policy jsonb;
BEGIN
 SELECT * INTO a FROM saas_workspace_accounts WHERE client_id=p_client;
 IF NOT FOUND THEN RAISE EXCEPTION 'SAAS_ACCOUNT_NOT_CONFIGURED'; END IF;
 SELECT * INTO p FROM saas_plan_versions WHERE id=a.plan_version_id;
 f=p.features; l=p.limits; state=a.access_state;
 IF state='trialing' AND coalesce(a.trial_ends_at,a.period_end)<=now() THEN state='unpaid_restricted'; END IF;
 IF state='past_due_grace' AND coalesce(a.grace_ends_at,a.period_end)<=now() THEN state='unpaid_restricted'; END IF;
 FOR o IN SELECT * FROM saas_entitlement_overrides WHERE client_id=p_client AND revoked_at IS NULL AND expires_at>now() ORDER BY created_at,id LOOP
  IF jsonb_typeof(o.value)='boolean' THEN f=jsonb_set(f,ARRAY[o.key],o.value); ELSE l=jsonb_set(l,ARRAY[o.key],o.value); END IF;
 END LOOP;
 FOR o IN SELECT * FROM saas_release_gates WHERE NOT enabled LOOP f=jsonb_set(f,ARRAY[o.key],'false'); END LOOP;

 policy=coalesce(a.grace_policy,'{}'::jsonb);
 subscription_live=state IN ('active','trialing','past_due_grace');
 grace_live=(a.operational_state='restricted' AND a.service_stops_at IS NOT NULL AND a.service_stops_at>now())
  OR (a.operational_state='active' AND a.access_state='past_due_grace' AND coalesce(a.grace_ends_at,a.period_end)>now());
 runtime_live=(a.operational_state='active' AND subscription_live) OR grace_live;
 dashboard_write=a.operational_state='active' AND state IN ('active','trialing');
 human_live=(a.operational_state='active' AND subscription_live) OR (grace_live AND coalesce((policy->>'human_inbox')::boolean,false));
 stage=CASE
  WHEN a.operational_state='suspended' THEN 'stopped'
  WHEN a.operational_state='restricted' AND NOT grace_live THEN 'stopped'
  WHEN NOT subscription_live THEN 'stopped'
  WHEN a.operational_state='restricted' OR a.access_state='past_due_grace' THEN 'grace'
  ELSE 'active'
 END;

 runtime_f=f;
 IF NOT runtime_live THEN
  FOR o IN SELECT jsonb_object_keys(runtime_f) AS key LOOP runtime_f=jsonb_set(runtime_f,ARRAY[o.key],'false'::jsonb); END LOOP;
 ELSIF stage='grace' THEN
  runtime_f=jsonb_set(runtime_f,ARRAY['bots.enabled'],to_jsonb(coalesce((f->>'bots.enabled')::boolean,false) AND coalesce((policy->>'bots')::boolean,false)));
  runtime_f=jsonb_set(runtime_f,ARRAY['email.enabled'],to_jsonb(coalesce((f->>'email.enabled')::boolean,false) AND coalesce((policy->>'bots')::boolean,false)));
  runtime_f=jsonb_set(runtime_f,ARRAY['campaigns.enabled'],to_jsonb(coalesce((f->>'campaigns.enabled')::boolean,false) AND coalesce((policy->>'campaigns')::boolean,false)));
  runtime_f=jsonb_set(runtime_f,ARRAY['commerce.enabled'],to_jsonb(coalesce((f->>'commerce.enabled')::boolean,false) AND coalesce((policy->>'commerce')::boolean,false)));
  runtime_f=jsonb_set(runtime_f,ARRAY['offers.targeted.enabled'],to_jsonb(coalesce((f->>'offers.targeted.enabled')::boolean,false) AND coalesce((policy->>'commerce')::boolean,false)));
  runtime_f=jsonb_set(runtime_f,ARRAY['booking.enabled'],to_jsonb(coalesce((f->>'booking.enabled')::boolean,false) AND coalesce((policy->>'booking')::boolean,false)));
  runtime_f=jsonb_set(runtime_f,ARRAY['restaurant.enabled'],to_jsonb(coalesce((f->>'restaurant.enabled')::boolean,false) AND coalesce((policy->>'booking')::boolean,false)));
  runtime_f=jsonb_set(runtime_f,ARRAY['support.enabled'],to_jsonb(coalesce((f->>'support.enabled')::boolean,false) AND coalesce((policy->>'support')::boolean,false)));
 END IF;

 RETURN jsonb_build_object(
  'client_id',p_client,'plan_code',p.code,'features',f,'runtime_features',runtime_f,'limits',l,
  'operational_state',a.operational_state,'access_state',state,'period_start',a.period_start,'period_end',a.period_end,
  'enforcement_mode',a.enforcement_mode,'restriction_stage',stage,'restricted_at',a.restricted_at,
  'service_stops_at',CASE WHEN stage='grace' THEN coalesce(a.service_stops_at,a.grace_ends_at,a.period_end) ELSE a.service_stops_at END,'restriction_reason',a.restriction_reason,'grace_policy',policy,
  'dashboard_write_allowed',dashboard_write,'runtime_allowed',runtime_live,'human_support_allowed',human_live,
  'seconds_until_shutdown',CASE WHEN grace_live THEN greatest(0,extract(epoch FROM (coalesce(a.service_stops_at,a.grace_ends_at,a.period_end)-now()))::bigint) ELSE 0 END
 );
END $$;

CREATE OR REPLACE FUNCTION public.saas_set_workspace_lifecycle(
 p_actor uuid,p_client uuid,p_state text,p_grace_days integer,p_policy jsonb,p_reason text,p_expected_version bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE role text; before_state jsonb; after_state jsonb; current_version bigint; stop_at timestamptz; policy jsonb;
BEGIN
 SELECT role_key INTO role FROM platform_staff_memberships WHERE user_id=p_actor AND status='active';
 IF role NOT IN ('platform_owner','operations_admin','security_operator') THEN RAISE EXCEPTION 'ADMIN_PERMISSION_REQUIRED'; END IF;
 IF length(trim(coalesce(p_reason,'')))<10 THEN RAISE EXCEPTION 'ADMIN_PERMISSION_REQUIRED'; END IF;
 IF p_state NOT IN ('active','restricted','suspended') THEN RAISE EXCEPTION 'INVALID_STATE'; END IF;
 SELECT version INTO current_version FROM saas_workspace_accounts WHERE client_id=p_client FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
 IF p_expected_version IS NULL OR p_expected_version<>current_version THEN RAISE EXCEPTION 'CONCURRENT_MODIFICATION_CONFLICT' USING ERRCODE='40001'; END IF;
 before_state=saas_control_snapshot(p_client);
 policy=coalesce(p_policy,'{"bots":true,"human_inbox":true,"campaigns":true,"commerce":true,"booking":true,"support":true}'::jsonb);
 IF jsonb_typeof(policy)<>'object' OR EXISTS(
  SELECT 1 FROM jsonb_each(policy) item WHERE item.key NOT IN ('bots','human_inbox','campaigns','commerce','booking','support') OR jsonb_typeof(item.value)<>'boolean'
 ) THEN RAISE EXCEPTION 'INVALID_GRACE_POLICY'; END IF;

 IF p_state='restricted' THEN
  IF p_grace_days IS NULL OR p_grace_days<1 OR p_grace_days>60 THEN RAISE EXCEPTION 'INVALID_GRACE_DAYS'; END IF;
  stop_at=now()+make_interval(days=>p_grace_days);
  UPDATE saas_workspace_accounts SET operational_state='restricted',access_state='past_due_grace',restricted_at=now(),
   service_stops_at=stop_at,grace_ends_at=stop_at,grace_policy=policy,restriction_reason=left(trim(p_reason),2000),
   version=version+1,updated_at=now() WHERE client_id=p_client;
 ELSIF p_state='suspended' THEN
  UPDATE saas_workspace_accounts SET operational_state='suspended',restricted_at=coalesce(restricted_at,now()),service_stops_at=now(),
   restriction_reason=left(trim(p_reason),2000),version=version+1,updated_at=now() WHERE client_id=p_client;
 ELSE
  UPDATE saas_workspace_accounts SET operational_state='active',access_state='active',restricted_at=NULL,service_stops_at=NULL,
   grace_ends_at=NULL,restriction_reason=NULL,grace_policy=policy,version=version+1,updated_at=now() WHERE client_id=p_client;
 END IF;
 after_state=saas_control_snapshot(p_client);
 INSERT INTO saas_audit_events(actor_id,client_id,action,reason,before_value,after_value)
 VALUES(p_actor,p_client,'founder.workspace_lifecycle',p_reason,before_state,after_state);
 RETURN jsonb_build_object('account',(SELECT to_jsonb(a) FROM saas_workspace_accounts a WHERE client_id=p_client),
  'entitlements',saas_entitlements(p_client),'version',(SELECT version FROM saas_workspace_accounts WHERE client_id=p_client));
END $$;

-- Direct browser writes are read-only as soon as restriction starts. Inbox
-- agents may continue replying only while the configured grace policy allows it.
CREATE OR REPLACE FUNCTION public.saas_member_access(p_client uuid,p_area text,p_write boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r text; e jsonb; role_allowed boolean; BEGIN
 IF EXISTS(SELECT 1 FROM saas_identity_controls WHERE user_id=auth.uid() AND blocked) THEN RETURN false; END IF;
 SELECT m.role_key INTO r FROM workspace_memberships m WHERE m.client_id=p_client AND m.user_id=auth.uid() AND m.status='active';
 IF r IS NULL THEN RETURN false; END IF;
 e=saas_entitlements(p_client);
 IF e->>'restriction_stage'='stopped' AND p_area NOT IN ('account','billing') THEN RETURN false; END IF;
 IF r IN ('owner','workspace_admin') THEN role_allowed=true;
 ELSIF p_write THEN role_allowed=CASE r WHEN 'agent' THEN p_area IN ('inbox','tickets','contacts') WHEN 'booking_commerce_operator' THEN p_area IN ('commerce','features') WHEN 'billing_manager' THEN p_area='billing' ELSE false END;
 ELSE role_allowed=CASE r WHEN 'agent' THEN p_area IN ('bots','inbox','tickets','contacts','commerce','features','knowledge') WHEN 'booking_commerce_operator' THEN p_area IN ('bots','commerce','features','contacts') WHEN 'analyst' THEN p_area IN ('analytics','features','commerce','usage') WHEN 'billing_manager' THEN p_area IN ('billing','usage') ELSE false END;
 END IF;
 IF NOT role_allowed OR NOT p_write THEN RETURN role_allowed; END IF;
 IF p_area='billing' THEN RETURN true; END IF;
 IF p_area='inbox' THEN RETURN coalesce((e->>'human_support_allowed')::boolean,false); END IF;
 RETURN coalesce((e->>'dashboard_write_allowed')::boolean,false);
END $$;

CREATE OR REPLACE FUNCTION public.saas_consume_usage(p_client uuid,p_meter text,p_operation text,p_amount bigint DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e jsonb; used bigint; cap bigint; start_at timestamptz; a saas_workspace_accounts; prior bigint; feature_key text;
BEGIN
 IF p_amount<=0 OR length(p_operation)>200 OR length(p_operation)<1 THEN RAISE EXCEPTION 'INVALID_USAGE'; END IF;
 SELECT * INTO a FROM saas_workspace_accounts WHERE client_id=p_client FOR UPDATE;
 e=saas_entitlements(p_client);
 SELECT amount INTO prior FROM saas_usage_events WHERE client_id=p_client AND meter=p_meter AND operation=p_operation;
 IF FOUND THEN IF prior<>p_amount THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF; RETURN jsonb_build_object('allowed',true,'duplicate',true); END IF;
 IF coalesce((e->>'runtime_allowed')::boolean,false)=false THEN RETURN jsonb_build_object('allowed',false,'message','Workspace services are paused.'); END IF;
 feature_key=CASE WHEN p_meter='ai.credits.monthly' THEN 'bots.enabled' WHEN p_meter LIKE 'email.marketing.%' THEN 'campaigns.enabled' WHEN p_meter LIKE 'email.%' THEN 'email.enabled' ELSE NULL END;
 IF feature_key IS NOT NULL AND coalesce((e->'runtime_features'->>feature_key)::boolean,false)=false THEN RETURN jsonb_build_object('allowed',false,'message','This service is paused for the workspace.'); END IF;
 cap=(e->'limits'->>p_meter)::bigint; IF cap IS NULL THEN RAISE EXCEPTION 'UNKNOWN_METER'; END IF;
 start_at=a.period_start; IF p_meter LIKE '%.daily' THEN start_at=date_trunc('day',now()); ELSIF a.access_state<>'trialing' THEN WHILE start_at+interval '1 month'<=now() LOOP start_at=start_at+interval '1 month'; END LOOP; END IF;
 SELECT coalesce(sum(amount),0) INTO used FROM saas_usage_events WHERE client_id=p_client AND meter=p_meter AND created_at>=start_at AND state<>'released';
 IF used+p_amount>cap AND a.enforcement_mode='enforced' THEN RETURN jsonb_build_object('allowed',false,'message','Workspace allowance reached.','limit',cap,'used',used); END IF;
 INSERT INTO saas_usage_events(client_id,meter,operation,amount) VALUES(p_client,p_meter,p_operation,p_amount);
 RETURN jsonb_build_object('allowed',true,'used',used+p_amount,'limit',cap);
END $$;

CREATE OR REPLACE FUNCTION public.saas_transaction_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e jsonb; cid uuid; BEGIN
 cid=(to_jsonb(NEW)->>'client_id')::uuid; IF cid IS NULL THEN RETURN NEW; END IF;
 e=saas_entitlements(cid);
 IF coalesce((e->>'runtime_allowed')::boolean,false)=false THEN RAISE EXCEPTION 'WORKSPACE_SERVICES_PAUSED'; END IF;
 IF coalesce((e->'runtime_features'->>TG_ARGV[0])::boolean,false)=false THEN RAISE EXCEPTION 'PLAN_FEATURE_UNAVAILABLE: %',TG_ARGV[0]; END IF;
 RETURN NEW;
END $$;

-- Resource configuration becomes read-only immediately. Contact capture remains
-- available to live customer-facing flows during grace; RLS still blocks tenant
-- users from writing contacts directly while their dashboard is read-only.
CREATE OR REPLACE FUNCTION public.saas_resource_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid; e jsonb; count_now bigint; cap bigint; field text; oldj jsonb; newj jsonb; active_before boolean; active_after boolean; existing jsonb; access_ok boolean;
BEGIN
 newj=to_jsonb(NEW); cid=(newj->>'client_id')::uuid;
 IF cid IS NULL THEN RETURN NEW; END IF;
 PERFORM 1 FROM saas_workspace_accounts WHERE client_id=cid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SAAS_ACCOUNT_NOT_CONFIGURED'; END IF;
 e=saas_entitlements(cid);
 oldj=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
 IF TG_TABLE_NAME='catalog_products' AND TG_OP='INSERT' THEN
  SELECT to_jsonb(p) INTO existing FROM catalog_products p WHERE client_id=cid AND sku=newj->>'sku';
  IF existing IS NOT NULL THEN oldj=existing; END IF;
 END IF;
 active_before=oldj IS NOT NULL AND coalesce(oldj->>'status','active')='active';
 active_after=coalesce(newj->>'status','active')='active';
 IF oldj IS NULL OR (active_after AND NOT active_before) THEN
  access_ok=CASE WHEN TG_TABLE_NAME='contacts' THEN coalesce((e->>'runtime_allowed')::boolean,false) ELSE coalesce((e->>'dashboard_write_allowed')::boolean,false) END;
  IF NOT access_ok THEN RAISE EXCEPTION 'WORKSPACE_RESTRICTED'; END IF;
  IF TG_ARGV[0]<>'' AND coalesce((e->'features'->>TG_ARGV[0])::boolean,false)=false THEN RAISE EXCEPTION 'PLAN_FEATURE_UNAVAILABLE: %',TG_ARGV[0]; END IF;
 END IF;
 IF e->>'enforcement_mode'='shadow' THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='channel_integrations' AND newj->>'channel'='email' AND (oldj IS NULL OR coalesce(oldj->>'channel','')<>'email') THEN
  cap=(e->'limits'->>'channels.mailboxes')::bigint;
  EXECUTE 'SELECT count(*) FROM public.channel_integrations WHERE client_id=$1 AND channel=''email''' INTO count_now USING cid;
  IF cap IS NULL OR count_now>=cap THEN RAISE EXCEPTION 'PLAN_LIMIT_REACHED: channels.mailboxes'; END IF;
 END IF;
 IF oldj IS NULL AND TG_ARGV[1]<>'' THEN
  field=TG_ARGV[1]; cap=(e->'limits'->>field)::bigint;
  EXECUTE format('SELECT count(*) FROM public.%I WHERE client_id=$1',TG_TABLE_NAME) INTO count_now USING cid;
  IF cap IS NULL OR count_now>=cap THEN RAISE EXCEPTION 'PLAN_LIMIT_REACHED: %',field; END IF;
 END IF;
 IF active_after AND NOT active_before AND TG_ARGV[2]<>'' THEN
  field=TG_ARGV[2]; cap=(e->'limits'->>field)::bigint;
  EXECUTE format('SELECT count(*) FROM public.%I t WHERE client_id=$1 AND coalesce(to_jsonb(t)->>''status'',''active'')=''active''',TG_TABLE_NAME) INTO count_now USING cid;
  IF cap IS NULL OR count_now>=cap THEN RAISE EXCEPTION 'PLAN_LIMIT_REACHED: %',field; END IF;
 END IF;
 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.saas_set_workspace_lifecycle(uuid,uuid,text,integer,jsonb,text,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_set_workspace_lifecycle(uuid,uuid,text,integer,jsonb,text,bigint) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
