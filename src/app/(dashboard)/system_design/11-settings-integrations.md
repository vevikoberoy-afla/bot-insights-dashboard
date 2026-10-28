# Settings, integrations, and team

## Workspace settings

- `/settings` loads client configuration, supports PostHog/analytics connection fields, retention selection (3/30/90 where configured), connection tests and save.
- `/settings/business-hours` and `/settings/hours` configure timezone, weekday windows, out-of-hours message and whether bot/human/ticket handles closed hours. These are parallel UI routes and should be kept consistent.
- `/settings/integrations` lists channel/provider definitions, loads bots, tests credentials, creates/updates/deletes integrations, and assigns a provider to a bot. Definitions include WhatsApp, email/SMTP, Telegram, Chatwoot, calendars and store providers.
- `/settings/team` manages agents/departments visually, but currently uses local mock agents/departments rather than the team API.
- `/settings/subscriptions` shows opt-in groups and local create/edit UI; real consent is persisted by the lead-capture/consent APIs.
- `/settings/coupons` renders a local coupon/rule management prototype; the feature coupon page and `/api/settings/coupons` are the authoritative paths.
- `/settings/canned` is a local canned-response editor; reusable templates are also represented by the Templates pages/API.
- `/api-keys` is `ComingSoon`.

## Provider rules

Secrets must stay server-side in integration records or environment configuration. Dashboard tests should validate credentials before activation. Calendar, Meta/WhatsApp, SMTP, Chatwoot, store, analytics and QStash behavior remains provider-dependent even when the dashboard form exists.
