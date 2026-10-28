# Product system design

This folder documents the system that is currently present in the repository. It is implementation documentation, not a future roadmap. Where a capability depends on a migration, provider credential, cron job, OAuth connection, or external webhook, that dependency is called out.

## Documents

1. [Complete product system design](00-product-system-design.md)
2. [Platform architecture](01-platform-architecture.md)
3. [Chatbot, widget, and conversation flows](02-chatbot-and-widget.md)
4. [Knowledge base and RAG](03-rag-knowledge.md)
5. [Live databases and data sources](04-live-data-sources.md)
6. [Support, tickets, and human handoff](05-support-ticketing.md)
7. [Bookings and appointments](06-booking-appointments.md)
8. [Restaurant tables and capacity](07-restaurant-reservations.md)
9. [Commerce, catalogue, orders, and inventory](08-commerce-catalogue-orders.md)
10. [Offers, coupons, and campaigns](09-offers-coupons-campaigns.md)
11. [Contacts, CRM, and segmentation](10-contacts-crm-segments.md)
12. [Omnichannel messaging](11-omnichannel.md)
13. [Email bots](12-email-bots.md)
14. [Integrations and external providers](13-integrations.md)
15. [Analytics and reporting](14-analytics.md)
16. [Automations, notifications, and jobs](15-automations-notifications.md)
17. [Bot configuration and per-bot assignment](16-bot-configuration.md)
18. [Dashboard and UI architecture](17-dashboards-ui.md)
19. [Security, tenancy, and retention](18-security-retention.md)
20. [API and database map](19-api-and-data-model.md)
21. [Current limitations and operations](20-limitations-and-operations.md)
22. [Workspace administration, templates, tracking, and ERP](21-workspace-admin-and-erp.md)
23. [Main codebase route and module inventory](22-codebase-inventory.md)
24. [Database migration catalog](23-migration-catalog.md)
25. [Chatflow UI codebase](24-chatflow-ui-codebase.md)
26. [Complete feature catalog](25-features-catalog.md)
27. [Dashboard master system design](26-dashboard-master.md)
28. [Founder master admin plan](27-founder-master-admin-plan.md) — original design proposal.
29. [Founder console implementation and activation](28-founder-console-implementation.md) — current routes, controls, migration and remaining blueprint scope.
30. [Master Admin Dashboard (Founder Console) features](29-master-admin-features.md) — complete feature catalog and system design for the founder console.
31. [Chat, booking, and commerce request architecture and latency analysis](30-chat-booking-commerce-latency.md) — request layers, deterministic and LLM paths, timing evidence, bottlenecks, target architecture, and verification plan.
32. [Secure chatbot behaviour and speed integration master plan](31-secure-chat-behavior-and-speed-master-plan.md) — proposed implementation mapped to all supplied response-playbook scenarios, current code/schema, secure concurrency, pricing, transactions, UI, rollout and acceptance tests.
33. [End-to-end RAG pipeline system design](32-rag-pipeline-system-design.md) — complete request-to-response architectural breakdown from user keystroke to widget render, covering rate limiting, caching tiers, pgvector retrieval, prompt synthesis, Gemini streaming, and asynchronous persistence.
34. [Customer message to bot reply latency timeline](35-customer-message-to-reply-latency-timeline.md) — measured serial request stages for widget initialization, cold and warm RAG, first visible text, and completed replies.
35. [Chat bootstrap, session, and contact processing system design](36-chat-bootstrap-session-contact-system-design.md) — current widget initialization, session/contact identity, lead state, handoff, cache topology, security boundaries, measured bottlenecks, and target architecture.

## Source of truth

- [Serial latency remediation and measured TTFT](37-serial-latency-remediation-results.md) — implemented bootstrap/cache/streaming changes, migration 096, safety adaptations, regression coverage and measured timing breakdown.
- [Current bot message-to-reply system design](38-current-bot-message-to-reply-system-design.md) — detailed request lifecycle from widget input through security, routing, RAG/flows, streaming, persistence, realtime updates, and failure handling.
- [Bot booking system design and turnaround](39-bot-booking-system-design-and-turnaround.md) — booking state machine, scheduler and capacity logic, restaurant allocation, offers, confirmation safety, card rendering, measured turnaround, bottlenecks, and performance targets.
- [Simultaneous chat execution implementation](40-simultaneous-chat-execution-implementation.md) — implemented concurrency waves, atomic turn-context RPC, cache/tool/quota safety adaptations, regression coverage, measured TTFT and deployment requirements.
- [Booking-card sub-second remediation implementation](41-booking-sub-second-remediation-implementation.md) — bounded booking bundle cache, range occupancy, atomic flow persistence, preserved card behavior, regression results and measured production-build turnaround.
- [Product recommendation and chatbot order system](42-product-recommendation-and-order-system.md) — intent routing, bot-scoped search, Hybrid RRF recommendations, cart/checkout/inventory/order safety, widget cards, test coverage and measured TTFT.
- [Commerce optimization implementation](43-commerce-optimization-implementation.md) — empty-result recovery, bounded commerce bundle caching, product snapshots, pure checkout transitions, security adaptations, tests and post-change TTFT.
- [RAG customer-message-to-response pipeline](44-rag-customer-message-to-bot-response.md) — current request lifecycle from widget submission through security, routing, caches, retrieval, Gemini streaming, rendering, persistence, failures and measured TTFT.
- [Zero-trust service boundaries and production NFR/SLO contract](45-zero-trust-service-boundaries-and-nfr-slos.md) — independent JWT verification, tenant/resource authorization, deployment isolation, measurable latency, availability, capacity, and release gates.
- [My Store onboarding and tier-gated operations](46-my-store-onboarding-and-tier-gating.md) — commerce versus booking setup, plan authority, atomic persistence, bot assignment, readiness, caching, and security boundaries.

- Application code: `src/app`, `src/components`, and `src/lib`.
- Database migrations: `supabase/*.sql`, applied in numeric order.
- Public chatbot entry points: `/api/chat`, `/api/v1/chat`, `/api/widget/config`, and the embed/widget components.
- Dashboard entry points: `src/app/(dashboard)` and feature-specific components under `src/components`.

## Migration baseline

The newest chat and booking fast paths require `096_fast_widget_bootstrap.sql`, `097_simultaneous_chat_turn_context.sql`, `098_booking_range_occupancy.sql`, and `099_atomic_flow_turn_persistence.sql`. Commerce lifecycle, payments, and My Store onboarding continue through migrations 100–102. Restaurant capacity and universal offering discovery originate in migrations 065 and 066, while the booking/commerce experience also depends on migrations 050–064. A new environment should apply all migrations in numeric order rather than running only the latest file.

SaaS account control additionally requires migrations 067–069. The separate `/master-admin` founder console and global identity checks require `070_founder_console.sql`.
47. [Appointment booking industry upgrade](./47-appointment-booking-industry-upgrade.md)
48. [Knowledge purpose and controlled website imports](./48-knowledge-purpose-and-controlled-website-imports.md)
49. [Secure document uploads and public document links](./49-secure-knowledge-document-imports.md)
