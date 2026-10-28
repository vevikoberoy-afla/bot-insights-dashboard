# Dashboard and chatbot latency investigation

Date: 2026-10-25

## Measurements

Read-only checks from the development machine, outside the network sandbox:

| Operation | Sample 1 | Sample 2 | Sample 3 |
| --- | ---: | ---: | ---: |
| Supabase clients select id, limit 1 | 1850 ms | 1179 ms | 623 ms |
| Redis PING | 6448 ms | 4405 ms | 2992 ms |

These measure end-to-end SDK/network time, including connection setup where applicable. They do not isolate SQL execution or prove a particular hosting region is responsible. Initial sandbox-blocked fetch failures were excluded.

Redis itself is on the critical path for flow state, action revisions, rate limits, and reply replay protection. Multiple sequential network calls at these observed latencies explain why an action without an LLM can still take seconds. Database round trips add further delay. Next development request durations also include development overhead; streaming request duration includes generating the complete answer and is not the same as time to first visible text.

## Implemented changes

- Dashboard workspace authentication overlaps identity restriction and membership reads, after verified authentication. Both still fail closed.
- Workspace state reuses the fresh entitlements returned by authorization instead of recalculating them. Authorization and state-data durations are exposed in Server-Timing.
- Authorization overlaps assurance lookup with the workspace snapshot; master administration still requires MFA.
- Workspace refresh has a five-second attempt cooldown, in addition to its existing in-flight guard and five-minute polling. The current provider does not contain a rapid periodic poll. Multiple tabs, focus events, old client bundles, or explicit refresh callers require browser initiator inspection to distinguish.
- Card actions overlap rate limiting and authorization reads, reusing the verified session for persistence.
- Card persistence overlaps durable message insertion, session timestamp update, and previous-card locking. Prior-card lookup excludes newly inserted cards. Persistence does not overwrite human handoff mode.
- Flow responses expose cors, authorization, revision_claim, domain_flow, persistence, and replay_cache durations in Server-Timing, plus existing request-context timings.
- Informational RAG starts dataset/lexical retrieval while session processing runs.
- Optional embedding, dataset, bot-context, and exact-answer cache reads have a 300 ms wait budget. Dataset cache writes no longer delay retrieval. A timeout does not cancel the underlying SDK request. Transaction state, identity, and revision protection are not bypassed.

## Validation

TypeScript and existing chat fast-path, commerce, booking, zero-trust, and offline RAG checks passed. A new flow persistence test checks concurrent durable operations, verified-session reuse, previous selection metadata, and preservation of human handoff mode.

Offline RAG evaluations are fixture checks, not live LLM latency measurements. No customer order or booking was created to benchmark this change. Full authenticated widget before/after response latency remains unmeasured.

## Remaining deployment work

Check Redis and Supabase region placement relative to the application server and investigate the development machine's network/VPN/proxy route. A multi-second Redis PING is a material infrastructure bottleneck; application changes alone cannot guarantee fast transactional turns while it persists. Benchmark from the intended production region before deciding to move resources.

For an actual widget request, inspect Network → response headers → Server-Timing. For RAG streaming, separately measure first visible text and stream completion. For repeated workspace requests, inspect the browser Initiator column and open tabs. Compare a production build with development only after separating these network timings. Do not cache or remove authorization checks simply to improve the headline duration.
