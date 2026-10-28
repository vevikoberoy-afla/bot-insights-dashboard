# Production security remediation report

Validated against `production_security_remediation_blueprint.md` on 2026-10-20. The blueprint was treated as guidance and adapted to the repository's real `client_id`/`context_id`, workspace-membership, widget, and webhook models.

## Implemented

- `/api/events` is an authenticated, workspace-derived read endpoint. Public telemetry moved to `/api/events/ingest`, accepts an allowlist of non-commercial events, cannot update purchases, validates contact ownership, bounds metadata, and requires a signed capability.
- Widget sessions use cryptographically random IDs and an HMAC capability bound to workspace, bot, session, purpose, and expiry. Chat, flow, sync, media, and handoff paths carry or validate the capability. Tracker capabilities cannot be used as widget capabilities.
- Outbound connectors require HTTPS, reject credentials/internal hostnames/private, metadata, reserved, mapped-IPv4 and IPv6 ranges, validate every DNS answer and redirect, pin the approved IP at connection time, disable compression, apply timeouts, and cap streamed response bytes.
- Chat vision reads the authenticated session's own private `chat-media` object rather than fetching a caller-controlled URL.
- Webhook CRUD derives the workspace from verified authentication and scopes reads/deletes through the workspace's `context_id`. Destinations pass SSRF checks. Deliveries carry HMAC signatures and do not follow unsafe redirects.
- Integration responses recursively remove tokens, passwords, secrets, authorization headers, and API keys. New integration secrets are encrypted with tenant-derived AES-256-GCM keys; supported workers decrypt them only server-side.
- The broad `x-admin-secret` management bypass is removed. Cookie-authenticated mutations receive same-origin/Fetch Metadata CSRF checks.
- Redis degradation uses bounded in-memory emergency rate limits instead of an unlimited fail-open path.
- SMTP enforces implicit TLS or mandatory STARTTLS, TLS 1.2+, certificate validation, timeouts, and disables file/URL content access.
- Firecrawl callbacks use `X-Firecrawl-Signature` over the raw body. Query-string webhook secrets are removed.
- Dashboard/admin/API security headers include HSTS in production, `nosniff`, restrictive referrer and permissions policies, frame denial for protected surfaces, and a widget-specific frame policy.
- Platform staff activation is protected by migration `071_security_hardening.sql`, which rejects activation unless the target already has a verified MFA factor.
- Vulnerable `xlsx` was removed. XLSX import now uses bounded ExcelJS parsing; CSV/XLSX rows and cells are capped. Next.js, Nodemailer and affected transitive packages were upgraded. The project now requires Node.js 22.19 or newer.
- Next.js dynamic pages/routes were migrated to the patched framework's async request API using the official codemod.

## Deployment requirements

Set these as production secrets before deployment (never commit their values):

```text
WIDGET_SESSION_HMAC_SECRET       # at least 32 random characters
SAAS_VAULT_MASTER_KEY_V1        # at least 32 random bytes, base64 encoded
FIRECRAWL_WEBHOOK_SECRET         # same HMAC secret configured in Firecrawl
```

Apply `supabase/071_security_hardening.sql` after migrations 067–070. Configure the production runtime as Node.js 22.19 or newer. Re-save or rotate existing integration credentials so legacy plaintext values are rewritten through the encrypted integration API. Do not remove `SAAS_VAULT_MASTER_KEY_V1` after encrypted records exist; rotate by adding a new key version and migrating ciphertext.

## Verification results

- Production build: passed (`next build`, Next.js 15.5.28).
- TypeScript: passed.
- Product flow suite: passed (offering discovery, commerce, order tracking, booking, restaurant allocation).
- SaaS/RLS/control-plane integration suite: 35/35 passed.
- Capability tamper and SSRF private/metadata address checks: passed.
- Production dependency gate: 0 critical and 0 high findings.

## Residual items

- `npm audit` reports three moderate findings in Mammoth's abandoned `argparse`/`sprintf-js` dependency chain. There is no patched upstream Mammoth upgrade. DOCX uploads remain size-limited, but replacing or sandboxing the DOCX parser is recommended before accepting documents from untrusted public users.
- Legacy secret columns such as old bot-level WhatsApp tokens are redacted from browser responses but should be rotated into Workspace Integrations and cleared after validation.
- A staging penetration test, provider webhook replay tests, key-rotation drill, backup-restore drill, WAF/bot rules, alerting, and infrastructure review remain deployment/operations gates rather than repository-only changes.
