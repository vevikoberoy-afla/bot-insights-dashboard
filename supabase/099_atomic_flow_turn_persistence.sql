-- Lock the selected card, append every next card, and touch the session in one
-- transaction/round-trip. The payload shape mirrors the existing messages row.
BEGIN;
CREATE OR REPLACE FUNCTION public.persist_flow_turn_atomic(
 p_client_id uuid,p_context_id text,p_bot_id uuid,p_session_id text,
 p_origin_flow_id text,p_origin_step_id text,p_origin_updates jsonb,p_rows jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_session uuid;v_target uuid;v_inserted jsonb;
BEGIN
 IF p_rows IS NULL OR jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows)<1 OR jsonb_array_length(p_rows)>20 THEN RAISE EXCEPTION 'INVALID_FLOW_MESSAGES';END IF;
 IF NOT EXISTS(
  SELECT 1 FROM clients
  WHERE id=p_client_id
   AND (context_id=p_context_id OR (context_id IS NULL AND p_context_id=p_client_id::text))
 ) THEN RAISE EXCEPTION 'FLOW_CONTEXT_SCOPE_MISMATCH';END IF;
 SELECT id INTO v_session FROM sessions WHERE client_id=p_client_id AND bot_id=p_bot_id AND session_id=p_session_id FOR UPDATE;
 IF v_session IS NULL THEN RAISE EXCEPTION 'FLOW_SESSION_NOT_FOUND';END IF;
 IF p_origin_flow_id IS NOT NULL THEN
  SELECT id INTO v_target FROM messages WHERE session_id=p_session_id AND bot_id=p_bot_id
   AND metadata->>'flowId'=p_origin_flow_id
   AND (p_origin_step_id IS NULL OR metadata->>'stepId'=p_origin_step_id)
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF v_target IS NOT NULL THEN UPDATE messages SET metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_origin_updates,'{}'::jsonb) WHERE id=v_target;END IF;
 END IF;
 WITH payload AS(SELECT value,row_number() OVER() ordinal FROM jsonb_array_elements(p_rows)),inserted AS(
  INSERT INTO messages(context_id,session_id,bot_id,channel,role,content,message_type,metadata,created_at)
  SELECT p_context_id,p_session_id,p_bot_id,coalesce(value->>'channel','website'),coalesce(value->>'role','assistant'),
   coalesce(value->>'content','Interactive card'),coalesce(value->>'message_type','chat'),coalesce(value->'metadata','{}'::jsonb),
   coalesce((value->>'created_at')::timestamptz,now()+make_interval(secs=>ordinal::double precision/1000))
  FROM payload ORDER BY ordinal
  RETURNING id,session_id,role,content,mode,source_url,channel,media_url,media_type,message_type,metadata,created_at
 ) SELECT coalesce(jsonb_agg(to_jsonb(inserted) ORDER BY created_at),'[]'::jsonb) INTO v_inserted FROM inserted;
 UPDATE sessions SET last_message_at=now() WHERE id=v_session;
 RETURN v_inserted;
END $$;
REVOKE ALL ON FUNCTION public.persist_flow_turn_atomic(uuid,text,uuid,text,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.persist_flow_turn_atomic(uuid,text,uuid,text,text,text,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
