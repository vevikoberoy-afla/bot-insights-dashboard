-- Production Shopify/WooCommerce connector projection.
-- Credentials remain encrypted in channel_integrations.config; this schema
-- stores only non-secret connection identity and normalized commerce data.

CREATE TABLE IF NOT EXISTS public.commerce_store_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 integration_id uuid NOT NULL REFERENCES public.channel_integrations(id) ON DELETE CASCADE,
 platform text NOT NULL CHECK(platform IN ('shopify','woocommerce')),
 store_domain text NOT NULL,
 external_store_id text,
 store_name text,
 currency text NOT NULL DEFAULT 'INR', country_code text, timezone text,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','syncing','active','paused','error','disconnected','uninstalled')),
 permissions jsonb NOT NULL DEFAULT '{}', settings jsonb NOT NULL DEFAULT '{}',
 last_reconciled_at timestamptz, last_synced_at timestamptz, last_sync_error text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(integration_id), UNIQUE(client_id,platform,store_domain)
);
CREATE INDEX IF NOT EXISTS commerce_store_connections_client_idx ON public.commerce_store_connections(client_id,status);

CREATE TABLE IF NOT EXISTS public.commerce_sync_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 store_connection_id uuid NOT NULL REFERENCES public.commerce_store_connections(id) ON DELETE CASCADE,
 job_type text NOT NULL CHECK(job_type IN ('initial','manual','reconcile','webhook')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','failed','cancelled')),
 cursor jsonb NOT NULL DEFAULT '{}', stats jsonb NOT NULL DEFAULT '{}', attempts integer NOT NULL DEFAULT 0,
 error text, started_at timestamptz, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commerce_sync_jobs_connection_idx ON public.commerce_sync_jobs(store_connection_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.commerce_webhook_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 store_connection_id uuid NOT NULL REFERENCES public.commerce_store_connections(id) ON DELETE CASCADE,
 platform text NOT NULL, external_event_id text NOT NULL, topic text NOT NULL,
 status text NOT NULL DEFAULT 'received' CHECK(status IN ('received','processing','processed','ignored','failed')),
 payload jsonb, payload_checksum text NOT NULL, error text, received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
 UNIQUE(platform,external_event_id)
);

ALTER TABLE public.catalog_products
 ADD COLUMN IF NOT EXISTS store_connection_id uuid REFERENCES public.commerce_store_connections(id) ON DELETE CASCADE,
 ADD COLUMN IF NOT EXISTS platform text,
 ADD COLUMN IF NOT EXISTS external_object_id text,
 ADD COLUMN IF NOT EXISTS external_updated_at timestamptz,
 ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'synced',
 ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
 ADD COLUMN IF NOT EXISTS last_sync_error text,
 ADD COLUMN IF NOT EXISTS raw_checksum text,
 ADD COLUMN IF NOT EXISTS product_url text,
 ADD COLUMN IF NOT EXISTS categories jsonb NOT NULL DEFAULT '[]',
 ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS vendor text;
CREATE UNIQUE INDEX IF NOT EXISTS catalog_products_external_unique ON public.catalog_products(client_id,store_connection_id,external_object_id) WHERE external_object_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.commerce_product_variants (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 store_connection_id uuid NOT NULL REFERENCES public.commerce_store_connections(id) ON DELETE CASCADE,
 platform text NOT NULL, external_object_id text NOT NULL, product_id uuid NOT NULL REFERENCES public.catalog_products(id) ON DELETE CASCADE,
 sku text, barcode text, title text NOT NULL DEFAULT '', option_values jsonb NOT NULL DEFAULT '{}',
 price numeric(12,2) NOT NULL DEFAULT 0, compare_at_price numeric(12,2), currency text NOT NULL DEFAULT 'INR',
 image_url text, weight numeric(12,3), weight_unit text, available_quantity integer NOT NULL DEFAULT 0,
 stock_management_enabled boolean NOT NULL DEFAULT true, backorder_policy text NOT NULL DEFAULT 'deny', purchasable boolean NOT NULL DEFAULT true,
 external_updated_at timestamptz, sync_status text NOT NULL DEFAULT 'synced', last_synced_at timestamptz, last_sync_error text, raw_checksum text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(client_id,store_connection_id,external_object_id), UNIQUE(id,client_id)
);

CREATE TABLE IF NOT EXISTS public.commerce_inventory_levels (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 store_connection_id uuid NOT NULL REFERENCES public.commerce_store_connections(id) ON DELETE CASCADE,
 platform text NOT NULL, external_object_id text NOT NULL, variant_id uuid REFERENCES public.commerce_product_variants(id) ON DELETE CASCADE,
 external_location_id text, location_name text, available_quantity integer NOT NULL DEFAULT 0,
 reserved_quantity integer NOT NULL DEFAULT 0, incoming_quantity integer NOT NULL DEFAULT 0, safety_stock integer NOT NULL DEFAULT 0,
 stock_status text NOT NULL DEFAULT 'in_stock', external_updated_at timestamptz, sync_status text NOT NULL DEFAULT 'synced',
 last_synced_at timestamptz, last_sync_error text, raw_checksum text,
 UNIQUE(client_id,store_connection_id,external_object_id,external_location_id)
);

ALTER TABLE public.commerce_orders
 ADD COLUMN IF NOT EXISTS store_connection_id uuid REFERENCES public.commerce_store_connections(id) ON DELETE SET NULL,
 ADD COLUMN IF NOT EXISTS platform text,
 ADD COLUMN IF NOT EXISTS external_object_id text,
 ADD COLUMN IF NOT EXISTS external_updated_at timestamptz,
 ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'synced',
 ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
 ADD COLUMN IF NOT EXISTS last_sync_error text,
 ADD COLUMN IF NOT EXISTS raw_checksum text,
 ADD COLUMN IF NOT EXISTS payment_status text,
 ADD COLUMN IF NOT EXISTS fulfilment_status text,
 ADD COLUMN IF NOT EXISTS tracking jsonb NOT NULL DEFAULT '{}',
 ADD COLUMN IF NOT EXISTS external_payload jsonb NOT NULL DEFAULT '{}';
ALTER TABLE public.commerce_orders DROP CONSTRAINT IF EXISTS commerce_orders_reference_key;
CREATE UNIQUE INDEX IF NOT EXISTS commerce_orders_client_reference_unique ON public.commerce_orders(client_id,reference);
CREATE UNIQUE INDEX IF NOT EXISTS commerce_orders_external_unique ON public.commerce_orders(client_id,store_connection_id,external_object_id) WHERE external_object_id IS NOT NULL;

ALTER TABLE public.commerce_order_items
 ADD COLUMN IF NOT EXISTS external_line_item_id text,
 ADD COLUMN IF NOT EXISTS external_variant_id text,
 ADD COLUMN IF NOT EXISTS external_product_id text;
CREATE UNIQUE INDEX IF NOT EXISTS commerce_order_items_external_unique
 ON public.commerce_order_items(order_id,external_line_item_id)
 WHERE external_line_item_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.commerce_fulfilments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 store_connection_id uuid NOT NULL REFERENCES public.commerce_store_connections(id) ON DELETE CASCADE,
 platform text NOT NULL, external_object_id text NOT NULL, order_id uuid NOT NULL REFERENCES public.commerce_orders(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending', carrier text, tracking_number text, tracking_url text,
 shipped_at timestamptz, estimated_delivery_at timestamptz, delivered_at timestamptz,
 fulfilled_line_items jsonb NOT NULL DEFAULT '[]', metadata jsonb NOT NULL DEFAULT '{}',
 external_updated_at timestamptz, sync_status text NOT NULL DEFAULT 'synced', last_synced_at timestamptz, last_sync_error text, raw_checksum text,
 UNIQUE(client_id,store_connection_id,external_object_id)
);

CREATE TABLE IF NOT EXISTS public.commerce_external_returns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 store_connection_id uuid NOT NULL REFERENCES public.commerce_store_connections(id) ON DELETE CASCADE,
 platform text NOT NULL, external_object_id text NOT NULL, order_id uuid REFERENCES public.commerce_orders(id) ON DELETE CASCADE,
 line_items jsonb NOT NULL DEFAULT '[]', requested_resolution text, return_status text NOT NULL DEFAULT 'pending_merchant_review',
 refund_status text NOT NULL DEFAULT 'none', refund_amount numeric(12,2) NOT NULL DEFAULT 0,
 reverse_shipment_tracking jsonb NOT NULL DEFAULT '{}', metadata jsonb NOT NULL DEFAULT '{}',
 external_updated_at timestamptz, sync_status text NOT NULL DEFAULT 'synced', last_synced_at timestamptz, last_sync_error text, raw_checksum text,
 UNIQUE(client_id,store_connection_id,external_object_id)
);

CREATE TABLE IF NOT EXISTS public.commerce_external_coupons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 store_connection_id uuid NOT NULL REFERENCES public.commerce_store_connections(id) ON DELETE CASCADE,
 platform text NOT NULL, external_object_id text NOT NULL, code text NOT NULL,
 discount_type text NOT NULL, discount_value numeric(12,2) NOT NULL DEFAULT 0, minimum_spend numeric(12,2), maximum_discount numeric(12,2),
 eligible_product_ids text[] NOT NULL DEFAULT '{}', eligible_category_ids text[] NOT NULL DEFAULT '{}',
 usage_limit_total integer, usage_limit_per_customer integer, current_usage_count integer NOT NULL DEFAULT 0,
 starts_at timestamptz, expires_at timestamptz, stacking_rules jsonb NOT NULL DEFAULT '{}', active boolean NOT NULL DEFAULT true,
 external_updated_at timestamptz, sync_status text NOT NULL DEFAULT 'synced', last_synced_at timestamptz, last_sync_error text, raw_checksum text,
 UNIQUE(client_id,store_connection_id,external_object_id)
);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['commerce_store_connections','commerce_sync_jobs','commerce_webhook_events','commerce_product_variants','commerce_inventory_levels','commerce_fulfilments','commerce_external_returns','commerce_external_coupons'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS service_access ON public.%I',t);
  EXECUTE format('CREATE POLICY service_access ON public.%I FOR ALL TO service_role USING(true) WITH CHECK(true)',t);
  EXECUTE format('DROP POLICY IF EXISTS tenant_read ON public.%I',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.workspace_memberships m WHERE m.client_id=%I.client_id AND m.user_id=auth.uid() AND m.status=''active''))',t,t);
 END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
