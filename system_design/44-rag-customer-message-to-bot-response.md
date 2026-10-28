# RAG pipeline: customer message to bot response

Date: 2026-10-26

## Scope

This document describes the currently implemented web-chat RAG request lifecycle, beginning when a customer submits a message and ending when the bot response is rendered and persisted. It also shows where transactional booking, commerce, returns, tracking and ticket flows bypass RAG.

Primary implementation:

- `src/components/chat/ChatWidget.tsx`
- `src/app/api/chat/init/route.ts`
- `src/app/api/chat/route.ts`
- `src/app/api/chat/flow/route.ts`
- `src/lib/chat/turnContext.ts`
- `src/lib/chat/bootstrap.ts`
- `src/lib/chat/answerCache.ts`
- `src/lib/chat/ragOptimization.ts`
- `src/lib/embeddings.ts`
- `src/lib/gemini.ts`
- `src/lib/datasource.ts`

## High-level design

```mermaid
flowchart TD
    A[Customer submits text or media] --> B[Widget optimistic message]
    B --> C[POST /api/chat with HMAC session capability]
    C --> D[Parse, normalize, CORS and local validation]
    D --> E[Parallel rate limits and tenant/session context]
    E --> F{Session in human mode?}
    F -- Yes --> G[Persist incoming message for agent; bot stays silent]
    F -- No --> H{Deterministic intent or active flow?}
    H -- Yes --> I[Booking, commerce, returns, tracking or ticket state machine]
    I --> J[Structured card response]
    H -- No --> K{Pure answer / exact FAQ hit?}
    K -- Yes --> L[Static SSE response]
    K -- No --> M[Dataset resolution and lexical retrieval]
    M --> N[Embedding cache or Gemini embedding]
    N --> O[Hybrid pgvector retrieval; top five chunks]
    O --> P[Quota reservation and prompt synthesis]
    P --> Q[Gemini streaming generation]
    Q --> R{Live-data tool call?}
    R -- Yes --> S[Verified connected data lookup and follow-up generation]
    R -- No --> T[SSE delta stream]
    S --> T
    T --> U[Strip extraction metadata and send done event]
    U --> V[Widget renders bot reply]
    U --> W[after(): messages, cache, CRM extraction and realtime fan-out]
```

## 1. Widget session bootstrap

Before the first message, the widget calls `POST /api/chat/init` with the bot ID and a browser-generated session ID.

The preferred path calls `init_widget_session_atomic` from migration 096. In one database transaction it:

1. validates the bot and owning workspace;
2. locks the external session identity;
3. refuses reuse by a different bot or tenant;
4. reuses or creates the anonymous contact;
5. reuses or creates the chat session;
6. preserves `human` or `waiting` mode; and
7. returns bot, client, contact, session and context data.

The route signs an HMAC-SHA256 widget capability containing workspace, context, bot, session, purpose, issued time and expiry. The browser must present it on chat, flow and media requests. Production fails closed if `WIDGET_SESSION_HMAC_SECRET` is missing or too short.

Redis warming and optional Chatwoot provisioning happen after the initialization response. Redis is an accelerator, not the authority for tenant or session ownership.

## 2. Customer-side submission

When a customer presses Send, `ChatWidget.tsx`:

1. creates stable client-side IDs for the user and pending bot messages;
2. appends the customer bubble immediately;
3. displays the typing/loading state;
4. sends `POST /api/chat?ctx=<context>&bot=<bot>&stream=true`;
5. attaches `X-Widget-Session-Token`;
6. includes the session ID, current question, bounded history and active flow identity; and
7. includes scoped media metadata when a customer uploads an image.

The customer does not wait for the database before seeing their own message.

## 3. Request gateway and security gates

The API performs local checks before paid or tenant-sensitive work:

- calculate configured CORS headers;
- parse the request once;
- normalize the channel, session, context and bot;
- trim and cap customer input;
- reject malformed, empty, spam-like or abusive payloads;
- verify the HMAC token locally;
- ensure token workspace, bot and session match the request; and
- prevent media paths from escaping the current session prefix.

IP and session distributed rate limits execute concurrently with a 300 ms wait budget. Restrictive local limiters are used if the remote limiter is unavailable.

An invalid capability cannot start embedding or Gemini generation.

## 4. Tenant, session and runtime context wave

After the capability is valid, the route starts independent context work together:

- `load_chat_turn_context_atomic` from migration 097;
- bounded Redis lead/contact state;
- speculative deterministic route-state hints;
- active dataset resolution for likely RAG messages; and
- speculative embedding-cache lookup for likely RAG messages.

The atomic turn-context result contains:

- current workspace context;
- effective SaaS entitlements;
- session identity and current `ai`, `waiting` or `human` mode;
- contact identity fields;
- bot prompt, tone, response length, emojis, flow and vision settings;
- linked dataset IDs; and
- an exact configured FAQ result when present.

If migration 097 is missing, the route uses the older tenant-scoped queries. Other database errors are not silently treated as authorization success.

Suspended workspaces, stopped restriction stages and disabled bot runtime access receive an unavailable response before generation.

## 5. Contact and lead state

The route hydrates known name, email and phone fields from the authoritative session/contact join, then applies safe regex extraction to the current natural-language message.

Protocol labels from interactive cards—such as `Confirm`, `Refund` or `Damaged`—are never interpreted as customer names.

Lead-capture state tracks:

- whether the customer declined;
- how many prompts were shown;
- the last prompt turn; and
- fields already requested.

A refusal is retained for 24 hours. The system allows at most two asks with a two-turn cooldown. Lead prompts are added after the pure answer and are not embedded inside reusable cached answer values.

## 6. Handoff and deterministic routing

Before RAG, the system checks whether another subsystem owns the message.

### Existing human takeover

If the session is already `human` or `waiting`, the customer message is persisted for the inbox and the AI returns no response. This prevents a bot from talking over an agent.

### Explicit handoff

An explicit human/agent request starts waiting mode and produces the configured handoff response.

### Deterministic state machines

The support router checks active state and intent for:

- order status and tracking;
- product recommendation, cart and checkout;
- appointment and restaurant booking;
- returns, refunds and tickets;
- authoritative price/stock fact cards; and
- support-bot identity verification.

These paths return structured cards or verified operational answers without asking an LLM to invent stock, pricing, slots, totals, order status or ticket state. Flow actions use `/api/chat/flow`, revision CAS, replay protection and atomic domain operations.

Only a message not claimed by one of these paths enters general RAG.

## 7. RAG query preparation

`canonicalizeQuery()` produces:

- a stable lowercase/whitespace-normalized question; and
- an entity signature retaining negations, numbers and short locations.

The entity signature prevents semantically similar but operationally different questions from sharing unsafe semantic-cache entries.

For short pronoun-heavy follow-ups, `buildRetrievalQuery()` adds the most recent customer subject. Full questions remain unchanged.

## 8. Answer cache hierarchy

### Pure-answer cache

The first reusable response tier is `chat_pure_v3`:

```text
chat_pure_v3:<workspace>:<bot>:<shared-or-session>:<sha256>
```

Standalone factual questions without pronouns, customer identifiers, numbers or transactional intent use the `shared` bot scope and deliberately exclude conversation history. Operational, personalized and referential questions remain session scoped. The digest retains the normalized question, bot runtime configuration and known contact shape, plus relevant history for contextual turns. Answers never cross workspaces or bots.

- local cache: maximum 512 entries, estimated 4 MiB, one hour;
- Redis cache: one hour;
- immediate local write when generation finishes;
- lead prompts are calculated separately on every turn.

The cache excludes failed generation, handoff, extraction-bearing output, media, live-data tool output and personalized transactional results.

### Exact FAQ and legacy cache

An exact configured FAQ can return before embedding. Non-streaming integrations may also use the older exact Redis and semantic query caches. Streaming webchat deliberately avoids shared cache paths that cannot preserve lead/contact isolation.

## 9. Dataset and lexical retrieval

Active datasets are resolved from explicit bot assignments, with the existing workspace fallback where configured.

Lexical search starts early for likely informational turns and overlaps bootstrap. It provides useful chunks without waiting for an embedding when product names, policy phrases or exact terms match.

`pruneRetrievedChunks()` retains at most five results. It keeps the strongest result and removes the low-similarity tail using a floor based on the leading score.

If lexical retrieval produces adequate results, the route can skip vector embedding for that turn.

## 10. Embedding pipeline

When vector retrieval is required, the system uses `gemini-embedding-001` with `outputDimensionality: 768`, matching Postgres `vector(768)` columns.

Lookup order:

1. request-prefetched vector;
2. bounded in-process cache;
3. Redis cache with a 300 ms timeout;
4. Gemini embedding API.

The local embedding cache is capped at 256 entries / approximately 2 MiB / 60 seconds. Redis retains vectors for 24 hours. A newly generated vector is placed in memory before the Redis replication, so the remote cache write does not delay TTFT.

## 11. Hybrid vector retrieval

The route calls the dataset-scoped hybrid RPC when datasets exist:

```text
match_chunks_by_datasets_hybrid(
  dataset IDs,
  768-dimensional embedding,
  lexical query,
  limit 5
)
```

If no explicit datasets exist, it uses the context-scoped hybrid RPC. During rolling deployment, only a missing hybrid function falls back to the vector-only RPC.

For non-streaming requests, semantic query-cache lookup and vector retrieval run concurrently. Semantic cache requires a similarity threshold of 0.92 and the same entity signature. Streaming webchat skips that semantic-response tier and proceeds with retrieved chunks.

Retrieved text and source URLs are treated as untrusted factual context. Instructions contained inside a document cannot override system, authorization or privacy rules.

## 12. Connected live data

Order, ticket, booking, inventory and connected-database lookups can enter through deterministic resolvers before RAG.

The Gemini `fetch_live_data` tool is attached only when:

- live operational intent is detected;
- a plausible identifier is present; and
- a deterministic lookup has not already supplied the data.

If Gemini requests the tool, the backend calls `handleFetchLiveData()`, encloses the result in an untrusted-data boundary and performs one follow-up model turn.

Customer-specific order/ticket data remains subject to server-side verification. The LLM cannot grant itself permission to reveal a private record. Live-tool answers are never placed in the pure-answer cache.

## 13. Prompt assembly

`buildUnifiedSystemPrompt()` folds the following into one generation request:

1. bot identity and workspace instructions;
2. configured tone, response length and emoji preference;
3. known customer context;
4. security rules and unknown-answer policy;
5. up to five retrieved knowledge chunks inside an untrusted boundary;
6. verified/prepared live database facts inside a separate untrusted boundary;
7. bounded conversation history; and
8. optional silent contact-extraction instructions.

This is one primary generation pass, not an agent loop. Tool calling adds a second pass only when live data is actually requested.

## 14. Quota and Gemini generation

For streaming RAG, quota enforcement no longer makes every generation wait for a PostgreSQL usage RPC. The route uses `reserveAiUsageFast()`:

1. a small process-local permit is consumed synchronously when one was already allocated;
2. otherwise an atomic Redis script grants at most a three-credit local batch from an eight-credit reconciliation window;
3. when no safe permit window exists, `saas_consume_usage` performs an authoritative PostgreSQL synchronization;
4. every fast permit receives a unique operation ID and is written to the durable usage ledger in `after()` after the visible reply; and
5. a rejected durable write blocks more fast permits and forces the next request back through the authoritative path.

This removes the database quota RTT from ordinary messages while keeping drift bounded. Redis failure fails over to PostgreSQL. Answer-cache hits do not consume an AI credit because no provider generation occurs.

The default model is `GOOGLE_MODEL` or `gemini-3.5-flash-lite`. Documented fallbacks are deduplicated from:

- `gemini-flash-lite-latest`;
- `gemini-3.6-flash`.

Initial model startup is bounded between 2 and 8 seconds, with a default of 4.5 seconds. A timed-out SDK request does not start an overlapping fallback generation because that could double latency and token usage. Recognized provider-unavailable errors may advance to the next model.

Generation is capped at 512 output tokens. Images up to 5 MiB can be supplied inline when the bot has vision enabled and the storage path is scoped to the session.

## 15. SSE response path

The server immediately opens a `text/event-stream` response and sends:

```text
: stream-ready
```

This confirms the connection but is not visible TTFT.

Gemini text is emitted as:

```text
data: {"delta":"partial answer"}
```

The stream transformer buffers possible `[EXTRACT]` prefixes. Once `[EXTRACT]` is found, extraction JSON and every later extraction token are suppressed from the customer stream.

After generation, the server:

- parses and validates extraction metadata;
- appends an eligible lead prompt;
- determines `ai`, `waiting` or unavailable mode;
- places safe pure output in the local cache; and
- emits the final `done` event with source, source URL, mode and timing data.

The customer sees text progressively rather than waiting for the entire answer.

## 16. Widget rendering

The widget reads SSE frames, accumulates deltas into the pending assistant message and schedules UI updates without duplicating the customer action.

General RAG output renders as safe text/Markdown. Structured deterministic output is rendered through `FlowMessage.tsx` as product grids, calendars, slots, carts, forms, summaries, receipts, return cards and ticket cards.

The widget never exposes internal provenance labels such as “knowledge base” or “live catalogue” as customer-facing buttons. Source metadata is retained for internal persistence and diagnostics.

## 17. Post-response work

Once `done` is sent, Next.js `after()` performs non-visible work:

- insert user and assistant message records;
- retain client-generated idempotency/message IDs;
- store source and media metadata;
- persist the safe pure-answer cache;
- write eligible semantic query-cache records;
- validate and stitch extracted contact fields;
- create handoff records when requested;
- invalidate inbox message/conversation caches; and
- broadcast realtime inbox/chat events.

Post-response failure is logged and does not trigger a second model answer or duplicate visible response.

## 18. Sequence with response ownership

```text
Customer
  1. send message
Widget
  2. optimistic user bubble
  3. authenticated POST /api/chat
API gateway
  4. validation + HMAC + rate limits
Context wave
  5. tenant/session/entitlements + bot/contact/datasets/cache hints
Router
  6a. deterministic owner -> verified text/card response
  6b. otherwise -> RAG lane
RAG lane
  7. pure/exact cache
  8. lexical retrieval
  9. embedding if needed
 10. hybrid top-five retrieval
 11. quota reservation
 12. prompt + Gemini stream
 13. optional live-data tool + follow-up stream
Response transformer
 14. strip extraction data
 15. SSE delta(s)
 16. done event
Widget
 17. progressive render and delivered state
Background completion
 18. messages + contacts + cache + realtime
```

## 19. Security properties

- Capability tokens are signed and session scoped.
- Tenant, bot and session ownership are rechecked against authoritative state.
- Subscription and runtime restrictions precede paid generation.
- Rate limits precede Gemini calls.
- Retrieval and cache keys are tenant/bot/session scoped where personalization exists.
- Retrieved knowledge, tools and customer content are untrusted.
- Customer-specific operational data requires verification.
- Live data and extraction-bearing responses are not reused as pure answers.
- Quota is consumed before provider invocation.
- Human takeover suppresses bot output.
- Contact extraction is validated before persistence and hidden from the customer.

## 20. Failure behavior

| Failure | Customer behavior |
| --- | --- |
| Missing/expired token | `401`; widget must reinitialize |
| Invalid request | `400` |
| Rate limit exceeded | `429` with a wait message |
| Suspended workspace or bot stopped | `503` unavailable message |
| No relevant knowledge | Honest unknown response; no invented business fact |
| Gemini/provider outage | Friendly retry response; failed answer is not cached |
| Redis unavailable | Restrictive local limits and safe lead-state behavior |
| Hybrid RPC missing during rollout | Tenant-scoped vector-only fallback |
| Persistence failure after reply | Logged; no duplicate customer response |
| Human takeover | Incoming message goes to inbox; AI remains silent |

## 21. Latency model and measured results

TTFT means time from HTTP submission until the first non-empty SSE `delta`. The `stream-ready` comment and response headers are not customer-visible TTFT.

Measured production-build samples using the configured remote services:

| Scenario | Headers | First visible text | Complete |
| --- | ---: | ---: | ---: |
| Grounded RAG, cache miss | 2,247 ms | 3,470 ms | 3,568 ms |
| Immediate grounded repeat | 764 ms | 764 ms | 856 ms |
| General/unknown question, cache miss | 2,080 ms | 3,400 ms | 3,402 ms |
| Immediate general repeat | 606 ms | 607 ms | 701 ms |
| Head-chef RAG, cache miss after this change | 3,618 ms | 4,764 ms | 4,767 ms |
| Immediate identical head-chef repeat, faster sample | 828 ms | 828 ms | 895 ms |
| Immediate identical repeat during slower database RTT | 1,624 ms | 1,625 ms | 1,705 ms |

Representative cold grounded parent stages:

| Stage | Observed time |
| --- | ---: |
| Rate limit wave | ~306 ms |
| Identity/bootstrap parent | ~500 ms |
| Pure answer cache miss | ~302 ms |
| Exact FAQ lookup | ~221 ms |
| Remaining lexical work | ~265 ms |
| Remaining embedding work | ~755 ms |
| Hybrid retrieval | ~292 ms |
| Quota + model provider startup | ~1,579 ms |
| Remaining visible stream | ~37 ms |

Child operations overlap and must not be added to their parent timings. These are small local-to-hosted diagnostic samples, not production p50/p95/p99 guarantees.

Repeated-answer visible TTFT improved from the reported approximately five seconds to 0.83–1.63 seconds in two live samples. The cache lookup itself took 1–2 ms; variation came from the authoritative hosted session/entitlement RPC (0.43–1.22 seconds). In the latest cold trace the preallocated quota permit contributed 0 ms. Primary remaining cold latency comes from remote authorization/session state, embedding/retrieval when lexical search misses, and Gemini provider startup. A cache hit still performs authoritative security, entitlement and human-handoff checks; those controls are intentionally not bypassed.

## 22. Operational requirements

1. Configure the same strong `WIDGET_SESSION_HMAC_SECRET` on every application instance.
2. Apply migrations 093, 096 and 097 for safe hybrid/cache/bootstrap fast paths.
3. Deploy application, Supabase and Redis in nearby regions.
4. Measure p50/p95/p99 with `scripts/benchmark-chat-latency.mjs` from the production region.
5. Monitor `Server-Timing` stages rather than only total duration.
6. Test unknown answers, exact FAQ, grounded RAG, live-data tools, image input, contact refusal and human takeover.
7. Never remove authoritative session, entitlement, quota or identity checks solely to improve a latency number.
