-- Bounded, tenant- and bot-scoped catalogue reads for customer chat.
-- Apply after 053_bot_booking_commerce.sql and 066_universal_offering_discovery.sql.

CREATE OR REPLACE FUNCTION public.search_bot_catalog_page(
  p_client uuid,
  p_bot uuid,
  p_query text DEFAULT '',
  p_limit integer DEFAULT 20
) RETURNS TABLE(product jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  WITH configured AS (
    SELECT EXISTS(
      SELECT 1 FROM bot_commerce_config
      WHERE client_id=p_client AND bot_id=p_bot
    ) AS value
  ), normalized AS (
    SELECT left(trim(regexp_replace(coalesce(p_query,''),'[^[:alnum:] _-]+',' ','g')),200) AS q
  )
  -- The availability view was introduced before catalog_products.category.
  -- Read category from the source table so this migration also works on
  -- workspaces whose existing view still has its original frozen columns.
  SELECT to_jsonb(a) || jsonb_build_object('category',source_product.category) AS product
  FROM catalog_product_availability a
  JOIN catalog_products source_product ON source_product.id=a.id AND source_product.client_id=a.client_id
  CROSS JOIN configured c
  CROSS JOIN normalized n
  WHERE a.client_id=p_client
    AND a.status='active'
    AND (
      NOT c.value OR EXISTS(
        SELECT 1 FROM bot_catalog_products link
        WHERE link.client_id=p_client AND link.bot_id=p_bot AND link.product_id=a.id
      )
    )
    AND (
      n.q=''
      OR a.name ILIKE '%'||n.q||'%'
      OR coalesce(a.sku,'') ILIKE '%'||n.q||'%'
      OR coalesce(source_product.category,'') ILIKE '%'||n.q||'%'
      OR (
        source_product.search_tsv IS NOT NULL
        AND source_product.search_tsv @@ websearch_to_tsquery('english',n.q)
      )
    )
  ORDER BY
    CASE WHEN lower(coalesce(a.sku,''))=lower(n.q) THEN 0
         WHEN lower(a.name)=lower(n.q) THEN 1
         WHEN lower(a.name) LIKE lower(n.q)||'%' THEN 2 ELSE 3 END,
    a.name,a.id
  LIMIT greatest(1,least(coalesce(p_limit,20),50));
$$;

REVOKE ALL ON FUNCTION public.search_bot_catalog_page(uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.search_bot_catalog_page(uuid,uuid,text,integer) TO service_role;

COMMENT ON FUNCTION public.search_bot_catalog_page(uuid,uuid,text,integer) IS
'Returns at most 50 active public catalogue rows scoped to one tenant and bot; authoritative stock is rechecked during checkout.';
