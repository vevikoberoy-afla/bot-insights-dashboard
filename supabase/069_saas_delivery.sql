BEGIN;
CREATE TABLE IF NOT EXISTS public.saas_delivery_operations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id),
 operation text NOT NULL, payload_hash text NOT NULL, category text NOT NULL CHECK(category IN ('transactional','marketing')),
 status text NOT NULL DEFAULT 'sending' CHECK(status IN ('sending','accepted','failed','unknown')),
 provider_message_id text, error_code text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(client_id,operation)
);
ALTER TABLE public.saas_delivery_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.saas_delivery_operations FROM anon,authenticated;
GRANT ALL ON public.saas_delivery_operations TO service_role;
CREATE OR REPLACE FUNCTION public.saas_claim_delivery(p_client uuid,p_operation text,p_hash text,p_category text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior saas_delivery_operations; quota jsonb; e jsonb; monthly text;
BEGIN
 PERFORM 1 FROM saas_workspace_accounts WHERE client_id=p_client FOR UPDATE;
 SELECT * INTO prior FROM saas_delivery_operations WHERE client_id=p_client AND operation=p_operation;
 IF FOUND THEN
  IF prior.payload_hash<>p_hash THEN RAISE EXCEPTION 'DELIVERY_IDEMPOTENCY_CONFLICT'; END IF;
  RETURN jsonb_build_object('send',false,'status',prior.status,'message_id',prior.provider_message_id);
 END IF;
 IF p_category NOT IN ('transactional','marketing') THEN RAISE EXCEPTION 'INVALID_CATEGORY'; END IF;
 e=saas_entitlements(p_client);
 IF NOT coalesce((e->'features'->>'email.enabled')::boolean,false) OR (p_category='marketing' AND NOT coalesce((e->'features'->>'campaigns.enabled')::boolean,false)) THEN RAISE EXCEPTION 'EMAIL_FEATURE_UNAVAILABLE'; END IF;
 monthly='email.'||p_category||'.monthly';
 quota=saas_consume_usage(p_client,monthly,'email:'||p_operation,1);
 IF NOT (quota->>'allowed')::boolean THEN RAISE EXCEPTION 'EMAIL_MONTHLY_LIMIT'; END IF;
 quota=saas_consume_usage(p_client,'email.outbound.daily','email:'||p_operation,1);
 IF NOT (quota->>'allowed')::boolean THEN RAISE EXCEPTION 'EMAIL_DAILY_LIMIT'; END IF;
 UPDATE saas_usage_events SET state='reserved' WHERE client_id=p_client AND operation='email:'||p_operation;
 INSERT INTO saas_delivery_operations(client_id,operation,payload_hash,category) VALUES(p_client,p_operation,p_hash,p_category);
 RETURN jsonb_build_object('send',true);
END $$;
CREATE OR REPLACE FUNCTION public.saas_finish_delivery(p_client uuid,p_operation text,p_status text,p_message text DEFAULT NULL,p_error text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_status text; BEGIN
 IF p_status NOT IN ('accepted','failed','unknown') THEN RAISE EXCEPTION 'INVALID_DELIVERY_STATE'; END IF;
 PERFORM 1 FROM saas_workspace_accounts WHERE client_id=p_client FOR UPDATE;
 SELECT status INTO current_status FROM saas_delivery_operations WHERE client_id=p_client AND operation=p_operation FOR UPDATE;
 IF current_status IS NULL THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND'; END IF;
 IF current_status IN ('accepted','failed') THEN RETURN; END IF;
 UPDATE saas_delivery_operations SET status=p_status,provider_message_id=p_message,error_code=p_error,updated_at=now() WHERE client_id=p_client AND operation=p_operation;
 UPDATE saas_usage_events SET state=CASE p_status WHEN 'accepted' THEN 'committed' WHEN 'failed' THEN 'released' ELSE 'reserved' END WHERE client_id=p_client AND operation='email:'||p_operation;
END $$;
REVOKE ALL ON FUNCTION public.saas_claim_delivery(uuid,text,text,text),public.saas_finish_delivery(uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_claim_delivery(uuid,text,text,text),public.saas_finish_delivery(uuid,text,text,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
