Companion: [admin launch plan](15-saas-admin-launch-plan.md). This document supplies the detailed packaging, email allowances, counting rules, contracts and implementation interfaces for that architecture. Where packaging details differ, this document is the proposed next revision; published customers stay on their pinned plan version until an agreed migration. Values are planning assumptions, not market research or industry-mandated limits.

## 1. Business model

Sell one subscription per business workspace, not per end customer or bot. A workspace owns its bots, catalogue, bookings, contacts, integrations and employee memberships. Its staff share one allowance pool across all bots and channels. One person may own or join several independently billed workspaces.

Offer a limited Trial, Starter for a small business, Growth for an operating restaurant/shop, Business for multi-location teams and Enterprise for negotiated requirements. Do not offer an unlimited free tier at launch. Customers upgrade primarily for capacity, automation and organizational complexity; baseline security and data ownership remain included everywhere.

The product already combines support, knowledge, bookings and commerce. Include a usable basic version of those flows in Starter so it can demonstrate its value. Reserve advanced restaurant allocation, campaign automation, broader connections and advanced reporting for Growth and above.

## 2. Concrete resource allowances

All numeric allowances below are per workspace. Monthly means one allowance window anchored to subscription start, including for annually billed subscriptions. Trial allowances are totals over the whole 14-day trial.

| Resource | Trial | Starter | Growth | Business | Enterprise |
| --- | ---: | ---: | ---: | ---: | --- |
| Active bots | 1 | 1 | 5 | 20 | Contract |
| Total retained bots, including drafts/paused | 2 | 3 | 15 | 60 | Contract |
| Staff seats, including owner | 2 | 2 | 5 | 15 | Contract |
| Active channel connections, including mailboxes | 1 | 2 | 5 | 15 | Contract |
| Email mailboxes, within channel allowance | 1 test | 1 | 3 | 10 | Contract |
| Verified widget domains | 1 | 1 | 5 | 20 | Contract |
| AI response credits/month | 100 total | 1,000 | 5,000 | 20,000 | Contract |
| Active catalogue products | 25 | 250 | 2,500 | 10,000 | Contract |
| Total retained products, including drafts/archived | 50 | 500 | 5,000 | 20,000 | Contract |
| Active sellable SKUs including variants | 50 | 1,000 | 10,000 | 50,000 | Contract |
| Active booking services | 2 | 5 | 25 | 100 | Contract |
| Active locations | 1 | 1 | 5 | 20 | Contract |
| Active restaurant tables across locations | 10 evaluation | Not included | 100 | 500 | Contract |
| Active service/product offers | 2 | 5 basic | 25 | 100 | Contract |
| Stored contacts | 100 | 2,000 | 20,000 | 100,000 | Contract |
| Live Sheets/REST/database sources | 1 | 2 | 10 | 30 | Contract |
| Knowledge datasets | 1 | 3 | 15 | 50 | Contract |
| Processed knowledge storage | 100 MB | 500 MB | 2 GB | 10 GB | Contract |
| Uploaded media storage | 250 MB | 1 GB | 5 GB | 20 GB | Contract |
| Ingestion/enrichment jobs/month | 10 total | 100 | 500 | 2,000 | Contract |
| Live lookup requests/month | 500 total | 10,000 | 100,000 | 500,000 | Contract |
| Public API requests/month, excluding widget traffic | None | None | 50,000 | 250,000 | Contract |
| Active public API keys | None | None | 3 | 10 | Contract |
| Outbound webhook destinations | None | None | 3 | 10 | Contract |
| Concurrent bulk ingestion jobs | 1 | 1 | 3 | 5 | Contract |

Enterprise must resolve every field to a finite contractual value; no null meaning unlimited. Tables are an aggregate allowance and location filtering is still required. A table with six seats is one table, while booking capacity continues to be enforced by the restaurant allocation engine.

Orders, reservations and support tickets are not billed per successful transaction at launch. They remain subject to storage, abuse controls and operational throughput limits. Do not interpret this as an unlimited-performance promise. Default proposed sustained transaction-create limits: Trial 5/minute, Starter 30/minute, Growth 120/minute, Business 300/minute per workspace, subject to lower global safeguards. Tune using load tests before publication; a throttled confirmation must retain its idempotency key and draft.

## 3. Email, channel and campaign allowances

| Meter | Trial | Starter | Growth | Business | Enterprise |
| --- | ---: | ---: | ---: | ---: | --- |
| Transactional/customer-support emails/month | 25 test | 1,000 | 5,000 | 20,000 | Contract |
| Marketing email recipients/month | 0 | 0 | 10,000 | 50,000 | Contract |
| New inbound email messages processed/month | 50 total | 2,000 | 10,000 | 40,000 | Contract |
| Aggregate outbound email/day | 10 test | 200 | 2,000 | 10,000 | Contract/provider cap |
| Campaigns simultaneously sending | 0 | 0 | 2 | 5 | Contract |
| Recipients per campaign | 0 | 0 | 5,000 | 20,000 | Contract |
| Proactive trigger rules | 1 test | 3 | 20 | 100 | Contract |
| WhatsApp outbound recipient messages/month | 0 | 1,000 | 5,000 | 20,000 | Contract |
| SMS outbound recipient messages/month | 0 | 0 | 1,000 if adapter released | 5,000 if adapter released | Contract |

These are platform processing allowances. External SMTP, WhatsApp, SMS and other provider fees are not included unless a separately priced delivery package explicitly says so. Effective sending capacity is the minimum of the plan allowance, provider limits, sender warm-up limit and platform safety policy. A configured provider credential alone does not create delivery capacity.

Starter's two connections can be web + email, or web + WhatsApp, for example. An email mailbox consumes both one mailbox allowance and one channel connection. A connected calendar consumes an integration/source category defined in the plan catalog, not a messaging-channel slot; use a separate `calendar_connections.max_active` value of 0 trial test-only, 1 Starter, 5 Growth, 20 Business, contract Enterprise. A provider connection reused by multiple services counts once. Trial can test a mailbox instead of web but cannot run unrestricted public marketing.

### What counts as an email

One recipient accepted by the outbound provider counts as one email. A message addressed to three recipients consumes three units. An AI-generated reply consumes an email unit and its disclosed AI credits. A draft consumes AI credits when successfully generated and retained for the operator, but no send allowance until sent; label this clearly in the Usage UI.

Booking confirmations, reminders, order receipts, support replies and ticket updates use the transactional pool. Broadcasts, promotional journeys and abandoned-cart marketing use the marketing pool. These categories are assigned by a server-owned operation type, never by a user-supplied label. Marketing content cannot bypass its quota by selecting transactional.

Provider retries for the same message-recipient operation do not consume a second unit. A definite rejection before acceptance releases the reservation. A timeout with unknown delivery outcome stays `unknown` and is reconciled before resending; SMTP acceptance is not a guarantee of inbox delivery and may not support exactly-once submission. Never claim delivery certainty that the provider cannot supply.

Incoming messages are deduplicated by provider integration/message ID. Duplicate callbacks and obvious bounce-loop messages are not new processed messages. Spam filtering still consumes operational resources; cap intake and processing separately, and keep a small quarantine rather than infinite free ingestion. Do not repeatedly autorespond to autoresponders.

Auth verification, password reset and SaaS billing/security notices use a separate platform operational sender, outside merchant campaign limits, with abuse controls. They remain available when the tenant's email quota is exhausted.

### Sending controls

Add verified sender ownership, provider validation and domain authentication instructions, bounce/complaint suppression, unsubscribe handling for marketing, per-recipient dedupe and quiet-time scheduling. Marketing opt-out never removes access to requested transactional receipts. Configure webhook suppression updates where the provider supports them. Personal inbox SMTP should be treated as support-mailbox transport, not promised as bulk-marketing infrastructure.

## 4. Feature availability matrix

`Included` means proposed entitlement; actual availability also requires released implementation and any provider connection. Trials evaluate Growth features with smaller limits and test-only outbound sending.

| Product feature | Starter | Growth | Business | Enterprise |
| --- | --- | --- | --- | --- |
| Web iframe widget, appearance, rich cards | Included | Included | Included | Included |
| Knowledge/RAG, FAQ, source upload | Included | Included | Included | Included |
| Live Sheet/REST lookup and order verification | Included | Included | Included | Included |
| Support tickets, returns, photo evidence, CSAT | Included | Included | Included | Included |
| Inbox and human handoff | Included | Included | Included | Included |
| Basic catalogue, CSV/XLSX import, cart/order/inventory | Included | Included | Included | Included |
| Basic appointments and booking management | Included | Included | Included | Included |
| Restaurant table combinations/turn-time allocation | No | Included | Included | Included |
| Basic fixed/percentage merchant coupons | Included | Included | Included | Included |
| Slot/day/location-targeted offers | No | Included | Included | Included |
| Customer 360 and manual segments | Included | Included | Included | Included |
| Automatic behavior segments | No | Included | Included | Included |
| Email support bot and human approval drafts | Included | Included | Included | Included |
| Marketing campaigns and proactive automation | No | Included when released | Included when released | Contract |
| WhatsApp/Telegram connections | Within connection limits | Within limits | Within limits | Contract |
| External calendar adapters | 1 connection | 5 connections | 20 connections | Contract |
| Per-bot product/service/offer assignment | Included | Included | Included | Included |
| Standard ticket/bot reports | Included | Included | Included | Included |
| Booking/commerce funnel and offer analytics | No | Included | Included | Included |
| Team role templates | Included | Included | Included | Included |
| Branch/team-scoped access | No | Included | Included | Included |
| Custom roles | No | No | Future release | Contract after release |
| API access and outbound webhooks | No | Included | Included | Contract |
| White-label widget branding removal | No | No | Included once wired | Contract |
| Owner data export and deletion request | Included | Included | Included | Included |
| Scheduled analytical exports | No | No | Future release | Contract after release |
| SAML SSO / SCIM lifecycle | No | No | No | Optional, after implementation |
| Dedicated hosting/region | No | No | No | Separately engineered contract |
| Platform support target | 2 business days | 1 business day | 4 business hours | Negotiated |

Response targets are proposed staffing commitments, not guarantees of resolution. Do not promise 24/7 support before staffing it. Security fixes, tenant isolation, staff MFA capability, backups and account recovery are not paid upgrades.

### Existing product readiness

The dashboard's booking, catalogue, orders, tickets, contacts and source configuration have data-backed paths, but this review does not certify end-to-end production operation. General analytics, some campaign/journey/template pages and team settings contain mock or placeholder behavior identified in [route inventory](14-route-inventory.md). Publish availability as `released`, `beta`, `unavailable` or `provider_required` independently of plan eligibility. An Enterprise contract cannot make an unreleased adapter operational.

## 5. Commercial pricing and add-ons

Use the allowance tables to measure costs before publishing prices. No provider costs, customer conversion data or measured per-tenant support cost were supplied, so this plan does not invent validated monthly prices.

For each tier calculate:

`monthly price floor = (AI + delivery subsidy + storage + infrastructure allocation + support + payment overhead) / (1 - target gross margin)`

For example, a hypothetical total direct cost of 600 currency units at a chosen 75% margin requires a price floor of 2,400 units. This is arithmetic, not a price recommendation. Run the calculation at expected and high-percentile usage, including embeddings, discovery, email triage and model fallback costs. Revisit low-cost tiers if full usage is unprofitable.

Proposed add-on units: 1 staff seat, 1 active bot, 1 channel, 1,000 AI credits, 5,000 transactional emails, 10,000 marketing recipients, 5 GB media, 1 location, 1,000 active products. A capacity add-on can enlarge a feature already included; it does not unlock an excluded feature such as marketing on Starter. Publish unit prices, expiry and refund policy alongside the plan.

Monthly subscriptions renew automatically; annual plans pay a separately published yearly price but replenish consumable allowances monthly. Included credits do not roll over. Purchased consumable packs apply after included credits and expire 12 months after purchase under the proposed policy; annual/enterprise contract exceptions must be explicit. No automatic overage at launch. Prepaid top-up or confirmed upgrade is the default recovery path.

Keep SaaS discount codes in a separate billing promotion model. Existing merchant product/restaurant coupons must never change platform subscription prices.

## 6. Counting and capacity rules

- Product count is unique product records across the workspace, not per bot assignment. A product assigned to five bots counts once. Variant/SKU limits prevent thousands of variants hiding inside one product.
- Creating a draft uses retained-product capacity; activation also uses active-product and SKU capacity. Bulk import previews inserted/updated/invalid rows and checks net quota impact transactionally. Updating an existing SKU does not count as a new product.
- A paused bot uses retained-bot capacity but not active-bot capacity. Deleting/recreating a bot does not reset shared monthly usage.
- A seat includes active people and unexpired pending invitations. Invitation acceptance converts a reservation; revocation/expiry releases it. Contacts and platform support staff do not consume tenant seats.
- Datasets/source aliases reused across bots count once. Crawl jobs reserve expected storage and reconcile actual output; reject or pause excess processing safely.
- Storage is measured in bytes; UI displays decimal MB/GB consistently. Compression/derivative accounting is explicit. Transaction records and audit metadata are tracked separately from media.
- AI credits are workspace-wide across web, email, API and channels. Standard answer/draft = 1 credit; any premium/vision multiplier is versioned and disclosed before activation. Retries/fallback calls incur internal cost without duplicate response credits.
- Deterministic button clicks, calendar browsing, human replies and failed AI responses do not consume AI credits. They are still request-rate-limited.
- Contacts reaching capacity: disallow bulk imports, show upgrade, and allow a bounded continuity reserve of 10% (minimum 25) for contacts needed by existing transactions. Stop accepting new orders/bookings before that reserve is exhausted; never lose contact details after confirmation.
- Reservation holds remain 15 minutes; draft order/booking state remains 24 hours. Plan renewal never resets inventory holds or changes confirmed booking capacity.

## 7. Login, credentials and membership lifecycle

### Customer signup/login

1. Use Supabase Auth with verified email and the supported password or passwordless login method. Set redirect URLs explicitly and rate-limit authentication flows.
2. Provision workspace, owner membership and trial subscription atomically and idempotently after verification. A retry must not create a second trial/workspace inadvertently.
3. On login resolve active memberships and selected workspace. Do not use `session.user.id` as the universal client ID.
4. Return current role, permissions, account state and safe entitlement snapshot; never return provider credentials or internal staff roles to the widget.
5. Invited staff accept a hashed single-use invitation bound to verified email and workspace; inviter cannot grant beyond their own authority or bypass seat capacity.
6. Removing a membership revokes that workspace's access, realtime subscriptions and cached views. Other workspace memberships remain valid.
7. Password reset and verified ownership transfer use provider-backed recovery and step-up authentication. Neither tenant admins nor platform staff see passwords.

### Platform staff login

Separate platform staff memberships from workspace roles. `/admin` and `/api/admin/*` require an explicit active staff membership and appropriate permission. Require MFA; Supabase supports assurance-level checks that must be enforced server-side, not just with an MFA setup screen. [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa)

Use roles for platform owner, operations, billing, support, security and read-only analytics. Only platform owner or delegated identity administrators can invite staff. Eliminate ambiguous legacy `users.role = admin` defaults after auditing existing accounts. Every support access session records real staff actor, tenant scope, case/reason and expiry; no shared admin password or customer-token impersonation.

### Integration and API credentials

Store SMTP/provider secrets encrypted on the server and expose masked metadata. Prefer OAuth where supported; otherwise use dedicated provider/app credentials, not the customer's dashboard password. Separate callback verification secrets from outbound tokens. Bind OAuth state to workspace, integration and initiating member, with expiration and replay prevention.

API keys are shown once, stored as a secure hash, scoped to workspace/permissions, expirable and revocable. Store prefix and last-used metadata. Rotation can permit a short overlap window; revocation must take effect independently of subscription cache TTL. Service-role Supabase keys must never reach the browser.

## 8. Enterprise account mechanism

Enterprise begins with qualification, technical capacity review, signed commercial terms and approved provisioning. Contract fields include workspace scope, plan version, every resource limit, included usage, add-on rates, payment terms, renewal dates, overage cap, support hours, service targets, integration requirements and data lifecycle.

Store a contract record and immutable effective versions, plus `enterprise_entitlements` or standard entitlement overrides linked to that version. Quotes are not active grants. Activate on the agreed paid/approved-credit terms with billing approval; record manual invoice/net-term status separately from card subscriptions.

One billing customer may fund multiple workspaces only after implementing a parent billing-account model. Launch default remains one subscription per workspace. For enterprise pooled usage, define a parent allowance and per-workspace sublimit, reserve both atomically, and prohibit cross-workspace data access just because billing is shared.

SSO requires verified domain ownership and provider configuration, tested account linking, membership policies and recovery procedures. Domain membership alone must not automatically grant platform or tenant admin. SCIM deactivation must revoke access and release seats. Both are roadmap work unless implemented and tested. BYO AI keys, dedicated regions and isolated hosting require explicit adapters, cost/quotas and operational review; they are not a toggle promised by the tier.

Renewal changes create a new effective contract version. Provide a utilization review before renewal and clear consequences of reduced limits. No customer data is deleted to force compliance with a smaller contract.

## 9. One authorization and entitlement decision

For every action evaluate:

```text
Verified actor → workspace membership/capability → resource ownership
  → named permission → operational account state
  → feature release state → subscription entitlement
  → bot configuration/provider readiness → quota reservation
  → domain operation → commit usage + audit + outbox
```

Proposed decision response:

```json
{
  "allowed": false,
  "code": "LIMIT_REACHED",
  "feature": "bots.max_active",
  "limit": 1,
  "used": 1,
  "reserved": 0,
  "resets_at": null,
  "entitlement_version": 12,
  "recovery": "upgrade_or_pause_bot"
}
```

Stable codes include `MEMBERSHIP_REQUIRED`, `PERMISSION_DENIED`, `ACCOUNT_RESTRICTED`, `FEATURE_UNAVAILABLE`, `PLAN_UPGRADE_REQUIRED`, `LIMIT_REACHED`, `PROVIDER_REQUIRED` and `TEMPORARILY_UNAVAILABLE`. Public messages omit commercial/account details; the workspace owner's dashboard receives the recovery action.

Plan entitlements cannot bypass user permissions or safety restrictions. Bot toggles cannot bypass the plan. `src/lib/botCommerceConfig.ts` currently falls back to booking/ordering enabled when configuration is absent or errors; the new subscription check must happen before that compatibility fallback, so a missing table cannot unlock a paid feature.

## 10. Plan storage and technical contracts

Reuse `clients`, `plans`, `subscriptions`, `invoices` and tenant-owned resources; extend them rather than introduce competing subscription tables. Preserve existing client IDs and business relationships.

| Proposed entity | Required contract |
| --- | --- |
| `plan_versions` | Immutable feature/limit definition, version, publication state, effective dates |
| `plan_prices` | Version, interval, currency, integer amount_minor, provider price ID |
| `feature_catalog` | Key, boolean/count/bytes type, release state, enforcement mode, meter definition |
| `subscription_items` | Base plan and add-on quantity, effective dates, provider references |
| `workspace_memberships` | client_id, user_id, role, active status, scopes; unique pair |
| `platform_staff_memberships` | user_id, explicit staff role, approval and active status |
| `entitlement_overrides` | Feature/value, reason, grantor, contract/case, starts/expires |
| `usage_reservations` | Workspace, operation, meter, amount, expiry, reserved/committed/released/unknown |
| `usage_events` | Immutable deduplicated debit/credit entries, source and billing window |
| `usage_balances` | Allowance, consumed, reserved and purchased credit buckets per meter/window |
| `billing_events` | Unique provider/event ID, verified receipt, state, attempts, reconciliation |
| `billing_outbox` | Post-commit notices/cache invalidations/provider tasks with dedupe |
| `enterprise_contract_versions` | Approved terms and explicit limits/price references |
| `email_delivery_operations` | Recipient operation ID, category, integration, provider ID, acceptance/delivery state |
| `sender_suppressions` | Tenant/sender/recipient scope, reason and update source |
| `admin_audit_events` | Actor, tenant, action, redacted change, reason, request ID and outcome |

Example immutable Growth definition (subset):

```json
{
  "plan": "growth",
  "version": 1,
  "features": {
    "commerce.enabled": true,
    "booking.enabled": true,
    "restaurant.enabled": true,
    "campaigns.enabled": true,
    "api.enabled": true
  },
  "limits": {
    "bots.active": 5,
    "products.active": 2500,
    "members.seats": 5,
    "email.transactional.monthly": 5000,
    "email.marketing.monthly": 10000,
    "email.outbound.daily": 2000,
    "ai.credits.monthly": 5000
  }
}
```

All published fields are schema-validated. Required fields missing from a plan cause publication failure. Unknown feature keys never grant access. Contract overrides use the same typed registry. Avoid using `-1` or null as an undocumented unlimited value.

### Database authorization

Membership-based RLS must protect browser queries. Service-role operations bypass RLS and therefore need explicit server authorization; RLS alone does not secure those handlers. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

Prohibit browser writes to subscription state, staff roles, quota balances and overrides. Restrict `SECURITY DEFINER` RPC execution and validate workspace/resource ownership inside the operation. Separate user-editable business profile fields from billing/admin-owned client fields. Secure storage and realtime with the same membership model.

## 11. Atomic quota algorithm

1. Authenticate and derive workspace. Assign/reuse a server-validated operation ID scoped to actor and request payload hash.
2. Begin transaction; lock applicable capacity/balance rows in deterministic key order.
3. If the operation already committed, return its recorded result; reject a reused ID with a different payload.
4. Resolve current policy/entitlement version and limits. Reserve every affected bucket together (monthly email, daily email, AI or storage as applicable).
5. Reject if any allowance is insufficient; roll back all reservations. No partial charge.
6. Perform the business write in the same transaction where practical. For external work commit the reservation plus outbox/job first.
7. Worker rechecks suspension/provider state, performs idempotent work, records result and commits consumption; definite failure releases capacity. Unknown provider outcomes enter reconciliation.
8. Reaper handles stale reservations only after checking running-job/provider state. Do not free an in-flight send reservation merely because a timer elapsed.

Redis accelerates reads and rate limits, but PostgreSQL is the durable usage authority. Use unique `(workspace_id, operation_id, meter)` constraints and periodic resource-count reconciliation. A product import touching multiple SKUs calculates and reserves its entire net increase before applying the chosen atomic batch.

## 12. Billing state, changes and access availability

Provider checkout redirects are informational. Grant access from verified payment/subscription state according to published trial/net-term policy. Subscription changes are asynchronous and need webhook handling. [Stripe subscription events](https://docs.stripe.com/billing/subscriptions/webhooks)

Use signed raw-body webhooks, unique event IDs, durable receipt, retries/dead letters and reconciliation. Older events must not undo later state; retrieve canonical provider state when ordering is unclear. Financial effects and entitlement changes have idempotency keys and audit records.

| Event | Entitlement effect |
| --- | --- |
| Trial starts | Fixed 14-day trial, total allowances, no restart by bot deletion |
| Payment confirmed | Activate purchased plan version and correct billing window |
| Paid upgrade | Increase capacity immediately; current monthly allowance becomes new allowance minus existing consumption |
| Scheduled downgrade | At renewal apply selected smaller capacity; preserve retained data, pause excess new use |
| Renewal | Create next usage window once; retain purchased packs until their own expiry |
| Payment failure | Proposed 7-day bounded grace, owner notice and provider recovery |
| Grace expires | Restrict new expensive work; retain continuity/billing/export access |
| Cancellation scheduled | Continue paid access until paid-through date |
| Cancellation effective | Restricted account, reactivation path; not automatic deletion |
| Abuse suspension | Operational denial independent of paid status; recovery payment cannot clear it |

Example: Growth has used 4,000 of 5,000 AI credits, then upgrades to Business with 20,000. Remaining included credits become 16,000 for the same window, not 20,000 or 21,000. Any financial proration preview is separate from credit accounting. Top-ups preserve existing consumption and add a separate dated balance.

Downgrade example: Business has 12 active bots but Growth permits 5. Before the renewal, owner chooses five to remain active. Others pause; history/configuration remains within retained/storage policy. If the owner makes no selection, use a disclosed deterministic selection with advance notices, not random deletion. Existing bookings/orders associated with paused bots remain manageable by staff.

## 13. Exact repository integration work

| Location | Required change |
| --- | --- |
| `src/app/(dashboard)/layout.tsx` | Workspace context provider, safe current entitlements, workspace switching and permission-aware navigation |
| `src/components/layout/sidebar.tsx` | Use release/permission/entitlement state; distinguish upgrade from not authorized |
| `src/middleware.ts` | Explicit staff guard for admin APIs, valid auth; delegate detailed checks to shared services |
| `src/lib/requestAuth.ts`, `auth.ts` | Consolidate identity resolution, membership checks and staff distinction |
| `src/app/api/auth/setup/route.ts` | Atomic owner membership/trial provisioning, preserve legacy clients |
| Bot create/edit routes and `bots/new`, `bots/[id]/edit` | Active/retained bot checks; intersect feature toggles with entitlements |
| `src/lib/botCommerceConfig.ts` | Apply entitlement policy before legacy allow-all fallback |
| `src/app/api/commerce/[kind]/route.ts` | Product/SKU quota in imports/creates, role checks on stock/order mutations |
| `src/app/api/features/[kind]/route.ts` | Service/location/table/offer quotas, per-kind permissions and continuity handling |
| `src/app/api/chat/*`, `/api/v1/chat`, channel routes | Unified public session scope, workspace/bot availability, AI/media metering |
| `src/lib/gemini.ts`, offering discovery/enrichment and email triage | Central cost instrumentation, response/draft credits and internal token ledger |
| `src/app/api/knowledge/upload`, datasets/crawl/source APIs | Byte/job reservation, existing record update versus new-resource counting |
| `src/app/api/integrations/*` | Connection/mailbox limits, secret vault, verified ownership and redacted reads |
| `src/app/api/bots/emails`, QStash email workers | Transactional/marketing category, recipient reservations, sender readiness and suppression |
| Booking notification cron and all email send functions | Same delivery gateway; no direct send path bypassing quota |
| WhatsApp workers / Meta / SMS adapters | Recipient/message metering, provider-specific restrictions; disabled if adapter unavailable |
| Contacts/segments/import | Contact capacity, role/scoped PII access, bounded continuity reserve |
| Inbox server actions / tickets | Membership scope, no AI charge for human replies; maintain support continuity |
| Campaigns/triggers/journeys | Feature release gate, send permission, quota and recipient consent before dispatch |
| `/api/billing` and new billing routes | Hosted checkout/portal, subscription state, usage, price versions and reconciliation |
| `/api/admin/*` and admin components | Explicit staff scope, workspace 360, entitlements, grants, billing approvals and audit |
| `supabase/*.sql` | Membership RLS, plan versioning, usage ledger/atomic RPCs, grants and data migration |
| Browser caches/realtime | Namespace by tenant/user/version, purge on logout/switch/revocation |

Proposed new modules: `src/lib/saas/context.ts`, `permissions.ts`, `entitlements.ts`, `usage.ts`, `availability.ts`; `src/lib/billing/provider.ts`, `events.ts`, `reconcile.ts`; `src/lib/messaging/deliveryGateway.ts`. These are proposed paths, not existing files.

Avoid scattering `if (plan === 'growth')` throughout components. All tiers use the feature registry and effective policy. Widget cards can render quickly from safe cached availability, but confirmation/sending always revalidates on the server.

## 14. Customer UI and admin controls

### Customer dashboard

Add Settings → Plan & Billing, Usage, Team & Access, Security and API Credentials. Plan & Billing shows allowance matrix, current interval/currency, upcoming renewal, provider-hosted payment update, invoices, change preview and cancellation. Usage shows each meter's used/reserved/remaining/reset date and top-up option.

On Create Bot display `1 of 1 active bots`; on product import preview `120 new + 30 updates; 100 new slots remaining`. Prevent the mutation server-side and explain how to pause/archive/upgrade. Do not block unrelated navigation behind a full-page paywall. At 70/90/100% send deduplicated owner notices.

Feature states: available; upgrade required; no permission; provider setup required; temporarily unavailable; unreleased. Each has its own UI message. A financial restriction should not be shown to the merchant's public chatbot visitors.

### Admin control plane

Plan Catalog: draft/edit/publish immutable versions, price mappings, limits, add-ons, trial policy, release gates and publication validation. Preview differences and affected subscriber count before publishing.

Workspace 360: subscription state, inherited plan values, effective allowances, consumption, pending operations, provider status and member scope. Support can inspect masked summaries; billing staff can manage subscriptions; only delegated operations roles can grant limits.

Overrides: increase/decrease one entitlement with reason, expiry, approval and customer notice. Never edit a usage counter silently; use auditable adjustment events. Overrides cannot override global abuse restrictions or grant unreleased features.

Credential controls: reconnect/rotate/revoke and view last use; no reveal-password button. Support sessions are scoped, time-limited and logged. Security suspension, financial grace and product maintenance have separate controls.

Enterprise console: contract version, quote/invoice state, explicitly negotiated allowance matrix, renewal reminder, pooled usage if implemented, dedicated rollout and support commitments. Customer-facing effective plan matches the approved contract, not a free-text note.

## 15. Availability and degraded-mode rules

Subscription eligibility is not infrastructure availability. Effective execution depends on released feature, role, account state, quota, bot setup and healthy provider.

If the AI pool is exhausted, preserve deterministic order/booking status and human handoff. If email quota is exhausted, hold new nonessential sends and notify the owner; a separately bounded continuity buffer of 50 Starter / 250 Growth / 1,000 Business transactional sends per window may complete already-confirmed transaction notices. This buffer is not sold as included marketing capacity and is audited. Stop new commitments if essential delivery cannot be supported.

At billing restriction preserve existing-order fulfillment, confirmed booking changes, ticket evidence, owner billing recovery and export. At security suspension stop public execution and outbound automation; permit only approved investigation/recovery. Cleanup, reconciliation and hold expiry continue in both states.

Use entitlement snapshots with a proposed 60-second cache and versioned invalidation. Sensitive writes recheck current policy; a suspension cannot wait for cache expiry. Provider outage preserves a known paid period under bounded grace. No valid entitlement snapshot means no new costly operation, with a friendly retry message.

## 16. Rollout and acceptance criteria

1. Inventory all resource creation, upload, model generation and outbound send entry points. Associate a permission, feature and meter with each.
2. Migrate identity/membership and close admin authorization gaps first. Preserve every existing `clients.id` and ownership relation.
3. Build typed plan catalog and sandbox billing. Pin legacy accounts to an explicit temporary migration plan with an expiration/review date; do not unexpectedly charge or suspend them.
4. Meter in shadow mode and reconcile with rows/provider logs. Calibrate allowances and commercially approve prices.
5. Enable limits for internal workspaces, then paid pilot customers. Introduce self-service and operator controls together.
6. Publish only released features and tested provider capabilities. Roll back enforcement using a scoped temporary policy change with audit, not destructive data migration.

Acceptance examples:

- Starter cannot activate a second bot through UI, forged API request, clone or concurrent creation.
- Linking the same product to more bots does not count twice; adding variants respects SKU quota.
- CSV import reports updates versus inserts and cannot partially exceed reserved capacity.
- Growth emailing 2,000 recipients consumes 2,000 sends; retry consumes zero additional sends for accepted operations.
- AI email drafting consumes disclosed AI credits, not send allowance; sending a draft consumes only the send allowance.
- Queued campaign rechecks suppression, account state and quota at execution.
- Owner cancellation leaves actual merchant orders and inventory unchanged.
- Portal/webhook replay cannot grant duplicate credits or restore a fraud-suspended account.
- Staff role change or workspace switch cannot leak cached tenant data.
- Enterprise contract downgrade/expiry follows explicit limits and continuation rules.
- Every administrator grant, refund, suspension and credential rotation has actor, reason and traceable outcome.

## 17. Final decisions required before commercial publication

Approve measured-cost prices, tax/currency/provider setup, annual discount, add-on prices, support staffing commitments, provider fee disclosures, trial terms and contractual retention. The quantities above are the complete proposed starting configuration; pricing and enterprise contracts remain business approvals. Writing this plan does not create checkout, roles, quotas or any live subscription enforcement.

Evidence reviewed: dashboard feature hub; bot editor/assignment design; workspace integration fields and mailbox policies; `botCommerceConfig.ts`; `retention.ts`; authentication/middleware, billing and admin routes; Supabase auth/billing/security/booking/commerce migrations inspected for the companion plan. No live Supabase or billing account inspection was performed.
