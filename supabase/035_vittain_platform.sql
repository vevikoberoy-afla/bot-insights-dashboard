-- Vittain Platform Migration (Phase 1-2)

-- 1. Add connection configs to clients table
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tiledesk_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tiledesk_api_key TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS tiledesk_project_id TEXT;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS dittofeed_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS dittofeed_api_key TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS dittofeed_workspace_id TEXT;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS posthog_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS posthog_api_key TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS posthog_project_id TEXT;

-- 2. Channel Configurations
CREATE TABLE IF NOT EXISTS public.channel_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, -- 'whatsapp' | 'email' | 'sms' | 'web'
  config JSONB DEFAULT '{}'::jsonb,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for channel_configs
ALTER TABLE public.channel_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own channel configs"
  ON public.channel_configs
  FOR ALL
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());

-- 3. Extend Bots Table
ALTER TABLE bots ADD COLUMN IF NOT EXISTS confidence_threshold FLOAT DEFAULT 0.7;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS max_turns INTEGER DEFAULT 10;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS handoff_message TEXT;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS handoff_target TEXT DEFAULT 'any';
ALTER TABLE bots ADD COLUMN IF NOT EXISTS active_channels TEXT[] DEFAULT '{web}';
ALTER TABLE bots ADD COLUMN IF NOT EXISTS mcp_actions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS tiledesk_bot_id TEXT;

-- 4. Proactive Trigger Rules
CREATE TABLE IF NOT EXISTS public.proactive_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  bot_id UUID REFERENCES public.bots(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  delay_seconds INTEGER DEFAULT 0,
  message_template TEXT,
  channel TEXT DEFAULT 'web',
  fire_once BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for proactive_rules
ALTER TABLE public.proactive_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own proactive rules"
  ON public.proactive_rules
  FOR ALL
  USING (client_id = auth.uid())
  WITH CHECK (client_id = auth.uid());
