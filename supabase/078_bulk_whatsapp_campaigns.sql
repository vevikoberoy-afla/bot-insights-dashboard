-- Production WhatsApp Cloud API campaign lane. Apply after 077.
BEGIN;

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS phone_e164 text;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS opt_in_whatsapp boolean NOT NULL DEFAULT false;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS whatsapp_opted_out_at timestamptz;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS whatsapp_service_window_until timestamptz;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS last_whatsapp_inbound_at timestamptz;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS whatsapp_service_window_until timestamptz;
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS last_whatsapp_inbound_at timestamptz;
UPDATE public.contacts SET phone_e164=regexp_replace(coalesce(phone,''),'\D','','g')
 WHERE phone_e164 IS NULL AND regexp_replace(coalesce(phone,''),'\D','','g') ~ '^[1-9][0-9]{7,14}$';
CREATE INDEX IF NOT EXISTS contacts_whatsapp_eligible ON public.contacts(client_id,phone_e164,last_active_at DESC)
 WHERE opt_in_whatsapp=true AND phone_e164 IS NOT NULL;
CREATE OR REPLACE FUNCTION public.normalize_contact_whatsapp_phone() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE digits text;BEGIN
 IF NEW.phone_e164~'^[1-9][0-9]{7,14}$' THEN RETURN NEW;END IF;digits=regexp_replace(coalesce(NEW.phone,''),'\D','','g');NEW.phone_e164=CASE WHEN digits~'^[1-9][0-9]{7,14}$' THEN digits ELSE NULL END;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS contacts_normalize_whatsapp_phone ON public.contacts;
CREATE TRIGGER contacts_normalize_whatsapp_phone BEFORE INSERT OR UPDATE OF phone ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.normalize_contact_whatsapp_phone();

CREATE UNIQUE INDEX IF NOT EXISTS channel_integrations_whatsapp_phone_unique ON public.channel_integrations((config->>'phone_number_id'))
 WHERE channel='whatsapp' AND config->>'phone_number_id' IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_suppressions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 phone_e164 text NOT NULL CHECK(phone_e164 ~ '^[1-9][0-9]{7,14}$'),reason text NOT NULL CHECK(reason IN('opt_out_reply','invalid_number','not_on_whatsapp','spam_blocked','manual')),
 source_campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(client_id,phone_e164)
);
CREATE INDEX IF NOT EXISTS whatsapp_suppressions_lookup ON public.whatsapp_suppressions(client_id,phone_e164);

CREATE TABLE IF NOT EXISTS public.whatsapp_templates(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,waba_id text NOT NULL,meta_template_id text,
 name text NOT NULL,language text NOT NULL DEFAULT 'en_US',category text NOT NULL CHECK(category IN('MARKETING','UTILITY','AUTHENTICATION')),
 status text NOT NULL CHECK(status IN('PENDING','APPROVED','REJECTED','PAUSED','DISABLED','FLAGGED')),
 components_json jsonb NOT NULL DEFAULT '[]',variable_bindings_json jsonb NOT NULL DEFAULT '[]',rejection_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(bot_id,name,language)
);
CREATE INDEX IF NOT EXISTS whatsapp_templates_client_status ON public.whatsapp_templates(client_id,status,updated_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_phone_health(
 phone_number_id text PRIMARY KEY,client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 quality_rating text,current_limit text,previous_limit text,last_event jsonb NOT NULL DEFAULT '{}',updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS whatsapp_phone_health_client ON public.whatsapp_phone_health(client_id,updated_at DESC);

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS wa_template_id uuid REFERENCES public.whatsapp_templates(id) ON DELETE RESTRICT;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS wa_phone_number_id text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS wa_header_media_id text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS wa_variable_bindings jsonb NOT NULL DEFAULT '[]';
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS read_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS opt_out_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS phone_e164 text;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS provider_message_id text;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS read_at timestamptz;
CREATE INDEX IF NOT EXISTS campaign_recipients_provider_message ON public.campaign_recipients(provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS campaign_recipients_whatsapp_cursor ON public.campaign_recipients(campaign_id,id) WHERE phone_e164 IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_campaign_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,recipient_id uuid REFERENCES public.campaign_recipients(id) ON DELETE SET NULL,
 event_type text NOT NULL CHECK(event_type IN('launched','scheduled','cancelled','sent','failed','delivered','read','clicked','opted_out','circuit_paused','batch_processed')),
 provider_event_id text,metadata jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(provider_event_id,event_type)
);
CREATE INDEX IF NOT EXISTS whatsapp_campaign_events_campaign_time ON public.whatsapp_campaign_events(campaign_id,created_at DESC);

ALTER TABLE public.whatsapp_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_campaign_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_phone_health ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_suppressions_read ON public.whatsapp_suppressions;
DROP POLICY IF EXISTS whatsapp_suppressions_write ON public.whatsapp_suppressions;
DROP POLICY IF EXISTS whatsapp_templates_read ON public.whatsapp_templates;
DROP POLICY IF EXISTS whatsapp_templates_write ON public.whatsapp_templates;
DROP POLICY IF EXISTS whatsapp_events_read ON public.whatsapp_campaign_events;
CREATE POLICY whatsapp_suppressions_read ON public.whatsapp_suppressions FOR SELECT TO authenticated USING(public.saas_member_access(client_id,'campaigns',false));
CREATE POLICY whatsapp_suppressions_write ON public.whatsapp_suppressions FOR ALL TO authenticated USING(public.saas_member_access(client_id,'campaigns',true)) WITH CHECK(public.saas_member_access(client_id,'campaigns',true));
CREATE POLICY whatsapp_templates_read ON public.whatsapp_templates FOR SELECT TO authenticated USING(public.saas_member_access(client_id,'campaigns',false));
CREATE POLICY whatsapp_templates_write ON public.whatsapp_templates FOR ALL TO authenticated USING(public.saas_member_access(client_id,'campaigns',true)) WITH CHECK(public.saas_member_access(client_id,'campaigns',true));
CREATE POLICY whatsapp_events_read ON public.whatsapp_campaign_events FOR SELECT TO authenticated USING(public.saas_member_access(client_id,'campaigns',false));
DROP POLICY IF EXISTS whatsapp_phone_health_read ON public.whatsapp_phone_health;
CREATE POLICY whatsapp_phone_health_read ON public.whatsapp_phone_health FOR SELECT TO authenticated USING(public.saas_member_access(client_id,'campaigns',false));

-- Existing plan snapshots gain a channel-specific marketing allowance. The
-- founder can subsequently override both feature and limits per workspace.
UPDATE public.saas_plan_versions SET
 features=features||jsonb_build_object('whatsapp.campaigns.enabled',coalesce((features->>'campaigns.enabled')::boolean,false)),
 limits=limits||jsonb_build_object('whatsapp.marketing.monthly',coalesce((limits->>'email.marketing.monthly')::bigint,0),'whatsapp.outbound.daily',coalesce((limits->>'email.outbound.daily')::bigint,0));
INSERT INTO public.saas_release_gates(key) VALUES('whatsapp.campaigns.enabled') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.saas_claim_whatsapp_delivery(p_client uuid,p_operation text,p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior saas_delivery_operations;quota jsonb;e jsonb;
BEGIN
 PERFORM 1 FROM saas_workspace_accounts WHERE client_id=p_client FOR UPDATE;
 SELECT * INTO prior FROM saas_delivery_operations WHERE client_id=p_client AND operation=p_operation;
 IF FOUND THEN IF prior.payload_hash<>p_hash THEN RAISE EXCEPTION 'DELIVERY_IDEMPOTENCY_CONFLICT';END IF;RETURN jsonb_build_object('send',false,'status',prior.status,'message_id',prior.provider_message_id);END IF;
 e=saas_entitlements(p_client);IF NOT coalesce((e->'runtime_features'->>'campaigns.enabled')::boolean,(e->'features'->>'campaigns.enabled')::boolean,false) OR NOT coalesce((e->'features'->>'whatsapp.campaigns.enabled')::boolean,false) THEN RAISE EXCEPTION 'WHATSAPP_CAMPAIGNS_UNAVAILABLE';END IF;
 quota=saas_consume_usage(p_client,'whatsapp.marketing.monthly','whatsapp:'||p_operation,1);IF NOT (quota->>'allowed')::boolean THEN RAISE EXCEPTION 'WHATSAPP_MONTHLY_LIMIT';END IF;
 quota=saas_consume_usage(p_client,'whatsapp.outbound.daily','whatsapp:'||p_operation,1);IF NOT (quota->>'allowed')::boolean THEN UPDATE saas_usage_events SET state='released' WHERE client_id=p_client AND operation='whatsapp:'||p_operation;RAISE EXCEPTION 'WHATSAPP_DAILY_LIMIT';END IF;
 UPDATE saas_usage_events SET state='reserved' WHERE client_id=p_client AND operation='whatsapp:'||p_operation;
 INSERT INTO saas_delivery_operations(client_id,operation,payload_hash,category) VALUES(p_client,p_operation,p_hash,'marketing');RETURN jsonb_build_object('send',true);
END $$;

CREATE OR REPLACE FUNCTION public.saas_finish_whatsapp_delivery(p_client uuid,p_operation text,p_status text,p_message text DEFAULT NULL,p_error text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_status text;BEGIN
 IF p_status NOT IN('accepted','failed','unknown') THEN RAISE EXCEPTION 'INVALID_DELIVERY_STATE';END IF;
 PERFORM 1 FROM saas_workspace_accounts WHERE client_id=p_client FOR UPDATE;
 SELECT status INTO current_status FROM saas_delivery_operations WHERE client_id=p_client AND operation=p_operation FOR UPDATE;
 IF current_status IS NULL THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND';END IF;IF current_status IN('accepted','failed') THEN RETURN;END IF;
 UPDATE saas_delivery_operations SET status=p_status,provider_message_id=p_message,error_code=p_error,updated_at=now() WHERE client_id=p_client AND operation=p_operation;
 UPDATE saas_usage_events SET state=CASE p_status WHEN 'accepted' THEN 'committed' WHEN 'failed' THEN 'released' ELSE 'reserved' END WHERE client_id=p_client AND operation='whatsapp:'||p_operation;
END $$;

CREATE OR REPLACE FUNCTION public.bulk_whatsapp_preview_audience(p_client uuid,p_bot uuid,p_ast jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH eligible AS(
  SELECT DISTINCT ON(c.phone_e164)c.id,c.name,c.phone_e164 FROM contacts c WHERE c.client_id=p_client AND c.opt_in_whatsapp=true AND c.phone_e164~'^[1-9][0-9]{7,14}$'
   AND NOT EXISTS(SELECT 1 FROM whatsapp_suppressions s WHERE s.client_id=p_client AND s.phone_e164=c.phone_e164)
   AND bulk_email_contact_matches(p_client,c.id,c.tags,c.last_active_at,coalesce(p_ast,'{"combinator":"AND","rules":[]}'::jsonb))
  ORDER BY c.phone_e164,c.last_active_at DESC NULLS LAST,c.id
 ),total AS(SELECT count(*) count FROM eligible),sample AS(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') rows FROM(SELECT id,name,phone_e164 FROM eligible ORDER BY id LIMIT 5)x)
 SELECT jsonb_build_object('count',total.count,'sample',sample.rows) FROM total,sample
$$;

CREATE OR REPLACE FUNCTION public.bulk_whatsapp_materialize(p_client uuid,p_campaign uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE campaign campaigns;inserted integer;BEGIN
 SELECT * INTO campaign FROM campaigns WHERE id=p_campaign AND client_id=p_client AND channel='whatsapp' FOR UPDATE;
 IF NOT FOUND OR campaign.status NOT IN('draft','scheduled','sending') THEN RAISE EXCEPTION 'CAMPAIGN_NOT_LAUNCHABLE';END IF;
 WITH eligible AS(
  SELECT DISTINCT ON(c.phone_e164)c.id,c.name,c.phone_e164 FROM contacts c WHERE c.client_id=p_client AND c.opt_in_whatsapp=true AND c.phone_e164~'^[1-9][0-9]{7,14}$'
   AND NOT EXISTS(SELECT 1 FROM whatsapp_suppressions s WHERE s.client_id=p_client AND s.phone_e164=c.phone_e164)
   AND bulk_email_contact_matches(p_client,c.id,c.tags,c.last_active_at,campaign.inline_filter_ast)
  ORDER BY c.phone_e164,c.last_active_at DESC NULLS LAST,c.id
 ) INSERT INTO campaign_recipients(campaign_id,contact_id,phone_e164,first_name,variables,status)
 SELECT campaign.id,c.id,c.phone_e164,split_part(coalesce(c.name,''),' ',1),jsonb_build_object('name',coalesce(c.name,'')),'pending' FROM eligible c
 WHERE NOT EXISTS(SELECT 1 FROM campaign_recipients r WHERE r.campaign_id=campaign.id AND r.phone_e164=c.phone_e164) ON CONFLICT(campaign_id,contact_id) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;UPDATE campaigns SET recipients_count=(SELECT count(*) FROM campaign_recipients WHERE campaign_id=campaign.id),updated_at=now() WHERE id=campaign.id;RETURN inserted;
END $$;

CREATE OR REPLACE FUNCTION public.bulk_whatsapp_claim_batch_with_quota(p_campaign uuid,p_ids uuid[],p_lease_seconds integer DEFAULT 300)
RETURNS TABLE(recipient_id uuid,contact_id uuid,phone_e164 text,first_name text,variables jsonb,operation_id text,already_sent boolean,provider_message_id text,delivery_state text,claim_error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE campaign_row campaigns;recipient campaign_recipients;op_key text;payload_hash text;delivery saas_delivery_operations;reservation jsonb;BEGIN
 IF coalesce(array_length(p_ids,1),0)=0 OR array_length(p_ids,1)>50 THEN RAISE EXCEPTION 'INVALID_BATCH_SIZE';END IF;
 SELECT * INTO campaign_row FROM campaigns WHERE id=p_campaign AND channel='whatsapp' AND status='sending';IF NOT FOUND THEN RETURN;END IF;
 FOR recipient IN SELECT r.* FROM campaign_recipients r WHERE r.campaign_id=p_campaign AND r.id=ANY(p_ids) AND(r.status='pending' OR(r.status='processing' AND r.claimed_at<now()-make_interval(secs=>greatest(60,least(p_lease_seconds,3600))))) ORDER BY r.id FOR UPDATE SKIP LOCKED LOOP
  op_key='bulk_wa:'||p_campaign::text||':'||recipient.id::text;
  UPDATE campaign_recipients SET status='processing',claimed_at=now(),attempt_count=attempt_count+1 WHERE id=recipient.id;
  recipient_id=recipient.id;contact_id=recipient.contact_id;phone_e164=recipient.phone_e164;first_name=recipient.first_name;variables=recipient.variables;operation_id=op_key;already_sent=false;provider_message_id=NULL;claim_error=NULL;
  IF EXISTS(SELECT 1 FROM whatsapp_suppressions s WHERE s.client_id=campaign_row.client_id AND s.phone_e164=recipient.phone_e164) THEN delivery_state='suppressed';claim_error='Number suppressed before dispatch';RETURN NEXT;CONTINUE;END IF;
  SELECT d.* INTO delivery FROM saas_delivery_operations d WHERE d.client_id=campaign_row.client_id AND d.operation=op_key;
  IF FOUND THEN provider_message_id=delivery.provider_message_id;claim_error=delivery.error_code;IF delivery.status='accepted' THEN already_sent=true;delivery_state='accepted';claim_error=NULL;ELSIF delivery.status='sending' THEN delivery_state='stale_sending';ELSIF delivery.status='unknown' THEN delivery_state='unknown';ELSE delivery_state='failed';END IF;RETURN NEXT;CONTINUE;END IF;
  payload_hash=md5(recipient.phone_e164||'|'||coalesce(campaign_row.wa_template_id::text,'')||'|'||p_campaign::text);
  BEGIN reservation=saas_claim_whatsapp_delivery(campaign_row.client_id,op_key,payload_hash);EXCEPTION WHEN OTHERS THEN delivery_state='rejected';claim_error=left(SQLERRM,500);RETURN NEXT;CONTINUE;END;
  IF coalesce((reservation->>'send')::boolean,false) THEN delivery_state='reserved';
  ELSIF reservation->>'status'='accepted' THEN already_sent=true;provider_message_id=reservation->>'message_id';delivery_state='accepted';
  ELSE delivery_state='rejected';claim_error='WhatsApp allowance unavailable';END IF;RETURN NEXT;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.bulk_whatsapp_commit_batch_outcomes(p_campaign uuid,p_outcomes jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE campaign_row campaigns;outcome jsonb;recipient_id uuid;outcome_status text;message_id text;error_text text;error_code integer;sent_delta integer=0;failed_delta integer=0;remaining integer;new_status text;operation text;BEGIN
 IF jsonb_typeof(p_outcomes)<>'array' OR jsonb_array_length(p_outcomes)>50 THEN RAISE EXCEPTION 'INVALID_OUTCOMES';END IF;
 SELECT * INTO campaign_row FROM campaigns WHERE id=p_campaign AND channel='whatsapp' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND';END IF;
 FOR outcome IN SELECT value FROM jsonb_array_elements(p_outcomes) LOOP
  recipient_id=(outcome->>'recipient_id')::uuid;outcome_status=outcome->>'status';message_id=nullif(outcome->>'provider_message_id','');error_text=left(coalesce(outcome->>'error',''),500);error_code=nullif(outcome->>'error_code','')::integer;operation='bulk_wa:'||p_campaign::text||':'||recipient_id::text;
  IF outcome_status='sent' THEN PERFORM saas_finish_whatsapp_delivery(campaign_row.client_id,operation,'accepted',message_id,NULL);UPDATE campaign_recipients SET status='sent',sent_at=coalesce(sent_at,now()),provider_message_id=coalesce(message_id,provider_message_id),last_error=NULL WHERE id=recipient_id AND campaign_id=p_campaign AND status='processing';IF FOUND THEN sent_delta=sent_delta+1;END IF;
  ELSE IF outcome_status NOT IN('suppressed','rejected') THEN PERFORM saas_finish_whatsapp_delivery(campaign_row.client_id,operation,CASE WHEN outcome_status='unknown' THEN 'unknown' ELSE 'failed' END,NULL,left(error_text,100));END IF;UPDATE campaign_recipients SET status='failed',last_error=error_text WHERE id=recipient_id AND campaign_id=p_campaign AND status='processing';IF FOUND THEN failed_delta=failed_delta+1;END IF;
   IF error_code=131026 THEN INSERT INTO whatsapp_suppressions(client_id,phone_e164,reason,source_campaign_id) SELECT campaign_row.client_id,phone_e164,'not_on_whatsapp',p_campaign FROM campaign_recipients WHERE id=recipient_id ON CONFLICT(client_id,phone_e164) DO UPDATE SET reason='not_on_whatsapp',source_campaign_id=excluded.source_campaign_id,created_at=now();END IF;
  END IF;
 END LOOP;
 SELECT count(*) INTO remaining FROM campaign_recipients WHERE campaign_id=p_campaign AND status IN('pending','processing');
 UPDATE campaigns SET sent_count=sent_count+sent_delta,failed_count=failed_count+failed_delta,status=CASE WHEN status='sending' AND remaining=0 THEN 'completed' ELSE status END,completed_at=CASE WHEN status='sending' AND remaining=0 THEN coalesce(completed_at,now()) ELSE completed_at END,updated_at=now() WHERE id=p_campaign RETURNING status INTO new_status;
 INSERT INTO whatsapp_campaign_events(client_id,campaign_id,event_type,metadata) VALUES(campaign_row.client_id,p_campaign,'batch_processed',jsonb_build_object('sent_delta',sent_delta,'failed_delta',failed_delta,'remaining',remaining));RETURN jsonb_build_object('sent_delta',sent_delta,'failed_delta',failed_delta,'remaining',remaining,'campaign_status',new_status);
END $$;

CREATE OR REPLACE FUNCTION public.bulk_whatsapp_record_status_event(p_wamid text,p_status text,p_error_code integer DEFAULT NULL,p_timestamp timestamptz DEFAULT now()) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE recipient campaign_recipients;campaign_row campaigns;delivered_delta integer=0;read_delta integer=0;failed_delta integer=0;BEGIN
 SELECT * INTO recipient FROM campaign_recipients WHERE provider_message_id=p_wamid FOR UPDATE;IF NOT FOUND THEN RETURN jsonb_build_object('recorded',false);END IF;
 SELECT * INTO campaign_row FROM campaigns WHERE id=recipient.campaign_id AND channel='whatsapp' FOR UPDATE;IF NOT FOUND THEN RETURN jsonb_build_object('recorded',false);END IF;
 IF p_status='delivered' AND recipient.delivered_at IS NULL THEN UPDATE campaign_recipients SET delivered_at=p_timestamp,status=CASE WHEN status='sent' THEN 'delivered' ELSE status END WHERE id=recipient.id;delivered_delta=1;
 ELSIF p_status='read' AND recipient.read_at IS NULL THEN UPDATE campaign_recipients SET delivered_at=coalesce(delivered_at,p_timestamp),read_at=p_timestamp,status='read' WHERE id=recipient.id;read_delta=1;IF recipient.delivered_at IS NULL THEN delivered_delta=1;END IF;
 ELSIF p_status='failed' AND recipient.status NOT IN('failed','read','delivered') THEN UPDATE campaign_recipients SET status='failed',last_error='Meta delivery failure '||coalesce(p_error_code::text,'') WHERE id=recipient.id;failed_delta=1;END IF;
 IF delivered_delta+read_delta+failed_delta=0 THEN RETURN jsonb_build_object('recorded',false,'campaign_id',campaign_row.id);END IF;
 UPDATE campaigns SET delivered_count=delivered_count+delivered_delta,read_count=read_count+read_delta,failed_count=failed_count+failed_delta,updated_at=now() WHERE id=campaign_row.id;
 IF failed_delta=1 THEN
  UPDATE saas_delivery_operations SET status='failed',error_code=coalesce(p_error_code::text,'META_ASYNC_FAILURE'),updated_at=now() WHERE client_id=campaign_row.client_id AND operation='bulk_wa:'||campaign_row.id::text||':'||recipient.id::text;
  UPDATE saas_usage_events SET state='released' WHERE client_id=campaign_row.client_id AND operation='whatsapp:bulk_wa:'||campaign_row.id::text||':'||recipient.id::text;
  IF p_error_code=131026 THEN INSERT INTO whatsapp_suppressions(client_id,phone_e164,reason,source_campaign_id) VALUES(campaign_row.client_id,recipient.phone_e164,'not_on_whatsapp',campaign_row.id) ON CONFLICT(client_id,phone_e164) DO UPDATE SET reason='not_on_whatsapp',source_campaign_id=excluded.source_campaign_id,created_at=now();END IF;
 END IF;
 INSERT INTO whatsapp_campaign_events(client_id,campaign_id,recipient_id,event_type,provider_event_id,metadata) VALUES(campaign_row.client_id,campaign_row.id,recipient.id,CASE p_status WHEN 'read' THEN 'read' WHEN 'delivered' THEN 'delivered' ELSE 'failed' END,p_wamid||':'||p_status,jsonb_build_object('error_code',p_error_code)) ON CONFLICT(provider_event_id,event_type) DO NOTHING;
 RETURN jsonb_build_object('recorded',true,'campaign_id',campaign_row.id,'client_id',campaign_row.client_id,'bot_id',campaign_row.bot_id,'template_id',campaign_row.wa_template_id,'phone_number_id',campaign_row.wa_phone_number_id,'delivered_delta',delivered_delta,'read_delta',read_delta,'failed_delta',failed_delta);
END $$;

CREATE OR REPLACE FUNCTION public.bulk_whatsapp_record_click(p_wamid text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE recipient campaign_recipients;campaign_row campaigns;BEGIN
 SELECT * INTO recipient FROM campaign_recipients WHERE provider_message_id=p_wamid FOR UPDATE;IF NOT FOUND THEN RETURN jsonb_build_object('recorded',false);END IF;
 SELECT * INTO campaign_row FROM campaigns WHERE id=recipient.campaign_id AND channel='whatsapp' FOR UPDATE;IF NOT FOUND THEN RETURN jsonb_build_object('recorded',false);END IF;
 IF recipient.clicked_at IS NOT NULL THEN RETURN jsonb_build_object('recorded',false,'campaign_id',campaign_row.id);END IF;
 UPDATE campaign_recipients SET clicked_at=now() WHERE id=recipient.id;UPDATE campaigns SET click_count=click_count+1,updated_at=now() WHERE id=campaign_row.id;
 INSERT INTO whatsapp_campaign_events(client_id,campaign_id,recipient_id,event_type,provider_event_id) VALUES(campaign_row.client_id,campaign_row.id,recipient.id,'clicked',p_wamid||':clicked') ON CONFLICT(provider_event_id,event_type) DO NOTHING;
 RETURN jsonb_build_object('recorded',true,'campaign_id',campaign_row.id);
END $$;

CREATE OR REPLACE FUNCTION public.bulk_whatsapp_record_recipient_click(p_recipient uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE recipient campaign_recipients;campaign_row campaigns;BEGIN
 SELECT * INTO recipient FROM campaign_recipients WHERE id=p_recipient FOR UPDATE;IF NOT FOUND THEN RETURN jsonb_build_object('recorded',false);END IF;
 SELECT * INTO campaign_row FROM campaigns WHERE id=recipient.campaign_id AND channel='whatsapp' FOR UPDATE;IF NOT FOUND THEN RETURN jsonb_build_object('recorded',false);END IF;
 IF recipient.clicked_at IS NOT NULL THEN RETURN jsonb_build_object('recorded',false,'campaign_id',campaign_row.id);END IF;
 UPDATE campaign_recipients SET clicked_at=now() WHERE id=recipient.id;UPDATE campaigns SET click_count=click_count+1,updated_at=now() WHERE id=campaign_row.id;
 INSERT INTO whatsapp_campaign_events(client_id,campaign_id,recipient_id,event_type,provider_event_id) VALUES(campaign_row.client_id,campaign_row.id,recipient.id,'clicked','recipient:'||recipient.id::text||':clicked') ON CONFLICT(provider_event_id,event_type) DO NOTHING;
 RETURN jsonb_build_object('recorded',true,'campaign_id',campaign_row.id);
END $$;

CREATE OR REPLACE FUNCTION public.bulk_whatsapp_opt_out(p_client uuid,p_phone text,p_campaign uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE changed integer=0;BEGIN
 IF p_phone!~'^[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'INVALID_PHONE';END IF;
 INSERT INTO whatsapp_suppressions(client_id,phone_e164,reason,source_campaign_id) VALUES(p_client,p_phone,'opt_out_reply',p_campaign)
 ON CONFLICT(client_id,phone_e164) DO UPDATE SET reason='opt_out_reply',source_campaign_id=coalesce(excluded.source_campaign_id,whatsapp_suppressions.source_campaign_id),created_at=now();
 UPDATE contacts SET opt_in_whatsapp=false,whatsapp_opted_out_at=now(),updated_at=now() WHERE client_id=p_client AND phone_e164=p_phone AND opt_in_whatsapp=true;GET DIAGNOSTICS changed=ROW_COUNT;
 IF p_campaign IS NOT NULL AND NOT EXISTS(SELECT 1 FROM whatsapp_campaign_events WHERE campaign_id=p_campaign AND event_type='opted_out' AND metadata->>'phone_e164'=p_phone) THEN
  UPDATE campaigns SET opt_out_count=opt_out_count+1,updated_at=now() WHERE id=p_campaign AND client_id=p_client AND channel='whatsapp';
  INSERT INTO whatsapp_campaign_events(client_id,campaign_id,event_type,metadata) VALUES(p_client,p_campaign,'opted_out',jsonb_build_object('phone_e164',p_phone));
 END IF;
 RETURN jsonb_build_object('success',true,'contacts_updated',changed);
END $$;

REVOKE ALL ON FUNCTION public.saas_claim_whatsapp_delivery(uuid,text,text),public.saas_finish_whatsapp_delivery(uuid,text,text,text,text),public.bulk_whatsapp_preview_audience(uuid,uuid,jsonb),public.bulk_whatsapp_materialize(uuid,uuid),public.bulk_whatsapp_claim_batch_with_quota(uuid,uuid[],integer),public.bulk_whatsapp_commit_batch_outcomes(uuid,jsonb),public.bulk_whatsapp_record_status_event(text,text,integer,timestamptz),public.bulk_whatsapp_record_click(text),public.bulk_whatsapp_record_recipient_click(uuid),public.bulk_whatsapp_opt_out(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_claim_whatsapp_delivery(uuid,text,text),public.saas_finish_whatsapp_delivery(uuid,text,text,text,text),public.bulk_whatsapp_preview_audience(uuid,uuid,jsonb),public.bulk_whatsapp_materialize(uuid,uuid),public.bulk_whatsapp_claim_batch_with_quota(uuid,uuid[],integer),public.bulk_whatsapp_commit_batch_outcomes(uuid,jsonb),public.bulk_whatsapp_record_status_event(text,text,integer,timestamptz),public.bulk_whatsapp_record_click(text),public.bulk_whatsapp_record_recipient_click(uuid),public.bulk_whatsapp_opt_out(uuid,text,uuid) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
