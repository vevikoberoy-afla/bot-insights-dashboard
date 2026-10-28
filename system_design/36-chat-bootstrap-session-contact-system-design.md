# Chat Bootstrap, Session, and Contact Processing System Design

## Purpose and scope

This document describes the currently implemented web-chat bootstrap layer. This layer connects an anonymous browser visitor to the correct workspace and bot, maintains a stable conversation session, creates or links a CRM contact, restores bot and lead-capture state, and decides whether the message should remain with AI or be delivered to a human.

It covers two related paths:

1. Widget initialization through `POST /api/chat/init`.
2. Request-time bootstrap inside `POST /api/chat` before flow routing and RAG.

The bootstrap timing reported by `/api/chat` begins after tenant identity resolution and ends immediately before deterministic support/booking/commerce routing. Widget initialization is measured separately.

## System context

```text
Client website
  └─ embedded ChatWidget
       ├─ local/session storage: session ID + three-day browser history
       ├─ GET /api/widget/config
       ├─ POST /api/chat/init
       │    ├─ bots + clients
       │    ├─ contacts
       │    ├─ sessions
       │    ├─ optional Chatwoot
       │    └─ signed widget capability
       ├─ GET /api/chat/sync
       └─ POST /api/chat?stream=true
            ├─ verify capability and entitlements
            ├─ bootstrap session/contact/bot/lead state
            ├─ human-handoff check
            ├─ deterministic flow router
            └─ RAG or transactional response
```

## Core identifiers

| Identifier | Owner | Purpose |
| --- | --- | --- |
| `workspaceId` / `client_id` | Server and database | Tenant boundary for every bot, contact, session, and message |
| `contextId` | Workspace | Public knowledge/widget context identifier |
| `botId` | Bot | Selects bot behavior, prompt, integrations, features, and datasets |
| `sessionId` | Browser/widget | Stable conversation identifier used across reconnects |
| `contactId` | CRM | Canonical customer identity linked to orders, bookings, tickets, and sessions |
| widget capability | Server-signed token | Binds workspace, context, bot, session, purpose, issue time, and expiry |
| client message ID | Browser | Reconciles optimistic messages with server-persisted messages |

## Phase A: browser session bootstrap

### A1. Resolve the browser session ID

The widget derives storage keys from the bot/context identity. It checks an explicit session prop, an allowed URL session value, and then browser storage. A stored session is reused only while its recorded start time is within `WIDGET_HISTORY_RETENTION_MS`, currently three days. Otherwise the widget removes the expired session/history and creates a cryptographically generated session ID.

The ID is stored in both `localStorage` and `sessionStorage`. This provides continuity after a refresh while retaining a tab-scoped fallback. Reset Chat creates a new ID, clears local history, and initializes a new server session.

### A2. Load widget configuration

The widget calls `/api/widget/config` using the context and/or bot query parameters. Configuration determines the active bot, visual settings, greeting, feature configuration, and other public widget behavior. The widget retries once after 500 ms if configuration or initialization fails.

### A3. Initialize the server session

The widget calls:

```http
POST /api/chat/init
Content-Type: application/json

{
  "botId": "...",
  "sessionId": "...",
  "visitorName": "optional",
  "visitorEmail": "optional"
}
```

The endpoint performs these operations serially unless otherwise stated:

1. Query `bots` and its linked client context.
2. Fire-and-forget a one-hour `client_ctx` Redis cache write.
3. Normalize the visitor email.
4. Resolve or create the canonical contact through `upsertCustomerContact`.
5. Fire-and-forget a one-hour `sess_contact` Redis cache write.
6. Find a `sessions` row scoped to client and bot.
7. Insert a missing session or update the existing session/contact link.
8. If the bot has a Chatwoot inbox, create/find the Chatwoot contact and create a conversation, then persist external IDs to the session.
9. Issue an HMAC-SHA256 widget capability valid for at most three days.
10. Return session ID, token, expiry, and `ready` status.

### A4. Synchronize prior history

Once a capability is available, `/api/chat/sync` retrieves server messages. The widget merges them with optimistic local messages using IDs and role/content keys to avoid duplicates. Interactive-card metadata restores flow identity, lock state, selected values, and payloads.

## Contact identity resolution

`upsertCustomerContact` is the shared tenant-safe identity writer used by widget, booking, commerce, support, WhatsApp, Telegram, manual, and import flows.

### Matching priority

```text
session-linked contact
  → explicit contact ID
  → normalized email within workspace
  → normalized E.164 phone within workspace
  → compatible last-ten-digits phone fallback
  → create a new contact
```

All matches are scoped by `client_id`. The lookup never intentionally joins a customer across tenants.

### Duplicate merging

If the active session contact and an email/phone match point to different contacts, the oldest contact becomes canonical. The `stitch_contacts_atomic` RPC attempts an atomic merge. On older installations without the RPC, the identity-matched contact is preferred and the session is relinked without deleting either record.

### Contact enrichment

An existing contact receives:

- `last_active_at` and `updated_at`;
- capture method and source channel/bot;
- merged tags and custom fields;
- a real name only when the stored name is still a placeholder;
- previously missing email, phone, or normalized phone.

An anonymous web contact is created as `Website Visitor`, tagged as a customer, and opted into web conversation processing. Transactional contact collection does not automatically grant email, SMS, or WhatsApp marketing consent.

## Session persistence

The `sessions` table is the canonical conversation registry. Important fields include:

| Field | Purpose |
| --- | --- |
| `id` | Internal UUID primary key |
| `session_id` | Widget/channel conversation identifier |
| `client_id` | Tenant boundary |
| `bot_id` | Owning bot |
| `contact_id` | Canonical CRM contact |
| `channel` | Widget, website, email, WhatsApp, and other channel source |
| `mode` | `ai`, `waiting`, or `human` |
| `assigned_agent_id` | Human owner when assigned |
| `last_message_at` | Conversation ordering and inbox freshness |
| Chatwoot fields | Optional external conversation/contact linkage |

`session_id` is unique in the original schema. Lookups additionally scope client and bot where the call site supports it. Messages use the resolved external `session_id` so widget synchronization and realtime rooms refer to the same identifier.

## Phase B: per-message bootstrap

After CORS, rate limits, token verification, tenant resolution, and entitlement checks, `/api/chat` begins request bootstrap.

### B1. Start knowledge reads speculatively

For a message that is unlikely to be a deterministic workflow, bot dataset resolution and lexical retrieval start early. These promises overlap with session/contact processing and are consumed later only if the request reaches RAG.

### B2. Load three state groups in parallel

The following are started together:

1. A Redis `MGET` for contact and lead-pacing state.
2. A bounded bot-context Redis read with a 300 ms wait budget.
3. A Supabase session lookup by session ID and tenant.

The Redis batch contains:

| Key | Value | Lifetime/behavior |
| --- | --- | --- |
| `sess_contact:{sessionId}` | Name, email, phone | Written for one hour |
| `lead_declined:{sessionId}` | Customer declined lead capture | Written for 24 hours |
| `lead_ask_count:{sessionId}` | Number of lead prompts shown | Incremented after prompts |
| `lead_last_ask_turn:{sessionId}` | Last conversation turn prompted | Written for 24 hours |
| `lead_asked_fields:{sessionId}` | Already requested fields | Session lead-state helper |

The bot-context key is `bot_ctx:{botId}` and holds prompt, tone, response length, emoji preference, data-collection configuration, and vision setting for one hour.

### B3. Parse customer information from the message

Regex extraction examines ordinary customer text for name, email, and phone. Interactive card labels are excluded because values such as `Confirm`, `Damaged`, and `Refund` must never become customer names or profile fields.

Newly extracted values enrich the request-local contact and update `sess_contact` asynchronously. A lead-capture decline sets the decline key asynchronously.

### B4. Hydrate missing contact fields

The session row supplies `contact_id`, `client_id`, and current `mode`. If any of name, email, or phone are missing from the cached contact, the route queries the linked `contacts` row and fills only missing request-local fields. It then refreshes the contact cache asynchronously.

### B5. Resolve bot behavior

If `bot_ctx` is present, bot prompt and lead settings are read from cache. On a miss, the route reads `bots` and derives:

- system prompt;
- tone;
- requested response length;
- emoji preference;
- vision enablement;
- name, WhatsApp, email, and custom data-collection prompts.

The result is written asynchronously to Redis for one hour. An explicit widget bot wins. A legacy fallback can select the newest workspace bot when no bot is provided.

### B6. Determine lead-capture pacing

Lead capture applies these rules:

- maximum two asks per session;
- at least two conversation turns between asks;
- declined sessions stop being prompted;
- missing configured fields are selected in configured priority;
- discount intent can prioritize the configured WhatsApp/coupon prompt;
- already collected fields are not requested again.

The active prompt is passed into answer generation. After a prompt fires, count and last-turn values update asynchronously.

### B7. Enforce human handoff mode

If `sessions.mode` is `human` or `waiting`, bootstrap does not continue into bot flows or RAG. The user message is persisted for the live inbox, `last_message_at` is updated, and the endpoint returns `answer: null` with the current mode. This preserves human ownership of the conversation.

### B8. Finish the bootstrap timing boundary

`markStage('bootstrap')` is recorded after session/contact/bot/lead processing and the human-handoff check. Deterministic flow routing starts next.

## Phase C: post-response contact and session work

The streaming response can contain a hidden structured extraction section. After the visible response finishes, the application validates extracted fields against the customer message and calls the contact stitching pipeline. Valid identity data can update the canonical contact and resolve pending prompts.

Message persistence then:

1. Resolves the canonical session.
2. Creates a passive contact/session if an older caller skipped initialization.
3. Updates session mode and `last_message_at`.
4. Locks the prior interactive card when relevant.
5. Inserts user and assistant messages.
6. Broadcasts inbox and chat-room updates.
7. Refreshes inbox/message Redis caches asynchronously.

For streaming RAG, most of this work is scheduled after the customer receives the final token. Deterministic card flows use their dedicated durable persistence path.

## Security boundaries

### Signed widget capability

The token payload contains version, workspace, context, bot, session, purpose, issue time, and expiry. It is signed with HMAC-SHA256. Verification uses timing-safe signature comparison and rejects malformed, expired, future-issued, or wrong-purpose tokens. Production requires a configured signing secret of at least 32 bytes.

### Tenant isolation

- Bot lookup establishes the owning `client_id`.
- Contact matching always includes `client_id`.
- Session initialization includes both client and bot scope.
- Message requests reject a capability whose workspace, bot, session, or context does not match the request.
- Server database access uses the service role, so application-level scoping is mandatory on every query.

### Human handoff safety

Request bootstrap reads session mode before invoking AI. The structured-card persistence path also avoids resetting a concurrently changed session to AI mode.

### Consent separation

Customer details needed for an order, booking, ticket, or support conversation create/enrich the contact profile. They do not constitute marketing consent. Marketing opt-in flags remain false until an explicit consent workflow updates them.

## Data ownership and source of truth

| Data | Source of truth | Cache/use |
| --- | --- | --- |
| Workspace and bot ownership | Supabase `clients`, `bots` | `client_ctx`, one hour |
| Conversation state and handoff mode | Supabase `sessions` | Request-local session row |
| Customer identity | Supabase `contacts` | `sess_contact`, one hour |
| Messages and card metadata | Supabase `messages` | Inbox/message Redis buffers and realtime |
| Bot runtime behavior | Supabase `bots` and bot configuration | `bot_ctx`, one hour |
| Lead prompt pacing | Redis | Per-session keys, mainly 24 hours |
| Browser session/history | Browser storage | Three-day widget retention |
| Widget authority | Signed capability | Maximum three-day expiry |

Redis accelerates request state but does not replace the session/contact database records. Lead pacing is an exception: its immediate operational state primarily resides in Redis.

## Current concurrency model

```text
Per-message request
  ├─ early dataset IDs → early lexical search
  └─ Promise.all
       ├─ Redis lead/contact MGET
       ├─ bounded Redis bot-context GET
       └─ Supabase session SELECT

After those finish
  ├─ optional contacts SELECT when cached profile is incomplete
  ├─ optional bots SELECT on bot-context cache miss
  ├─ lead-prompt calculation
  └─ handoff decision
```

The optional contact and bot database reads occur after the initial parallel group, so a cold request may still accumulate sequential database latency.

## Measured latency

From the real local end-to-end benchmark:

| Scenario | Bootstrap phase | Widget initialization |
| --- | ---: | ---: |
| First grounded RAG request | **5,180 ms** | **4,267 ms** |
| Repeated grounded request | 1,109 ms | Already initialized |
| Cold general RAG request | **3,793 ms** | **2,860 ms** |
| Warm repeated general request | 426 ms | Already initialized |

Bootstrap was the largest phase in the 10.04-second grounded request. The 5.18-second phase represented about 51.6% of total reply completion time.

Independent network measurements showed substantial variance:

| Dependency check | Observed time |
| --- | ---: |
| Warm Redis SDK ping | 84–348 ms |
| Cold raw Redis request | 943 ms |
| Warm minimal Supabase read | 253 ms |
| Cold minimal Supabase read | 1,537 ms |
| Earlier degraded Redis samples | 2,992–6,448 ms |

These are end-to-end network measurements from the development machine. They do not isolate provider-side execution or establish a region mismatch by themselves.

## Current bottlenecks and failure characteristics

### Unbounded lead-state batch

The five-key lead/contact `MGET` is awaited without the 300 ms budget used by bot context. During a degraded Redis interval, this single operation can dominate bootstrap.

### Cold contact hydration

If any cached contact field is missing, the request performs another Supabase read after the session/Redis parallel group. Anonymous contacts naturally have missing email and phone, so they can repeatedly qualify for hydration unless the cached object is treated as complete for anonymous state.

### Cold bot context

A bot-context miss adds a Supabase bot query after the first parallel group. Cache invalidation is performed when bot or bot-database configuration changes.

### Initialization contact path

`upsertCustomerContact` may perform session lookup, preferred-contact lookup, email lookup, phone lookup, merge RPC, contact write, and session relink. Most are currently dependent and therefore serial. This ensures correctness, but makes first initialization sensitive to database round-trip latency.

### Chatwoot in the initialization critical path

When configured, external Chatwoot contact and conversation creation occur before the widget receives its capability. A slow external provider can delay first readiness even though failure is treated as non-fatal.

### Broad timing bucket

The current `bootstrap` timing combines Redis, session SQL, optional contact SQL, optional bot SQL, lead calculation, and handoff handling. It proves the area is slow but does not identify the exact sub-operation for an individual request.

### Graceful failures

- Missing bot returns 404 during initialization.
- Session insertion errors are logged; token issuance may still proceed with the requested session ID.
- Chatwoot failures are logged and do not disable AI chat.
- Redis cache writes are best effort.
- Session/contact lookup failures during message bootstrap are logged where allowed, while capability and tenant failures reject the request.
- Missing or expired widget capability returns 401 and requires widget reinitialization.

## Recommended target architecture

The current source-of-truth and security boundaries should remain. Performance work should reorganize the critical path:

```text
Initialization critical path
  bot ownership → session/contact identity → session row → signed capability

Deferred initialization work
  Chatwoot provisioning → analytics → nonessential cache warming

Per-message critical path
  local token verification
    + parallel entitlement/session/bot/lead reads with explicit budgets
    + only the contact fields needed for the current operation
  → handoff decision
  → flow/RAG
```

The next instrumentation step should divide `bootstrap` into `session_lookup`, `lead_state`, `contact_hydration`, `bot_context`, `lead_policy`, and `handoff_check`. This allows production traces to show the exact dependency responsible for a slow request without weakening authentication or tenant isolation.

## Primary implementation files

| Concern | File |
| --- | --- |
| Widget lifecycle, browser session, sync | `src/components/chat/ChatWidget.tsx` |
| Server session initialization | `src/app/api/chat/init/route.ts` |
| Per-message bootstrap and routing | `src/app/api/chat/route.ts` |
| Canonical contact matching and stitching | `src/lib/customerContacts.ts` |
| Widget capability signing and verification | `src/lib/security/widgetSessionToken.ts` |
| Session/message schema | `supabase/011_inbox.sql` |
| Contact/segment schema | `supabase/034_contacts_segments.sql` |
| Retention constants | `src/lib/retention.ts` |
| End-to-end benchmark | `scripts/benchmark-chat-latency.mjs` |
| Complete request latency timeline | `system_design/35-customer-message-to-reply-latency-timeline.md` |

