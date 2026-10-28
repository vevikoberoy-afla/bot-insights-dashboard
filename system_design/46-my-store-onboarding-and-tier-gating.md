# My Store onboarding and tier-gated operations

## Purpose

The former generic Features landing page is now the workspace's **My Store** control surface. A new workspace must configure one of two deliberately separate operating models:

- **Commerce store** — catalogue, cart, inventory, payments, orders, fulfilment, delivery, returns, coupons, and product analytics.
- **Booking business** — services, availability, staff/branches, restaurant tables or resources, capacity, reservations, reminders, receipts, slot offers, and booking analytics.

A workspace may configure both when its master-admin plan enables both. Each type has one workspace record, so reopening setup updates it instead of creating duplicates.

## Request and data flow

```text
/features
  -> browser cache lookup
  -> GET /api/storefront
  -> verified JWT + workspace membership
  -> workspace_storefronts + bot assignments + parallel readiness counts
  -> onboarding wizard or store operations home

Save
  -> POST /api/storefront
  -> settings write permission + entitlement check
  -> input normalization
  -> configure_workspace_storefront RPC
  -> owner/admin check + feature check + related-bot ownership check
  -> atomic upsert, assignments, and audit event
  -> cache invalidation and immediate sidebar rename
```

## Tier authority

No separate plan system was introduced. The existing founder-controlled entitlements remain authoritative:

| Store capability | Feature/limit authority |
|---|---|
| Commerce setup and visibility | `commerce.enabled` |
| Booking setup and visibility | `booking.enabled` |
| Restaurant/table mode | `restaurant.enabled` and `restaurant.tables.active` |
| Offers | `offers.targeted.enabled` and `offers.active` |
| Product capacity | `products.active`, `products.retained` |
| Service capacity | `services.active` |
| Analytics | `analytics.enabled` |
| Bot assignment availability | `bots.enabled`, bot allowances, and team access |

The UI hides unavailable operational cards, while API/RPC checks independently reject forbidden setup. UI hiding is never the security boundary.

## Onboarding stages

1. Choose commerce or booking. Disabled plan choices remain visible but unavailable.
2. Configure identity, category, timezone, currency, contact, location, and operating defaults.
3. Assign owned bots, review, and atomically create the store.

After setup, a readiness card directs commerce users to their first product and booking users to their first service. The store home then exposes only tools allowed by both the subscription and the employee's module permissions.

## Performance

- Store metadata is not loaded by `/api/chat`, `/api/chat/flow`, RAG retrieval, booking execution, or commerce execution.
- Dashboard startup reads storefront names in parallel with existing workspace state.
- `/api/storefront` reads counts in parallel and is retained in the existing bounded browser cache.
- Bot records are lazy-loaded only when the user reaches the assignment step.
- Navigation prefetch warms only the destination selected by the user.

## Storage and deployment

Apply `supabase/102_workspace_storefront_onboarding.sql` after the SaaS, booking, and commerce migrations, then refresh the Supabase schema cache. The migration creates:

- `workspace_storefronts`;
- `workspace_storefront_bots`;
- `configure_workspace_storefront(...)`.

The tables deny browser roles and are accessed through verified server routes. The RPC is service-role-only and repeats membership, entitlement, and ownership checks inside PostgreSQL.

## Verification

`scripts/test-saas-control-plane.cjs` covers:

- idempotent same-type setup;
- one primary storefront;
- cross-tenant bot rejection;
- non-member rejection;
- master-admin feature-gate denial;
- independent commerce and booking storefronts.
# Navigation and multi-store UX

- The left navigation renders each configured store by name under **My Store**.
- Store entries open `/features/stores/:id`, selecting that store's dedicated card home.
- Operational pages are intentionally reached from the selected store's cards instead of being duplicated in the global navigation.
- `/features/store-settings` lists current stores on the left and keeps **Create new store** on the right.
- The store home does not repeat plan allowances or the legacy usage panel. Subscription details remain under account settings and are still enforced by the API and master-admin entitlements.
