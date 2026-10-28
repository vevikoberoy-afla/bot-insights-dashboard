# Bot booking system design and card turnaround

## Document scope

This document describes the booking and reservation system used by the chatbot, from a customer's booking message through location selection, calendar and slot availability, customer details, offers, confirmation, persistence, receipt display, rescheduling, and cancellation.

It reflects the implementation in:

- `src/app/api/chat/route.ts`
- `src/app/api/chat/flow/route.ts`
- `src/lib/supportFlow.ts`
- `src/lib/bookingIntent.ts`
- `src/lib/bookingFlow.ts`
- `src/lib/booking.ts`
- `src/lib/chat/persistFlowTurn.ts`
- `src/lib/chat/flowRevision.ts`
- `src/components/chat/FlowMessage.tsx`
- `src/components/chat/AppleChatCards.tsx`

The measurements in this document were collected on 2026-10-26 using `scripts/benchmark-booking-card-latency.mjs`, a local Next.js development server, and the configured remote Supabase and Redis services. They are observations from two sequential samples, not production p50/p95 service-level objectives.

## Architecture summary

```text
Customer message
    |
    v
POST /api/chat
    |
    +-- CORS, rate limits, HMAC session verification, entitlement checks
    |
    +-- session/contact/bot bootstrap
    |
    +-- support-flow router
            |
            +-- booking intent detector
            |
            +-- bot booking configuration
            |
            +-- booking flow state from Redis
            |
            +-- services + offers + coupons from PostgreSQL
            |
            +-- entity extraction: service/location/date/time/party size/contact
            |
            +-- next required step
                    |
                    +-- service/location/staff picker
                    +-- calendar + slot picker
                    +-- offer/coupon card
                    +-- add-ons/questions
                    +-- contact form
                    +-- note card
                    +-- review card
                    +-- atomic booking confirmation
                    +-- receipt/confirmation card
    |
    v
PostgreSQL message persistence + Redis state + realtime inbox fan-out
    |
    v
ChatWidget receives JSON and renders the corresponding Apple-style card
```

The booking lane is deterministic. It does not normally call an LLM to choose a slot or create a reservation. This prevents hallucinated availability, prices, locations, discounts, and confirmation references.

## 1. Booking intent entry

The booking flow is entered when the current message or existing flow state indicates a booking-related request. Examples include:

- `I want to book a table`
- `Reserve a table for five on 16 October at 2 PM`
- `Book a massage tomorrow`
- `Are tables available at the Satya Nagar branch?`
- `Reschedule BKG-ABC123`
- `Cancel my booking`

`supportFlow.ts` checks booking before the general RAG lane. A current booking state also keeps subsequent short responses—such as a location, quantity, time, name, or `No thanks`—inside the same flow.

The router avoids treating product-ordering intent as booking intent. It also refuses to start booking when booking is disabled for that bot or when a conflicting return flow is active.

## 2. Natural-language entity extraction

For the first message, the system extracts any information already supplied by the customer:

- service or reservation type;
- branch/location;
- date;
- requested hour and minute;
- number of guests or units;
- name, if the text plausibly contains one;
- phone number;
- email address;
- existing booking reference for management requests.

The first customer sentence is not accepted as a name merely because it contains words. `plausibleCustomerName()` rejects text containing numbers, booking terms, dates, times, table/reservation language, and invalid punctuation.

If a configured service has one location, it can be selected automatically. If it has multiple locations, the bot sends a `branch_picker` card containing the configured choices. If a restaurant/table intent has no configured location options, the fallback is a `location_form` text input.

## 3. Per-bot scope and configuration

`getBotCommerceConfig()` determines whether the selected bot can offer booking, manage existing bookings, and expose particular services, offers, coupons, and products. When the bot has an explicit selection, only those IDs are available in the flow. Otherwise, all active workspace booking services are considered.

Every booking turn loads the active configuration needed for correctness:

- active `booking_services` for the workspace;
- active service offers from `booking_offer_stats`;
- active coupons from `coupons`;
- bot-scoped service, offer, and coupon allowlists;
- existing flow state from Redis.

Service configuration can include:

- IANA timezone;
- working hours by weekday;
- duration and buffer time;
- minimum advance notice;
- blackout dates;
- capacity and bookings per interval;
- staff and staff working hours;
- locations;
- restaurant tables and combinable table groups;
- party-size-dependent turn times;
- optional service and product add-ons;
- custom booking questions;
- offline, deposit, or full-payment configuration placeholders;
- confirmation/reminder settings;
- external calendar integration identifiers.

## 4. Booking state machine

Booking state is stored under:

```text
booking_flow:<clientId>:<botId>:<sessionId>
```

Unfinished booking/order state uses the configured 24-hour retention. A durable recovery record is also upserted into `booking_flow_sessions` with the current step, contact data, service, offer, date, location, note, status, and recovery time.

The principal flow states are:

| State | Customer UI | Purpose |
| --- | --- | --- |
| `choose` | Service picker | Select a service or offer when intent did not uniquely identify one. |
| `branch` | Branch picker or location form | Select the correct availability pool. |
| `staff` | Staff picker | Pick a configured provider or choose any provider. |
| `quantity` | Quantity stepper | Select party size or booking quantity. |
| `date` | Calendar/scheduler | Choose or preview a date without committing it. |
| `slot` | Calendar plus slot groups | Select an actually available start time and press Proceed. |
| `offer` | Offer/coupon card | Claim one eligible offer/coupon or skip. |
| `addons` | Add-on picker | Add configured service time or product quantity. |
| `questions` | Custom question form | Collect service-specific required information. |
| `name` | Contact form | Collect name and required phone; email is optional. |
| `phone` | Text fallback | Collect a valid phone in non-card channels. |
| `email` | Text fallback with Skip | Collect optional email in non-card channels. |
| `note` | Booking note card | Collect dietary, accessibility, occasion, or other requests. |
| `review` | Booking summary | Show all details, price, discount, and confirm/edit/cancel. |
| completed | Confirmation/receipt card | Display reference, status, details, totals, and receipt action. |
| `reference` | Reference prompt | Begin management of an existing booking. |
| `verify` | Identity prompt | Match booking reference with phone or email. |
| `manage` | Management choices | Keep, reschedule, or cancel. |
| `cancel_reason` | Cancellation reason choices | Record why the booking was cancelled. |
| `cancel_review` | Confirmation card | Protect against accidental cancellation. |

Back restores a snapshot from the in-memory flow history and produces a new step ID. Cancel can exit from the middle of the flow instead of being interpreted as a phone number, name, product search, or new booking request.

## 5. Calendar and slot-card generation

### Calendar interaction rule

On the web/widget channel, date and time are selected inside `AppleBookingScheduler`. Changing the date sends a `preview_date` action. Previewing does not commit the date into the booking state. The customer must select a slot and press Proceed before the backend accepts the date/time pair.

This prevents the old behavior where tapping a date immediately advanced the flow and then displayed another calendar.

### Prefetch strategy

The scheduler response includes `slotsByDate`. The server requests several visible dates concurrently so the customer can switch days without another full chat turn for every date. In the measured response, three dates were included in the card payload.

The card groups available times into Morning, Afternoon, and Night. Disabled groups are faded. Each slot can include:

- display time in the service timezone;
- stable UTC instant used for booking;
- discount label such as `20% off` or `INR 500 off`;
- available table/seat metadata in restaurant mode;
- selected table names when an allocation is possible.

### Slot calculation

`bookingSlots()`:

1. Validates that the requested date is within the next 90 days.
2. Loads the tenant-scoped service.
3. Rejects inactive services and blackout dates.
4. Reads working-hour ranges for that weekday.
5. Converts candidate UTC instants into the service's configured timezone.
6. Applies notice time, duration, buffer, slot interval, and per-interval booking limits.
7. Loads overlapping confirmed bookings or active restaurant table assignments.
8. Checks external-provider availability when an adapter is configured.
9. Returns only instants that have sufficient capacity for the requested quantity.

DST gaps disappear naturally because the iterator evaluates real UTC instants. Repeated local hours remain separate UTC identities.

## 6. Restaurant table allocation

Restaurant-enabled services use physical table inventory rather than only subtracting a numeric capacity.

The allocator first finds the smallest single table whose minimum and maximum party size can hold the party. If no single table works, it checks compatible table groups and selects up to the configured maximum number of combined tables. Active assignments overlapping the requested turn time and buffer are excluded.

Restaurant duration can change with party size through configured turn-time rules. Confirmation atomically creates the booking and the table assignments, preventing two simultaneous customers from receiving the same table.

## 7. Offers, coupons, and pricing

The flow loads only active, unexpired, not-exhausted discounts available to the bot. Eligibility can depend on:

- service;
- location;
- weekday;
- time range;
- minimum/maximum quantity;
- remaining offer inventory;
- coupon minimum cart value;
- coupon maximum uses;
- configured bot allowlist.

The slot card can display the best eligible discount under the time. At the offer step, the customer may claim an offer or coupon. The current state stores one selected offer or one selected coupon. It does not silently stack discounts. Coupon compatibility fields are used when explaining whether a combination is allowed.

For priced services, the review and receipt calculate:

```text
subtotal = service unit price × quantity + add-on charges
discount = subtotal - selected discounted total
final total = max(0, subtotal - eligible discount)
```

The review card shows full amount, discount, and final amount. For restaurants without a preconfigured seat/service price, the system stores a deferred percentage or fixed discount for the final dining bill instead of inventing an advance bill total.

## 8. Contact, notes, and customer profile

The web contact card requires:

- a plausible customer name;
- a valid phone number;
- optional valid email.

Contact details are stitched into the tenant's contact record through `upsertCustomerContact()`. The booking reference is later added to contact custom fields, enabling the contact profile to show bookings alongside orders, tickets, conversations, and campaigns.

The note card accepts up to 500 characters or `No thanks`. A real note is retained in booking state, review data, the final booking `details`, dashboard booking views, and the confirmation receipt.

## 9. Interactive-action request path

The first text message is handled by `POST /api/chat`. Subsequent button/card actions are sent to `POST /api/chat/flow` with:

- session ID;
- flow ID;
- step ID;
- action kind and value;
- human-readable selection label;
- expected revision;
- unique action ID.

The action endpoint performs this ordered critical path:

1. CORS resolution.
2. Strict Zod schema validation.
3. HMAC capability verification and scope matching.
4. Concurrent session rate limit, client lookup, bot lookup, session/contact lookup, and entitlement lookup.
5. Runtime suspension/feature-access enforcement.
6. Human/waiting-mode check.
7. Atomic Redis revision claim.
8. Booking-domain execution.
9. Durable card/message persistence.
10. Completed-action result cache for safe replay.
11. JSON response containing the next cards and new revision.

### Stale-click and double-click safety

Every card action has an expected flow revision and unique action ID. Redis atomically compares the current revision, advances it once, and records the action. A duplicate action returns the prior result; an old action receives HTTP 409 and the latest revision. Confirmation also uses a stable flow ID as an idempotency key, so replaying Confirm cannot create a second reservation.

## 10. Confirmation transaction

The review card does not create a booking until the customer clicks Confirm. Confirmation rechecks all mandatory steps and then:

1. Upserts/stitches the customer contact.
2. Recomputes service, add-ons, subtotal, offer/coupon discount, final total, and deferred bill discount.
3. Builds normalized final booking details.
4. Calls `commit_chat_booking` with tenant, session, operation ID, request hash, and payload.
5. Falls back to the older atomic reservation RPC only when the new migration is unavailable.
6. Claims restaurant tables or regular capacity atomically.
7. Claims product add-on inventory; if it cannot be claimed, the booking is cancelled rather than left inconsistent.
8. Links the booking to the contact.
9. Stores offer/coupon and note details.
10. Creates an external calendar event when a working adapter is configured. If that external creation fails, the newly created booking is cancelled.
11. Returns a `booking_confirmation` or `waitlist_card` with the booking reference.

The receipt includes service, branch, time, guest quantity, allocated table where applicable, customer name/phone/email, add-ons, note, offer/coupon, full amount, discount, final amount, reference, and status. The widget exposes Download receipt, not Add to calendar.

## 11. Persistence and realtime behavior

For an initial booking message, `logMessages()` stores the user message and all structured assistant messages. For a card action, `persistFlowTurn()`:

1. Uses the already verified session.
2. Locks the originating card and stores selected value/label in its metadata.
3. Inserts the next assistant card(s).
4. Updates session activity time without overwriting a concurrent human handoff.
5. Broadcasts best-effort realtime events to the chat room and inbox.
6. Invalidates inbox caches.

PostgreSQL is the source of truth. Realtime fan-out is best effort and is intentionally not awaited on the customer response path.

## 12. Card rendering and what “TTFT” means for booking

RAG responses stream text deltas, so their primary metric is time to first visible token. Booking responses normally return one JSON payload containing complete structured cards. Therefore the meaningful booking metrics are:

| Metric | Definition |
| --- | --- |
| Request-to-headers | Customer submit/click until HTTP response headers arrive. |
| Request-to-card-data | Submit/click until the complete JSON response is parsed. |
| Card data-to-React commit | JSON parsed until React state contains the new card. Not currently instrumented. |
| React commit-to-paint | Browser rendering delay. Normally at least part of one frame but not measured by the server benchmark. |
| Total card display turnaround | Submit/click until the card is visibly painted. It is approximately request-to-card-data plus client processing and browser paint. |

For the current JSON booking branch, server TTFT and card-data completion are nearly the same because there is no partial card payload. The benchmark must not call receipt of an SSE comment “booking TTFT.”

## 13. Measured turnaround

The benchmark created anonymous test sessions, sent `I want to book a table`, selected the first returned configured branch, and stopped after receiving the scheduler. It did **not** select a slot or create a booking.

### Sample A

| Phase | Headers | Parsed body / card ready | Server detail |
| --- | ---: | ---: | --- |
| Widget initialization | 4,022 ms | 4,025 ms | `init_compatibility=3,710 ms` |
| Booking intent to branch card | 7,171 ms | 7,172 ms | bot configuration substage 1,578 ms |
| Branch click to calendar/slot card | 5,730 ms | 5,731 ms | authorization 653 ms; revision 65 ms; domain flow 3,309 ms; persistence 884 ms; replay cache 61 ms |

The scheduler contained one available slot and three prefetched dates. Slot sub-measurements were approximately 1,087 ms, 686 ms, and 1,182 ms; these overlap and must not be added together.

### Sample B

| Phase | Headers | Parsed body / card ready | Server detail |
| --- | ---: | ---: | --- |
| Widget initialization | 5,523 ms | 5,526 ms | `init_compatibility=5,159 ms` |
| Booking intent to branch card | 5,893 ms | 5,895 ms | bot configuration substage 1,086 ms |
| Branch click to calendar/slot card | 5,117 ms | 5,118 ms | authorization 641 ms; revision 52 ms; domain flow 3,341 ms; persistence 730 ms; replay cache 56 ms |

The visible scheduler payload again contained one available slot and three prefetched dates. Individual slot computations ranged from approximately 593 to 1,431 ms and overlapped.

### Observed ranges

| Operation | Observed request-to-card-data |
| --- | ---: |
| Session initialization before first message | 4.03–5.53 s |
| Booking message to first branch card | 5.90–7.17 s |
| Branch selection to calendar and slots | 5.12–5.73 s |

These measurements are slower than a good production target. They include local development-server behavior and remote service latency. They do not include a measured browser paint. Based on the component architecture, browser work should be much smaller than the multi-second backend path, but that must be verified with browser Performance API instrumentation before assigning a number.

## 14. Why the cards currently take this long

### Initial branch card

The first booking response waits for:

- rate limits and HMAC/tenant checks;
- entitlements and joined session/contact/bot bootstrap;
- bot commerce/booking configuration;
- Redis booking state;
- three PostgreSQL reads for services, offers, and coupons;
- entity extraction and state-machine rendering;
- flow-state Redis write;
- durable user and assistant message persistence before returning the structured card.

Only `bot-config` is exposed in the current response's request-context timing, so the rest of the 5.9–7.2 second path is not yet broken into individual header metrics.

### Calendar/slot card

The measured 5.1–5.7 second branch-click path consists primarily of:

- authorization: 0.64–0.65 s;
- action revision claim: 0.05–0.07 s;
- booking domain work: 3.31–3.34 s;
- durable card persistence: 0.73–0.88 s;
- replay-result cache: 0.06 s;
- remaining framework/transport overhead.

The domain phase loads configuration and calculates several visible dates. Slot requests run concurrently, so total slot wait is closer to the slowest date than the sum of all dates.

## 15. Current strengths

- Booking does not depend on an LLM for inventory or confirmation decisions.
- Tenant, bot, session, and card-action scope are verified.
- Date previews do not commit before Proceed.
- Availability is recalculated before accepting the selected slot.
- Confirmation is idempotent and atomically reserves capacity.
- Restaurant table combinations and turn times are supported.
- Product add-on inventory is claimed or the booking is rolled back.
- Offers and coupons are eligibility checked and not silently stacked.
- Contact details and notes flow into the dashboard/customer profile.
- Back, cancel, reschedule, and verified cancellation are supported.
- Selected card controls are locked and highlighted instead of echoed as duplicate user bubbles.
- Realtime fan-out occurs after durable persistence.

## 16. Remaining performance work

The measurements show the next improvements should focus on deterministic data access rather than the LLM:

1. Apply the atomic widget initialization migration so initialization stops using the compatibility path.
2. Add complete `Server-Timing` stages to the first booking-intent path: booking-state read, services/offers/coupons, intent/entity parsing, render, flow-state write, and message persistence.
3. Cache bot-scoped active services/offers/coupons briefly with versioned invalidation after dashboard edits.
4. Avoid reloading invariant service/offer/coupon rows for every card click when the flow has a validated configuration version.
5. Replace multiple slot-date database computations with one bounded availability RPC where practical.
6. Keep three-date prefetch, but return the initial selected date first if progressive card hydration is introduced.
7. Move nonessential recovery-record writes out of the critical response while keeping reservation and message durability authoritative.
8. Optimize card persistence so locking the old card and inserting the new card use one transaction/RPC.
9. Add browser marks around click, fetch headers, JSON parse, React commit, and next animation frame to measure true visible-card time.
10. Measure production-region p50, p95, and p99 under concurrency before defining an SLA.

Recommended product targets—not current measured results—are:

| Operation | Suggested target |
| --- | ---: |
| Warm ordinary booking card | p50 under 750 ms; p95 under 1.5 s |
| Calendar with visible slots | p50 under 1.2 s; p95 under 2.5 s |
| Atomic confirmation receipt | p50 under 1.5 s; p95 under 3 s, excluding slow external calendar providers |
| Client JSON-to-paint | p95 under 100 ms on a representative mobile device |

## 17. Reproduction

Start the application, then run:

```bash
BENCHMARK_ORIGIN=http://127.0.0.1:3000 \
node scripts/benchmark-booking-card-latency.mjs
```

The script reports initialization, initial booking-card response, branch-to-scheduler response, card type, slot count, prefetched date count, and `Server-Timing`. It intentionally stops before confirmation so it does not create test reservations or consume inventory.

Use `scripts/test-booking-flow.cjs`, `scripts/test-restaurant-booking.cjs`, `scripts/test-booking-addon-inventory.mjs`, and `scripts/test-flow-persistence.cjs` for deterministic regression coverage. Those fixture tests validate correctness but are not network latency measurements.
