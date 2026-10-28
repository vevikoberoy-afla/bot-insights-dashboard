# Dashboard — Master System Design

> **Scope**: This document maps every route, feature, interlink, data flow, and UI pattern in the `src/app/(dashboard)` folder. It is the single source of truth for how all dashboard modules connect to each other, to the database, and to external APIs.

---

## Table of Contents

1. [Shell & Layout](#1-shell--layout)
2. [Overview (Home)](#2-overview-home)
3. [Inbox](#3-inbox)
4. [Bots](#4-bots)
5. [Knowledge](#5-knowledge)
6. [Databases](#6-databases)
7. [Features (Booking / Commerce)](#7-features-booking--commerce)
8. [Contacts & CRM](#8-contacts--crm)
9. [Tickets](#9-tickets)
10. [Campaigns](#10-campaigns)
11. [Analytics](#11-analytics)
12. [Templates](#12-templates)
13. [Settings](#13-settings)
14. [Webhooks](#14-webhooks)
15. [API Keys](#15-api-keys)
16. [Notepad](#16-notepad)
17. [Interlink Map (Cross-Module Data Flows)](#17-interlink-map-cross-module-data-flows)
18. [Shared UI System](#18-shared-ui-system)
19. [Auth & Session Guard](#19-auth--session-guard)
20. [Performance & Caching Strategy](#20-performance--caching-strategy)

---

## 1. Shell & Layout

**File**: `src/app/(dashboard)/layout.tsx`

### What it does
- Acts as the **root authenticated wrapper** for every dashboard route.
- On mount: calls `supabase.auth.getSession()` — if no session, redirects to `/auth/login`.
- Fetches the `clients` row (RLS-scoped to the logged-in user) to populate `clientData`.
- If `clientData.context_id` is missing, calls `/api/client/context` to hydrate it and stores the result in local state.
- Shows `<DashboardShellSkeleton />` while loading, then renders the permanent shell.

### Shell Structure
```
┌──────────────────────────────────────┐
│ <Sidebar clientData />               │  ← left rail, persistent navigation
│ <TopBar clientData />                │  ← top header, breadcrumbs, user menu
│ <main> {children} </main>            │  ← routed page content
└──────────────────────────────────────┘
```

### Key interlinks
- `clientData` (including `context_id`) is passed down to `Sidebar` and `TopBar` so they can show the bot picker and workspace name.
- All child pages receive `clientData` implicitly through Supabase browser client (re-fetched per page as needed).
- The `context_id` is the public widget identifier — used by the Inbox page and bot pages to identify the workspace.

---

## 2. Overview (Home)

**Route**: `/overview`
**File**: `src/app/(dashboard)/overview/page.tsx`

### Purpose
The **command centre** — gives the operator a real-time health snapshot of the workspace.

### Data Fetched (parallel Promise.all)
| Source table | Data pulled | Used for |
|---|---|---|
| `clients` | `name` | Greeting header |
| `bots` | All bots with `status`, `message_count` | KPI cards, recent bots list |
| `campaigns` | All campaigns with `status`, `stats` | KPI cards, recent campaigns list |
| `tickets` | All tickets with `status` | KPI cards |
| `datasets` | All datasets with `status`, `chunk_count` | Recent knowledge bases list |

### KPI Cards
- **Active Bots** — count of bots where `status === 'active'`
- **Active Campaigns** — count where `status === 'running' || 'active'`
- **Tickets Raised** — total ticket count
- **Tickets Resolved** — count where `status === 'resolved' || 'closed'`

### UI Panels
- **Current Bots** — horizontal scroll cards → links to `/bots/[id]/settings`
- **Current Campaigns** — horizontal scroll cards → links to `/campaigns/[id]`
- **Knowledge Bases** — horizontal scroll cards → links to `/knowledge/[id]`
- **Messages By Channel** — `MessagesBarChart` (WhatsApp, SMS, Email, Web), time-range selector

### Interlinks to other modules
- `Add Bot` → `/bots/new`
- `Run Campaign` → `/campaigns/create`
- Bot cards → `/bots/[id]`
- Campaign cards → `/campaigns/[id]`
- Knowledge cards → `/knowledge/[id]`
- "View all" → `/bots/all`, `/campaigns/all`, `/knowledge/all`

---

## 3. Inbox

**Route**: `/inbox`
**File**: `src/app/(dashboard)/inbox/page.tsx` (858 lines)

### Purpose
The **real-time conversation hub** — shows every chat session across all channels, allows agents to read/reply/handoff/resolve.

### Conversation Tabs
| Tab ID | Label | Filter |
|---|---|---|
| `all` | All | No filter |
| `ai` | Bot Active | `status === 'ai'` |
| `waiting` | Waiting (Handoff) | `status === 'waiting'` |
| `human` | Human (Mine) | `status === 'human'` |
| `resolved` | Resolved | `status === 'resolved'` |

### Channel Support
- WhatsApp — green icon
- Web Widget — blue globe icon
- Email — red mail icon
- Telegram — sky send icon

### In-Memory Cache System (Performance)
Two in-memory Map caches backed by localStorage for page-refresh survival:
- `msgCache` (5-min TTL) — ChatMessage[] keyed by sessionId
- `convCache` (1-min TTL) — conversation[] keyed by clientId

On conversation click: immediately serves cached messages (zero latency), then silently refreshes from Supabase in background.

### Realtime Subscriptions
- `chatRoomChannel(sessionId)` — Supabase realtime channel per open session; appends new messages live.
- `storeInboxChannel(clientId)` — watches conversation list for new sessions, handoff changes, status updates.

### UI Layout
```
┌─────────────────┬───────────────────────────────┬──────────────┐
│  Conversation   │       Chat Thread              │   Context    │
│  List           │  (messages + flow cards)       │   Panel      │
│  [tab filters]  │  [reply box, send, attach]     │  (customer   │
│  [search]       │  [handoff / resolve buttons]   │   info, bot) │
└─────────────────┴───────────────────────────────┴──────────────┘
```

### DashboardFlowCard
- Imported from `@/components/chat/DashboardFlowCard`
- `isFlowCard(msg)` detects structured messages (product cards, booking cards, ticket cards, etc.)
- Renders the same interactive card the customer saw in the widget — not plain text.

### Agent Actions
- **Send reply** → `sendAgentReply(sessionId, message)` server action
- **Handoff / Resolve** → `handleSessionAction(sessionId, action)` server action
- **Session status badge** — colour-coded: purple=ai, amber=waiting, blue=human, green=resolved

### Interlinks
- Contacts: clicking customer name in context panel links to `/contacts/[id]`
- Tickets: ticket cards inside messages link to `/tickets/[id]`
- Bots: context panel shows which bot is assigned

---

## 4. Bots

**Route tree**:
```
/bots
  /all          → list of all bots
  /new          → create new bot wizard
  /[id]
    /analytics  → per-bot analytics
    /edit       → bot config editor
    /flow       → chatflow/trigger editor
  /emails       → email bot settings
  /triggers     → trigger rules editor
  /analytics    → aggregate bot analytics
```

### Bot Record Fields
- `name`, `purpose` (support/booking/commerce/sales)
- `status` (active/inactive), `message_count`, `session_count`
- `datasets[]`, `data_sources[]` — knowledge links
- `channels[]` — WhatsApp, web widget, email, Telegram
- `mailbox_id` — email bot assignment
- Feature toggles: booking, commerce, returns, lead capture, handoff
- Appearance: theme color, welcome message, avatar, bot name, tone
- `context_id` — the public widget CORS token

### Bot Editor Sub-Sections
| Section | What it configures |
|---|---|
| General | Name, purpose, language, tone, response length |
| Knowledge | Linked datasets, FAQ pairs, live databases |
| Channels | WhatsApp, widget embed, Telegram, email mailbox |
| Appearance | Color, avatar, welcome message, placeholder |
| Features | Enable/disable booking, commerce, returns, support, lead capture |
| Commerce | Linked catalogue products, checkout settings |
| Booking | Linked services, offers, labels |
| Flow/Triggers | Conditional message triggers, handoff rules |
| Advanced | Handoff text, session timeout, CSAT prompt |

### Interlinks
- Bot → Knowledge datasets (`/knowledge/[id]`)
- Bot → Databases live sources (`/databases/[id]`)
- Bot → Features (booking services, commerce catalogue)
- Bot analytics → `/analytics` (aggregated)
- Bot flow → triggers page (`/bots/triggers`)
- Bot email → email campaigns (`/campaigns/email`)

---

## 5. Knowledge

**Route tree**:
```
/knowledge
  /all          → dataset list
  /add          → create new dataset
  /[id]         → dataset detail (sources, chunks, QA pairs)
  /analytics    → knowledge gap analytics
```

### Dataset Lifecycle
```
Draft → Processing → Ready → (Error)
```

### Data Sources per Dataset
| Type | How added | Chunking |
|---|---|---|
| File upload (PDF, DOCX, TXT) | `/api/knowledge/upload` | Auto-chunked |
| Web crawl | `/api/crawl` | DOM-stripped, auto-chunked |
| Manual Q&A pair | `/api/manual-qa` | Single chunk, high priority |
| Plain text | In-editor | Manual chunking |

### Retrieval Strategy
1. **Manual QA** — exact/semantic match (highest priority, bypasses LLM)
2. **Hybrid search** — HNSW vector + full-text BM25 with RRF re-ranking
3. **Live data** — Google Sheets / REST / CSV / DB source lookup

### Interlinks
- Datasets linked to bots via `bot_datasets` join table
- Knowledge gaps from `/knowledge/analytics` feed back to the Analytics page
- Manual QA pairs are prioritized over RAG in the `/api/chat` pipeline

---

## 6. Databases

**Route tree**:
```
/databases
  /all          → list of live data sources
  /add          → connect new source
  /[id]         → source detail, field mapping, test queries
  /analytics    → data source usage stats
```

### Supported Source Types
| Type | Use case |
|---|---|
| Google Sheets | CRM data, orders, inventory, custom fields |
| Public CSV URL | Static product lists, schedules |
| REST GET/POST | Live API calls (orders, stock, shipping status) |
| PostgreSQL/MySQL | Direct database queries with field mapping |

### Field Mapping
Maps source columns to canonical fields: `order_id`, `customer_email`, `status`, `delivery_date`, `product_name`, `sku`, `quantity`, `price`, `total`

### Security
- SSRF protection: HTTPS only, no private IPs, bounded redirects, 30s timeout, max 500 rows per lookup

### Interlinks
- Connected to bots via `bot_data_sources` join
- Order tracking intent in `/api/chat` queries databases in priority order: internal commerce → sales/ERP → support orders → connected sheets/REST
- Live data lookup results sanitized before LLM summarization

---

## 7. Features (Booking / Commerce)

**Route tree**:
```
/features
  /[kind]           → booking | commerce | restaurant | offers
  /commerce
    /[kind]         → catalogue | orders | inventory | analytics
```

### Sub-Modules

#### Booking Services
- CRUD for services: name, duration, price, timezone, capacity, staff, locations, working hours, blackout dates, add-ons, questions, notice period, buffer time
- Linked to bots via `bot_booking_services`

#### Booking Offers
- Percentage or fixed discount, slot/day/location/quantity rules, claim limits
- Linked to bots via `bot_booking_offers`

#### All Bookings Dashboard
- Customer name, phone, service, branch, quantity, date/time, reference, channel, status
- Lifecycle actions: Confirm, Complete, Cancel, No-Show, Reschedule

#### Restaurant Mode
- Extends services with table inventory, seating groups, party size, branch selection
- Allocation check: smallest available table, no overlapping reservations
- Analytics: occupancy, fulfillment, no-show rate, revenue/seat, turnover

#### Commerce Catalogue
- Product CRUD: name, SKU, category, description, price, currency, stock, status, variants, images
- CSV/XLSX bulk import with column alias normalization
- Inventory: atomic 15-minute holds, release on expiry/cancel

#### Orders
- Order placement via RPC (validates stock, price, coupon, idempotency atomically)
- Order history, status transitions (pending → confirmed → fulfilled → cancelled)
- Abandoned-cart cron, waitlist management

### Booking State Machine
```
choose_service → branch → staff → quantity → date → slot → offer → add-ons → questions → name/phone/email → note → review → booking_confirmation
```

### Commerce State Machine
```
ask_product → choose → quantity/cart → offers/coupons → name/phone/address/pincode/email → review → order_confirmation
```

### Interlinks
- Bot editor → Feature toggles (which services/products a bot can access)
- Campaigns → can target contacts who have/haven't booked
- Contacts → `feature_bookings`, `commerce_orders` linked per contact
- Analytics → booking funnel, conversion, occupancy, revenue
- Tickets → return/refund flows create tickets linked to orders

---

## 8. Contacts & CRM

**Route tree**:
```
/contacts
  /page.tsx         → full contact list with search, filter, import
  /[id]             → Customer 360 profile
  /pipeline         → deal/lead pipeline view
  /segments         → segment builder and list
```

### Contact Record (Customer 360)
| Field group | Fields |
|---|---|
| Identity | name, email, phone, company, role |
| Linked records | orders, bookings, tickets, conversations |
| Events | timeline of all interactions |
| Notes | agent-added notes |
| Segments | membership list |
| Consent | opt-in/opt-out log per channel |
| Custom fields | workspace-defined key-value properties |

### Contact Capture Sources
- Chat widget (name/email/phone extracted via LLM)
- WhatsApp / Telegram message metadata
- CSV import (`/api/contacts/import`)
- Manual add in dashboard
- Ticket creation (contact auto-created or linked)

### Segments
- Manual segments (static list)
- Behavioral segments (auto): purchase count, booking history, message count, ticket status
- Used as campaign audience targets

### Interlinks
- Inbox → clicking customer → `/contacts/[id]`
- Campaigns → audience selection uses segment IDs
- Tickets → always linked to a contact
- Analytics → lead score, conversion funnel per segment

---

## 9. Tickets

**Route tree**:
```
/tickets
  /page.tsx         → redirect to /tickets/all
  /all              → queue view with filters
  /new              → create ticket manually
  /[id]             → ticket detail, messages, internal notes, actions
  /analytics        → ticket volume, SLA, resolution stats
```

### Ticket Fields
| Field | Values |
|---|---|
| Status | open, in_progress, resolved, closed, escalated |
| Priority | low, medium, high, urgent |
| Type | general, return, billing, technical, complaint |
| Assignment | agent (team member) |
| SLA due | calculated from creation + priority SLA config |

### Ticket Lifecycle
```
Open → In Progress → Resolved → Closed
           ↓
        Escalated
```

### Return/Refund Flow (linked)
```
order_reference → identity_verify → item_select → reason → resolution_choice → evidence_upload → review → confirm → ticket_card
```

### Interlinks
- Inbox → ticket cards in chat thread → `/tickets/[id]`
- Contacts → tickets tab in Customer 360
- Features/Orders → tickets created from commerce orders
- Analytics → SLA compliance, resolution time, type breakdown

---

## 10. Campaigns

**Route tree**:
```
/campaigns
  /all              → campaign list
  /create           → campaign builder
  /[id]             → campaign detail + stats
    /results        → delivery results per contact
  /analytics        → aggregate campaign analytics
  /crm              → CRM segment view for targeting
  /coupons          → coupon codes list
  /journeys         → journey/automation editor
  /settings         → campaign defaults
  /email            → email campaigns
  /sms              → SMS campaigns
  /whatsapp         → WhatsApp template campaigns
  /web              → web push campaigns
```

### Campaign Types
| Channel | Delivery | Template |
|---|---|---|
| WhatsApp | QStash → Meta Cloud API | Approved Meta template required |
| Email | QStash → SMTP/provider | HTML template |
| SMS | QStash → SMS provider | Plain text |
| Web Push | Browser push API | Custom |

### Campaign Builder Fields
- Name, channel, audience (segment or manual list)
- Message / template content with variable substitution (`{{name}}`, `{{order_id}}`)
- Schedule: immediate or scheduled datetime
- Stats: sent, delivered, opened, clicked, converted

### Interlinks
- Audience → Contacts segments (`/contacts/segments`)
- WhatsApp templates → Meta template management (`/bots/[id]/channels`)
- Coupons → embedded in campaign messages
- Analytics → open rate, CTR, conversion per campaign
- Journeys → multi-step drip sequences linked to triggers

---

## 11. Analytics

**Route tree**:
```
/analytics
  /page.tsx         → main analytics dashboard
  /behavior         → user behavior analytics (PostHog/Umami)
  /lead-scores      → lead scoring model analytics
```

### Analytics Modules
| Module | Metrics |
|---|---|
| Conversations | Total sessions, bot vs human, deflection rate |
| Campaigns | Sent, opened, clicked, converted (funnel) |
| Knowledge | Gap topics, unanswered queries, low-confidence hits |
| Tickets | Volume, SLA compliance, resolution time, priority breakdown |
| Booking | Funnel, occupancy, no-show, revenue, slot demand heatmap |
| Commerce | Orders, GMV, abandoned carts, conversion rate |
| Contacts | New contacts, sources, lead score distribution |
| Channels | Message volume by WhatsApp / Email / Web / Telegram |

### External Integrations
- **PostHog**: pageview/visitor tracking; API key + URL stored in `clients` table
- **Umami**: read-only agent analytics tools, session summaries

### Interlinks
- Knowledge gaps → `/knowledge/analytics` for remediation
- Campaign funnel → `/campaigns/[id]/results`
- Bot traffic → `/bots/[id]/analytics`
- Booking analytics → `/features/[kind]`

---

## 12. Templates

**Route**: `/templates`

### Template Types
| Type | Used by |
|---|---|
| WhatsApp HSM | Campaign WhatsApp sends, bot automated messages |
| Email HTML | Campaign email sends |
| Canned replies | Inbox agent quick-reply suggestions |
| Card templates | Product cards, booking cards, ticket cards |

### Interlinks
- Campaigns → template selection
- Inbox → canned replies (`/settings/canned`)
- WhatsApp bot → approved template list synced via `/api/meta/templates`

---

## 13. Settings

**Route tree**:
```
/settings
  /page.tsx         → PostHog integration + data retention
  /business-hours   → workspace open hours
  /hours            → alias for business-hours
  /canned           → canned reply management
  /coupons          → coupon code CRUD
  /integrations     → external service connections
  /subscriptions    → billing / plan management
  /team             → team member invite, roles, permissions
```

### Settings Page (root)
- **PostHog Integration**: URL, API key, project ID stored on `clients` table
- **Data Retention**: 3 / 30 / 90 days selector for session/widget history

### Key Sub-pages
| Sub-page | Purpose |
|---|---|
| Business Hours | Per-day open/close times → used by booking availability |
| Team | Invite agents; roles: admin, agent; appear in ticket assignment |
| Coupons | Code, discount type, value, max uses, expiry |
| Integrations | External service OAuth connections |
| Subscriptions | Billing, plan limits |

### Interlinks
- Team members → Inbox assignment, ticket assignment
- Business hours → Booking service availability checks
- Coupons → Campaigns (embed in messages), Commerce checkout
- PostHog → Analytics page behavior data source

---

## 14. Webhooks

**Route**: `/webhooks`

### Event Types
- `booking.created`, `booking.cancelled`, `booking.completed`
- `order.placed`, `order.status_changed`
- `ticket.created`, `ticket.resolved`
- `contact.created`, `contact.updated`
- `session.handoff_requested`

### Security
- HMAC-SHA256 signed payload headers
- SSRF protection: HTTPS only, no private IPs, max 3 retries with exponential backoff

### Interlinks
- Triggered by writes in `/api/features/*`, `/api/tickets/*`, `/api/inbox/*`
- Webhook delivery logs visible in admin panel

---

## 15. API Keys

**Route**: `/api-keys`

### Purpose
Generate and manage REST API keys for headless integrations, CRM connections, custom apps.

### Key Fields
- Name (label), value (shown once), created date, last used, status (active/revoked)

### Interlinks
- Used by external systems calling `/api/v1/chat`, `/api/contacts`, `/api/bots`, etc.
- Scoped to the workspace (client) via RLS

---

## 16. Notepad

**Route**: `/notepad`

### Purpose
Internal workspace scratchpad — agents and admins write notes, SOPs, handoff context for the team.

---

## 17. Interlink Map (Cross-Module Data Flows)

```
Overview
  ├──→ /bots/new
  ├──→ /campaigns/create
  ├──→ /bots/[id]
  ├──→ /campaigns/[id]
  └──→ /knowledge/[id]

Inbox
  ├──→ /contacts/[id]         (customer context panel)
  ├──→ /tickets/[id]          (ticket cards in thread)
  └──→ /bots/[id]             (which bot is assigned)

Bots
  ├──→ /knowledge/[id]        (linked datasets)
  ├──→ /databases/[id]        (live sources)
  ├──→ /features/[kind]       (booking services, commerce products)
  ├──→ /campaigns/[id]        (email bot connected mailbox)
  └──→ /bots/triggers         (flow/trigger rules)

Knowledge
  ├──→ /bots/[id]/edit        (dataset assignment)
  └──→ /analytics             (gap analytics)

Contacts
  ├──→ /tickets/[id]          (linked tickets)
  ├──→ /features              (linked orders, bookings)
  ├──→ /campaigns             (segment-based targeting)
  └──→ /inbox                 (session history)

Tickets
  ├──→ /contacts/[id]         (customer profile)
  ├──→ /features/orders       (linked order)
  └──→ /inbox                 (source chat session)

Campaigns
  ├──→ /contacts/segments     (audience)
  ├──→ /templates             (message templates)
  ├──→ /settings/coupons      (discount embedding)
  └──→ /analytics             (performance metrics)

Features
  ├──→ /contacts/[id]         (per-booking/order customer)
  ├──→ /tickets               (returns create tickets)
  ├──→ /campaigns             (abandoned cart, upsell jobs)
  └──→ /analytics             (funnel, occupancy, revenue)

Settings
  ├──→ /analytics             (PostHog data source)
  ├──→ /settings/team         (agent roster for inbox/tickets)
  ├──→ /settings/coupons      (used in campaigns + commerce)
  └──→ /settings/business-hours (booking availability)

Analytics
  ├──→ /knowledge/analytics   (knowledge gaps)
  ├──→ /campaigns/[id]/results (campaign drill-down)
  ├──→ /bots/[id]/analytics   (per-bot drill-down)
  └──→ /features/[kind]       (booking/commerce drill-down)
```

---

## 18. Shared UI System

### Component Library
| Component | Location | Used by |
|---|---|---|
| `Sidebar` | `@/components/layout/sidebar` | Layout |
| `TopBar` | `@/components/layout/topbar` | Layout |
| `KpiCard` | `@/components/shared/kpi-card` | Overview, Analytics |
| `PageHeader` | `@/components/shared/page-header` | All pages |
| `MessagesBarChart` | `@/components/charts/bar-chart` | Overview |
| `DashboardFlowCard` | `@/components/chat/DashboardFlowCard` | Inbox |
| `DashboardShellSkeleton` | `@/components/ui/dashboard-skeleton` | Layout loading |
| `DashboardContentSkeleton` | `@/components/ui/dashboard-skeleton` | Page loading |
| `Button`, `Input`, `Label`, `Select`, `Tabs`, `Switch` | `@/components/ui/*` | All pages |
| `Card`, `CardContent` | `@/components/ui/card` | Analytics, Settings |
| `toast` (Sonner) | `sonner` | All mutation feedback |

### Design Tokens (CSS vars)
| Token | Usage |
|---|---|
| `bg-surface` | Card/panel background |
| `bg-surface-muted` | Empty states, subtler backgrounds |
| `border-surface-border` | All card/panel borders |
| `text-ink` | Primary text |
| `text-ink-secondary` | Labels, metadata |
| `text-ink-muted` | Placeholder, empty state text |
| `bg-accent` | Primary action color |
| `bg-status-green/amber/blue` | Status badge backgrounds |

### Skeleton-First Loading Pattern
- Every data-fetching page renders a `*Skeleton` component first.
- Supabase queries run in `useEffect`, results update state and hide skeleton.
- Never shows empty/broken UI on first paint.

---

## 19. Auth & Session Guard

### Flow
```
Browser → layout.tsx → supabase.auth.getSession()
  ├── No session → redirect /auth/login
  └── Session exists → fetch clients row (RLS-scoped)
        ├── client found → render dashboard
        └── client not found → show error or redirect
```

### RLS Enforcement
- Every Supabase query in the dashboard is scoped to `session.user.id` via Row Level Security.
- Server-side API routes use `service_role` key only for background jobs (QStash, cron), never in browser-facing paths.

### API Route Auth
- `/api/*` routes validate `Authorization: Bearer <token>` or Supabase cookie session.
- Admin routes validate an additional admin-secret header or role claim.

---

## 20. Performance & Caching Strategy

### Browser-Level Cache (Inbox)
- `Map<sessionId, {data, ts}>` in memory — zero-latency message history on conversation switch.
- `localStorage` fallback — survives page refresh (5-min TTL for messages, 1-min for conversation list).
- Stale-while-revalidate: serve cache immediately, revalidate in background.

### Server-Level Cache
- Bot configuration cached in Redis for each `context_id` (low TTL, invalidated on bot edit).
- Knowledge chunk lookup results cached per query fingerprint.
- Live database source results cached for ~30 seconds.

### Realtime (Supabase Channels)
- Inbox subscribes to `chatRoomChannel(sessionId)` — pushes new messages live without polling.
- `storeInboxChannel(clientId)` — pushes new conversations and status changes to the conversation list.
- Channels are subscribed on mount and unsubscribed on unmount.

### Skeleton Screens
- All pages implement a loading skeleton (no spinners, no blank screens).
- Skeletons match the final layout to prevent layout shift.

### Lazy Data Loading
- Each page fetches its own data on mount (no global store).
- Parallel `Promise.all` is used wherever multiple independent queries are needed.

---

*Last updated: auto-generated from codebase inspection of `src/app/(dashboard)`*
