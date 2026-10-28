-- Migration: Add botspec.md tables to Vittain Supabase
-- Run this in Supabase SQL Editor

-- contact_events: stores every tracking event from the tracker snippet
CREATE TABLE IF NOT EXISTS contact_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  contact_id UUID,
  event_type VARCHAR(100) NOT NULL,  -- cart_updated, product_viewed, purchase, page_url, checkout_started, exit_intent, etc.
  event_data JSONB DEFAULT '{}',     -- { value: 2000, items: 3, coupon: 'FLAT500', product_id: 'P123' }
  session_id VARCHAR(255),
  page_url TEXT,
  channel VARCHAR(50) DEFAULT 'web',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contact_events_client_id ON contact_events(client_id);
CREATE INDEX IF NOT EXISTS idx_contact_events_contact_id ON contact_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_events_type ON contact_events(event_type);

-- trigger_rules: stores all proactive trigger rules configured in the bot builder
CREATE TABLE IF NOT EXISTS trigger_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',  -- active, paused
  conditions JSONB DEFAULT '[]',  -- [{event: 'cart_updated', operator: '>=', value: 1500}]
  actions JSONB DEFAULT '[]',     -- [{type: 'send_message', channel: 'web', message: '...'}]
  frequency_per_session INTEGER DEFAULT 1,
  frequency_per_day INTEGER DEFAULT 3,
  min_gap_minutes INTEGER DEFAULT 5,
  fire_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trigger_rules_client_id ON trigger_rules(client_id);
CREATE INDEX IF NOT EXISTS idx_trigger_rules_bot_id ON trigger_rules(bot_id);

-- contact_id_map: keeps Vittain contact IDs synced with Tiledesk + Dittofeed IDs
CREATE TABLE IF NOT EXISTS contact_id_map (
  vittain_contact_id UUID PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
  tiledesk_lead_id VARCHAR(255),
  dittofeed_user_id VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID REFERENCES bots(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  conversations_total INTEGER DEFAULT 0,
  conversations_resolved INTEGER DEFAULT 0,
  conversations_handoff INTEGER DEFAULT 0,
  contacts_data_collected INTEGER DEFAULT 0,
  mcp_actions_fired INTEGER DEFAULT 0,
  mcp_actions_success INTEGER DEFAULT 0,
  triggers_fired INTEGER DEFAULT 0,
  coupons_sent INTEGER DEFAULT 0,
  coupons_converted INTEGER DEFAULT 0,
  top_questions JSONB DEFAULT '[]',
  unanswered_questions JSONB DEFAULT '[]',
  UNIQUE(bot_id, date)
);

-- Add missing columns to contacts table if not present
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS cart_peak_value DECIMAL(10,2) DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_cart_value DECIMAL(10,2) DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_trigger_fired VARCHAR(255);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS coupon_sent VARCHAR(100);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS total_purchases INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS total_spend DECIMAL(10,2) DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tiledesk_lead_id VARCHAR(255);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS dittofeed_user_id VARCHAR(255);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS telegram_id VARCHAR(100);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS custom_properties JSONB DEFAULT '{}';

-- Add bot_flow and bot_triggers columns to bots table
ALTER TABLE bots ADD COLUMN IF NOT EXISTS opening_message TEXT;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS callout_timer INTEGER DEFAULT 5;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS callout_title TEXT;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS show_callout_only BOOLEAN DEFAULT false;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS auto_open_after INTEGER DEFAULT 0;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS show_once_per_session BOOLEAN DEFAULT true;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS bot_flow JSONB DEFAULT '{"sections": [], "dataCollection": [], "topicRules": []}';
ALTER TABLE bots ADD COLUMN IF NOT EXISTS system_prompt TEXT;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS bot_tone VARCHAR(50) DEFAULT 'friendly';
ALTER TABLE bots ADD COLUMN IF NOT EXISTS response_length VARCHAR(50) DEFAULT 'medium';
ALTER TABLE bots ADD COLUMN IF NOT EXISTS use_emojis BOOLEAN DEFAULT true;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS handoff_message TEXT;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS confidence_threshold INTEGER DEFAULT 50;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS max_turns INTEGER DEFAULT 10;

-- channel_integrations: stores all channel integration credentials per client
CREATE TABLE IF NOT EXISTS channel_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  channel VARCHAR(50) NOT NULL,  -- whatsapp, telegram, slack, sms, email, tiledesk, etc.
  instance_name VARCHAR(255) NOT NULL,
  config JSONB DEFAULT '{}',     -- encrypted config: api_key, token, phone_number_id etc.
  status VARCHAR(50) DEFAULT 'active',  -- active, paused, error
  last_tested_at TIMESTAMPTZ,
  test_result JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_channel_integrations_client ON channel_integrations(client_id);
CREATE INDEX IF NOT EXISTS idx_channel_integrations_channel ON channel_integrations(client_id, channel);
