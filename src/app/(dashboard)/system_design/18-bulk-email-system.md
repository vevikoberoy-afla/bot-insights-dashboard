# Bulk email campaign system

Bulk email is a separate delivery lane from support and transactional replies. It reuses the authoritative workspace `contacts`, `campaigns`, `campaign_messages`, catalogue, bot assignment, SaaS entitlements, delivery ledger, Redis, and QStash infrastructure. It does not create a second CRM.

## Merchant flow

`/campaigns/email` provides campaign search, a composer, bot/reply-inbox selection (the assigned mailbox is filled automatically), dynamic variables, up to six catalogue products, coupon content, segment rules, live eligible-recipient preview, immediate launch, scheduling, cancellation, progress, opens, clicks, bounce counts, complaint counts, and reputation-paused state.

Audience rules support total order value, order count, tags, days since order, and days since chat with AND/OR composition. Preview and launch use the same database predicate. Materialization includes only valid email addresses with `opt_in_email=true` and always excludes the workspace suppression list.

## Delivery flow

1. Campaign content is stored once. The coordinator asynchronously runs `bulk_email_materialize`, which creates one lightweight recipient row per unique email address and selects the most recently active opted-in contact when duplicate contact profiles share an address.
2. Launch schedules a signed QStash coordinator. Immutable keyset pages contain 1,000 recipient IDs and fan out batches of 100 with deterministic QStash deduplication IDs.
3. The first 200 recipients are the canary; later batches wait 180 seconds.
4. A batch atomically claims pending rows. Every recipient claims the workspace’s `email.marketing.monthly` and daily allowance through the existing delivery ledger.
5. HTML is generated with escaped content, personalized variables, signed product links, a signed open pixel, compliance text, and RFC 8058 unsubscribe headers.
6. AWS SES v2 sends raw MIME over HTTPS. A configured workspace SMTP integration is the fallback for smaller deployments.
7. Accepted provider IDs, definite failures, ambiguous outcomes, and aggregate progress are persisted idempotently. Redis wave breadcrumbs allow untouched recipients to recover after a crash without resending a provider-started wave.

## Safety and compliance

- Unsubscribe, open, and click identifiers are HMAC signed; click targets must be HTTPS.
- One-click unsubscribe updates both `contacts.opt_in_email` and the durable suppression list. Transactional mail is not disabled.
- SES delivery, permanent bounce, and complaint notifications enter through a secret-protected endpoint.
- Permanent bounces and complaints suppress the address automatically.
- At 50+ sends, hard bounce above 4% pauses a campaign. At 100+ sends, complaints above 0.08% pause it.
- QStash worker signatures are verified when signing keys are configured; the webhook secret is the development fallback.
- Campaign access is tenant-scoped and requires the employee’s Campaign read/write permission. Plan, workspace lifecycle, monthly marketing-email allowance, and daily allowance still apply.
- SES uses one deployment-global QStash flow-control key derived from 70% of `EMAIL_OUTBOUND_RATE`; SMTP remains workspace-scoped.
- Completed recipient detail is purged after 30 days by the authenticated retention cron in bounded 10,000-row transactions; campaign aggregate metrics and suppressions remain.

## Required configuration

Apply `supabase/075_bulk_email_campaigns.sql`, `076_bulk_email_v2_scale_upgrade.sql`, and `077_bulk_email_delivery_hardening.sql` in order. Configure Supabase, Redis, QStash signing keys, `BULK_EMAIL_SIGNING_SECRET`, `EMAIL_ESP_WEBHOOK_SECRET`, the public HTTPS `NEXT_PUBLIC_APP_URL`, and either AWS SES variables or an active email SMTP integration. Set `EMAIL_OUTBOUND_RATE` to the verified AWS SES account maximum send rate; the coordinator reserves a 30% safety margin. SES identities must be verified and moved out of sandbox before production sending. Configure SES event publishing to `/api/webhook/esp-events?secret=...`; subscription confirmation is intentionally manual rather than server-side fetching an untrusted URL.

Use `POST /api/cron/email-retention` with the `CRON_SECRET` bearer or `x-webhook-secret` header daily. Configure SPF, DKIM, and DMARC for the sending domain outside the application before launch.
