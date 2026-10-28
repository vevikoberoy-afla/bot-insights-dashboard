# Simultaneous chat execution: implemented architecture and measured results

Date: 2026-10-26

This document records the production code implemented from `simultaneous_execution_6s_to_sub_1_5s_bot_architecture.md`. It describes the code that now exists, the security-preserving adaptations made for this product, the measured result, and the deployment step still required to activate the database fast path.

## Outcome

The chat pipeline now overlaps independent work instead of waiting for it serially:

```text
Widget request
  -> local input checks + HMAC capability verification
  -> simultaneous wave 1
       - IP and session distributed rate limits
       - service-role, tenant-scoped turn-context RPC
       - one bounded Redis MGET for lead state + embedding cache
       - speculative embedding after the cache result
  -> deterministic flow gate or exact/pure cache gate
  -> simultaneous wave 2 for an uncached RAG turn
       - vector/hybrid retrieval
       - authoritative AI quota reservation
       - media preparation / lexical retrieval where applicable
  -> Gemini stream with conditional tools and extraction
  -> Next.js after() persistence, cache replication, contact stitching and realtime broadcast
```

No widget pictures, cards, card payloads, booking choices, commerce behavior, return behavior, order verification, handoff state, or dashboard UI were removed or redesigned by this change.

## Implemented changes

### 1. One database turn-context RPC

Migration `supabase/097_simultaneous_chat_turn_context.sql` adds the service-role-only function `load_chat_turn_context_atomic`.

One scoped call returns:

- effective SaaS entitlements;
- authoritative session and handoff mode;
- the joined contact, including intentionally null anonymous fields;
- bot runtime prompt/tone/flow/vision settings;
- active bot-linked dataset IDs, with the existing workspace-dataset fallback;
- an exact legacy FAQ match; and
- the workspace context identifier.

The function validates workspace, bot and session scope inside PostgreSQL. Execution is revoked from `PUBLIC`, `anon`, and `authenticated` and granted only to `service_role`.

`src/lib/chat/turnContext.ts` maps this payload into the existing bootstrap contract. During rolling deployment, only missing-RPC errors (`42883` or `PGRST202`) use the existing safe queries. Other database failures remain failures rather than silently bypassing authorization. Once a process observes that the migration is absent, it does not pay for the same missing RPC on every turn.

### 2. Rate limiting overlaps trusted context loading

The route verifies the HMAC widget capability before launching scoped context/embedding work. The two existing Upstash rate limiters retain their algorithms, namespaces, restrictive local fallbacks and 300 ms wait budget. At the same time, the route launches the turn-context RPC and bounded lead/cache read.

The route still rejects rate-limit failures before a paid chat model call. It also checks runtime entitlements before deterministic mutations or generation.

The blueprint's example replaced the established limiters with raw `INCR` counters. That was not copied because it would change rolling-window behavior and weaken an existing protection. The product keeps both limiters and gains concurrency without changing their semantics.

### 3. One bounded lead-state and embedding-cache read

`loadChatLeadState()` reads these values in one Redis `MGET`:

- session contact cache;
- 24-hour lead refusal;
- lead ask count;
- last ask turn;
- already-asked fields; and
- the embedding cache entry when the turn is a likely RAG turn.

The read has one 300 ms budget. On Redis degradation, the fallback suppresses lead prompts rather than forgetting a customer's refusal. Bot runtime configuration is no longer read from a second Redis copy because the joined database row is authoritative.

### 4. Speculative embedding and non-blocking replication

`src/lib/embeddings.ts` now has a bounded local embedding cache, an explicit cache-key function, a local peek, and a generation method. A likely RAG turn checks memory immediately, receives the Redis result through the combined MGET, and starts embedding generation on a miss while database context work is still running.

New vectors are placed into bounded process memory before returning. Redis replication is fire-and-forget, so a remote cache write no longer extends TTFT.

The cache is bounded at 256 entries and an estimated 2 MiB value budget with a 60-second local TTL. Redis retains the existing 24-hour embedding TTL.

### 5. Quota reservation overlaps retrieval

For streaming RAG turns, authoritative `saas_consume_usage` begins immediately before vector retrieval. Retrieval and quota authorization occupy the same wall-clock window. `generateAnswerStream()` awaits the reservation before invoking Gemini, so concurrent requests cannot overspend the final credit.

Streaming requests do not use the semantic response-cache branch, so the route never reserves and then returns a semantic-cache answer. Consequently no speculative quota refund mechanism was added. The supplied blueprint assumed a refund ledger/API that does not exist in this codebase; inventing a compensating increment would not be transactionally safe.

### 6. Conditional Gemini work

Ordinary FAQ and knowledge-base questions no longer attach the live-data tool. It is attached only for an unresolved live-data intent containing a plausible order, booking, ticket, tracking, stock or similar identifier. If deterministic lookup has already supplied live data, the tool is omitted.

The `[EXTRACT]` instruction is included only when the current turn may contain contact information or follows an active data-collection prompt. Existing extraction parsing and server-side tag stripping remain unchanged.

The low-latency stable model is the default, with deduplicated fallbacks. A timed-out provider request does not launch an overlapping second generation that could double latency and token cost.

### 7. Booking catalogue concurrency

When booking routing owns a turn, Redis state, bot commerce configuration, services, active booking offers and eligible coupons load concurrently. Existing availability, restaurant capacity, table combination, add-on inventory, discount, revision, confirmation, cancellation and receipt behavior is unchanged.

### 8. Response persistence stays outside TTFT

Static SSE completion work and normal streamed persistence use Next.js `after()`. Message writes, pure-cache replication, contact updates and realtime broadcasts do not delay the visible response. An immediate `stream-ready` SSE comment remains in place; measured TTFT counts the first visible `delta`, not that transport comment.

## Security and correctness adaptations

The following proposed shortcuts were intentionally not implemented:

| Blueprint suggestion | Product implementation |
| --- | --- |
| Raw Redis `INCR` replacement for rate limiting | Existing distributed limiter semantics and restrictive local fallback retained. |
| Cross-session answer cache without session/history/contact | Cache remains tenant, bot, session, runtime, history and contact scoped to prevent personalized or contextual answer leakage. |
| Quota refund through a new counter increment | Not added without an idempotent reservation/refund ledger. Quota is started only on the model path. |
| Trust the capability without database state | HMAC establishes identity, while database state remains authoritative for suspension, entitlement and handoff. |
| Attach tools to all generations | Tools are conditional; deterministic private-data verification is preserved. |

These adaptations trade an unrealistic benchmark shortcut for tenant isolation, immediate subscription enforcement, correct handoff behavior, and strict quota accounting.

## Measured local end-to-end result

Tool: `scripts/benchmark-chat-latency.mjs`, running the real Next.js development server against the configured Supabase, Redis and Gemini services. This is a small sequential sample, not a production percentile or SLA.

The connected hosted database did **not** yet have migration 097, so these requests used the compatibility bootstrap. The result therefore validates behavior and overlap but does not measure the new single-RPC database path.

| Scenario | Headers | First visible text | Complete | Source |
| --- | ---: | ---: | ---: | --- |
| Opening-hours query, cold answer cache | 4,519 ms | 5,483 ms | 5,544 ms | RAG |
| Immediate repeat, local pure-answer hit | 2,127 ms | 2,127 ms | 2,221 ms | Cache |

The cold timing reported:

- rate-limit parallel tail: 308 ms;
- identity/compatibility bootstrap parent: 1,274 ms;
- joined session query inside that parent: 877 ms;
- exact lookup: 443 ms;
- lexical retrieval tail: 375 ms;
- embedding tail: 2 ms because the speculative result was ready;
- hybrid retrieval: 1,317 ms;
- already-running quota tail at model gate: 0 ms;
- provider stream startup: 967 ms.

The immediate repeat spent 1 ms in the local answer cache, but still spent 1,773 ms enforcing authoritative workspace/session state through the compatibility database path. That is the main reason it is not yet a sub-450 ms end-to-end hit.

Booking-card measurements from the same server:

| Stage | Sample 1 | Sample 2 |
| --- | ---: | ---: |
| Session initialization, compatibility RPC | 2,250 ms | 2,628 ms |
| Booking intent to location card | 3,774 ms | 5,258 ms |
| Location selection to scheduler card | 7,161 ms | 5,850 ms |

The scheduler prefetches multiple dates in parallel. In these samples individual remote availability queries took about 0.87–1.50 seconds and the durable action/persistence path added additional hosted-database round trips. No claim of sub-1.5-second booking completion is made from these results.

## Why the blueprint target is not yet demonstrated

1. Migration 097 is not installed on the connected Supabase database, so the hosted run used the compatibility path.
2. Migration 096 is also not installed there, so widget initialization still reports `init_compatibility`.
3. Local development is geographically separated from the hosted database. Individual Supabase operations varied from roughly 0.4 to 1.7 seconds in this sample.
4. A cold RAG turn still needs provider embedding/retrieval and Gemini generation; provider time cannot be removed by JavaScript concurrency.
5. Security checks are real work. The system does not cache suspension/handoff state across customers merely to manufacture a low number.

After deploying migrations 096 and 097, benchmark a production build in the same region as Supabase and Redis and collect p50/p95/p99 under concurrency. Sub-1.5 seconds remains a target until that measurement proves it.

## Verification completed

`npm test` passed, covering:

- TypeScript compilation;
- zero-trust onboarding;
- eight RAG evaluation cases with recall@5 = 1, MRR@5 = 0.938, faithfulness = 1, abstention accuracy = 1 and no extraction-tag leak;
- deterministic chat fast-path contracts;
- tenant/session bootstrap and degraded-Redis behavior;
- local and Redis cache isolation;
- quota denial before model invocation and no double consumption with a pre-reserved quota;
- conditional live-tool behavior;
- bounded memory caches;
- commerce/cart/inventory/order confirmation;
- internal and connected order tracking with identity verification;
- booking and restaurant capacity;
- add-on inventory and cancellation restoration;
- notification tenancy; and
- transport/error classification.

The PGlite database test applies migrations 096 and 097, verifies atomic/idempotent session behavior, validates the combined turn payload, rejects a foreign tenant/session pairing, and confirms anonymous roles cannot invoke either service-role RPC.

`npm run build` also passed: optimized compilation, type/lint checks, all 187 static pages, and build tracing. The Umami messages only indicate optional analytics environment variables are absent.

## Deployment procedure

1. Apply migrations in order through the authorized Supabase migration process:
   - `supabase/096_fast_widget_bootstrap.sql`
   - `supabase/097_simultaneous_chat_turn_context.sql`
2. Configure the same strong `WIDGET_SESSION_HMAC_SECRET` on every application instance.
3. Deploy the application build.
4. Initialize a new widget session and verify `Server-Timing` reports `init_atomic`.
5. Send a RAG question and verify there is no compatibility `boot_session` timing; the response should include `boot_turn_context`.
6. Validate handoff from the inbox, a booking card action, a commerce cart action, a private order lookup, and a suspended workspace in staging.
7. Run both benchmark scripts from the production region and retain p50/p95/p99 results.

Rollback is application-safe: if migration 097 is absent during a rolling deployment, the route uses the existing joined bootstrap, entitlement, dataset and FAQ queries. The SQL function is additive and does not alter card schemas or stored customer data.
