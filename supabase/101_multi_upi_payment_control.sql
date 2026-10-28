-- Multi-account UPI, private QR assets, and founder payment governance.
-- Apply after 100_commerce_order_lifecycle.sql. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.commerce_upi_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label text NOT NULL CHECK(char_length(label) BETWEEN 2 AND 80),
  vpa_ciphertext text NOT NULL,
  vpa_masked text NOT NULL,
  payee_name text NOT NULL CHECK(char_length(payee_name) BETWEEN 2 AND 100),
  qr_storage_path text,
  priority integer NOT NULL DEFAULT 100 CHECK(priority BETWEEN 0 AND 10000),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id,label)
);
CREATE INDEX IF NOT EXISTS commerce_upi_accounts_active_idx
  ON public.commerce_upi_accounts(client_id,is_active,priority,id);

ALTER TABLE public.commerce_payment_transactions
  ADD COLUMN IF NOT EXISTS upi_account_id uuid REFERENCES public.commerce_upi_accounts(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.platform_payment_policy (
  id boolean PRIMARY KEY DEFAULT true CHECK(id),
  cash_on_delivery_allowed boolean NOT NULL DEFAULT true,
  direct_upi_allowed boolean NOT NULL DEFAULT true,
  gateway_allowed boolean NOT NULL DEFAULT false,
  qr_upload_allowed boolean NOT NULL DEFAULT true,
  max_upi_accounts integer NOT NULL DEFAULT 5 CHECK(max_upi_accounts BETWEEN 0 AND 50),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_payment_policy(id) VALUES(true) ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.workspace_payment_policy (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  cash_on_delivery_allowed boolean,
  direct_upi_allowed boolean,
  gateway_allowed boolean,
  qr_upload_allowed boolean,
  max_upi_accounts integer CHECK(max_upi_accounts IS NULL OR max_upi_accounts BETWEEN 0 AND 50),
  reason text NOT NULL CHECK(char_length(reason) BETWEEN 10 AND 2000),
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.commerce_upi_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_payment_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_payment_policy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_account_member_read ON public.commerce_upi_accounts;
CREATE POLICY payment_account_member_read ON public.commerce_upi_accounts FOR SELECT TO authenticated
  USING(public.saas_member_access(client_id,'orders',false));
-- No authenticated write policies: mutations pass through the server APIs.
-- Remove table privileges as defense in depth: even encrypted destinations and
-- internal transaction metadata are exposed only through field-limited APIs.
REVOKE ALL ON TABLE public.commerce_payment_settings,public.commerce_payment_transactions,
 public.commerce_payment_events,public.commerce_upi_accounts,public.platform_payment_policy,
 public.workspace_payment_policy FROM anon,authenticated;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('payment-assets','payment-assets',false,2097152,ARRAY['image/png','image/jpeg','image/webp'])
ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=2097152,allowed_mime_types=EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.effective_payment_policy(p_client uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT jsonb_build_object(
    'cash_on_delivery_allowed',coalesce(w.cash_on_delivery_allowed,g.cash_on_delivery_allowed),
    'direct_upi_allowed',coalesce(w.direct_upi_allowed,g.direct_upi_allowed),
    'gateway_allowed',coalesce(w.gateway_allowed,g.gateway_allowed),
    'qr_upload_allowed',coalesce(w.qr_upload_allowed,g.qr_upload_allowed),
    'max_upi_accounts',coalesce(w.max_upi_accounts,g.max_upi_accounts)
  )
  FROM platform_payment_policy g LEFT JOIN workspace_payment_policy w ON w.client_id=p_client
  WHERE g.id=true
$$;
REVOKE ALL ON FUNCTION public.effective_payment_policy(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.effective_payment_policy(uuid) TO authenticated,service_role;

-- Founder changes are append-audited in the existing SaaS audit ledger by API.
NOTIFY pgrst, 'reload schema';
