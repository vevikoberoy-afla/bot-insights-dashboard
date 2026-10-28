# Dashboard system design

This folder documents the code under `src/app/(dashboard)`. These are implementation notes for the authenticated workspace UI: page routes, state, API calls, persistence boundaries, and known placeholder screens. The production domain services remain in `src/lib` and `src/components`; this folder intentionally records how the dashboard consumes them.

## Documents

Improvement planning: [Prioritized product improvement roadmap](18-product-improvement-roadmap.md).

Start with the [Product features brief for an agent](17-product-features-agent-brief.md) for a self-contained description of the product, users, workflows and implementation boundaries.

1. [Dashboard shell and navigation](01-shell-navigation.md)
2. [Bots and bot editor](02-bots.md)
3. [Inbox and human handoff](03-inbox.md)
4. [Knowledge bases](04-knowledge.md)
5. [Databases and live sources](05-databases.md)
6. [Features: booking, restaurant, commerce](06-features.md)
7. [Contacts and CRM](07-contacts-crm.md)
8. [Campaigns and outreach](08-campaigns.md)
9. [Tickets and support](09-tickets.md)
10. [Analytics and reporting](10-analytics.md)
11. [Settings, integrations, and team](11-settings-integrations.md)
12. [Templates and webhooks](12-templates-webhooks.md)
13. [Dashboard data flow and implementation status](13-data-flow-status.md)
14. [Complete dashboard route inventory](14-route-inventory.md)
15. [SaaS launch plan: admin panel, access control, subscriptions and tiers](15-saas-admin-launch-plan.md) — proposed implementation specification, with current-code gaps and launch acceptance criteria.
16. [Subscription tiers and enforcement specification](16-subscription-tiers-entitlements-spec.md) — detailed bot/product/email allowances, feature matrix, credentials, Enterprise contracts and technical integration mechanism.
17. [Multitenant team and employee access](17-multitenant-team-access.md) — employee invitations, per-module read/write grants, seat quotas, founder controls, RLS and API enforcement.
18. [Bulk email campaign system](18-bulk-email-system.md) — segmentation, scheduling, SES/SMTP delivery, quotas, tracking, unsubscribe, reputation protection and retention.
19. [Current bulk email system design (V2)](19-current-bulk-email-system-design.md) — asynchronous materialization, canary fan-out, two-RPC delivery, internal block composer, cache layers, recovery, security, operations, and tests.
20. [Bulk WhatsApp campaign system](20-bulk-whatsapp-system-design.md) — Meta template approval, consent-safe segmentation, canary fan-out, delivery/read tracking, suppression, circuit breaking, and AI reply handoff.

## Reviewed scope

Every `.tsx` file below `src/app/(dashboard)` was inventoried, including dynamic routes and pages rendered through shared feature components. The review distinguishes live Supabase/API-backed pages from pages that intentionally render mock data or `ComingSoon`.

## Shared conventions

- Pages are client components when they need browser Supabase auth, local state, effects, forms, or charts.
- Authenticated data is tenant-scoped using the Supabase session user/client ID and RLS/API checks.
- Loading states use `DashboardShellSkeleton`, `DashboardContentSkeleton`, feature skeletons, or local spinners.
- Mutations use `fetch`/Supabase writes, toast success/error feedback, and local state refresh.
- Dynamic child routes use Next `useParams`; feature pages delegate to reusable components in `src/components/features`.
- A page marked placeholder below is not a complete backend feature even if a related API exists.
