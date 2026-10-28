-- Explicit coupon/offer compatibility for catalogue and booking discounts.
-- Safe to rerun after 084_coupon_upsell_and_strict_support.sql.

ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS service_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS stackable boolean NOT NULL DEFAULT false;
ALTER TABLE public.coupons ADD COLUMN IF NOT EXISTS compatible_offer_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS coupons_service_scope_lookup ON public.coupons USING gin(service_ids);

COMMENT ON COLUMN public.coupons.stackable IS 'Opt-in only. False prevents this coupon being combined with any booking or product offer.';
COMMENT ON COLUMN public.coupons.compatible_offer_ids IS 'Offer IDs explicitly permitted when stackable is true.';

CREATE OR REPLACE FUNCTION public.enforce_offer_coupon_compatibility() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE selected_coupon coupons;
BEGIN
 IF NEW.offer_id IS NULL OR nullif(NEW.coupon_code,'') IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO selected_coupon FROM coupons WHERE client_id=NEW.client_id AND upper(code)=upper(NEW.coupon_code);
 IF NOT FOUND OR selected_coupon.stackable=false OR NOT NEW.offer_id=ANY(selected_coupon.compatible_offer_ids) THEN
  RAISE EXCEPTION 'This coupon cannot be combined with the selected offer';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_offer_coupon_compatibility_on_order ON public.commerce_orders;
CREATE TRIGGER enforce_offer_coupon_compatibility_on_order BEFORE INSERT ON public.commerce_orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_offer_coupon_compatibility();

NOTIFY pgrst, 'reload schema';
