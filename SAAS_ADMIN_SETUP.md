# SaaS administration: implemented system and rollout

Implementation date: 19 October 2026. This guide describes the code in this repository, not a claim that the live database has been migrated. The supplied master blueprint is a roadmap; the implementation below is its manual-billing control-plane foundation.

Update: the dedicated founder interface now lives at `/master-admin`; `/admin` redirects there. Apply `supabase/070_founder_console.sql` after the migrations below before using this version. See [Founder console implementation](system_design/28-founder-console-implementation.md) for the new controls, identity restrictions and deployment requirements.

## Required rollout steps

1. Back up the database and test against a staging copy of the existing product schema. Existing product migrations through `066` must already be installed.
2. Apply, in order:
   - `supabase/067_saas_control_plane.sql`
   - `supabase/068_saas_workspace_access.sql`
   - `supabase/069_saas_delivery.sql`
3. Deploy the application and migrations together in a maintenance window. The new application fails closed if control-plane storage is missing. Migration 068 replaces tenant policies across public tables containing `client_id`; review custom policies and staging access before production deployment. It also changes the known tenant reporting views to security-invoker behavior.
4. Sign up normally and verify the email address for your intended platform administrator. With the project's Supabase environment variables available locally, run:

   ```sh
   npm run admin:bootstrap -- owner@example.com
   ```

   This explicitly grants that existing identity platform-owner access. It does not create an account, change a password, send mail, or promote other users. Never expose the service-role key in a browser.
5. Open `/admin`. Enroll an authenticator at `/auth/mfa` and verify it. Bootstrap requires MFA by default. Do not disable this requirement in production.
6. Review the seeded plans, publish your own versions/prices, and assign customer workspaces. Payments remain disconnected; no card is charged and there is no automatic paid renewal.
7. Test with two separate customer accounts, an invited team member, and a staff account before launch. Verify customer A cannot access B's records through APIs, browser Supabase calls, server actions, exports, or guessed IDs.

No live migration, administrator bootstrap, deployment, or payment activation was performed as part of this implementation.

## Admin navigation and controls

| Route | Working controls |
| --- | --- |
| `/admin` | Operational summary; counts reflect the returned dataset, not invented metrics |
| `/admin/workspaces` | Paginated customer registry; open a workspace control page |
| `/admin/workspaces/[id]` | Operational state, subscription assignment, effective feature/limit overrides, expiry/revocation, usage, team access, bots, requests and audit entries |
| `/admin/plans` | Complete feature and quota matrix; publish a new version rather than editing all subscribed customers implicitly |
| `/admin/subscriptions` | Manual subscription state and pinned plan versions |
| `/admin/usage` | Consumption ledger |
| `/admin/support` | Customer support, plan-change, export and deletion requests; status changes and administrator responses |
| `/admin/integrations` | Connection metadata, not SMTP credentials |
| `/admin/users` | Authentication identity directory |
| `/admin/security` | Explicit platform-staff roles, activation and MFA requirements |
| `/admin/releases` | Global feature disable switches; disable wins over customer grants |
| `/admin/jobs` | Email delivery outcomes; manual resolution requires provider evidence and an audit reason |
| `/admin/audit` | Administrative mutation history with actor, reason, workspace and payload snapshots |

Search on paginated admin tables currently filters the loaded page. Historical unused admin pages are not all redesigned; the navigation above is the supported control plane.

Every control mutation requires a reason. The database applies the mutation and audit insert in the same transaction. Platform staff membership is separate from legacy `users.role` and from customer workspace membership. Staff access does not automatically grant a customer workspace session. There is no hidden impersonation bypass.

## Customer account panel

- `/settings/billing`: current plan, access state, feature inclusion, comparison and manual change requests.
- `/settings/usage`: real resource counts and consumption allowances.
- `/settings/team`: verified-email invitations, roles, membership revocation and pending invitation revocation. Invitation links are returned once for manual sharing; automatic invitation email is not implemented.
- `/settings/support`: requests and administrator responses.
- `/settings/data-privacy`: bounded JSON download of contacts, products, orders/items, bookings and tickets; larger or additional exports and deletion use reviewed requests. This download is not a full backup or complete statutory export.
- `/settings/security`: authentication/MFA entry point and global sign-out. Already-issued access tokens remain subject to the authentication provider's token lifetime.

The dashboard switches workspaces using an authenticated membership check and an HTTP-only selected-workspace cookie. Actor identity remains separate from tenant identity. Existing records are retained on downgrade rather than silently deleted.

## Seeded plans: defaults to review before selling

Prices intentionally start unset. These are configurable packaging defaults, not researched market pricing or guaranteed unit economics.

| Allowance | Trial | Starter | Growth | Business | Enterprise default |
| --- | ---: | ---: | ---: | ---: | ---: |
| Active / stored bots | 1 / 2 | 1 / 3 | 5 / 15 | 20 / 60 | 20 / 60 |
| Team seats | 2 | 2 | 5 | 15 | 15 |
| Active / stored products | 25 / 50 | 250 / 500 | 2,500 / 5,000 | 10,000 / 20,000 | 10,000 / 20,000 |
| Booking services | 2 | 5 | 25 | 100 | 100 |
| Restaurant tables | 10 | 0 | 100 | 500 | 500 |
| Offers | 2 | 5 | 25 | 100 | 100 |
| Stored contacts | 100 | 2,000 | 20,000 | 100,000 | 100,000 |
| Connected sources | 1 | 2 | 10 | 30 | 30 |
| Knowledge datasets | 1 | 3 | 15 | 50 | 50 |
| Channel connections / email mailboxes | 1 / 1 | 2 / 1 | 5 / 3 | 15 / 10 | 15 / 10 |
| AI answer attempts | 100 | 1,000 | 5,000 | 20,000 | 20,000 |
| Transactional emails | 25 | 1,000 | 5,000 | 20,000 | 20,000 |
| Marketing emails | 0 | 0 | 10,000 | 50,000 | 50,000 |
| Daily outbound emails | 10 | 200 | 2,000 | 10,000 | 10,000 |

New workspaces receive a fixed 14-day trial. Trial quotas apply to that trial window; normal consumption periods advance monthly from the stored anchor. Daily email limits use UTC days. Existing customers receive a separate Legacy plan with high but finite limits, avoiding an arbitrary trial cutoff. Review and reassign Legacy customers deliberately.

Enterprise is not unlimited: publish a customer-specific version or issue explicit expiring overrides. Seeded Starter excludes restaurant table allocation, campaigns and API access; Growth and Business include these. The feature catalogue also contains targeted-offer access, but not every legacy targeted-offer execution path is yet gated; do not sell that toggle as exhaustive enforcement.

Service, offer, source and channel allowances currently count stored records, despite some internal meter keys ending in `.active`. Bots and products have separate active/stored quotas. Member counts include unexpired pending invitations. Downgrades do not destroy resources; new creation/reactivation is blocked when a relevant allowance is exhausted.

## Architecture and security boundaries

```text
Verified Supabase identity
  ├─ platform_staff_memberships → staff permission + MFA → admin API
  │    └─ saas_admin_mutate → state change + audit in one transaction
  └─ workspace_memberships → selected tenant + role → product API / RLS
       └─ account + pinned plan + expiring overrides + release gates
            ├─ SQL resource and transaction guards
            ├─ runtime commerce/booking/AI access checks
            └─ usage and delivery ledgers
```

Core code lives in `src/lib/saas`, `src/components/admin/ControlPlane.tsx`, `src/components/saas`, `/api/admin/control` and `/api/workspaces`. Control-plane tables and RPCs are service-only. Tenant-facing database policies use membership rather than assuming every tenant ID equals the current actor ID. Inbox server actions verify session ownership and override caller-supplied agent identity with the authenticated actor.

Operational state (`active`, `restricted`, `suspended`) is independent of subscription state. Assigning a paid/manual plan does not unsuspend an account. Trial and grace expiry are evaluated when entitlements are resolved, without waiting for a background job. Overrides may expire or be revoked. Global disable switches take precedence. Shadow mode bypasses numerical quota rejection, not identity, suspension or feature gates.

Enforcement covers SQL resource creation, new orders/bookings/tickets, restaurant configuration, runtime commerce/booking configuration, core AI generation allowance, outbound email quotas, campaign/analytics management endpoints and API-key creation/API chat. Existing transaction updates remain possible for fulfillment/cancellation; suspension restricts product access but retains the account support route.

Knowledge and connected-source creation are gated. Existing retrieval paths and all legacy integration/targeted-offer paths have not undergone exhaustive entitlement retrofitting. Treat the remaining runtime access audit below as a launch requirement, not as completed work.

## Email and usage behavior

Outbound SMTP uses a workspace-scoped operation key and payload hash. Claiming a delivery reserves monthly and daily usage atomically. Accepted delivery commits usage; definitive provider failure releases it. An ambiguous timeout stays reserved and is not automatically resent. Staff must inspect the provider and record evidence before resolving it. Provider acceptance does not establish inbox delivery.

Queued campaign/booking/email jobs use stable operation IDs. Not every legacy synchronous caller provides a stable request ID; end-to-end retry guarantees for those callers still need review. This is a delivery ledger, not a general-purpose job orchestration platform.

AI allowance currently counts generation attempts at the instrumented generation/triage paths. It is not a token-cost ledger, and failed generation can consume a credit. Auxiliary classification/discovery model calls are not all metered. Do not use this ledger as final provider-cost reconciliation.

## Verification performed locally

```sh
npm test
npm run test:saas
NEXT_DIST_DIR=.next-saas-check ./node_modules/.bin/next build
git diff --check
```

The SaaS suite runs the actual SQL against an isolated PostgreSQL-compatible PGlite database and tests migration reruns, legacy/new account provisioning, admin denial, resource quotas, usage idempotency, plan changes, expiry, invitations, email reservations, RLS and audit persistence. It is not a live Supabase integration or real multi-backend concurrency/load test. Existing discovery, commerce, order tracking, booking and restaurant regression suites also run. Production build/type checking is separate from browser E2E verification.

## Explicit remaining work before a public SaaS launch

- Run migrations and smoke tests on the real staging schema; exercise every role and tenant boundary, including custom policies and legacy routes/RPCs.
- Complete all runtime entitlement gates for existing knowledge/source retrieval, targeted offers and legacy channels; verify feature denial across every external channel, not just web chat.
- Conduct browser E2E and accessibility testing of admin/account flows, including MFA, invitation acceptance, account switching, upgrade/downgrade and restricted states.
- Complete token/cost accounting, failed-attempt refund policy and concurrency/load tests against hosted PostgreSQL. Validate unit economics before publishing prices.
- Add encrypted secret storage/rotation and a migration of existing integration secrets. This change does not provide the blueprint's complete credential vault.
- Implement a real payment provider only when approved: signed webhook verification, reconciliation, invoices/taxes, refunds, dunning and billing-period policy. Current checkout intentionally reports not configured.
- Implement large asynchronous exports, comprehensive privacy exports and verified deletion/retention jobs; closing a request does not automatically perform deletion.
- Add enterprise contracts/SSO/SCIM if sold, tenant-level incident tooling, audited time-limited impersonation if required, and complete platform monitoring/alerts/backups/runbooks.
- Implement any requested mobile companion, advanced rollout cohorts, broad job retry controls and remaining blueprint modules separately.
- Review dependency audit findings before launch; no blanket dependency upgrade was performed here.

This is an implemented control plane with manual subscriptions, not a claim that every item in the master blueprint or a production-readiness audit is complete.
