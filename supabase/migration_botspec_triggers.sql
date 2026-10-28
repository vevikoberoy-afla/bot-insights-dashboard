CREATE TABLE contact_events (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL, 
  contact_id UUID NOT NULL, 
  event_type VARCHAR(100), 
  event_data JSONB, 
  session_id VARCHAR(255),
  page_url TEXT, 
  channel VARCHAR(50), 
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE contacts (
  id UUID PRIMARY KEY,
  client_id UUID NOT NULL,
  tiledesk_lead_id VARCHAR(255), 
  dittofeed_user_id VARCHAR(255), 
  name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  telegram_id VARCHAR(100),
  lead_status VARCHAR(50), 
  lead_score INTEGER DEFAULT 0,
  cart_peak_value DECIMAL(10,2), 
  last_cart_value DECIMAL(10,2), 
  last_trigger_fired VARCHAR(255), 
  coupon_sent VARCHAR(100), 
  total_purchases INTEGER DEFAULT 0,
  total_spend DECIMAL(10,2) DEFAULT 0,
  custom_properties JSONB, 
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE contact_id_map (
  vittain_contact_id UUID PRIMARY KEY,
  tiledesk_lead_id VARCHAR(255),
  dittofeed_user_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
