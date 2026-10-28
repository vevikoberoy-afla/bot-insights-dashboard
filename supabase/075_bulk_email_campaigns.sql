-- Production bulk email lane using the existing contacts/campaigns sources of truth.
-- Apply after 074_workspace_member_permissions.sql.
BEGIN;

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS preview_text text NOT NULL DEFAULT '';
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS from_name text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS from_email text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS reply_to_email text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS content_json jsonb NOT NULL DEFAULT '{"body":""}'::jsonb;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS featured_product_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS coupon_code text NOT NULL DEFAULT '';
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS inline_filter_ast jsonb NOT NULL DEFAULT '{"combinator":"AND","rules":[]}'::jsonb;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS qstash_message_id text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS recipients_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS sent_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS delivered_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS bounced_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS complaint_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS failed_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS paused_at timestamptz;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS failure_reason text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS first_name text NOT NULL DEFAULT '';
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS variables jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS esp_message_id text;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS clicked_at timestamptz;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.campaign_recipients ADD COLUMN IF NOT EXISTS last_error text;
UPDATE public.campaign_recipients r SET email=lower(c.email),first_name=split_part(coalesce(c.name,''),' ',1) FROM public.contacts c WHERE c.id=r.contact_id AND r.email IS NULL;
CREATE INDEX IF NOT EXISTS campaign_recipients_pending_cursor ON public.campaign_recipients(campaign_id,id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS campaign_recipients_processing ON public.campaign_recipients(campaign_id,claimed_at) WHERE status='processing';
-- Older campaigns can legitimately contain duplicate contact rows which share an
-- email address. Do not make the migration fail (or delete audit history) by
-- forcing a unique index over those rows. New bulk campaigns deduplicate in the
-- materialisation RPC below while this lookup index keeps that check inexpensive.
DROP INDEX IF EXISTS public.campaign_recipient_email_unique;
CREATE INDEX IF NOT EXISTS campaign_recipient_email_lookup ON public.campaign_recipients(campaign_id,lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.email_suppressions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL,email text NOT NULL,reason text NOT NULL CHECK(reason IN('hard_bounce','spam_complaint','unsubscribed','manual')),
 source_campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(client_id,email)
);
CREATE INDEX IF NOT EXISTS email_suppressions_lookup ON public.email_suppressions(client_id,lower(email));
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_member_read ON public.email_suppressions;
DROP POLICY IF EXISTS saas_member_write ON public.email_suppressions;
CREATE POLICY saas_member_read ON public.email_suppressions FOR SELECT TO authenticated USING(public.saas_member_access(client_id,'campaigns',false));
CREATE POLICY saas_member_write ON public.email_suppressions FOR ALL TO authenticated USING(public.saas_member_access(client_id,'campaigns',true)) WITH CHECK(public.saas_member_access(client_id,'campaigns',true));

CREATE TABLE IF NOT EXISTS public.email_campaign_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,recipient_id uuid REFERENCES public.campaign_recipients(id) ON DELETE SET NULL,
 event_type text NOT NULL CHECK(event_type IN('launched','scheduled','cancelled','sent','failed','delivered','opened','clicked','bounced','complained','unsubscribed','circuit_paused')),
 provider_event_id text,metadata jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider_event_id,event_type)
);
CREATE INDEX IF NOT EXISTS email_campaign_events_campaign_time ON public.email_campaign_events(campaign_id,created_at DESC);
ALTER TABLE public.email_campaign_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_member_read ON public.email_campaign_events;
CREATE POLICY saas_member_read ON public.email_campaign_events FOR SELECT TO authenticated USING(public.saas_member_access(client_id,'campaigns',false));

CREATE OR REPLACE FUNCTION public.bulk_email_contact_matches(p_client uuid,p_contact uuid,p_tags text[],p_last_active timestamptz,p_ast jsonb) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE rule jsonb; matches boolean; result boolean; orders_count bigint; spent numeric; last_order timestamptz; field text; op text; numeric_value numeric; text_value text; actual numeric;
BEGIN
 IF p_ast IS NULL OR jsonb_array_length(coalesce(p_ast->'rules','[]'))=0 THEN RETURN true; END IF;
 IF p_ast->>'combinator' NOT IN ('AND','OR') OR jsonb_array_length(p_ast->'rules')>20 THEN RETURN false; END IF;
 SELECT count(*) FILTER(WHERE status<>'cancelled'),coalesce(sum(total) FILTER(WHERE status<>'cancelled'),0),max(created_at) FILTER(WHERE status<>'cancelled')
 INTO orders_count,spent,last_order FROM commerce_orders WHERE client_id=p_client AND contact_id=p_contact;
 result=(p_ast->>'combinator'='AND');
 FOR rule IN SELECT value FROM jsonb_array_elements(p_ast->'rules') LOOP
  field=rule->>'field';op=rule->>'operator';text_value=lower(trim(rule->>'value'));matches=false;
  IF field='tags' THEN matches=CASE WHEN op='contains' THEN text_value=ANY(ARRAY(SELECT lower(x) FROM unnest(coalesce(p_tags,'{}')) x)) WHEN op='not_contains' THEN NOT(text_value=ANY(ARRAY(SELECT lower(x) FROM unnest(coalesce(p_tags,'{}')) x))) ELSE false END;
  ELSE
   BEGIN numeric_value=(rule->>'value')::numeric; EXCEPTION WHEN OTHERS THEN RETURN false; END;
   actual=CASE field WHEN 'total_spent' THEN spent WHEN 'total_orders' THEN orders_count WHEN 'last_order_days_ago' THEN CASE WHEN last_order IS NULL THEN 1000000000 ELSE extract(epoch FROM(now()-last_order))/86400 END WHEN 'last_chat_days_ago' THEN CASE WHEN p_last_active IS NULL THEN 1000000000 ELSE extract(epoch FROM(now()-p_last_active))/86400 END ELSE NULL END;
   matches=CASE op WHEN 'gt' THEN actual>numeric_value WHEN 'gte' THEN actual>=numeric_value WHEN 'lt' THEN actual<numeric_value WHEN 'lte' THEN actual<=numeric_value WHEN 'eq' THEN actual=numeric_value ELSE false END;
  END IF;
  IF p_ast->>'combinator'='AND' AND NOT matches THEN RETURN false; END IF;
  IF p_ast->>'combinator'='OR' AND matches THEN RETURN true; END IF;
 END LOOP;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.bulk_email_preview_audience(p_client uuid,p_bot uuid,p_ast jsonb) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH eligible AS (
  SELECT DISTINCT ON(lower(c.email)) c.id,c.name,c.email FROM contacts c WHERE c.client_id=p_client AND c.opt_in_email=true
   AND c.email ~* '^[^[:space:],;<>@]+@[^[:space:],;<>@]+\.[^[:space:],;<>@]+$'
   AND NOT EXISTS(SELECT 1 FROM email_suppressions s WHERE s.client_id=p_client AND lower(s.email)=lower(c.email))
   AND bulk_email_contact_matches(p_client,c.id,c.tags,c.last_active_at,coalesce(p_ast,'{"combinator":"AND","rules":[]}'::jsonb))
  ORDER BY lower(c.email),c.last_active_at DESC NULLS LAST,c.id
 ), total AS (SELECT count(*) count FROM eligible), sample AS (SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) rows FROM(SELECT id,name,email FROM eligible ORDER BY id LIMIT 5)x)
 SELECT jsonb_build_object('count',total.count,'sample',sample.rows) FROM total,sample
$$;

CREATE OR REPLACE FUNCTION public.bulk_email_materialize(p_client uuid,p_campaign uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE campaign campaigns; inserted integer;
BEGIN
 SELECT * INTO campaign FROM campaigns WHERE id=p_campaign AND client_id=p_client AND channel='email' FOR UPDATE;
 IF NOT FOUND OR campaign.status NOT IN ('draft','scheduled','sending') THEN RAISE EXCEPTION 'CAMPAIGN_NOT_LAUNCHABLE'; END IF;
 WITH eligible AS (
  SELECT DISTINCT ON(lower(c.email)) c.id,c.name,c.email
  FROM contacts c
  WHERE c.client_id=p_client AND c.opt_in_email=true
   AND c.email ~* '^[^[:space:],;<>@]+@[^[:space:],;<>@]+\.[^[:space:],;<>@]+$'
   AND NOT EXISTS(SELECT 1 FROM email_suppressions s WHERE s.client_id=p_client AND lower(s.email)=lower(c.email))
   AND bulk_email_contact_matches(p_client,c.id,c.tags,c.last_active_at,campaign.inline_filter_ast)
  ORDER BY lower(c.email),c.last_active_at DESC NULLS LAST,c.id
 )
 INSERT INTO campaign_recipients(campaign_id,contact_id,email,first_name,variables,status)
 SELECT campaign.id,c.id,lower(c.email),split_part(coalesce(c.name,''),' ',1),jsonb_build_object('name',coalesce(c.name,''),'first_name',split_part(coalesce(c.name,''),' ',1)),'pending'
 FROM eligible c
 WHERE NOT EXISTS(SELECT 1 FROM campaign_recipients r WHERE r.campaign_id=campaign.id AND lower(r.email)=lower(c.email))
 ON CONFLICT(campaign_id,contact_id) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;
 UPDATE campaigns SET recipients_count=(SELECT count(*) FROM campaign_recipients WHERE campaign_id=campaign.id),updated_at=now() WHERE id=campaign.id;
 RETURN inserted;
END $$;

CREATE OR REPLACE FUNCTION public.bulk_email_claim_recipients(p_campaign uuid,p_ids uuid[]) RETURNS SETOF campaign_recipients
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 UPDATE campaign_recipients SET status='processing',claimed_at=now(),attempt_count=attempt_count+1
 WHERE campaign_id=p_campaign AND id=ANY(p_ids) AND status='pending' RETURNING *
$$;

CREATE OR REPLACE FUNCTION public.bulk_email_record_engagement(p_recipient uuid,p_event text,p_metadata jsonb DEFAULT '{}') RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE row campaign_recipients; cid uuid; first_event boolean=false;
BEGIN
 SELECT * INTO row FROM campaign_recipients WHERE id=p_recipient FOR UPDATE; IF NOT FOUND THEN RETURN false; END IF;
 SELECT client_id INTO cid FROM campaigns WHERE id=row.campaign_id;
 IF p_event='opened' AND row.opened_at IS NULL THEN UPDATE campaign_recipients SET opened_at=now(),status=CASE WHEN status='sent' THEN 'opened' ELSE status END WHERE id=p_recipient;UPDATE campaigns SET open_count=open_count+1 WHERE id=row.campaign_id;first_event=true;
 ELSIF p_event='clicked' AND row.clicked_at IS NULL THEN UPDATE campaign_recipients SET clicked_at=now(),opened_at=coalesce(opened_at,now()),status=CASE WHEN status IN('sent','opened') THEN 'clicked' ELSE status END WHERE id=p_recipient;UPDATE campaigns SET click_count=click_count+1,open_count=open_count+CASE WHEN row.opened_at IS NULL THEN 1 ELSE 0 END WHERE id=row.campaign_id;first_event=true; END IF;
 IF first_event THEN INSERT INTO email_campaign_events(client_id,campaign_id,recipient_id,event_type,metadata) VALUES(cid,row.campaign_id,p_recipient,p_event,p_metadata); END IF;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.bulk_email_unsubscribe(p_recipient uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE row campaign_recipients; campaign campaigns;
BEGIN
 SELECT * INTO row FROM campaign_recipients WHERE id=p_recipient;IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO campaign FROM campaigns WHERE id=row.campaign_id;
 INSERT INTO email_suppressions(client_id,bot_id,email,reason,source_campaign_id) VALUES(campaign.client_id,campaign.bot_id,lower(row.email),'unsubscribed',campaign.id)
 ON CONFLICT(client_id,email) DO UPDATE SET reason='unsubscribed',source_campaign_id=excluded.source_campaign_id,created_at=now();
 UPDATE contacts SET opt_in_email=false,updated_at=now() WHERE id=row.contact_id AND client_id=campaign.client_id;
 INSERT INTO email_campaign_events(client_id,campaign_id,recipient_id,event_type) VALUES(campaign.client_id,campaign.id,row.id,'unsubscribed');RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.bulk_email_record_provider_event(p_recipient uuid,p_event text,p_provider_event text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE row campaign_recipients; campaign campaigns; changed boolean=false;
BEGIN
 SELECT * INTO row FROM campaign_recipients WHERE id=p_recipient FOR UPDATE;IF NOT FOUND THEN RETURN jsonb_build_object('recorded',false);END IF;
 SELECT * INTO campaign FROM campaigns WHERE id=row.campaign_id FOR UPDATE;
 IF p_event='delivered' AND row.delivered_at IS NULL THEN UPDATE campaign_recipients SET delivered_at=now() WHERE id=row.id;UPDATE campaigns SET delivered_count=delivered_count+1 WHERE id=campaign.id;changed=true;
 ELSIF p_event='bounced' AND row.status<>'bounced' THEN UPDATE campaign_recipients SET status='bounced',last_error='Permanent bounce' WHERE id=row.id;UPDATE campaigns SET bounced_count=bounced_count+1 WHERE id=campaign.id;INSERT INTO email_suppressions(client_id,bot_id,email,reason,source_campaign_id) VALUES(campaign.client_id,campaign.bot_id,lower(row.email),'hard_bounce',campaign.id) ON CONFLICT(client_id,email) DO UPDATE SET reason='hard_bounce',source_campaign_id=excluded.source_campaign_id,created_at=now();changed=true;
 ELSIF p_event='complained' THEN INSERT INTO email_suppressions(client_id,bot_id,email,reason,source_campaign_id) VALUES(campaign.client_id,campaign.bot_id,lower(row.email),'spam_complaint',campaign.id) ON CONFLICT(client_id,email) DO UPDATE SET reason='spam_complaint',source_campaign_id=excluded.source_campaign_id,created_at=now();IF NOT EXISTS(SELECT 1 FROM email_campaign_events WHERE campaign_id=campaign.id AND recipient_id=row.id AND event_type='complained') THEN UPDATE campaigns SET complaint_count=complaint_count+1 WHERE id=campaign.id;changed=true;END IF;
 END IF;
 IF changed THEN INSERT INTO email_campaign_events(client_id,campaign_id,recipient_id,event_type,provider_event_id) VALUES(campaign.client_id,campaign.id,row.id,p_event,p_provider_event) ON CONFLICT(provider_event_id,event_type) DO NOTHING;END IF;
 RETURN jsonb_build_object('recorded',changed,'campaign_id',campaign.id,'client_id',campaign.client_id,'sent_count',campaign.sent_count,'bounced_count',campaign.bounced_count+CASE WHEN p_event='bounced' AND changed THEN 1 ELSE 0 END,'complaint_count',campaign.complaint_count+CASE WHEN p_event='complained' AND changed THEN 1 ELSE 0 END);
END $$;

CREATE OR REPLACE FUNCTION public.purge_old_campaign_recipients() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE deleted integer;BEGIN DELETE FROM campaign_recipients r USING campaigns c WHERE r.campaign_id=c.id AND c.completed_at<now()-interval '30 days' AND r.status IN('sent','opened','clicked','failed','bounced','cancelled');GET DIAGNOSTICS deleted=ROW_COUNT;RETURN deleted;END $$;

REVOKE ALL ON FUNCTION public.bulk_email_preview_audience(uuid,uuid,jsonb),public.bulk_email_materialize(uuid,uuid),public.bulk_email_claim_recipients(uuid,uuid[]),public.bulk_email_record_engagement(uuid,text,jsonb),public.bulk_email_unsubscribe(uuid),public.bulk_email_record_provider_event(uuid,text,text),public.purge_old_campaign_recipients() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_email_preview_audience(uuid,uuid,jsonb),public.bulk_email_materialize(uuid,uuid),public.bulk_email_claim_recipients(uuid,uuid[]),public.bulk_email_record_engagement(uuid,text,jsonb),public.bulk_email_unsubscribe(uuid),public.bulk_email_record_provider_event(uuid,text,text),public.purge_old_campaign_recipients() TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
