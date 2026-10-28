# SaaS launch plan: platform administration, subscriptions and access control

Reviewed: 18 October 2026. Status: proposed implementation specification, not implemented functionality.

This plan applies to the customer product in `src/app/(dashboard)`, its shared components and services, the existing `/admin` scaffolding, and the Supabase migrations. It defines how to turn the current product into a subscription SaaS with an operator control plane. Repository inspection establishes code behavior; it does not establish which migrations or policies are deployed in a live Supabase project. No production database was queried for this document.

## 1. Executive design decisions

1. Keep the customer dashboard and platform administration as separate permission domains. A customer's workspace administrator must never become a platform administrator.
2. Keep `clients.id` as the workspace identifier to preserve existing bookings, bots, contacts and orders. Stop requiring it to equal the signed-in user's ID.
3. Introduce workspace memberships and explicit permissions. Authenticate users with Supabase Auth; authorize every operation in server handlers and database policies.
4. Use a versioned plan catalog, subscription ledger, entitlements and atomic usage accounting. A hidden navigation item is not access enforcement.
5. Use hosted subscription checkout and billing management. Choose one billing provider for launch; store provider identifiers behind an adapter.
6. Apply administrative restrictions to the dashboard, public widget, API clients, provider callbacks and background workers through the same policy service.
7. Preserve existing customer obligations during billing restrictions: paid orders, confirmed reservations, ticket evidence and human support need explicit continuation rules.
8. Launch only data-backed features. Remove production mock fallback data or clearly label separate demos.

## 2. What exists and what must change

| Evidence in repository | Current behavior | Launch requirement |
| --- | --- | --- |
| `src/app/(dashboard)/layout.tsx` | Loads `clients` using session user ID | Resolve verified active workspace membership; add workspace switcher |
| `src/middleware.ts` | Verifies auth, checks selected resource ownership, treats `admin`/`super_admin` as platform roles | Separate platform roles; authorize every handler, server action and RPC; explicit `/api/admin/*` guard |
| `supabase/003_saas_auth.sql` | Organizations/users; legacy user role defaults to `admin` | Remove dangerous default; audit historical admins; use explicit staff invitations |
| `src/app/api/auth/setup/route.ts` | Normally provisions owner; allow-listed email can provision super admin; client ID equals user ID | Transactional, idempotent workspace provisioning; controlled platform staff enrollment |
| `supabase/048_security_hardening.sql` | Replaces several read-all policies with `client_id = auth.uid()` and scopes API keys | Migrate policies to membership checks, including field-level write restrictions |
| `src/app/api/admin/usage/route.ts`, `revenue/route.ts` | Service-role aggregate queries without handler-level platform authorization | Launch blocker: reject tenant accounts and unauthenticated callers before global reads |
| `src/app/admin/layout.tsx` | Existing operator shell; local comment leaves role verification to other layers | Reuse UI shell, add server-side role/MFA checks and scoped operator permissions |
| `supabase/016_billing_notepad.sql` | Basic plans, one subscription per client, invoices and Stripe IDs | Extend existing tables with versions, provider state, currency, billing periods and entitlement projection |
| `src/app/api/billing/route.ts` | Reads subscription/invoice rows | Add checkout, billing portal, subscription mutations, signed webhook processing and reconciliation |
| Search for `bot_limit`, `message_limit`, `channel_limit` | Limits appear in schema/billing UI; no comprehensive shared enforcement found | Enforce limits before resource creation and expensive work across every channel |
| `src/app/api/settings/team/route.ts` | Returns mock agents/departments; POST echoes input | Real invitations, membership lifecycle, permissions and licensed-seat checks |
| Booking/commerce migrations 051–066 | Tenant-owned business records, RPCs and richer feature configuration | Put entitlement and tenant checks around these existing domain operations |
| `supabase/055_retention_policy.sql` | 3/30/90-day transcript setting; separate draft/hold/ticket policies | Preserve purpose-specific retention; do not confuse cancellation with deletion |

The current middleware does not by itself prove admin API isolation: authenticated tenant requests to `/api/admin/usage` and `/api/admin/revenue` are not assigned a platform-role rejection by the inspected resource-check logic. Validate this in staging and fix before exposing operator data.

RLS exists today, so access control is partial rather than absent. Early broad policies in migration 016 are narrowed by migration 048; inspect effective deployed policies instead of reporting historical SQL as the current live configuration.

## 3. Target architecture

```text
Customer dashboard        Operator dashboard        Public widget/channels
        |                         |                          |
        +---------- authenticated API / channel identity ----+
                                  |
                    RequestContext + authorization
                                  |
                 Workspace status + entitlement policy
                                  |
                     Atomic resource/usage reservation
                                  |
             Existing bots / knowledge / booking / commerce /
                    contacts / tickets / campaign services
                                  |
                 Supabase transactions + audit + outbox
                                  |
                   Workers / providers / realtime

Billing provider → signed event inbox → subscription projection
                                        → entitlements/version
                                        → cache invalidation
                                        → customer/admin notice
```

Start as a modular Next.js application with PostgreSQL, Redis and existing QStash workers. Microservices are not required for launch. Separate authorization, billing and usage modules so they have one implementation used by all routes.

## 4. Identity, workspaces and ownership

### Identity model

- `auth.users`: login identity, verified email and MFA factors.
- `clients`: workspace/business account; existing IDs stay stable.
- `workspace_memberships`: user-to-workspace relationship, role, status and optional resource scope.
- `workspace_invitations`: hashed one-time invite token, email, role, expiration, inviter and acceptance state.
- `platform_staff_memberships`: explicitly authorized employees/operators, separate from tenant membership.
- `contacts`: the merchant's customers; these are not dashboard users and do not consume employee seats.

A user may belong to several workspaces. Every request includes a selected workspace reference, which the server validates against membership. Never trust a client-supplied workspace ID alone. A user's suspension can be global; removing a membership affects only that workspace.

Keep `organizations` as legacy grouping during migration. Do not create a second competing tenant authority. Multi-workspace agency billing can be a later layer; launch subscriptions belong to one workspace.

### Workspace lifecycle

Store operational state separately from billing state:

`provisioning → active → restricted → suspended → deletion_pending → deleted`

Provisioning failures have a retryable error state. Restoration from restricted/suspended requires authorized action and an audit event. Billing state can remain active during an abuse suspension, and fixing payment must not undo an abuse restriction.

Account actions include create/invite owner, resend verification, retry provisioning, change contact details, transfer ownership, revoke sessions, remove member, restrict features, suspend/resume, schedule export and deletion. Never display passwords or allow staff to set a password for the user; issue account recovery through the authentication provider.

Ownership transfer requires verified acceptance by the new owner, fresh authentication by the current owner and an atomic membership update. A workspace cannot lose its last active owner. Removing an owner does not delete the workspace.

## 5. Roles and permissions

### Platform staff roles

| Role | Allowed scope | Prohibited by default |
| --- | --- | --- |
| Platform owner | Staff administration, policy, emergency controls | Unlogged customer-data access |
| Operations administrator | Workspace lifecycle, provisioning, integration health, limits within delegated bounds | Payment refunds, platform-role grants |
| Support specialist | Platform cases, masked tenant diagnostics, approved support access | Secrets, billing mutation, mass export |
| Billing specialist | Subscription operations, invoices, approved credits/refunds | Conversations, provider secrets, bot prompts |
| Security operator | Security incidents, sessions, suspension, audit | Commercial plan editing, routine content access |
| Read-only analyst | Aggregated operational/business metrics | Customer PII, writes, raw transcripts |

Require MFA for platform staff and step-up authentication for privileged actions. Supabase exposes authentication assurance levels for MFA enforcement; verify the required level server-side. [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa)

### Customer workspace roles

| Capability | Owner | Workspace admin | Agent | Booking/commerce operator | Analyst | Billing manager |
| --- | --- | --- | --- | --- | --- | --- |
| Workspace and team management | Full | Delegated, excluding owner transfer | No | No | No | No |
| Bot/knowledge/source configuration | Yes | Yes | No | No | Read metrics | No |
| Inbox and ticket handling | Yes | Yes | Assigned scope | Optional scoped grant | Aggregates | No |
| Bookings/orders/inventory | Yes | Yes | Read linked support context | Assigned locations/services | Aggregates | No |
| Contact profile editing | Yes | Yes | Limited support fields | Linked transaction fields | No | No |
| Campaign creation/send | Yes | Explicit grant | No | No | Reporting only | No |
| Subscription/payment management | Yes | Explicit grant | No | No | No | Yes |
| Export customer data | Explicit permission | Explicit permission | No | No | No | Invoices only |
| Delete workspace/transfer owner | Yes, step-up | No | No | No | No | No |

Implement named permissions such as `bots.write`, `inbox.reply`, `tickets.assign`, `bookings.manage`, `inventory.adjust`, `contacts.export`, `campaigns.send`, `integrations.manage`, `billing.manage`, `members.invite` and `workspace.delete`. Role templates map to permissions; resource scopes optionally restrict bot, branch, service, team or assigned conversation. Start with fixed templates; add custom roles after enforcement is proven.

### Enforcement contract

Proposed server interface:

```ts
type RequestContext = {
  actorId: string;
  actorType: 'user' | 'platform_staff' | 'api_key' | 'widget' | 'job';
  workspaceId: string;
  membershipId?: string;
  requestId: string;
};
// Server-derived context; browser input cannot grant privileges.
requirePermission(context, 'inventory.adjust', resource);
requireEntitlement(context.workspaceId, 'commerce.inventory');
```

Apply checks at HTTP handlers, server actions, scheduled jobs and domain services, with database policies as another enforcement layer. Default deny and check each request, including nested resources and bulk requests. [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

Permission, account state, entitlement and quota are separate decisions. Purchasing a tier never grants a user a role; a workspace admin cannot enable a feature that the subscription lacks.

## 6. Supabase authorization design

1. Create indexed membership predicates for active workspace membership and named permission checks.
2. Replace direct-user tenant policies with membership-based `USING` and `WITH CHECK`. Child records inherit scope from a verified parent or carry a validated tenant ID.
3. Add composite uniqueness/foreign-key constraints where appropriate so an order item, bot assignment or ticket link cannot reference another tenant's record.
4. Restrict financial, membership, staff-role, quota and account-status fields to server mutations. Row ownership alone must not allow users to change their own entitlement or suspension state.
5. Review grants, RLS, storage policies, realtime subscriptions and every `SECURITY DEFINER` function. Restrict function execution, fix search paths and validate ownership within privileged operations.
6. Use user-scoped database clients for ordinary reads when possible. Centralize service-role access behind authorized server services.
7. Public widget sessions receive signed, scoped capabilities bound to workspace, bot and session. Public bot IDs and CORS do not authorize contact/order access.
8. Provider callbacks resolve workspace from verified integration records; payload tenant IDs are not trusted. Jobs use validated job scope and recheck status before performing side effects.

Supabase service-role credentials bypass RLS, making application checks essential on privileged clients. [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security)

Membership removal and suspension revoke effective access immediately through current-state checks, policy versions and realtime/session disconnection. Long-lived JWT role claims alone are insufficient. Cache identity metadata briefly, but re-read current authorization for privileged writes.

## 7. Admin panel navigation and screens

Proposed routes extend the existing `/admin` shell; they are not existing implementation claims.

| Screen | Required content and controls |
| --- | --- |
| `/admin` overview | Active/trial/restricted workspaces, MRR by currency, overdue invoices, usage cost, incidents, queue age, provisioning failures |
| `/admin/workspaces` | Search business/owner/ID/domain; filter tier, state, billing, signup, health; audited CSV export with PII permission |
| `/admin/workspaces/[id]` | Account 360 with tabs described below |
| `/admin/users` | Identity, verification, workspace memberships, MFA status, session revocation, invitations; no password visibility |
| `/admin/plans` | Versioned tier catalog, prices, feature bundles, limits, trial settings, add-ons, publication and grandfathering |
| `/admin/subscriptions` | Provider/local state comparison, upcoming renewal, scheduled changes, cancellation and recovery |
| `/admin/invoices` | Provider invoice links, currency/tax breakdown, payment history, credit notes/refund workflow |
| `/admin/usage` | Tenant/bot/channel resource usage, remaining limits, spend, trends, anomalous usage, reconciliation |
| `/admin/support` | SaaS customer cases, severity, assigned team, related incident, SLA, activity and communications |
| `/admin/integrations` | Tenant/provider connectivity, last successful sync, expiring credentials, replay and disable controls |
| `/admin/jobs` | Outbox, failed jobs, notification backlog, dead letters, retry/cancel with idempotency |
| `/admin/security` | Staff accounts, suspicious access, API-key revocation, session controls, abuse restrictions |
| `/admin/audit` | Filter actor/workspace/action/time/request; redacted before/after, reason, approval and export |
| `/admin/releases` | Feature flags, cohort rollout, tenant overrides, kill switches, migration compatibility |
| `/admin/settings` | Platform branding, transactional notices, default policies, support contact and approved provider configuration |

### Workspace detail layout

Header: business name, workspace ID, owner contact, operational state, current tier, billing state and last activity. Persistent warning ribbon identifies suspension or support-access session.

Tabs:

- Overview: onboarding completion, usage, integrations, incidents and risk signals.
- Members: role/scope assignments, pending invites, seat count, last activity, revocation.
- Subscription: current version, billing period, payment state, invoices, renewal and change preview.
- Entitlements: inherited plan values, add-ons, overrides, effective limits and override expiry.
- Bots/channels: list, enabled features, health, disable/reactivate; access to content only through support permission.
- Product resources: counts and scoped links for services, bookings, catalogue, orders, contacts and tickets.
- Integrations: masked identifiers, status, sync errors and reconnect workflow; never reveal stored tokens.
- Usage/cost: meter breakdown, included allowance, reserved/consumed amounts and spend cap.
- Cases/incidents: SaaS issues linked to the workspace; distinct from the merchant's customer tickets.
- Audit/security: administrative changes, auth events and access sessions.
- Data lifecycle: retention settings, export progress and deletion schedule.

Dangerous actions use a dedicated action drawer with affected resources, reason, consequences and confirmation. Bulk suspension, deletion and financial credits are queued operations with per-target results and approvals; no arbitrary SQL editor in the admin UI.

### Support access

Use a time-limited, workspace-scoped support session, initially read-only, with reason and case ID. Preserve the staff actor identity in every request; do not issue the customer's login token. Display a banner and log start/end/actions. Consent or a documented emergency policy governs transcript access. Mutating support sessions require an additional grant and cannot change ownership, billing identity or staff permissions. Expire after 30 minutes by default.

## 8. Proposed subscription tiers

These are starting product assumptions, not claimed industry norms or approved commercial prices. Validate limits and prices using measured AI, storage, delivery and support costs before publication. Do not promise unlimited AI or messaging.

| Included resource | Trial (14 days) | Starter | Growth | Business | Enterprise |
| --- | --- | --- | --- | --- | --- |
| Workspaces per subscription | 1 | 1 | 1 | 1 | Contract |
| Active bots | 1 | 1 | 5 | 20 | Contract |
| Active/pending staff seats | 2 | 2 | 5 | 15 | Contract |
| Active channel connections | 1 web | 2 | 5 | 15 | Contract |
| Monthly AI response credits | 100 total trial | 1,000 | 5,000 | 20,000 | Contract |
| Knowledge storage, processed | 100 MB | 500 MB | 2 GB | 10 GB | Contract |
| Media storage | 250 MB | 1 GB | 5 GB | 20 GB | Contract |
| Live source connections | 1 | 2 | 10 | 30 | Contract |
| Active catalogue products | 25 | 250 | 2,500 | 10,000 | Contract |
| Active booking services | 2 | 5 | 25 | 100 | Contract |
| Locations | 1 | 1 | 5 | 20 | Contract |
| Contacts stored | 100 | 2,000 | 20,000 | 100,000 | Contract |
| Support inbox, tickets, RAG | Yes | Yes | Yes | Yes | Yes |
| Basic booking and commerce | Yes | Yes | Yes | Yes | Yes |
| Restaurant table allocation / advanced offers | Evaluation | No | Yes | Yes | Yes |
| Campaign automation | Preview only | No | Yes, metered | Yes, metered | Contract |
| Advanced feature analytics | Evaluation | Basic | Yes | Yes | Yes |
| API access / outbound webhooks | No | No | Scoped | Scoped | Contract |
| SSO / custom contract / region choice | No | No | No | Later add-on | Only once implemented |

All tiers keep access control, tenant isolation, backups and core security. All preserve the currently supported 3/30/90-day transcript choices and separate ticket retention; do not silently reduce existing retention on downgrade. Provider channel fees, bulk email/SMS and additional AI credits have explicit separate pricing. BYO credentials do not remove abuse limits or platform resource quotas.

Add-ons: seats, AI credits, storage, connections and locations. Each add-on has a price version, effective date and explicit meter. Billing promotions must live separately from merchant checkout coupons (`coupons`), so a restaurant's discount code cannot discount its SaaS bill.

Pricing procedure: collect a staging/pilot cost ledger, calculate per-tier cost at expected and high-percentile usage, add support/infra costs, then set prices against a chosen margin target. Revenue reports normalize annual recurring fees to monthly, separate tax/one-off credits, and group currencies rather than adding incomparable amounts.

## 9. Entitlement and quota system

Store feature keys rather than hard-coded plan-name branches:

`bots.max_active`, `members.max_seats`, `channels.max_connections`, `ai.response_credits`, `knowledge.bytes`, `media.bytes`, `sources.max_connections`, `commerce.enabled`, `commerce.max_products`, `booking.enabled`, `booking.max_services`, `restaurant.enabled`, `locations.max_active`, `contacts.max_records`, `campaigns.enabled`, `email_automation.enabled`, `api.enabled`, `exports.enabled`.

Effective access requires: platform safety policy allows action, workspace operational state allows action, user permission allows action, feature is entitled, bot configuration enables it where relevant, and quota reservation succeeds.

Compute entitlements from pinned plan version + active add-ons + time-bounded audited overrides. Define override precedence per key; global safety denials always win. An override records actor, reason, case ID and expiration. Grace periods never create unbounded quota.

### Meter semantics

- AI credits: one completed customer-visible AI answer at the standard model multiplier; premium/vision multipliers published before use. Tool/model retries are cost events but not duplicate customer charges.
- Structured button clicks, browsing a card, human replies and model failure messages consume no AI credit; they still have abuse/request limits.
- Outbound messages: count one accepted billable provider submission per recipient, retaining provider delivery IDs and retry deduplication. Provider billing differences must be reconciled.
- Knowledge/media storage: measured bytes at rest, including counted derivatives; reserve capacity before upload/ingestion and reconcile after processing.
- Seats: active members plus unexpired pending invitations; acceptance converts reservation instead of charging twice.
- Products/bots/services/connections: active resource gauges, with archived records excluded from active limits but retained in storage totals.
- Contacts: stored tenant records, deduplicated through canonical contact identity; incoming transactional contacts must have a bounded continuity buffer instead of silently losing paid-order details.
- Bookings/orders: operational throughput metrics at launch, not a success fee. Rate-limit creation for abuse independently of inventory/capacity rules.

Use a unique `(workspace_id, operation_id, meter_key)` ledger key. Reserve before starting work, commit on verified success, release on failure, and reconcile expired reservations. PostgreSQL transactions and uniqueness enforce correctness; Redis is a fast cache, not the financial ledger. At the final available credit, two concurrent requests must not both proceed.

Define annual-plan usage as monthly allowance windows anchored to subscription start, independent of annual invoice interval. Upgrades grant only the additional allowance for the current window according to the published policy; they do not reset consumed usage. Store window boundaries in UTC; timezone display does not change billing periods.

Alert owners at 70%, 90% and 100%. Default to hard caps for new costly work; offer prepaid top-ups or explicitly opted-in overage with a spend ceiling. No automatic surprise overage.

## 10. Billing lifecycle and failure handling

Choose a provider only after confirming merchant-country onboarding, supported recurring payment methods, settlement currency and operational fit. Existing Stripe-shaped columns make Stripe a reasonable integration candidate, not a confirmed production choice. Keep another gateway behind the same adapter if business eligibility requires it; do not implement two billing engines at launch.

Provider interface: create customer, create hosted checkout, create billing portal session, preview/change subscription, schedule cancellation, issue approved credit/refund, verify webhook, retrieve canonical subscription/invoice and reconcile.

Hosted checkout reduces handling of payment details. Never store card numbers/CVV. Server maps published plan-price IDs; the browser cannot submit arbitrary prices, entitlements or a provider customer belonging to another workspace.

### Acquisition and renewal

1. Verify identity and create workspace/membership transactionally.
2. Assign limited trial entitlements with fixed start/end; one-time trial eligibility prevents restart abuse.
3. Owner chooses published price and sees limits, total, taxes where applicable and renewal/cancellation terms.
4. Create checkout with idempotency and server-generated workspace/customer metadata.
5. Checkout return page displays pending verification; it never grants paid access by itself.
6. Signed provider events update durable subscription state, derive entitlements and notify the workspace.
7. Reconcile scheduled renewals, failed payments, cancellation and drift against provider state.

Subscriptions change asynchronously, including renewals and payment failures, so webhook processing is part of billing correctness. [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)

| Local billing access state | Proposed product behavior |
| --- | --- |
| Trialing | Trial allowances until fixed expiry |
| Initial payment pending/incomplete | Trial or setup access only; no paid-tier grant |
| Active, current paid period | Purchased entitlement version |
| Past due, first renewal failure | Notify owner, provider retry; proposed 7-day bounded grace |
| Grace expired / unpaid | Restrict new billable automation; retain billing, export and continuity access |
| Cancel scheduled | Access until paid-through date; banner and undo where provider supports it |
| Canceled / trial expired | Restricted workspace and reactivation route, no automatic deletion |
| Provider paused | Explicit policy; distinguish paused subscription from paused payment collection |
| Dispute/fraud review | Security/billing case, separate operational restriction; payment event cannot clear it |

Seven days is a proposed business policy and must be published. Upgrades preview proration and require confirmed payment before added capacity; downgrades normally take effect at renewal. Show conflicting resources first and let the owner choose which remain active. Never automatically delete excess bots, products, contacts or bookings.

Refunds and credits have explicit permissions, thresholds, reason and idempotency. A refund is not equivalent to canceling a subscription. Treat SaaS refunds separately from a merchant refunding a customer's purchase. Keep immutable invoice history and provider adjustments rather than editing paid invoice totals.

### Webhook reliability

Verify signature over the raw body, record the event uniquely, acknowledge after durable receipt, process asynchronously, and track attempts/dead letters. Duplicates are harmless. Retrieve current provider state or apply monotonic version checks to avoid older events undoing a later cancellation. Reconciliation recovers missed events and shows drift in admin.

Provider events can be duplicated or delivered out of order; the receiver must handle both. [Stripe webhook documentation](https://docs.stripe.com/webhooks)

Use an outbox for entitlement invalidation and notifications after database commit. A provider outage should preserve the last verified paid period and bounded grace, not mark everyone unpaid or grant indefinite paid access. Fail closed for new expensive operations when no valid entitlement snapshot exists.

## 11. Suspension and business continuity

| Reason | Stop | Continue under explicit policy |
| --- | --- | --- |
| AI credit exhausted | New model-generated answers | Deterministic status, existing ticket access, human support; bounded public requests |
| Renewal delinquency | New campaigns, new expensive ingestion/automation after grace | Billing recovery, export, existing-order fulfillment, confirmed booking management |
| Merchant-requested pause | New bookings/orders if configured | Existing transactions, cancellations, notices and evidence |
| Abuse/security suspension | All risky external sends and public bot execution | Owner billing/support page; staff investigation; queued work quarantined |
| Provider-specific failure | Affected channel/provider tasks | Healthy channels and dashboard access |
| Deletion pending | New work and credentials use | Authorized export until deadline, status visibility |

Recheck policy at worker execution, not only when a job is queued. Preserve verified inbound callbacks in a restricted queue where needed for accounting, but prevent new automated sends. Inventory holds must still expire and cleanup jobs must still run. Never cancel real bookings or mark orders refunded solely because SaaS billing failed.

For public visitors show a short neutral unavailable/contact-business message; do not reveal that the merchant is delinquent or suspended. Tenant owners see the actionable reason and recovery path.

## 12. Integration map for every product area

| Existing area | Authorization / entitlement hook | Admin control and accounting |
| --- | --- | --- |
| Bots, create/edit, bot assignments | `bots.write`, max active bots, linked-resource ownership | Disable/publish, feature policy, audit configuration |
| Knowledge, upload, crawl, chunks, FAQs | `knowledge.write`, byte/job quota before ingestion | Reindex/retry, ingestion cost/storage, unsafe-source disable |
| Databases and source query/test | `sources.manage`, connection count, lookup permissions | Reconnect, rate/response bounds, masked credentials, source health |
| Widget config/init/chat/flow/sync/media | Signed session scope, bot/workspace state, AI/media quota | Kill switch, domain allow-list, model cost and request monitoring |
| `/api/v1/chat` and API keys | Hashed scoped key, tenant binding, expiry/revocation, rate/quota | Issue/revoke keys, view last used, never reveal old secret |
| Booking/services/offers/slots | `bookings.manage`, booking feature, service/location quotas | Freeze new supply, inspect capacity; preserve committed bookings |
| Restaurant tables | Restaurant feature plus branch scope | Table/turn-time health, allocation failures and configuration audit |
| Commerce catalogue/import/inventory | `products.write` / `inventory.adjust`, active-product/storage limits | Import audit, stock correction reasons, hold expiry |
| Order confirmation/cancellation | Scoped customer verification; commerce entitlement and continuity policy | Transaction audit; prevent repeated mutations on replay |
| Inbox and handoff/server actions | `inbox.read/reply`, assignment scope and current membership | Scoped support sessions, response metrics, no transcript access for billing staff |
| Tickets, attachments, links, CSAT | `tickets.manage`, contact/session capability for customers | SLA/support health; retain evidence independent of chat expiry |
| Contacts/import/export/segments | `contacts.write/export`, consent and record quota | PII masking, audited export, segment membership history |
| Campaigns/journeys/proactive triggers | `campaigns.send`, feature, recipient consent, provider/spend quota | Pause queue, recipient exclusion, send-cost accounting |
| Email bots | Mailbox ownership, automation feature and send budget | Sender verification, draft policy, reconnect/disable |
| WhatsApp/Telegram/Chatwoot callbacks | Provider verification and integration-to-workspace lookup | Channel kill switch, throughput budget, dead-letter handling |
| Integration CRUD/OAuth/store webhooks | `integrations.manage`, limits, tenant-bound OAuth state | Secrets rotation, expiry and webhook verification |
| Feature/ticket/bot analytics | `analytics.read`, scoped data and masked PII | Aggregate platform statistics; no tenant cross-read |
| Templates/coupons/business hours | Named configuration permissions and feature scope | Published version audit; merchant coupons separate from SaaS promos |
| Team/subscriptions/settings | `members.*`, `billing.manage`, workspace-owner actions | Seat reservations, role history, change approval |
| Exports/ERP/notepad | Resource-specific permissions; inherited tenant ownership | Real functionality or hidden navigation until implemented |
| QStash/cron/enrichment/reminders | Verified machine identity, scoped job payload, current policy | Retry/cancel, queue limits, signed jobs, immutable attempts |
| Realtime/local caches | Tenant/user-scoped keys and channel authorization | Revocation, cache invalidation, logout/workspace-switch clearing |

Inventory the full route tree into a machine-checkable permission registry. Each method declares actor types, permission, resource resolver, entitlement key and meter. Unknown routes/methods deny by default; dynamic `[kind]` routes validate an allowed kind and its own permission.

## 13. Proposed data model additions

Extend existing tables where possible. The following names are proposals; migration numbers must be assigned after checking the current branch head.

| Table / change | Essential fields and constraints |
| --- | --- |
| `clients` additions | operational_state, restricted_reason_code, owner_user_id, entitlement_version, deletion_at, policy_version |
| `workspace_memberships` | client_id, user_id, role_id, status, scope JSON, version; unique(client_id,user_id) |
| `workspace_invitations` | client_id, email, role, token_hash, expires_at, accepted_at; single-use atomic acceptance |
| `roles`, `permissions`, `role_permissions` | Separate platform/workspace scope; protected role grants |
| `platform_staff_memberships` | user_id, platform role, status, approved_by; explicit provisioning |
| `plan_versions` linked to `plans` | immutable version, feature map, limits, publication status; no in-place retroactive edit |
| `plan_prices` | plan_version_id, currency, interval, integer amount_minor, provider_price_id, active |
| `subscriptions` extensions | provider, provider IDs, plan version, raw provider status, access state, paid_through, grace_until, scheduled change, sync time |
| `subscription_items` | subscription_id, add-on/seat price, quantity, effective interval |
| `entitlement_overrides` | client_id, feature_key, value, reason, actor, starts_at, expires_at |
| `usage_events` | client_id, operation_id, meter, amount, period, state, source, created_at; unique dedupe tuple |
| `usage_balances` | client_id, meter, window start/end, allowance, consumed, reserved; atomic updates |
| `billing_webhook_events` | provider, event_id, received_at, payload reference/hash, status, attempts; unique(provider,event_id) |
| `billing_adjustments` | invoice/payment reference, credit/refund type, amount_minor, currency, reason, approval, idempotency key |
| `invoices` extensions | currency, amount_minor, tax_minor, provider status, document URL, immutable external ID |
| `platform_cases`, `case_messages` | affected client, requester, severity, category, status, assignee, SLA, incident_id |
| `platform_incidents` | impact, affected providers/tenants, timeline, status, remediation |
| `support_access_sessions` | staff actor, client, scope, reason, case, approval, expiry, revocation |
| `admin_audit_events` | actor, actor scope, client, action, resource, redacted diff, reason, request, outcome, timestamp |
| `outbox_events`, `job_attempts` | dedupe key, target, payload reference, schedule, attempt/error, completed_at |
| `feature_flags` | key, environment, rollout cohort, tenant override, expiry, audit |
| `data_requests` | client, requester, export/delete type, status, deadline, artifact expiry, completed steps |

Use integer minor currency units and explicit currency for billing. Reserve decimal units for nonmonetary quantities when needed. Put private billing/staff/secret data in a non-public schema or deny browser grants. Index membership lookup, active entitlements, due jobs, usage windows and event IDs. Large audit/usage tables need retention and partition/archival plans as volume grows.

## 14. Proposed APIs and customer dashboard additions

| Endpoint group | Purpose |
| --- | --- |
| `GET /api/workspaces/current` | Verified workspace, role, safe entitlement snapshot and usage summary |
| `/api/workspaces/members`, `/invitations` | List/invite/accept/revoke/update role, server-enforced seat count |
| `/api/billing/plans`, `/checkout`, `/portal` | Published prices, hosted purchase and billing self-service |
| `/api/billing/subscription`, `/usage` | Current state, scheduled changes, allowance/usage |
| `POST /api/webhook/billing/[provider]` | Raw signature verification and durable event receipt |
| `/api/admin/workspaces/*` | Operator account directory, detail and scoped actions |
| `/api/admin/plans/*`, `/subscriptions/*` | Version publication, change preview, approved billing operations |
| `/api/admin/support-access/*` | Create/revoke scoped support session |
| `/api/admin/cases/*`, `/incidents/*` | SaaS support and operational incident lifecycle |
| `/api/admin/audit`, `/usage`, `/jobs/*` | Audit, cost, retries and reconciliations |

Customer additions: workspace switcher; real Team page; Billing & Plan; Usage; invoices; upgrade/downgrade preview; payment recovery banner; API-key management; security/MFA sessions; data export/delete request; platform support link. Keep marketing subscription groups separate from the SaaS billing page.

Return consistent errors: 401 unauthenticated, 403 permission/account/feature denial with stable codes, 409 stale-state/conflict, 429 rate/quota exceeded with retry metadata where meaningful, 503 temporarily unavailable. Public-widget messages are sanitized; dashboard owners receive corrective actions. Do not put raw provider errors or credentials in customer responses.

## 15. Reliability, security and launch operations

- Separate development, staging and production Supabase/billing/provider projects. Use fake/sandbox payments in automated tests.
- Store provider secrets in an encrypted server-side vault/secret manager, expose only masked metadata, audit rotation and revoke on disconnect. Review current `clients` credential columns before permitting broad client-row reads.
- Require staff MFA, least privilege, fresh authentication for exports/financial changes, and independent approval for bulk deletion, large credits and privilege grants. Record failed actions too.
- Sign jobs/webhooks, restrict outbound URLs, bound payload sizes, protect against replay and rate-limit per tenant plus global limits.
- Keep request IDs from inbound request through domain mutation, provider call, usage ledger and audit event. Redact PII/secrets from logs and error tools.
- Configure queue backoff/dead letters, provider timeouts, reconciliation schedules and per-provider circuit breakers.
- Proposed initial SLOs: 99.9% monthly core availability, under 60 seconds entitlement convergence in normal webhook operation, 5-minute alert for stalled billing jobs. These are targets to test, not current guarantees.
- Define tested recovery objectives before contracts: proposed 24-hour maximum data-loss window and 4-hour service restoration target for launch; choose backup/PITR capabilities that actually meet them and conduct a restore drill.
- Track AI/provider cost per tenant, queue lag, auth denials, payment drift, ingestion failure, inventory conflict and booking failure. Alert with an owner/runbook, not just a dashboard chart.
- Publish support hours, status page, escalation contacts, acceptable use, privacy/retention and billing/cancellation terms. Jurisdiction-specific tax and contractual requirements need appropriate review before pricing is published.

### Deletion and exports

Cancellation stops renewal; deletion is a separate owner-verified workflow. Proposed deletion cooling-off period: 30 days with clear notice. Export artifacts are encrypted/private with short-lived signed links and audited access. Deletion revokes sessions, keys, integrations and scheduled jobs, then processes database/storage/cache/search/provider copies in a resumable job. Billing records may need separate retention under applicable requirements; document this instead of deleting everything through a cascade. Expired backups follow the published retention schedule; restoring a backup must reapply deletion tombstones.

Current purpose-specific policies remain: browser history 3 days, return drafts 3 days, booking/order drafts 24 hours, inventory holds 15 minutes, server transcripts chosen from 3/30/90 days, closed-ticket retention 365 days. Billing/audit retention is a separate documented policy, not copied from transcript cleanup.

## 16. Incremental migration plan

### Phase A — close authorization gaps

Add explicit platform checks to all admin routes; audit existing `admin` identities and remove ambiguous defaults. Protect server actions, finance/config field writes and credential reads. Build a route permission inventory and cross-tenant regression tests. Exit: ordinary users cannot reach any platform data or change privileged fields through API or direct Supabase access.

### Phase B — memberships and tenant context

Add membership tables, create owner membership for every existing client, preserve IDs and references, and report orphan/ambiguous records for reconciliation. Introduce `resolveWorkspaceContext`; migrate pages and APIs away from `session.user.id === client_id`. Convert RLS and realtime/storage policies together. Keep a narrow compatibility path only for validated existing owners during rollout. Exit: two users can operate in one workspace and one user can switch between two workspaces without leakage.

### Phase C — plans and billing

Version existing plans, map old subscriptions to explicit migration terms, add checkout/portal/webhook inbox, provider adapter and reconciliation. Existing active customers receive a documented grandfathering/transition policy, not an arbitrary downgrade. Exit: full sandbox purchase, renewal, failure, recovery, cancellation and refund scenarios pass.

### Phase D — entitlements and usage

Meter in shadow mode first; compare counters to actual operations and provider cost. Then enable enforcement per cohort and feature. Introduce continuity exceptions, owner alerts and admin overrides. Exit: concurrency/retry tests pass and every costly channel uses the same enforcement service.

### Phase E — operator UI and customer self-service

Build workspace 360, staff permissions, support access, cases, plan management, usage and job tools. Replace mock Team/Billing screens; wire or hide incomplete reporting/templates/campaign controls. Exit: support can diagnose an account without SQL console access or raw secret exposure.

### Phase F — launch rehearsal and gradual rollout

Run migrations against a restored staging copy, reconcile schema/data, simulate provider outages, restore a backup, exercise support runbooks and test account export/deletion. Roll out to internal accounts, then a limited paid pilot, then general availability based on acceptance gates.

Migration rollback must preserve memberships, usage events and invoices already written. Revert application feature flags or deploy a forward fix; never roll back by dropping new financial records. Use additive schema changes and compare old/new authorization decisions before switching enforcement. Do not rerun all historical migrations blindly: reconcile the migration ledger and duplicate legacy files first.

## 17. Required launch acceptance tests

| Scenario | Required result |
| --- | --- |
| Tenant A guesses tenant B's bot/contact/invoice/order IDs | Denied through API, direct table access, storage and realtime |
| Ordinary tenant calls `/api/admin/usage` or `/revenue` | 403, no aggregate data |
| Member changes request `client_id`, role or plan fields | No privilege/tenant change |
| Agent calls hidden export/inventory/billing endpoints | Denied even with a valid session |
| Owner invites two people with one remaining seat | One succeeds; the other gets a limit response |
| Two requests consume the final AI allowance | At most one reservation succeeds |
| Webhook retries or arrives out of order | One financial effect; final provider state wins |
| Checkout success URL is forged | No entitlement activation |
| Worker executes after tenant suspension/member revocation | Rechecked policy prevents prohibited side effect |
| Cached dashboard after logout/workspace switch | No previous workspace data displayed |
| Billing provider down | Valid paid access preserved within policy; alerts and reconciliation scheduled |
| Upgrade payment fails / downgrade exceeds resource caps | No unpaid upgrade; no destructive downgrade |
| Subscription canceled while orders/bookings exist | Existing commitments remain manageable under continuity policy |
| Refund issued twice or callback replayed | One provider refund and one recorded adjustment |
| Staff support session expires | Access denied and session closure audited |
| Team membership removed during active session | Next protected access denied; live channels revoked |
| Tenant export/delete requested | Verified scope, private artifact, complete tracked cleanup |
| Restore from backup | Recovery targets measured and deletion tombstones reapplied |

Required evidence: staging test results, deployed policy/grant inventory, migration reconciliation, billing sandbox event trace, usage reconciliation report, restore report, operator permission review and real pilot flow tests for booking, ordering, support and human handoff.

## 18. Release boundaries and open commercial decisions

Launch requires tenant isolation, real staff memberships, subscription lifecycle, quota enforcement, admin authorization, account recovery, support/operations tooling and truthful UI. Advanced custom roles, SSO/SCIM, reseller hierarchy, multi-region hosting, enterprise contracts and multiple payment gateways can follow once needed; do not sell them as available prematurely.

Before publishing prices decide: merchant legal entity/country, payment provider eligibility, currencies, approved tier allowances/prices, annual discount, trial eligibility, grace policy, overage policy, support commitments, and billing/audit retention. The proposed defaults above allow implementation planning without treating these business choices as already approved.

## 19. Reference sources and evidence boundary

Repository evidence: `src/middleware.ts`; `src/lib/requestAuth.ts`; `src/lib/auth.ts`; `src/app/api/auth/setup/route.ts`; `src/app/api/billing/route.ts`; `src/app/api/admin/{usage,revenue}/route.ts`; `src/app/api/settings/team/route.ts`; `src/app/(dashboard)/layout.tsx`; feature routes and shared dashboard components; Supabase migrations 003, 004, 016, 035, 048, 051–066. See [dashboard route inventory](14-route-inventory.md) for page coverage.

External references inform security and provider integration mechanics, not the proposed prices, quotas or commercial policy: [OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa), [Stripe subscription events](https://docs.stripe.com/billing/subscriptions/webhooks), [Stripe webhook reliability](https://docs.stripe.com/webhooks). Consulted 18 October 2026.
