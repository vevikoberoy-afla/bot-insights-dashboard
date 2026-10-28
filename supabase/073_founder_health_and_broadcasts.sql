-- Founder health radar and targeted customer notices. Apply after 072.
BEGIN;

CREATE TABLE IF NOT EXISTS public.saas_workspace_broadcasts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 message text NOT NULL CHECK(length(message) BETWEEN 1 AND 2000),
 severity text NOT NULL DEFAULT 'info' CHECK(severity IN ('info','warning','critical','success')),
 target_type text NOT NULL DEFAULT 'all' CHECK(target_type IN ('all','workspace','plan')),
 target_value text,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','ended')),
 starts_at timestamptz NOT NULL DEFAULT now(),
 ends_at timestamptz,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((target_type='all' AND target_value IS NULL) OR (target_type<>'all' AND length(target_value)>0)),
 CHECK(ends_at IS NULL OR ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS saas_workspace_broadcasts_live ON public.saas_workspace_broadcasts(status,starts_at,ends_at);
ALTER TABLE public.saas_workspace_broadcasts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saas_workspace_broadcasts FROM anon,authenticated;
GRANT ALL ON public.saas_workspace_broadcasts TO service_role;

CREATE OR REPLACE FUNCTION public.saas_workspace_active_broadcasts(p_client uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY CASE b.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,b.created_at DESC),'[]'::jsonb)
 FROM saas_workspace_broadcasts b
 JOIN saas_workspace_accounts a ON a.client_id=p_client
 JOIN saas_plan_versions p ON p.id=a.plan_version_id
 WHERE b.status='active' AND b.starts_at<=now() AND (b.ends_at IS NULL OR b.ends_at>now())
 AND (b.target_type='all' OR (b.target_type='workspace' AND b.target_value=p_client::text) OR (b.target_type='plan' AND b.target_value=p.code))
$$;

CREATE OR REPLACE FUNCTION public.saas_manage_broadcast(p_actor uuid,p_id uuid,p_payload jsonb,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE role text; prior jsonb; result jsonb; action text; BEGIN
 SELECT role_key INTO role FROM platform_staff_memberships WHERE user_id=p_actor AND status='active';
 IF role NOT IN ('platform_owner','operations_admin') OR length(trim(coalesce(p_reason,'')))<10 THEN RAISE EXCEPTION 'ADMIN_PERMISSION_REQUIRED'; END IF;
 action=coalesce(p_payload->>'operation','create');
 IF action='create' THEN
  INSERT INTO saas_workspace_broadcasts(title,message,severity,target_type,target_value,status,starts_at,ends_at,created_by)
  VALUES(left(trim(p_payload->>'title'),160),left(trim(p_payload->>'message'),2000),p_payload->>'severity',p_payload->>'target_type',nullif(trim(p_payload->>'target_value'),''),
   p_payload->>'status',(p_payload->>'starts_at')::timestamptz,nullif(p_payload->>'ends_at','')::timestamptz,p_actor)
  RETURNING to_jsonb(saas_workspace_broadcasts.*) INTO result;
 ELSE
  SELECT to_jsonb(b) INTO prior FROM saas_workspace_broadcasts b WHERE id=p_id FOR UPDATE;
  IF prior IS NULL THEN RAISE EXCEPTION 'BROADCAST_NOT_FOUND'; END IF;
  IF action='end' THEN UPDATE saas_workspace_broadcasts SET status='ended',ends_at=coalesce(ends_at,now()),updated_at=now() WHERE id=p_id RETURNING to_jsonb(saas_workspace_broadcasts.*) INTO result;
  ELSIF action='activate' THEN UPDATE saas_workspace_broadcasts SET status='active',updated_at=now() WHERE id=p_id RETURNING to_jsonb(saas_workspace_broadcasts.*) INTO result;
  ELSE RAISE EXCEPTION 'INVALID_BROADCAST_OPERATION'; END IF;
 END IF;
 INSERT INTO saas_audit_events(actor_id,action,reason,before_value,after_value) VALUES(p_actor,'founder.broadcast.'||action,p_reason,prior,result);
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.saas_workspace_active_broadcasts(uuid),public.saas_manage_broadcast(uuid,uuid,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_workspace_active_broadcasts(uuid),public.saas_manage_broadcast(uuid,uuid,jsonb,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
