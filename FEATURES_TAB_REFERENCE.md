# Features tab reference

This document describes the current **Features** area in the dashboard, including the sidebar position, page routes, UI controls, data behavior, and the customer-facing capability each feature enables.

## 1. Where Features is located

### Desktop dashboard sidebar

The Features section is in the left sidebar, directly below **Overview** and **Live Inbox**. It is a collapsible group and opens automatically when the current URL starts with `/features`.

Sidebar order:

1. **All Features** — `/features`
2. **Create Booking Service** — `/features/services`
3. **Offers & Inventory** — `/features/offers`
4. **Product Catalogue** — `/features/commerce/catalogue`
5. **Customer Orders** — `/features/commerce/orders`
6. **Inventory Ledger** — `/features/commerce/inventory`
7. **All Bookings** — `/features/bookings`
8. **Booking Analytics** — `/features/analytics`
9. **Activity Log** — `/features/events`

The sidebar currently does not include separate links for Notifications or Flow sessions, although both are supported by the feature API and Notifications is available from the All Features page.

### Shared dashboard positioning

- **Sidebar:** fixed-width navigation on the left (`240px`).
- **Main content:** centered content area with a maximum width of approximately `1152px`.
- **Page header:** top row containing a back link to All Features, the page title, and, where applicable, a right-aligned create button.
- **Toolbar:** search input appears above record lists. Bookings additionally show a status filter and CSV export.
- **Record list:** stacked bordered cards below the toolbar.
- **Create/edit UI:** right-side full-height drawer on desktop and a full-width overlay on small screens.
- **Errors:** inline alert near the top of the page or inside the drawer.
- **Loading state:** `Loading…` text in the page content while API data is being fetched.

## 2. All Features landing page

Route: `/features`

The page begins with the eyebrow label **FEATURES**, followed by the title **Bookings and conversational commerce** and a short description. Below the header is a responsive three-column card grid. Each card is a navigation entry; cards become one column on narrow screens.

### Card grid and positioning

Cards are displayed left-to-right, then top-to-bottom:

| Position | Card | Route | Purpose |
|---|---|---|---|
| Row 1, column 1 | Booking services | `/features/services` | Configure appointment services, availability, capacity, buffers, and reminders. |
| Row 1, column 2 | Campaign offers | `/features/offers` | Create timed appointment or product promotions. |
| Row 1, column 3 | All bookings | `/features/bookings` | Create, reschedule, cancel, complete, and export reservations. |
| Row 2, column 1 | Product catalogue | `/features/commerce/catalogue` | Publish products, prices, descriptions, and stock. |
| Row 2, column 2 | Customer orders | `/features/commerce/orders` | View chatbot orders, receipts, statuses, and customer details. |
| Row 2, column 3 | Inventory ledger | `/features/commerce/inventory` | Audit stock sales, returns, holds, releases, and adjustments. |
| Row 3, column 1 | Analytics | `/features/analytics` | Track bookings, no-shows, funnel progress, and offer performance. |
| Row 3, column 2 | Activity log | `/features/events` | Review booking and configuration changes. |
| Row 3, column 3 | Notifications | `/features/notifications` | Inspect confirmation and reminder delivery. |

Each card contains a feature name with a right arrow and a one-line description. The complete card is clickable.

## 3. Booking services

Route: `/features/services`

### Page header

- Back link: upper-left, `← Features`.
- Title: **Booking services**.
- Upper-right action: **+ Create service**.

### List area

The search field is above the list. Each service card shows:

- service name and description;
- active/inactive status;
- duration in minutes;
- timezone;
- capacity per slot;
- an **Edit** action.

### Create/edit drawer fields

The drawer opens from the right and contains the following sections in this order:

1. **Identity**
   - Service name (required)
   - Description
   - Timezone, for example `Asia/Kolkata`

2. **Scheduling rules**
   - Duration, 5–480 minutes
   - Buffer, 0–240 minutes
   - Capacity, 1–1000 people/units per slot
   - Minimum notice, 0–720 hours
   - Change/cancellation deadline, 0–720 hours

3. **Calendar provider**
   - Native scheduler by default
   - Active Google Calendar, Calendly, Acuity, or custom-calendar integrations can be selected
   - External calendar ID
   - External event type ID/URI when an external provider is selected

4. **Availability**
   - Weekly hours JSON editor; days use `0` for Sunday through `6` for Saturday
   - Multiple opening ranges per day are supported
   - Blackout dates as comma-separated `YYYY-MM-DD` values

5. **Messaging**
   - Reminder offsets in minutes, comma-separated, up to ten reminders
   - Enable in chatbot
   - Send email confirmations and reminders through configured SMTP
   - Send WhatsApp booking confirmations
   - Send WhatsApp reminders

6. **Save**
   - Full-width Save button at the bottom of the drawer
   - Close button in the drawer header

Service validation rejects invalid timezones, malformed hours, invalid blackout dates, invalid numeric ranges, and more than ten reminders.

### Customer-facing result

Active services can be offered in the chatbot. The scheduler calculates valid slots using timezone, working hours, duration, buffers, blackout dates, minimum notice, capacity, existing confirmed bookings, and an enabled external calendar provider.

## 4. Offers & inventory

Route: `/features/offers`

### Page header and list

- Header title: **Offers & inventory**.
- Upper-right action: **+ Create offer**.
- Search field above the offer cards.
- Each card shows the name, description, status, real claims versus quantity, a progress bar, and an optional displayed-claims override.
- Existing offers have an **Edit** action.

### Create/edit drawer fields

1. **Offer identity**
   - Offer name (required)
   - Description

2. **Quantity and pricing**
   - Real stock/claim quantity
   - Maximum per customer
   - Price
   - Currency (three-letter currency code, default INR)
   - Displayed claims override; blank uses actual claims

3. **Campaign window**
   - Start date/time
   - End date/time
   - Status: draft, active, paused, or ended

4. **Offer type**
   - Appointment service selector, or
   - Simple claim with no appointment

5. **Commerce connection**
   - Active catalogue product selector
   - Selecting a product makes the offer available for chatbot product ordering
   - Product and appointment service are mutually exclusive in the editor

6. **Audience and experimentation**
   - Audience channels, comma-separated
   - Customer email domains, comma-separated
   - A/B offer messages, one message per line

7. **Inventory and waitlist**
   - Allow waitlist checkbox
   - The UI explicitly notes that payment collection is not enabled

### Customer-facing result

An active offer can expose either an appointment reservation flow or a product claim/order flow. Claims are bounded by quantity and per-customer limits. Waitlist support is available when enabled.

## 5. Product catalogue

Route: `/features/commerce/catalogue`

### Page header and toolbar

- Header title: **Product catalogue**.
- Description: products available to customers in chat.
- Upper-right actions: **+ Product** and **Export Excel**.
- Search field immediately below the header.

### Product cards

Each product card displays:

- product name;
- SKU, receipt-like identifier, or creation date;
- status;
- currency and price;
- total stock and available stock;
- low-stock warning when stock is at or below the configured threshold;
- **Edit**;
- **Adjust stock**.

### Create/edit product drawer

Fields are shown in this order:

- Product name (required)
- SKU (required)
- Description
- Image URL
- Price (required)
- Currency
- Stock quantity
- Low-stock alert threshold
- Status: draft, active, or archived
- Track inventory checkbox
- Allow backorders checkbox
- Full-width Save product button

### Inventory adjustment modal

The centered modal contains:

- Quantity change, positive or negative
- Reason
- Apply
- Cancel

Stock changes are recorded as inventory movements. Active products are available to offers and the chatbot catalogue. The catalogue API reads the availability view so held quantities are separated from available quantities.

## 6. Customer orders

Route: `/features/commerce/orders`

### Page header and toolbar

- Header title: **orders** (the page content identifies this as customer orders).
- Description: orders and receipts across every chatbot channel.
- **Export Excel** at the upper-right.
- Search field below the header.

### Order cards

Each card shows:

- order reference;
- receipt number or creation date;
- status;
- customer name and email;
- channel;
- ordered line items and quantities;
- currency and total.

### Order actions

Depending on status:

- **Mark processing** for orders in `placed` state;
- **Fulfil** for orders that are not fulfilled or cancelled;
- **Cancel & restock**, which changes the order status and returns inventory.

Orders created in the chatbot use the internal `commerce_orders` and `commerce_order_items` tables. The order-tracking flow can find them by either `ORD-...` reference or `RCT-...` receipt number and then verifies the customer email or phone before disclosing details.

## 7. Inventory ledger

Route: `/features/commerce/inventory`

### Page header and toolbar

- Header title: **inventory**.
- Description: append-only stock changes from sales, cancellations, and adjustments.
- **Export Excel** at the upper-right.
- Search field below the header.

### Ledger cards

Each movement displays:

- timestamp;
- movement type;
- quantity delta;
- stock after the movement;
- reason/note;
- associated product name and SKU when available.

The ledger includes sales, returns, hold/release operations, cancellations, manual adjustments, and synchronization movements. It is read-only from this page; manual changes are made through the catalogue’s **Adjust stock** action.

## 8. All bookings

Route: `/features/bookings`

### Page header and toolbar

- Header title: **bookings**.
- Upper-right action: **+ Create booking**.
- Search field.
- Status filter with All statuses, confirmed, cancelled, completed, no-show, and waitlisted.
- **Export CSV** button.

### Booking cards

Each card shows:

- booking reference;
- customer name/email;
- channel;
- quantity;
- appointment time, or “No appointment” for a claim-only booking;
- current status.

### Booking actions

For confirmed or waitlisted bookings:

- Cancel
- For confirmed bookings: Complete, No-show, and Reschedule when a service is attached

### Create/reschedule drawer

The drawer collects:

- customer name;
- email;
- phone;
- quantity;
- offer selector;
- service selector;
- waitlist-if-stock-exhausted option;
- date selector;
- **Find available times**;
- available slot buttons;
- Save.

Bookings use an idempotency key and an atomic database reservation function to prevent capacity overselling. Confirmed bookings can create an external calendar event when the selected service has an enabled provider.

## 9. Booking analytics

Route: `/features/analytics`

The page has two analytics blocks.

### Conversion funnel block

At the top of the content area, four metric cards show:

- Started
- Completed
- Abandoned
- In progress

Below the cards, the page lists completion and abandonment counts by flow type.

### Reservation metrics block

The next row shows:

- Reservations
- Confirmed
- Completed
- No-shows

Below that:

- **By channel** lists booking volume for each channel.
- **Offer performance** lists each offer’s real claimed count against its quantity.

Analytics reads booking records and booking flow sessions. If the commerce automation storage migration is missing, the page displays an installation message instead of exposing a raw SQL error.

## 10. Activity log

Route: `/features/events`

- Read-only page using the shared feature list layout.
- Search field appears above the records.
- Each event card shows its action/kind, details or timestamp, and status when present.
- Events are generated for booking creation, cancellation, rescheduling, completion, no-show, service/offer changes, and other feature mutations.
- No create/edit action is shown.

## 11. Notifications

Route: `/features/notifications`

This route is reachable from the Notifications card on `/features`; it is not currently a dedicated sidebar item.

- Read-only list of booking confirmation and reminder deliveries.
- Search field above the records.
- Each record shows the notification kind, timestamp, status, attempt count, and last delivery error.
- Notification records are created from booking confirmation/reminder settings and can be fanned out to configured email or WhatsApp delivery channels.

## 12. Feature API and storage map

The UI calls `/api/features/[kind]` for booking features. Requests are authenticated and scoped to the signed-in client.

| UI feature | API kind | Primary storage |
|---|---|---|
| Booking services | `services` | `booking_services` |
| Offers | `offers` | `booking_offers` / `booking_offer_stats` |
| Bookings | `bookings` | `feature_bookings` |
| Activity log | `events` | `booking_events` |
| Notifications | `notifications` | `booking_notifications` |
| Flow analytics | `flows` | `booking_flow_sessions` |
| Available slots | `slots` | service rules, confirmed bookings, external calendar availability |
| Restaurant tables | `slots` / booking reservation RPCs | service table configuration / `booking_table_assignments` |
| Product catalogue | `/api/commerce/products` | `catalog_products` / `catalog_product_availability` |
| Customer orders | `/api/commerce/orders` | `commerce_orders` / `commerce_order_items` |
| Inventory ledger | `/api/commerce/inventory` | `inventory_movements` |

Required database migrations:

- `supabase/051_booking_features.sql` for native booking storage.
- `supabase/052_commerce_and_automation.sql` for catalogue, orders, inventory, automation, flow sessions, and commerce extensions.
- `supabase/065_restaurant_table_inventory.sql` for atomic restaurant table assignment, table combinations, turn-time occupancy, and release on cancellation.

## 13. Customer-facing chatbot capabilities enabled by Features

Once the relevant records are active and assigned to the bot/configuration, the chatbot can:

- show active catalogue products;
- collect product quantities and customer checkout details;
- create an order, receipt, inventory reservation, and order status;
- find internal orders by order reference or receipt number;
- verify order ownership using the checkout email or phone;
- show order items, status, total, delivery/tracking data when available;
- expose return/cancel actions where the order status allows them;
- show active appointment services and available slots;
- calculate restaurant availability from the requested party size, branch, table inventory, combination groups, and party-size turn time;
- atomically assign the smallest suitable table or allowed table combination and display it on the booking receipt and manifest;
- reserve, reschedule, cancel, complete, or mark a booking as no-show;
- apply offer quantity and per-customer limits;
- add customers to a waitlist when enabled;
- send configured booking confirmations and reminders;
- generate a calendar event when an external calendar integration is configured.

## 14. Current boundaries visible in the UI

- Payment collection is explicitly disabled in the offer editor; prices are informational/order totals unless a separate payment integration is added.
- Google Calendar, Calendly, Acuity, and custom calendar settings are selectable only when configured as active workspace integrations; the native scheduler remains the default.
- Notifications and flow sessions are implemented in storage/API but are not first-class sidebar entries.
- Activity and notification pages are read-only.
- Product catalogue and order pages use separate commerce routes and UI from the booking pages.
- The feature pages fetch data when first opened for a route and refresh after a save/status change. Browser caching/lazy loading behavior is handled separately from the feature definitions in this document.
