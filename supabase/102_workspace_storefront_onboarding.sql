-- Workspace-owned Commerce and Booking storefronts. Apply after 067 and the
-- commerce/booking migrations. Re-runnable and isolated from chatbot hot paths.
BEGIN;

CREATE TABLE IF NOT EXISTS public.workspace_storefronts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('commerce','booking')),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','paused')),
  is_primary boolean NOT NULL DEFAULT false,
  timezone text NOT NULL DEFAULT 'UTC' CHECK (char_length(timezone) BETWEEN 1 AND 64),
  currency text NOT NULL DEFAULT 'INR' CHECK (currency ~ '^[A-Z]{3}$'),
  locale text NOT NULL DEFAULT 'en-IN' CHECK (char_length(locale) BETWEEN 2 AND 16),
  contact_email text,
  contact_phone text,
  website_url text,
  address jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(address)='object'),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings)='object'),
  onboarding_step smallint NOT NULL DEFAULT 1 CHECK (onboarding_step BETWEEN 1 AND 4),
  onboarding_completed_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_storefronts_name_unique UNIQUE (client_id, name)
);
-- Older installations allowed only one store of each type. Store count is now
-- governed by the SaaS entitlement and clients may own multiple same-kind stores.
ALTER TABLE public.workspace_storefronts DROP CONSTRAINT IF EXISTS workspace_storefronts_client_id_kind_key;
CREATE UNIQUE INDEX IF NOT EXISTS workspace_storefronts_name_unique_idx
  ON public.workspace_storefronts(client_id,lower(name));

-- Backfill the new allowance into every immutable plan snapshot. Founder
-- overrides can then change it per workspace through the normal control plane.
UPDATE public.saas_plan_versions
SET limits=jsonb_set(limits,'{storefronts.total}',to_jsonb(CASE code
  WHEN 'trial' THEN 1 WHEN 'starter' THEN 1 WHEN 'growth' THEN 3
  WHEN 'business' THEN 10 WHEN 'enterprise' THEN 50 ELSE 1000 END),true)
WHERE NOT limits ? 'storefronts.total';
CREATE UNIQUE INDEX IF NOT EXISTS workspace_storefronts_one_primary
  ON public.workspace_storefronts(client_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS workspace_storefronts_client
  ON public.workspace_storefronts(client_id,status,created_at);

CREATE TABLE IF NOT EXISTS public.workspace_storefront_bots (
  storefront_id uuid NOT NULL REFERENCES public.workspace_storefronts(id) ON DELETE CASCADE,
  bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (storefront_id,bot_id)
);
CREATE INDEX IF NOT EXISTS workspace_storefront_bots_bot ON public.workspace_storefront_bots(bot_id);

CREATE OR REPLACE FUNCTION public.configure_workspace_storefront(
  p_actor uuid,
  p_client uuid,
  p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  member workspace_memberships;
  entitlement jsonb;
  target workspace_storefronts;
  store_kind text=lower(trim(coalesce(p_payload->>'kind','')));
  store_name text=trim(coalesce(p_payload->>'name',''));
  bot_ids jsonb=coalesce(p_payload->'bot_ids','[]'::jsonb);
  before_value jsonb;
  make_primary boolean=coalesce((p_payload->>'make_primary')::boolean,false);
  target_id uuid=CASE WHEN nullif(p_payload->>'id','') IS NULL THEN NULL ELSE (p_payload->>'id')::uuid END;
  store_count bigint;
  store_limit bigint;
BEGIN
  SELECT * INTO member FROM workspace_memberships
    WHERE client_id=p_client AND user_id=p_actor AND status='active' FOR SHARE;
  IF member.id IS NULL OR member.role_key NOT IN ('owner','workspace_admin') THEN
    RAISE EXCEPTION 'STORE_ADMIN_REQUIRED';
  END IF;
  IF store_kind NOT IN ('commerce','booking') OR char_length(store_name) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'INVALID_STOREFRONT';
  END IF;
  IF jsonb_typeof(bot_ids)<>'array' OR jsonb_array_length(bot_ids)>100 THEN RAISE EXCEPTION 'INVALID_BOT_ASSIGNMENTS'; END IF;
  entitlement=saas_entitlements(p_client);
  IF coalesce((entitlement->'features'->>(store_kind||'.enabled'))::boolean,false)=false THEN
    RAISE EXCEPTION 'PLAN_FEATURE_UNAVAILABLE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(bot_ids) value
    LEFT JOIN bots b ON b.id=value::uuid AND b.client_id=p_client
    WHERE b.id IS NULL
  ) THEN RAISE EXCEPTION 'INVALID_BOT_ASSIGNMENTS'; END IF;

  -- Serialize creation with plan changes and other concurrent store creation.
  PERFORM 1 FROM saas_workspace_accounts WHERE client_id=p_client FOR UPDATE;
  entitlement=saas_entitlements(p_client);
  store_limit=coalesce((entitlement->'limits'->>'storefronts.total')::bigint,1);
  SELECT count(*) INTO store_count FROM workspace_storefronts WHERE client_id=p_client;
  IF target_id IS NULL AND store_count>=store_limit THEN RAISE EXCEPTION 'STOREFRONT_LIMIT_REACHED'; END IF;
  IF target_id IS NOT NULL THEN
    SELECT * INTO target FROM workspace_storefronts WHERE id=target_id AND client_id=p_client FOR UPDATE;
    IF target.id IS NULL THEN RAISE EXCEPTION 'STOREFRONT_NOT_FOUND'; END IF;
    SELECT to_jsonb(target) INTO before_value;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM workspace_storefronts WHERE client_id=p_client) THEN make_primary=true; END IF;
  IF make_primary THEN UPDATE workspace_storefronts SET is_primary=false,updated_at=now() WHERE client_id=p_client; END IF;

  IF target_id IS NULL THEN
    INSERT INTO workspace_storefronts(
      client_id,kind,name,status,is_primary,timezone,currency,locale,contact_email,
      contact_phone,website_url,address,settings,onboarding_step,onboarding_completed_at,created_by
    ) VALUES (
      p_client,store_kind,store_name,
      CASE WHEN coalesce((p_payload->>'complete')::boolean,false) THEN 'active' ELSE 'draft' END,
      make_primary,coalesce(nullif(trim(p_payload->>'timezone'),''),'UTC'),
      upper(coalesce(nullif(trim(p_payload->>'currency'),''),'INR')),
      coalesce(nullif(trim(p_payload->>'locale'),''),'en-IN'),nullif(trim(p_payload->>'contact_email'),''),
      nullif(trim(p_payload->>'contact_phone'),''),nullif(trim(p_payload->>'website_url'),''),
      coalesce(p_payload->'address','{}'::jsonb),coalesce(p_payload->'settings','{}'::jsonb),
      CASE WHEN coalesce((p_payload->>'complete')::boolean,false) THEN 4 ELSE greatest(1,least(4,coalesce((p_payload->>'onboarding_step')::smallint,1))) END,
      CASE WHEN coalesce((p_payload->>'complete')::boolean,false) THEN now() ELSE NULL END,p_actor
    ) RETURNING * INTO target;
  ELSE
    UPDATE workspace_storefronts SET kind=store_kind,name=store_name,
      status=CASE WHEN coalesce((p_payload->>'complete')::boolean,false) THEN 'active' ELSE status END,
      is_primary=CASE WHEN make_primary THEN true ELSE is_primary END,
      timezone=coalesce(nullif(trim(p_payload->>'timezone'),''),'UTC'),currency=upper(coalesce(nullif(trim(p_payload->>'currency'),''),'INR')),
      locale=coalesce(nullif(trim(p_payload->>'locale'),''),'en-IN'),contact_email=nullif(trim(p_payload->>'contact_email'),''),
      contact_phone=nullif(trim(p_payload->>'contact_phone'),''),website_url=nullif(trim(p_payload->>'website_url'),''),
      address=coalesce(p_payload->'address','{}'::jsonb),settings=coalesce(p_payload->'settings','{}'::jsonb),
      onboarding_step=CASE WHEN coalesce((p_payload->>'complete')::boolean,false) THEN 4 ELSE greatest(1,least(4,coalesce((p_payload->>'onboarding_step')::smallint,1))) END,
      onboarding_completed_at=CASE WHEN coalesce((p_payload->>'complete')::boolean,false) THEN coalesce(onboarding_completed_at,now()) ELSE onboarding_completed_at END,updated_at=now()
    WHERE id=target_id AND client_id=p_client RETURNING * INTO target;
  END IF;

  DELETE FROM workspace_storefront_bots WHERE storefront_id=target.id;
  INSERT INTO workspace_storefront_bots(storefront_id,bot_id)
    SELECT target.id,value::uuid FROM jsonb_array_elements_text(bot_ids) value ON CONFLICT DO NOTHING;
  INSERT INTO saas_audit_events(actor_id,client_id,action,reason,before_value,after_value)
    VALUES(p_actor,p_client,'storefront.configure','Workspace administrator configured My Store',before_value,to_jsonb(target));
  RETURN to_jsonb(target)||jsonb_build_object('bot_ids',bot_ids);
END $$;

ALTER TABLE public.workspace_storefronts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_storefront_bots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.workspace_storefronts,public.workspace_storefront_bots FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.workspace_storefronts,public.workspace_storefront_bots TO service_role;
REVOKE ALL ON FUNCTION public.configure_workspace_storefront(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.configure_workspace_storefront(uuid,uuid,jsonb) TO service_role;

COMMIT;
