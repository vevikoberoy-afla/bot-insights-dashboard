-- 050_ticketing_system.sql
-- Production ticketing, deterministic support flows, audit history and CSAT.
-- This migration is additive so the existing tickets and inbox continue to work.

CREATE TABLE IF NOT EXISTS public.bot_settings (
  bot_id UUID PRIMARY KEY REFERENCES public.bots(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  support_config JSONB NOT NULL DEFAULT '{
    "returns_refunds": false,
    "exchanges": false,
    "price_lookup": false,
    "stock_lookup": false,
    "ticket_status": false,
    "csat": false,
    "photo_uploads": false,
    "return_window_days": 30,
    "require_order_verification": true,
    "allow_unverified_complaints": true,
    "allowed_resolutions": ["refund", "exchange", "store_credit"]
  }'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  external_id TEXT,
  sku TEXT,
  name TEXT NOT NULL,
  price NUMERIC(12,2),
  currency TEXT NOT NULL DEFAULT 'INR',
  inventory_quantity INTEGER,
  inventory_status TEXT NOT NULL DEFAULT 'unknown',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS support_products_external_unique
  ON public.support_products(client_id, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS support_products_sku_unique
  ON public.support_products(client_id, sku) WHERE sku IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.support_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  external_id TEXT,
  order_number TEXT NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  customer_email TEXT,
  customer_phone TEXT,
  status TEXT NOT NULL DEFAULT 'processing',
  fulfillment_status TEXT,
  total_amount NUMERIC(12,2),
  currency TEXT NOT NULL DEFAULT 'INR',
  placed_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, order_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS support_orders_external_unique
  ON public.support_orders(client_id, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.support_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.support_orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.support_products(id) ON DELETE SET NULL,
  external_id TEXT,
  sku TEXT,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(12,2),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(order_id, external_id)
);

CREATE TABLE IF NOT EXISTS public.ticket_counters (
  client_id UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  last_number BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.next_ticket_number(p_client_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE next_value BIGINT;
BEGIN
  INSERT INTO public.ticket_counters(client_id, last_number)
  VALUES (p_client_id, 1)
  ON CONFLICT (client_id) DO UPDATE
    SET last_number = public.ticket_counters.last_number + 1,
        updated_at = now()
  RETURNING last_number INTO next_value;
  RETURN 'TKT-' || lpad(next_value::text, 6, '0');
END;
$$;

ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS ticket_number TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'general';
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified';
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.support_orders(id) ON DELETE SET NULL;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS order_number TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS sub_status TEXT;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS first_response_due_at TIMESTAMPTZ;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS resolution_due_at TIMESTAMPTZ;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS sla_paused_at TIMESTAMPTZ;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS sla_breached_at TIMESTAMPTZ;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Widen constraints created by the legacy ticket migration without changing
-- existing values or column names.
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_status_check
  CHECK (status IN ('open','in_progress','pending','waiting','on_hold','resolved','solved','closed')) NOT VALID;
ALTER TABLE public.tickets DROP CONSTRAINT IF EXISTS tickets_priority_check;
ALTER TABLE public.tickets ADD CONSTRAINT tickets_priority_check
  CHECK (priority IN ('low','normal','medium','high','urgent')) NOT VALID;

DO $$
DECLARE ticket_row RECORD;
BEGIN
  FOR ticket_row IN SELECT id, client_id FROM public.tickets WHERE ticket_number IS NULL ORDER BY created_at LOOP
    UPDATE public.tickets
      SET ticket_number = public.next_ticket_number(ticket_row.client_id)
      WHERE id = ticket_row.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS tickets_client_number_unique ON public.tickets(client_id, ticket_number);

CREATE OR REPLACE FUNCTION public.assign_ticket_number()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.ticket_number IS NULL OR NEW.ticket_number = '' THEN
    NEW.ticket_number := public.next_ticket_number(NEW.client_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tickets_assign_number ON public.tickets;
CREATE TRIGGER tickets_assign_number BEFORE INSERT ON public.tickets
FOR EACH ROW EXECUTE FUNCTION public.assign_ticket_number();

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS messages_ticket_id_idx ON public.messages(ticket_id);

CREATE TABLE IF NOT EXISTS public.ticket_returns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES public.support_order_items(id) ON DELETE SET NULL,
  reason_code TEXT,
  reason_detail TEXT,
  requested_resolution TEXT,
  approved_resolution TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'requested',
  eligibility_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  scan_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_type TEXT NOT NULL DEFAULT 'system',
  event_type TEXT NOT NULL,
  from_value JSONB,
  to_value JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.csat_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL UNIQUE REFERENCES public.tickets(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  channel TEXT NOT NULL DEFAULT 'web',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_rate_limits (
  fingerprint TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 1,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_until TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS tickets_queue_idx ON public.tickets(client_id, status, priority, updated_at DESC);
CREATE INDEX IF NOT EXISTS tickets_contact_open_idx ON public.tickets(client_id, contact_id, type, status);
CREATE INDEX IF NOT EXISTS tickets_order_idx ON public.tickets(client_id, order_number);
CREATE INDEX IF NOT EXISTS ticket_events_timeline_idx ON public.ticket_events(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS ticket_notes_ticket_idx ON public.ticket_notes(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS ticket_attachments_ticket_idx ON public.ticket_attachments(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS support_products_search_idx ON public.support_products(client_id, lower(name));
CREATE INDEX IF NOT EXISTS support_orders_contact_idx ON public.support_orders(client_id, customer_email, customer_phone);

-- Correct the permissive legacy ticket policies. API handlers use the service role,
-- while direct browser reads are restricted to the signed-in tenant.
DROP POLICY IF EXISTS "Authenticated read tickets" ON public.tickets;
DROP POLICY IF EXISTS "clients_own_tickets" ON public.tickets;
DROP POLICY IF EXISTS "Tenant read tickets" ON public.tickets;
DROP POLICY IF EXISTS "Tenant access tickets" ON public.tickets;
CREATE POLICY "Tenant access tickets" ON public.tickets FOR ALL TO authenticated
  USING (client_id = auth.uid()) WITH CHECK (client_id = auth.uid());

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'bot_settings','support_products','support_orders','support_order_items',
    'ticket_counters','ticket_returns','ticket_attachments','ticket_events',
    'ticket_notes','csat_responses','ticket_rate_limits'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Tenant access bot settings" ON public.bot_settings;
CREATE POLICY "Tenant access bot settings" ON public.bot_settings FOR ALL TO authenticated
  USING (client_id = auth.uid()) WITH CHECK (client_id = auth.uid());
DROP POLICY IF EXISTS "Tenant access support products" ON public.support_products;
CREATE POLICY "Tenant access support products" ON public.support_products FOR ALL TO authenticated
  USING (client_id = auth.uid()) WITH CHECK (client_id = auth.uid());
DROP POLICY IF EXISTS "Tenant access support orders" ON public.support_orders;
CREATE POLICY "Tenant access support orders" ON public.support_orders FOR ALL TO authenticated
  USING (client_id = auth.uid()) WITH CHECK (client_id = auth.uid());
DROP POLICY IF EXISTS "Tenant access ticket events" ON public.ticket_events;
CREATE POLICY "Tenant access ticket events" ON public.ticket_events FOR SELECT TO authenticated
  USING (client_id = auth.uid());
DROP POLICY IF EXISTS "Tenant access ticket notes" ON public.ticket_notes;
CREATE POLICY "Tenant access ticket notes" ON public.ticket_notes FOR ALL TO authenticated
  USING (client_id = auth.uid()) WITH CHECK (client_id = auth.uid());
DROP POLICY IF EXISTS "Tenant access ticket attachments" ON public.ticket_attachments;
CREATE POLICY "Tenant access ticket attachments" ON public.ticket_attachments FOR ALL TO authenticated
  USING (client_id = auth.uid()) WITH CHECK (client_id = auth.uid());
DROP POLICY IF EXISTS "Tenant access csat responses" ON public.csat_responses;
CREATE POLICY "Tenant access csat responses" ON public.csat_responses FOR SELECT TO authenticated
  USING (client_id = auth.uid());

-- Child records inherit access through their ticket/order parent.
DROP POLICY IF EXISTS "Tenant access support order items" ON public.support_order_items;
CREATE POLICY "Tenant access support order items" ON public.support_order_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.support_orders o WHERE o.id = order_id AND o.client_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.support_orders o WHERE o.id = order_id AND o.client_id = auth.uid()));
DROP POLICY IF EXISTS "Tenant access ticket returns" ON public.ticket_returns;
CREATE POLICY "Tenant access ticket returns" ON public.ticket_returns FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.client_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.tickets t WHERE t.id = ticket_id AND t.client_id = auth.uid()));

-- Realtime powers live queues and ticket timelines.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tickets;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.ticket_events;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
