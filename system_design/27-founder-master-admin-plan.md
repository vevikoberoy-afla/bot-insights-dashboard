# Founder Master Admin — product, UI and implementation plan

Status: proposed implementation plan, based on repository review. This document does not create routes or change live account access.

## 1. Objective and dashboard separation

Create a dedicated founder console for controlling the SaaS business: customer accounts, subscriptions, feature permissions, quotas, staff access, support and platform operations. Customers continue to use their workspace dashboard to run bots, orders, bookings and customer support.

| Experience | Audience | Route / source | Responsibility |
| --- | --- | --- | --- |
| Customer workspace | Your paying clients and their teams | Existing routes under `src/app/(dashboard)` | Their bots, products, bookings, tickets, contacts, integrations and workspace settings |
| Founder Master Admin | You and explicitly appointed platform staff | Proposed `/master-admin`, in `src/app/master-admin` | All SaaS accounts, plans, access, limits and platform operations |
| Existing admin | Existing platform implementation mixed with older screens | `src/app/admin` | Reuse its working control services; migrate navigation and redirect supported old URLs after the new console is verified |

Repository finding: `/admin` already uses `requireStaff()` and platform MFA. It is already intended as platform administration, not the customer's workspace. However, the directory also contains legacy contacts, campaigns, knowledge and per-client product screens. This mixed structure contributes to confusion. The new interface must have explicit founder branding, dedicated entry and no customer-product sidebar.

Use one authoritative subscription and entitlement system. A second dashboard must not introduce a second source of truth for plans or account access.

## 2. Existing code to reuse and gaps to close

| Existing implementation | Reuse | Remaining work |
| --- | --- | --- |
| `src/app/admin/layout.tsx` | Verified staff and MFA entry guard | New founder shell, login return path, distinct identity |
| `src/components/admin/ControlPlane.tsx` | Working mutation forms and basic views | Split into focused pages, proper tables, metrics and clear account workflows |
| `/api/admin/control` | Validated commands and staff permissions | Dedicated aggregate queries, server-side search, narrower read permissions, version checks |
| `src/lib/saas/context.ts` | Verified identity, explicit staff membership | Founder route coverage and reauthentication for sensitive operations |
| `src/lib/saas/catalog.ts` | Feature keys, quota keys and roles | Consistent permission matrix across UI, API and database |
| Migrations 067–069 | Plans, subscriptions, overrides, audit, membership, email ledger | Additive migrations for missing operational entities; complete legacy enforcement coverage |
| `saas_admin_mutate` | Transactional changes with audit records | Before/after snapshots for every target, optimistic concurrency, expanded commands |

The current overview retrieves a page of 50 workspace records. Founder-wide totals must come from aggregate queries, never from counting that page. Existing search is page-local; replace it with server-side search. Existing plan settings and feature switches need a coverage audit across web chat, email, channel adapters, background jobs and direct database paths.

## 3. Founder navigation

```text
Founder Console
  Overview
  Customers
    Accounts
    User identities
    Access requests
  Commercial
    Plans & feature matrix
    Subscriptions
    Enterprise agreements
    Usage & costs
  Operations
    Customer support
    Integrations & channels
    Jobs & failures
    Feature availability
  Security
    Platform staff
    Audit trail
  Platform settings
```

Initial release includes Overview, Accounts, Plans, Subscriptions, Usage, Support, Integrations, Delivery operations, Availability, Staff and Audit. Enterprise agreements, provider cost reporting and general job management are subsequent milestones with real backing data; do not display invented metrics or nonfunctional controls.

## 4. UI system and page layout

Desktop: 240px fixed sidebar; 64px header; fluid content with 24px padding. Sidebar top reads **Founder Console**, with a small **Platform access** badge. Header contains page breadcrumb, global account search, environment label and staff profile/MFA status. No customer workspace switcher in the founder header.

Use an off-white background, white bordered panels, restrained blue actions, 13–14px table text, 12px secondary labels and 24–28px page titles. Use amber for restrictions, red for suspension/failure and green for healthy states, always with text labels. Keep tables dense enough for operational work; long IDs appear only when needed and have copy controls.

At tablet widths collapse the sidebar; on mobile use a navigation drawer and stacked account summaries. Tables retain labeled horizontal scrolling. All dialogs support keyboard focus, Escape, accessible labels and clear confirmation results.

Render the shell immediately with skeletons only in data regions. Load account tabs on demand. Cache non-sensitive lists briefly in memory and invalidate after mutations. Fetch current authorization for every request; never use cached UI permissions to authorize a change. Do not persist customer details or staff tokens in localStorage.

### Overview wireframe

```text
┌ Sidebar ┐  Founder overview                    Date range · Environment
│         │  Accounts   Active subscriptions   Trials ending   Open issues
│         │  ┌ Account growth & conversion ┐ ┌ Attention queue          ┐
│         │  │ Real time-series data       │ │ Expiring trials           │
│         │  │ Clearly labeled intervals  │ │ Quotas / failed deliveries│
│         │  └────────────────────────────┘ └──────────────────────────┘
│         │  ┌ Subscription distribution ┐ ┌ Platform operations      ┐
│         │  └───────────────────────────┘ └──────────────────────────┘
│         │  Recent audited changes · actor · account · outcome · time
└─────────┘
```

Metric definitions: active account means operational state `active`; active subscription means subscription access `active`; trials are counted separately. Show configured recurring contract value separately from collected revenue. Payments remain placeholders, so collected revenue is **Unavailable**, not zero or an inferred figure. Report currencies separately until a defined conversion source exists. Historical charts require snapshots or events; current state alone cannot reconstruct past subscriptions.

## 5. Account registry and account detail

Account registry columns: business name, owner email, account ID, plan/version, subscription state, operational state, highest usage percentage, creation date, last activity and actions. Search by business, email or ID; filter by plan, state, trial expiry and creation interval. Use stable server pagination and total counts.

Row actions: View account, Change plan, Adjust access, Restrict, Suspend, Restore. The primary action opens the account detail. Bulk actions show the exact selected accounts and per-account outcomes; they do not accidentally target every result across pages. Start with read/export selection; add bulk mutations after single-account flows are verified.

Account detail header: business name, owner contact, account ID copy button, operational badge, subscription badge and plan. Place safe actions at the right; suspension and closure in a labeled action menu.

Tabs:

| Tab | Content and founder actions |
| --- | --- |
| Overview | Business profile, lifecycle dates, current plan, usage summary, internal notes, recent events |
| Subscription | Assign plan version; extend trial; set grace expiry; schedule change; show billing placeholders |
| Features & limits | Effective feature matrix, numeric quotas, source of each value, expiring overrides, restore inherited value |
| Users & access | Owner, members, roles, invitations, revoke membership; verified ownership-transfer workflow |
| Bots & resources | Counts and health of bots, products, services and channels; scoped operational actions |
| Usage | Period, meter, used/reserved/released, remaining, operation history and reconciliation status |
| Integrations | Provider, health, last success/error and affected bots; redact credentials |
| Support | Requests, staff response, priority, assignment and internal notes distinct from customer-visible replies |
| Audit | Actor, action, target, reason, before/after and timestamp |
| Data lifecycle | Export/deletion request progress and retention settings; no immediate deletion from suspension |

Example: open Acme → Features & limits → enable Booking → increase bot limit from 1 to 3 for 30 days → preview effective change → record reason → save → refresh affected views. Backend responses must show the new effective permissions. Revoking the override returns to the pinned plan values.

## 6. Access and account lifecycle

Keep three independent dimensions:

1. Identity access: whether a person may authenticate.
2. Workspace membership: which account and role that person may use.
3. Workspace entitlement: what the account may consume or create.

Banning an identity affects every workspace that person belongs to; revoking a membership affects only that workspace. The interface must show that impact. Suspending one customer must not alter another account sharing a member.

Operational state and subscription state remain independent. A manual upgrade must not automatically unsuspend an account. Expired trials and grace periods resolve on the next request. Restriction retains access to existing records and defined fulfillment/cancellation workflows while blocking new paid consumption. Suspension blocks product use while allowing account support according to policy. Customer-facing messages should describe availability, not internal SQL or quota implementation details.

Quota changes never silently delete bots, products or historical records. When a downgrade puts usage over a limit, show the excess and block relevant creation/reactivation until resolved. Preserve existing orders and bookings. Show whether a quota counts active resources, stored resources or period consumption; several existing `.active` meter names actually count stored records and need consistent labels or a migration.

Feature evaluation precedence: global availability disable → operational/subscription eligibility → pinned plan → valid account overrides → bot-specific configuration. Overrides cannot bypass global disable or suspension. Backend checks remain authoritative even when UI controls are hidden.

## 7. Founder and staff permissions

The founder is `platform_owner` in `platform_staff_memberships`. A customer owner remains `owner` in `workspace_memberships`. Neither implies the other. Normal signup cannot grant platform access.

| Platform role | Proposed responsibilities |
| --- | --- |
| Founder / platform owner | All platform configuration, account lifecycle, plans, staff and security |
| Operations admin | Account operations, scoped overrides, member assistance and delivery resolution |
| Billing specialist | Subscription changes and commercial requests; no staff grants |
| Support specialist | Scoped account summary, support cases and permitted diagnostics |
| Security operator | Security investigations, suspension, availability incidents and audit |
| Read-only analyst | Aggregate reports; no unrestricted customer identity directory |

Replace broad `read` permissions with resource-specific read permissions where needed. Protect both route handlers and database command functions. MFA is mandatory for platform staff. Preserve at least one active founder and prohibit self-lockout. Ownership transfers verify the new owner and commit membership changes with an audit entry.

Support access to customer content must be explicit and scoped. Do not automatically log the founder in as the customer. If a later support-session feature is needed, make it time-limited, audited and read-only by default, with a visible banner. It is not required to ship the account-control dashboard.

## 8. Plans and subscriptions

Reuse Trial, Starter, Growth, Business, Enterprise and Legacy plan records. The plan editor presents feature toggles and quota inputs together, with a preview of affected customer capabilities. Publish immutable versions. Existing accounts stay on their assigned version unless explicitly migrated. An enterprise agreement pins a version plus documented allowances and expiry; avoid implicit unlimited limits.

Subscription actions: assign version, extend trial, set grace window, pause/resume access, schedule cancellation and restore access where policy permits. Every action captures reason, effective time, expected previous version and resulting state. Scheduled operations need a worker and idempotency key; until implemented, only immediate changes may be offered.

Payments stay disconnected as requested. No Charge, Refund or invoice-paid action should pretend to call a provider. Clearly label manually configured contract amounts. A future payment adapter must reconcile provider events with account state without overriding security suspensions.

## 9. Technical architecture

```text
src/app/master-admin             Founder pages + authenticated layout
src/components/master-admin      Shell, tables, account tabs, mutation dialogs
src/app/api/admin                Staff-only queries and commands
src/lib/saas                     Identity, permissions and effective access
Supabase                        Authoritative accounts, plans, usage and audit
Customer APIs / chat / jobs      Enforce the same effective access decisions
```

Keep the existing API prefix `/api/admin`; it already separates staff operations from `/api/workspaces`. Expand it into focused handlers rather than coupling every page to a single large component. Suggested resources: `/overview`, `/accounts`, `/accounts/[id]`, `/accounts/[id]/access`, `/plans`, `/subscriptions`, `/staff`, `/audit`, `/operations`.

Each mutation follows: verify identity → verify active staff and MFA → permission check → validate payload and expected version → lock target account where needed → apply change and append audit in one transaction → return effective state → invalidate relevant UI caches. Return a conflict if a second operator edited the same account; do not silently overwrite it.

New UI routes must be added to middleware protection. Update login and MFA return handling to allow the explicit `/master-admin` destination; current MFA navigation returns to `/admin`. Staff login should land in the founder console, while normal customers land in their workspace. Enforce this server-side as well as in client navigation.

After route parity, redirect supported legacy `/admin` URLs to equivalent founder pages. Review every legacy admin route before retiring it; retain customer product pages under their existing workspace routes. Do not expose old pages through redirects that bypass permission checks.

## 10. Data additions

Reuse `clients`, `platform_staff_memberships`, `workspace_memberships`, `saas_workspace_accounts`, `saas_plan_versions`, `saas_entitlement_overrides`, `saas_release_gates`, `saas_usage_events`, `saas_requests`, `saas_invitations`, `saas_delivery_operations` and `saas_audit_events`.

Add only as needed, with new additive migrations after the current migration head:

- `saas_account_notes`: staff-only notes with author and account.
- `saas_subscription_events`: effective transitions for history and conversion metrics.
- `saas_scheduled_changes`: effective time, payload, status, idempotency key and retry outcome.
- `saas_platform_metric_daily`: aggregates with definitions and collection timestamps.
- `saas_enterprise_agreements`: contract metadata, plan/version, dates and allowance references.
- `saas_incidents`: operational incidents linked to failures and affected accounts.
- `saas_privacy_jobs`: export/deletion execution status, result reference and audit linkage.

Keep platform tables unavailable to anonymous and normal authenticated browser clients. Access through authenticated staff APIs. Never store SMTP passwords, API secrets or raw login tokens in notes, exports, analytics or audit payloads.

## 11. Delivery sequence and completion criteria

| Phase | Deliverable | Completion criteria |
| --- | --- | --- |
| 1 | Founder shell and entry | `/master-admin` exists, distinct navigation, staff/MFA guard, customer denial, correct login destination |
| 2 | Accounts and detail tabs | Global server search/pagination, real data, state/plan/override actions with audit and conflict handling |
| 3 | Plans and enforcement | Versioned editor, downgrade preview, quotas and access checked across all supported channels/jobs |
| 4 | Founder overview and operations | Global aggregate counts, honest commercial metrics, support and failure workflows |
| 5 | Staff and migration | Permission matrix enforced, founder lockout protection, legacy route inventory and tested redirects |
| 6 | Advanced lifecycle | Scheduled changes, enterprise agreements, privacy jobs and additional operational automation |

For phases 1–5 verify: customer cannot load founder APIs; revoked staff cannot mutate with an old UI open; MFA is required; tenant isolation holds; downgrade preserves records; trial/override expiry works; concurrent changes do not overwrite; global feature disable wins; read-only staff cannot mutate; failure never produces a false success; founder totals cover all accounts; product chat, orders, reservations and support regressions pass.

Use local SQL integration tests for database commands, API permission tests and browser tests for the primary founder journey. Stage migrations against the actual schema before production rollout. Deployment should keep existing customer paths working throughout the founder UI migration.

## 12. First founder journey

Sign in → complete MFA → Founder overview → Accounts → select a customer → inspect plan and usage → set the required features and limits → review impact and reason → save → verify effective customer access → inspect the audit record.

The next implementation milestone is phases 1 and 2: the separate founder interface and working customer-account controls backed by the existing control plane. This document is the requested plan-first deliverable; no dashboard code or live privileges were changed while creating it.
