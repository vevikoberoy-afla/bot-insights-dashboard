# Dashboard shell and navigation

## Route and layout

`src/app/(dashboard)/layout.tsx` is the authenticated shell. It creates a browser Supabase client, checks `auth.getSession()`, redirects unauthenticated users to `/auth/login`, loads the tenant row from `clients`, and resolves a missing `context_id` through `/api/client/context`.

The rendered hierarchy is:

`DashboardLayout → Sidebar(clientData) + TopBar(clientData) → scrollable main → page`

While the tenant is loading, `DashboardShellSkeleton` prevents a blank/circular loading experience. Once loaded, pages share the surface/ink theme and compact dashboard spacing.

## Navigation destinations

| Group | Routes in this folder | Runtime purpose |
| --- | --- | --- |
| Overview | `/overview` | KPIs and recent workspace activity |
| Inbox | `/inbox` | Conversations, flow cards, agent replies and handoff |
| Bots | `/bots/all`, `/bots/new`, `/bots/[id]/edit`, `/bots/[id]/flow`, analytics, emails, triggers | Bot lifecycle and configuration |
| Knowledge | `/knowledge/all`, `/knowledge/add`, `/knowledge/[id]`, analytics | Dataset/source/chunk administration |
| Databases | `/databases/all`, `/databases/[id]`, analytics | Live source connections and lookup tests |
| Features | `/features`, `/features/[kind]`, `/features/commerce/[kind]` | Booking, offers, bookings, events, notifications, analytics, products/orders |
| Contacts | `/contacts`, `/contacts/[id]`, `/contacts/segments`, `/contacts/pipeline` | Customer 360 and audience management |
| Campaigns | `/campaigns/*` | Campaign creation, audience, delivery, journeys, coupons |
| Tickets | `/tickets/all`, `/tickets/new`, `/tickets/[id]`, analytics | Queue, ticket detail and SLA reporting |
| Analytics | `/analytics`, behavior, lead scores | Workspace reporting and prototype views |
| Settings | `/settings/*` | Workspace behavior, hours, channels, integrations, team |
| Templates/webhooks | `/templates/*`, `/webhooks` | Reusable content and event delivery |

The `/tickets` index redirects to `/tickets/all`. There is no dashboard-side state container; pages own local state and use shared cache helpers where implemented.
