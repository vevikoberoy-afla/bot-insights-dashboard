-- Membership authorization for existing dashboard reads and writes.
BEGIN;
CREATE OR REPLACE FUNCTION public.saas_member_access(p_client uuid,p_area text,p_write boolean DEFAULT false) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE r text; state text;
BEGIN
 SELECT m.role_key,a.operational_state INTO r,state FROM workspace_memberships m JOIN saas_workspace_accounts a ON a.client_id=m.client_id
 WHERE m.client_id=p_client AND m.user_id=auth.uid() AND m.status='active';
 IF r IS NULL OR state='suspended' THEN RETURN false; END IF;
 IF r IN ('owner','workspace_admin') THEN RETURN true; END IF;
 IF p_write THEN RETURN CASE r WHEN 'agent' THEN p_area IN ('inbox','tickets','contacts') WHEN 'booking_commerce_operator' THEN p_area IN ('commerce','features') ELSE false END; END IF;
 RETURN CASE r WHEN 'agent' THEN p_area IN ('bots','inbox','tickets','contacts','commerce','features','knowledge')
  WHEN 'booking_commerce_operator' THEN p_area IN ('bots','commerce','features','contacts')
  WHEN 'analyst' THEN p_area IN ('analytics','features','commerce','usage')
  WHEN 'billing_manager' THEN p_area IN ('billing','usage') ELSE false END;
END $$;
REVOKE ALL ON FUNCTION public.saas_member_access(uuid,text,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.saas_member_access(uuid,text,boolean) TO authenticated,service_role;

-- Replace permissive tenant policies rather than layering a permissive policy on top.
DO $$ DECLARE t record; p record; area text; BEGIN
 FOR t IN SELECT c.table_name FROM information_schema.columns c JOIN information_schema.tables tb USING(table_schema,table_name)
  WHERE c.table_schema='public' AND c.column_name='client_id' AND tb.table_type='BASE TABLE'
    AND c.table_name NOT LIKE 'saas_%' AND c.table_name NOT IN ('workspace_memberships','platform_staff_memberships') LOOP
  area=CASE WHEN t.table_name IN ('bots','bot_datasets','bot_databases','bot_commerce_config','bot_booking_services','bot_booking_offers','bot_catalog_products','bot_faqs') THEN 'bots'
   WHEN t.table_name LIKE '%ticket%' OR t.table_name LIKE 'support_%' THEN 'tickets'
   WHEN t.table_name LIKE '%contact%' OR t.table_name LIKE '%segment%' THEN 'contacts'
   WHEN t.table_name LIKE '%booking%' THEN 'features'
   WHEN t.table_name LIKE 'commerce_%' OR t.table_name LIKE 'catalog_%' OR t.table_name LIKE 'inventory_%' OR t.table_name='sales_orders' THEN 'commerce'
   WHEN t.table_name IN ('sessions','handoff_requests','messages') THEN 'inbox'
   WHEN t.table_name IN ('datasets','dataset_sources','chunks') THEN 'knowledge'
   WHEN t.table_name IN ('data_sources','database_sources') THEN 'sources'
   WHEN t.table_name IN ('subscriptions','invoices') THEN 'billing'
   WHEN t.table_name LIKE '%campaign%' THEN 'campaigns' ELSE 'settings' END;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.table_name);
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t.table_name AND (roles && ARRAY['authenticated','public','anon']::name[]) LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,t.table_name);
  END LOOP;
  EXECUTE format('CREATE POLICY saas_member_read ON public.%I FOR SELECT TO authenticated USING(public.saas_member_access(client_id,%L,false))',t.table_name,area);
  -- Financial and credential rows remain server-only for mutations.
  IF area NOT IN ('billing') AND t.table_name NOT IN ('api_keys','channel_integrations') THEN
   EXECUTE format('CREATE POLICY saas_member_write ON public.%I FOR ALL TO authenticated USING(public.saas_member_access(client_id,%L,true)) WITH CHECK(public.saas_member_access(client_id,%L,true))',t.table_name,area,area);
  END IF;
 END LOOP;
 FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='clients' AND (roles && ARRAY['authenticated','public','anon']::name[]) LOOP EXECUTE format('DROP POLICY %I ON public.clients',p.policyname); END LOOP;
END $$;
CREATE POLICY saas_client_read ON public.clients FOR SELECT TO authenticated USING(public.saas_member_access(id,'settings',false));
CREATE POLICY saas_client_update ON public.clients FOR UPDATE TO authenticated USING(public.saas_member_access(id,'settings',true)) WITH CHECK(public.saas_member_access(id,'settings',true));

-- Child-table relationships use the parent's workspace; no implicit cross-tenant reads.
DO $$ DECLARE r record; p record; BEGIN
 FOR r IN SELECT * FROM (VALUES
  ('bot_datasets','bots','bot_id','bots'),('bot_databases','bots','bot_id','bots'),('bot_channels','bots','bot_id','bots'),
  ('dataset_sources','datasets','dataset_id','knowledge'),('database_sources','data_sources','database_id','sources'),
  ('ticket_messages','tickets','ticket_id','tickets'),('ticket_tag_mappings','tickets','ticket_id','tickets'),
  ('campaign_messages','campaigns','campaign_id','campaigns'),('campaign_recipients','campaigns','campaign_id','campaigns')
 ) t(child,parent,fk,area) LOOP
  IF to_regclass('public.'||r.child) IS NULL THEN CONTINUE; END IF;
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=r.child AND (roles && ARRAY['authenticated','public','anon']::name[]) LOOP
   EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,r.child);
  END LOOP;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',r.child);
  EXECUTE format('CREATE POLICY saas_child_read ON public.%I FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.%I p WHERE p.id=%I.%I AND public.saas_member_access(p.client_id,%L,false)))',r.child,r.parent,r.child,r.fk,r.area);
 END LOOP;
END $$;

-- Browser users cannot retarget a workspace to another customer's context or identity.
CREATE OR REPLACE FUNCTION public.saas_client_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF current_user IN ('authenticated','anon') AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.context_id IS DISTINCT FROM OLD.context_id OR NEW.organization_id IS DISTINCT FROM OLD.organization_id) THEN RAISE EXCEPTION 'WORKSPACE_IDENTITY_IS_SERVER_MANAGED'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS saas_client_guard ON public.clients;
CREATE TRIGGER saas_client_guard BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.saas_client_guard();

-- New transactions are entitlement-gated. Existing cancellation/fulfillment updates stay available.
CREATE OR REPLACE FUNCTION public.saas_transaction_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e jsonb; BEGIN
 e=saas_entitlements(NEW.client_id);
 IF e->>'operational_state'<>'active' OR e->>'access_state' NOT IN ('active','trialing','past_due_grace') OR coalesce((e->'features'->>TG_ARGV[0])::boolean,false)=false THEN RAISE EXCEPTION 'NEW_TRANSACTIONS_UNAVAILABLE'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS saas_order_access ON public.commerce_orders;
CREATE TRIGGER saas_order_access BEFORE INSERT ON public.commerce_orders FOR EACH ROW EXECUTE FUNCTION public.saas_transaction_guard('commerce.enabled');
DROP TRIGGER IF EXISTS saas_booking_access ON public.feature_bookings;
CREATE TRIGGER saas_booking_access BEFORE INSERT ON public.feature_bookings FOR EACH ROW EXECUTE FUNCTION public.saas_transaction_guard('booking.enabled');
DO $$ BEGIN
 IF to_regclass('public.tickets') IS NOT NULL THEN
  EXECUTE 'DROP TRIGGER IF EXISTS saas_ticket_access ON public.tickets';
  EXECUTE 'CREATE TRIGGER saas_ticket_access BEFORE INSERT ON public.tickets FOR EACH ROW EXECUTE FUNCTION public.saas_transaction_guard(''support.enabled'')';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION public.saas_restaurant_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e jsonb; n bigint; prior jsonb; BEGIN
 IF TG_OP='UPDATE' THEN prior=OLD.configuration->'restaurant'; END IF;
 IF NEW.configuration->'restaurant' IS NOT DISTINCT FROM prior THEN RETURN NEW; END IF;
 IF coalesce((NEW.configuration#>>'{restaurant,enabled}')::boolean,false)=false THEN RETURN NEW; END IF;
 PERFORM 1 FROM saas_workspace_accounts WHERE client_id=NEW.client_id FOR UPDATE;
 e=saas_entitlements(NEW.client_id);
 IF coalesce((e->'features'->>'restaurant.enabled')::boolean,false)=false THEN RAISE EXCEPTION 'RESTAURANT_PLAN_REQUIRED'; END IF;
 SELECT count(*) INTO n FROM booking_services s CROSS JOIN LATERAL jsonb_array_elements(coalesce(s.configuration#>'{restaurant,tables}','[]')) t
 WHERE s.client_id=NEW.client_id AND s.id<>NEW.id AND coalesce((t->>'active')::boolean,true);
 n=n+(SELECT count(*) FROM jsonb_array_elements(coalesce(NEW.configuration#>'{restaurant,tables}','[]')) t WHERE coalesce((t->>'active')::boolean,true));
 IF n>(e->'limits'->>'restaurant.tables.active')::bigint AND e->>'enforcement_mode'='enforced' THEN RAISE EXCEPTION 'RESTAURANT_TABLE_LIMIT'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS saas_restaurant_guard ON public.booking_services;
CREATE TRIGGER saas_restaurant_guard BEFORE INSERT OR UPDATE ON public.booking_services FOR EACH ROW EXECUTE FUNCTION public.saas_restaurant_guard();
-- PostgreSQL views otherwise run with their owner's RLS privileges.
DO $$ DECLARE v text; BEGIN
 FOREACH v IN ARRAY ARRAY['catalog_product_availability','booking_offer_stats','client_daily_stats'] LOOP
  IF EXISTS(SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname=v) THEN EXECUTE format('ALTER VIEW public.%I SET (security_invoker=true)',v); END IF;
 END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
