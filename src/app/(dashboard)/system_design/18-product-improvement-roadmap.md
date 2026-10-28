
## 1. Product direction

The highest-value improvement is to make the full customer journey dependable: discover an offering, complete a transaction, see it in the dashboard and receive support afterward. The product already spans commerce, booking, restaurant seating, support and customer profiles. Its next release should make these workflows easy to configure, measurable and consistent across entry points.

Prioritize trustworthy business outcomes, tenant security and subscription enforcement before extending the number of advertised features. Offer restaurant and shop setup presets on top of the same platform so customers do not have to understand every module before launching one bot.

## 2. Prioritized backlog

Effort is relative: S = contained change, M = several interacting components, L = cross-domain work, XL = coordinated architecture/migration. These are planning estimates, not delivery dates.

| ID | Improvement | Priority | Effort | Primary outcome |
| --- | --- | --- | --- | --- |
| I01 | Complete tenant and staff authorization | P0 | XL | Prevent unauthorized account/data access |
| I02 | Remove misleading mock data and false success states | P0 | M | Users can trust displayed results |
| I03 | Transaction/flow correctness and recovery | P0 | L | Orders/bookings/tickets finish once and recover safely |
| I04 | Real subscription lifecycle and usage enforcement | P0 for paid launch | XL | Sustainable, controlled SaaS operation |
| I05 | Source/provider readiness and safe configuration failures | P0 | M | No unintended capability or fabricated availability |
| I06 | Guided onboarding and publish checklist | P1 | L | Shorter time to first successful customer journey |
| I07 | Unified intent routing and conversation repair | P1 | L | Customers can change topics without getting trapped |
| I08 | Accessible, consistent interactive cards | P1 | M | Higher completion on mobile and keyboard devices |
| I09 | Reliable human handoff and message delivery | P1 | L | Staff and customers remain in one conversation |
| I10 | Observable performance and unified caching | P1 | L | Faster UI with reliable freshness |
| I11 | Source mapping/import diagnostics | P1 | M | Fewer setup failures and missing order lookups |
| I12 | Canonical customer identity and consent | P1 | L | Accurate customer history without unsafe merges |
| I13 | Truthful analytics and funnel instrumentation | P1 | L | Product decisions based on actual outcomes |
| I14 | Central delivery gateway for email/channels | P1 | L | Controlled, traceable outbound communications |
| I15 | Maintainable domain boundaries and schema contracts | P1 | L | Fewer regressions across features |
| I16 | Operational dashboard, reconciliation and recovery | P1 | L | Issues detected and repaired before customers report them |
| I17 | Industry presets and conversion improvements | P2 | M | Clearer positioning and easier adoption |
| I18 | Advanced retention/revenue features | P2 | L | Repeat usage after core reliability is proven |

P0 items block safe general paid launch. P1 items may ship in stages during a controlled pilot, with the supported product scope clearly stated. P2 items require evidence of customer demand and capacity to maintain them.

## 3. I01 — Finish access control

**Evidence:** the existing system uses direct user-to-client ownership assumptions, partial middleware resource checks, service-role database access and an unfinished team-management surface. Admin reporting handlers need explicit platform-role enforcement.

**Change:** introduce workspace memberships, permission templates and separate platform staff roles. Centralize authorization in server handlers/actions/services, convert RLS to membership checks, secure storage/realtime, and restrict privileged fields such as role, subscription state and account status. Audit legacy `admin` defaults and existing staff identities.

**Touchpoints:** `src/middleware.ts`, `src/lib/requestAuth.ts`, dashboard layout, `/api/admin/*`, team endpoints, Supabase grants/RLS and privileged RPCs.

**Acceptance:** another tenant's guessed identifiers are denied through API and direct database access; agents cannot export contacts or change billing; membership revocation takes effect on subsequent protected requests; an ordinary account receives 403 from global admin reporting.

**Reference:** default-deny authorization and checks on every request follow [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html). The detailed role design is in document 15.

## 4. I02 — Make the UI report reality

**Evidence:** general analytics, campaign results/journeys, templates, webhook logs and several settings screens contain `MOCK_*` or local-only state. Campaign lists can substitute mock campaigns after empty/error responses. `src/lib/agent-tools/side-effecting.ts` can mark an approved campaign action executed while its broadcast implementation remains a placeholder.

**Change:** use separate demo fixtures only in an explicit demo environment. Production empty states must say no records; errors must show retry and diagnostics. Hide unreleased controls or label them clearly. An operation reaches executed/sent only after the real adapter returns a persisted success result. Reject unsupported action types.

**Acceptance:** a new account displays no fictional revenue/campaigns; failed reads never show demonstration data; an unimplemented campaign executor cannot return executed. Every visible Save action persists and survives reload, or is visibly unavailable.

**Measurement:** track production routes with mock/local-only backing and reduce that number to zero for advertised features.

## 5. I03 — Make transaction confirmation and recovery dependable

**Motivation:** previous reports included confirmation loops, skipped evidence, wrong identity capture and broken back/cancel actions. Use them as regression tests against current code.

**Change:** standardize state transitions, typed action payloads, flow/step versions and idempotency keys. Make final confirmation revalidate stock/capacity/discount/identity and persist one business result. Retain recoverable drafts after transient failures. Tie receipt generation to a committed ID. Reconcile external side effects when the provider times out after potentially accepting a request.

**Flows covered:** cart → order; service/table selection → booking; verified order → return ticket; existing order/booking → cancellation or change.

**Acceptance:** double-clicks, browser retries and worker replays create one result; stale cards cannot mutate newer state; concurrent final-stock/final-table requests cannot overbook; a failed write never produces a success receipt; selected notes/add-ons/photos survive into the dashboard.

**Technical direction:** keep transaction correctness in PostgreSQL/RPCs, not React or Redis alone. Use an outbox for notifications after commit and preserve original operation IDs through retries.

## 6. I04 — Turn the SaaS plans into enforceable product behavior

**Evidence:** billing tables and read endpoints exist, while complete plan enforcement is proposed in documents 15 and 16.

**Change:** implement versioned prices/plans, hosted checkout, verified billing events, memberships/seats, entitlements and atomic resource/usage reservations. Meter all bot/channel usage against the same workspace. Add customer Billing/Usage and operator account/entitlement screens together.

**Acceptance:** bot creation/import/send limits cannot be bypassed through API calls; duplicate billing events do not grant duplicate credit; paid upgrades and scheduled downgrades have predictable results; cancellation preserves historical records and existing merchant commitments.

**Commercial validation:** collect actual model/provider/storage/support costs before approving prices. Trial users should be able to complete one meaningful flow without allowing uncontrolled bulk sending. Do not market quotas from the planning document as already enforced.

## 7. I05 — Configuration readiness and safe failure behavior

**Evidence:** `botCommerceConfig.ts` falls back to booking/ordering enabled when config loading fails. This preserves legacy behavior but cannot become the future entitlement policy. Calendar, email and other provider definitions also depend on external setup.

**Change:** distinguish unconfigured, schema-incompatible, temporarily unavailable, disabled and ready states. Add a per-bot readiness report covering migrations, source mappings, assigned offerings, channel authentication and callback/delivery tests. Gate subscription access before legacy feature-config fallback. Replace broad allow-all fallbacks with explicit compatibility policy and observable warnings.

**Acceptance:** a temporary database/config failure never unlocks a disabled or unentitled feature; the owner sees a corrective setup message; public customers receive a neutral retry/help response. A connection is only marked ready after the relevant operation—not merely saving credentials—is tested.

## 8. I06 — Guided onboarding and publish readiness

**Change:** provide presets for restaurant reservations, retail shopping, appointments and support. A wizard configures business identity, knowledge/source, primary feature, channel, test journey and publication. Reuse existing forms rather than create separate competing data models.

**Publish checklist:** valid bot assignment; at least one relevant active product/service or knowledge source; working contact capture; configured hours/timezone; verified website/channel; tested handoff; understandable fallback message. Only require checks relevant to the selected preset.

**Acceptance:** a restaurant owner can configure one branch/table schedule and complete a test reservation without touching unrelated marketing settings. A shop can import products, complete a test checkout and verify stock change. Test records are clearly isolated from production transactions.

**Metrics:** setup abandonment by step, median time to publish, percentage of new workspaces completing a verified test journey and time to first real transaction.

## 9. I07 — Conversation routing, interruption and repair

**Change:** introduce one explicit decision layer for intent, active-flow continuation, clarification, cancellation, management and human handoff. Route explicit management requests before new-transaction keyword matching. Keep a resumable snapshot when answering a short off-topic business question.

Examples to evaluate: shopping → table booking; phone form → cancel; “change my order” → existing-order lookup; “what is your return policy?” → information, not forced return creation; vague “cancel it” → clarify the affected operation when ambiguous.

Use deterministic rules for clear operational actions and bounded model classification for ambiguous phrasing. Do not let an intent classifier directly authorize a refund or transaction. Store structured entities with provenance and confirmation state; distinguish extracted suggestions from customer-confirmed values.

**Acceptance:** named regression conversations pass with the expected next step; a customer's opening request never becomes their name; switching intent releases or suspends resource holds according to explicit policy; no repeated search-card loop after a specific product name.

**Measurement:** wrong-flow rate, clarification success, abandoned steps and correction frequency from a labeled evaluation set.

## 10. I08 — Card design, accessibility and mobile reliability

**Change:** consolidate card spacing, typography, action placement, price formatting and validation. Keep editable state local until Proceed; after commit, show selection on the original card. Calendar/date/party-size state should be one coherent submission. Long product names wrap without pushing totals or buttons outside the receipt.

Add keyboard navigation, visible focus, accessible labels for steppers, live announcements for validation, sufficient contrast and reduced-motion support. Ensure embedded cards work at narrow widths, with mobile keyboards and long translated labels. Use text/icons as well as color for availability.

**Acceptance:** the core order/booking/return journeys can be completed with keyboard only; errors are associated with fields; no horizontal page overflow at a 320-pixel widget viewport; cards render loading, empty, unavailable and selected states consistently.

Use [WCAG 2.2 guidance](https://www.w3.org/WAI/WCAG22/quickref/) as the accessibility review reference. This is a target for testing, not a claim of current conformance.

## 11. I09 — Human handoff and delivery assurance

**Change:** make conversation ownership explicit and versioned: bot, waiting, human, resolved. Record message persistence, submission and acknowledgment separately. Add retry/reconnect behavior, session authorization on realtime subscriptions and safe polling fallback when realtime is unavailable.

The agent sees assignment, customer context, notes and recent flow outcome before replying. The customer sees a clear waiting/human state; the bot stops automatic responses while a human owns the thread. Resolve/resume controls must be scoped and auditable.

**Acceptance:** a reply from the dashboard reaches an actual embedded widget after navigation/reconnect; replay cannot duplicate messages; two agents taking ownership cannot overwrite each other silently; unauthorized sessions cannot subscribe to another customer's channel.

**Metrics:** time to first human response, waiting queue age, messages stuck after persistence and reconnect recovery rate.

## 12. I10 — Performance with controlled freshness

**Evidence:** the dashboard mixes page-local state, memory/localStorage caches, polling and direct Supabase/API reads. Some feature pages are wrappers around large shared components.

**Change:** adopt one documented client data-fetching/cache convention, tenant/user-scoped keys, request deduplication, stale-while-revalidate and mutation invalidation. Prefetch likely tabs without fetching every domain upfront. Paginate catalogue/contact/ticket data and load large analytics modules on demand.

Show shells and card structure immediately, but never show guessed available slots or stock as confirmed. Background loading can populate detail only after an authoritative response. Use realtime or focused refresh for state that changes frequently; revalidate at transaction confirmation.

Instrument UI paint, API latency, model time-to-first-token, full response time and provider lookup duration separately. Proposed pilot targets: cached tab paint under 200 ms and first meaningful structured response under 2 seconds at p95 where no slow external dependency is required. Establish baseline and test representative devices before committing these targets publicly.

**Acceptance:** logout/workspace switching clears scoped cached customer data; edits invalidate affected lists; stale availability cannot cause overselling; lower API request volume does not hide status changes.

## 13. I11 — Better import and connected-source diagnostics

**Change:** add a preview-and-map step for CSV/XLSX and connected order sources. Show recognized columns, required missing fields, sample normalized rows, duplicate SKU/order handling and validation errors with row numbers. Offer a downloadable template and error report.

For live sources show last successful lookup, freshness/cache timestamp, authentication state and mapping test. Distinguish record not found from source unavailable and identity mismatch. Native orders must remain part of the order resolver before configured external fallback.

**Acceptance:** common headers such as Product Name/name/title and SKU map correctly; invalid rows never overwrite good records; source timeouts do not produce false “order does not exist” claims; a merchant can test one known order without exposing other customer records.

## 14. I12 — Customer identity and consent quality

**Change:** unify contact creation across checkout, booking, support, email and passive capture. Keep identity normalization consistent, retain source/provenance, and avoid automatic merges based only on a shared name or uncertain phone formatting. Provide reviewed duplicate-merge/split tooling with an audit trail.

Capture delivery/contact information needed for service separately from marketing opt-in. Track channel-specific consent and suppression. Customer 360 should show consistent linked IDs and event timestamps, with permissions determining which staff see personal information.

**Acceptance:** a repeat verified customer can see related records without duplicate profiles; ambiguous matches do not expose another person's history; deleting or merging a contact does not orphan orders/tickets; marketing opt-out is respected by every sending path.

## 15. I13 — Analytics that explain outcomes

**Change:** define events for flow started, offering shown, selection confirmed, identity collected, review shown, confirmation succeeded/failed, abandonment, handoff and cancellation. Use stable flow/operation IDs and schema versions. Exclude test/demo traffic and deduplicate retries.

Build merchant-facing funnels from these events and actual committed transactions. Separate requested booking value, confirmed order value, paid revenue and estimated revenue. A restaurant with deferred bill discounts has no known final bill until a source supplies it.

Track model cost and latency alongside successful outcomes. Correct the admin MRR calculation to account for currency, interval, plan version and recurring versus one-off charges; the inspected revenue route currently sums plan prices for active subscriptions.

**Acceptance:** dashboard counts reconcile to sampled order/booking/ticket records; duplicate events do not inflate conversion; no mixed-currency sum is labeled a revenue total; partial/incomplete datasets are identified.

## 16. I14 — A central outbound delivery mechanism

**Change:** route transactional email, campaign sends, booking reminders and channel messages through a common operation ledger with provider-specific adapters. Record recipient, category, tenant, consent decision, quota reservation, provider ID, acceptance state and attempts.

Add sender readiness, bounce/complaint suppression, unsubscribe handling, duplicate protection, backoff, dead letters and unknown-outcome reconciliation. Keep SMTP outbound separate from inbound email ingestion. Queued campaigns recheck account state and suppression at execution.

**Acceptance:** retries do not double-count accepted sends; disconnected credentials stop affected jobs with actionable error; marketing cannot bypass quota by declaring itself transactional; a provider timeout does not trigger an unbounded duplicate send loop.

Provider-specific features and legal messaging requirements must be validated for the chosen launch channels before release; a generic adapter interface alone is not a verified integration.

## 17. I15 — Improve maintainability without a broad rewrite

**Change:** split large UI/domain files around clear boundaries: parsing, validation, transition, persistence and rendering. Introduce typed request/response schemas and shared card payload types. Keep one definition of booking/order status transitions and monetary calculations.

Add a migration ledger and schema-readiness check. Reconcile duplicate/legacy migration files before rollout. Document the required migrations per feature; return actionable readiness errors instead of suggesting rerunning every SQL file blindly.

Use existing business services and atomic RPCs. Avoid moving to microservices solely because the feature set is large. Extract a service only when measured deployment/scaling/team boundaries justify the operational cost.

**Acceptance:** domain tests exercise state transitions independently of React; payload validation rejects malformed cards/requests; a clean staging database and an upgraded existing database both reach the supported schema without losing data.

## 18. I16 — Operational support and recovery

**Change:** add an operator health view for provider connectivity, job queues, failed confirmations, reconciliation drift, retention status and schema compatibility. Propagate request/operation IDs through logs and audit events while redacting secrets and personal data.

Create runbooks for stale inventory holds, booking-provider mismatch, email delivery unknown, missed billing callbacks, duplicate contact reports and realtime outages. Add alerts with ownership and retry/repair actions, not only charts.

Define backup and restore objectives based on deployed capabilities; test a restore and replay durable jobs safely. Export/deletion jobs should be resumable, authorized and complete across database, storage, caches and external references.

**Acceptance:** operators can locate a failed customer operation by reference, understand its state and retry safely; a restore drill meets the chosen objectives; retention cleanup does not delete active ticket evidence.

## 19. I17 — Positioning, packaging and vertical templates

Offer three clear starting experiences: Restaurant Concierge, Conversational Store and Support Desk. Appointment businesses can use a service-booking preset. Each should configure the same core engine, with relevant defaults, sample data confined to test mode and a focused onboarding checklist.

Add outcome-focused dashboard summaries: bookings requiring attention, orders awaiting fulfillment, failed notifications and waiting customers. Make these actionable links rather than vanity totals. Put configuration options near the work they affect while keeping advanced settings discoverable.

Evaluate adoption by first successful flow, active operators, repeat transactions and retained paying workspaces. Validate tier allowances and upgrade prompts with pilot users rather than assuming every business needs the same feature bundle.

## 20. I18 — Later improvements worth validating

| Candidate | Value | Prerequisite / release condition |
| --- | --- | --- |
| Automated waitlist promotion | Fill canceled capacity | Atomic reallocation, customer confirmation deadline and deduplicated notification |
| Abandoned-flow recovery | Recover unfinished purchases/bookings | Consent, correct identity, no reservation guarantee after holds expire |
| Repeat booking/reorder | Reduce friction for returning customers | Verified identity, current price/stock/capacity revalidation |
| Staff-assisted cart/booking edit | Faster support | Shared transaction versioning and scoped permissions |
| Multilingual flows | Broader customer reach | Localized card labels, date/currency handling and language regression tests |
| Customer self-service portal | Reduce support load | Signed scoped access, identity verification and safe change policies |
| Real online payments/deposits | Reduce no-shows and close checkout | Provider implementation, verified callbacks, refunds and reconciliation |
| Custom roles/SSO | Enterprise readiness | Stable membership model and audited provisioning |
| A/B offer/copy experiments | Improve conversion | Reliable events, randomization, comparable cohorts and guardrails |
| Knowledge quality assistant | Improve answer coverage | Source provenance, unanswered-question evidence and human review before publication |

These are candidate extensions, not claims that they are currently missing everywhere or ready for release. Confirm the existing implementation before building a duplicate system.

## 21. Delivery sequence and ownership

| Release gate | Work | Accountable disciplines | Exit evidence |
| --- | --- | --- | --- |
| Gate A: trust and isolation | I01, I02, I05 | Backend/security, dashboard | Permission tests; no false-success/mock production views |
| Gate B: complete journeys | I03, I07, I08, I09 | Domain backend, widget, QA | Embedded shop/booking/return/handoff regression suite |
| Gate C: paid SaaS pilot | I04, I06, I14 | Billing/backend, product, messaging | Sandbox billing lifecycle; quota tests; successful onboarding |
| Gate D: measurable operations | I10, I11, I12, I13, I15, I16 | Full-stack, data, operations | Latency baseline; reconciled metrics; recovery drill |
| Gate E: differentiated growth | I17, selected I18 | Product, customer success, engineering | Pilot demand and measured improvement in customer outcomes |

Some work can overlap, but billing enforcement depends on correct tenant context, accurate analytics depend on stable event identities, and recovery automation depends on reliable notification/transaction state. Assign named owners and estimates after inspecting each implementation area in detail.

## 22. Success measures

Establish a pilot baseline before setting commercial promises. Report the following weekly with sample sizes and segmentation by channel/preset:

- New workspaces completing setup and a test transaction.
- Customer flow completion and failure by step.
- Confirmations with duplicate outcomes (target zero).
- Inventory/table overcommit incidents (target zero).
- Wrong-intent routing and recovery success on the evaluation set.
- First useful response latency and total transaction latency.
- Human response time and stuck outbound messages.
- Cost per completed customer outcome and per paying workspace.
- Trial-to-paid conversion and active workspace retention.
- Unauthorized access test failures and unresolved launch blockers.

Do not optimize response speed by skipping verification, or improve apparent conversion by counting uncommitted confirmations. Product metrics must preserve the business invariants in [the agent product brief](17-product-features-agent-brief.md).

## 23. Recommended first work package

Begin with explicit admin endpoint authorization, removal of false-success campaign execution, replacement of production mock fallbacks and a complete embedded-widget regression suite for one shop and one restaurant workspace. This package has clear evidence, protects user trust and reveals which broader changes are actually necessary.

Then implement the membership and subscription foundations using [the SaaS launch plan](15-saas-admin-launch-plan.md) and [tier enforcement specification](16-subscription-tiers-entitlements-spec.md). Keep this roadmap as a prioritized backlog; update status and measured outcomes as changes are delivered.
