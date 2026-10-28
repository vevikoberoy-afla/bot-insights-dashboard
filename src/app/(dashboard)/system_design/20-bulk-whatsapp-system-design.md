# Bulk WhatsApp campaign system

## Product scope

The WhatsApp campaign lane is a tenant-scoped extension of the existing campaign platform. It shares workspaces, bots, contacts, audience rules, products, coupons, campaign lifecycle tables, SaaS controls, QStash, Redis, and the two-phase delivery ledger with bulk email. Promotional broadcasts remain separate from one-to-one bot conversations.

The workspace experience provides:

- one or more Meta WhatsApp Business integrations, each assigned to a bot;
- creation and direct submission of structured templates to Meta;
- synchronization of Meta approval, rejection, pause, disabled, and flagged states;
- use of approved templates only;
- positional-variable mapping to allowlisted contact, store, coupon, and product values;
- a WhatsApp bubble preview before launch;
- reusable email-compatible audience rules with WhatsApp-specific consent and suppression checks;
- immediate or scheduled delivery, cancellation, canary protection, and live progress;
- sent, delivered, read, tracked HTTPS CTA click, quick-reply click, failure, and opt-out telemetry.

## Dashboard routes

`/campaigns/whatsapp` is the campaign list and two-step composer. It hydrates bot products immediately from `botCommerceCache`, refreshes them in the background, reads `/api/whatsapp/preview` for the authoritative rendered preview, creates a draft, and launches it through the queue. Active rows poll the progress overlay every three seconds. Its readiness panel checks storage and required environment configuration and can make an authenticated live Meta template-list request.

`/campaigns/whatsapp/templates` is the Meta template registry and builder. It submits templates through the WABA API and synchronizes server-side status. Image-header templates use Meta's resumable upload API; the permanent access token never reaches the browser.

`/settings/integrations` stores the WABA ID, Phone Number ID, permanent System User token, and bot assignment. Secret fields are encrypted using the tenant vault and redacted on reads.

## Durable data model

Migrations `078_bulk_whatsapp_campaigns.sql` and `079_bulk_whatsapp_v2_enterprise.sql` add:

- country-aware `contacts.phone_e164` normalization through `libphonenumber-js`, WhatsApp consent state, and default-country configuration per integration;
- the last inbound timestamp and explicit 24-hour service-window expiry on both contacts and sessions;
- `whatsapp_suppressions` for permanent workspace-wide exclusions;
- `whatsapp_templates` for the local mirror of Meta templates;
- WhatsApp campaign configuration and counters on `campaigns`;
- phone, provider message ID, and read time on `campaign_recipients`;
- `whatsapp_campaign_events` and `whatsapp_phone_health` for delivery, engagement, opt-out, quality, messaging-limit, pause, and audit telemetry;
- separate marketing and utility consent, scoped suppressions, conservative rolling-24-hour tier reservations, and a checksum-based Meta media cache;
- channel-specific SaaS feature and quota keys;
- service-role-only materialize, claim, commit, status, click, and opt-out RPCs.

Row-level policies use the existing `campaigns` workspace permission. Browser code cannot execute the privileged delivery RPCs.

## Template approval lifecycle

1. The client selects a connected bot, category, locale, header, body, footer, examples, an optional HTTPS CTA, and an optional opt-out quick reply (two buttons maximum).
2. Zod and domain validation enforce the template name, sequential `{{1}}`–`{{4}}` parameters, lengths, HTTPS media, samples, and buttons.
3. Image samples are uploaded to Meta's resumable upload API when `META_APP_ID` is configured.
4. The template is submitted to `/{waba_id}/message_templates` and stored locally as pending.
5. Sync or Meta's `message_template_status_update` webhook updates its state.
6. Campaign creation rejects any template not currently `APPROVED`.
7. Meta pause, disable, or flag events pause every scheduled or sending campaign using that template.

## Audience eligibility

`bulk_whatsapp_preview_audience` and `bulk_whatsapp_materialize` apply identical rules:

- contact belongs to the campaign workspace;
- marketing templates require `opt_in_whatsapp_marketing=true`; utility/authentication templates require `opt_in_whatsapp_utility=true`;
- normalized E.164 digits are 8–15 characters and do not begin with zero;
- no workspace suppression exists;
- the contact matches the validated, 20-rule maximum audience AST;
- duplicate phone numbers select only the most recently active contact.

Previews are cached in Redis for 30 seconds. Launch materializes immutable recipient IDs in PostgreSQL before fan-out.

## Queue and delivery

Launch publishes the WhatsApp coordinator. The coordinator materializes the audience, atomically reserves the unique recipients against the phone number's rolling 24-hour Meta tier, reuses a valid SHA-256-keyed media ID or uploads once, writes a two-hour Redis snapshot, and sends the first 200 recipients in four 50-recipient jobs. Audiences above 200 wait 180 seconds before deterministic keyset fan-out.

QStash jobs have deterministic deduplication IDs. Rate limiting is keyed by Phone Number ID so separate business numbers remain isolated. Recipient pages use immutable IDs rather than mutable status filters, preventing retry cursor shifts.

Each send worker performs exactly one claim RPC and one commit RPC per batch:

1. Claim up to 50 pending or lease-expired rows with `SKIP LOCKED`.
2. Recheck suppression and atomically reserve WhatsApp SaaS allowances.
3. Reconcile stale operations through a Redis durable-before-dispatch breadcrumb.
4. Send paced sub-waves of 10 through a singleton Undici connection pool with HTTP/2 enabled for the official Meta Cloud API. QStash permits one active worker per Phone Number ID to prevent cross-container burst multiplication.
5. Retry definite throttling once with jitter. Definite failures release quota; ambiguous socket loss becomes `unknown` and is never resent.
6. Commit all outcomes atomically and update live Redis counters.

## Webhook and conversational handoff

`/api/webhook/whatsapp` verifies `X-Hub-Signature-256` using `META_APP_SECRET`, durably buffers the signed payload in Redis, schedules a signed QStash ingestion worker, and acknowledges Meta before database, RAG, or AI work begins. The worker re-enters the handler through a protected internal path. Delivery events use a 30-day Redis first-event shield and a PostgreSQL monotonic transition RPC. A `read` event also records delivery when Meta skipped the delivered event.

`STOP`, `Unsubscribe`, or the `OPT_OUT_PROMO` quick reply atomically disables marketing consent and inserts a marketing-scoped suppression. Utility order, booking, and service notifications remain eligible unless an all-channel suppression exists. Other replies continue through the assigned bot's existing commerce, booking, support, RAG, and human-handoff pipeline. Every inbound reply refreshes the stored 24-hour service window; dashboard free-form replies are rejected after expiry so an approved template must be used instead.

HTTPS CTA templates are submitted to Meta with a dynamic, signed redirect parameter. Each recipient receives an HMAC-SHA256 token containing the recipient and allowlisted destination. `/api/track/whatsapp` verifies expiration and signature, records only the first click atomically, and redirects with `no-referrer`; Meta synchronization preserves the private destination rather than overwriting it with the tracking URL.

Campaigns automatically pause when:

- Meta pauses, disables, or flags the selected template;
- phone quality becomes yellow or red, or Meta reports any downward `current_limit` messaging-tier transition;
- hard delivery failures exceed 6% after at least 50 attempts;
- opt-outs exceed 1.5% after at least 50 recipients.

## Required configuration

- Apply `supabase/078_bulk_whatsapp_campaigns.sql`, then `supabase/079_bulk_whatsapp_v2_enterprise.sql`, after migrations 075–077.
- Set `NEXT_PUBLIC_APP_URL` to the public HTTPS application origin.
- Configure QStash and Upstash Redis.
- Set `META_APP_SECRET`, `META_APP_ID`, `WHATSAPP_VERIFY_TOKEN`, and `WHATSAPP_WORKER_SECRET`.
- Set `WHATSAPP_CLICK_SIGNING_SECRET` and `DEFAULT_PHONE_COUNTRY` (for example `IN`).
- Subscribe the Meta app webhook to messages, message template status, and phone quality events at `/api/webhook/whatsapp`.
- Connect a WhatsApp integration and assign it to a bot.
- Ensure contacts have explicit WhatsApp consent and country-code phone numbers.

## Validation

The database integration suite executes migrations 078 and 079 twice for rerun safety and covers category-aware consent, rolling tier reservation, quota-backed claim and commit, read-implies-delivered progression, late delivered events, and marketing-only STOP suppression. Type checking and the production build cover the API, worker, webhook, and dashboard surfaces. A live Meta staging test requires real WABA credentials and an approved template; the dashboard's **Test Meta** action performs that check once credentials are configured.

## End-to-end architecture

```text
Workspace dashboard
  ├── Integration setup ──────────────── encrypted Meta credentials
  ├── Template builder ──────────────── Meta template submission/sync
  └── Campaign composer
        ├── botCommerceCache ────────── immediate product picker
        ├── segment preview RPC ─────── eligible audience count/sample
        ├── server preview API ──────── authoritative variable rendering
        └── launch API
              │
              ▼
         PostgreSQL campaign + immutable recipients
              │
              ▼
         QStash coordinator
              ├── canary: first 200 recipients
              └── delayed keyset fan-out
                       │
                       ▼
                 QStash batch workers
                       ├── claim + quota reservation RPC
                       ├── Redis dispatch breadcrumb
                       ├── Meta Cloud API HTTP/2 pool
                       └── atomic outcome commit RPC

Meta webhooks ── signature verification ── status/quality/STOP handlers
Tracked CTA ──── signed redirect token ─── atomic first-click handler
```

PostgreSQL is authoritative for campaign and recipient state. Redis is an acceleration and coordination layer, never the only durable source. QStash provides delayed delivery, retries, request signing, and bounded worker execution. Meta remains authoritative for template approval and provider delivery status.

## Frontend information architecture

### Navigation

The WhatsApp system is exposed under the Campaigns area:

- **Bulk WhatsApp** opens `/campaigns/whatsapp`.
- **Manage templates** opens `/campaigns/whatsapp/templates`.
- WhatsApp credentials and bot assignment remain under `/settings/integrations`.

All pages inherit the authenticated workspace shell. API authorization repeats workspace and `campaigns` permission checks; hiding a control in the browser is not treated as authorization.

### Campaign list screen

The page header contains the title, a short delivery-safety description, **Manage templates**, and **New campaign**. A search field filters the already-loaded campaign collection by name.

The campaign table contains:

| Column | UI behavior |
| --- | --- |
| Campaign | Campaign name and approved Meta template name |
| Status & sent | Human-readable lifecycle state, sent/recipient count, and progress bar |
| Delivered | Durable delivered count from Meta webhooks |
| Read | Durable read count from Meta webhooks |
| Clicked | First-click count across HTTPS CTAs and tracked replies |
| Failed / opt-outs | Failure and suppression totals, or an auto-pause warning |
| Action | Stop for scheduled/sending campaigns; completion indicator otherwise |

Rows in `scheduled` or `sending` state refresh through `/api/whatsapp/campaigns/progress` every three seconds. The progress endpoint combines durable PostgreSQL counts with short-lived Redis counters so updates appear quickly without sacrificing recovery.

### Two-step campaign composer

The **New campaign** action opens a responsive modal. It uses two explicit steps so launch cannot occur directly from an incomplete form.

#### Step 1 — compose and audience

The main column contains:

1. Campaign name.
2. Sending bot selector, limited to bots with an active WhatsApp integration.
3. Approved Meta template selector.
4. One allowlisted variable selector for each positional template placeholder.
5. Compact WhatsApp message preview.

The supporting column contains:

1. Eligible-audience card that opens the reusable visual filter builder.
2. Optional bot-scoped featured product selector.
3. Optional coupon code.
4. Optional public header-image override.
5. Optional local date/time schedule.
6. Protected-delivery explanation.
7. Production-readiness card.

Changing the bot clears template/product selections that belong to the prior bot. Products are first read synchronously from `botCommerceCache`; the bot-scoped options endpoint refreshes the data in the background and writes it back into memory, IndexedDB, and the cross-tab cache. This provides an immediate picker while the server remains authoritative.

The audience builder uses the same validated JSON filter AST as bulk email, but WhatsApp preview and materialization add channel consent, valid E.164 phone, deduplication, and suppression requirements. Preview requests are debounced by 220 milliseconds.

#### Step 2 — authoritative preview and launch

Selecting **Review** validates the form and calls `/api/whatsapp/preview`. The server verifies workspace ownership, bot/template association, approved product availability, product-to-bot assignment, binding count, and allowed variables. It returns the rendered message used by the final phone-style preview.

From this screen the operator can:

- select **Edit** to return without losing input;
- select **Schedule** when a date/time is present;
- select **Send** for immediate queueing.

The launch button reports the current eligible audience count and disables while the request is in progress. Errors remain inside the modal so the operator can correct the campaign without rebuilding it.

### Production-readiness UI

After a bot is selected, the readiness card calls `/api/whatsapp/readiness`. It checks:

- active bot-specific Meta connection;
- public HTTPS application origin;
- webhook verification token and Meta app secret;
- QStash token and signing keys;
- Upstash Redis URL and token;
- worker authentication secret;
- dedicated CTA signing secret;
- migration-backed WhatsApp storage.

**Test Meta** performs an authenticated template-list request using the selected bot's encrypted WABA credentials. The UI only receives pass/fail details; access tokens are never returned.

### Template registry

`/campaigns/whatsapp/templates` contains:

- template search;
- connected-bot selector;
- **Sync from Meta** action;
- a table of template name, category, language, Meta status, rejection reason, and synchronization time;
- **Create template** action.

Status badges visually distinguish approved, pending, rejected, paused, disabled, and flagged templates. A sync updates provider state while preserving the private destination URL for locally created tracked CTA buttons.

### Template editor

The editor and live phone preview are displayed side by side on desktop and stacked on smaller screens. Inputs include:

- sending bot;
- lowercase Meta template name;
- language and category;
- no header, text header, or image header;
- message body with sequential `{{1}}`–`{{4}}` placeholders;
- sample input for every placeholder;
- footer;
- optional tracked HTTPS CTA label and destination;
- optional **Stop Promotions** quick reply.

The UI allows at most two buttons. The live preview renders the header, body samples, footer, time, CTA, and quick reply before submission. The API repeats all validation with Zod and domain rules. Creation submits directly to Meta and records the local template as pending; it does not incorrectly make a pending template selectable for campaigns.

## API surface

| Endpoint | Responsibility |
| --- | --- |
| `GET /api/whatsapp/options` | Connected bots; approved templates and bot-scoped products when `botId` is supplied |
| `GET/POST /api/whatsapp/templates` | List, create, submit, and synchronize Meta templates |
| `POST /api/whatsapp/segments/preview` | Consent-safe audience count and sample |
| `POST /api/whatsapp/preview` | Server-authoritative variable/product rendering |
| `GET/POST /api/whatsapp/campaigns` | List campaigns and persist a validated draft |
| `POST /api/whatsapp/campaigns/launch` | Materialize and queue immediate/scheduled execution |
| `POST /api/whatsapp/campaigns/cancel` | Stop queue activity and cancel remaining recipients |
| `GET /api/whatsapp/campaigns/progress` | Lightweight live progress overlay |
| `GET /api/whatsapp/readiness` | Configuration checks and optional live Meta verification |
| `POST /api/workers/whatsapp-coordinator` | Canary and deterministic batch fan-out |
| `POST /api/workers/whatsapp-send-batch` | Claim, render, dispatch, and atomically commit up to 50 recipients |
| `POST /api/workers/whatsapp-webhook-events` | Consume durable buffered Meta events outside the acknowledgement path |
| `GET/POST /api/webhook/whatsapp` | Meta verification, inbound messages, delivery states, quality events, and opt-outs |
| `GET /api/track/whatsapp` | Verify signed CTA, record first click, and redirect |

## Campaign state model

```text
draft
  ├── scheduled ──► sending ──► completed
  └── sending ─────────────────► completed
         ├── paused_circuit_breaker
         ├── failed
         └── cancelled
```

Recipient states progress monotonically where possible:

```text
pending → processing → sent → delivered → read
                    ├───────────────→ failed
                    └───────────────→ unknown
```

`unknown` represents an ambiguous network outcome. It remains reserved and is not automatically resent, preventing duplicate customer messages. A read webhook implies delivery if the delivered webhook was skipped.

## Rendering and personalization

Template placeholders are positional because Meta templates use `{{1}}`, `{{2}}`, and so on. Each position can map only to:

- `first_name`
- `name`
- `coupon_code`
- `store_name`
- `product_title`
- `product_price`

The worker renders from the immutable recipient snapshot plus the campaign's bot-scoped product and coupon data. Newlines and excessive lengths are normalized before dispatch. User-provided arbitrary property access and raw template execution are not supported.

For tracked HTTPS buttons, Meta stores a dynamic tracking URL. The worker creates a different signed suffix for every recipient. The HMAC payload contains the recipient ID, final HTTPS destination, purpose, version, and 30-day expiry. Because the destination is signed, the tracking endpoint cannot be converted into an unsigned open redirect.

## Reliability and idempotency

- Campaign recipients are materialized once before delivery.
- Phone-level deduplication prevents multiple contacts with the same number receiving the campaign.
- QStash jobs use deterministic deduplication identifiers.
- Batch claims use row locks with `SKIP LOCKED` and expiring leases.
- SaaS quota reservation and delivery claims occur in PostgreSQL before contacting Meta.
- A Redis breadcrumb is written before dispatch to distinguish stale work from safe retries.
- Definite provider rejection releases the reserved allowance.
- Ambiguous transport failure remains reserved and is not resent automatically.
- Commit RPCs are idempotent, and webhook state transitions are monotonic.
- CTA and quick-reply clicks count once per recipient.
- Meta webhook processing is durably buffered before acknowledgement; status-level Redis deduplication still falls back to PostgreSQL monotonic guards.

## Security and tenant isolation

- Every dashboard endpoint resolves the authenticated workspace and required permission.
- Bot, product, template, campaign, and integration IDs are re-scoped to that workspace on the server.
- Meta tokens are encrypted at rest and redacted from integration responses.
- Webhooks require constant-time SHA-256 signature verification with `META_APP_SECRET`.
- QStash workers use QStash signatures; the fallback worker secret is intended only for controlled environments.
- Delivery RPCs are revoked from public, anonymous, and authenticated database roles and granted only to `service_role`.
- WhatsApp tables use RLS through workspace campaign permissions.
- CTA tokens use HMAC-SHA256, expiration, purpose separation, HTTPS-only targets, first-click idempotency, `no-store`, and `no-referrer`.
- Phone numbers are parsed by `libphonenumber-js` using the integration's configured default country and stored as digits-only E.164 lookup values.
- Sending requires explicit WhatsApp consent and checks durable suppressions again immediately before dispatch.

## Inbound replies and service window

An inbound customer message:

1. verifies the Meta webhook signature;
2. resolves the WhatsApp number to its bot and tenant;
3. upserts the contact using the normalized phone number;
4. stores `last_whatsapp_inbound_at` and a window expiry 24 hours later on the contact and session;
5. records the message in the existing inbox conversation;
6. routes it through opt-out, booking, commerce, support, RAG, or human-handoff behavior.

Dashboard agents can send free-form WhatsApp replies only while the stored service window is open. Once it closes, the inbox API rejects the free-form message and instructs the operator to use an approved template.

## Operational controls

Automatic campaign pauses protect reputation and spend:

| Condition | Action |
| --- | --- |
| Template paused, disabled, or flagged | Pause campaigns using that template |
| Phone quality `YELLOW` or `RED` | Pause active campaigns for that phone |
| Meta `current_limit` decreases | Persist old/new tier and pause active campaigns |
| Hard failures exceed 6% after 50 attempts | Pause campaign |
| Opt-outs exceed 1.5% after 50 recipients | Pause campaign |

Manual cancellation writes Redis pause state, cancels remaining recipients, updates durable campaign state, and requests QStash message deletion when a message ID is available.

## Deployment checklist

1. Apply migrations 075, 076, 077, `078_bulk_whatsapp_campaigns.sql`, and `079_bulk_whatsapp_v2_enterprise.sql` in order.
2. Configure all environment values documented in `.env.example`.
3. Add a Meta System User permanent token with the required WhatsApp permissions.
4. Add WABA ID, Phone Number ID, token, default country, and bot assignment in Integrations.
5. Configure the Meta webhook URL and subscribe to messages, template-status, and phone-quality fields.
6. Run **Test Meta** for the selected bot.
7. Create a test template and wait for Meta approval.
8. Import or edit contacts with explicit WhatsApp opt-in and valid phone numbers.
9. Launch a small internal campaign and verify sent, delivered, read, CTA click, STOP, and failure behavior.
10. Verify QStash worker signatures, Redis counters, circuit breaking, and admin usage limits in the deployed environment.

## Test evidence and remaining external verification

The current repository passes:

- TypeScript compilation;
- the full application test command;
- 45 real in-memory PostgreSQL SaaS/RLS integration checks, including migration re-runs, category-scoped consent, tier reservation, and monotonic WhatsApp delivery semantics;
- an optimized Next.js production build covering 182 routes.

Code-level production readiness is complete. Final production certification still requires real external credentials because a local test cannot prove Meta account permissions, approved-template delivery, QStash delivery from the public internet, Redis service availability, webhook routing, or the deployed domain's TLS configuration.
