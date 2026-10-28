# Dashboard data flow and implementation status

## Common request path

```text
Supabase Auth session
  → dashboard layout loads clients/context_id
  → page obtains tenant/user context
  → page renders cached/loading state
  → Supabase/API query or mutation
  → toast/error + local state update
  → realtime/cache invalidation where supported
```

Domain truth lives in Supabase tables/RPCs and server libraries. Dashboard state is a presentation cache, not an alternate order, booking, ticket or inventory ledger.

## Cache and lazy-loading policy

- Shell blocks only on auth/client identity and displays skeleton UI.
- Inbox caches conversations for one minute and message history for five minutes in memory/localStorage.
- Booking feature data uses a five-minute memory cache and deduplicates concurrent requests; bookings silently refresh every 20 seconds while visible.
- Bot editor prefetches linked configuration and database/integration lists while the editor opens.
- Ticket list/analytics use `tickets-cache` helpers.
- Pages that call `cache: 'no-store'` or include a timestamp intentionally bypass browser cache for sensitive/latest state.

## Implemented versus prototype

### Data-backed/native

Authenticated shell, overview Supabase queries, inbox/realtime, knowledge dataset/source/chunk management, database/source tests, bot editor APIs, booking/commerce feature dashboards, contacts/profile/segments, ticket queue/detail/new/analytics, bot analytics, trigger analytics and integration CRUD have production data paths.

### Partial/provider-dependent

Campaign sends, email/WhatsApp delivery, calendar synchronization, Chatwoot, team provisioning, PostHog/Umami, webhooks, Meta templates and QStash require configured providers and deployment secrets. Their pages may still be useful configuration surfaces.

### Explicit placeholders or mock UI

Workspace analytics charts, behavior/session replay, lead scores, campaign results/journeys fallbacks, templates, webhook logs, team, canned responses, subscription groups, settings coupons, database analytics, knowledge analytics, bots analytics and channel campaign subpages contain `MOCK_*`, local state or `ComingSoon`. They should not be treated as live reporting or persistence until connected.

## Migration/runtime dependencies

Dashboard pages depend on the Supabase schema migrations documented in the root `system_design` folder, especially ticketing, booking, commerce, contacts, email, retention, restaurant capacity and universal offering discovery migrations. A missing table/schema-cache error is a deployment/migration issue, not a frontend loading state.
