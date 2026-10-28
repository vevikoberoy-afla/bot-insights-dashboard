# Chat latency remediation: implementation and measured results

Date: 2026-10-26. Scope: the existing embedded widget, `/api/chat/init`, streaming `/api/chat`, session/contact bootstrap, and RAG caches.

## Status and deployment requirement

The application changes are implemented. Unit/regression tests and real HTTP/SSE measurements were run against the local Next.js application with its configured Supabase, Redis, and Gemini services.

**Apply `supabase/096_fast_widget_bootstrap.sql` in the Supabase SQL editor before expecting single-RPC initialization.** The connected database does not have this RPC yet. No direct database migration credentials were available to apply it here. The migration was executed and tested in a local PostgreSQL-compatible PGlite fixture, not in the hosted database. All live results below therefore used `init_compatibility`, not `init_atomic`.

The blueprint's 250 ms cached replies / 1.6 s uncached replies are targets, not achieved results or SLAs. These are small sequential development-server samples, not production load-test percentiles.

## Implementation map

| Area | Implemented behavior |
| --- | --- |
| Anonymous initialization | Service-role-only transactional RPC creates/reuses contact and session, locks the session identifier, rejects tenant/bot collisions, and preserves human handoff mode. |
| Identified visitors | Continue through `upsertCustomerContact` so canonical identity stitching is preserved. |
| Rolling deployment | Missing-function errors use the compatibility path; actual database failures do not silently issue tokens for unpersisted sessions. |
| Background init work | Redis client/bot/contact warming and Chatwoot provisioning run through Next.js `after()`. |
| Browser history | Brand-new sessions skip the empty history-sync request. Existing sessions still synchronize; realtime subscriptions remain. |
| Per-message bootstrap | One tenant-and-bot-scoped session query joins contact and bot runtime settings. It runs alongside entitlement loading and the bounded Redis batch. |
| Anonymous contact fields | Null email/phone are valid hydrated values, not reasons to issue another contact query. Joined database state remains authoritative. |
| Redis batching | One six-key read for contact, lead pacing/refusal, and bot context; 300 ms wait budget. A timeout suppresses lead capture rather than forgetting refusal. |
| Rate limiting | Distributed limiters have a 300 ms wait budget, retaining existing restrictive local fallbacks. |
| Answer caching | Pure streaming RAG answers use a 60-second session/tenant/bot-scoped key, including conversation context, runtime settings and known contact fields. Immediate local writes make back-to-back repeats hit. |
| Cache exclusions | No caching of errors, handoffs, image responses, extracted contact details, deterministic transactions, order lookups, or LLM live-data tool results. |
| Lead capture | The scheduled prompt is appended outside the cached answer. Current refusal, maximum asks and cooldown apply, including discount hooks. |
| Embeddings | Bounded local cache plus existing Redis cache; new vectors enter local memory immediately, with a bounded 200 ms Redis write wait. |
| Streaming | Flush an SSE comment before awaiting model startup. Actual visible text still waits for model output. Completion events include final timing information. |
| Unused work | Streaming requests no longer read the legacy shared answer cache or semantic answer cache that they cannot safely reuse. |
| Paid-call security | Invalid widget capabilities cannot launch speculative embeddings. Atomic AI quota authorization still precedes model generation. |

### Memory bounds

New answer and embedding caches each have at most 256 entries, a 2 MiB estimated-value budget, and a 60-second lifetime. Combined value budget is 4 MiB per process, plus map/key/runtime overhead—not an assertion that total application RAM is 4 MiB. There are no new polling loops, background intervals, or package dependencies.

Timeouts bound how long the request waits; they do not cancel already-issued SDK network requests. Event-loop scheduling can make a nominal 300 ms budget appear as 302–306 ms.

## Adaptations from the supplied blueprint

1. Migration number 091 already exists. The new migration is 096 and uses the real schema (`clients.context_id`, actual bot configuration fields, and `source_channel='web'`).
2. Rich visitor identity remains with the existing contact stitcher rather than duplicating its merge rules in a simplified SQL function.
3. Paid generation does **not** run before authoritative quota consumption. A preliminary entitlement check alone cannot prevent concurrent requests from overspending the last credit. Actual quota timing was about 196–241 ms in these samples, not the assumed 1.5–2.5 seconds.
4. Personalized/contextual answers are not shared across visitors. Short-lived repeat caching is scoped to the session, bot, tenant, runtime and contact context. Identical trailing question/answer pairs are removed when calculating an immediate-repeat key.
5. Punctuation and numbers are not stripped from cache keys: doing so can conflate identifiers, decimal amounts and distinct questions. Whitespace/case normalization is used for pure-answer keys; embedding hashes retain their existing semantics.
6. Bot settings and contact fields come from the joined authoritative row rather than trusting an old Redis value. This also avoids stale handoff/contact data being hidden by a cache optimization.

## Measured end-to-end results

Measurement tool: `scripts/benchmark-chat-latency.mjs`. TTFT here means elapsed time from submitting the HTTP request until the first nonempty SSE `delta`, not receipt of headers or the `stream-ready` comment. Initialization is measured separately. The benchmark creates an anonymous session and writes normal test messages/contacts; it does not place orders or confirm bookings.

Historical baseline is from `35-customer-message-to-reply-latency-timeline.md`. The final four-query development-server run after the latency changes was:

| Scenario | Historical first visible text | New headers | New first visible text | New completion | Source |
| --- | ---: | ---: | ---: | ---: | --- |
| Grounded discount/minimum-order question, session cache miss | 9,825 ms | 3,106 ms | **4,683 ms** | 4,720 ms | RAG |
| Immediate repeat of that question | 6,104 ms | 1,011 ms | **1,012 ms** | 1,138 ms | Cache |
| Opening-hours question, cache miss | 8,554 ms | 1,760 ms | **3,101 ms** | 3,144 ms | RAG |
| Immediate repeat of opening-hours question | 2,546 ms | 855 ms | **855 ms** | 983 ms | Cache |

Final-run initialization: **2,975 ms**, including transport/framework overhead; `init_compatibility;dur=2677`. The first compilation-inclusive initialization during testing took 5,807 ms. Later compatibility initializations ranged from 2,350–2,975 ms. **Atomic initialization latency remains unmeasured until the migration is applied.**

Across the tuning runs, grounded first answers ranged from 3,779–4,751 ms; immediate grounded repeats ranged from 594–1,410 ms. General first answers ranged from 3,078–3,206 ms and their repeats from 848–875 ms. Code and network conditions changed between tuning runs, so these ranges are observations, not statistical distributions.

The grounded response correctly returned `BOGO23` with an order threshold of `4500`. Opening hours were absent from the knowledge base; the bot abstained rather than inventing hours. Current lead prompts can differ on repeated answers because they are recomputed outside the pure cache.

## Final grounded request: ordered timing breakdown

| Order | Stage | Measured time | Interpretation |
| --- | --- | ---: | --- |
| 1 | CORS | 0 ms | Rounded server timing |
| 2 | Rate limiting | 306 ms | Distributed wait budget / local fallback |
| 3 | Identity and parallel bootstrap wave | 500 ms | Includes entitlement work and the session join |
| 3a | Joined session/contact/bot SQL | 496 ms | Child of the parallel wave; **do not add again** |
| 3b | Batched Redis lead-state read | 302 ms | Overlaps SQL; **do not add again** |
| 4 | Remaining bootstrap policy | 2 ms | Follow-up contact and bot queries both 0 ms |
| 5 | Flow routing | 2 ms | No transaction flow for this question |
| 6 | Pure answer cache miss | 302 ms | Optional remote cache wait |
| 7 | Exact legacy FAQ lookup | 221 ms | Preserves existing FAQ behavior |
| 8 | Remaining lexical/dataset wait | 265 ms | Early work may already have run in parallel |
| 9 | Remaining embedding wait | 755 ms | Residual wait for speculative embedding, not total embedding API duration |
| 10 | Vector/hybrid retrieval | 292 ms | Grounding chunks |
| 11 | Model startup total | 1,579 ms | Parent bucket |
| 11a | Atomic quota authorization | 196 ms | Child of model startup; **do not add again** |
| 11b | Provider stream startup | 1,381 ms | Child of model startup; **do not add again** |
| 12 | Framework, transport and uninstrumented remainder | About 459 ms | Difference between serial parent buckets and visible TTFT; not attributed to a specific provider |
| 13 | Remaining visible stream | 37 ms | First visible delta to done |

The repeated answer spends 1 ms in the local answer cache, but still checks rate limits and authoritative session/entitlement state. Its session join took 669 ms. A zero-millisecond answer-cache hit does not mean zero-millisecond end-to-end response.

### Remaining latency causes

- Variable remote SQL latency: joined session reads still measured roughly 239–992 ms across samples.
- Model-provider startup: about 1.07–1.38 seconds in instrumented samples.
- Remote cache misses and exact FAQ lookup still cost network round trips.
- Embedding/dataset/lexical work overlaps bootstrap but sometimes remains incomplete when needed.
- Local development compilation/framework overhead is not production latency.
- Applying migration 096 removes initialization round trips but does not remove per-message security checks or Gemini latency.

Do not bypass session verification or quota gates to manufacture a sub-250 ms result. Next steps are deploying the migration, measuring in the intended hosting region near Supabase/Redis, and collecting production-like concurrency percentiles.

## Tests and reproducibility

The optimized production build also passed: compilation, type/lint checks, and all 187 static pages. Umami warnings mean optional analytics credentials are absent; they did not fail the build.

The first production runtime test returned HTTP 503 because `WIDGET_SESSION_HMAC_SECRET` is not configured in `.env.local`. This is the existing fail-closed production signing requirement. A later production benchmark used a random secret passed only to that test server process; no persistent secrets or environment files were changed. Configure a strong persistent secret of at least 32 characters through the deployment secret manager before launch, consistently across instances.

Production-build benchmark (same remote services, local `next start`):

| Scenario | Headers | First visible text | Completion |
| --- | ---: | ---: | ---: |
| Grounded first question | 2,247 ms | 3,470 ms | 3,568 ms |
| Grounded cached repeat | 764 ms | 764 ms | 856 ms |
| Opening-hours first question | 2,080 ms | 3,400 ms | 3,402 ms |
| Opening-hours cached repeat | 606 ms | 607 ms | 701 ms |

Initialization remained the compatibility path: 3,225 ms total / 3,115 ms server duration. In the grounded request, quota authorization took 219 ms and provider startup 1,005 ms. This sample preceded the final no-lead-prompt-on-unknown-answer guard, which preserves the old policy while keeping the same latency architecture.

Commands used:

```bash
npm test
npm run test:chat-bootstrap
npm run test:flow-persistence
npm run typecheck
git diff --check
node scripts/benchmark-chat-latency.mjs \
  'What discount code can I use and what is the minimum order?' \
  'What discount code can I use and what is the minimum order?' \
  'What are your opening hours?' \
  'What are your opening hours?'
```

The dedicated bootstrap suite tests joined loading, degraded Redis refusal safety, missing/foreign sessions, cache isolation, immediate cache hits, quota denial before provider calls, live-tool cache exclusion, SQL initialization idempotence, tenant collision rejection, opt-in defaults, handoff preservation and anonymous-role permission denial.

The existing suite passed type checking, zero-trust onboarding, eight offline RAG evaluation cases, cache bounds, email transport, offering discovery, commerce, order tracking, booking, restaurant capacity, add-on inventory, and notification tests. These are regression/fixture checks, not a claim that every UI or external channel was exercised live.

## Deployment check

1. Configure a persistent `WIDGET_SESSION_HMAC_SECRET` and apply migration 096 using an authorized Supabase SQL editor connection.
2. Deploy the application changes. Compatibility initialization permits deploying either side first.
3. Initialize an anonymous widget session and confirm the `Server-Timing` header says `init_atomic`.
4. Repeat initialization for that session: it must retain the same contact and return `isNewSession=false`.
5. Confirm existing history, live inbox handoff, lead refusal, booking and checkout remain functional in staging.
6. Repeat the benchmark on the production build and intended hosting region. Never treat the early SSE comment as first visible text.
