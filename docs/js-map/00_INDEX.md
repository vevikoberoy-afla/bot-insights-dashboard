# Vittain AI — Complete JavaScript / Chatwoot Frontend Knowledge Map
## Master Index

This directory contains one `.md` file per major folder in `javascript/`. Read this index first, then go to the specific file for details.

---

## Quick Navigation

| # | File | Folder | What it is | Vittain relevance |
|---|---|---|---|---|
| 01 | [01_dashboard.md](./01_dashboard.md) | `javascript/dashboard/` | Agent inbox SPA (Vue 3 + Vuex) | **HIGH** — embedded in `/messages/live` iframe |
| 02 | [02_widget.md](./02_widget.md) | `javascript/widget/` | Customer chat widget SPA | **HIGH** — what end-users see; also relevant for Vittain's own widget |
| 03 | [03_sdk.md](./03_sdk.md) | `javascript/sdk/` | Website embed SDK (`window.chatwootSDK`) | **MEDIUM** — needed when clients embed Chatwoot widget on their sites |
| 04 | [04_entrypoints.md](./04_entrypoints.md) | `javascript/entrypoints/` | Webpack/Vite bundle entry files | **MEDIUM** — understand app bootstrap order |
| 05 | [05_portal.md](./05_portal.md) | `javascript/portal/` | Customer-facing Help Center | **LOW** — future reference for public KB feature |
| 06 | [06_v3.md](./06_v3.md) | `javascript/v3/` | Auth/login/onboarding mini-app | **MEDIUM** — agents log into Chatwoot through this |
| 07 | [07_shared.md](./07_shared.md) | `javascript/shared/` | Cross-app utilities + constants | **MEDIUM** — postMessage event names, shared helpers |
| 08 | [08_superadmin_pages.md](./08_superadmin_pages.md) | `javascript/superadmin_pages/` | Chatwoot platform admin | **LOW** — operator-only, not client-facing |
| 09 | [09_survey.md](./09_survey.md) | `javascript/survey/` | CSAT survey page | **LOW** — feeds analytics CSAT KPI |
| 10 | [10_design_system.md](./10_design_system.md) | `javascript/design-system/` | Histoire component stories (dev only) | **REFERENCE** — component documentation |

---

## The Big Picture — How Everything Connects

```
CHATWOOT FRONTEND (javascript/)
│
├── dashboard/          ← Agents use this (Vue 3 SPA)
│     ├── Vuex Store (50+ modules)
│     ├── API layer (51 REST clients)
│     ├── Routes: conversations, contacts, campaigns, settings, reports, captain
│     └── Components: ChatList, ConversationView, ContactPanel, WootWriter...
│
├── widget/             ← Customers see this (Vue 3 SPA inside iframe)
│     ├── Views: Home, Messages, PreChatForm, UnreadMessages, Campaigns
│     └── Components: AgentMessage, UserMessage, ChatFooter, ChatHeader...
│
├── sdk/                ← Embedded on client websites (vanilla JS)
│     ├── IFrameHelper.js — injects widget iframe, routes postMessages
│     ├── bubbleHelpers.js — floating chat bubble DOM
│     └── sdk.js — window.$chatwoot public API
│
├── v3/                 ← Auth/onboarding (Vue 3 + Pinia, no Vuex)
│     └── Views: login, sign-up, password reset, onboarding steps
│
├── portal/             ← Public Help Center (Vue 3)
│     └── Article browser + search
│
├── shared/             ← Utilities used by ALL above apps
│     ├── constants/sharedFrameEvents.js — postMessage event names
│     ├── store/globalConfig.js — platform-wide Vuex config
│     ├── helpers/HTMLSanitizer.js — DOMPurify config
│     └── components/FluentIcon/ — icon system
│
├── survey/             ← CSAT response page (Vue 3 + Pinia)
│
├── superadmin_pages/   ← Chatwoot instance admin (Vue 3)
│
├── design-system/      ← Histoire stories (dev only)
│
└── entrypoints/        ← Vite bundle entry points (one per app)
      dashboard.js / widget.js / sdk.js / portal.js /
      v3app.js / superadmin.js / survey.js
```

---

## Vittain Integration Architecture

```
VITTAIN (Next.js, src/)
│
├── /admin/*                     ← Vittain Superadmin Panel (Next.js)
│     ├── page.tsx               ← KPI cards + client grid
│     ├── client/[id]/           ← Client detail: bots, billing, team
│     ├── inbox/                 ← EMBEDDED Chatwoot dashboard iframe
│     ├── analytics/             ← Vittain's own analytics (Supabase data)
│     └── campaigns/             ← Campaign management
│
├── /(dashboard)/*               ← Vittain Client Panel (Next.js)
│     ├── overview/              ← Client KPI overview
│     ├── campaigns/*            ← Campaign wizard (7 steps)
│     ├── bots/*                 ← Bot management
│     ├── knowledge/*            ← Knowledge chunks
│     ├── databases/*            ← Data source connections
│     ├── tickets/*              ← Ticket management
│     ├── messages/live/         ← EMBEDDED Chatwoot agent inbox iframe ←────┐
│     └── messages/all/          ← All messages table                         │
│                                                                              │
├── /api/                                                                      │
│     ├── /chat                  ← AI chat (Groq + Gemini RAG)                │
│     ├── /chat/sync             ← Widget polling for human replies            │
│     ├── /chat/handoff          ← Trigger handoff → Chatwoot alert           │
│     ├── /chat/init             ← Create session + Chatwoot conversation      │
│     ├── /webhooks/chatwoot     ← Receive agent replies FROM Chatwoot ←──────┤
│     ├── /whatsapp/incoming     ← WhatsApp router (AI or human)              │
│     └── /bots/create-inbox     ← Auto-create Chatwoot inbox for new bot     │
│                                                                              │
├── /lib/                                                                      │
│     ├── chatwoot.ts            ← REST API client for Chatwoot ──────────────┤
│     └── dittofeed.ts           ← Dittofeed SDK (campaign contacts sync)     │
│                                                                              │
└── /public/widget.js            ← Vittain's OWN vanilla JS chat bubble       │
      (separate from Chatwoot SDK)                                             │
                                                                               │
CHATWOOT (Oracle VM :3000)   ←────────────────────────────────────────────────┘
│
├── /app/accounts/:id/conversations  ← dashboard/ SPA (embedded via iframe)
├── /app/login                       ← v3/ auth (agents log in here)
├── /widget                          ← widget/ SPA (customer chat)
├── /app/survey?csat_survey_id=...   ← survey/ SPA
└── /api/v1/accounts/:id/...         ← REST API (called by lib/chatwoot.ts)
```

---

## Key Data Flow: Customer Sends a WhatsApp Message

```
1. Customer sends WhatsApp message
2. Meta → POST /api/whatsapp/incoming (Vittain)
3. Vittain finds bot by phone_number_id
4. Checks session mode (Redis):
   - mode = 'ai'    → call /api/chat → Groq RAG → reply via Meta API
   - mode = 'human' → forward to Chatwoot via chatwootFetch('/conversations/:id/messages')
5. Agent sees message in Chatwoot dashboard (the iframe)
6. Agent replies → Chatwoot webhook → POST /api/webhooks/chatwoot (Vittain)
7. Vittain saves agent message to Supabase messages table
8. Vittain sends WhatsApp reply to customer via Meta API
9. Vittain's widget.js (if web) polls /api/chat/sync → sees human message
```

---

## Key Data Flow: Customer Opens Web Widget

```
1. Client's website loads Vittain widget.js (or Chatwoot SDK)
2. Widget calls POST /api/chat/init → creates session + Chatwoot contact + conversation
3. Customer types message → POST /api/chat → Groq RAG → AI reply
4. If handoff needed → POST /api/chat/handoff → Chatwoot conversation set to 'open'
5. Agent sees alert in Chatwoot inbox iframe (/messages/live)
6. Widget polls /api/chat/sync every 3s → picks up human replies
```

---

## Chatwoot REST API Endpoints Vittain Uses

```typescript
// lib/chatwoot.ts calls these:

// Contacts
POST   /api/v1/accounts/:id/contacts                         // create
GET    /api/v1/accounts/:id/contacts/search?q=:phone         // find by phone

// Conversations
POST   /api/v1/accounts/:id/conversations                    // create
POST   /api/v1/accounts/:id/conversations/:id/messages       // send message
GET    /api/v1/accounts/:id/conversations/:id/messages       // get messages
POST   /api/v1/accounts/:id/conversations/:id/toggle_status  // open/resolve
POST   /api/v1/accounts/:id/conversations/:id/labels         // add label

// Inboxes
POST   /api/v1/accounts/:id/inboxes                          // create inbox for bot

// Reports (for analytics)
GET    /api/v1/accounts/:id/reports/agents/satisfaction_reports  // CSAT data
```

---

## Chatwoot Vuex Store Modules — Quick Lookup

When you need to understand what data is available in the embedded Chatwoot iframe:

| Need | Module | Key getter |
|---|---|---|
| Current conversation | `conversations` | `getSelectedConversation` |
| All conversations | `conversations` | `getAllConversations` |
| Current user/agent | `auth` | `getCurrentUser` |
| Inbox list | `inboxes` | `getInboxes` |
| Contact info | `contacts` | `getContact(id)` |
| Unread count | `conversationStats` | `getStats` |
| Notifications | `notifications` | `getNotifications` |
| Labels | `labels` | `getLabels` |
| Teams | `teams` | `getTeams` |

---

## Environment Variables Summary

```bash
# Chatwoot connection (add to Vittain .env.local)
CHATWOOT_URL=http://YOUR_ORACLE_IP:3000
CHATWOOT_API_TOKEN=from_chatwoot_settings_integrations_api
CHATWOOT_ACCOUNT_ID=1
CHATWOOT_WEBHOOK_SECRET=random_32_char_string
NEXT_PUBLIC_CHATWOOT_URL=http://YOUR_ORACLE_IP:3000

# WhatsApp (Meta Cloud API)
WHATSAPP_VERIFY_TOKEN=random_string
WHATSAPP_ACCESS_TOKEN=from_meta_developer_dashboard
WHATSAPP_PHONE_NUMBER_ID=from_meta_developer_dashboard

# Dittofeed (campaign marketing)
DITTOFEED_URL=http://YOUR_ORACLE_IP:3001
DITTOFEED_WRITE_KEY=from_dittofeed_settings
NEXT_PUBLIC_DITTOFEED_URL=http://YOUR_ORACLE_IP:3001
```

---

## Known Issues & Fixes (from issue1.txt + issue.txt)

| Bug | Root Cause | Fix Location |
|---|---|---|
| Widget never polls after manual agent takeover | Widget only started polling when `/api/chat` returned `source='handoff'`, but manual takeover sends no chat message | `widget.js` — always check `/api/chat/sync` on init unconditionally |
| Duplicate messages in widget | Sync route returned ALL messages; widget appended them | `sync/route.ts` — add `after` param, return only `slice(after)` |
| Customer message goes to AI when agent active | `/api/chat` didn't check Redis `session_mode` | `chat/route.ts` — early-exit if `redis.get('session_mode:sessionId') === 'human'` |
| Agent takeover not detected by widget | Redis key `session_mode` never set on manual takeover | Add `redis.set('session_mode:sessionId', 'human')` in take-over endpoint |
