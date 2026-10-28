# Templates and webhooks dashboard

## Templates

`/templates` displays tabs for All, Email, WhatsApp, SMS and Canned Responses with search, status badges, copy/edit/delete affordances and create links. `/templates/all` and `/templates/create` currently render `ComingSoon`; the main page uses local mock template data. `/campaigns/whatsapp/templates` is a separate WhatsApp template manager with local records and approval/status UI.

Production provider operations use `/api/templates` and `/api/meta/templates`; Meta approval is required before WhatsApp templates can be sent outside the allowed session window.

## Webhooks

`/webhooks` renders active webhook URLs, subscribed event checkboxes, success rate, last delivery and mock delivery logs. It supports create/edit/delete/test-style controls in the UI, but the page data is currently local mock state. Authoritative workspace persistence is `/api/settings/webhooks`; delivery is performed by `src/lib/webhooks.ts` with event filtering and fire-and-forget POST behavior.

Webhook consumers should validate `X-Vittain-Event`, shared secrets/signatures and tenant context. Outbound custom URLs must pass SSRF-safe URL validation in server integrations.
