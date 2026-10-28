
## 1. What this product is

The product is a conversational customer-service, commerce and booking platform for businesses. A business configures AI bots in a dashboard, connects its knowledge and operational data, publishes a chatbot on its website or supported messaging channels, and manages the resulting customer conversations and transactions from the same workspace.

A customer can ask a question, discover products, place an order, track an order, request a return, raise a support ticket, book an appointment or reserve a restaurant table inside a conversation. The bot combines conversational answers with interactive cards and structured business flows. Human staff can take over when needed.

The central product promise is that conversation leads to a real, traceable business result: an order, booking, ticket or updated customer profile. Prices, stock, availability and order status must come from authoritative records. Conversational text alone is never proof that a transaction succeeded.

Brand names appearing in the repository and designs include Vittain and SIEXY. Merchant-specific names, personas and branding are configurable; examples such as Test1, Gadget B or a restaurant name are not permanent product definitions.

## 2. Who uses it

| User | Main job |
| --- | --- |
| Business/workspace owner | Configure the business, bots, knowledge, products, services, channels and commercial settings |
| Business support staff | Reply in the inbox, handle tickets and inspect customer context |
| Shop operator | Maintain catalogue and stock; fulfill and manage orders |
| Restaurant/service operator | Configure availability, tables/services and manage bookings |
| Marketing operator | Organize audiences, offers, coupons and supported campaigns |
| End customer | Talk to the bot, provide details, transact and get help |
| Platform operator | Eventually manage SaaS accounts, subscriptions, access and platform operations through the admin control plane |

These are product personas. Do not assume that all corresponding permission roles are already enforced. Current access control needs the membership and authorization work described in the SaaS plans.

## 3. Main product surfaces

### Business dashboard

The main product lives in `src/app/(dashboard)`. Parentheses define a Next.js route group and do not appear in public URLs. Its page logic also depends on shared components, server APIs and libraries outside that folder.

Navigation covers Overview, Bots, Inbox, Knowledge, Databases, Features, Contacts, Campaigns, Tickets, Analytics, Settings, Templates and Webhooks. Some destinations are working data-backed screens; others contain mock data or `ComingSoon` states.

### Customer chatbot

The website chatbot is embedded using the product's embed script and iframe/widget entry point. It presents conversational messages and structured cards. Widget behavior must be checked in the actual embedded surface, not solely in a dashboard test console.

### External channels

Email, WhatsApp, Telegram and Chatwoot have integration paths. Provider credentials, callbacks, permissions and channel-specific output formats determine what works. A React card in the website widget does not automatically become the same card in WhatsApp or Telegram.

### Platform administration

There is existing `/admin` scaffolding and basic billing/schema support. The complete SaaS operator panel, membership roles, tier enforcement and billing lifecycle are planned extensions, not a finished product merely because a page or table exists.

## 4. Bot creation and per-bot configuration

Businesses can create specialized bots for sales, support, booking or email handling. Main routes are `/bots/all`, `/bots/new` and `/bots/[id]/edit`.

Configuration surfaces include:

- Name, business purpose, instructions/persona, tone and response style.
- Greeting and configurable conversation behavior.
- Widget branding, appearance, preview and embed installation information.
- Linked knowledge bases and live databases.
- FAQ content associated with the bot's knowledge.
- Enabled booking, catalogue, ordering and management capabilities.
- Which products, services and offers the bot may expose; workspace ownership alone does not mean every bot should sell every item.
- Customer support automation, return policy, identity verification, resolution options and photo-evidence settings.
- Lead-capture prompts for name, phone, email and additional configured fields.
- Handoff and business-hours configuration surfaces.
- Proactive rules and timed popup configuration.
- Channel connections and mailbox-specific email policies.

Some visual controls, especially advanced routing/action controls, require checking their save and runtime consumers before treating them as implemented. Settings that appear on screen must actually affect runtime behavior to count as finished.

The bot test page `/bots/[id]/flow` calls the conversation API. Per-bot analytics and trigger analytics have dedicated pages. A global bots-analytics page is currently a placeholder in the reviewed inventory.

## 5. Knowledge bases, FAQs and live data

### Knowledge bases

Knowledge stores relatively stable information: business descriptions, policies, FAQs, service explanations and product guidance. Businesses create datasets, attach sources, upload/crawl supported content, inspect chunks, link datasets to bots and test retrieval.

Routes: `/knowledge/all`, `/knowledge/add`, `/knowledge/[id]`. Supporting APIs manage datasets, sources, chunks, uploads, crawling and tests. RAG retrieves relevant content and gives it to the answer model. Manual QA and bot FAQ paths exist; preserve their actual storage/precedence rules when changing retrieval.

### Live databases

Live sources provide changing information such as order records, delivery status, stock and customer-related business records. The dashboard supports connection/source configuration and lookup testing for Google Sheets, CSV URLs and REST-style sources.

Routes: `/databases/all`, `/databases/[id]`. Configuration can include endpoint, headers, HTTP method, request template, lookup field, Sheet tab and field mappings.

For order support, normalize order ID, customer email/phone, customer name, item/SKU, quantity, order/fulfillment status, delivery date, totals and currency. Source accessibility and correct mappings matter; linking a Sheet is not proof its columns can already be used for a verified return.

All retrieval must stay within the bot's authorized workspace/source scope. Treat retrieved text as untrusted data, not instructions. Never invent an order or price when a source is unavailable.

## 6. Conversational intent and product/service discovery

The bot must distinguish new shopping, appointment/reservation requests, order tracking, return/support requests and ordinary information questions. Existing flow state must not force a clearly different intent into the wrong path.

Examples of intended behavior:

- “I want to order a lamp” searches actual product names/SKUs/categories and shows relevant items.
- “I need to order something” asks what the customer wants instead of choosing a random product.
- “What could I gift my girlfriend?” can give a short contextual reply and then relevant catalogue suggestions.
- “Book a table for six” enters booking, even if the previous conversation was about products.
- “Cancel my order” enters order management or clarification, never a new product search merely because the word order appears.

Universal offering discovery has a hybrid retrieval/RRF path that narrows candidates before model-assisted recommendations. The intended budget is up to 15 retrieved offerings and a small recommended set, commonly five. Selected IDs must belong to the supplied, authorized catalogue/service records. Direct name/SKU searches should remain efficient.

The distinction is deliberate: AI helps interpret intent and communicate; server business logic owns eligibility, identity, capacity, stock, totals and writes.

## 7. Chat widget and interactive components

The desired visual style is compact, clean and Apple-inspired, with text sizing aligned to normal chat messages and consistent card geometry.

Card families include:

- Product results/carousel with image, name, description, price, stock and quantity controls.
- Cart and selected-item summary, additional-product prompt and checkout actions.
- Contact/address forms with inline validation.
- Service, branch and staff selection.
- Compact calendar, expanded calendar, available time slots and party-size controls.
- Add-ons, custom questions, optional notes and offer/coupon display.
- Booking/order review, confirmation and receipt views.
- Verified order and return-item selection cards.
- Reason/resolution choices, evidence/photo upload and return review.
- Ticket/status cards and CSAT rating.

Interactive actions carry flow/step identifiers. A selection should stay visibly selected in its source card, rather than duplicating every click as a right-side text message. Controls must show pending/disabled/selected states and prevent stale-card mutations.

The calendar lets a user revise date, time and party size before Proceed. Slots should show configured discounts and real availability. Product cards should align title, description, price and actions despite different text lengths. Receipts must wrap long names and clearly separate subtotal, discount and final total.

The widget also supports message synchronization, streaming where used, history, attachments, loading states and friendly retry messages. Raw stack traces and server secrets must never appear in customer messages.

These interaction rules describe intended acceptance behavior; each implementation change still needs validation in the embedded widget and the relevant channel adapter.

## 8. Product catalogue and inventory

Features → Product catalogue manages names, SKU, descriptions, categories, prices/currency, images, variants, stock, active/draft status and other supported product metadata.

Catalogue capabilities include search/filter, record edit, CSV/XLSX import with header normalization, tabular display, bulk selection/actions and inventory adjustment/history. Import must distinguish new products from updates and report invalid rows without replacing unrelated fields accidentally.

Inventory is shared by all bots using the same workspace catalogue. Selling through one bot must change availability for every other bot. The server uses inventory holds and atomic order operations to prevent overselling. Hold release, expiry, cancellation and adjustment records must remain traceable.

Routes under `/features/commerce/[kind]` delegate to `CommerceDashboard`; common kinds include catalogue, orders and inventory. Domain logic resides in `commerce.ts`, flow logic in `commerceFlow.ts`, and database RPCs in commerce migrations.

## 9. Shopping and checkout flow

Intended complete customer journey:

1. Interpret a product request or ask what the customer wants.
2. Search real authorized products and show a small relevant result set.
3. Let the customer select quantities on the product cards and proceed.
4. Ask whether they need another product or want to edit the current selection.
5. Repeat discovery as needed while preserving the cart.
6. Show selected items and applicable offers/coupon entry when configured.
7. Collect required name, phone and delivery address/PIN code; validate fields rather than treating the opening sentence as a name.
8. Show final line items, quantities, subtotal, discounts, currency and total.
9. On explicit confirmation, revalidate prices/stock/eligibility and perform the atomic order write.
10. Show the actual order ID and receipt, and connect the customer/order to dashboard records.

Confirmation must be idempotent: retries cannot create duplicate orders or decrement stock twice. A receipt is not proof of captured payment. Payment collection/refunds require an implemented payment integration; current payment-related fields alone do not establish it.

## 10. Order tracking and management

The bot should ask for an order reference when missing and verify the customer before disclosing sensitive details or making changes.

Resolve native orders as well as supported legacy/mirrored support records and explicitly connected data sources. Products ordered through this product must not become invisible because lookup searches only an external Sheet.

Status replies can include reference, items/quantities, order and fulfillment status, dates and other supported tracking information. Cancellation or change requests must follow allowed state transitions, identity checks and inventory rules. Do not report success until the backend operation succeeds.

Primary code: `orderTrackingFlow.ts`, `orderResolver.ts`, `commerceFlow.ts` and the commerce/support services.

## 11. Appointments and service booking

Businesses configure services with name/description, duration, timezone, capacity, notice and cancellation rules, working hours, blackout dates, price/currency, staff, locations, add-ons, custom questions and notifications.

The customer flow collects only missing information: service, location, staff preference where relevant, quantity, date/time, add-ons, contact details and optional note. Explicit selections remain confirmable/editable before the write.

Natural-language extraction can prefill date, time and party size from “book a table for five on 16 October at 2 pm.” If several branches exist and none is specified, offer configured branches. If one applicable branch exists, it can be selected automatically. Always validate extracted values against real availability.

Date/time selection should use the combined calendar/slot card in the web widget. On completion, issue an actual booking reference, display selected details and offer the supported receipt download. Calendar integration or ICS download must be described according to what it actually does; an ICS file does not synchronize external availability.

Existing bookings have verification, cancellation and rescheduling paths. Notes, chosen add-ons and discounts must persist into the final booking and appear in dashboard details.

## 12. Restaurant reservations and seating

Restaurant mode extends booking with physical tables and guest capacity. Configuration includes locations, table identity/capacity, slot intervals, party-size-dependent turn times, automatic allocation and combined-table constraints.

Multiple tables can be available in the same slot. The allocator must account for overlapping occupancy, buffer/turn time and compatible table combinations, not merely subtract one booking from a single global counter.

The booking manifest shows capacity by date/period/slot and guest reservation cards. Important fields are customer name and phone, time, service, party size, branch/table assignment where available, reference, status, source channel and customer note.

Operator actions include create booking, reschedule, cancel, mark complete/no-show and export the manifest. The interface can show available, almost-full and full capacity states. Its statistics should derive from actual bookings/allocations rather than example numbers.

## 13. Offers, coupons and deferred bill discounts

Merchants configure product/service offers, quantities/claim limits, active windows, percentage/fixed discounts and eligibility such as slot, day, location or party size where supported.

Display eligible discounts near time slots and before final booking confirmation. Show the selected offer again on the receipt. Coupon validation happens on the server and must not trust a client-submitted discount amount.

For restaurants without a configured per-seat price, retain the offer as a deferred discount on the eventual bill, such as “20% off the final bill.” Do not invent a subtotal or show a fake amount paid. A deferred offer is not an already processed refund or captured payment.

Merchant coupons belong to the merchant's customer transaction. Future SaaS subscription promotions are a separate billing domain.

## 14. Returns, refunds and support tickets

Support automation covers return/refund requests, optional exchange/store-credit resolutions, price/stock answers, order verification, ticket status and optional evidence/CSAT behavior.

Intended return flow:

1. Obtain order ID and resolve the order.
2. Verify matching customer email or phone.
3. Evaluate delivery status/date and configured return window.
4. Show eligible items and remaining returnable quantities.
5. Collect reason, required/optional photos according to configured policy, and allowed resolution.
6. Show a review card with order, item, quantity, reason, evidence and outcome.
7. Confirm once, create the ticket and evidence links, then show the actual ticket card.

Duplicate handling must consider the item/quantity: if the only item already has an applicable ticket, show that ticket; if other items remain eligible, offer only those remaining items/quantities. Do not block an entire multi-item order merely because one product has a ticket.

If identity cannot be verified, supported complaint escalation must be clearly marked unverified and cannot imply an authorized return. Ticket creation and money movement are separate: a refund request does not mean money was refunded.

The final ticket card reports persisted status and permitted next steps; avoid reintroducing removed status/agent buttons without a new requirement. CSAT appears according to its configured lifecycle. Back/cancel must affect the current flow, and Confirm must never be interpreted as a customer's name.

## 15. Ticket dashboard

Routes: `/tickets/all`, `/tickets/new`, `/tickets/[id]`, `/tickets/analytics`; `/tickets` redirects to the list.

The queue supports filters/search/pagination and exposes reference, customer, status, priority, type, assignment and SLA context. Staff can create tickets, link/select contacts, attach media, reply, add internal notes and change supported lifecycle fields.

Ticket detail connects conversation, order/return context, evidence, notes and events. Analytics reports supported ticket statistics. Evidence must remain available according to ticket retention even if the original chat transcript expires.

These merchant customer-support tickets are distinct from future platform-support cases about the merchant's SaaS subscription or application access.

## 16. Inbox and human handoff

The inbox is the operator conversation workspace with list, thread and customer/context panel. Tabs distinguish bot-active, waiting, human-handled and resolved conversations.

Selecting a conversation loads message history and linked context. Structured chatbot cards should remain understandable in the agent thread. Agent replies use the shared session/message path and must reach the embedded widget or appropriate provider channel.

Handoff changes ownership so AI and human staff do not both answer uncontrollably. Resolve/resume actions need clear state transitions. Realtime delivery and synchronization/cache fallback support updates and reconnects; a successful send in the dashboard alone is not sufficient verification of customer receipt.

Important files include `src/app/(dashboard)/inbox/page.tsx`, `src/app/actions/chat.ts`, inbox API routes, realtime helpers and `DashboardFlowCard`.

## 17. Contacts, customer profiles and segmentation

Customer identity is captured from explicit details in chat, checkout, booking, support or email and linked into tenant contacts. A contact is an end customer, not a dashboard employee account.

Customer 360 can bring together name, email, phone, address, preferences, tags, profile fields, lifecycle, consent, notes, conversations, orders, bookings, tickets and activity. Staff can edit supported profile fields through `/contacts/[id]`.

Contact lists support search, create/import, selection and bulk segment actions. Segments can be manual or driven by behavior such as booking, purchase or support activity. A person may belong to multiple relevant groups; moving manually should follow explicit membership semantics.

Lead capture validates extracted details, respects declines and records consent where implemented. Do not infer marketing consent solely because a customer supplied a phone number for a receipt. Avoid treating quantities, dates, order IDs or interaction labels as identity fields.

The sales-pipeline page currently uses local demonstration state; it is not proof of a persistent sales-deal system.

## 18. Email bots

Workspaces can associate different mailbox identities with specialized bots, such as support, service or sales. Workspace Integrations contains SMTP/provider and mailbox configuration; the bot editor exposes assigned mailbox policies; `/bots/emails` is the email operations screen.

Email handling includes sender/thread normalization, triage, safe FAQ answers, draft-for-review and human escalation paths. Policies include safe automatic replies, draft-all and human-only modes. Order-related messages should use verified internal/connected records before generating a summary.

A mailbox needs real inbound delivery and outbound credentials/configuration; entering an email address alone cannot activate a complete bot. SMTP is an outbound mechanism and does not by itself ingest incoming mail. Preserve provider identity, reply threading, delivery state and retry behavior.

Sensitive/unsupported requests should become a draft or human case rather than fabricated automated action. Future subscription email quotas are described in the separate tier plan and are not assumed enforced today.

## 19. Channels and integrations

Integration UI includes messaging, email, calendar and custom integration definitions. Existing code has paths for WhatsApp/Meta, Telegram, Chatwoot, Google Calendar, Calendly, Acuity, custom calendar APIs and store/cart events, with varying completeness and setup needs.

Calendar adapters can read availability/create or manage external events where implemented; provider-specific restrictions and credentials still apply. Do not promise universal bidirectional sync without checking callback/reconciliation support.

Provider integration responsibilities include authentication, secret storage, tenant assignment, test/reconnect, webhook validation, normalization, send/read behavior, error handling and delivery/sync audit.

Web is the richest interactive surface. Other channels require explicit mappings for choices, forms, attachments and status information. Channel template approval/provider limits remain external requirements, not a capability granted by a UI toggle.

## 20. Marketing, campaigns and triggers

Product intent includes campaigns, audiences/segments, channel selection, content/templates, scheduling, journeys, coupons, proactive website messages and cart-triggered upsells.

Trigger management has data-backed rule/analytics paths. Store/cart normalization can record customer cart behavior and produce realtime callouts. Rules can reference configured conditions and messages, but runtime condition support should be checked before adding new rule types.

Campaign pages have mixed maturity: list/create have data paths while several result, journey, template and channel-settings screens use mocks or placeholders. Do not tell another agent that every visible campaign action sends real messages.

Any production automation needs consent/suppression, correct audience scope, verified sender/provider, deduplicated delivery jobs and accurate outcomes. Future SaaS quotas and billing must wrap these same send paths.

## 21. Analytics and operations

Implemented or represented reporting areas include per-bot metrics, trigger analytics, tickets, booking/restaurant/commerce funnels, offer performance and workspace activity. Booking analytics aims to show conversion, abandonment, occupancy, no-shows, revenue-related measures and utilization where underlying data supports them.

Workspace-wide analytics, behavior/session replay and lead-score pages contain sample data in the reviewed inventory. Examples of occupancy or revenue in a design image are not real metrics.

Features → Activity log exposes business events; Notifications exposes confirmation/reminder attempts and failures/retry actions. Background routes handle retention, notification delivery, abandoned-state processing and enrichment. Reliable operation requires deployment configuration for these jobs.

## 22. Settings and unfinished surfaces

Workspace settings include integration configuration, retention and other business settings. Business-hours forms, templates, team, subscription groups, API keys and webhooks have varying implementation status.

In particular, the reviewed Team page/API has mock behavior; full employee membership/access control is planned. Subscription groups refer to message preferences and are not equivalent to SaaS billing subscriptions. Some hours forms and webhook/template controls need persistence/runtime wiring verified.

Existing `/admin`, plan/invoice tables and auth middleware are foundations. Complete SaaS checkout, published tiers, usage metering, granular permissions and enterprise administration remain specification work in documents 15 and 16.

## 23. Retention and data ownership

Current code constants/policies distinguish:

| Data | Policy |
| --- | --- |
| Browser/widget history | 3 days |
| Unfinished return flow | 3 days |
| Unfinished booking/order flow | 24 hours |
| Inventory hold | 15 minutes |
| Server chat transcript | Workspace choice of 3, 30 or 90 days; default 30 |
| Closed/resolved ticket retention | Separate 365-day policy |

Actual deletion depends on configured jobs and storage cleanup. These durations are separate from future billing/audit retention. Subscription cancellation is not automatic workspace deletion. Deleting a chat must not accidentally remove evidence still referenced by an eligible ticket.

## 24. Technical map for the next agent

| Concern | Main code locations |
| --- | --- |
| Customer dashboard | `src/app/(dashboard)` and `src/components/layout` |
| Shared feature screens | `src/components/features/BookingFeaturesDashboard.tsx`, `CommerceDashboard.tsx`, `BookingAnalyticsDashboard.tsx`, `RestaurantSettings.tsx` |
| Bot configuration | `src/app/(dashboard)/bots/[id]/edit/page.tsx`, `src/components/bots` |
| Widget/cards | `src/components/chat/ChatWidget.tsx`, `AppleChatCards.tsx`, related flow renderers |
| Public chat API | `src/app/api/chat`, `/api/v1/chat`, widget config routes |
| Flow routing/support | `src/lib/supportFlow.ts`, `interactiveReturnFlow.ts` |
| Booking engine/intent | `src/lib/booking.ts`, `bookingFlow.ts`, `bookingIntent.ts`, `conversationEntities.ts` |
| Commerce engine/intent | `src/lib/commerce.ts`, `commerceFlow.ts`, `commerceIntent.ts` |
| Order lookup | `src/lib/orderTrackingFlow.ts`, `orderResolver.ts`, `datasource.ts` |
| Offering discovery | `src/lib/offeringDiscovery.ts`, `offeringEnrichment.ts` |
| Customer identity | `src/lib/customerContacts.ts`, `src/lib/leadCapture` |
| Ticket records | `src/lib/ticketing.ts`, ticket APIs and migrations |
| AI and retrieval | `src/lib/gemini.ts`, embeddings/chunker/manual-QA modules |
| External calendars | `src/lib/calendarAdapters.ts` |
| Messages and realtime | `src/app/actions/chat.ts`, `src/lib/chat`, `src/lib/realtime`, inbox APIs |
| Jobs and providers | `src/app/api/qstash`, `src/app/api/cron`, webhook routes and provider libraries |
| Schema and atomic operations | `supabase/*.sql`; reconcile migration order and deployed state |
| Auth/tenant boundary | `src/middleware.ts`, `src/lib/requestAuth.ts`, `auth.ts`, Supabase policies |
| Platform admin foundation | `src/app/admin`, `src/app/api/admin` |

The stack is Next.js/React/TypeScript with Supabase for auth/data/realtime/storage and Redis for cache/ephemeral state/rate limits. QStash supports background work. AI and external providers sit behind server libraries. Consult installed dependencies and actual runtime code rather than assuming a provider is configured.

## 25. Core business invariants

1. Tenant data must not cross workspace boundaries through UI, APIs, lookup tools, storage or realtime.
2. A bot sees only its permitted offerings and knowledge/source assignments.
3. Customer identity is verified for protected order/booking/ticket operations.
4. Prices, inventory, slots and discounts are calculated/validated server-side.
5. Confirmation creates one persisted result despite retries or double-clicks.
6. Inventory/table capacity cannot be overcommitted by concurrent customers.
7. Acknowledged notes, photos, add-ons and selected quantities persist into dashboard records.
8. Final cards use real IDs and statuses; no successful-looking receipt after a failed transaction.
9. Topic changes and cancel/back actions do not become form data or names.
10. Human handoff uses the same conversation and ownership state as the widget.
11. UI availability and plan proposals are not proof of implemented backend capability.
12. Failed dependencies produce honest, friendly recovery messages without raw errors.

## 26. Representative acceptance journeys

### Shop

A business imports lamp products and assigns them to a sales bot. A customer asks for a lamp; the widget shows matching real items, permits quantities and additional search, applies an eligible coupon, collects contact/address data and confirms one order. Inventory changes once, a receipt shows the real reference, and staff see the same order/contact in the dashboard.

### Restaurant

A business configures branches, tables and hours. A customer asks for five people on a date/time. The bot requests only missing branch/details, checks feasible seating, shows slots and applicable offers, collects name/phone plus optional note, and confirms one reservation. The manifest shows the party, location/table details, note and discount.

### Support

A customer requests a return on an internal or connected-source order. The bot verifies identity, offers only eligible remaining items, collects reason/evidence/resolution and creates one ticket. The dashboard displays the request and attachments; retrying confirmation does not duplicate it.

### Human assistance

A customer requests a person. The inbox marks the session appropriately, staff reply, and the embedded widget receives the message. Bot ownership changes prevent competing responses. The history and customer context remain linked.

### Email

A configured support mailbox receives a customer question. The assigned bot uses its own knowledge/live lookup and reply policy. A safe supported reply or reviewed draft is sent through the correct sender, with delivery state visible; sensitive unknown questions are escalated.

## 27. How an agent should use this brief

Read this as product context, then inspect the relevant code and tests for the requested task. Preserve existing workspace data and unrelated edits. Reuse existing flow/card/service primitives when applicable and validate the actual embedded customer experience plus dashboard persistence for affected workflows.

Do not silently expand a feature change into a subscription rollout, production migration, provider deployment or permission redesign. Those are separate scopes. For SaaS implementation, use the companion plans below and explicitly distinguish new behavior from current behavior.

## 28. Supporting documents

- [Documentation index](README.md)
- [Dashboard route inventory and implementation status](14-route-inventory.md)
- [Admin control plane and SaaS launch plan](15-saas-admin-launch-plan.md)
- [Tier allowances, feature availability and enforcement plan](16-subscription-tiers-entitlements-spec.md)

This brief can be shared on its own to explain the product. The linked documents provide additional implementation detail when the agent has repository access.
