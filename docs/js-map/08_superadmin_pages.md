# Chatwoot — `javascript/superadmin_pages/` Knowledge Map

## What Is This?
The **Chatwoot platform superadmin** — a Vue 3 mini-app for the owner of the Chatwoot instance itself. This is where you manage all accounts on the Chatwoot server, configure global settings, and run platform-level admin tasks.

> **Vittain context:** This is Chatwoot's internal admin — accessible only at `YOUR_ORACLE_IP:3000/super_admin`. It's NOT Vittain's `/admin` panel. Vittain's superadmin is the Next.js app at `/admin`. You (the Vittain operator) would use Chatwoot's superadmin to: create inboxes, manage Chatwoot user accounts, configure integrations, and troubleshoot.

---

## File Overview

```
superadmin_pages/
├── components/     — Superadmin UI components
└── views/
      ├── dashboard/    — Main superadmin dashboard
      └── playground/   — Testing/dev playground (non-production)
```

Loaded by entrypoints:
- `superadmin.js` (1,401 bytes) — Main bundle
- `superadmin_pages.js` (937 bytes) — Secondary bundle for specific pages

---

## Views

### `views/dashboard/`
The main superadmin interface. Features (standard Chatwoot superadmin):

| Section | What you can do |
|---|---|
| **Accounts** | List all accounts, create new accounts, delete accounts, view account stats |
| **Users** | List all users across all accounts, impersonate users for debugging |
| **Installations** | Instance info, Chatwoot version, environment |
| **Feature Flags** | Enable/disable features per account (e.g., `captain`, `help_center`, `campaigns`) |
| **Access Tokens** | Manage API access tokens |
| **Notifications** | Send platform-wide notifications |

### `views/playground/`
Developer testing area — not used in production. Used for testing UI components and API calls during development.

---

## Components (`superadmin_pages/components/`)
Standard CRUD UI components:
- Data tables with search/filter for accounts and users
- Forms for creating/editing accounts
- Feature flag toggle UI (list of checkboxes per account)

---

## Key Superadmin Actions for Vittain Operators

### Creating a Chatwoot Account for a New Vittain Client
1. Go to `YOUR_ORACLE_IP:3000/super_admin`
2. Accounts → Create new account
3. Set name = client's company name
4. This creates `account_id` which maps to Vittain's `client_id`

### Creating an Inbox for a Bot
Option A: Via Chatwoot superadmin → Accounts → [account] → Inboxes → New
Option B: **Automatically via Vittain API** — `POST /api/bots/create-inbox` calls `lib/chatwoot.ts → createInbox()` which hits Chatwoot REST API

### Enabling Captain (AI features) for an Account
Superadmin → Accounts → [account] → Feature Flags → toggle `captain` ON

### Getting API Token
Chatwoot Settings → Integrations → API → Access Token
Set this as `CHATWOOT_API_TOKEN` in Vittain's `.env.local`

---

## Vittain ↔ Chatwoot Account Mapping

```
Vittain clients table (Supabase)
  └── client.id  ──maps to──►  Chatwoot account_id

Vittain bots table (Supabase)
  └── bot.chatwoot_inbox_id  ──maps to──►  Chatwoot inbox.id (within account)

Vittain sessions table
  └── session.chatwoot_conversation_id  ──maps to──►  Chatwoot conversation.id
  └── session.chatwoot_contact_id       ──maps to──►  Chatwoot contact.id
```

---

## Environment Setup

The superadmin is only accessible if you're logged in as a Chatwoot superadmin user. Created during initial Chatwoot setup via:
```bash
# On the Oracle VM running Chatwoot:
RAILS_ENV=production bundle exec rails chatwoot:make_super_admin EMAIL=your@email.com
```

---

## What Vittain Does NOT Need This For
- Vittain creates inboxes programmatically via API (no need to use superadmin UI)
- Chatwoot agent accounts are managed via Chatwoot's regular Settings → Agents page (not superadmin)
- Vittain's own user/client management is entirely in the Supabase-backed Next.js admin
