# Booking-card latency remediation: implementation and measurements

Date: 2026-10-26

This document records the implementation adapted from `booking_bot_sub_second_turnaround_latency_remediation_plan.md`. It describes code that is now in the repository, the compatibility path used during rolling deployment, the card/regression coverage, and the measured production-build turnaround.

## Outcome

The booking pipeline now uses three bounded execution waves:

```text
Customer text or card action
  -> local HMAC/input/intent checks
  -> ingress wave
       - distributed rate limit
       - tenant/session/entitlement authorization
       - Redis flow state and route hints
       - cached bot booking bundle
  -> domain wave
       - one date-range occupancy RPC
       - in-memory slot/capacity/table computation
       - unchanged booking card construction
  -> commit wave
       - Redis state/replay update
       - one atomic PostgreSQL flow-turn RPC
  -> JSON card response
  -> best-effort realtime/cache fan-out
```

No booking, restaurant, commerce, return, order-tracking, offer, coupon, receipt, handoff, or widget card payload was removed. Existing component types and interaction contracts remain intact.

## Implemented changes

### Bounded booking bundle cache

`src/lib/chat/bookingBundleCache.ts` loads bot commerce configuration, active booking services, active offers and eligible coupons concurrently. It stores a tenant-and-bot-scoped serialized bundle in Redis for 120 seconds and in a bounded local cache of at most 128 entries / 8 MiB.

The cache preserves `Set` and `Map` fields when serializing configuration. Concurrent misses are deduplicated. Service, offer, coupon and bot-commerce mutations invalidate the affected bundle through the existing dashboard APIs.

### Range occupancy query and pure slot calculation

`supabase/098_booking_range_occupancy.sql` adds `get_booking_range_occupancy`. It:

- verifies that the service belongs to the supplied workspace;
- caps a request at ten days;
- returns confirmed bookings and unreleased restaurant table assignments in one query;
- is `SECURITY DEFINER` with a fixed search path; and
- is executable only by `service_role`.

`src/lib/booking.ts` adds `bookingSlotsRange()` and a pure `computeBookingSlots()` stage. One occupancy snapshot is reused for every visible date. Existing timezone/DST, notice, buffer, capacity, restaurant table combinations, location and external calendar rules are preserved.

The booking flow now fetches the initial seven-day range once, selects the first available date, and reuses the same snapshot to build the compact three-day scheduler. It no longer executes preliminary single-day availability requests before the scheduler query.

### Atomic flow-turn persistence

`supabase/099_atomic_flow_turn_persistence.sql` adds `persist_flow_turn_atomic`. In one transaction it:

- verifies workspace/context, bot and session scope;
- locks the session;
- locks the originating card selection;
- inserts all next cards, plus the user message on an initial text turn;
- updates `sessions.last_message_at`; and
- deliberately preserves an existing `human` or `waiting` handoff mode.

The function accepts at most 20 rows and is executable only by `service_role`. `src/lib/chat/persistFlowTurn.ts` uses it when installed and uses the existing safe parallel write path only when PostgREST reports that the new function is missing. Realtime and inbox cache invalidation run as best-effort fan-out after durable persistence.

### Parallel route ingress and commit

`/api/chat` starts deterministic route-state hints alongside rate/context work. A structured initial booking response persists the user message and all cards through the flow-turn persistence contract instead of using the older general multi-write logger.

`/api/chat/flow` overlaps authorization, revision/state work and booking-bundle warming. Redis state, replay state and durable card persistence are awaited as one commit wave.

Clear booking and commerce intents now route before the authoritative fact/RAG probe. Informational questions retain the fact path, while transactional requests avoid an unrelated database lookup.

### Rolling deployment behavior

Both database additions are backward compatible:

- without migration 098, occupancy uses bounded parallel, tenant-scoped range queries;
- without migration 099, message insert, card lock and session touch use the pre-existing safe parallel fallback;
- only missing-function/schema-cache errors activate fallback; other SQL errors are surfaced.

## Security invariants

- Every cache key contains the workspace and bot identity.
- Cached bundle identity is validated again after hydration.
- Occupancy reads are workspace/service scoped.
- Atomic writes verify workspace context, bot and session scope in PostgreSQL.
- Public, anonymous and authenticated roles cannot invoke either RPC.
- A flow write cannot reset human handoff state.
- Stale cards continue to use revision/action replay protection.
- Distributed rate limits and entitlement enforcement remain on the critical path.

## Card and behavior verification

`npm test` passes, including:

- booking parsing, branch retention and compact scheduling cards;
- phone/name/email/note/review/confirmation/cancellation flow;
- stale-card handling;
- restaurant best-fit table allocation, combinations and waitlist fallback;
- commerce carousel/cart/inventory/checkout/invoice behavior;
- order tracking and connected-order identity verification;
- zero-trust bootstrap and cache isolation;
- RAG evaluation: recall@5 `1.0`, MRR@5 `0.938`, faithfulness `1.0`, abstention accuracy `1.0`, and zero extraction-tag leaks; and
- range RPC tenant isolation, bounded windows, atomic multi-card insertion, card locking, context rejection, handoff preservation and role denial.

`npm run build` also passes optimized compilation, type/lint validation, all 187 static pages and build tracing.

## End-to-end production-build measurement

Tool: `scripts/benchmark-booking-card-latency.mjs` against `next start` and the configured hosted Supabase/Redis services. For JSON card endpoints, the response headers and body arrive together, so the first visible card time is the measured response-body time. This is a three-request diagnostic sample, not a percentile SLA.

| Sample | New session | Booking text -> branch card | Branch click -> scheduler card |
| --- | ---: | ---: | ---: |
| Cold | 2,432 ms | 5,658 ms | 2,407 ms |
| Warm 1 | 587 ms | 3,568 ms | 2,648 ms |
| Warm 2 | 851 ms | 2,916 ms | 2,842 ms |

Scheduler server timings:

- authorization: `1,072–1,521 ms`;
- revision claim: `85–105 ms`;
- complete booking domain/range/card work: `330–394 ms`;
- durable commit fallback: `819–879 ms`.

The scheduler computation itself is now below 400 ms in these samples. End-to-end sub-second response is not yet demonstrated because migrations 098 and 099 are not installed on the connected Supabase project and this local application is geographically separated from hosted dependencies. The implementation therefore used the intended safe fallback. The cold branch-card sample also paid a 1,691 ms initial bundle load; warm bundle lookup reported 1 ms.

## Deployment required for the new fast path

Apply migrations in numeric order through the authorized Supabase migration process:

1. `supabase/098_booking_range_occupancy.sql`
2. `supabase/099_atomic_flow_turn_persistence.sql`

Then deploy this application build in the same region as Supabase and Redis. Re-run the benchmark under realistic concurrency and retain p50/p95/p99. Verify that booking, restaurant combinations, discounts, add-ons, confirmation, cancellation and inbox handoff still pass in staging before production rollout.

