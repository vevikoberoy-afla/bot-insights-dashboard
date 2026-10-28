# Customer Message to Bot Reply: Serial Latency Timeline

Date measured: 2026-10-25  
Environment: local Next.js development server using the configured Supabase, Upstash Redis, Google embedding API, and Gemini streaming API.

## End-to-end route

```text
Customer submits text
  → widget sends POST /api/chat?stream=true
  → CORS and rate limits
  → tenant identity and entitlements
  → session, contact, bot, and lead-state bootstrap
  → deterministic flow router
  → embedding
  → knowledge retrieval
  → prompt construction and model startup
  → first visible token reaches widget
  → remaining tokens stream
  → reply completes
  → logging, cache writes, triggers, and realtime fan-out continue after response
```

The benchmark created a real anonymous widget session and used the same streaming endpoint as the embedded web chatbot. Timings come from the API `Server-Timing` header and the client benchmark clock. They are wall-clock measurements including network waits, rather than estimates of SQL execution time.

## Total measured turnaround

| Scenario | Widget initialization | First visible reply after Send | Reply completed after Send |
| --- | ---: | ---: | ---: |
| Grounded RAG, first question | 4,267 ms | **9,825 ms** | **10,040 ms** |
| Same grounded question repeated | Already initialized | **6,104 ms** | **6,241 ms** |
| General RAG, cold session | 2,860 ms | **8,554 ms** | **8,638 ms** |
| Same general question repeated | Already initialized | **2,546 ms** | **2,647 ms** |
| Second warm general question | Already initialized | **2,669 ms** | **2,782 ms** |

Widget initialization normally starts when the widget opens. If a customer sends immediately and initialization cannot overlap with reading or typing time, the grounded first interaction can approach **14.3 seconds**: 4.27 seconds initialization plus 10.04 seconds message turnaround. If initialization finishes before the customer sends, only the message turnaround applies.

## Serial timeline: grounded first question

Question: `What discount code can I use and what is the minimum order?`

| Order | System phase | Work included | Phase time | Cumulative time |
| ---: | --- | --- | ---: | ---: |
| 0 | Widget initialization | Resolve bot; create or reuse contact/session; issue signed widget capability | 4,267 ms | Before Send |
| 1 | Browser request | Serialize message and start streaming POST | Included in remainder | 0 ms baseline |
| 2 | CORS | Resolve allowed embedding origin | 0 ms | 0 ms |
| 3 | Rate limiting | Check IP and session limits through Redis in parallel | 320 ms | 320 ms |
| 4 | Identity | Verify widget scope, tenant, and runtime entitlement | 729 ms | 1,049 ms |
| 5 | Bootstrap | Resolve session/contact, bot settings, lead state, and flow prerequisites | **5,180 ms** | **6,229 ms** |
| 6 | Flow router | Decide whether a transactional flow owns the message | 0 ms measured | 6,229 ms |
| 7 | Embedding | Check optional cache or generate 768-dimensional query vector | 305 ms | 6,534 ms |
| 8 | Retrieval | Run semantic cache and hybrid knowledge lookup | 551 ms | 7,085 ms |
| 9 | Model start | Meter usage, build prompt, contact Gemini, wait for stream start | **2,455 ms** | **9,540 ms** |
| 10 | Framework/transport remainder | Response construction, local HTTP delivery, and timing gaps | 284 ms | 9,824 ms |
| 11 | First visible token | First text becomes available to the widget | 1 ms | **9,825 ms** |
| 12 | Token streaming | Remaining short answer arrives | 215 ms | **10,040 ms** |

Embedding plus retrieval took **856 ms**, about **8.5%** of completion time. Bootstrap took about **51.6%**, and model startup took about **24.5%**.

## Serial timeline: repeated grounded question

| Order | System phase | Phase time | Cumulative time |
| ---: | --- | ---: | ---: |
| 1 | CORS | 0 ms | 0 ms |
| 2 | Rate limiting | 82 ms | 82 ms |
| 3 | Identity | 500 ms | 582 ms |
| 4 | Bootstrap | 1,109 ms | 1,691 ms |
| 5 | Flow router | 0 ms | 1,691 ms |
| 6 | Embedding | 303 ms | 1,994 ms |
| 7 | Retrieval | 320 ms | 2,314 ms |
| 8 | Model start | **3,488 ms** | **5,802 ms** |
| 9 | Framework/transport remainder | 302 ms | 6,104 ms |
| 10 | First visible token | 0 ms after headers | **6,104 ms** |
| 11 | Token streaming | 137 ms | **6,241 ms** |

The repeated grounded query still reached the model during this test. It did not produce an immediate cached response. Its largest phase shifted from bootstrap to model startup.

## Serial timeline: cold general RAG question

Question: `What are your opening hours?`

| Order | System phase | Phase time | Cumulative time |
| ---: | --- | ---: | ---: |
| 1 | CORS | 0 ms | 0 ms |
| 2 | Rate limiting | **1,503 ms** | 1,503 ms |
| 3 | Identity | 1,131 ms | 2,634 ms |
| 4 | Bootstrap | **3,793 ms** | **6,427 ms** |
| 5 | Flow router | 0 ms | 6,427 ms |
| 6 | Embedding | 212 ms | 6,639 ms |
| 7 | Retrieval | 334 ms | 6,973 ms |
| 8 | Model start | 1,281 ms | 8,254 ms |
| 9 | Framework/transport remainder | 299 ms | 8,553 ms |
| 10 | First visible token | 1 ms | **8,554 ms** |
| 11 | Token streaming | 84 ms | **8,638 ms** |

This question had no matching opening-hours content. It still exercised the complete RAG path and produced a grounded abstention response.

## Serial timeline: warm general RAG question

| Order | System phase | Phase time | Cumulative time |
| ---: | --- | ---: | ---: |
| 1 | Rate limiting | 71 ms | 71 ms |
| 2 | Identity | 207 ms | 278 ms |
| 3 | Bootstrap | 426 ms | 704 ms |
| 4 | Flow router | 0 ms | 704 ms |
| 5 | Embedding | 210 ms | 914 ms |
| 6 | Retrieval | 347 ms | 1,261 ms |
| 7 | Model start | 983 ms | 2,244 ms |
| 8 | Framework/transport remainder | 301 ms | 2,545 ms |
| 9 | First visible token | 1 ms | **2,546 ms** |
| 10 | Token streaming | 101 ms | **2,647 ms** |

This was the fastest observed complete RAG turnaround: approximately **2.55 seconds to first visible text**.

## Meaning of each phase

### Widget initialization

`/api/chat/init` reads the bot and tenant, creates or updates the anonymous contact and session, optionally initializes Chatwoot, warms Redis data, and signs a session capability. Chatwoot setup, when configured, currently remains inside the initialization request.

### Rate limiting

IP and session Upstash checks run concurrently. Each has a 1,500 ms timeout, so this phase can consume about 1.5 seconds when Redis is slow before the local fallback is used.

### Identity

The signed widget token is verified locally. The route then resolves client scope and effective workspace entitlements. Network-backed entitlement resolution is included here.

### Bootstrap

Bootstrap is the broadest timing bucket. It includes session lookup, contact lookup when fields are incomplete, lead-state Redis reads, bot-context Redis or SQL fallback, data-collection settings, session-mode checks, and other prerequisites before routing. The first grounded request spent 5.18 seconds here, making this the primary cold-path bottleneck.

### Flow router

Transactional systems have priority over RAG: strict support, order tracking, authoritative product facts, commerce, booking, and return/support flows. Ordinary knowledge questions continue to retrieval. A reported `0 ms` means local routing rounded below one millisecond; asynchronous work begun earlier is counted when it is awaited by adjacent stages.

### Embedding

The system canonicalizes the question, checks the optional embedding cache with a bounded wait, then calls `gemini-embedding-001` when necessary. A separate synthetic request took 715 ms, while these end-to-end samples recorded 210–305 ms because connection and cache state differed.

### Retrieval

Semantic query-cache lookup and hybrid vector chunk retrieval run concurrently. An independent bot-linked hybrid query returned five chunks in 226–323 ms. The complete end-to-end grounded retrieval stage took 551 ms.

### Model start

The system consumes an AI usage unit, builds the prompt and history, opens a Gemini streaming request, and waits for the SDK to return the stream. The API creates its HTTP streaming response only after this phase, so the browser cannot receive headers or visible text before it finishes. This phase varied from 983 ms to 3,488 ms.

### Streaming and background work

After model startup, the short answers completed in 84–215 ms. Message logging, answer-cache writes, contact extraction, trigger evaluation, and realtime fan-out are scheduled after the visible response and should not extend customer turnaround unless deployment runtime behavior differs.

## Where the ten seconds went

```text
Bootstrap/session setup      5.18 s
Model startup                2.46 s
Embedding + retrieval        0.86 s
Identity + rate limiting     1.05 s
Transport/remainder          0.28 s
Token streaming              0.22 s
Total                       10.04 s
```

Vector retrieval was not the cause of the 10-second response. Bootstrap/session processing and model startup were the largest measured phases.

Network variability affects Redis and Supabase operations. Independent measurements ranged from 84–348 ms for warm Redis SDK pings, 943 ms for a cold raw Redis request, 253 ms for a warm minimal Supabase read, and 1,537 ms for its cold request. Earlier degraded samples were substantially slower.

## Reproducing the benchmark

Start the local server and run:

```bash
node scripts/benchmark-chat-latency.mjs \
  'What discount code can I use and what is the minimum order?' \
  'What discount code can I use and what is the minimum order?'
```

The script reports initialization time, response-header time, first-visible-token time, completion time, response type, answer size, and server timing phases. Production-region tests should be run separately because development compilation and the developer machine's route to Supabase, Redis, and Google may not match production.
