-- Migration 042: Store Integration & Realtime Configurable Upsell System

-- 1. Store Integrations table
CREATE TABLE IF NOT EXISTS public.store_integrations (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id         UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    platform          TEXT NOT NULL DEFAULT 'custom_snippet', -- 'shopify' | 'woocommerce' | 'custom_snippet'
    connection_type   TEXT NOT NULL DEFAULT 'js_snippet',     -- 'native_webhook' | 'js_snippet'
    shop_domain       TEXT,                                   -- e.g. 'mystore.myshopify.com'
    access_token      TEXT,                                   -- encrypted token
    webhook_secret    TEXT,                                   -- HMAC secret for signature verification
    status            TEXT DEFAULT 'active',                  -- 'active' | 'disconnected' | 'error'
    settings          JSONB DEFAULT '{}'::jsonb,
    connected_at      TIMESTAMPTZ DEFAULT now(),
    last_event_at     TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_store_integrations_shop ON public.store_integrations(shop_domain) WHERE shop_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_store_integrations_client ON public.store_integrations(client_id);

-- 2. Extend trigger_rules with popup controls, timing, tone, and strict channels
ALTER TABLE public.trigger_rules
  ADD COLUMN IF NOT EXISTS delay_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tone TEXT DEFAULT 'casual',
  ADD COLUMN IF NOT EXISTS channels TEXT[] DEFAULT ARRAY['web_chat'],
  ADD COLUMN IF NOT EXISTS popup_style TEXT DEFAULT 'callout',
  ADD COLUMN IF NOT EXISTS auto_dismiss_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cta_text TEXT,
  ADD COLUMN IF NOT EXISTS cta_url TEXT;

-- 3. Extend messages table with message_type and metadata if not present
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'chat',
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_trigger_rules_client_status ON public.trigger_rules(client_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_session_type ON public.messages(session_id, message_type);
