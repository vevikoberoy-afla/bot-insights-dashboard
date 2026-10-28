# Master Admin Dashboard (Founder Console) — Features & System Design

> **Route**: `/master-admin`  
> **Audience**: Platform Founders & Appointed Platform Staff  
> **Source Directory**: `src/app/master-admin/` and `src/components/master-admin/`  
> **Backend Authority**: `supabase/070_founder_console.sql`, `src/app/api/admin/founder/`, `src/app/api/admin/control/`

---

## 1. Executive Summary & Architecture Separation

The platform enforces a strict architectural boundary between customer-facing tenant operations and platform-level administration:

| Dashboard Layer | Route | Target User | Authority & Responsibilities |
|---|---|---|---|
| **Customer Workspace** | `/(dashboard)/*` | Clients, store operators, agents | Manages tenant-specific bots, products, bookings, tickets, knowledge, and settings. |
| **Founder Master Admin** | `/master-admin/*` | Founder (`platform_owner`) & Platform Staff | Complete control over multi-tenant accounts, subscription tiers, feature gates, quotas, security, enterprise contracts, and platform operations. |
| **Legacy Admin Redirect** | `/admin` | N/A | Automatically redirects authenticated staff to `/master-admin`. |

---

## 2. Access Control, MFA & Security Guard

**Implementation**: `src/app/master-admin/layout.tsx` & `src/lib/saas/context.ts`

- **Staff Authentication**: Validates user identity via `requireStaff()`. Unauthenticated requests redirect to `/auth/login?next=/master-admin`.
- **Mandatory MFA (AAL2)**: Enforces authenticator app verification (`staff.aal === 'aal2'`). If unverified, automatically redirects to `/auth/mfa?next=/master-admin`.
- **Environment Awareness**: Detects and displays active environment badge (`LOCAL DEV`, `STAGING`, or `PRODUCTION`).
- **Last-Founder Protection**: PostgreSQL transaction locks guarantee that the last remaining `platform_owner` cannot be deleted, demoted, or deactivated.
- **Self-Action Prevention**: Staff members cannot block or revoke their own accounts.
- **Optimistic Concurrency Control**: All mutating actions require `expected_version` matching the account's policy revision; conflicting modifications abort with HTTP 409 (`CONCURRENT_MODIFICATION_CONFLICT`).

---

## 3. Navigation & Shell Layout

**Implementation**: `src/components/master-admin/FounderShell.tsx`

The layout provides a modern, high-density desktop control console with a 240px fixed sidebar, 64px sticky header, and responsive mobile drawer.

### Navigation Hierarchy

```text
Founder Console
├── Command
│   ├── Executive overview      (/master-admin)
│   └── Live operations (Pulse) (/master-admin/pulse)
├── Customers & access
│   ├── Accounts                (/master-admin/accounts)
│   ├── User identities         (/master-admin/users)
│   └── Access requests         (/master-admin/access-requests)
├── Commercial
│   ├── Plans & feature matrix  (/master-admin/plans)
│   ├── Subscriptions           (/master-admin/subscriptions)
│   ├── Enterprise agreements   (/master-admin/enterprise)
│   └── Usage & quotas          (/master-admin/usage)
├── Operations
│   ├── Customer support        (/master-admin/support)
│   ├── Integrations            (/master-admin/integrations)
│   ├── Delivery operations     (/master-admin/operations)
│   └── Feature availability    (/master-admin/releases)
└── Security & governance
    ├── Platform staff          (/master-admin/security)
    ├── Audit trail             (/master-admin/audit)
    └── Platform settings       (/master-admin/settings)
```

### Shell Header Capabilities
- **Omnibox Quick Search (⌘K / Ctrl+K)**: Instant keyboard shortcut to search customer accounts, emails, and workspace UUIDs.
- **Environment Indicator**: Real-time badge distinguishing production from preview/local environments.
- **Security Badge**: Verified MFA status indicator.
- **Staff Identity & Sign-Out**: Displays staff email, normalized role title, and one-click session sign-out.

---

## 4. Feature Breakdown by Section

### 4.1. Executive Overview & Live Operations (Pulse)
- **Routes**: `/master-admin` (Overview) & `/master-admin/pulse` (Live Operations).
- **Pulse Auto-Refresh**: Automatically queries `/api/admin/founder?view=overview` every 30 seconds while the browser tab is focused.
- **Global KPI Cards**:
  1. **Customer Accounts**: Total registered workspaces with breakdown of `active`, `restricted`, and `suspended`.
  2. **Active Subscriptions**: Active paying workspaces, active trials, and grace-period accounts.
  3. **AI Generation Credits**: Real-time sum of consumed and reserved AI tokens within the selected time window (1, 7, 30, or 90 days).
  4. **Trials Ending Soon**: Accounts whose trial expires within 72 hours.
  5. **Customer Requests**: Unresolved open/in-progress customer inquiries.
  6. **Delivery Alerts**: Failed or unconfirmed email/webhook deliveries plus count of globally disabled feature gates.
- **Acquisitions Chart**: Interactive CSS/SVG bar chart plotting daily new workspace signups over the reporting period.
- **Subscription Tier Distribution**: Visual progress breakdown showing account distribution across plans (`trial`, `starter`, `growth`, `business`, `enterprise`, `legacy`).
- **Configured Recurring Contract Value (MRR / ARR)**: Normalized recurring value by currency (USD, EUR, GBP, INR, etc.).
- **Founder Attention Queue**: Quick triage buttons leading directly to expiring trials, open support tickets, delivery failures, or disabled features.
- **Recent Audit Activity**: Live stream of the 15 most recent administrative actions with timestamp, actor, action type, and reason.

---

### 4.2. Customer Accounts & Workspaces Registry
- **Route**: `/master-admin/accounts`
- **Search & Filters**:
  - Full-text search across business name, owner email, and workspace UUID.
  - Operational state filter: `All`, `active`, `restricted`, `suspended`.
  - Plan tier filter: `All`, `trial`, `starter`, `growth`, `business`, `enterprise`, `legacy`.
- **Server-Side Pagination**: Stable 50-row pagination driven by PostgreSQL RPC `saas_founder_accounts`.
- **Multi-Select Bulk Actions**:
  - Select individual accounts across the active page.
  - Choose target state (`active`, `restricted`, `suspended`).
  - Mandatory audit reason (minimum 10 characters).
  - Version-checked atomic execution with per-account outcome reporting.
- **Filtered CSV Export**:
  - Securely streams up to 5,000 accounts matching the active search/filter criteria.
  - CSV formula-injection protection (`=`, `+`, `-`, `@` escaping).
  - Automatically records an audit log entry for compliance.
- **Founder Workspace Provisioning**:
  - Modal to create a new workspace directly for an existing verified Supabase user.
  - Automatically initializes configured trial duration and assigns initial `owner` role without resetting passwords.

---

### 4.3. Account 360 (Workspace Deep Dive)
- **Route**: `/master-admin/accounts/[id]`
- **Ten Operational Tabs**:

| Tab | Features & Capabilities |
|---|---|
| **1. Overview** | Customer profile, created date, plan tier, member count, bot count, policy version, business name editing, internal founder notes, and enterprise agreements. |
| **2. Subscription** | Plan version assignment, access state (`trialing`, `active`, `past_due_grace`, `unpaid_restricted`, `canceled`, `paused`), enforcement mode (`enforced` vs `shadow`), trial/grace period date extensions. |
| **3. Entitlements** | Complete capability matrix combining plan defaults, active temporary overrides, and global feature gates. Includes override granting (custom limit or boolean toggle with expiry up to 366 days) and one-click override revocation. |
| **4. Team** | Complete roster of workspace members with verified email, last sign-in timestamp, MFA enrollment status. Allows changing roles, revoking/reactivating access, revoking pending invitations, and safe ownership transfer to an active member. |
| **5. Bots** | Resource listing of all customer bots with one-click administrative pause/reactivate actions. |
| **6. Usage** | Live consumption meters (monthly AI credits, daily emails, active bots, contact counts, dataset storage). |
| **7. Integrations** | Connected communication channels (WhatsApp, Web widget, Email, Telegram) with credentials securely masked. |
| **8. Requests** | Support and access requests submitted by this customer with direct reply tools. |
| **9. Audit** | Dedicated workspace audit ledger with actor IDs, action names, timestamps, and justification reasons. |
| **10. Data Lifecycle** | Configured transcript retention policy (e.g. 30/90 days, 365 days for tickets) and review of GDPR export/deletion requests. |

---

### 4.4. Commercial & Subscription Management
- **Plans & Feature Matrix** (`/master-admin/plans`):
  - Side-by-side tier comparison matrix across all feature toggles and numeric limits.
  - Plan version publishing: Publishes new immutable versions without breaking existing customer subscriptions (pinned version model).
  - Configurable pricing in minor units, currency, and billing intervals (`month`, `year`, `contract`).
- **Subscriptions** (`/master-admin/subscriptions`):
  - Platform-wide subscription ledger showing operational state and access state per workspace.
- **Enterprise Agreements** (`/master-admin/enterprise`):
  - Contract tracking registry storing contract reference, effective start/end dates, payment terms, and committed support SLA response targets (hours).
- **Usage & Quotas** (`/master-admin/usage`):
  - Real-time consumption ledger tracking quota consumption across all accounts.

---

### 4.5. Operations & Reliability
- **Customer Support Cases** (`/master-admin/support`):
  - Queue of inbound customer requests (`support`, `billing`, `quota`, `access`).
  - Response composer allowing staff to reply directly to the customer and update case status (`open`, `in_progress`, `resolved`, `closed`).
- **Connected Integrations** (`/master-admin/integrations`):
  - Audit view of all third-party channel integrations across workspaces without exposing API secrets or credentials.
- **Delivery Operations** (`/master-admin/operations`):
  - Inbound and outbound message delivery ledger.
  - Evidence-based manual reconciliation for stalled/unknown SMTP or WhatsApp deliveries (`accepted` vs `failed`).
- **Feature Availability (Release Gates)** (`/master-admin/releases`):
  - Global boolean switches for core platform features (`bots.enabled`, `commerce.enabled`, `booking.enabled`, `restaurant.enabled`, `support.enabled`, `knowledge.enabled`, `sources.enabled`, `email.enabled`, `campaigns.enabled`, `analytics.enabled`, `api.enabled`).
  - Disabling a gate immediately blocks execution across all tenants regardless of subscription tier.

---

### 4.6. Security, Governance & Settings
- **User Identities Directory** (`/master-admin/users`):
  - Global list of all registered auth users with email confirmation date, last login timestamp, MFA enrollment indicator, platform role, and workspace memberships.
  - **Global Identity Block**: Ability to immediately freeze a user's product access across all workspaces in one click (without deleting user data or session history).
- **Platform Staff Management** (`/master-admin/security`):
  - Granular Role-Based Access Control (RBAC) with 6 specialized staff roles:
    1. `platform_owner` (Full administrative power)
    2. `operations_admin` (Workspace mutations, feature gates, overrides, delivery reconciliations)
    3. `support_specialist` (Case handling, internal notes)
    4. `billing_specialist` (Subscriptions and billing cases)
    5. `security_operator` (Identity blocking, release gates, workspace controls)
    6. `readonly_analyst` (Read-only visibility)
  - Staff invitation and status toggles (`active`, `revoked`).
- **Audit Trail Inspector** (`/master-admin/audit`):
  - Searchable log of every administrative action performed across the platform.
  - **Before / After Diff Modal**: Interactive JSON inspector comparing the exact state before and after each mutation.
- **Platform Settings** (`/master-admin/settings`):
  - Default trial duration (1–90 days).
  - Default grace period (1–60 days).
  - Global customer account notice banner displayed inside customer dashboards.

---

## 5. API & Backend RPC Architecture

### 5.1. Next.js API Routes

| Endpoint | Method | Role Required | Purpose |
|---|---|---|---|
| `/api/admin/founder?view=overview` | `GET` | Staff | Returns aggregated executive overview metrics and attention counts. |
| `/api/admin/founder?view=accounts` | `GET` | Staff | Paginated, filtered search across workspace accounts. |
| `/api/admin/founder?view=export` | `GET` | `workspaces` | Generates sanitised CSV export of accounts. |
| `/api/admin/founder?view=account-extra` | `GET` | Staff | Hydrates notes, integrations, gates, agreements, and member identities for an account. |
| `/api/admin/founder?view=enterprise` | `GET` | `enterprise` | Fetches enterprise agreement registry. |
| `/api/admin/founder?view=settings` | `GET` | `settings` | Retrieves global trial, grace, and notice defaults. |
| `/api/admin/control` | `GET` | Staff | Fetches records for control plane views (plans, users, support, audit, releases). |
| `/api/admin/control` | `POST` | Action-specific | Executes transactional mutations wrapped by `saas_admin_mutate`. |

### 5.2. PostgreSQL RPC Engine (`supabase/070_founder_console.sql`)

```text
Incoming Action (HTTP POST /api/admin/control)
           │
           ▼
requireStaff(action_permission)
           │
           ▼
supabase.rpc('saas_admin_mutate')
   ├── Advisory lock (saas_staff_mutate) for staff changes
   ├── Row lock target workspace (SELECT ... FOR UPDATE)
   ├── Concurrency check: expected_version == current_version
   ├── Capture before_state (saas_control_snapshot)
   ├── Execute business mutation (state change, override, plan version, etc.)
   ├── Increment account policy version (version = version + 1)
   ├── Capture after_state (saas_control_snapshot)
   └── Append to saas_audit_events (actor_id, client_id, before_value, after_value, reason)
```

---

## 6. Verification & Quality Checklist

- [x] **No Customer Disruption**: Customer workspace routes under `src/app/(dashboard)` remain untouched.
- [x] **Staff MFA Guard**: Access to `/master-admin` requires verified level-2 authentication (`aal2`).
- [x] **Zero Mock Data**: All metrics, graphs, and tables are bound to authoritative PostgreSQL tables and RPCs.
- [x] **Audit Completeness**: Every administrative mutation mandates an audit reason of at least 10 characters.
- [x] **Concurrency Safe**: Concurrent edits return HTTP 409 conflict instead of overwriting dirty state.
- [x] **Security Hardened**: Service-role execution only; direct anon and authenticated database access revoked.
