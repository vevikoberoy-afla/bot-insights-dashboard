-- Explicit campaign audiences and audited one-to-one contact outreach.
-- Selected contacts bypass segment rules only; consent, suppression and address
-- validation remain mandatory in preview and materialization.

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS audience_mode text NOT NULL DEFAULT 'segment';
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS selected_contact_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.campaigns DROP CONSTRAINT IF EXISTS campaigns_audience_mode_check;
ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_audience_mode_check CHECK(audience_mode IN('segment','contacts'));

CREATE TABLE IF NOT EXISTS public.contact_communications(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
 bot_id uuid REFERENCES public.bots(id) ON DELETE SET NULL,
 actor_user_id uuid,
 channel text NOT NULL CHECK(channel IN('email','whatsapp','sms','phone')),
 direction text NOT NULL DEFAULT 'outbound' CHECK(direction IN('outbound','inbound')),
 subject text,
 body text NOT NULL DEFAULT '',
 status text NOT NULL CHECK(status IN('sending','sent','failed','opened_externally')),
 provider_message_id text,
 error text,
 metadata jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(),
 sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS contact_communications_contact_time ON public.contact_communications(client_id,contact_id,created_at DESC);
ALTER TABLE public.contact_communications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saas_member_read ON public.contact_communications;
DROP POLICY IF EXISTS saas_member_write ON public.contact_communications;
CREATE POLICY saas_member_read ON public.contact_communications FOR SELECT TO authenticated USING(public.saas_member_access(client_id,'contacts',false));
CREATE POLICY saas_member_write ON public.contact_communications FOR ALL TO authenticated USING(public.saas_member_access(client_id,'contacts',true)) WITH CHECK(public.saas_member_access(client_id,'contacts',true));

CREATE OR REPLACE FUNCTION public.bulk_email_preview_audience_v3(p_client uuid,p_bot uuid,p_ast jsonb,p_contact_ids uuid[] DEFAULT '{}') RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 WITH eligible AS(
  SELECT DISTINCT ON(lower(c.email))c.id,c.name,c.email FROM contacts c WHERE c.client_id=p_client AND c.opt_in_email=true
   AND c.email~*'^[^[:space:],;<>@]+@[^[:space:],;<>@]+\.[^[:space:],;<>@]+$'
   AND NOT EXISTS(SELECT 1 FROM email_suppressions s WHERE s.client_id=p_client AND lower(s.email)=lower(c.email))
   AND(CASE WHEN cardinality(coalesce(p_contact_ids,'{}'))>0 THEN c.id=ANY(p_contact_ids) ELSE bulk_email_contact_matches(p_client,c.id,c.tags,c.last_active_at,coalesce(p_ast,'{"combinator":"AND","rules":[]}'::jsonb)) END)
  ORDER BY lower(c.email),c.last_active_at DESC NULLS LAST,c.id
 ),total AS(SELECT count(*) count FROM eligible),sample AS(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') rows FROM(SELECT id,name,email FROM eligible ORDER BY id LIMIT 5)x)
 SELECT jsonb_build_object('count',total.count,'sample',sample.rows) FROM total,sample
$$;

CREATE OR REPLACE FUNCTION public.bulk_whatsapp_preview_audience_v3(p_client uuid,p_bot uuid,p_template uuid,p_ast jsonb,p_contact_ids uuid[] DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE category text;result jsonb;BEGIN
 SELECT t.category INTO category FROM whatsapp_templates t WHERE t.id=p_template AND t.client_id=p_client AND t.bot_id=p_bot AND t.status='APPROVED';
 IF category IS NULL THEN RETURN jsonb_build_object('count',0,'sample','[]'::jsonb);END IF;
 WITH eligible AS(
  SELECT DISTINCT ON(c.phone_e164)c.id,c.name,c.phone_e164 FROM contacts c WHERE c.client_id=p_client
   AND(CASE WHEN category='MARKETING' THEN c.opt_in_whatsapp_marketing ELSE c.opt_in_whatsapp_utility END)
   AND c.phone_e164~'^[1-9][0-9]{7,14}$'
   AND NOT EXISTS(SELECT 1 FROM whatsapp_suppressions s WHERE s.client_id=p_client AND s.phone_e164=c.phone_e164 AND(s.scope='all' OR(s.scope='marketing' AND category='MARKETING')))
   AND(CASE WHEN cardinality(coalesce(p_contact_ids,'{}'))>0 THEN c.id=ANY(p_contact_ids) ELSE bulk_email_contact_matches(p_client,c.id,c.tags,c.last_active_at,coalesce(p_ast,'{"combinator":"AND","rules":[]}'::jsonb)) END)
  ORDER BY c.phone_e164,c.last_active_at DESC NULLS LAST,c.id
 ),total AS(SELECT count(*) count FROM eligible),sample AS(SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') rows FROM(SELECT id,name,phone_e164 FROM eligible ORDER BY id LIMIT 5)x)
 SELECT jsonb_build_object('count',total.count,'sample',sample.rows) INTO result FROM total,sample;RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.bulk_email_materialize(p_client uuid,p_campaign uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE campaign campaigns;inserted integer;BEGIN
 SELECT * INTO campaign FROM campaigns WHERE id=p_campaign AND client_id=p_client AND channel='email' FOR UPDATE;
 IF NOT FOUND OR campaign.status NOT IN('draft','scheduled','sending') THEN RAISE EXCEPTION 'CAMPAIGN_NOT_LAUNCHABLE';END IF;
 WITH eligible AS(
  SELECT DISTINCT ON(lower(c.email))c.id,c.name,c.email FROM contacts c WHERE c.client_id=p_client AND c.opt_in_email=true
   AND c.email~*'^[^[:space:],;<>@]+@[^[:space:],;<>@]+\.[^[:space:],;<>@]+$'
   AND NOT EXISTS(SELECT 1 FROM email_suppressions s WHERE s.client_id=p_client AND lower(s.email)=lower(c.email))
   AND(CASE WHEN campaign.audience_mode='contacts' THEN c.id=ANY(campaign.selected_contact_ids) ELSE bulk_email_contact_matches(p_client,c.id,c.tags,c.last_active_at,campaign.inline_filter_ast) END)
  ORDER BY lower(c.email),c.last_active_at DESC NULLS LAST,c.id
 ) INSERT INTO campaign_recipients(campaign_id,contact_id,email,first_name,variables,status)
 SELECT campaign.id,c.id,lower(c.email),split_part(coalesce(c.name,''),' ',1),jsonb_build_object('name',coalesce(c.name,''),'first_name',split_part(coalesce(c.name,''),' ',1)),'pending' FROM eligible c
 WHERE NOT EXISTS(SELECT 1 FROM campaign_recipients r WHERE r.campaign_id=campaign.id AND lower(r.email)=lower(c.email)) ON CONFLICT(campaign_id,contact_id) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;UPDATE campaigns SET recipients_count=(SELECT count(*) FROM campaign_recipients WHERE campaign_id=campaign.id),updated_at=now() WHERE id=campaign.id;RETURN inserted;
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
   AND(CASE WHEN campaign.audience_mode='contacts' THEN c.id=ANY(campaign.selected_contact_ids) ELSE bulk_email_contact_matches(p_client,c.id,c.tags,c.last_active_at,campaign.inline_filter_ast) END)
  ORDER BY c.phone_e164,c.last_active_at DESC NULLS LAST,c.id
 ) INSERT INTO campaign_recipients(campaign_id,contact_id,phone_e164,first_name,variables,status)
 SELECT campaign.id,c.id,c.phone_e164,split_part(coalesce(c.name,''),' ',1),jsonb_build_object('name',coalesce(c.name,'')),'pending' FROM eligible c
 WHERE NOT EXISTS(SELECT 1 FROM campaign_recipients r WHERE r.campaign_id=campaign.id AND r.phone_e164=c.phone_e164) ON CONFLICT(campaign_id,contact_id) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;UPDATE campaigns SET recipients_count=(SELECT count(*) FROM campaign_recipients WHERE campaign_id=campaign.id),updated_at=now() WHERE id=campaign.id;RETURN inserted;
END $$;

REVOKE ALL ON FUNCTION public.bulk_email_preview_audience_v3(uuid,uuid,jsonb,uuid[]),public.bulk_whatsapp_preview_audience_v3(uuid,uuid,uuid,jsonb,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_email_preview_audience_v3(uuid,uuid,jsonb,uuid[]),public.bulk_whatsapp_preview_audience_v3(uuid,uuid,uuid,jsonb,uuid[]) TO service_role;
