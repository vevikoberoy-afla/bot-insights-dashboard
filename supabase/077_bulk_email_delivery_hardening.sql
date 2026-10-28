-- Bulk email V2 production edge hardening. Apply after 076.
BEGIN;

-- Preserve the two-RPC claim/commit design while distinguishing a stale ledger
-- reservation from proof that a provider call started. The worker resolves
-- stale_sending through its durable-before-dispatch Redis wave breadcrumb.
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
   UPDATE campaign_recipients SET status='processing',claimed_at=now(),attempt_count=attempt_count+1 WHERE id=recipient.id;
   recipient_id=recipient.id;contact_id=recipient.contact_id;email=recipient.email;first_name=recipient.first_name;variables=recipient.variables;operation_id=op_key;provider_message_id=delivery.provider_message_id;claim_error=delivery.error_code;
   IF delivery.status='accepted' THEN already_sent=true;delivery_state='accepted';claim_error=NULL;
   ELSIF delivery.status='sending' THEN already_sent=false;delivery_state='stale_sending';
   ELSIF delivery.status='unknown' THEN already_sent=false;delivery_state='unknown';
   ELSE already_sent=false;delivery_state='failed';END IF;
   RETURN NEXT;CONTINUE;
  END IF;
  payload_hash=md5(lower(recipient.email)||'|'||coalesce(campaign_row.subject,campaign_row.name)||'|'||p_campaign::text);
  BEGIN reservation=saas_claim_delivery(campaign_row.client_id,op_key,payload_hash,'marketing');
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

-- Delete at most 10,000 terminal rows per invocation to bound WAL, lock time,
-- and vacuum pressure while live workers use SKIP LOCKED on the same table.
CREATE OR REPLACE FUNCTION public.purge_old_campaign_recipients() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE deleted integer;
BEGIN
 WITH to_delete AS (
  SELECT cr.id FROM campaign_recipients cr JOIN campaigns c ON c.id=cr.campaign_id
  WHERE c.status IN('completed','cancelled') AND c.completed_at<now()-interval '30 days'
   AND cr.status IN('sent','opened','clicked','failed','bounced','cancelled')
  ORDER BY c.completed_at,cr.id LIMIT 10000 FOR UPDATE OF cr SKIP LOCKED
 )
 DELETE FROM campaign_recipients cr USING to_delete d WHERE cr.id=d.id;
 GET DIAGNOSTICS deleted=ROW_COUNT;RETURN deleted;
END $$;

REVOKE ALL ON FUNCTION public.bulk_email_claim_batch_with_quota(uuid,uuid[],integer),public.purge_old_campaign_recipients() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_email_claim_batch_with_quota(uuid,uuid[],integer),public.purge_old_campaign_recipients() TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
