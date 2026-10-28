# Current bot system design: customer message to reply

## Purpose

This document describes the system that currently processes a customer message in the web chatbot and produces the reply. It is based on the active implementation in `src/app/api/chat/route.ts`, `src/app/api/chat/init/route.ts`, `src/lib/chat/bootstrap.ts`, `src/lib/embeddings.ts`, and `src/lib/gemini.ts`.

The same core decision path is used by the embedded web widget. Other channels can call the non-streaming response path, but channel-specific adapters may add their own delivery step after the answer is generated.

## End-to-end sequence

```text
Customer types or taps a card
        |
        v
ChatWidget creates a message payload
        |
        v
POST /api/chat/flow (interactive action) OR POST /api/chat (text/media)
        |
        v
CORS -> parse/size limits -> rate limits -> spam guard
        |
        v
Verify widget HMAC capability and tenant/bot/session scope
        |
        v
Resolve client/workspace and effective entitlements
        |
        v
Parallel bootstrap: joined session/contact/bot row + bounded Redis state
        |
        v
Detect handoff, support, booking, order, ticket, or commerce intent
        |
        +---- deterministic flow/action ----------------------+
        |                                                       |
        +---- informational/RAG request -----------------------+
        |                                                       |
        v                                                       v
Cached answer / FAQ / live lookup?                         Validate action,
        |                                                   reserve/commit data,
        no                                                  persist flow state
        v                                                       |
Dataset and lexical search in parallel                      |
        |                                                       |
        v                                                       |
Embedding cache or Gemini embedding                            |
        |                                                       |
        v                                                       |
Hybrid vector retrieval / query cache                           |
        |                                                       |
        v                                                       |
Quota authorization -> Gemini stream and tool calls             |
        |                                                       |
        v                                                       |
SSE deltas + final done event / structured cards                |
        |                                                       |
        v                                                       |
Post-response persistence, contacts, messages, realtime inbox
        |
        v
ChatWidget renders text, cards, buttons, status, or error
```

## 1. Widget/session bootstrap

Before sending the first customer message, the widget calls `POST /api/chat/init` with `botId`, a browser session identifier, and optional visitor name/email.

### Atomic initialization path

For an anonymous visitor, the route calls `init_widget_session_atomic` from `supabase/096_fast_widget_bootstrap.sql`. The service-role function:

1. Validates the session identifier format.
2. Loads the bot and its owning client.
3. Takes a transaction advisory lock for the session identifier.
4. Rejects a session identifier already owned by another tenant or bot.
5. Reuses the existing contact/session, or creates a `Website Visitor` contact and an AI widget session.
6. Preserves an existing `human` or `waiting` session mode.
7. Returns client, bot, contact, session, context, and `is_new_session` in one database call.

If the migration is not installed, the route uses a compatibility path. That path performs parallel bot/session reads, then uses the existing canonical contact stitcher for identified visitors. It refuses to issue a usable token when the session cannot be persisted.

### Capability token

The server signs a short-lived widget capability with HMAC-SHA256. The token contains the workspace/client, context, bot, session, purpose, issue time, and expiry. The browser sends it as `X-Widget-Session-Token` on subsequent requests. In production, `WIDGET_SESSION_HMAC_SECRET` must be a persistent secret of at least 32 characters.

### Deferred initialization work

After the ready response is created, Redis warming and Chatwoot contact/conversation provisioning run through Next.js `after()`. The new-session flag allows the browser to skip an unnecessary empty history synchronization request. Existing sessions still synchronize history and realtime updates.

## 2. Request shape

For text, the widget sends `POST /api/chat?ctx=<context>&bot=<bot>&stream=true` with:

```json
{
  "question": "What is the status of ORD-123?",
  "session_id": "widget_session_id",
  "history": [
    {"role": "user", "content": "Hi"},
    {"role": "assistant", "content": "How can I help?"}
  ],
  "active_flow_id": null
}
```

Card interactions carry an `input` object containing the flow ID, step ID, action ID, expected revision, selected value, and label. Media requests include a scoped storage path and media metadata. User text is trimmed and capped at 500 characters before it is used for routing or retrieval.

## 3. Request gates and security

The route executes these gates before paid model work:

1. CORS headers are calculated for the configured context/bot.
2. The body is parsed and the question/session/channel fields are normalized.
3. IP and session rate limits execute concurrently. Distributed Redis waits are capped at 300 ms; restrictive in-memory limits are used when Redis is unavailable.
4. A question, media attachment, and context/bot are required.
5. Spam and obvious prompt-injection/gibberish guardrails can reject the request.
6. The widget HMAC token is verified. Its session, bot, workspace, purpose, expiry, and context must match the request.
7. The client/workspace is resolved from the token, Redis, or a tenant-scoped database lookup.
8. Effective SaaS entitlements are loaded. Suspended workspaces or disabled bot runtime features receive an unavailable response.

An invalid token never starts speculative embedding work. Database and Redis values are tenant-scoped, and a joined session row must belong to both the requested client and bot.

## 4. Bootstrap wave

After identity is established, `loadChatBootstrap()` runs the following work concurrently:

### Joined database read

The `sessions` query joins:

- session ID, external session ID, client ID, bot ID, contact ID, and mode;
- contact ID, client ID, name, email, and phone;
- bot runtime fields such as system prompt, tone, response length, emoji preference, flow configuration, and vision setting.

The joined row is authoritative. An anonymous contact with null email or phone is still considered hydrated, so the route does not issue a repeated contact query.

### Bounded Redis read

A six-key `MGET` reads:

- `sess_contact:<session>`;
- `lead_declined:<session>`;
- `lead_ask_count:<session>`;
- `lead_last_ask_turn:<session>`;
- `lead_asked_fields:<session>`;
- `bot_ctx:<bot>`.

The read has a 300 ms budget. If it times out, the system uses a safe fallback that suppresses lead collection rather than forgetting a customer refusal. Redis is an optimization; it is not the authority for tenant identity or session ownership.

### Lead state and contact context

The request builds a known-contact object and applies entity extraction for names, phone numbers, email addresses, and configured custom fields. Card labels such as `Confirm`, `Refund`, and `Damaged` are treated as protocol values and are not saved as customer names.

Lead capture is limited to two asks per session with a two-turn cooldown. A refusal is persisted for 24 hours. Unknown answers do not append a lead prompt. Lead prompts are appended after a pure answer and are never included in the reusable pure-answer cache value.

## 5. Intent and branch selection

The bot checks deterministic branches before general RAG/model generation.

### Explicit human handoff

Requests mentioning a human, agent, representative, help desk, or manager immediately enter waiting/handoff mode. The user message is logged and the inbox receives the handoff state.

### Interactive flow actions

Booking, restaurant seating, product ordering, returns, ticket creation, order status, cancellation, and support actions are validated against the active flow revision. Stale or forged action IDs are rejected. Valid actions use atomic inventory/slot/order operations where required, then return structured flow messages such as:

- location cards;
- seven-day calendar and available slots;
- product carousel and quantity controls;
- cart/review/invoice cards;
- order verification and return cards;
- ticket status cards;
- confirmation or cancellation cards.

Flow actions do not need an LLM for ordinary transitions. This makes them faster and prevents the model from inventing a price, slot, stock level, or order status.

### Support/order lookup

Support routing checks order IDs, ticket IDs, tracking identifiers, and configured connected data sources. If an identifier is missing, the bot asks for it. If it is present, the database lookup runs before any summary is generated. Verified customer identity is required for private order or ticket details.

### General informational request

If no deterministic branch handles the message, the request enters the RAG lane.

## 6. RAG lane

### Query preparation

The query is canonicalized for entity signatures and cache safety. Retrieval text can include relevant recent history. Numbers and identifiers are retained; the system does not strip punctuation in a way that could merge order IDs or prices.

### Early retrieval work

For eligible informational requests, active bot datasets and lexical search begin after authentication and run while the bootstrap work completes. Deterministic flow requests do not pay for speculative embedding or dataset work.

### Fast cache checks

The route checks, where applicable:

1. A session/bot/tenant-scoped pure answer cache.
2. Exact configured FAQ (`qa_pairs`).
3. Existing non-streaming Redis answer cache.
4. Semantic query cache for non-streaming requests.
5. Embedding cache.

Streaming requests avoid shared cache reads that cannot safely include the lead prompt. Pure answer cache entries last 60 seconds and include question, remaining conversation history, runtime settings, known-contact context, client, bot, and session in the key. They never cross visitors or tenants.

### Embedding and retrieval

The embedding path checks a bounded in-process cache, then Redis with a 300 ms timeout, then Gemini embedding. New vectors enter local memory immediately and are written to Redis with a bounded 200 ms wait. Retrieval uses lexical and hybrid vector search against active datasets, with a bounded result set passed to the model.

The bot treats retrieved chunks and connected database results as untrusted factual context. Instructions inside retrieved content are not followed as system instructions.

## 7. Model generation and tool calls

Before generation, authoritative AI usage/quota consumption is performed. This is intentionally retained before the paid provider call so concurrent requests cannot overspend the last entitlement.

`generateAnswerStream()` then:

1. Builds the system prompt from bot identity, tone, response length, emojis, contact context, lead policy, and retrieved knowledge.
2. Adds knowledge chunks inside an untrusted knowledge boundary.
3. Adds live database results inside a separate untrusted database boundary.
4. Sends the sanitized conversation history and current question to Gemini.
5. Starts the configured primary model and only uses a fallback for a recognized provider outage.
6. Collects tool calls when the model requests live order, ticket, inventory, or connected-database information.
7. Returns tool results to a follow-up model turn for a concise grounded summary.

Tool-result answers are not stored in the pure reusable answer cache because live data can change and may contain customer-specific information.

## 8. Streaming response

For streaming requests, the route creates a `ReadableStream` and immediately emits an SSE comment:

```text
: stream-ready
```

This opens the connection early but is not counted as customer-visible text. As model text arrives, the route emits:

```text
data: {"delta":"..."}
```

Extraction tags are consumed server-side and are not shown to the customer. At the end, the route appends an eligible lead prompt, determines `ai`, `waiting`, or `unavailable` mode, and emits a completion event:

```text
data: {
  "done": true,
  "source": "rag",
  "source_url": null,
  "mode": "ai",
  "serverTiming": "..."
}
```

Static support, FAQ, verification, and cache responses use the same SSE content type and emit short word batches so the widget can render progressively.

## 9. Persistence after the reply

The user and assistant messages are persisted with session, client, bot, channel, mode, source URL, media metadata, and client message IDs. Structured flow cards are stored as message rows with flow/step/action metadata. When a card is selected, the original card metadata is updated with `locked`, `selectedValue`, and `selectedLabel`, then a realtime message event is broadcast.

Contact stitching runs after extracted identity fields are validated. The contact profile can then be used by orders, bookings, tickets, campaigns, and inbox views.

Logging and slow side effects use `after()` or bounded background tasks where possible. A failure in logging must not turn a successfully delivered customer reply into a second model response or a duplicate card.

## 10. Widget rendering

The ChatWidget consumes the SSE stream, adds deltas to the current assistant message, and renders structured metadata as Apple-style cards, buttons, carousels, calendars, quantity controls, review cards, receipts, ticket cards, or booking confirmations. Card selections are sent back as protocol actions; the selected option is locked into the original card instead of being duplicated as an ordinary customer text bubble.

The widget also listens for realtime inbox updates. If the conversation enters human mode, bot replies stop and agent messages are rendered in the same thread.

## 11. Timing model

`Server-Timing` records stage durations. Parallel child timings must not be added to their parent; for example, `boot_session` and `boot_lead_redis` overlap inside the identity/bootstrap wave.

Observed production-build local measurements with configured remote services:

| Request | First visible text | Completion |
| --- | ---: | ---: |
| Uncached grounded RAG question | ~3.47 s | ~3.57 s |
| Immediate cached repeat | ~0.76 s | ~0.86 s |
| Uncached general question | ~3.40 s | ~3.40 s |
| Immediate general repeat | ~0.61 s | ~0.70 s |

The largest remaining contributors are remote session/entitlement latency, embedding/retrieval on cache misses, and Gemini provider startup. The atomic initialization migration reduces first-session setup work but does not eliminate model-provider latency.

## 12. Failure behavior

- Invalid or expired capability: HTTP 401 with a refresh-session message.
- Invalid request: HTTP 400.
- Rate limit exceeded: HTTP 429.
- Workspace suspended or bot disabled: HTTP 503 with an unavailable response.
- Model/provider failure: friendly retry text; no failed answer is cached.
- Missing knowledge: an honest unknown response and optional human handoff; no invented fact.
- Stale/forged flow action: rejected without mutating inventory, bookings, orders, or tickets.
- Persistence failure after delivery: logged for retry/diagnostics; the customer is not shown a duplicate success message.

## 13. Operational checks

Before production launch:

1. Set a persistent `WIDGET_SESSION_HMAC_SECRET` on every instance.
2. Apply `supabase/096_fast_widget_bootstrap.sql`.
3. Verify `POST /api/chat/init` reports `init_atomic` in `Server-Timing`.
4. Run the benchmark with real production-region hosting and record p50/p95 TTFT.
5. Test order status, booking, checkout, return/ticket, cancellation, handoff, refusal, and unknown-answer paths.
6. Monitor `rate_limit`, `boot_session`, `boot_lead_redis`, `embedding`, `retrieval`, `model_quota`, and `model_provider_start` separately.

The design keeps security and tenant isolation ahead of speculative speed optimizations. A lower latency number is not considered valid if it bypasses session verification, quota enforcement, customer verification, or atomic inventory/booking operations.
