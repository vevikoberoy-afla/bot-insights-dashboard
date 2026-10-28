-- Enterprise WhatsApp upgrades. Apply after 078_bulk_whatsapp_campaigns.sql.
-- This migration adapts the V2 design to the existing durable delivery ledger
-- instead of replacing its idempotency and quota guarantees.
BEGIN;

ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS opt_in_whatsapp_marketing boolean NOT NULL DEFAULT false;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS opt_in_whatsapp_utility boolean NOT NULL DEFAULT true;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS whatsapp_marketing_opted_out_at timestamptz;
UPDATE public.contacts SET opt_in_whatsapp_marketing=true WHERE opt_in_whatsapp=true AND opt_in_whatsapp_marketing=false;
CREATE INDEX IF NOT EXISTS contacts_wa_marketing_eligible ON public.contacts(client_id,phone_e164,last_active_at DESC) WHERE opt_in_whatsapp_marketing=true AND phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_wa_utility_eligible ON public.contacts(client_id,phone_e164,last_active_at DESC) WHERE opt_in_whatsapp_utility=true AND phone_e164 IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_legacy_whatsapp_consent() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.opt_in_whatsapp=true AND (TG_OP='INSERT' OR coalesce(OLD.opt_in_whatsapp,false)=false) THEN NEW.opt_in_whatsapp_marketing=true;END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS contacts_sync_legacy_whatsapp_consent ON public.contacts;
CREATE TRIGGER contacts_sync_legacy_whatsapp_consent BEFORE INSERT OR UPDATE OF opt_in_whatsapp ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_whatsapp_consent();

ALTER TABLE public.whatsapp_suppressions ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'marketing';
ALTER TABLE public.whatsapp_suppressions DROP CONSTRAINT IF EXISTS whatsapp_suppressions_scope_check;
ALTER TABLE public.whatsapp_suppressions ADD CONSTRAINT whatsapp_suppressions_scope_check CHECK(scope IN('marketing','all'));
UPDATE public.whatsapp_suppressions SET scope=CASE WHEN reason IN('invalid_number','not_on_whatsapp','spam_blocked') THEN 'all' ELSE 'marketing' END;
CREATE OR REPLACE FUNCTION public.scope_whatsapp_suppression() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN IF NEW.reason IN('invalid_number','not_on_whatsapp','spam_blocked') THEN NEW.scope='all';END IF;RETURN NEW;END $$;
DROP TRIGGER IF EXISTS whatsapp_suppressions_scope_reason ON public.whatsapp_suppressions;
CREATE TRIGGER whatsapp_suppressions_scope_reason BEFORE INSERT OR UPDATE OF reason,scope ON public.whatsapp_suppressions FOR EACH ROW EXECUTE FUNCTION public.scope_whatsapp_suppression();

ALTER TABLE public.whatsapp_phone_health ADD COLUMN IF NOT EXISTS waba_id text;
ALTER TABLE public.whatsapp_phone_health ADD COLUMN IF NOT EXISTS display_phone_number text;
ALTER TABLE public.whatsapp_phone_health ADD COLUMN IF NOT EXISTS verified_name text;
ALTER TABLE public.whatsapp_phone_health ADD COLUMN IF NOT EXISTS messaging_limit_tier text NOT NULL DEFAULT 'TIER_1K';
ALTER TABLE public.whatsapp_phone_health ADD COLUMN IF NOT EXISTS max_daily_recipients integer NOT NULL DEFAULT 1000;
ALTER TABLE public.whatsapp_phone_health ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'CONNECTED';
UPDATE public.whatsapp_phone_health SET messaging_limit_tier=CASE
 WHEN upper(coalesce(current_limit,'')) IN('TIER_UNLIMITED','UNLIMITED') THEN 'TIER_UNLIMITED'
 WHEN upper(coalesce(current_limit,'')) ~ '100K' THEN 'TIER_100K'
 WHEN upper(coalesce(current_limit,'')) ~ '10K' THEN 'TIER_10K'
 WHEN upper(coalesce(current_limit,'')) ~ '250' THEN 'TIER_250'
 ELSE 'TIER_1K' END WHERE current_limit IS NOT NULL;
UPDATE public.whatsapp_phone_health SET max_daily_recipients=CASE messaging_limit_tier WHEN 'TIER_250' THEN 250 WHEN 'TIER_10K' THEN 10000 WHEN 'TIER_100K' THEN 100000 WHEN 'TIER_UNLIMITED' THEN 2147483647 ELSE 1000 END;

CREATE TABLE IF NOT EXISTS public.whatsapp_media_cache(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 phone_number_id text NOT NULL,media_sha256 text NOT NULL,media_type text NOT NULL DEFAULT 'image',meta_media_id text NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT(now()+interval '25 days'),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(phone_number_id,media_sha256)
);
CREATE INDEX IF NOT EXISTS whatsapp_media_cache_lookup ON public.whatsapp_media_cache(phone_number_id,media_sha256,expires_at);
ALTER TABLE public.whatsapp_media_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_media_cache_read ON public.whatsapp_media_cache;
CREATE POLICY whatsapp_media_cache_read ON public.whatsapp_media_cache FOR SELECT TO authenticated USING(public.saas_member_access(client_id,'campaigns',false));

-- Conservative rolling-24-hour unique-recipient reservation. Reserving before
-- dispatch protects Meta quality when several campaigns start concurrently.
CREATE TABLE IF NOT EXISTS public.whatsapp_tier_recipients(
 phone_number_id text NOT NULL,phone_e164 text NOT NULL,campaign_id uuid REFERENCES public.campaigns(id) ON DELETE CASCADE,
 reserved_at timestamptz NOT NULL DEFAULT now(),reserved_until timestamptz NOT NULL DEFAULT(now()+interval '24 hours'),
 PRIMARY KEY(phone_number_id,phone_e164)
);
CREATE INDEX IF NOT EXISTS whatsapp_tier_recipients_expiry ON public.whatsapp_tier_recipients(phone_number_id,reserved_until);
ALTER TABLE public.whatsapp_tier_recipients ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bulk_whatsapp_preview_audience_v2(p_client uuid,p_bot uuid,p_template uuid,p_ast jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE category text;result jsonb;BEGIN
 SELECT t.category INTO category FROM whatsapp_templates t WHERE t.id=p_template AND t.client_id=p_client AND t.bot_id=p_bot AND t.status='APPROVED';
 IF category IS NULL THEN RETURN jsonb_build_object('count',0,'sample','[]'::jsonb);END IF;
 WITH eligible AS(
  SELECT DISTINCT ON(c.phone_e164)c.id,c.name,c.phone_e164 FROM contacts c WHERE c.client_id=p_client
   AND(CASE WHEN category='MARKETING' THEN c.opt_in_whatsapp_marketing ELSE c.opt_in_whatsapp_utility END)
   AND c.phone_e164~'^[1-9][0-9]{7,14}$'
   AND NOT EXISTS(SELECT 1 FROM whatsapp_suppressions s WHERE s.client_id=p_client AND s.phone_e164=c.phone_e164 AND(s.scope='all' OR(s.scope='marketing' AND category='MARKETING')))
   AND bulk_email_contact_matches(p_client,c.id,c.tags,c.last_active_at,coalesce(p_ast,'{"combinator":"AND","rules":[]}'::jsonb))
  ORDER BY c.phone_e164,c.last_active_at DESC NULLS LAST,c.id
 ),total AS(SELECT count(*) count FROM eligible),sample AS(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') rows FROM(SELECT id,name,phone_e164 FROM eligible ORDER BY id LIMIT 5)x)
 SELECT jsonb_build_object('count',total.count,'sample',sample.rows) INTO result FROM total,sample;RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.bulk_whatsapp_materialize(p_client uuid,p_campaign uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE campaign campaigns;category text;inserted integer;BEGIN
 SELECT * INTO campaign FROM campaigns WHERE id=p_campaign AND client_id=p_client AND channel='whatsapp' FOR UPDATE;
 IF NOT FOUND OR campaign.status NOT IN('draft','scheduled','sending') THEN RAISE EXCEPTION 'CAMPAIGN_NOT_LAUNCHABLE';END IF;
 SELECT t.category INTO category FROM whatsapp_templates t WHERE t.id=campaign.wa_template_id;
 WITH eligible AS(
  SELECT DISTINCT ON(c.phone_e164)c.id,c.name,c.phone_e164 FROM contacts c WHERE c.client_id=p_client
   AND(CASE WHEN category='MARKETING' THEN c.opt_in_whatsapp_marketing ELSE c.opt_in_whatsapp_utility END)
   AND c.phone_e164~'^[1-9][0-9]{7,14}$'
   AND NOT EXISTS(SELECT 1 FROM whatsapp_suppressions s WHERE s.client_id=p_client AND s.phone_e164=c.phone_e164 AND(s.scope='all' OR(s.scope='marketing' AND category='MARKETING')))
   AND bulk_email_contact_matches(p_client,c.id,c.tags,c.last_active_at,campaign.inline_filter_ast)
  ORDER BY c.phone_e164,c.last_active_at DESC NULLS LAST,c.id
 ) INSERT INTO campaign_recipients(campaign_id,contact_id,phone_e164,first_name,variables,status)
 SELECT campaign.id,c.id,c.phone_e164,split_part(coalesce(c.name,''),' ',1),jsonb_build_object('name',coalesce(c.name,'')),'pending' FROM eligible c
 WHERE NOT EXISTS(SELECT 1 FROM campaign_recipients r WHERE r.campaign_id=campaign.id AND r.phone_e164=c.phone_e164) ON CONFLICT(campaign_id,contact_id) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;UPDATE campaigns SET recipients_count=(SELECT count(*) FROM campaign_recipients WHERE campaign_id=campaign.id),updated_at=now() WHERE id=campaign.id;RETURN inserted;
END $$;

CREATE OR REPLACE FUNCTION public.bulk_whatsapp_reserve_tier(p_campaign uuid,p_waba text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE campaign campaigns;health whatsapp_phone_health;used integer;required integer;limit_value integer;BEGIN
 SELECT * INTO campaign FROM campaigns WHERE id=p_campaign AND channel='whatsapp' FOR UPDATE;IF NOT FOUND THEN RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND';END IF;
 INSERT INTO whatsapp_phone_health(phone_number_id,client_id,waba_id,quality_rating,current_limit,messaging_limit_tier,max_daily_recipients,status)
 VALUES(campaign.wa_phone_number_id,campaign.client_id,p_waba,'UNKNOWN','TIER_1K','TIER_1K',1000,'CONNECTED') ON CONFLICT(phone_number_id) DO NOTHING;
 SELECT * INTO health FROM whatsapp_phone_health WHERE phone_number_id=campaign.wa_phone_number_id FOR UPDATE;
 IF health.status IN('RESTRICTED','BLOCKED') THEN RETURN jsonb_build_object('allowed',false,'reason','PHONE_'||health.status,'limit',health.max_daily_recipients,'used',0,'required',0);END IF;
 DELETE FROM whatsapp_tier_recipients WHERE phone_number_id=campaign.wa_phone_number_id AND reserved_until<=now();
 SELECT count(*) INTO used FROM whatsapp_tier_recipients WHERE phone_number_id=campaign.wa_phone_number_id;
 SELECT count(DISTINCT r.phone_e164) INTO required FROM campaign_recipients r WHERE r.campaign_id=p_campaign AND NOT EXISTS(SELECT 1 FROM whatsapp_tier_recipients x WHERE x.phone_number_id=campaign.wa_phone_number_id AND x.phone_e164=r.phone_e164);
 limit_value=greatest(0,health.max_daily_recipients);
 IF health.messaging_limit_tier<>'TIER_UNLIMITED' AND used+required>limit_value THEN RETURN jsonb_build_object('allowed',false,'reason','TIER_CAPACITY','limit',limit_value,'used',used,'required',required,'remaining',greatest(0,limit_value-used));END IF;
 INSERT INTO whatsapp_tier_recipients(phone_number_id,phone_e164,campaign_id) SELECT campaign.wa_phone_number_id,r.phone_e164,p_campaign FROM campaign_recipients r WHERE r.campaign_id=p_campaign ON CONFLICT(phone_number_id,phone_e164) DO UPDATE SET reserved_at=now(),reserved_until=now()+interval '24 hours';
 RETURN jsonb_build_object('allowed',true,'limit',limit_value,'used',used,'required',required,'remaining',CASE WHEN health.messaging_limit_tier='TIER_UNLIMITED' THEN NULL ELSE greatest(0,limit_value-used-required) END);
END $$;

-- Replace the late suppression check while preserving the V1 delivery ledger.
CREATE OR REPLACE FUNCTION public.bulk_whatsapp_claim_batch_with_quota(p_campaign uuid,p_ids uuid[],p_lease_seconds integer DEFAULT 300)
RETURNS TABLE(recipient_id uuid,contact_id uuid,phone_e164 text,first_name text,variables jsonb,operation_id text,already_sent boolean,provider_message_id text,delivery_state text,claim_error text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE campaign_row campaigns;recipient campaign_recipients;category text;op_key text;payload_hash text;delivery saas_delivery_operations;reservation jsonb;BEGIN
 IF coalesce(array_length(p_ids,1),0)=0 OR array_length(p_ids,1)>50 THEN RAISE EXCEPTION 'INVALID_BATCH_SIZE';END IF;
 SELECT * INTO campaign_row FROM campaigns WHERE id=p_campaign AND channel='whatsapp' AND status='sending';IF NOT FOUND THEN RETURN;END IF;
 SELECT t.category INTO category FROM whatsapp_templates t WHERE t.id=campaign_row.wa_template_id;
 FOR recipient IN SELECT r.* FROM campaign_recipients r WHERE r.campaign_id=p_campaign AND r.id=ANY(p_ids) AND(r.status='pending' OR(r.status='processing' AND r.claimed_at<now()-make_interval(secs=>greatest(60,least(p_lease_seconds,3600))))) ORDER BY r.id FOR UPDATE SKIP LOCKED LOOP
  op_key='bulk_wa:'||p_campaign::text||':'||recipient.id::text;recipient_id=recipient.id;contact_id=recipient.contact_id;phone_e164=recipient.phone_e164;first_name=recipient.first_name;variables=recipient.variables;operation_id=op_key;already_sent=false;provider_message_id=NULL;claim_error=NULL;
  IF EXISTS(SELECT 1 FROM whatsapp_suppressions s WHERE s.client_id=campaign_row.client_id AND s.phone_e164=recipient.phone_e164 AND(s.scope='all' OR(s.scope='marketing' AND category='MARKETING'))) THEN UPDATE campaign_recipients SET status='processing',claimed_at=now(),attempt_count=attempt_count+1,last_error='Number suppressed before dispatch' WHERE id=recipient.id;delivery_state='suppressed';claim_error='Number suppressed before dispatch';RETURN NEXT;CONTINUE;END IF;
  SELECT d.* INTO delivery FROM saas_delivery_operations d WHERE d.client_id=campaign_row.client_id AND d.operation=op_key;
  IF FOUND THEN UPDATE campaign_recipients SET status='processing',claimed_at=now(),attempt_count=attempt_count+1 WHERE id=recipient.id;provider_message_id=delivery.provider_message_id;claim_error=delivery.error_code;IF delivery.status='accepted' THEN already_sent=true;delivery_state='accepted';claim_error=NULL;ELSIF delivery.status='sending' THEN delivery_state='stale_sending';ELSIF delivery.status='unknown' THEN delivery_state='unknown';ELSE delivery_state='failed';END IF;RETURN NEXT;CONTINUE;END IF;
  payload_hash=md5(recipient.phone_e164||'|'||coalesce(campaign_row.wa_template_id::text,'')||'|'||p_campaign::text);
  BEGIN reservation=saas_claim_whatsapp_delivery(campaign_row.client_id,op_key,payload_hash);EXCEPTION WHEN OTHERS THEN UPDATE campaign_recipients SET status='processing',claimed_at=now(),attempt_count=attempt_count+1,last_error=left(SQLERRM,500) WHERE id=recipient.id;delivery_state='rejected';claim_error=left(SQLERRM,500);RETURN NEXT;CONTINUE;END;
  UPDATE campaign_recipients SET status='processing',claimed_at=now(),attempt_count=attempt_count+1,last_error=NULL WHERE id=recipient.id;
  IF coalesce((reservation->>'send')::boolean,false) THEN delivery_state='reserved';ELSIF reservation->>'status'='accepted' THEN already_sent=true;provider_message_id=reservation->>'message_id';delivery_state='accepted';ELSE delivery_state='rejected';claim_error='WhatsApp allowance unavailable';END IF;RETURN NEXT;
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.bulk_whatsapp_opt_out(p_client uuid,p_phone text,p_campaign uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE changed integer=0;BEGIN
 IF p_phone!~'^[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'INVALID_PHONE';END IF;
 INSERT INTO whatsapp_suppressions(client_id,phone_e164,reason,source_campaign_id,scope) VALUES(p_client,p_phone,'opt_out_reply',p_campaign,'marketing')
 ON CONFLICT(client_id,phone_e164) DO UPDATE SET reason='opt_out_reply',scope=CASE WHEN whatsapp_suppressions.scope='all' THEN 'all' ELSE 'marketing' END,source_campaign_id=coalesce(excluded.source_campaign_id,whatsapp_suppressions.source_campaign_id),created_at=now();
 UPDATE contacts SET opt_in_whatsapp_marketing=false,whatsapp_marketing_opted_out_at=now(),updated_at=now() WHERE client_id=p_client AND phone_e164=p_phone AND opt_in_whatsapp_marketing=true;GET DIAGNOSTICS changed=ROW_COUNT;
 IF p_campaign IS NOT NULL AND NOT EXISTS(SELECT 1 FROM whatsapp_campaign_events WHERE campaign_id=p_campaign AND event_type='opted_out' AND metadata->>'phone_e164'=p_phone) THEN UPDATE campaigns SET opt_out_count=opt_out_count+1,updated_at=now() WHERE id=p_campaign AND client_id=p_client AND channel='whatsapp';INSERT INTO whatsapp_campaign_events(client_id,campaign_id,event_type,metadata) VALUES(p_client,p_campaign,'opted_out',jsonb_build_object('phone_e164',p_phone,'scope','marketing'));END IF;
 RETURN jsonb_build_object('success',true,'contacts_updated',changed,'scope','marketing');
END $$;

REVOKE ALL ON FUNCTION public.bulk_whatsapp_preview_audience_v2(uuid,uuid,uuid,jsonb),public.bulk_whatsapp_reserve_tier(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_whatsapp_preview_audience_v2(uuid,uuid,uuid,jsonb),public.bulk_whatsapp_reserve_tier(uuid,text) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
