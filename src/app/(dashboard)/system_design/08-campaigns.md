# Campaigns and outreach dashboard

## Pages and lifecycle

- `/campaigns/all` lists campaigns with channel, status, audience, delivery metrics and links to results. It queries Supabase when available and falls back to `MOCK_CAMPAIGNS` for prototype state.
- `/campaigns/create` is a four-step wizard: Basics & Channel, Audience, Message Design, and Schedule & Launch. It loads integrations and submits campaign configuration.
- `/campaigns/[id]/results` renders delivery, open, click, reply, conversion, revenue and contact-level results; the current detail view uses mock result data.
- `/campaigns/journeys` shows journey definitions and currently initializes from local mock journeys.
- `/campaigns/crm` is a contact/audience table view.
- `/campaigns/coupons` manages commerce coupon records through the client Supabase path.

## Channel subpages

Email, WhatsApp, SMS, Web and global campaign-settings routes currently render `ComingSoon` pages. `/campaigns/whatsapp/templates` has a local template manager UI, while production Meta template CRUD lives behind `/api/meta/templates`.

## System boundary

Campaign records, journeys, coupons and delivery jobs are represented in the API/migration layer, but dashboard mock fallbacks must not be confused with provider delivery. Real sends require channel integrations, opt-in/segment membership, provider approval, QStash/outbound workers and delivery callbacks.
