-- Universal product/service discovery with hybrid full-text + semantic RRF.
-- Apply after 065_restaurant_table_inventory.sql. Safe to re-run.

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.catalog_products ADD COLUMN IF NOT EXISTS search_attributes text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.catalog_products ADD COLUMN IF NOT EXISTS occasions_intents text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.catalog_products ADD COLUMN IF NOT EXISTS price_tier text NOT NULL DEFAULT 'standard';
ALTER TABLE public.catalog_products ADD COLUMN IF NOT EXISTS bestseller_score integer NOT NULL DEFAULT 50;
ALTER TABLE public.catalog_products ADD COLUMN IF NOT EXISTS compressed_catalog_line text;
ALTER TABLE public.catalog_products ADD COLUMN IF NOT EXISTS search_tsv tsvector;
ALTER TABLE public.catalog_products ADD COLUMN IF NOT EXISTS discovery_embedding vector(768);

ALTER TABLE public.booking_services ADD COLUMN IF NOT EXISTS search_attributes text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.booking_services ADD COLUMN IF NOT EXISTS occasions_intents text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.booking_services ADD COLUMN IF NOT EXISTS price_tier text NOT NULL DEFAULT 'standard';
ALTER TABLE public.booking_services ADD COLUMN IF NOT EXISTS bestseller_score integer NOT NULL DEFAULT 50;
ALTER TABLE public.booking_services ADD COLUMN IF NOT EXISTS compressed_catalog_line text;
ALTER TABLE public.booking_services ADD COLUMN IF NOT EXISTS search_tsv tsvector;
ALTER TABLE public.booking_services ADD COLUMN IF NOT EXISTS discovery_embedding vector(768);

ALTER TABLE public.catalog_products DROP CONSTRAINT IF EXISTS catalog_products_price_tier_check;
ALTER TABLE public.catalog_products ADD CONSTRAINT catalog_products_price_tier_check CHECK(price_tier IN ('budget','standard','premium','luxury'));
ALTER TABLE public.catalog_products DROP CONSTRAINT IF EXISTS catalog_products_bestseller_score_check;
ALTER TABLE public.catalog_products ADD CONSTRAINT catalog_products_bestseller_score_check CHECK(bestseller_score BETWEEN 0 AND 100);
ALTER TABLE public.booking_services DROP CONSTRAINT IF EXISTS booking_services_price_tier_check;
ALTER TABLE public.booking_services ADD CONSTRAINT booking_services_price_tier_check CHECK(price_tier IN ('budget','standard','premium','luxury'));
ALTER TABLE public.booking_services DROP CONSTRAINT IF EXISTS booking_services_bestseller_score_check;
ALTER TABLE public.booking_services ADD CONSTRAINT booking_services_bestseller_score_check CHECK(bestseller_score BETWEEN 0 AND 100);

CREATE OR REPLACE FUNCTION public.refresh_product_search_tsv() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  NEW.search_tsv:=to_tsvector('english',concat_ws(' ',NEW.name,NEW.description,coalesce(NEW.category,''),
    array_to_string(NEW.search_attributes,' '),array_to_string(NEW.occasions_intents,' ')));
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.refresh_service_search_tsv() RETURNS trigger
LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  NEW.search_tsv:=to_tsvector('english',concat_ws(' ',NEW.name,NEW.description,coalesce(NEW.configuration->>'category',''),
    array_to_string(NEW.search_attributes,' '),array_to_string(NEW.occasions_intents,' ')));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS catalog_products_discovery_tsv ON public.catalog_products;
CREATE TRIGGER catalog_products_discovery_tsv BEFORE INSERT OR UPDATE OF name,description,category,search_attributes,occasions_intents
ON public.catalog_products FOR EACH ROW EXECUTE FUNCTION public.refresh_product_search_tsv();
DROP TRIGGER IF EXISTS booking_services_discovery_tsv ON public.booking_services;
CREATE TRIGGER booking_services_discovery_tsv BEFORE INSERT OR UPDATE OF name,description,configuration,search_attributes,occasions_intents
ON public.booking_services FOR EACH ROW EXECUTE FUNCTION public.refresh_service_search_tsv();

UPDATE public.catalog_products SET search_tsv=to_tsvector('english',concat_ws(' ',name,description,coalesce(category,''),array_to_string(search_attributes,' '),array_to_string(occasions_intents,' '))) WHERE search_tsv IS NULL;
UPDATE public.booking_services SET search_tsv=to_tsvector('english',concat_ws(' ',name,description,coalesce(configuration->>'category',''),array_to_string(search_attributes,' '),array_to_string(occasions_intents,' '))) WHERE search_tsv IS NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_products_discovery_tsv ON public.catalog_products USING gin(search_tsv);
CREATE INDEX IF NOT EXISTS idx_booking_services_discovery_tsv ON public.booking_services USING gin(search_tsv);
CREATE INDEX IF NOT EXISTS idx_catalog_products_discovery_embedding ON public.catalog_products USING hnsw(discovery_embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_booking_services_discovery_embedding ON public.booking_services USING hnsw(discovery_embedding vector_cosine_ops);

CREATE OR REPLACE FUNCTION public.match_bot_offerings_hybrid(
  p_client uuid,p_bot uuid,p_query_text text,p_query_embedding vector(768),p_scope text DEFAULT 'all',p_limit integer DEFAULT 15
) RETURNS TABLE(offering_type text,id uuid,name text,description text,price numeric,currency text,image_url text,sku text,category text,available_quantity bigint,duration_min integer,score double precision,compressed_catalog_line text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH configured AS (SELECT EXISTS(SELECT 1 FROM bot_commerce_config WHERE client_id=p_client AND bot_id=p_bot) value),
eligible AS (
 SELECT 'product'::text offering_type,p.id,p.name,p.description,p.price,p.currency,p.image_url,p.sku,p.category,
  CASE WHEN p.track_inventory AND NOT p.allow_backorder THEN greatest(0,p.stock_quantity-coalesce((SELECT sum(h.quantity) FROM commerce_holds h WHERE h.product_id=p.id AND h.status='active' AND h.expires_at>now()),0)) ELSE 999999 END::bigint available_quantity,
  NULL::integer duration_min,p.search_tsv,p.discovery_embedding,p.bestseller_score,p.compressed_catalog_line
 FROM catalog_products p CROSS JOIN configured c
 WHERE p.client_id=p_client AND p.status='active' AND p_scope IN ('all','product')
  AND (NOT p.track_inventory OR p.allow_backorder OR p.stock_quantity>coalesce((SELECT sum(h.quantity) FROM commerce_holds h WHERE h.product_id=p.id AND h.status='active' AND h.expires_at>now()),0))
  AND (NOT c.value OR EXISTS(SELECT 1 FROM bot_catalog_products link WHERE link.client_id=p_client AND link.bot_id=p_bot AND link.product_id=p.id))
 UNION ALL
 SELECT 'service'::text,s.id,s.name,s.description,s.price,s.currency,NULL::text,NULL::text,coalesce(s.configuration->>'category','Service'),s.capacity::bigint,s.duration_min,
  s.search_tsv,s.discovery_embedding,s.bestseller_score,s.compressed_catalog_line
 FROM booking_services s CROSS JOIN configured c
 WHERE s.client_id=p_client AND s.is_active AND p_scope IN ('all','service')
  AND (NOT c.value OR EXISTS(SELECT 1 FROM bot_booking_services link WHERE link.client_id=p_client AND link.bot_id=p_bot AND link.service_id=s.id))
), semantic AS (
 SELECT offering_type,id,row_number() OVER(ORDER BY discovery_embedding<=>p_query_embedding) rank_ix
 FROM eligible WHERE discovery_embedding IS NOT NULL ORDER BY discovery_embedding<=>p_query_embedding LIMIT 30
), keyword AS (
 SELECT offering_type,id,row_number() OVER(ORDER BY ts_rank_cd(search_tsv,websearch_to_tsquery('english',p_query_text)) DESC) rank_ix
 FROM eligible WHERE search_tsv @@ websearch_to_tsquery('english',p_query_text)
 ORDER BY ts_rank_cd(search_tsv,websearch_to_tsquery('english',p_query_text)) DESC LIMIT 30
), fused AS (
 SELECT coalesce(s.offering_type,k.offering_type) offering_type,coalesce(s.id,k.id) id,
  coalesce(1.0/(60+s.rank_ix),0)*0.6+coalesce(1.0/(60+k.rank_ix),0)*0.4 rrf
 FROM semantic s FULL JOIN keyword k ON k.offering_type=s.offering_type AND k.id=s.id
)
SELECT e.offering_type,e.id,e.name,e.description,e.price,e.currency,e.image_url,e.sku,e.category,e.available_quantity,e.duration_min,
 (f.rrf+e.bestseller_score/100000.0)::double precision score,e.compressed_catalog_line
FROM fused f JOIN eligible e USING(offering_type,id)
ORDER BY score DESC LIMIT least(greatest(p_limit,1),15)
$$;

REVOKE ALL ON FUNCTION public.match_bot_offerings_hybrid(uuid,uuid,text,vector,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.match_bot_offerings_hybrid(uuid,uuid,text,vector,text,integer) TO service_role;
NOTIFY pgrst, 'reload schema';
