# Zero-Trust Service Boundaries and Production NFR/SLO Contract

Status: implemented baseline, with deployment controls required before launch  
Scope: dashboard APIs, founder administration, chat/widget runtime, commerce, bookings, tickets, campaigns, integrations, and future extracted services

## Current architecture and threat model

The product currently runs primarily as a Next.js application. `src/middleware.ts` is the first request boundary, but it is not the sole authority. Most database access uses a Supabase service-role client, which bypasses row-level security. Every management handler using that client must independently authenticate the caller, enforce workspace membership and permission, and constrain every resource query to the authenticated workspace.

Main threats:

- a protected handler invoked without the expected middleware path;
- a valid user changing `client_id`, bot, dataset, campaign, ticket, or database IDs to another tenant's values;
- an expired token, a token from another issuer, or a token intended for another audience;
- an internal service becoming publicly reachable after future extraction;
- service-role access turning one missing ownership filter into a cross-tenant disclosure or mutation;
- serial security checks degrading the customer chat hot path.

## Implemented trust chain

```text
Internet
  -> TLS/load balancer
  -> Next.js middleware (first-line auth, origin/CSRF and entitlement gate)
  -> route/service boundary (independent JWT and permission verification)
  -> resource ownership filter (trusted workspace ID)
  -> scoped Supabase service-role query or RPC
  -> audit event for high-risk actions
```

### JWT validation

`src/lib/security/jwtClaims.ts` and `src/lib/requestAuth.ts` require:

- cryptographically verified signature through Supabase `auth.getClaims()`;
- issuer equal to `SUPABASE_JWT_ISSUER`, or by default `<NEXT_PUBLIC_SUPABASE_URL>/auth/v1`;
- audience containing `SUPABASE_JWT_AUDIENCE`, default `authenticated`;
- a valid UUID subject;
- expiration later than the current time;
- `iat` and `nbf` not unreasonably in the future, with 60 seconds of clock skew.

Middleware, the SaaS authority, legacy auth adapter, and Meta client adapter use this verifier. Legacy `getUser()` network validation was removed from these shared paths.

### Authorization and tenancy

`getAuthenticatedWorkspaceUser()` performs one `saas_authorization_snapshot` round trip after local JWT validation. It fails closed unless the identity is unblocked, workspace membership is active, and the role or explicit permission allows the requested action.

`getAuthenticatedWorkspaceResource()` adds concrete ownership validation. Sensitive handlers derive tenancy from `actor.workspaceId`, not request `client_id`. Bot/dataset, bot/database, campaign/contact, ticket, knowledge, analytics, integration, and catalogue operations also validate related-resource ownership.

### Public and provider boundaries

Public does not mean trusted. Every non-login boundary requires its purpose-specific control:

| Boundary | Required control |
|---|---|
| Widget/chat session | signed expiring widget capability, origin allowlist, rate limit |
| Ticket status/CSAT | signed expiring purpose-bound ticket token |
| Payment submit/status | scoped payment/order token; no secret account data in responses |
| Provider webhook | provider signature plus replay/timestamp protection |
| QStash/worker/cron | QStash signature or dedicated worker/cron secret |
| Postal lookup/health | strict input limits, rate limit, no tenant data |

Capability tokens are not user JWTs and must never authorize management APIs.

## Deployment network controls

Application validation does not replace infrastructure isolation:

1. Expose only the load balancer/gateway and explicitly public webhooks.
2. Put extracted workers and services on private networks without public ingress.
3. Allow service ingress only from named gateway/service identities or security groups.
4. Use TLS everywhere; adopt mTLS or workload identity after service extraction.
5. Never expose service-role, payment encryption, or provider keys to browser bundles.
6. Give each extracted service a separate least-privilege credential.
7. Validate the user JWT at every synchronous service boundary. For jobs, use short-lived audience-bound service tokens containing actor, workspace, action, and expiry; never use an unsigned identity header.
8. Deny by default at firewall, proxy, database policy, and handler layers.

## Functional requirements: what the product does

- conversational RAG and knowledge answers;
- product discovery, recommendations, cart, coupon, address, payment, and order lifecycle;
- booking, service, and restaurant availability, offers, reservations, receipts, edits, and cancellations;
- tracking, returns, exchanges, complaints, evidence, tickets, and human handoff;
- contacts, consent, segmentation, inbox, and customer 360;
- email and WhatsApp campaigns, templates, audience selection, delivery, and suppression;
- bots, channels, integrations, datasets, databases, analytics, team access, and billing;
- founder controls for tenants, plans, entitlements, restrictions, identity actions, and audit.

## Non-functional launch targets: how well it must work

These are acceptance targets, not claims that production load testing has already proven them.

### Latency SLOs

| Operation | p50 | p95 | p99 | Measurement |
|---|---:|---:|---:|---|
| Warm deterministic chat/card | 350 ms | 1.2 s | 2.5 s | accepted request to visible text/card |
| Warm RAG first response | 900 ms | 2.5 s | 5 s | accepted request to first visible answer |
| Booking/product card | 500 ms | 1.5 s | 3 s | accepted request to usable card |
| Cached dashboard read | 250 ms | 1 s | 2 s | navigation to rendered data |
| Uncached dashboard read | 500 ms | 1.5 s | 3 s | navigation to rendered data |
| Optimistic mutation feedback | 50 ms | 100 ms | 200 ms | click to local confirmation |
| Authoritative mutation | 500 ms | 2 s | 4 s | click to server-confirmed state |

Security latency budget on protected management APIs:

- warm local JWT verification: p95 under 10 ms;
- authorization snapshot: p95 under 250 ms in-region;
- resource ownership lookup: p95 under 150 ms;
- no new JWT membership or ownership query on the public chat/RAG hot path.

Use asymmetric Supabase signing keys so `getClaims()` validates locally using cached JWKS. Legacy symmetric signing can require an Auth server call and must be migrated before performance certification.

### Availability and correctness

| Capability | Monthly SLO |
|---|---:|
| Widget boot and chat ingress | 99.90% |
| Order/booking/payment-confirmation mutations | 99.95% |
| Dashboard management APIs | 99.50% |
| Campaign dispatch control plane | 99.50% |

Correctness targets:

- zero cross-tenant reads or writes;
- 100% protected handler coverage by an in-handler identity/permission authority;
- 100% high-risk mutations use workspace-scoped filters and idempotency where retryable;
- atomic confirmed order/booking capacity changes prevent overselling;
- 100% provider callbacks verify signatures before mutation.

### Capacity targets

Initial launch test profile:

- 500 concurrent platform chat turns and a 5x ten-minute burst;
- 100 concurrent turns in one workspace without noisy-neighbor failure;
- 50 concurrent dashboard mutations;
- campaign fan-out stays queued and rate-limited rather than occupying web workers;
- include database pool, Redis/QStash, model-provider limits, and downstream timeouts.

Advertise higher capacity only after a production-like load test meets latency, error-rate, and correctness gates.

### Security and operations

- founder administration requires AAL2/MFA;
- secrets are encrypted at rest, rotated, and never returned to browsers;
- high-risk operations audit actor, workspace, target, action, and time;
- authorization dependency failure fails closed;
- dependency and secret scanning run in CI;
- backups are restore-tested at least quarterly;
- security alerts fire within five minutes, with a 15-minute critical acknowledgement target.

## Error budgets and release gates

A 99.90% monthly SLO permits about 43 minutes of failure in 30 days; 99.95% permits about 22 minutes. If more than half is consumed before mid-window, pause risky releases.

Block a release when any of these fail:

- TypeScript compilation;
- zero-trust claim and sensitive-boundary tests;
- cross-tenant negative tests;
- widget, booking, and commerce flow tests;
- p95 latency regression above 10% against the stored baseline;
- an unresolved high-severity dependency or secret finding.

## Observability

Record timings without PII:

- `auth.jwt_ms`, `auth.authorization_ms`, `auth.resource_scope_ms`;
- `chat.bootstrap_ms`, `chat.intent_ms`, `chat.retrieve_ms`, `chat.model_ttft_ms`, `chat.persist_ms`;
- `booking.availability_ms`, `commerce.search_ms`, `dashboard.query_ms`;
- route template, status family, cache state, workspace hash, and correlation ID.

Never put JWTs, email, phone, UPI, order payloads, provider secrets, or raw chats in metric labels.

## Configuration and verification

```ini
# Optional; inferred from NEXT_PUBLIC_SUPABASE_URL when empty
SUPABASE_JWT_ISSUER=
SUPABASE_JWT_AUDIENCE=authenticated
```

Before production:

- enable asymmetric Supabase signing and rotate legacy keys;
- configure exact app and widget origins;
- restrict internal ingress at the host/network layer;
- run `npm run typecheck` and `npm run test:zero-trust`;
- run cross-tenant and load tests in production-like staging;
- verify alerts, key rotation, backup restore, and incident runbooks.

## References

- Supabase JWT validation and `getClaims()`: https://supabase.com/docs/guides/auth/jwts
- Supabase signing keys and JWKS rotation: https://supabase.com/docs/guides/auth/signing-keys
- OWASP JWT Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/JSON_Web_Token_Cheat_Sheet_for_Java.html
