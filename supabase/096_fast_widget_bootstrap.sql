-- Single transaction/round trip for anonymous widget initialization.
-- Identified visitors continue through the existing canonical contact stitcher.
BEGIN;
CREATE OR REPLACE FUNCTION public.init_widget_session_atomic(p_bot_id uuid, p_session_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_bot public.bots%ROWTYPE;
  v_session public.sessions%ROWTYPE;
  v_contact public.contacts%ROWTYPE;
  v_context text;
  v_new boolean := false;
BEGIN
  IF p_session_id IS NULL OR length(p_session_id) < 8 OR length(p_session_id) > 200
     OR p_session_id !~ '^[a-zA-Z0-9_-]+$' THEN RAISE EXCEPTION 'INVALID_SESSION'; END IF;
  SELECT * INTO v_bot FROM public.bots WHERE id = p_bot_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','BOT_NOT_FOUND'); END IF;
  SELECT context_id::text INTO v_context FROM public.clients WHERE id = v_bot.client_id;
  PERFORM pg_advisory_xact_lock(hashtextextended('widget-init:' || p_session_id, 0));
  SELECT * INTO v_session FROM public.sessions WHERE session_id = p_session_id FOR UPDATE;
  IF FOUND AND (v_session.client_id IS DISTINCT FROM v_bot.client_id OR v_session.bot_id IS DISTINCT FROM p_bot_id) THEN
    RAISE EXCEPTION 'SESSION_SCOPE_MISMATCH';
  END IF;
  IF v_session.contact_id IS NOT NULL THEN
    SELECT * INTO v_contact FROM public.contacts WHERE id = v_session.contact_id AND client_id = v_bot.client_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'CONTACT_SCOPE_MISMATCH'; END IF;
  END IF;
  IF v_contact.id IS NULL THEN
    INSERT INTO public.contacts(client_id,name,source_channel,source_bot_id,tags,custom_fields,
      opt_in_web,opt_in_email,opt_in_whatsapp,opt_in_sms,last_active_at,updated_at)
    VALUES(v_bot.client_id,'Website Visitor','web',p_bot_id,ARRAY['customer'],
      '{"last_capture_source":"widget_form"}'::jsonb,true,false,false,false,now(),now())
    RETURNING * INTO v_contact;
  END IF;
  IF v_session.id IS NULL THEN
    INSERT INTO public.sessions(client_id,bot_id,session_id,contact_id,channel,mode)
    VALUES(v_bot.client_id,p_bot_id,p_session_id,v_contact.id,'widget','ai') RETURNING * INTO v_session;
    v_new := true;
  ELSIF v_session.contact_id IS DISTINCT FROM v_contact.id THEN
    UPDATE public.sessions SET contact_id=v_contact.id WHERE id=v_session.id RETURNING * INTO v_session;
  END IF;
  RETURN jsonb_build_object('client_id',v_bot.client_id,'context_id',v_context,
    'bot',to_jsonb(v_bot),'contact',to_jsonb(v_contact),'session',to_jsonb(v_session),'is_new_session',v_new);
END;
$$;
REVOKE ALL ON FUNCTION public.init_widget_session_atomic(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.init_widget_session_atomic(uuid,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
