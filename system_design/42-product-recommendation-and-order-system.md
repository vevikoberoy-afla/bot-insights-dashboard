# Product recommendation and chatbot order system

Date: 2026-10-26

This document describes the product recommendation and ordering implementation currently present in the repository. It distinguishes implemented behavior from dependencies and observed limitations. It is not a proposed redesign.

## Product purpose

The commerce chatbot can:

- understand catalogue, purchase, price, availability, recommendation and order-management intents;
- search the products assigned to the current bot by product name, SKU or category;
- interpret open-ended needs through Hybrid RRF candidate retrieval and bounded LLM personalization;
- render product cards with images, price, stock, offers, coupons and quantity controls;
- hold inventory while a customer edits a cart;
- collect mandatory checkout details in one structured card;
- validate offers and coupons without unauthorized stacking;
- place an idempotent order and decrement inventory atomically;
- create/update the customer contact profile;
- render an invoice, confirmation and downloadable receipt; and
- verify an existing order before displaying, cancelling or redirecting an unsupported edit.

## End-to-end routing

```text
Customer message
  -> widget session HMAC verification
  -> rate limit + workspace/session/entitlement context
  -> deterministic support-flow router
  -> commerce intent guard
       - order management
       - catalogue browsing
       - explicit purchase
       - product information
       - open-ended recommendation
  -> bot-scoped product/configuration retrieval
  -> recommendation or deterministic catalogue search
  -> commerce state transition
  -> Apple-style structured card JSON
  -> durable message/card persistence
  -> widget renders card and posts silent structured actions
```

The commerce router runs before general RAG for a clear transactional intent. Booking language is explicitly excluded so phrases such as “book a table” cannot accidentally start product search. Return, refund, tracking and order-status language is also excluded from new-order intent.

## Intent classification

`src/lib/commerceIntent.ts` uses bounded local patterns and normalization for:

- `isPotentialCommerceRequest`;
- `isOrderManagementRequest`;
- `isCatalogueRequest`;
- `isPurchaseRequest`;
- `isProductInformationRequest`; and
- exact/fuzzy mentioned-product matching.

This gate is local CPU work and does not call a model. Recommendation language includes “recommend”, “suggest”, “gift”, “surprise”, “something special”, and similar need-based phrases.

`src/lib/offeringDiscovery.ts` separately classifies an interpretive request as `product`, `service`, `all`, or no recommendation. Support-management terms take priority and cannot enter recommendation discovery.

## Catalogue search path

`src/lib/chat/catalogRepository.ts` is the bot catalogue repository.

1. The request is scoped by `clientId` and `botId`.
2. Query length is limited to 200 characters, requested IDs to 50, and results to 50.
3. Migration `090_bounded_bot_catalog_search.sql` supplies `search_bot_catalog_page`.
4. Product availability comes from `catalog_product_availability`, which accounts for active inventory holds.
5. Products explicitly needed by the current cart are loaded alongside search results.
6. A bounded 256-entry / 16 MiB local cache has a 15-second TTL.
7. Concurrent identical searches share one promise.
8. During rolling deployment, only a missing-function error uses the older bounded 1,000-row compatibility read.

The commerce flow applies a second deterministic relevance rank across normalized name, SKU and category tokens. Exact name/SKU matches rank highest; simple plural stemming and partial token matching support natural customer wording.

Only products enabled for the selected bot are retained when a bot commerce configuration exists.

## Personalized recommendation path

Open-ended requests use this pipeline:

```text
Need-based customer phrase
  -> local recommendation scope classification
  -> embedding generation/cache
  -> `match_bot_offerings_hybrid` RPC
       - tenant and bot scope
       - product/service scope
       - lexical + vector Reciprocal Rank Fusion
       - maximum 15 candidates
  -> compact LLM reranking
       - only supplied IDs are accepted
       - maximum 5 selected results
       - one short reason per item
       - two-sentence conversational introduction
  -> introduction text card + product grid
```

The LLM never receives the complete catalogue. It sees at most 15 compressed candidate lines and must return strict JSON. Returned IDs are checked against the candidate map; invented IDs are discarded. A five-minute Redis result cache is tenant, bot, scope and normalized-query scoped.

If Hybrid RRF throws an error, the current fallback loads bot-scoped products/services, removes unavailable inventory, ranks a bounded local set and still produces real-record recommendations. If LLM personalization fails, a deterministic warm introduction and top-five list are used.

### Empty-candidate recovery

The Hybrid RRF function can legitimately return an empty or under-filled result while discovery embeddings are being backfilled. The implementation now tops results up from real, bot-scoped, in-stock catalogue records whenever the hybrid result contains fewer than three candidates. Only a merchant with no eligible records returns `null`.

The live gift test now returns a conversational introduction and five real `product_grid` cards. Returned IDs remain constrained to database candidates.

## Commerce state machine

The state key is:

```text
commerce_flow:<workspaceId>:<botId>:<sessionId>
```

Unfinished state follows the configured booking/order retention window. Inventory holds use a separate order-scoped key and expire after 15 minutes.

Main states:

| State | Purpose | Widget card |
| --- | --- | --- |
| `ask_product` | Ask for product/category text | `product_search` |
| `choose` | Browse matching products and select quantities | `product_grid` |
| `quantity` | Variant/quantity selection for a single product | `product_detail` |
| `cart` | Review items, browse more, edit quantities, coupon and upsell | `cart_card` |
| `offers` | Select an eligible campaign offer | `commerce_offer_picker` |
| `name` | Collect name, phone, address, PIN and optional email | `checkout_form` |
| `phone/address/pincode/email` | Compatibility text-entry states | text/quick replies |
| `review` | Final invoice and explicit confirmation | `order_summary` |
| complete | Confirmed order/receipt | `order_confirmation` or `order_receipt` |

Every state has a new `stepId`. Structured actions include `flowId`, `stepId`, expected revision and an action ID. A stale or duplicated card action cannot silently advance another step. Back restores the previous state snapshot; Cancel releases holds and closes the flow.

Card selections remain displayed on the originating card rather than being echoed as duplicate customer bubbles.

## Product and cart cards

`src/components/chat/FlowMessage.tsx` maps commerce messages to components in `AppleChatCards.tsx`:

- `AppleProductSearch` — inline catalogue query;
- `AppleProductGrid` — horizontally usable product selection with fixed card layout and per-product quantity;
- `AppleQuantityCard` — single-product quantity and variants;
- `AppleCartCard` — selected items, Browse Products, edit, checkout, coupons and upsell threshold;
- `AppleCommerceOffers` — eligible offer choice and stacking explanation;
- `AppleContactForm` — required delivery details;
- `AppleSummaryCard` — paper-style invoice review;
- `AppleReceiptCard` — confirmation and downloadable HTML receipt.

The grid payload includes name, configured display label, description/recommendation reason, SKU, image, original price, effective offer price, offer label, available quantity and in-stock state. Quantity selection and Proceed are part of the same card.

## Coupons, offers and upsell

The flow loads active product offers and coupons concurrently with the catalogue.

- Coupons may target products, categories, a minimum cart value, expiration and usage limits.
- Bot configuration can restrict which coupons/offers are exposed.
- Auto-apply coupons are selected by highest calculated saving.
- The cart can display “add X more to unlock Y” when the configured threshold gap is within `upsell_max_gap`.
- A coupon and campaign offer combine only when the coupon is stackable and explicitly lists that offer as compatible.
- The server revalidates coupon eligibility and stacking during order placement; UI state is never authoritative.
- Deferred restaurant/booking discounts can transfer to commerce only after matching the verified email or phone and are consumed after successful use.

## Inventory safety

Inventory is not reduced merely because a card is displayed.

1. Product availability subtracts active holds.
2. Selecting a quantity invokes `hold_catalog_inventory`.
3. Multi-item checkout invokes `hold_catalog_inventory_batch`, locking products in deterministic order.
4. Holds last 15 minutes and are released on cancel/edit where appropriate.
5. Stock and variant limits are checked before accepting a selection.
6. Backorders are honored only when enabled.
7. `commit_chat_order` performs idempotent order placement and stock consumption.
8. `place_catalog_order` is retained only as a rolling-deployment fallback when the atomic RPC is absent.
9. The flow uses a stable operation/idempotency ID so a retried Confirm cannot create a second order.

The atomic database implementation is supplied by migrations 089 and 091. Base catalogue, hold, order, inventory movement and automation tables/functions originate in migrations 052 and 059–061.

## Checkout and persistence

The structured checkout form requires:

- customer name;
- phone number;
- complete delivery/collection address; and
- postal/PIN code.

Email is optional. Server validation applies length and format limits independently of the widget.

Before final confirmation the bot renders line items, offer savings, coupon/booking discount, total, customer identity and delivery destination. Confirmation then:

1. upserts/stitches the tenant-scoped contact;
2. reacquires/validates the cart holds;
3. validates coupon and offer compatibility;
4. calls the atomic order commit;
5. links the contact to the order;
6. records selected variant metadata;
7. updates contact activity and last order reference; and
8. returns an order reference, receipt number, final total and downloadable receipt card.

The dashboard reads the same `catalog_products`, `commerce_orders`, `commerce_order_items`, holds, inventory movements and order-event records.

## Existing-order management

“Cancel/change/manage my order” follows a separate verification branch:

1. collect `ORD-…` reference;
2. request the order email or phone;
3. query within the current workspace;
4. compare normalized identity;
5. show receipt, cancellation confirmation, or the safety explanation for edits.

Placed orders are not mutated item-by-item in chat. The customer can keep or cancel and place a replacement, preventing partial inventory/accounting corruption.

## Security boundaries

- HMAC widget capability binds workspace, bot and session.
- Workspace/session entitlements are checked before the commerce mutation path.
- Catalogue, orders, coupons, offers and contacts are tenant scoped.
- Bot-level product assignments are enforced.
- The LLM selects only IDs supplied by the retrieval layer.
- Pricing, inventory, eligibility and totals are recomputed server-side.
- Order confirmation is idempotent and database atomic when migration 091 is installed.
- Contact/order lookup requires identity verification.
- Flow revision and replay protection reject stale/repeated card actions.
- Human handoff mode is preserved by structured-card persistence.

## Test results

The following tests passed:

- `scripts/test-offering-discovery.cjs`: intent guardrails, Hybrid RRF top-15, compact reranking and invented-ID rejection;
- `scripts/test-commerce-flow.cjs`: catalogue discovery, product grid, multi-item cart, holds, checkout, stale actions, atomic order/stock update, invoice, confirmation and cancellation release;
- `scripts/test-order-tracking-flow.cjs`: internal/connected order lookup and identity verification;
- `scripts/test-flow-persistence.cjs`: concurrent durable card persistence and handoff preservation; and
- `npm run typecheck`.

## Production-build TTFT/card turnaround

Benchmark: `scripts/benchmark-commerce-card-latency.mjs` against `next start`, using the configured hosted Supabase/Redis services. The benchmark selects one real in-stock result, renders the cart and checkout form, then cancels the flow to release its hold. JSON card responses deliver headers and body together, so body time represents first visible card time.

| Operation | Sample 1 | Sample 2 | Final sample |
| --- | ---: | ---: | ---: |
| Session initialization | 3,420 ms | 1,986 ms | 2,280 ms |
| “order lamp” -> 3-product grid | 6,592 ms | 4,031 ms | 4,374 ms |
| Select product -> cart card | 3,875 ms | 3,519 ms | 3,599 ms |
| Cart -> checkout form | — | — | 2,970 ms |
| Open-ended gift request -> response | 2,906 ms | 3,076 ms | 3,084 ms |

These numbers are the pre-optimization baseline. The post-optimization measurements are recorded in `43-commerce-optimization-implementation.md`.

Final sample server breakdown:

- product grid: rate `302 ms`, remaining turn-context tail `615 ms`, commerce routing/persistence `3,443 ms`, including cold bot configuration `1,672 ms`;
- selection to cart: authorization `1,334 ms`, revision `96 ms`, inventory/domain work `1,329 ms`, durable commit `828 ms`;
- cart to checkout: authorization `945 ms`, revision `76 ms`, domain work `1,089 ms`, durable commit `848 ms`.

These are local-to-hosted diagnostic samples, not production-region p50/p95/p99 or a latency SLA. The dominant delay is remote authorization, catalogue/config loading, inventory hold and durable persistence—not React card rendering.

## Primary implementation files

- `src/lib/commerceIntent.ts`
- `src/lib/offeringDiscovery.ts`
- `src/lib/chat/catalogRepository.ts`
- `src/lib/commerceFlow.ts`
- `src/lib/commerce.ts`
- `src/lib/botCommerceConfig.ts`
- `src/lib/supportFlow.ts`
- `src/app/api/chat/route.ts`
- `src/app/api/chat/flow/route.ts`
- `src/components/chat/FlowMessage.tsx`
- `src/components/chat/AppleChatCards.tsx`
- `supabase/066_universal_offering_discovery.sql`
- `supabase/089_chat_fast_path_and_batch_holds.sql`
- `supabase/090_bounded_bot_catalog_search.sql`
- `supabase/091_atomic_chat_commits.sql`
