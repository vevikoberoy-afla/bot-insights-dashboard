# Current Bulk Email System Design (V2)

## 1. Scope

This is the as-built design for the production bulk-email lane. It supports:

- bot-specific sender and reply routing;
- opted-in contact segmentation;
- immediate and scheduled campaigns;
- a safe structured email composer;
- catalogue product and coupon insertion;
- asynchronous audience materialization;
- isolated canary delivery before full fan-out;
- AWS SESv2 delivery with guarded SMTP fallback;
- SaaS quota reservation, idempotency, and crash recovery;
- opens, clicks, deliveries, bounces, complaints, and one-click unsubscribe;
- reputation circuit breaking and live dashboard progress.

Bulk marketing delivery is separate from transactional bot replies, but shares the same workspaces, bots, contacts, product catalogue, integrations, entitlements, and audit boundaries.

## 2. Architecture

```text
Campaign dashboard
  | authenticated, tenant-scoped APIs
  +--> Segment preview RPC ----> contacts + orders + suppressions
  +--> Campaign draft ----------> campaigns + campaign_messages
  +--> Launch ------------------> QStash coordinator job
                                      |
                                      +--> async audience materialization
                                      +--> Redis campaign/product snapshot
                                      +--> first 200-recipient canary
                                      +--> 180-second safety window
                                      +--> keyset-paged full fan-out
                                               |
                                               v
                                        Send-batch worker
                                      claim RPC | commit RPC
                                               |
                                  +------------+------------+
                                  |                         |
                              AWS SESv2              guarded SMTP pool
                                  |
                         ESP event webhook
                                  |
                    reputation and suppression state

Email links --> HMAC token verification --> Redis first-event shield
                                      --> PostgreSQL engagement RPC
```

Supabase is the durable source of truth. Redis accelerates immutable snapshots, preview results, first-event deduplication, pause flags, and live counters. Redis also holds a seven-day, durable-before-dispatch breadcrumb for each provider wave. If that safety breadcrumb is unavailable, workers pause instead of risking a duplicate send; PostgreSQL remains the durable business-data source of truth.

## 3. Dashboard UI

The route is `/campaigns/email`.

### Campaign list

The list displays campaign name, subject, state, delivery progress, unique opens, clicks, bounces, complaints, and reputation pauses. Active rows poll a narrow progress endpoint every three seconds. Progress bars animate with `transform: scaleX(...)` rather than layout-changing width updates.

### Structured composer

The repository-owned block editor supports up to 20 blocks:

- heading;
- paragraph;
- coupon callout;
- product grid;
- HTTPS button.

Blocks are serialized to `campaigns.content_json`; arbitrary HTML is never accepted. All text is escaped during rendering. Supported variables are `{{first_name}}`, `{{name}}`, `{{coupon_code}}`, and `{{store_name}}`. Button URLs must parse as valid HTTPS URLs with a hostname.

This deliberately avoids adding Maily or React Email. The internal block schema is smaller, auditable, compatible with the existing product, and does not introduce another editor/runtime dependency.

### Reusable templates, import, and preview

Email templates are workspace-scoped records in the existing `templates` store under the `Email Campaign` category. The email composer can load, edit, save as new, update, and delete these templates through `/api/email/templates`.

The importer accepts `.json`, `.html`, `.htm`, and `.txt` files up to 250 KB. Imported HTML is parsed in the browser and converted into the same heading, paragraph, and HTTPS-button block schema; raw HTML, scripts, forms, styles, and unsafe links are never persisted. The imported result remains fully editable before it can be used.

The second composer step calls `/api/email/preview`, which validates the content and bot/product scope on the server and renders it with the production email renderer. The returned document is displayed in a sandboxed desktop/mobile iframe using a sample contact. A campaign can only be sent or scheduled from this final preview step.

Selecting Email from `/campaigns/create` opens this production composer directly and carries forward the campaign name, rather than continuing through the older generic message prototype.

### Product picker

The picker is scoped to the chosen bot. When a bot has explicit commerce configuration, only linked active products are available. An unconfigured bot retains the product-wide default behavior already used elsewhere in the product.

The picker reads synchronously from `botCommerceCache` when L1 memory is warm. Background results from `/api/email/options` are written into the existing L1 memory, IndexedDB L2, and cross-tab broadcast cache. Changing the selected bot clears product selections so stale product IDs cannot cross bot boundaries. The create API repeats tenant and bot-product authorization on the server.

## 4. Audience segmentation

Audience selection uses a validated JSON filter AST rather than executable SQL:

```json
{
  "combinator": "AND",
  "rules": [
    { "id": "orders", "field": "total_orders", "operator": "gte", "value": 2 },
    { "id": "recent", "field": "last_chat_days_ago", "operator": "lte", "value": 30 }
  ]
}
```

Allowed fields are `total_spent`, `total_orders`, `tags`, `last_order_days_ago`, and `last_chat_days_ago`. Numeric fields allow `gt`, `gte`, `lt`, `lte`, and `eq`; tags allow `contains` and `not_contains`. The API limits filters to 20 rules and validates all names, operators, value types, and lengths against fixed allowlists.

PostgreSQL evaluates the AST through `bulk_email_contact_matches` using parameters and fixed branches. No user value is concatenated into SQL.

A contact is eligible when:

- it belongs to the workspace;
- `opt_in_email` is true;
- its address passes the database email check;
- the lowercase address is not suppressed;
- its contact/order metrics match the filter.

Lowercase email addresses are deduplicated, preferring the most recently active contact. Preview results are cached in Redis for 30 seconds by workspace, bot, and SHA-256 hash of the validated AST. Final materialization always runs against PostgreSQL.

## 5. Durable data model

### `campaigns`

Stores bot ownership, content, audience AST, product IDs, sender data, schedule, transport mode, materialization timestamps, queue ID, counters, completion, pause, and failure state.

### `campaign_messages`

Stores the normalized subject and plain-text representation used for campaign history.

### `campaign_recipients`

Stores the immutable send audience and per-recipient state: email, contact, variables, provider message ID, lease, attempt count, delivery/engagement timestamps, and last error.

### `email_suppressions`

Provides a workspace-wide durable blocklist for hard bounces, spam complaints, unsubscribes, and manual suppressions.

### `email_campaign_events`

Records lifecycle, batch, engagement, provider, unsubscribe, and circuit-breaker events.

### `saas_delivery_operations` and usage events

Provide one delivery operation per campaign recipient and atomic monthly/daily allowance reservation. Accepted delivery commits usage, definite failure releases it, and an ambiguous provider outcome remains reserved so a retry cannot duplicate a possibly delivered email.

## 6. Database migration and RPCs

V1 is installed by `supabase/075_bulk_email_campaigns.sql`. V2 is installed by `supabase/076_bulk_email_v2_scale_upgrade.sql`, followed by the production edge hardening in `supabase/077_bulk_email_delivery_hardening.sql`.

V2 adds:

- `materialized_at` and `materialization_started_at`;
- `transport_mode` constrained to `ses` or `smtp`;
- opted-in contact, order-metric, and expired-lease indexes;
- the `batch_processed` event type;
- `bulk_email_claim_batch_with_quota`;
- `bulk_email_commit_batch_outcomes`;
- `bulk_email_record_engagement_v2`.

Migration `077` adds dispatch-aware stale-lease recovery and replaces retention deletion with a 10,000-row bounded `SKIP LOCKED` purge.

The batch RPCs are service-role-only. They are revoked from public, anonymous, and authenticated database roles.

### Claim RPC

One transaction claims up to 100 pending or lease-expired recipients using row locks with `SKIP LOCKED`. It also:

- rechecks late suppressions;
- reserves SaaS marketing and daily quotas;
- reconciles already accepted operations;
- returns stale `sending` operations as `stale_sending` for dispatch-breadcrumb reconciliation;
- retransmits only when the worker can prove that no provider wave was started;
- never retransmits a recipient whose provider dispatch began or whose outcome is otherwise ambiguous;
- returns suppression or quota rejection as explicit non-send outcomes so campaigns cannot remain stuck.

The MD5 value used inside this RPC is only a stable equality/idempotency fingerprint. It is not used as a security signature. Security tokens use HMAC-SHA256.

### Commit RPC

One transaction commits up to 100 outcomes, finalizes delivery-ledger operations, updates recipient states, increments campaign counters once, emits one batch event, and completes the campaign when no pending or processing rows remain.

## 7. Campaign lifecycle

```text
draft --launch now--> sending --no recipients left--> completed
  |                      |
  | schedule             +--manual/reputation pause--> paused_circuit_breaker
  v                      |
scheduled --due--------->+

scheduled/sending/paused_circuit_breaker --stop--> cancelled
```

Launch commits `scheduled` or `sending` before publishing to QStash. Queue publication failure restores the campaign to a retryable draft. Audience materialization is not performed in the launch HTTP request.

## 8. Coordinator

The signed coordinator worker:

1. validates the QStash signature, or the explicit development webhook secret when QStash signing keys are absent;
2. checks campaign entitlement and the Redis pause flag;
3. transitions a due scheduled campaign to sending;
4. asynchronously materializes and counts eligible recipients;
5. completes an empty campaign cleanly;
6. pauses SMTP campaigns over 500 recipients;
7. caches a two-hour campaign/product snapshot without SMTP passwords;
8. enqueues only the first 200 recipients as a canary;
9. schedules exactly one full-fan-out continuation after 180 seconds;
10. reads later recipients in 1,000-ID keyset pages and dispatches bounded jobs.

SES jobs contain at most 100 recipients. SMTP jobs contain at most 10. SMTP flow control remains workspace-scoped because each workspace owns its mailbox. SES uses the global `bulk-email-ses-global` key because every workspace shares the deployment's AWS account limit. Its period is derived from 70% of `EMAIL_OUTBOUND_RATE`, with one active batch at a time.

Every canary batch, delayed continuation, full-fan-out page, and page batch has a deterministic QStash `deduplicationId`. Canary and fan-out pagination read the immutable materialized recipient-ID set rather than the changing `pending` subset, so a retry resolves the same IDs and cursor even after workers have started. The claim RPC remains responsible for filtering recipient state. A coordinator retry therefore cannot enqueue a second canary, skip a shifted page, or schedule a duplicate continuation. Audiences of 200 recipients or fewer do not schedule the delayed continuation. The full fan-out checks the Redis pause flag before doing further work, so webhook reputation protection during the canary window stops the remaining audience.

## 9. Send worker

The send worker performs one claim RPC before sending and one commit RPC afterward. A snapshot cache miss may require a campaign/product fallback read; SMTP credentials are intentionally resolved from the protected integration store and are never put in Redis.

The invariant HTML and text layout is compiled once per batch. Recipient names and HMAC-signed open, click, and unsubscribe URLs are injected afterward. SES uses concurrency 20. SMTP uses concurrency 2 and QStash applies the stricter external drip rate.

Before each provider concurrency wave, the worker writes the exact recipient IDs to a seven-day Redis set. A stale lease with no breadcrumb is safe to resume because no provider call began. A stale lease with a breadcrumb is finalized as ambiguous without retransmission. If Redis cannot persist or read this state, the worker returns a retryable service error and does not start another provider call.

Transport failures are explicitly classified:

- HTTP/provider rejections, SMTP response codes, DNS failures, and refused connections are definite pre-acceptance failures and release quota;
- throttling, provider 5xx responses, SMTP 4xx responses, and pre-connect network failures wait 500–1,000 ms with jitter and retry once inside the worker;
- connection reset, broken pipe, request timeout, undici socket loss, and unclassified post-dispatch failures are ambiguous, keep quota reserved, and are never retransmitted.

Template/render failures are definite because the provider call did not begin.

Expired processing leases are reclaimable. Dispatch breadcrumbs narrow the ambiguity window to only the wave actually handed to the provider instead of marking the untouched remainder of a claimed batch unknown.

## 10. Delivery transports

### AWS SESv2

`SESv2Client` is a module singleton and sends over the HTTPS API. Raw MIME is built with Nodemailer so List-Unsubscribe headers and custom campaign IDs are retained. The visible From identity is deployment-controlled; tenant input cannot impersonate an arbitrary SES sender.

### SMTP fallback

Nodemailer transport pools are singleton-cached by host, port, and user. TLS 1.2 or newer and certificate validation are required. File and URL access are disabled. SMTP is a guarded fallback:

- maximum materialized audience: 500;
- 10 recipients per queued job;
- one workspace job per minute through QStash;
- two concurrent connections inside a worker.

## 11. Tracking, unsubscribe, and reputation

Open and click links contain HMAC-SHA256 tokens. Click targets must be HTTPS and are signed into the token, preventing an unsigned open redirect. Redis `SET NX` keys suppress duplicate first events for 30 days. If Redis is unavailable, the database RPC remains idempotent and acts as the correctness fallback.

The unsubscribe endpoint supports GET and RFC 8058-style POST. It updates the durable suppression list and clears the contact's email opt-in.

The ESP endpoint processes delivery, permanent bounce, and complaint events. Durable RPCs deduplicate events and update suppressions/counters. Redis mirrors live metrics. The circuit breaker pauses a campaign when minimum-volume bounce or complaint thresholds are exceeded.

## 12. Live progress

Redis hashes store total, status, sent, failed, delivered, opened, clicked, bounced, and complained values. `/api/email/campaigns/progress` accepts one campaign ID or at most 50 IDs. It first performs a narrow workspace-scoped database query to authorize the requested campaigns and provide a durable baseline, then overlays Redis counters. Redis is therefore an acceleration layer, not an authorization source.

## 13. Security controls

- All merchant APIs require workspace membership and campaign read/write permissions.
- All campaign, bot, product, and contact queries are scoped by `client_id`.
- Product authorization is repeated server-side at campaign creation.
- Reply-to addresses must match the mailbox assigned to the bot when one exists.
- Worker endpoints require QStash signatures in production.
- SMTP credentials are decrypted only server-side and never stored in jobs or Redis.
- Structured blocks are escaped; arbitrary HTML is rejected.
- CTA and click targets require HTTPS.
- CR/LF is removed from sender names and subjects.
- Suppression is checked at materialization and again atomically at claim time.
- Delivery RPCs are unavailable to tenant database roles.
- HMAC comparison uses constant-time verification in the token module.

## 14. Failure behavior

- Queue publication fails: restore draft and remove transient Redis metrics.
- Materialization fails: retain sending state with a failure reason and allow QStash retry.
- Empty audience: complete with zero recipients.
- SMTP audience exceeds 500: pause without sending.
- Worker crashes before a wave breadcrumb: lease becomes reclaimable and is safely sent later.
- Worker crashes after a wave breadcrumb: only that started wave becomes ambiguous and is not resent; untouched recipients remain recoverable.
- Explicit provider rejection: retry once when transient, otherwise fail and release quota.
- Redis metrics/cache unavailable: use PostgreSQL snapshot/counter/idempotency fallbacks; if dispatch-breadcrumb state is unavailable, pause provider delivery until it recovers.
- Late unsubscribe: return an explicit suppressed outcome and complete normally.
- Quota exhausted: return an explicit rejected outcome and complete normally.
- Cancellation/reputation pause: workers stop between waves and finalize claimed non-sent rows.

## 15. Retention

`purge_old_campaign_recipients` removes at most 10,000 terminal recipient rows per invocation from completed or cancelled campaigns older than 30 days. Its ordered CTE uses `FOR UPDATE SKIP LOCKED`, bounding WAL, transaction duration, and vacuum pressure while live workers claim rows. Durable campaign summaries, aggregate counters, suppressions, and event/audit data remain under their separate retention policies.

## 16. Verification

The in-memory PostgreSQL integration suite applies migrations through `077` twice and validates:

- migration rerun safety;
- audience filtering, deduplication, claim behavior, and unsubscribe;
- V2 atomic claim/quota/commit/completion behavior;
- stale claims remain distinguishable until the worker consults the dispatch breadcrumb;
- retention removes no more than 10,000 recipients in one transaction;
- delivery-ledger idempotency and quota release semantics;
- tenant RLS and campaign permission isolation.

Type checking and the production build validate all dashboard/API/worker imports and server/client boundaries. External SES, SMTP, QStash, Redis, and SNS behavior still requires a staging smoke test with real credentials; the automated suite never sends real email.

## 17. Operational setup

1. Apply migrations `075`, `076`, and `077` in order.
2. Configure Supabase service credentials, QStash, Upstash Redis, `NEXT_PUBLIC_APP_URL`, and `BULK_EMAIL_SIGNING_SECRET`.
3. Prefer AWS SESv2 credentials, verified sender identity/domain, and an SES configuration set.
4. Configure the ESP webhook secret and route SES events through SNS to `/api/webhook/esp-events`.
5. For fallback only, connect a TLS SMTP mailbox to the selected bot.
6. Run a small internal canary and verify delivery, one-click unsubscribe, click redirect, bounce suppression, reply routing, and circuit pause before enabling customer campaigns.

## 18. Deliberate boundaries

- There is no arbitrary HTML editor.
- There is no A/B variant experiment engine.
- There is no automatic resend of ambiguous deliveries.
- SMTP is not offered as an unbounded bulk transport.
- Claimed recipient rows are not deleted immediately; they are retained for audit and engagement attribution.
- Redis metrics are eventually consistent and never replace PostgreSQL truth.
- Provider delivery intentionally pauses when Redis dispatch breadcrumbs cannot be persisted or read; this fail-closed behavior protects against duplicate email.
