-- Requires 105_knowledge_crawl_guardrails.sql. Re-runnable.
BEGIN;
-- Same compatibility change as 031_fix_chunks_schema.sql: dataset-backed
-- knowledge chunks do not need a legacy standalone context identifier.
ALTER TABLE public.chunks ALTER COLUMN context_id DROP NOT NULL;
ALTER TABLE public.dataset_sources ADD COLUMN IF NOT EXISTS document_state jsonb NOT NULL DEFAULT '{}';
UPDATE public.saas_plan_versions SET limits=jsonb_build_object('knowledge.documents.max_file_mb',5) || limits;
CREATE INDEX IF NOT EXISTS dataset_sources_document_hash ON public.dataset_sources(dataset_id,(document_state->>'sha256')) WHERE document_state->>'sha256' IS NOT NULL;

CREATE OR REPLACE FUNCTION public.knowledge_start_document(p_client uuid,p_dataset uuid,p_name text,p_type text,p_ref text,p_bytes integer,p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e jsonb; s dataset_sources; max_bytes bigint;
BEGIN
 PERFORM 1 FROM saas_workspace_accounts WHERE client_id=p_client FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Workspace account unavailable.'; END IF;
 e=saas_entitlements(p_client);
 IF e->>'operational_state'<>'active' OR NOT coalesce((e->>'dashboard_write_allowed')::boolean,e->>'access_state' IN ('active','trialing'))
 OR NOT coalesce((e->'features'->>'knowledge.enabled')::boolean,false) THEN RAISE EXCEPTION 'Document imports are unavailable for this workspace.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM datasets WHERE id=p_dataset AND client_id=p_client) THEN RAISE EXCEPTION 'Knowledge base not found.'; END IF;
 max_bytes=greatest(0,least(20,coalesce((e->'limits'->>'knowledge.documents.max_file_mb')::integer,5)))::bigint*1024*1024;
 IF p_bytes<1 OR p_bytes>max_bytes THEN RAISE EXCEPTION 'Document exceeds the workspace file-size limit.'; END IF;
 IF p_type NOT IN ('file','document_link') OR length(p_name) NOT BETWEEN 1 AND 200 OR p_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid document metadata.'; END IF;
 SELECT * INTO s FROM dataset_sources WHERE dataset_id=p_dataset AND document_state->>'sha256'=p_hash AND status IN ('pending','processing','ready') ORDER BY created_at DESC LIMIT 1;
 IF FOUND THEN RETURN to_jsonb(s)||jsonb_build_object('duplicate',true); END IF;
 INSERT INTO dataset_sources(dataset_id,source_type,source_name,source_ref,status,document_state)
 VALUES(p_dataset,p_type,p_name,p_ref,'pending',jsonb_build_object('sha256',p_hash,'bytes',p_bytes,'scan_status','quarantine')) RETURNING * INTO s;
 RETURN to_jsonb(s);
END $$;

CREATE OR REPLACE FUNCTION public.knowledge_stage_document(p_source uuid,p_hash text,p_text text,p_scanner text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF length(trim(p_text))<1 OR length(p_text)>250000 OR p_scanner NOT IN ('structural-checks','structural-checks+clamav') THEN RAISE EXCEPTION 'Invalid checked document.'; END IF;
 UPDATE dataset_sources SET status='processing',error_msg=NULL,
 document_state=document_state||jsonb_build_object('text',p_text,'offset',0,'scan_status','passed','scanner',p_scanner,'checked_at',now())
 WHERE id=p_source AND status='pending' AND document_state->>'sha256'=p_hash AND document_state->>'scan_status'='quarantine';
 RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.knowledge_claim_document(p_source uuid,p_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s dataset_sources;
BEGIN
 UPDATE dataset_sources SET crawl_lease=p_token,crawl_lease_until=now()+interval '90 seconds'
 WHERE id=p_source AND status='processing' AND document_state->>'scan_status'='passed' AND document_state->>'text' IS NOT NULL
 AND (crawl_lease_until IS NULL OR crawl_lease_until<now()) RETURNING * INTO s;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN to_jsonb(s);
END $$;

CREATE OR REPLACE FUNCTION public.knowledge_commit_document(p_source uuid,p_token uuid,p_chunks jsonb,p_offset integer,p_next integer,p_done boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s dataset_sources; total integer; ctx text;
BEGIN
 SELECT * INTO s FROM dataset_sources WHERE id=p_source FOR UPDATE;
 IF NOT FOUND OR s.status<>'processing' OR s.crawl_lease IS DISTINCT FROM p_token OR s.document_state->>'scan_status'<>'passed'
 OR coalesce((s.document_state->>'offset')::int,0)<>p_offset THEN RETURN false; END IF;
 IF jsonb_array_length(p_chunks) NOT BETWEEN 1 AND 32 OR p_next<>p_offset+jsonb_array_length(p_chunks) OR p_next>300 THEN RAISE EXCEPTION 'Invalid document batch.'; END IF;
 SELECT c.context_id INTO ctx FROM datasets d JOIN clients c ON c.id=d.client_id WHERE d.id=s.dataset_id AND d.source_url='context-documents://'||c.context_id;
 -- Chunk ownership is inherited through datasets.client_id. The canonical
 -- chunks schema has no client_id column; never depend on a denormalized copy.
 INSERT INTO chunks(dataset_id,dataset_source_id,context_id,text,chunk_hash,embedding,source_url,title,source_type,active)
 SELECT DISTINCT ON(x->>'chunk_hash') s.dataset_id,s.id,ctx,x->>'text',x->>'chunk_hash',(x->>'embedding')::vector,s.source_ref,s.source_name,
 CASE WHEN s.source_type='file' THEN 'upload' ELSE 'document_link' END,true FROM jsonb_array_elements(p_chunks) x
 WHERE NOT EXISTS(SELECT 1 FROM chunks c WHERE c.dataset_source_id=s.id AND c.chunk_hash=x->>'chunk_hash');
 SELECT count(*) INTO total FROM chunks WHERE dataset_source_id=s.id AND active;
 UPDATE dataset_sources SET status=CASE WHEN p_done THEN 'ready' ELSE 'processing' END,chunk_count=total,
 document_state=(CASE WHEN p_done THEN document_state-'text' ELSE document_state END)||jsonb_build_object('offset',p_next),
 crawl_lease=NULL,crawl_lease_until=CASE WHEN p_done THEN NULL ELSE now()+interval '5 seconds' END,error_msg=NULL WHERE id=s.id;
 UPDATE datasets SET chunk_count=(SELECT count(*) FROM chunks WHERE dataset_id=s.dataset_id AND active),
 source_count=(SELECT count(*) FROM dataset_sources WHERE dataset_id=s.dataset_id),
 status=CASE WHEN EXISTS(SELECT 1 FROM dataset_sources WHERE dataset_id=s.dataset_id AND status IN ('processing','pending')) THEN 'processing'
 WHEN EXISTS(SELECT 1 FROM dataset_sources WHERE dataset_id=s.dataset_id AND status='ready') THEN 'ready' ELSE 'draft' END,updated_at=now() WHERE id=s.dataset_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.knowledge_start_document(uuid,uuid,text,text,text,integer,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.knowledge_stage_document(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.knowledge_claim_document(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.knowledge_commit_document(uuid,uuid,jsonb,integer,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_start_document(uuid,uuid,text,text,text,integer,text),public.knowledge_stage_document(uuid,text,text,text),
 public.knowledge_claim_document(uuid,uuid),public.knowledge_commit_document(uuid,uuid,jsonb,integer,integer,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
