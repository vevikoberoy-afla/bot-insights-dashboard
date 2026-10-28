-- SaaS control plane. Apply after 066. Re-runnable; never promotes legacy users.role.
BEGIN;
ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'member';

CREATE TABLE IF NOT EXISTS public.platform_staff_memberships (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 role_key text NOT NULL CHECK(role_key IN ('platform_owner','operations_admin','support_specialist','billing_specialist','security_operator','readonly_analyst')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
 require_mfa boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.workspace_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 role_key text NOT NULL CHECK(role_key IN ('owner','workspace_admin','agent','booking_commerce_operator','analyst','billing_manager')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(client_id,user_id)
);
CREATE INDEX IF NOT EXISTS workspace_memberships_user ON public.workspace_memberships(user_id,status);
INSERT INTO public.workspace_memberships(client_id,user_id,role_key)
 SELECT c.id,u.id,'owner' FROM public.clients c JOIN auth.users u ON u.id=c.id ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.saas_plan_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL, name text NOT NULL,
 version integer NOT NULL DEFAULT 1, features jsonb NOT NULL, limits jsonb NOT NULL,
 price_minor bigint CHECK(price_minor >= 0), currency text NOT NULL DEFAULT 'INR',
 billing_interval text NOT NULL DEFAULT 'month' CHECK(billing_interval IN ('month','year','contract')),
 published_at timestamptz NOT NULL DEFAULT now(), UNIQUE(code,version)
);
CREATE TABLE IF NOT EXISTS public.saas_workspace_accounts (
 client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
 plan_version_id uuid NOT NULL REFERENCES public.saas_plan_versions(id),
 operational_state text NOT NULL DEFAULT 'active' CHECK(operational_state IN ('active','restricted','suspended')),
 access_state text NOT NULL DEFAULT 'trialing' CHECK(access_state IN ('trialing','active','past_due_grace','unpaid_restricted','canceled','paused')),
 enforcement_mode text NOT NULL DEFAULT 'enforced' CHECK(enforcement_mode IN ('shadow','enforced')),
 period_start timestamptz NOT NULL DEFAULT now(), period_end timestamptz NOT NULL DEFAULT (now()+interval '14 days'),
 trial_ends_at timestamptz, grace_ends_at timestamptz,
 version bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(), CHECK(period_end>period_start)
);
CREATE TABLE IF NOT EXISTS public.saas_entitlement_overrides (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 key text NOT NULL, value jsonb NOT NULL CHECK(jsonb_typeof(value) IN ('number','boolean')),
 reason text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS saas_overrides_client ON public.saas_entitlement_overrides(client_id,expires_at);
CREATE TABLE IF NOT EXISTS public.saas_release_gates (
 key text PRIMARY KEY, enabled boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.saas_audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid REFERENCES auth.users(id), client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
 action text NOT NULL, reason text NOT NULL, before_value jsonb, after_value jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saas_audit_client_date ON public.saas_audit_events(client_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.saas_usage_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 meter text NOT NULL, operation text NOT NULL, amount bigint NOT NULL CHECK(amount>0),
 state text NOT NULL DEFAULT 'committed' CHECK(state IN ('reserved','committed','released')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(client_id,meter,operation)
);
CREATE INDEX IF NOT EXISTS saas_usage_client_meter ON public.saas_usage_events(client_id,meter,created_at);
CREATE TABLE IF NOT EXISTS public.saas_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 requester_id uuid NOT NULL REFERENCES auth.users(id), kind text NOT NULL CHECK(kind IN ('support','plan_change','export','deletion')),
 subject text NOT NULL, message text NOT NULL, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved','closed')),
 response text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.saas_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 email text NOT NULL, role_key text NOT NULL CHECK(role_key IN ('workspace_admin','agent','booking_commerce_operator','analyst','billing_manager')),
 token_hash text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '7 days', created_at timestamptz NOT NULL DEFAULT now()
);

-- Published plans are snapshots. Prices remain NULL until the operator publishes a price.
DO $$ DECLARE v_code text; n int; v_limits jsonb; v_features jsonb; BEGIN
 FOR v_code,n IN SELECT * FROM (VALUES ('trial',0),('starter',1),('growth',2),('business',3),('enterprise',4),('legacy',5)) s LOOP
  v_features=jsonb_build_object('bots.enabled',true,'commerce.enabled',true,'booking.enabled',true,'support.enabled',true,
   'knowledge.enabled',true,'sources.enabled',true,'email.enabled',true,'analytics.enabled',true,
   'restaurant.enabled',n<>1,'campaigns.enabled',n>=2,'offers.targeted.enabled',n<>1,
   'contacts.messaging.enabled',true,'api.enabled',n>=2);
  v_limits=jsonb_build_object(
   'bots.active',(ARRAY[1,1,5,20,20,1000])[n+1], 'bots.retained',(ARRAY[2,3,15,60,60,10000])[n+1],
   'members.seats',(ARRAY[2,2,5,15,15,1000])[n+1],
   'storefronts.total',(ARRAY[1,1,3,10,50,1000])[n+1],
   'products.active',(ARRAY[25,250,2500,10000,10000,1000000])[n+1],
   'products.retained',(ARRAY[50,500,5000,20000,20000,2000000])[n+1],
   'services.active',(ARRAY[2,5,25,100,100,10000])[n+1], 'restaurant.tables.active',(ARRAY[10,0,100,500,500,10000])[n+1],
   'offers.active',(ARRAY[2,5,25,100,100,10000])[n+1], 'contacts.stored',(ARRAY[100,2000,20000,100000,100000,10000000])[n+1],
   'sources.active',(ARRAY[1,2,10,30,30,10000])[n+1], 'knowledge.datasets',(ARRAY[1,3,15,50,50,10000])[n+1],
   'channels.active',(ARRAY[1,2,5,15,15,10000])[n+1], 'channels.mailboxes',(ARRAY[1,1,3,10,10,10000])[n+1],
   'ai.credits.monthly',(ARRAY[100,1000,5000,20000,20000,10000000])[n+1],
   'email.transactional.monthly',(ARRAY[25,1000,5000,20000,20000,10000000])[n+1],
   'email.marketing.monthly',(ARRAY[0,0,10000,50000,50000,10000000])[n+1],
   'email.outbound.daily',(ARRAY[10,200,2000,10000,10000,1000000])[n+1]);
  INSERT INTO public.saas_plan_versions(code,name,features,limits) VALUES(v_code,initcap(v_code),v_features,v_limits) ON CONFLICT(code,version) DO NOTHING;
 END LOOP;
 INSERT INTO public.saas_release_gates(key) SELECT jsonb_object_keys(features) FROM public.saas_plan_versions WHERE code='business' ON CONFLICT DO NOTHING;
END $$;
-- Existing customers are grandfathered, with finite high allowances and no arbitrary trial cutoff.
INSERT INTO public.saas_workspace_accounts(client_id,plan_version_id,access_state,period_end)
 SELECT c.id,p.id,'active',now()+interval '1 month' FROM public.clients c CROSS JOIN public.saas_plan_versions p WHERE p.code='legacy' AND p.version=1 ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.saas_entitlements(p_client uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE a saas_workspace_accounts; p saas_plan_versions; o record; f jsonb; l jsonb; state text;
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
 RETURN jsonb_build_object('client_id',p_client,'plan_code',p.code,'features',f,'limits',l,'operational_state',a.operational_state,
 'access_state',state,'period_start',a.period_start,'period_end',a.period_end,'enforcement_mode',a.enforcement_mode);
END $$;

-- One workspace lock serializes quota checks with plan changes and prevents parallel overspending.
CREATE OR REPLACE FUNCTION public.saas_consume_usage(p_client uuid,p_meter text,p_operation text,p_amount bigint DEFAULT 1) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e jsonb; used bigint; cap bigint; start_at timestamptz; a saas_workspace_accounts; prior bigint;
BEGIN
 IF p_amount<=0 OR length(p_operation)>200 OR length(p_operation)<1 THEN RAISE EXCEPTION 'INVALID_USAGE'; END IF;
 SELECT * INTO a FROM saas_workspace_accounts WHERE client_id=p_client FOR UPDATE;
 e=saas_entitlements(p_client);
 SELECT amount INTO prior FROM saas_usage_events WHERE client_id=p_client AND meter=p_meter AND operation=p_operation;
 IF FOUND THEN
  IF prior<>p_amount THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
  RETURN jsonb_build_object('allowed',true,'duplicate',true);
 END IF;
 IF e->>'operational_state'<>'active' OR e->>'access_state' NOT IN ('active','trialing','past_due_grace') THEN RETURN jsonb_build_object('allowed',false,'message','Workspace access is restricted.'); END IF;
 IF p_meter='ai.credits.monthly' AND coalesce((e->'features'->>'bots.enabled')::boolean,false)=false THEN RETURN jsonb_build_object('allowed',false,'message','AI answers are not enabled for this workspace.'); END IF;
 cap=(e->'limits'->>p_meter)::bigint;
 IF cap IS NULL THEN RAISE EXCEPTION 'UNKNOWN_METER'; END IF;
 start_at=a.period_start;
 IF p_meter LIKE '%.daily' THEN start_at=date_trunc('day',now());
 ELSIF a.access_state<>'trialing' THEN
  WHILE start_at+interval '1 month'<=now() LOOP start_at=start_at+interval '1 month'; END LOOP;
 END IF;
 SELECT coalesce(sum(amount),0) INTO used FROM saas_usage_events WHERE client_id=p_client AND meter=p_meter AND created_at>=start_at AND state<>'released';
 IF used+p_amount>cap AND a.enforcement_mode='enforced' THEN RETURN jsonb_build_object('allowed',false,'message','Workspace allowance reached.','limit',cap,'used',used); END IF;
 INSERT INTO saas_usage_events(client_id,meter,operation,amount) VALUES(p_client,p_meter,p_operation,p_amount);
 RETURN jsonb_build_object('allowed',true,'used',used+p_amount,'limit',cap);
END $$;

-- All admin changes and their before/after audit entry commit together.
CREATE OR REPLACE FUNCTION public.saas_admin_mutate(p_actor uuid,p_action text,p_client uuid,p_payload jsonb,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE before_row jsonb; after_row jsonb; role text; target uuid; next_version int; result jsonb; seats bigint; effective jsonb;
BEGIN
 SELECT role_key INTO role FROM platform_staff_memberships WHERE user_id=p_actor AND status='active';
 IF role IS NULL OR length(trim(p_reason))<10 THEN RAISE EXCEPTION 'ADMIN_PERMISSION_REQUIRED'; END IF;
 IF role<>'platform_owner' AND NOT (
  (p_action='workspace' AND role IN ('operations_admin','security_operator')) OR
  (p_action='subscription' AND role='billing_specialist') OR
  (p_action IN ('override','revoke_override') AND role='operations_admin') OR
  (p_action='case' AND role IN ('operations_admin','support_specialist','billing_specialist')) OR
  (p_action='release' AND role IN ('operations_admin','security_operator'))
  OR (p_action IN ('member','delivery') AND role='operations_admin')
 ) THEN RAISE EXCEPTION 'ADMIN_PERMISSION_REQUIRED'; END IF;
 IF p_client IS NOT NULL THEN
  SELECT to_jsonb(a) INTO before_row FROM saas_workspace_accounts a WHERE client_id=p_client FOR UPDATE;
  IF before_row IS NULL THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
 END IF;
 IF p_action='workspace' THEN
  UPDATE saas_workspace_accounts SET operational_state=p_payload->>'state',version=version+1,updated_at=now() WHERE client_id=p_client;
 ELSIF p_action='subscription' THEN
  UPDATE saas_workspace_accounts SET plan_version_id=(p_payload->>'plan_version_id')::uuid,access_state=p_payload->>'access_state',
   enforcement_mode=coalesce(p_payload->>'enforcement_mode',enforcement_mode),
   trial_ends_at=CASE WHEN p_payload->>'access_state'='trialing' THEN (p_payload->>'expires_at')::timestamptz ELSE trial_ends_at END,
   grace_ends_at=CASE WHEN p_payload->>'access_state'='past_due_grace' THEN (p_payload->>'expires_at')::timestamptz ELSE grace_ends_at END,
   version=version+1,updated_at=now() WHERE client_id=p_client;
 ELSIF p_action='override' THEN
  IF (p_payload->>'expires_at')::timestamptz<=now() OR (p_payload->>'expires_at')::timestamptz>now()+interval '366 days' THEN RAISE EXCEPTION 'INVALID_EXPIRY'; END IF;
  INSERT INTO saas_entitlement_overrides(client_id,key,value,reason,expires_at,created_by)
   VALUES(p_client,p_payload->>'key',p_payload->'value',p_reason,(p_payload->>'expires_at')::timestamptz,p_actor) RETURNING to_jsonb(saas_entitlement_overrides.*) INTO result;
 ELSIF p_action='revoke_override' THEN
  UPDATE saas_entitlement_overrides SET revoked_at=now() WHERE id=(p_payload->>'id')::uuid AND client_id=p_client;
 ELSIF p_action='plan' THEN
  PERFORM pg_advisory_xact_lock(hashtext('saas_plan_publish'));
  SELECT coalesce(max(version),0)+1 INTO next_version FROM saas_plan_versions WHERE code=p_payload->>'code';
  INSERT INTO saas_plan_versions(code,name,version,features,limits,price_minor,currency,billing_interval)
   VALUES(p_payload->>'code',p_payload->>'name',next_version,p_payload->'features',p_payload->'limits',(p_payload->>'price_minor')::bigint,p_payload->>'currency',p_payload->>'billing_interval') RETURNING to_jsonb(saas_plan_versions.*) INTO result;
 ELSIF p_action='staff' THEN
  PERFORM pg_advisory_xact_lock(hashtext('saas_staff_mutate'));
  target=(p_payload->>'user_id')::uuid;
  IF target=p_actor THEN RAISE EXCEPTION 'CANNOT_CHANGE_OWN_STAFF_ACCESS'; END IF;
  INSERT INTO platform_staff_memberships(user_id,role_key,status,require_mfa) VALUES(target,p_payload->>'role_key',p_payload->>'status',true)
   ON CONFLICT(user_id) DO UPDATE SET role_key=excluded.role_key,status=excluded.status,require_mfa=true;
 ELSIF p_action='release' THEN
  UPDATE saas_release_gates SET enabled=(p_payload->>'enabled')::boolean,updated_at=now() WHERE key=p_payload->>'key';
 ELSIF p_action='case' THEN
  UPDATE saas_requests SET status=p_payload->>'status',response=left(p_payload->>'response',10000),updated_at=now() WHERE id=(p_payload->>'id')::uuid AND client_id=p_client;
 ELSIF p_action='member' THEN
  SELECT to_jsonb(m) INTO before_row FROM workspace_memberships m WHERE id=(p_payload->>'id')::uuid AND client_id=p_client FOR UPDATE;
  IF before_row IS NULL OR before_row->>'role_key'='owner' OR p_payload->>'role_key'='owner' THEN RAISE EXCEPTION 'OWNER_CHANGE_REQUIRES_TRANSFER'; END IF;
  IF before_row->>'status'='revoked' AND p_payload->>'status'='active' THEN
   effective=saas_entitlements(p_client);
   SELECT count(*) INTO seats FROM workspace_memberships WHERE client_id=p_client AND status='active';
   seats=seats+(SELECT count(*) FROM saas_invitations WHERE client_id=p_client AND status='pending' AND expires_at>now());
   IF seats>=(effective->'limits'->>'members.seats')::bigint THEN RAISE EXCEPTION 'TEAM_SEAT_LIMIT_REACHED'; END IF;
  END IF;
  UPDATE workspace_memberships SET role_key=p_payload->>'role_key',status=p_payload->>'status' WHERE id=(p_payload->>'id')::uuid AND client_id=p_client RETURNING to_jsonb(workspace_memberships.*) INTO result;
 ELSIF p_action='delivery' THEN
  PERFORM saas_finish_delivery(p_client,p_payload->>'operation',p_payload->>'status',p_payload->>'message_id','operator_reconciled');
 ELSE RAISE EXCEPTION 'UNKNOWN_ACTION'; END IF;
 SELECT to_jsonb(a) INTO after_row FROM saas_workspace_accounts a WHERE client_id=p_client;
 INSERT INTO saas_audit_events(actor_id,client_id,action,reason,before_value,after_value)
  VALUES(p_actor,p_client,p_action,p_reason,before_row,coalesce(result,p_payload)||coalesce(after_row,'{}'));
 RETURN coalesce(result,after_row,'{}');
END $$;

-- Gauge limits execute inside the domain write transaction, including CSV upserts and browser writes.
CREATE OR REPLACE FUNCTION public.saas_resource_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid; e jsonb; count_now bigint; cap bigint; field text; oldj jsonb; newj jsonb; active_before boolean; active_after boolean; existing jsonb;
BEGIN
 newj=to_jsonb(NEW); cid=(newj->>'client_id')::uuid;
 IF cid IS NULL THEN RETURN NEW; END IF;
 PERFORM 1 FROM saas_workspace_accounts WHERE client_id=cid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SAAS_ACCOUNT_NOT_CONFIGURED'; END IF;
 e=saas_entitlements(cid);
 IF e->>'operational_state'='suspended' THEN RAISE EXCEPTION 'WORKSPACE_SUSPENDED'; END IF;
 oldj=CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) ELSE NULL END;
 -- INSERT ... ON CONFLICT fires BEFORE INSERT too. Treat same-SKU upserts as updates.
 IF TG_TABLE_NAME='catalog_products' AND TG_OP='INSERT' THEN
  SELECT to_jsonb(p) INTO existing FROM catalog_products p WHERE client_id=cid AND sku=newj->>'sku';
  IF existing IS NOT NULL THEN oldj=existing; END IF;
 END IF;
 active_before=oldj IS NOT NULL AND coalesce(oldj->>'status','active')='active';
 active_after=coalesce(newj->>'status','active')='active';
 IF oldj IS NULL OR (active_after AND NOT active_before) THEN
  IF e->>'operational_state'<>'active' OR e->>'access_state' NOT IN ('active','trialing','past_due_grace') THEN RAISE EXCEPTION 'WORKSPACE_RESTRICTED'; END IF;
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
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('bots','bots.enabled','bots.retained','bots.active'),('catalog_products','commerce.enabled','products.retained','products.active'),
 ('booking_services','booking.enabled','services.active',''),('booking_offers','booking.enabled','offers.active',''),
 ('datasets','knowledge.enabled','knowledge.datasets',''),('data_sources','sources.enabled','sources.active',''),
 ('channel_integrations','','channels.active',''),('contacts','','contacts.stored','')
 ) t(tbl,feature,retained,active) LOOP
  IF to_regclass('public.'||r.tbl) IS NOT NULL THEN
   EXECUTE format('DROP TRIGGER IF EXISTS saas_resource_guard ON public.%I',r.tbl);
   EXECUTE format('CREATE TRIGGER saas_resource_guard BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION saas_resource_guard(%L,%L,%L)',r.tbl,r.feature,r.retained,r.active);
  END IF;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.saas_provision_account() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO saas_workspace_accounts(client_id,plan_version_id,trial_ends_at)
 SELECT NEW.id,id,now()+interval '14 days' FROM saas_plan_versions WHERE code='trial' ORDER BY version DESC LIMIT 1 ON CONFLICT DO NOTHING;
 INSERT INTO workspace_memberships(client_id,user_id,role_key) SELECT NEW.id,id,'owner' FROM auth.users WHERE id=NEW.id ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS saas_provision_account ON public.clients;
CREATE TRIGGER saas_provision_account AFTER INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION public.saas_provision_account();

-- Control tables are server-only. Tenant views use authenticated, scoped API handlers.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['platform_staff_memberships','workspace_memberships','saas_plan_versions','saas_workspace_accounts','saas_entitlement_overrides','saas_release_gates','saas_audit_events','saas_usage_events','saas_requests','saas_invitations'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.saas_entitlements(uuid),public.saas_consume_usage(uuid,text,text,bigint),public.saas_admin_mutate(uuid,text,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_entitlements(uuid),public.saas_consume_usage(uuid,text,text,bigint),public.saas_admin_mutate(uuid,text,uuid,jsonb,text) TO service_role;
CREATE OR REPLACE FUNCTION public.saas_usage_snapshot(p_client uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e jsonb; item record; used bigint; tbl text; result jsonb='[]'; start_at timestamptz;
BEGIN
 e=saas_entitlements(p_client);
 FOR item IN SELECT key,value FROM jsonb_each(e->'limits') LOOP
  tbl=CASE item.key WHEN 'bots.active' THEN 'bots' WHEN 'bots.retained' THEN 'bots'
    WHEN 'storefronts.total' THEN 'workspace_storefronts'
    WHEN 'products.active' THEN 'catalog_products' WHEN 'products.retained' THEN 'catalog_products'
    WHEN 'members.seats' THEN 'workspace_memberships' WHEN 'services.active' THEN 'booking_services'
    WHEN 'offers.active' THEN 'booking_offers' WHEN 'contacts.stored' THEN 'contacts'
    WHEN 'sources.active' THEN 'data_sources' WHEN 'knowledge.datasets' THEN 'datasets'
    WHEN 'channels.active' THEN 'channel_integrations' WHEN 'channels.mailboxes' THEN 'channel_integrations' ELSE NULL END;
  start_at=(e->>'period_start')::timestamptz;
  IF item.key LIKE '%.daily' THEN start_at=date_trunc('day',now());
  ELSIF e->>'plan_code'<>'trial' THEN WHILE start_at+interval '1 month'<=now() LOOP start_at=start_at+interval '1 month'; END LOOP; END IF;
  IF tbl IS NOT NULL THEN
   EXECUTE format('SELECT count(*) FROM public.%I t WHERE client_id=$1 AND ($2 NOT IN (''bots.active'',''products.active'',''members.seats'') OR to_jsonb(t)->>''status''=''active'') AND ($2<>''channels.mailboxes'' OR to_jsonb(t)->>''channel''=''email'')',tbl) INTO used USING p_client,item.key;
   IF item.key='members.seats' THEN used=used+(SELECT count(*) FROM saas_invitations WHERE client_id=p_client AND status='pending' AND expires_at>now()); END IF;
  ELSIF item.key='restaurant.tables.active' THEN
   SELECT count(*) INTO used FROM booking_services s CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.configuration#>'{restaurant,tables}','[]')) t WHERE s.client_id=p_client AND coalesce((t->>'active')::boolean,true);
  ELSE SELECT coalesce(sum(amount),0) INTO used FROM saas_usage_events WHERE client_id=p_client AND meter=item.key AND created_at>=start_at AND state<>'released'; END IF;
  result=result||jsonb_build_array(jsonb_build_object('meter',item.key,'used',used,'limit',(item.value::text)::bigint,'remaining',greatest(0,(item.value::text)::bigint-used),'window_start',CASE WHEN tbl IS NULL THEN start_at ELSE NULL END));
 END LOOP;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.saas_team_mutate(p_actor uuid,p_client uuid,p_action text,p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_role text; e jsonb; seats bigint; invitation saas_invitations; member workspace_memberships; email_address text; result jsonb;
BEGIN
 PERFORM 1 FROM saas_workspace_accounts WHERE client_id=p_client FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND'; END IF;
 IF p_action='accept' THEN
  SELECT * INTO invitation FROM saas_invitations WHERE client_id=p_client AND token_hash=p_payload->>'token_hash' AND status='pending' AND expires_at>now() FOR UPDATE;
  SELECT lower(email) INTO email_address FROM auth.users WHERE id=p_actor AND email_confirmed_at IS NOT NULL;
  IF invitation.id IS NULL OR invitation.email IS DISTINCT FROM email_address THEN RAISE EXCEPTION 'INVALID_INVITATION'; END IF;
  INSERT INTO workspace_memberships(client_id,user_id,role_key,status) VALUES(p_client,p_actor,invitation.role_key,'active') ON CONFLICT(client_id,user_id) DO UPDATE SET status='active',role_key=CASE WHEN workspace_memberships.role_key='owner' THEN 'owner' ELSE excluded.role_key END;
  UPDATE saas_invitations SET status='accepted' WHERE id=invitation.id;
 ELSE
  SELECT role_key INTO actor_role FROM workspace_memberships WHERE client_id=p_client AND user_id=p_actor AND status='active';
  IF actor_role IS NULL OR actor_role NOT IN ('owner','workspace_admin') THEN RAISE EXCEPTION 'TEAM_PERMISSION_REQUIRED'; END IF;
  IF p_action='invite' THEN
   email_address=lower(trim(p_payload->>'email'));
   IF email_address NOT LIKE '%@%.%' THEN RAISE EXCEPTION 'INVALID_EMAIL'; END IF;
   IF EXISTS(SELECT 1 FROM workspace_memberships m JOIN auth.users u ON u.id=m.user_id WHERE m.client_id=p_client AND m.status='active' AND lower(u.email)=email_address) THEN RAISE EXCEPTION 'ALREADY_A_MEMBER'; END IF;
   IF EXISTS(SELECT 1 FROM saas_invitations WHERE client_id=p_client AND email=email_address AND status='pending' AND expires_at>now()) THEN RAISE EXCEPTION 'INVITATION_ALREADY_PENDING'; END IF;
   e=saas_entitlements(p_client);
   SELECT count(*) INTO seats FROM workspace_memberships WHERE client_id=p_client AND status='active';
   seats=seats+(SELECT count(*) FROM saas_invitations WHERE client_id=p_client AND status='pending' AND expires_at>now());
   IF seats>=(e->'limits'->>'members.seats')::bigint THEN RAISE EXCEPTION 'TEAM_SEAT_LIMIT_REACHED'; END IF;
   INSERT INTO saas_invitations(client_id,email,role_key,token_hash) VALUES(p_client,email_address,p_payload->>'role_key',p_payload->>'token_hash') RETURNING jsonb_build_object('id',id) INTO result;
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
   UPDATE workspace_memberships SET role_key=p_payload->>'role_key',status=p_payload->>'status' WHERE id=member.id;
  ELSE RAISE EXCEPTION 'UNKNOWN_ACTION'; END IF;
 END IF;
 INSERT INTO saas_audit_events(actor_id,client_id,action,reason,after_value) VALUES(p_actor,p_client,'team.'||p_action,'Workspace team management',p_payload-'token_hash');
 RETURN coalesce(result,'{}');
END $$;
REVOKE ALL ON FUNCTION public.saas_usage_snapshot(uuid),public.saas_team_mutate(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_usage_snapshot(uuid),public.saas_team_mutate(uuid,uuid,text,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
