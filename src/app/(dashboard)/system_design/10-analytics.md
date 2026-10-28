# Analytics dashboard

## Workspace analytics

`/analytics` renders KPI cards for conversations, bot deflection, leads and influenced revenue, workload charts for bot versus human handling, knowledge gaps, campaign funnel and channel distribution. The chart arrays in this page are currently static mock data; production analytics APIs exist under `/api/analytics/*` and `/api/features/analytics` but are not wired into every chart on this page.

## Specialized pages

- `/analytics/behavior` is a PostHog-style activity/session replay prototype with local event data, search and a CRM-profile action.
- `/analytics/lead-scores` is a local lead-scoring prototype with score, trend, status, factors and filters.
- `/features/analytics` renders booking/restaurant analytics from booking, offer, flow and order rows and is the most data-backed feature analytics page.
- `/bots/[id]/analytics` uses the bot analytics API for per-bot metrics.
- `/bots/triggers/analytics` uses the trigger analytics API.
- `/tickets/analytics` uses ticket analytics API and browser cache.

## Reporting design

Analytics should keep tenant/client and bot filters explicit, show the time range used, distinguish estimated metrics from persisted events, and avoid presenting mock values as production KPIs. Export actions are implemented in feature manifests where applicable; broader export remains an operational gap.
