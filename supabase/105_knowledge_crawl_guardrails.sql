-- Re-runnable. Crawl policy uses existing founder plans / account overrides.
BEGIN;
ALTER TABLE public.chunks ALTER COLUMN context_id DROP NOT NULL;
ALTER TABLE public.dataset_sources ADD COLUMN IF NOT EXISTS crawl_state jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.dataset_sources ADD COLUMN IF NOT EXISTS crawl_lease uuid;
ALTER TABLE public.dataset_sources ADD COLUMN IF NOT EXISTS crawl_lease_until timestamptz;

UPDATE public.saas_plan_versions SET
 features=jsonb_build_object('knowledge.crawl.discovery',code IN ('growth','business','enterprise','legacy'),
 'knowledge.crawl.autonomous',code IN ('business','enterprise','legacy')) || features,
 limits=jsonb_build_object(
 'knowledge.crawl.pages.monthly',CASE code WHEN 'trial' THEN 3 WHEN 'starter' THEN 3 WHEN 'growth' THEN 100 WHEN 'business' THEN 1000 ELSE 5000 END,
 'knowledge.crawl.maps.monthly',CASE code WHEN 'growth' THEN 20 WHEN 'business' THEN 100 WHEN 'enterprise' THEN 500 WHEN 'legacy' THEN 100 ELSE 0 END,
 'knowledge.crawl.pages_per_job',CASE code WHEN 'trial' THEN 1 WHEN 'starter' THEN 1 WHEN 'growth' THEN 50 WHEN 'business' THEN 100 ELSE 500 END,
 'knowledge.crawl.max_depth',CASE code WHEN 'business' THEN 2 WHEN 'enterprise' THEN 4 WHEN 'legacy' THEN 2 ELSE 0 END) || limits;
INSERT INTO public.saas_release_gates(key) VALUES ('knowledge.crawl.discovery'),('knowledge.crawl.autonomous') ON CONFLICT DO NOTHING;

-- Reserve the full job budget before any paid provider call. Always enforce
-- crawl credit limits, including workspaces still in shadow enforcement mode.
CREATE OR REPLACE FUNCTION public.knowledge_reserve_crawl(p_client uuid,p_source uuid,p_amount integer,p_mode text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e jsonb; a saas_workspace_accounts; used bigint; cap bigint; start_at timestamptz; meter_key text;
BEGIN
 SELECT * INTO a FROM saas_workspace_accounts WHERE client_id=p_client FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Workspace billing configuration is unavailable.'; END IF;
 e=saas_entitlements(p_client);
 IF coalesce((e->>'dashboard_write_allowed')::boolean,e->>'access_state' IN ('active','trialing'))=false
 OR e->>'operational_state'<>'active' OR NOT coalesce((e->'features'->>'knowledge.enabled')::boolean,false)
 THEN RAISE EXCEPTION 'Knowledge imports are unavailable for this workspace.'; END IF;
 IF p_mode NOT IN ('single','selected','deep','map') OR
 (p_mode IN ('selected','map') AND NOT coalesce((e->'features'->>'knowledge.crawl.discovery')::boolean,false)) OR
 (p_mode='deep' AND NOT coalesce((e->'features'->>'knowledge.crawl.autonomous')::boolean,false))
 THEN RAISE EXCEPTION 'This crawl mode is not enabled by your plan.'; END IF;
 IF p_amount<1 OR p_amount>least(500,coalesce((e->'limits'->>'knowledge.crawl.pages_per_job')::int,1))
 OR (p_mode='single' AND p_amount<>1) THEN RAISE EXCEPTION 'Crawl page limit exceeded.'; END IF;
 IF p_mode<>'map' AND NOT EXISTS(SELECT 1 FROM dataset_sources s JOIN datasets d ON d.id=s.dataset_id WHERE s.id=p_source AND d.client_id=p_client)
 THEN RAISE EXCEPTION 'Source not found.'; END IF;
 meter_key=CASE WHEN p_mode='map' THEN 'knowledge.crawl.maps.monthly' ELSE 'knowledge.crawl.pages.monthly' END;
 IF EXISTS(SELECT 1 FROM saas_usage_events WHERE client_id=p_client AND meter=meter_key AND operation=p_source::text)
 THEN RAISE EXCEPTION 'This crawl was already submitted.'; END IF;
 cap=coalesce((e->'limits'->>meter_key)::bigint,CASE WHEN p_mode='map' THEN 0 ELSE 3 END);
 start_at=a.period_start;
 IF a.access_state<>'trialing' THEN
  WHILE start_at+interval '1 month'<=now() LOOP start_at=start_at+interval '1 month'; END LOOP;
 END IF;
 SELECT coalesce(sum(amount),0) INTO used FROM saas_usage_events WHERE client_id=p_client AND meter=meter_key AND created_at>=start_at AND state<>'released';
 IF used+p_amount>cap THEN RAISE EXCEPTION 'Monthly website page allowance reached. Ask your administrator to increase it.'; END IF;
 INSERT INTO saas_usage_events(client_id,meter,operation,amount) VALUES(p_client,meter_key,p_source::text,p_amount);
 RETURN jsonb_build_object('allowed',true,'reserved',p_amount,'remaining',cap-used-p_amount);
END $$;

-- A short renewable lease prevents two open tabs from embedding the same pages.
CREATE OR REPLACE FUNCTION public.knowledge_claim_crawl(p_source uuid,p_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s dataset_sources;
BEGIN
 UPDATE dataset_sources SET crawl_lease=p_token,crawl_lease_until=now()+interval '90 seconds'
 WHERE id=p_source AND status='processing' AND crawl_state->>'job_id' IS NOT NULL
 AND (crawl_lease_until IS NULL OR crawl_lease_until<now()) RETURNING * INTO s;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN to_jsonb(s);
END $$;

-- Insertion and cursor advancement commit together: interrupted requests retry
-- safely without losing a page, inserting duplicate chunks, or replacing text.
CREATE OR REPLACE FUNCTION public.knowledge_commit_crawl(p_source uuid,p_token uuid,p_chunks jsonb,p_state jsonb,p_done boolean,p_error text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s dataset_sources; total integer;
BEGIN
 SELECT * INTO s FROM dataset_sources WHERE id=p_source FOR UPDATE;
 IF NOT FOUND OR s.crawl_lease IS DISTINCT FROM p_token OR s.status<>'processing' THEN RETURN false; END IF;
 IF jsonb_array_length(p_chunks)>300 THEN RAISE EXCEPTION 'Chunk batch too large'; END IF;
 INSERT INTO chunks(dataset_id,dataset_source_id,text,chunk_hash,embedding,source_url,title,source_type,active)
 SELECT DISTINCT ON (x->>'chunk_hash') s.dataset_id,s.id,x->>'text',x->>'chunk_hash',(x->>'embedding')::vector,x->>'source_url',x->>'title','crawl',true
 FROM jsonb_array_elements(p_chunks) x
 WHERE NOT EXISTS(SELECT 1 FROM chunks c WHERE c.dataset_source_id=s.id AND c.chunk_hash=x->>'chunk_hash');
 SELECT count(*) INTO total FROM chunks WHERE dataset_source_id=s.id AND active;
 UPDATE dataset_sources SET crawl_state=p_state,crawl_lease=NULL,
 crawl_lease_until=CASE WHEN p_done THEN NULL ELSE now()+interval '5 seconds' END,
 status=CASE WHEN p_error IS NOT NULL THEN 'error' WHEN p_done AND total>0 THEN 'ready' WHEN p_done THEN 'error' ELSE 'processing' END,
 error_msg=CASE WHEN p_error IS NOT NULL THEN p_error WHEN p_done AND total=0 THEN 'No permitted readable pages were found.' ELSE NULL END,
 chunk_count=total WHERE id=s.id;
 UPDATE datasets SET chunk_count=(SELECT count(*) FROM chunks WHERE dataset_id=s.dataset_id AND active),
 source_count=(SELECT count(*) FROM dataset_sources WHERE dataset_id=s.dataset_id),
 status=CASE WHEN EXISTS(SELECT 1 FROM dataset_sources WHERE dataset_id=s.dataset_id AND status IN ('processing','pending')) THEN 'processing'
 WHEN EXISTS(SELECT 1 FROM dataset_sources WHERE dataset_id=s.dataset_id AND status='ready') THEN 'ready' ELSE 'error' END,updated_at=now() WHERE id=s.dataset_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.knowledge_reserve_crawl(uuid,uuid,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.knowledge_claim_crawl(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.knowledge_commit_crawl(uuid,uuid,jsonb,jsonb,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_reserve_crawl(uuid,uuid,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_claim_crawl(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_commit_crawl(uuid,uuid,jsonb,jsonb,boolean,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
