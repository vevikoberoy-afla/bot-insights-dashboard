# Chat, Booking, and Commerce Request Architecture and Latency Analysis

## Document status

- Scope: customer-facing web chatbot, deterministic booking flows, deterministic commerce/order flows, recommendation discovery, knowledge/RAG answers, persistence, and widget rendering.
- Source of truth: the implementation under `src/app/api/chat`, `src/components/chat`, and `src/lib`.
- Review date: 24 October 2026.
- Purpose: explain every logical layer a customer message crosses, when an LLM is and is not used, why cards can be slow, and where latency should be measured and reduced.
- This document describes the current implementation. Timing values explicitly marked as historical comments or illustrative budgets are not production measurements.

## Executive summary

Ordinary booking and shopping interactions normally do **not** call an LLM. Date selection, slot selection, quantity changes, cart editing, customer-detail collection, booking confirmation, and order confirmation are deterministic workflows.

Despite that, these interactions travel through the main chat endpoint. Before the booking or commerce handler can return a card, the request may wait for rate limits, workspace resolution, entitlement checks, contact/session loading, bot configuration, Redis flow state, multiple Supabase reads, availability or catalogue processing, message persistence, and realtime broadcast dispatch.

The current architecture has approximately:

- **Seven shared logical layers** between the browser and a domain flow.
- **Seven to nine booking-domain layers** before a booking card is returned.
- **Seven to ten commerce-domain layers** before a product, cart, or receipt card is returned.
- **Four delivery layers** after a deterministic result or LLM result is created.

These are logical boundaries rather than a count of network requests. One layer can contain several sequential Supabase or Redis operations.

The most important confirmed causes of perceived delay are:

1. Card interactions reuse the complete chat pipeline.
2. Entitlements and bot configuration are read more than once during a request.
3. Booking availability may be calculated for multiple dates and recalculated for rendering.
4. Commerce loads the active catalogue before locally applying bot assignments and product matching.
5. Several independent reads remain sequential.
6. Interactive cards wait for the complete JSON response; they are not streamed progressively.
7. The response path awaits message persistence and realtime broadcasts before returning some cards.
8. Confirmation paths correctly perform additional atomic database and inventory work.

## Primary code map

| Responsibility | Implementation |
|---|---|
| Main public chat endpoint | `src/app/api/chat/route.ts` |
| Interactive flow endpoint | `src/app/api/chat/flow/route.ts` |
| Browser/widget request and rendering | `src/components/chat/ChatWidget.tsx` |
| Interactive card renderer | `src/components/chat/FlowMessage.tsx` |
| Booking orchestration | `src/lib/bookingFlow.ts` |
| Booking availability and reservation | `src/lib/booking.ts` |
| Commerce orchestration | `src/lib/commerceFlow.ts` |
| Commerce inventory and order operations | `src/lib/commerce.ts` |
| Support and top-level deterministic routing | `src/lib/supportFlow.ts` |
| Order tracking | `src/lib/orderTrackingFlow.ts` |
| Bot-scoped booking/commerce configuration | `src/lib/botCommerceConfig.ts` |
| Hybrid offering discovery | `src/lib/offeringDiscovery.ts` |
| SaaS entitlement resolution | `src/lib/saas/entitlements.ts` |

## End-to-end architecture

```text
Customer types a message or clicks an interactive card
                         |
                         v
                 ChatWidget browser state
                         |
                         v
        POST /api/chat or POST /api/chat/flow
                         |
                         v
        CORS + body parsing + two rate limiters
                         |
                         v
       Workspace, bot, subscription and session lookup
                         |
                         v
            Contact and bot-context hydration
                         |
                         v
      Human-handoff check + deterministic flow router
             /                 |                  \
            v                  v                   v
       Support flow       Booking flow       Commerce flow
                                                   |
                         or                        v
                    RAG / LLM path        Order/inventory RPCs
             \                 |                  /
              +----------------+-----------------+
                               |
                               v
             Build answer and/or interactive cards
                               |
                               v
       Persist session/messages + realtime broadcasts
                               |
                               v
           JSON or text stream returned to widget
                               |
                               v
                 React state update and render
```

## Shared request layers before domain logic

### Layer 1: Browser interaction

The widget creates a local user message, enters loading state, builds limited conversation history, and posts to the application server.

- Plain text normally uses `/api/chat`.
- Card inputs use `/api/chat/flow`, but that route delegates directly to the main chat `POST` implementation.
- The widget disables most interactive cards while the global request is loading.
- Card responses wait for `response.json()` before being displayed.

This means `/api/chat/flow` is not currently a smaller or isolated execution path.

### Layer 2: Origin and CORS resolution

The API resolves the request origin, context ID, and bot ID and creates appropriate CORS headers. When the origin result is not already available, this can require a database lookup.

### Layer 3: Request parsing and rate limiting

The server parses the body and runs IP and session rate-limit operations concurrently. Both are guarded by 1,500 ms timeouts.

The code contains an older benchmark comment recording approximately 1,290 ms for one limiter and 372 ms for the other before they were parallelized. Those values are not a current production measurement, but they show that the limiter has previously been a material component of request time.

### Layer 4: Workspace, bot, and entitlement resolution

The handler resolves the client/workspace from the public context or bot and verifies effective SaaS access. Some results are cached, but entitlement resolution intentionally has no in-process cache so suspension and expiry changes take effect on the next request.

That security property is valuable. The optimization opportunity is request-scoped reuse, not skipping authorization.

### Layer 5: Contact and session hydration

The handler loads cached contact data and session flags. On misses, it queries sessions and contacts, extracts newly supplied customer information, and may stitch or update the contact profile.

### Layer 6: Bot and knowledge configuration

The server resolves bot configuration and linked datasets. Redis can serve a warm bot-context result; a cold path uses Supabase reads.

### Layer 7: Mode and deterministic routing

The server checks whether the conversation is handled by a human or is waiting for handoff. AI-mode messages are offered to deterministic support routing first. That router checks strict support, tracking, commerce, booking, returns, and other support flows.

Only when no deterministic flow accepts the message does the request continue to connected-database lookup and RAG/LLM processing.

## Booking system design

### Booking request sequence

```text
Shared request layers
        |
        v
Read booking flow state from Redis
        |
        v
Check conflicting active flows and identify intent
        |
        v
Load effective bot commerce/booking configuration
        |
        v
Load services, service offers and coupons in parallel
        |
        v
Extract service, branch, party size, date and time locally
        |
        +------ recommendation language only ------+
        |                                          v
        |                              Hybrid discovery + LLM
        |                                          |
        +------------------------------------------+
        |
        v
Load and calculate availability
        |
        v
Build location/service/calendar/details/review card
        |
        v
Save flow state and flow-session recovery state
        |
        v
Shared persistence and delivery layers
```

### Booking flow state

Redis stores the active booking state for the current client, bot, and session. The flow tracks data such as service, offer, location, quantity, date, slot, add-ons, customer details, notes, coupon, current step, and step identifier.

The database also receives recovery/analytics flow-session updates. Some of these are intentionally fire-and-forget, but the core Redis state needed for the next interaction is awaited.

### Service, offer, and coupon loading

After bot-commerce configuration is resolved, the implementation loads:

- Active booking services.
- Active service offers.
- Active coupons.

Those three reads run concurrently. Bot assignments are then applied in application code.

### Booking intent and entity extraction

Common booking language and entities are recognized deterministically. The code can extract or infer:

- Booking or reservation intent.
- Service/restaurant selection.
- Branch/location.
- Party size or quantity.
- Date.
- Requested time.

If a required value is absent, the flow produces the relevant picker or details card. This path does not require an LLM.

### Booking recommendation path

Recommendation-style requests can call universal offering discovery. That path is separate from ordinary scheduling and is described under “LLM and hybrid discovery.”

### Availability computation

For a selected service and date, `bookingSlots()` performs the following work:

1. Validate the requested date.
2. Read the booking service.
3. Read confirmed bookings, or restaurant table assignments.
4. Read availability from an external calendar provider when configured.
5. Create a timezone-aware formatter.
6. Iterate minute-by-minute across a 52-hour UTC safety window.
7. Convert each minute to the service timezone.
8. Keep times inside working hours and aligned with the configured interval.
9. Check notice periods, duration, buffer, capacity, existing reservations, table combinations, and provider availability.
10. Return eligible slots with restaurant table/seat information where applicable.

The loop evaluates up to 3,120 minute positions per availability calculation. A local isolated benchmark of only the timezone conversion loop took 9.1–13.1 ms across six runs. It did not include database access, external calendars, overlap checks, allocations, or card creation.

### Repeated availability work

The current flow can calculate availability more than once:

- If the initial message includes a requested time, availability is loaded to validate that time.
- A new flow with no selected date can inspect several upcoming dates until it finds availability.
- Rendering the scheduler loads availability for the chosen date again.
- Previewing another date or changing party size triggers another full request and another availability calculation.
- A card-only scheduler path can test upcoming dates sequentially.

This produces correct current availability, but it also creates repeated Supabase/provider round trips and CPU work.

### Booking confirmation sequence

Confirmation performs more work than browsing:

1. Upsert or stitch the customer contact.
2. Call an atomic booking reservation RPC.
3. Allocate restaurant tables when restaurant mode is enabled.
4. Create an external calendar event when a synchronized provider is configured.
5. Update the booking with external event data.
6. Roll back/cancel the booking if required external event creation fails.
7. Link/update the contact profile.
8. Apply coupon or deferred bill discount data.
9. Reserve or decrement product add-on inventory where configured.
10. Build the final receipt/card and persist flow state.

These steps protect inventory and availability. The final reservation must remain authoritative and should not be replaced by a browser-only optimistic action.

## Product catalogue and order system design

### Commerce request sequence

```text
Shared request layers
        |
        v
Read order/cart state from Redis
        |
        v
Check return/booking flow conflicts and classify intent
        |
        v
Load effective bot commerce configuration
        |
        v
Load active product catalogue
        |
        v
Load active product offers
        |
        v
Load coupons + storage compatibility check in parallel
        |
        v
Apply bot assignment and search filters in application code
        |
        +------ recommendation language only ------+
        |                                          v
        |                              Hybrid discovery + LLM
        |                                          |
        +------------------------------------------+
        |
        v
Build product carousel/cart/details/review card
        |
        v
Save flow state and recovery state
        |
        v
Shared persistence and delivery layers
```

### Catalogue loading and matching

The commerce flow reads active rows from `catalog_product_availability`, ordered by product name. It then reads current product-linked offers. Coupons and a compatibility/readiness query run together.

When bot-scoped product assignments exist, the full active workspace result is filtered in application memory. Product matching then checks normalized product name, SKU, category, and tokens.

The browser may reveal only four or five items at a time, but that does not mean the server loaded only four or five rows. Backend query-level filtering and cursor pagination are required to obtain that benefit.

### Product browsing and cart steps

The deterministic commerce state machine controls:

- Product search and related results.
- Product variant selection.
- Per-product quantities.
- Cart review and editing.
- Add-another-product loops.
- Coupon validation and auto-application.
- Upsell threshold suggestions.
- Name, phone, address, and postal-code collection.
- Final review and confirmation.

These operations do not inherently require an LLM.

### Order confirmation sequence

On confirmation, the flow:

1. Upserts the customer contact.
2. Handles waitlist-only orders if applicable.
3. Creates an inventory hold for each cart line.
4. Places the order using the domain order operation/RPC.
5. Links the order to the contact.
6. Updates variant metadata where applicable.
7. Updates the customer profile and last-order reference.
8. Consumes or clears applicable booking-to-commerce discounts.
9. Builds the final receipt card.

Inventory holds are currently awaited one line at a time. This is safe, but it adds one network wait per distinct cart line before order placement.

## Order-status and support lookup design

Order tracking is also deterministic. The lookup sequence is intentionally broad:

1. Look for a native chatbot commerce order by reference.
2. If absent, look by receipt number.
3. Load native order lines and events.
4. Look in older ERP/campaign `sales_orders`.
5. Look in synchronized `support_orders`.
6. If missing or stale, call the configured connected data source.
7. Persist a resolved connected order into the internal support mirror.

This allows the bot to support internal purchases and external order systems. However, misses can traverse several sequential stores before the customer gets a not-found result.

## LLM and hybrid discovery

### When the LLM is not used

The LLM is normally unnecessary for:

- Opening a booking flow from explicit booking language.
- Choosing a location, service, date, time, party size, or add-on.
- Changing calendar dates or quantities.
- Entering customer details or a note.
- Booking confirmation.
- Searching for an explicit product name, SKU, or category.
- Changing quantities and editing the cart.
- Applying a deterministic configured coupon.
- Order confirmation.
- Tracking a recognized order ID.
- Deterministic return and ticket workflows.

### Recommendation discovery path

Requests such as “I want a special gift for my girlfriend” or broad service recommendations can enter offering discovery:

```text
Recommendation cache lookup
        |
        +---- warm hit ----> cached recommendation
        |
        v
Create query embedding
        |
        v
Hybrid lexical + vector RPC
        |
        v
Pre-filter to at most 15 real bot-scoped candidates
        |
        v
LLM chooses up to 5 candidate IDs and writes a short introduction
        |
        v
Cache recommendation for 300 seconds
        |
        v
Map IDs back to authoritative product/service records
```

The LLM cannot invent arbitrary products in this path because it is asked to select from supplied IDs. Authoritative name, stock, availability, and price remain database-owned.

### General knowledge/RAG path

If deterministic flows do not handle a message, the main route can continue through:

1. Connected database lookup when the question contains resolvable structured data.
2. Exact legacy FAQ lookup and Redis response-cache lookup in parallel.
3. Query embedding after those fast paths miss.
4. Semantic query-cache lookup and knowledge chunk search in parallel.
5. Knowledge-grounded answer generation.
6. Streaming text delivery when requested by the widget.

The source comments record older observations of about 377 ms and 411 ms for semantic cache and chunk search, now run concurrently. They are useful historical evidence, not current production telemetry.

## Layers after a result is produced

Whether a domain handler or LLM produces the result, there are approximately four logical delivery layers:

### Layer A: Response construction

The server builds the text answer, structured `FlowMessage` objects, cards, source metadata, IDs, and domain result data.

### Layer B: Domain state persistence

Redis flow state required by the next interaction is saved or removed. Booking/order recovery rows may also be updated.

### Layer C: Conversation persistence and realtime delivery

The system resolves or creates the session/contact, updates the session, inserts user and assistant messages, and broadcasts updates to the inbox and chat-room realtime channels.

For interactive flow messages, the main route currently awaits `logMessages()` before returning the JSON response. `logMessages()` in turn awaits realtime broadcast dispatch. Therefore the customer can wait even after the card has already been computed.

### Layer D: Browser response parsing and rendering

The widget waits for the completed JSON payload, updates its React message state, replaces or appends the relevant card, unlocks loading state, and renders the component.

Plain generated text can use a streamed response. Structured cards do not currently use an incremental response protocol.

## Timing evidence and latency budget

### Directly observed or encoded values

| Component | Evidence | Interpretation |
|---|---:|---|
| Rate-limit timeout | 1,500 ms per limiter | Upper bound configured by the route, not normal latency |
| Older rate-limit comment | 1,290 ms and 372 ms | Historical developer benchmark; now parallelized |
| Older semantic lookup comment | 377 ms and 411 ms | Historical developer benchmark; now parallelized |
| Isolated booking timezone loop | 9.1–13.1 ms | Local measurement of 3,120 timezone conversions only |
| Recommendation cache TTL | 300 seconds | Warm identical recommendation queries avoid embedding, hybrid RPC, and LLM selection |
| Supabase/Redis requests | Not instrumented per stage | Exact current duration is unknown |
| External calendar calls | Not instrumented per provider | Exact current duration is unknown |
| LLM/model call | Not instrumented end to end | Exact current duration is unknown |
| Message logging/broadcast | Not instrumented separately | Exact contribution is unknown |
| Browser card render | Not profiled | Exact contribution is unknown |

### Illustrative budget only

The following is an engineering budget, not a measurement of the current deployment:

| Path | Desired warm target | Main work |
|---|---:|---|
| Simple card click | 150–350 ms | Auth reuse, Redis state, one domain read, render |
| Product search | 250–600 ms | Indexed/paginated catalogue query and card response |
| Calendar/date preview | 250–700 ms | Cached service configuration and one availability query |
| Booking/order confirmation | 500–1,500 ms | Atomic reservation/order, inventory, contact, persistence |
| Warm recommendation | 250–600 ms | Recommendation cache and authoritative row mapping |
| Cold hybrid recommendation | 900–2,500 ms | Embedding, hybrid search, LLM, persistence |
| General cached FAQ | 150–450 ms | Cache/exact lookup and delivery |
| Cold RAG answer | 900–3,000 ms | Embedding, retrieval, model generation; first token should stream earlier |

A sequence of twelve network operations averaging 150 ms each costs about 1.8 seconds when executed serially. Parallel operations cost approximately the slowest operation in their group. This is why request shape and sequencing matter more than the 9–13 ms availability loop when the customer experiences multi-second latency.

## Confirmed latency causes

### 1. The interactive flow endpoint is only an alias

`/api/chat/flow` calls the main chat `POST` handler. It does not bypass unrelated chat setup for trusted card interactions.

### 2. Repeated entitlement/configuration reads

The main request verifies SaaS access. `getBotCommerceConfig()` requests effective entitlements again, followed by bot configuration and assignment reads. The authorization result should be reused within one request without extending revocation visibility across requests.

### 3. Broad catalogue reads

The server loads active workspace products and then applies bot assignment and text matching in memory. Frontend lazy rendering alone does not reduce backend data retrieval.

### 4. Sequential independent queries

Product catalogue and active offers are loaded sequentially. Some order-status sources are attempted sequentially. These are correct but add network round trips.

### 5. Repeated availability calculations

Initial time validation, date discovery, scheduler rendering, date previews, and party-size changes can run overlapping availability calculations.

### 6. Blocking message logging and realtime broadcasts

Some structured flow responses wait for message inserts and broadcast delivery before the API response is released.

### 7. Global card loading state

The widget disables card controls while a request is active and waits for a full JSON result. A local calendar interaction therefore feels like a full chatbot turn.

### 8. Correctly expensive confirmations

Booking and order confirmations require authoritative checks, atomic writes, inventory handling, contacts, optional external providers, and receipts. These paths should be optimized carefully, not made optimistic in a way that permits overselling.

### 9. External dependencies

Redis, Supabase, external calendars, connected order sources, embedding providers, and LLM providers add regional network and cold-start latency. Provider timing is not currently recorded as a unified request trace.

### 10. Local development storage pressure

At review time the development machine reported only about 193 MiB free on the data volume and 100% capacity. That can impair Next.js development compilation, cache writes, swapping, and local responsiveness. It does not prove production API latency, but it can distort local observations.

## Recommended target architecture

### Phase 1: add observability before behavioral changes

Every chat request should carry one trace/request ID and emit structured timings for:

- CORS/context lookup.
- Both rate limiters.
- Workspace/bot resolution.
- Entitlement lookup.
- Contact/session hydration.
- Deterministic routing.
- Bot commerce configuration.
- Service/catalogue/offers/coupons reads.
- Availability database and CPU portions separately.
- External calendar/provider calls.
- Embedding, hybrid search, retrieval, and LLM first-token/complete timings.
- Domain confirmation RPCs.
- Message persistence.
- Realtime broadcasting.
- API time to first byte and total time.
- Browser request, JSON parse, state update, and card paint.

Use `Server-Timing` headers for browser-visible stages and structured server logs for the complete trace. Record p50, p95, and p99; averages alone hide cold requests.

### Phase 2: create a lean interaction execution path

Interactive cards should retain authentication, tenant checks, rate limiting, idempotency, and domain validation while skipping unrelated knowledge-base setup. The flow endpoint should call a shared secure domain dispatcher rather than re-entering the entire public text-chat route.

The client must never be trusted for price, stock, discount, availability, contact ownership, or final booking/order state.

### Phase 3: request-scoped dependency reuse

Build a request context containing:

- Resolved client and bot.
- Effective entitlements.
- Session/contact identity.
- Bot commerce configuration.
- Trace ID and timing collector.

Pass this context into support, booking, and commerce handlers. Do not call the same entitlement/configuration function repeatedly within one request.

### Phase 4: booking availability optimization

- Separate service configuration loading from availability calculation.
- Query a bounded date range once when searching the next seven days.
- Cache stable service configuration longer than volatile occupancy.
- Use a short, tenant/service/date/location/quantity availability cache.
- Invalidate or version the cache after booking, cancellation, reschedule, table change, schedule change, or inventory change.
- Reuse the result used to validate an explicit time when rendering that same date.
- Deduplicate concurrent identical availability requests.
- Preserve the atomic booking RPC as the final authority.

### Phase 5: catalogue and offer optimization

- Filter by bot assignment, status, search tokens, category, and SKU in the database.
- Add keyset pagination to product queries.
- Return only fields needed by product cards.
- Load products and relevant offers/coupons concurrently where possible.
- Cache stable bot catalogue metadata with explicit invalidation/versioning.
- Load later carousel pages only when requested.
- Keep final prices, coupon eligibility, stock, and inventory holds authoritative on the server.

### Phase 6: decouple response delivery from noncritical side effects

Required conversation persistence should remain durable. Realtime dashboard broadcast delivery should not block the customer response if a durable event/outbox can guarantee later delivery.

A safe sequence is:

```text
Commit domain result + durable message/outbox record
                    |
                    +---- return customer response immediately
                    |
                    +---- worker/realtime dispatcher publishes inbox event
```

Do not simply fire-and-forget important writes in a serverless process; use a transactional outbox or durable queue.

### Phase 7: improve perceived UI latency

- Scope loading state to the card being changed.
- Keep other messages and controls responsive.
- Update calendar selection locally until the customer presses Proceed.
- Show a scheduler skeleton immediately when availability must be refreshed.
- Optimistically highlight reversible choices, but reconcile them with the authoritative server response.
- Keep final booking/order confirmation non-optimistic.
- Consider streamed structured events for expensive recommendation cards.

## Data integrity boundaries that must remain

Performance changes must preserve:

- Tenant scoping on every query and mutation.
- Entitlement, account-state, and feature-gate enforcement.
- Bot-scoped service/product/coupon assignment.
- Server-authoritative prices and discounts.
- Server-authoritative availability and inventory.
- Atomic reservation/order operations.
- Idempotency for retries and double clicks.
- Inventory hold expiry and release.
- Contact consent and channel policy.
- Auditability of customer and staff actions.
- Safe external-provider failure behavior.
- Human-handoff state.

## Verification plan

### Booking scenarios

1. Start with “book a table” and measure location/service card latency.
2. Start with branch, party size, date, and time in one message.
3. Change a date several times before Proceed.
4. Change party size and confirm available tables update.
5. Apply a slot discount and verify the final receipt.
6. Confirm with and without an external calendar provider.
7. Run two simultaneous confirmations against the last table/slot.
8. Cancel and reschedule an existing reservation.

### Commerce scenarios

1. Search an exact product name.
2. Search by SKU and category.
3. Run a broad recommendation that invokes hybrid discovery.
4. Load additional carousel pages.
5. Add several distinct cart lines and confirm.
6. Apply an eligible, ineligible, and non-stackable coupon.
7. Trigger the configured upsell threshold.
8. Run two simultaneous orders against the final inventory unit.

### Performance acceptance

For every scenario capture:

- API p50, p95, and p99.
- Database/Redis query count.
- Sequential critical-path network count.
- Time to first visible feedback.
- Time to usable card.
- Time to confirmed transaction.
- Cache hit rate.
- Error and retry rate.
- Duplicate booking/order count, which must remain zero under idempotent retries.

## Final assessment

The current design has strong domain separation and correctly keeps booking, inventory, coupon, and order truth on the server. The primary latency problem is that deterministic UI interactions are surrounded by a broad chat pipeline and repeated remote reads. The first engineering action should be complete per-stage tracing. The highest-value implementation changes after measurement are a secure lean interaction path, request-scoped configuration reuse, query-level catalogue filtering, availability-result reuse, and nonblocking durable realtime delivery.
