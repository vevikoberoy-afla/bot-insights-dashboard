# Founder console implementation and activation

Implemented route: `/master-admin`. Customer routes remain under `src/app/(dashboard)`.

This implementation adapts `state_access_control_implementation_plan.md` and `founder_master_admin_ui_control_blueprint.md` to the existing database. Their example SQL references different column names; use the repository migration below instead of executing the document snippets.

## Activate

Apply `supabase/070_founder_console.sql` after migrations 067, 068 and 069. This migration is required for the new identity checks as well as the founder UI. Deploy the migration and application together. Test against a staging copy first; the local integration suite uses an isolated fixture, not the live Supabase schema.

Sign in with an existing active platform staff account, complete MFA, and open `/master-admin`. `/admin` now redirects to it. Normal customer sign-in still opens `/overview`. Founder identity is resolved from `platform_staff_memberships`, not the legacy `users.role` field.

No live database changes, user blocks, account provisioning or customer notifications were executed during this implementation.

## Working screens and controls

| Screen | Implemented behavior |
| --- | --- |
| Executive overview | Global SQL aggregates; account states, subscriptions, trial/grace counts, acquisition dates, plan distribution, configured recurring value by currency, usage window, requests, delivery alerts, recent audit |
| Live operations | Refreshes the real overview aggregates every 30 seconds while visible |
| Accounts | Server-side name/email/UUID search, state/tier filters, stable pagination, audited filtered CSV export up to 5,000 accounts, founder provisioning for an existing verified identity, selected-row bulk restrict/suspend/restore with per-account version checks and outcomes |
| Account 360 | Ten tabs: overview, subscription, entitlements, team, bots, usage, integrations, requests, audit and data lifecycle |
| Account actions | Restrict/suspend/restore, assign plan version, extend trial/grace, change subscription access, quota/feature overrides and revocation |
| Account details | Edit business name, add private notes, inspect integrations and retention, record enterprise agreement |
| Team controls | Change nonowner roles, revoke/reactivate memberships, revoke invitations, transfer ownership to an existing verified active member |
| Bot controls | Pause/reactivate bots with existing resource guards applied |
| User identities | Verified email, MFA enrollment indicator, last sign-in, memberships, platform role, global product-access block/restore |
| Plans | Latest-version comparison matrix, feature and quota editing, immutable-by-API version publishing; pinned customers stay assigned |
| Subscriptions | Account subscription records and links to full account controls |
| Enterprise | Persisted agreement reference, dates, terms and support SLA target; assign actual plan/overrides separately |
| Usage | Existing consumption ledger; account views provide live quota snapshots |
| Access requests / Support | Existing customer requests with response and resolution controls |
| Integrations | Real connected-channel metadata, credentials excluded |
| Delivery operations | Existing email ledger and evidence-based manual acceptance/failure reconciliation |
| Feature availability | Global boolean feature switches, with audit reasons |
| Staff & security | Explicit roles, MFA, grant/revoke, self-access and last-founder protection |
| Audit | Actor, timestamp, reason, action and side-by-side before/after inspector |
| Platform settings | Default new-account trial duration, grace-period preference and customer account notice |

Founder provisioning creates an additional workspace and owner membership for an existing verified user. It does not create a new login, send invitations, change passwords or activate payments. Global identity blocking denies product APIs and tenant RLS across that person's memberships. It does not delete the Supabase identity, erase its memberships or revoke its refresh tokens. Restoring access allows those sessions again.

## State and concurrency

`saas_workspace_accounts` remains the single operational/commercial state authority. The implementation does not duplicate state onto `clients`. `version` is the policy revision.

`saas_admin_mutate` now wraps the existing command implementation. Account 360 mutations include the expected version; stale mutations return HTTP 409. Row locking, state change, revision update and founder audit snapshot commit together. Older admin calls remain compatible; the dedicated founder account UI supplies the version.

Override replacement revokes prior overrides for the same key. Revoking the current override therefore restores the pinned plan value. Changing a subscription never clears a suspension. Global feature disable remains authoritative. Existing data is retained when access is downgraded.

The wrapper also writes a `founder.*` snapshot event. Delegated legacy commands retain their original audit event, so those operations currently generate both an action event and a founder snapshot event. Avoid counting both as distinct business transitions in analytics.

## Customer synchronization

`WorkspaceStateProvider` fetches `/api/workspaces/state` on mount, focus and every ten seconds while the tab is visible. It checks workspace identity, refreshes role/entitlements/usage, displays the platform notice, locks creation navigation and replaces suspended workspace content with account support access. Revoked membership hides the workspace. It does not clear unrelated browser storage.

There is no authorization cache: server entitlement resolution still queries current SQL state. Polling affects UI freshness only. This deliberately uses polling rather than the documents' unauthenticated broadcast sample. Authenticated private Realtime broadcasts and a globally-versioned Redis cache are not installed. A future cache must account for global gate versions, time expiry and reservation changes.

MFA is checked on staff requests, regardless of an older staff record's `require_mfa` value. Global identity restrictions are checked in shared identity helpers, middleware and membership RLS. Active staff must first have their platform access revoked before their identity can be blocked; self-block is rejected.

Queued WhatsApp campaigns and offering-enrichment jobs now recheck entitlement at execution time. SMTP delivery already reserves monthly/daily quotas through the existing delivery gateway. Neither the UI nor a previous request grants a worker permission to send later.

## Scope boundaries relative to the supplied blueprints

The following requested concepts need additional systems and are not represented as working controls:

- Companion mobile application, new mobile endpoints and per-bot/location ABAC.
- General background-job replay, bounce/suppression registry, provider health probes and actual inbox-delivery telemetry. SMTP acceptance is not delivery confirmation.
- Automatic scheduled deletion, privacy export jobs, scheduled subscription changes or cohort migrations. Privacy requests remain reviewed requests; closing a request does not run deletion.
- Global logout of another user's refresh tokens, step-up freshness timers, provider identity bans and automated password-recovery messages.
- Draft plan persistence, beta/provider-required release states, per-meter disabled modes and rollout cohorts. Current release switches are boolean; quota mode is workspace-level shadow/enforced.
- Complete provider-cost accounting, storage/lookup/inbound/API-request meters and unit-economics charts. The UI only exposes implemented meters; AI credits count instrumented generation attempts.
- Complete universal enforcement retrofits for every legacy API/channel/ingestion path. Existing checks and the new worker checks are implemented; exhaustive cross-channel authorization coverage requires additional integration tests and adapters.
- Historical trial conversion/churn analytics. Acquisition charts use real creation timestamps; current subscriptions cannot establish historical conversion or churn.
- Automatic owner notifications, payment processing, refunds, taxes and verified collected revenue.

No fabricated data, fake connected-provider status or pretend payment actions were added for these items. The grace preference is stored for subsequent lifecycle workflows; existing grace dates change only through explicit subscription edits.

## Verification

Run `npm run test:saas`, `npm test`, and an isolated build:

```sh
NEXT_DIST_DIR=.next-founder-check ./node_modules/.bin/next build
```

The database suite includes migration reruns, tenant isolation, quota/idempotency behavior, stale founder edits, policy versions, snapshot auditing, global aggregates, private notes, verified ownership transfer, configurable trial provisioning, global identity blocks and override restoration.

Browser visual/E2E checks and deployment against the live Supabase instance remain separate from local SQL/type/regression/build validation.
