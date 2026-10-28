# Customer Data Retrieval & Lead Capture System Design

This document details the architecture, data schemas, ingestion pipelines, and CRM systems currently implemented in Vittain for capturing storefront customer data, storing it in PostgreSQL, and utilizing it as qualified leads for future marketing and sales campaigns.

---

## 1. System Architecture Overview

Vittain employs a **multi-channel customer data capture engine**. Customer information enters the platform through multiple touchpoints (web widget, WhatsApp, website analytics tracking, bulk CSV imports, and REST APIs), where it is normalized, deduplicated, and stored in a unified PostgreSQL CRM layer.

```mermaid
flowchart TD
    subgraph Capture Channels
        W[Storefront Chat Widget]
        T[Website Tracker script tracker.js]
        WA[WhatsApp Webhook / Incoming]
        CSV[CSV / Google Sheet Import]
        API[External REST API /contacts]
    end

    subgraph API & Processing Layer
        INIT["POST /api/chat/init<br/>(Visitor metadata handshake)"]
        CHAT["POST /api/chat<br/>(Auto-creates Web Visitor contact)"]
        EVT["POST /api/events<br/>(Cart, purchases, lead status)"]
        WAI["POST /api/whatsapp/incoming<br/>(Auto-extracts phone number)"]
        IMP["POST /api/contacts/import<br/>(CSV column mapper & dedupe)"]
    end

    subgraph Database Layer (Supabase PostgreSQL)
        C[("public.contacts<br/>Central CRM Lead Entity")]
        S[("public.sessions<br/>FK: contact_id")]
        M[("public.messages<br/>Chat History & Transcripts")]
        SEG[("public.segments<br/>Filter Rules & Audience")]
        AE[("public.analytics_events<br/>Behavioral Telemetry")]
    end

    subgraph Downstream Lead Utilization
        CRM["Contacts Manager (/contacts)"]
        PIPE["Kanban Sales Pipeline (/contacts/pipeline)"]
        SCORE["Lead Scoring Engine (/analytics/lead-scores)"]
        CAMP["Outbound Marketing (/campaigns/crm)"]
        HOOK["Webhooks (/webhooks) -> Zapier / CRM"]
    end

    W --> INIT & CHAT
    T --> EVT
    WA --> WAI
    CSV --> IMP
    API --> C

    INIT --> C
    CHAT --> C
    EVT --> C & AE
    WAI --> C
    IMP --> C

    C --> S
    S --> M
    C --> SEG

    C --> CRM
    C --> PIPE
    C --> SCORE
    SEG --> CAMP
    C --> HOOK
```

---

## 2. Core Data Models

The customer data is centralized around the `contacts` table and linked to conversation sessions.

### 2.1 The `contacts` Table Schema ([`supabase/034_contacts_segments.sql`](file:///Users/arsotoxic/Documents/final/rag-widget/supabase/034_contacts_segments.sql))

```sql
CREATE TABLE IF NOT EXISTS public.contacts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
    name                TEXT,
    email               TEXT,
    phone               TEXT,
    avatar_url          TEXT,
    source_channel      TEXT,               -- 'web' | 'whatsapp' | 'email' | 'sms' | 'instagram'
    source_bot_id       UUID REFERENCES public.bots(id) ON DELETE SET NULL,
    tags                TEXT[] DEFAULT '{}',
    custom_fields       JSONB DEFAULT '{}'::jsonb,
    
    -- Channel Marketing Opt-In Consents
    opt_in_web          BOOLEAN DEFAULT true,
    opt_in_whatsapp     BOOLEAN DEFAULT false,
    opt_in_email        BOOLEAN DEFAULT false,
    opt_in_sms          BOOLEAN DEFAULT false,
    
    -- Telemetry & Commercial Attributes
    conversation_count  INTEGER DEFAULT 0,
    lead_status         TEXT DEFAULT 'new', -- 'new' | 'engaged' | 'qualified' | 'won' | 'lost'
    last_cart_value     NUMERIC DEFAULT 0,
    cart_peak_value     NUMERIC DEFAULT 0,
    total_spend         NUMERIC DEFAULT 0,
    total_purchases     INTEGER DEFAULT 0,
    
    -- Timestamps
    first_seen_at       TIMESTAMPTZ DEFAULT now(),
    last_active_at      TIMESTAMPTZ DEFAULT now(),
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Fast Indexing for Lookups and Deduplication
CREATE INDEX idx_contacts_client_id ON public.contacts(client_id);
CREATE INDEX idx_contacts_email ON public.contacts(email);
CREATE INDEX idx_contacts_phone ON public.contacts(phone);
```

### 2.2 Relationship with Sessions & Messages

- **`sessions.contact_id`**: Foreign key linking conversational sessions to the contact record (`public.sessions ADD CONSTRAINT fk_contact FOREIGN KEY (contact_id) REFERENCES public.contacts(id)`).
- Every message in `messages` is attached to a `session_id`, meaning **all chat transcripts belong to the lead's historical record**.

---

## 3. How Customer Data Is Retrieved & Ingested

Vittain provides 5 distinct ingestion pathways:

### 3.1 Web Chat Widget Session Handshake (`POST /api/chat/init`)
When a widget initializes on a storefront (or receives user information via URL parameters or store session):
1. The widget calls `POST /api/chat/init` passing `{ botId, visitorName, visitorEmail, sessionId }`.
2. The server verifies the bot and inserts a record into `public.contacts`:
   ```typescript
   const { data: contact } = await supabase.from('contacts').insert({
     client_id: bot.client_id,
     name: visitorName ?? 'Website Visitor',
     email: visitorEmail ?? null,
     source_channel: 'web',
     source_bot_id: botId
   }).select('id').single();
   ```
3. Creates or updates the `sessions` row with `contact_id = contact.id`.

### 3.2 Autonomous Web Visitor Lead Creation (`POST /api/chat`)
If an anonymous shopper begins asking questions without filling a pre-chat form:
1. `src/app/api/chat/route.ts` evaluates whether `existingSession` has an assigned `contact_id`.
2. If new, it automatically registers a placeholder lead in `contacts`:
   ```typescript
   if (!existingSession && effectiveClientId) {
     const { data: newContact } = await supabase.from('contacts').insert({
       client_id: effectiveClientId,
       name: `Web Visitor (${sessionId.slice(0, 6)})`,
       source_channel: 'web'
     }).select('id').single();
     contactId = newContact?.id;
   }
   ```
3. Future updates (e.g. email provided during conversation or form submission) attach directly to this `contactId`.

### 3.3 Verified Phone Capture via WhatsApp (`POST /api/whatsapp/incoming`)
When a customer messages the merchant's WhatsApp Business Number:
1. Meta Webhook delivers the payload containing `from` (verified MSISDN phone number) and visitor profile name.
2. The endpoint checks for an existing contact:
   ```typescript
   let { data: contact } = await supabase
     .from('contacts')
     .select('*')
     .eq('phone', from)
     .eq('client_id', bot.client_id)
     .single();
   ```
3. If not found, it instantly creates a phone-verified contact with `source_channel: 'whatsapp'` and `opt_in_whatsapp: true`.

### 3.4 Telemetry & E-Commerce Event Ingestion (`public/tracker.js` & `POST /api/events`)
Storefront integration through `tracker.js` tracks high-intent commercial behavior:
- **Cart Abandonment / Cart Peak**: When a shopper updates their cart, `POST /api/events` records `last_cart_value` and updates `cart_peak_value`.
- **Purchase Conversion**: When a `purchase` event is emitted, `lead_status` is updated to `'won'`, `total_spend` is incremented, and `total_purchases` is tracked.
- **Rule Engine**: Trigger rules in `public/tracker.js` can pop coupons or initiate AI sales outreach when a customer's cart value exceeds thresholds.

### 3.5 Bulk Lead Import (`POST /api/contacts/import`)
For existing merchant customer lists:
- Accepts **CSV file uploads** or **published Google Sheets URLs**.
- Automatically scans and normalizes column headers (`name`, `email`, `phone`, `mobile`).
- Strips invalid characters from phone numbers and assigns tags (`['imported']`).
- Bulk inserts batches of leads directly into `public.contacts`.

---

## 4. How Captured Leads Are Utilized for Future Business

Capturing data is only half the system; Vittain includes four modules to convert these records into paying customers:

### 4.1 CRM Contacts Directory ([`/contacts`](file:///Users/arsotoxic/Documents/final/rag-widget/src/app/(dashboard)/contacts/page.tsx))
- Comprehensive dashboard view of all leads.
- Filtering by channel (`WhatsApp`, `Web`, `Email`, `SMS`), tags, and activity recency.
- One-click CSV export and manual lead creation.

### 4.2 Visual Kanban Sales Pipeline ([`/contacts/pipeline`](file:///Users/arsotoxic/Documents/final/rag-widget/src/app/(dashboard)/contacts/pipeline/page.tsx))
- Visual deal management through a drag-and-drop Kanban board:
  - **New Leads** $\rightarrow$ **Engaged** $\rightarrow$ **Qualified** $\rightarrow$ **Closed Won** $\rightarrow$ **Closed Lost**.
- Displays lead scores, deal values, and company associations.

### 4.3 Behavioral Lead Scoring Engine ([`/analytics/lead-scores`](file:///Users/arsotoxic/Documents/final/rag-widget/src/app/(dashboard)/analytics/lead-scores/page.tsx))
- Categorizes contacts into **Hot (80+)**, **Warm (50-79)**, and **Cold (<50)**.
- Aggregates behavioral factors:
  - `+30`: Cart value > $500
  - `+20`: Campaign link clicked
  - `+15`: Viewed $\ge 3$ products
  - `+10`: Responded to WhatsApp broadcast
  - `-5`: Inactive for > 7 days

### 4.4 Automated Retargeting Campaigns ([`/campaigns/crm`](file:///Users/arsotoxic/Documents/final/rag-widget/src/app/(dashboard)/campaigns/crm/page.tsx))
- **Segmentation Rules**: Target leads based on dynamic criteria (e.g. `opt_in_whatsapp = true` and `last_active_at > 7 days`).
- **Broadcast Triggers**: Dispatches WhatsApp template messages or emails to segmented leads for abandoned cart recovery, flash sales, or re-engagement.

### 4.5 External Webhook Sync ([`src/lib/webhooks.ts`](file:///Users/arsotoxic/Documents/final/rag-widget/src/lib/webhooks.ts))
- Dispatches event payloads to merchant endpoints or middleware (Zapier, Make, HubSpot, Salesforce) upon lead creation or message receipt.

---

## 5. Summary Matrix of Lead Data Points

| Field | Ingestion Source | Type | Lead Utilization |
| :--- | :--- | :--- | :--- |
| `name` | Widget init / WhatsApp name / CSV import | String | Personalized outreach & agent inbox |
| `email` | Widget pre-chat / CSV / User message | String | Email campaigns, newsletters, order receipts |
| `phone` | WhatsApp webhook / CSV import | String (E.164) | WhatsApp marketing broadcasts, SMS alerts |
| `source_channel`| System origin | Enum | Multi-channel attribution |
| `tags` | System rules / Agent manual / Import | Array | Segmentation and targeting |
| `lead_status` | Pipeline drag / Purchase event | Enum | Sales funnel stage tracking |
| `cart_peak_value`| `tracker.js` cart events | Numeric | High-value lead scoring & abandoned cart recovery |
| `total_spend` | Purchase events | Numeric | VIP loyalty segmentation |
| `custom_fields` | Dynamic attributes / Shopify sync | JSONB | Custom business logic (e.g. shoe size, vehicle model) |

---

## 6. Recommended Next-Level Improvements

While the database models and backend CRM are fully operational, the following front-facing enhancements will maximize lead capture rates:
1. **Interactive In-Widget Lead Form**: Introduce a pre-chat or in-chat email/phone prompt in `public/widget.js` when an anonymous visitor requests agent handoff or asks pricing questions.
2. **AI Entity Extraction**: Automatically detect email addresses and phone numbers written in conversational text (`messages.content`) and update the corresponding `contacts` row in real time.
3. **Contact Identity Stitching**: If a user previously recognized as `Web Visitor (a1b2c3)` enters their email or phone number, automatically merge their web browsing sessions into their permanent contact profile.
