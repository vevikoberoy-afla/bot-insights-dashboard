-- Bot-scoped commerce coupons and automatic cart upsell rules.
-- Apply after 083. This migration is additive and safe to rerun.

ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS max_uses integer;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS used_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS product_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS coupons_client_code_unique ON public.coupons(client_id,upper(code));
CREATE INDEX IF NOT EXISTS coupons_active_lookup ON public.coupons(client_id,is_active,expires_at);

ALTER TABLE public.bot_commerce_config ADD COLUMN IF NOT EXISTS upsell_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.bot_commerce_config ADD COLUMN IF NOT EXISTS upsell_max_gap numeric(12,2) NOT NULL DEFAULT 1000;

CREATE TABLE IF NOT EXISTS public.bot_coupon_rules (
 bot_id uuid NOT NULL REFERENCES public.bots(id) ON DELETE CASCADE,
 coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 enabled boolean NOT NULL DEFAULT true,
 auto_apply boolean NOT NULL DEFAULT false,
 custom_message text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(bot_id,coupon_id)
);
ALTER TABLE public.bot_coupon_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON public.bot_coupon_rules;
CREATE POLICY tenant_read ON public.bot_coupon_rules FOR SELECT TO authenticated USING(client_id=auth.uid());
CREATE INDEX IF NOT EXISTS bot_coupon_rules_lookup ON public.bot_coupon_rules(client_id,bot_id,enabled);

CREATE OR REPLACE FUNCTION public.save_bot_coupon_config(
 p_client uuid,p_bot uuid,p_coupon_ids uuid[] DEFAULT '{}',
 p_upsell_enabled boolean DEFAULT true,p_upsell_max_gap numeric DEFAULT 1000,
 p_auto_apply_ids uuid[] DEFAULT '{}'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM bots WHERE id=p_bot AND client_id=p_client) THEN RAISE EXCEPTION 'Bot not found'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_coupon_ids) x(value) WHERE NOT EXISTS(SELECT 1 FROM coupons c WHERE c.id=x.value AND c.client_id=p_client)) THEN RAISE EXCEPTION 'Invalid coupon assignment'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(p_auto_apply_ids) x(value) WHERE NOT x.value=ANY(p_coupon_ids)) THEN RAISE EXCEPTION 'Auto-apply coupon must be assigned'; END IF;
 UPDATE bot_commerce_config SET upsell_enabled=p_upsell_enabled,upsell_max_gap=least(100000000,greatest(0,p_upsell_max_gap)),updated_at=now() WHERE bot_id=p_bot AND client_id=p_client;
 DELETE FROM bot_coupon_rules WHERE bot_id=p_bot;
 INSERT INTO bot_coupon_rules(bot_id,coupon_id,client_id,auto_apply)
 SELECT p_bot,id,p_client,id=ANY(p_auto_apply_ids) FROM unnest(p_coupon_ids) id;
END $$;
REVOKE ALL ON FUNCTION public.save_bot_coupon_config(uuid,uuid,uuid[],boolean,numeric,uuid[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_bot_coupon_config(uuid,uuid,uuid[],boolean,numeric,uuid[]) TO service_role;

-- Redemption is counted in the same transaction as the order. The row lock
-- prevents two final uses being consumed concurrently.
CREATE OR REPLACE FUNCTION public.consume_catalog_coupon() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE selected_coupon coupons;
BEGIN
 IF NEW.coupon_code IS NULL OR NEW.booking_id IS NOT NULL THEN RETURN NEW; END IF;
 SELECT * INTO selected_coupon FROM coupons WHERE client_id=NEW.client_id AND upper(code)=upper(NEW.coupon_code) FOR UPDATE;
 IF NOT FOUND OR selected_coupon.is_active=false OR (selected_coupon.expires_at IS NOT NULL AND selected_coupon.expires_at<=now()) THEN RAISE EXCEPTION 'Coupon is unavailable'; END IF;
 IF selected_coupon.max_uses IS NOT NULL AND selected_coupon.used_count>=selected_coupon.max_uses THEN RAISE EXCEPTION 'Coupon is exhausted'; END IF;
 UPDATE coupons SET used_count=used_count+1,updated_at=now() WHERE id=selected_coupon.id;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS consume_catalog_coupon_on_order ON public.commerce_orders;
CREATE TRIGGER consume_catalog_coupon_on_order BEFORE INSERT ON public.commerce_orders FOR EACH ROW EXECUTE FUNCTION public.consume_catalog_coupon();

NOTIFY pgrst, 'reload schema';
