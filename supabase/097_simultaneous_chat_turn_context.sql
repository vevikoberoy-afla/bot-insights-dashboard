-- One authoritative database round-trip for a widget message. Redis lead state
-- remains a parallel bounded optimization and is deliberately not authoritative.
BEGIN;
CREATE OR REPLACE FUNCTION public.load_chat_turn_context_atomic(
 p_client_id uuid,p_bot_id uuid,p_session_id text,p_question text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_entitlements jsonb;v_session jsonb;v_bot jsonb;v_datasets jsonb;v_faq jsonb;v_context text;
BEGIN
 IF p_session_id IS NULL OR length(p_session_id)<8 OR length(p_session_id)>200 THEN RAISE EXCEPTION 'INVALID_SESSION';END IF;
 SELECT context_id::text INTO v_context FROM clients WHERE id=p_client_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORKSPACE_NOT_FOUND';END IF;
 v_entitlements=saas_entitlements(p_client_id);
 SELECT jsonb_build_object('id',s.id,'session_id',s.session_id,'client_id',s.client_id,'bot_id',s.bot_id,
  'contact_id',s.contact_id,'mode',s.mode,'contact',CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
   'id',c.id,'client_id',c.client_id,'name',c.name,'email',c.email,'phone',c.phone,'hydrated',true) END)
 INTO v_session FROM sessions s LEFT JOIN contacts c ON c.id=s.contact_id AND c.client_id=p_client_id
 WHERE s.client_id=p_client_id AND s.bot_id=p_bot_id AND (s.session_id=p_session_id OR s.id::text=p_session_id) LIMIT 1;
 IF v_session IS NULL THEN RAISE EXCEPTION 'SESSION_SCOPE_MISMATCH';END IF;
 SELECT jsonb_build_object('id',b.id,'client_id',b.client_id,'system_prompt',b.system_prompt,'bot_tone',b.bot_tone,
  'tone',b.tone,'response_length',b.response_length,'use_emojis',b.use_emojis,'bot_flow',b.bot_flow,
  'vision_ai_enabled',b.vision_ai_enabled,'updated_at',b.updated_at)
 INTO v_bot FROM bots b WHERE b.id=p_bot_id AND b.client_id=p_client_id;
 IF v_bot IS NULL THEN RAISE EXCEPTION 'BOT_SCOPE_MISMATCH';END IF;
 SELECT coalesce(jsonb_agg(x.id),'[]'::jsonb) INTO v_datasets FROM(
  SELECT DISTINCT d.id FROM datasets d LEFT JOIN bot_datasets bd ON bd.dataset_id=d.id
  WHERE d.client_id=p_client_id AND (bd.bot_id=p_bot_id OR NOT EXISTS(SELECT 1 FROM bot_datasets z WHERE z.bot_id=p_bot_id))
   AND (coalesce(to_jsonb(d)->>'active_from','')='' OR (to_jsonb(d)->>'active_from')::timestamptz<=now())
   AND (coalesce(to_jsonb(d)->>'active_until','')='' OR (to_jsonb(d)->>'active_until')::timestamptz>now())
 )x;
 IF p_question IS NOT NULL AND length(trim(p_question))>0 AND v_context IS NOT NULL THEN
  SELECT jsonb_build_object('answer',q.answer,'source_url',q.source_url) INTO v_faq FROM qa_pairs q
   WHERE q.context_id=v_context AND lower(trim(q.question))=lower(trim(p_question)) ORDER BY q.created_at DESC LIMIT 1;
 END IF;
 RETURN jsonb_build_object('entitlements',v_entitlements,'session',v_session,'bot',v_bot,'dataset_ids',v_datasets,
  'faq_match',v_faq,'context_id',v_context);
END $$;
REVOKE ALL ON FUNCTION public.load_chat_turn_context_atomic(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.load_chat_turn_context_atomic(uuid,uuid,text,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
