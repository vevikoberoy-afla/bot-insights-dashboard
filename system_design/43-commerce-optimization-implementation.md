# Product recommendation and commerce optimization implementation

Date: 2026-10-26

This document records the implementation adapted from `product_recommendation_commerce_system_optimization_plan.md`, including security-preserving deviations and measured production-build results.

## Implemented

### Recommendation candidate guarantee

`src/lib/offeringDiscovery.ts` now treats a successful but empty/under-filled Hybrid RRF response as a recoverable miss. Fewer than three hybrid candidates are topped up with unique, active, in-stock, bot-scoped catalogue records up to the existing 15-candidate ceiling. The LLM still receives only real candidate IDs, selects at most five and has its output IDs validated server-side.

The existing five-minute tenant/bot/scope/query Redis recommendation cache is retained. Hybrid errors still use deterministic local ranking, and LLM failure still uses the deterministic introduction/reason fallback.

### Unified commerce bundle cache

`src/lib/chat/commerceBundleCache.ts` caches:

- bot commerce configuration and assignment allowlists;
- currently active product offers; and
- active coupon rules.

The key contains workspace and bot IDs. Stored bundle identity is checked before hydration. `Set` and `Map` fields are explicitly serialized and restored. The cache is bounded to 128 local entries / 8 MiB with a 120-second TTL, has a matching Redis tier and deduplicates concurrent cold loads.

Bot commerce settings, service/offer mutations and coupon create/update/delete operations invalidate both booking and commerce bundles. Current request entitlements are applied after bundle hydration, so a cached bundle cannot restore commerce access removed by the authoritative request context.

### Product snapshots and pure card transitions

When `product_grid` is rendered, the flow stores a compact, maximum-50-product snapshot containing the fields required for cart interactions: identity, label data, price, live availability snapshot, inventory flags and bounded variants.

Structured actions now reuse this snapshot for:

- grid quantity selection;
- single-product quantity actions;
- cart coupon/edit/checkout actions;
- offer choice;
- checkout details;
- review; and
- cancellation.

A new search still calls the bounded catalogue repository. Inventory holds and final commits remain authoritative database operations; cached availability is never accepted as proof that stock exists.

The cart-to-checkout transition now builds `checkout_form` from flow state without reloading the catalogue, offers or coupons.

### Parallel state and durable persistence

Commerce Redis state saving/deletion is returned as `_stateCommit`, matching the booking flow contract. `/api/chat` and `/api/chat/flow` await it concurrently with atomic card persistence and action replay storage rather than paying a serial Redis write before the commit wave.

For order card actions, `/api/chat/flow` preloads commerce state and the commerce bundle concurrently with the existing revision claim. The handler accepts these verified request-local values and avoids a second read.

The existing `persist_flow_turn_atomic` and `commit_chat_order` implementations remain the durable fast paths. No duplicate persistence or order RPC was introduced.

## Security-preserving adaptations

The supplied plan proposed trusting a 30-second cached authorization context for card actions. That shortcut was not implemented because it could temporarily miss:

- a workspace suspension;
- a removed commerce entitlement; or
- a human-agent takeover.

The current HMAC token proves capability identity, but database state remains authoritative for mutable access and handoff state. The optimized flow therefore retains the atomic authorization check on each action. This explains most remaining local-to-hosted latency.

The suggested claim that `persist_flow_turn_atomic` rejects human-mode sessions was also not assumed: the current function preserves handoff mode but does not authorize inventory mutations. Authorization is checked before the domain operation instead.

The SQL Hybrid RRF implementation already returns semantic top-K candidates without an aggressive cosine threshold, so no similarity-floor migration was required.

## Verification

`npm test` passed in full:

- TypeScript;
- zero-trust onboarding and bootstrap boundaries;
- RAG quality and isolation evaluations;
- recommendation scope, top-15 candidate bound and invented-ID rejection;
- empty successful Hybrid result fallback;
- catalogue/product cards and search;
- snapshot reuse with explicit assertions that selection and checkout do not reload catalogue data;
- inventory hold, multi-item cart, coupons, upsell and offers;
- stale-action protection;
- contact checkout, invoice, atomic order/stock update and receipt;
- cancellation/hold release;
- order tracking and identity verification;
- booking, restaurant and notification regressions.

`npm run build` passed optimized compilation, type/lint validation, all 187 static pages and build tracing.

## Production-build measurements

Benchmark: `scripts/benchmark-commerce-card-latency.mjs` against the optimized `next start` build on port 3001 with hosted Supabase/Redis. Each run selected a real product, rendered cart and checkout, and cancelled to release the hold.

| Operation | Previous final baseline | Optimized cold | Optimized warm |
| --- | ---: | ---: | ---: |
| Widget initialization | 2,280 ms | 2,575 ms | 1,053 ms |
| Lamp query -> three-product grid | 4,374 ms | 5,950 ms | 2,816 ms |
| Select product -> cart | 3,599 ms | 3,119 ms | 2,971 ms |
| Cart -> checkout form | 2,970 ms | 2,272 ms | 2,619 ms |
| Gift recommendation -> cards | failed at 3,084 ms | 8,877 ms, five cards | 2,658 ms, five cards |

The correctness target is achieved: the gift request returns a text introduction plus five real product cards.

Domain timings show the implemented savings:

- selection-to-cart domain work decreased from 1,329 ms to 411–550 ms;
- cart-to-checkout domain work decreased from 1,089 ms to 60–100 ms;
- the warm gift result uses the five-minute recommendation cache and completes in 2,658 ms end to end.

End-to-end sub-second turnaround is not demonstrated in this environment. Warm card clicks still spend approximately 1.1–1.5 seconds in remote authorization and 0.67–0.97 seconds in durable hosted-database persistence. Removing those checks would create correctness and takeover risks. Co-locating the application, Supabase and Redis and applying migrations 097–099 are required before setting a production p95 target.

## Files

- `src/lib/offeringDiscovery.ts`
- `src/lib/chat/commerceBundleCache.ts`
- `src/lib/commerceFlow.ts`
- `src/app/api/chat/flow/route.ts`
- `src/app/api/bots/[id]/commerce-config/route.ts`
- `src/app/api/features/[kind]/route.ts`
- `src/app/api/settings/coupons/route.ts`
- `scripts/test-offering-discovery.cjs`
- `scripts/test-commerce-flow.cjs`
- `scripts/benchmark-commerce-card-latency.mjs`

