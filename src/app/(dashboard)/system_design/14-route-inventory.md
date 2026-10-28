# Dashboard route inventory

This inventory covers every route file under `src/app/(dashboard)` at the time of review. “Live” means it reads or mutates Supabase/API state; “prototype/placeholder” means the page currently uses local/mock state or `ComingSoon`.

## Shell and overview

- `layout.tsx` — Live authenticated shell, tenant context and skeleton.
- `overview/page.tsx` — Live Supabase overview with local aggregation; channel chart component is present.
- `notepad/page.tsx` — Placeholder (`ComingSoon`).

## Analytics

- `analytics/page.tsx` — Prototype charts with static KPI/funnel/channel arrays.
- `analytics/behavior/page.tsx` — Prototype activity stream and session replay cards (`MOCK_EVENTS`).
- `analytics/lead-scores/page.tsx` — Prototype lead scores and factors held in local state.

## Bots

- `bots/all/page.tsx` — API-capable list with mock fallback (`MOCK_BOTS`).
- `bots/new/page.tsx` — Live create wizard using `/api/bots`, client context and integrations.
- `bots/[id]/edit/page.tsx` — Live bot editor and configuration control plane.
- `bots/[id]/flow/page.tsx` — Live test conversation using `/api/chat`.
- `bots/[id]/analytics/page.tsx` — Live per-bot analytics API.
- `bots/analytics/page.tsx` — Placeholder (`ComingSoon`).
- `bots/emails/page.tsx` — Live email bot inbox/triage/reply controls.
- `bots/triggers/page.tsx` — Live trigger rule CRUD/toggle page.
- `bots/triggers/analytics/page.tsx` — Live trigger analytics API.

## Knowledge and databases

- `knowledge/all/page.tsx` — Live dataset list.
- `knowledge/add/page.tsx` — Live dataset/source creation.
- `knowledge/[id]/page.tsx` — Live dataset, source, chunk, bot-link and retrieval-test editor.
- `knowledge/analytics/page.tsx` — Placeholder (`ComingSoon`).
- `databases/all/page.tsx` — Live database list/create/delete.
- `databases/[id]/page.tsx` — Live database/source edit, test and lookup query; mock IDs are visual-only fallback.
- `databases/analytics/page.tsx` — Placeholder (`ComingSoon`).

## Features

- `features/page.tsx` — Live summary counts and feature-card navigation.
- `features/[kind]/page.tsx` — Delegates services, offers, bookings, events, notifications and analytics to `BookingFeaturesDashboard`.
- `features/commerce/[kind]/page.tsx` — Delegates catalogue/order/inventory kinds to `CommerceDashboard`.

## Inbox and contacts

- `inbox/page.tsx` — Live conversation queue, message thread, context card, realtime and human replies.
- `contacts/page.tsx` — Live contact table, import/create/delete and bulk segment actions.
- `contacts/[id]/page.tsx` — Live Customer 360 detail/edit.
- `contacts/segments/page.tsx` — Live segment list/create/delete; automatic membership is read-only here.
- `contacts/pipeline/page.tsx` — Local drag-and-drop pipeline prototype; no persistence call.

## Campaigns

- `campaigns/all/page.tsx` — API-capable campaign list with mock fallback.
- `campaigns/create/page.tsx` — Live campaign wizard/integration loading; provider send remains external.
- `campaigns/[id]/results/page.tsx` — Prototype results/contact metrics (`MOCK_RESULT`, `MOCK_CONTACTS`).
- `campaigns/journeys/page.tsx` — Prototype journey list (`MOCK_JOURNEYS`).
- `campaigns/crm/page.tsx` — Contact/audience table.
- `campaigns/coupons/page.tsx` — Coupon UI using client Supabase operations.
- `campaigns/email/page.tsx` — Placeholder (`ComingSoon`).
- `campaigns/whatsapp/page.tsx` — Placeholder (`ComingSoon`).
- `campaigns/whatsapp/templates/page.tsx` — Local template approval/list prototype.
- `campaigns/sms/page.tsx` — Placeholder (`ComingSoon`).
- `campaigns/web/page.tsx` — Placeholder (`ComingSoon`).
- `campaigns/settings/page.tsx` — Placeholder (`ComingSoon`).
- `campaigns/analytics/page.tsx` — Placeholder (`ComingSoon`).

## Tickets

- `tickets/page.tsx` — Redirects to `/tickets/all`.
- `tickets/all/page.tsx` — Live queue, filters, pagination and cache.
- `tickets/new/page.tsx` — Live ticket creation, contact/bot/team lookup and media upload.
- `tickets/[id]/page.tsx` — Live ticket detail, status/priority/assignment, notes and replies.
- `tickets/analytics/page.tsx` — Live ticket analytics API with cache.

## Settings, templates and webhooks

- `settings/page.tsx` — Live connection/retention settings and tests.
- `settings/business-hours/page.tsx` — Business-hours configuration UI.
- `settings/hours/page.tsx` — Parallel business-hours UI with local form state.
- `settings/integrations/page.tsx` — Live integration CRUD/test/assignment.
- `settings/team/page.tsx` — Local team/departments prototype (`MOCK_AGENTS`, `MOCK_DEPTS`).
- `settings/subscriptions/page.tsx` — Local subscription group prototype (`MOCK_GROUPS`).
- `settings/coupons/page.tsx` — Local coupon/rule prototype (`MOCK_COUPONS`, `MOCK_RULES`).
- `settings/canned/page.tsx` — Local canned-response prototype (`MOCK_RESPONSES`).
- `api-keys/page.tsx` — Placeholder (`ComingSoon`).
- `templates/page.tsx` — Local template/canned-response list (`MOCK_TEMPLATES`, `CANNED`).
- `templates/all/page.tsx` — Placeholder (`ComingSoon`).
- `templates/create/page.tsx` — Placeholder (`ComingSoon`).
- `webhooks/page.tsx` — Local webhook/log prototype (`MOCK_WEBHOOKS`, `MOCK_LOGS`); persistence is API-backed outside this page.
