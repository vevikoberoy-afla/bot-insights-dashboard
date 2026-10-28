# Features dashboard: booking, restaurant, commerce

## Route delegation

- `/features` renders feature cards and fetches `/api/features/summary` for counts/status.
- `/features/[kind]` delegates to `BookingFeaturesDashboard`; `kind` is services, offers, bookings, events, notifications or analytics.
- `/features/commerce/[kind]` delegates to `CommerceDashboard` for products, orders, inventory and related commerce views.

## Booking dashboard implementation

`BookingFeaturesDashboard` uses a five-minute in-memory request cache and request de-duplication map. It loads only the collections needed by the selected kind, with silent refresh for bookings every 20 seconds while the page is visible. It provides search, status/type/actor/date filters, skeletons, empty states and error messaging.

Services support duration, timezone, capacity, notice/cancellation windows, working hours, blackout dates, staff, locations, add-ons, questions, confirmations/reminders, external calendar IDs, price/currency and restaurant configuration. Offers support quantity/claims, service/product links, active windows, waitlists and percentage/fixed rules.

Bookings render a manifest-style record with customer name, phone, schedule, service, quantity, branch, email, reference, channel, notes and status actions (cancel, complete, no-show, reschedule). New/edit booking uses a drawer with slot lookup. CSV export is generated client-side with formula-safe escaping.

Events show actor/action detail; notifications show attempts/errors and allow failed notification resend. Analytics combines booking, offer, flow and commerce-order data in `BookingAnalyticsDashboard`.

## Restaurant capacity

The service drawer includes restaurant mode: slot interval, auto assignment, turn times, table inventory, capacity and combined-table limits. The booking backend performs overlap/capacity checks and returns the allocated/available table information used by the manifest.

## Commerce dashboard

`CommerceDashboard` is the catalogue/order/inventory UI. Product records support table/grid listing, product detail/edit, CSV/XLSX import, search, category/status filters, bulk selection, delete/edit, stock adjustments and inventory history. Order views show line items, customer/address/contact data, totals, coupons, fulfillment/status and lifecycle actions. The backend remains authoritative for inventory holds, order placement, release and status changes.
