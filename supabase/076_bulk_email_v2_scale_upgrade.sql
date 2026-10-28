-- Bulk email V2: asynchronous materialisation, batch delivery RPCs, lease
-- reconciliation and high-volume indexes. Apply after 075.
BEGIN;

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS materialized_at timestamptz;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS materialization_started_at timestamptz;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS transport_mode text NOT NULL DEFAULT 'ses';
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_transport_mode_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_transport_mode_check CHECK(transport_mode IN('ses','smtp'));

CREATE INDEX IF NOT EXISTS contacts_bulk_email_eligible ON public.contacts(client_id,lower(email),last_active_at DESC) WHERE opt_in_email=true AND email IS NOT NULL;
CREATE INDEX IF NOT EXISTS commerce_orders_contact_metrics ON public.commerce_orders(client_id,contact_id,created_at DESC) WHERE status<>'cancelled';
CREATE INDEX IF NOT EXISTS campaign_recipients_lease_recovery ON public.campaign_recipients(campaign_id,claimed_at,id) WHERE status='processing';

ALTER TABLE public.email_campaign_events DROP CONSTRAINT IF EXISTS email_campaign_events_event_type_check;
ALTER TABLE public.email_campaign_events ADD CONSTRAINT email_campaign_events_event_type_check CHECK(event_type IN('launched','scheduled','cancelled','sent','failed','batch_processed','delivered','opened','clicked','bounced','complained','unsubscribed','circuit_paused'));

-- One network round-trip claims a complete worker batch and reserves each
-- recipient's SaaS allowance inside the same database transaction. Expired
-- leases are retried only if no delivery-ledger row exists. Accepted deliveries
-- are reconciled; ambiguous operations are never sent twice.
DROP FUNCTION IF EXISTS public.bulk_email_claim_batch_with_quota(uuid,uuid[],integer);
CREATE OR REPLACE FUNCTION public.bulk_email_claim_batch_with_quota(p_campaign uuid,p_ids uuid[],p_lease_seconds integer DEFAULT 300)
RETURNS TABLE(recipient_id uuid,contact_id uuid,email text,first_name text,variables jsonb,operation_id text,already_sent boolean,provider_message_id text,delivery_state text,claim_error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE campaign_row campaigns; recipient campaign_recipients; op_key text; payload_hash text; delivery saas_delivery_operations; reservation jsonb;
BEGIN
 IF coalesce(array_length(p_ids,1),0)=0 OR array_length(p_ids,1)>100 THEN RAISE EXCEPTION 'INVALID_BATCH_SIZE'; END IF;
 SELECT * INTO campaign_row FROM campaigns WHERE id=p_campaign AND status='sending';IF NOT FOUND THEN RETURN;END IF;
 FOR recipient IN
  SELECT r.* FROM campaign_recipients r
  WHERE r.campaign_id=p_campaign AND r.id=ANY(p_ids)
   AND (r.status='pending' OR (r.status='processing' AND r.claimed_at<now()-make_interval(secs=>greatest(60,least(p_lease_seconds,3600)))))
  ORDER BY r.id FOR UPDATE SKIP LOCKED
 LOOP
  IF EXISTS(SELECT 1 FROM email_suppressions s WHERE s.client_id=campaign_row.client_id AND lower(s.email)=lower(recipient.email)) THEN
   UPDATE campaign_recipients SET status='processing',claimed_at=now(),attempt_count=attempt_count+1,last_error='Address suppressed before dispatch' WHERE id=recipient.id;
   recipient_id=recipient.id;contact_id=recipient.contact_id;email=recipient.email;first_name=recipient.first_name;variables=recipient.variables;operation_id='bulk:'||p_campaign::text||':'||recipient.id::text;already_sent=false;provider_message_id=NULL;delivery_state='suppressed';claim_error='Address suppressed before dispatch';RETURN NEXT;CONTINUE;
  END IF;
  op_key='bulk:'||p_campaign::text||':'||recipient.id::text;
  SELECT d.* INTO delivery FROM saas_delivery_operations d WHERE d.client_id=campaign_row.client_id AND d.operation=op_key;
  IF FOUND THEN
   IF delivery.status='accepted' THEN
    UPDATE campaign_recipients SET status='processing',claimed_at=now(),attempt_count=attempt_count+1 WHERE id=recipient.id;
    recipient_id=recipient.id;contact_id=recipient.contact_id;email=recipient.email;first_name=recipient.first_name;variables=recipient.variables;operation_id=op_key;already_sent=true;provider_message_id=delivery.provider_message_id;delivery_state='accepted';claim_error=NULL;RETURN NEXT;
   ELSE
    IF delivery.status='sending' THEN PERFORM saas_finish_delivery(campaign_row.client_id,op_key,'unknown',NULL,'STALE_AMBIGUOUS_DELIVERY');END IF;
    UPDATE campaign_recipients SET status='processing',claimed_at=now(),attempt_count=attempt_count+1 WHERE id=recipient.id;
    recipient_id=recipient.id;contact_id=recipient.contact_id;email=recipient.email;first_name=recipient.first_name;variables=recipient.variables;operation_id=op_key;already_sent=false;provider_message_id=delivery.provider_message_id;delivery_state=CASE WHEN delivery.status IN('sending','unknown') THEN 'unknown' ELSE 'failed' END;claim_error=delivery.error_code;RETURN NEXT;
   END IF;
  END IF;
  -- This value is an idempotency fingerprint, not a security signature. MD5 is
  -- used only for stable equality and keeps the migration extension-free.
  payload_hash=md5(lower(recipient.email)||'|'||coalesce(campaign_row.subject,campaign_row.name)||'|'||p_campaign::text);
  BEGIN
   reservation=saas_claim_delivery(campaign_row.client_id,op_key,payload_hash,'marketing');
  EXCEPTION WHEN OTHERS THEN
   UPDATE campaign_recipients SET status='processing',claimed_at=now(),attempt_count=attempt_count+1,last_error=left(SQLERRM,500) WHERE id=recipient.id;
   recipient_id=recipient.id;contact_id=recipient.contact_id;email=recipient.email;first_name=recipient.first_name;variables=recipient.variables;operation_id=op_key;already_sent=false;provider_message_id=NULL;delivery_state='rejected';claim_error=left(SQLERRM,500);RETURN NEXT;CONTINUE;
  END;
  IF coalesce((reservation->>'send')::boolean,false) THEN
   UPDATE campaign_recipients SET status='processing',claimed_at=now(),attempt_count=attempt_count+1,last_error=NULL WHERE id=recipient.id;
   recipient_id=recipient.id;contact_id=recipient.contact_id;email=recipient.email;first_name=recipient.first_name;variables=recipient.variables;operation_id=op_key;already_sent=false;provider_message_id=NULL;delivery_state='reserved';claim_error=NULL;RETURN NEXT;
  ELSIF reservation->>'status'='accepted' THEN
   UPDATE campaign_recipients SET status='processing',claimed_at=now(),attempt_count=attempt_count+1 WHERE id=recipient.id;
   recipient_id=recipient.id;contact_id=recipient.contact_id;email=recipient.email;first_name=recipient.first_name;variables=recipient.variables;operation_id=op_key;already_sent=true;provider_message_id=reservation->>'message_id';delivery_state='accepted';claim_error=NULL;RETURN NEXT;
  ELSE
   UPDATE campaign_recipients SET status='processing',claimed_at=now(),attempt_count=attempt_count+1,last_error='Email allowance unavailable' WHERE id=recipient.id;
   recipient_id=recipient.id;contact_id=recipient.contact_id;email=recipient.email;first_name=recipient.first_name;variables=recipient.variables;operation_id=op_key;already_sent=false;provider_message_id=NULL;delivery_state='rejected';claim_error='Email allowance unavailable';RETURN NEXT;
  END IF;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.bulk_email_commit_batch_outcomes(p_campaign uuid,p_outcomes jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE campaign_row campaigns; outcome jsonb; recipient_id uuid; outcome_status text; operation text; message_id text; error_text text; sent_delta integer=0;failed_delta integer=0;remaining integer=0;new_status text;
BEGIN
 IF jsonb_typeof(p_outcomes)<>'array' OR jsonb_array_length(p_outcomes)>100 THEN RAISE EXCEPTION 'INVALID_OUTCOMES';END IF;
 SELECT * INTO campaign_row FROM campaigns WHERE id=p_campaign FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND';END IF;
 FOR outcome IN SELECT value FROM jsonb_array_elements(p_outcomes) LOOP
  BEGIN recipient_id=(outcome->>'recipient_id')::uuid;EXCEPTION WHEN OTHERS THEN CONTINUE;END;
  outcome_status=outcome->>'status';IF outcome_status NOT IN('sent','failed','unknown','suppressed','rejected') THEN CONTINUE;END IF;
  operation='bulk:'||p_campaign::text||':'||recipient_id::text;message_id=nullif(outcome->>'provider_message_id','');error_text=left(coalesce(outcome->>'error',''),500);
  IF outcome_status='sent' THEN
   PERFORM saas_finish_delivery(campaign_row.client_id,operation,'accepted',message_id,NULL);
   UPDATE campaign_recipients SET status='sent',sent_at=coalesce(sent_at,now()),esp_message_id=coalesce(message_id,esp_message_id),last_error=NULL
    WHERE id=recipient_id AND campaign_id=p_campaign AND status='processing';
   IF FOUND THEN sent_delta=sent_delta+1;END IF;
  ELSE
   IF outcome_status NOT IN('suppressed','rejected') THEN PERFORM saas_finish_delivery(campaign_row.client_id,operation,CASE WHEN outcome_status='unknown' THEN 'unknown' ELSE 'failed' END,NULL,left(error_text,100));END IF;
   UPDATE campaign_recipients SET status='failed',last_error=error_text WHERE id=recipient_id AND campaign_id=p_campaign AND status='processing';
   IF FOUND THEN failed_delta=failed_delta+1;END IF;
  END IF;
 END LOOP;
 SELECT count(*) INTO remaining FROM campaign_recipients WHERE campaign_id=p_campaign AND status IN('pending','processing');
 UPDATE campaigns SET sent_count=sent_count+sent_delta,failed_count=failed_count+failed_delta,
  status=CASE WHEN status='sending' AND remaining=0 THEN 'completed' ELSE status END,
  completed_at=CASE WHEN status='sending' AND remaining=0 THEN coalesce(completed_at,now()) ELSE completed_at END,updated_at=now()
 WHERE id=p_campaign RETURNING status INTO new_status;
 INSERT INTO email_campaign_events(client_id,campaign_id,event_type,metadata) VALUES(campaign_row.client_id,p_campaign,'batch_processed',jsonb_build_object('sent_delta',sent_delta,'failed_delta',failed_delta,'remaining',remaining));
 RETURN jsonb_build_object('sent_delta',sent_delta,'failed_delta',failed_delta,'remaining',remaining,'campaign_status',new_status);
END $$;

CREATE OR REPLACE FUNCTION public.bulk_email_record_engagement_v2(p_recipient uuid,p_event text,p_metadata jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE recipient campaign_recipients; campaign_row campaigns; recorded boolean=false;
BEGIN
 SELECT * INTO recipient FROM campaign_recipients WHERE id=p_recipient FOR UPDATE;IF NOT FOUND THEN RETURN jsonb_build_object('recorded',false);END IF;
 SELECT * INTO campaign_row FROM campaigns WHERE id=recipient.campaign_id;
 IF p_event='opened' AND recipient.opened_at IS NULL THEN
  UPDATE campaign_recipients SET opened_at=now(),status=CASE WHEN status='sent' THEN 'opened' ELSE status END WHERE id=p_recipient;
  UPDATE campaigns SET open_count=open_count+1 WHERE id=recipient.campaign_id;recorded=true;
 ELSIF p_event='clicked' AND recipient.clicked_at IS NULL THEN
  UPDATE campaign_recipients SET clicked_at=now(),opened_at=coalesce(opened_at,now()),status=CASE WHEN status IN('sent','opened') THEN 'clicked' ELSE status END WHERE id=p_recipient;
  UPDATE campaigns SET click_count=click_count+1,open_count=open_count+CASE WHEN recipient.opened_at IS NULL THEN 1 ELSE 0 END WHERE id=recipient.campaign_id;recorded=true;
 END IF;
 IF recorded THEN INSERT INTO email_campaign_events(client_id,campaign_id,recipient_id,event_type,metadata) VALUES(campaign_row.client_id,campaign_row.id,p_recipient,p_event,p_metadata);END IF;
 RETURN jsonb_build_object('recorded',recorded,'campaign_id',campaign_row.id,'opened_delta',CASE WHEN recorded AND (p_event='opened' OR recipient.opened_at IS NULL) THEN 1 ELSE 0 END,'clicked_delta',CASE WHEN recorded AND p_event='clicked' THEN 1 ELSE 0 END);
END $$;

REVOKE ALL ON FUNCTION public.bulk_email_claim_batch_with_quota(uuid,uuid[],integer),public.bulk_email_commit_batch_outcomes(uuid,jsonb),public.bulk_email_record_engagement_v2(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_email_claim_batch_with_quota(uuid,uuid[],integer),public.bulk_email_commit_batch_outcomes(uuid,jsonb),public.bulk_email_record_engagement_v2(uuid,text,jsonb) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
