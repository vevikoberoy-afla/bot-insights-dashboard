# Bots and bot editor

## Bot list and creation

- `/bots/all` displays searchable bot cards, status, purpose, channel badges, activity, duplicate/pause/play/delete actions, and links to edit/test.
- The list contains `MOCK_BOTS` fallback data when the user session/API is unavailable or empty; it is not a guaranteed live inventory screen.
- `/bots/new` is a wizard that loads the current client context and integrations, collects identity/purpose/prompt/tone/channel options, and POSTs to `/api/bots`.
- `/bots/[id]/flow` is a bot test console. It loads the bot/context and sends messages to `/api/chat?ctx=…&bot=…`, maintaining a test session in local state.

## Bot editor tabs

`/bots/[id]/edit` is the main per-bot control plane. It prefetches client context, integrations, datasets, databases, FAQs and commerce configuration, then saves bot fields through `/api/bots/[id]`.

The editor includes:

- Identity/prompt, tone, response length, emojis and model/runtime controls.
- Channels, webhook configuration and widget appearance/embed snippet.
- Linked knowledge bases and live databases; database cards expose Google Sheets, REST and CSV lookup sources.
- FAQ manager backed by ordinary bot-linked knowledge chunks.
- Booking and commerce assignment via `BookingCommerceTab` (services, offers, products and appointment/order scope per bot).
- Support automation configuration: returns/refunds, exchanges, price/stock lookup, ticket status, order verification and photo evidence.
- Behavior/flow rules: greeting/menu, quick replies, topic rules, business hours, data collection, handoff thresholds, routing and bot-to-bot transfer.
- Conversational lead capture for name, phone/WhatsApp, email and custom fields.
- Proactive triggers via `TriggersTab` and timed popup manager.
- MCP/webhook actions for data lookup and external side effects.
- Email automation: mailbox assignment, safe auto-reply policy, order lookup and booking toggles.
- Appearance/integration preview using the production `ChatWidget`.

Important cache behavior: bot edit prefetches `/api/databases`, `/api/bot-databases`, `/api/integrations`, and related config. Commerce/support clients use browser caches to avoid reloading every tab; mutations invalidate those caches.

## Bot analytics and trigger pages

- `/bots/[id]/analytics` calls `/api/bots/[id]/analytics?days=…` and renders conversation, bot/human, lead, ticket and topic metrics.
- `/bots/analytics` is currently `ComingSoon`.
- `/bots/triggers` loads rules and bots, supports create/edit/toggle/delete and links to analytics.
- `/bots/triggers/analytics` calls `/api/bots/triggers/analytics` for trigger impressions, conversions and channel performance.
- `/bots/emails` calls `/api/bots/emails`, shows mailbox/status tabs, thread messages and triage/reply actions.
