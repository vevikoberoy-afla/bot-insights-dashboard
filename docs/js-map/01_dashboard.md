# Chatwoot — `javascript/dashboard/` Knowledge Map

## What Is This?
The **main agent-facing dashboard** — a Vue 3 Single Page Application that agents use to manage conversations, contacts, campaigns, reports, settings, and more. This is the primary Chatwoot UI that Vittain AI embeds via iframe into the **Messages → Live Messages** page (`/messages/live`).

---

## Entry Point
`javascript/entrypoints/dashboard.js`
- Creates a Vue 3 app from `dashboard/App.vue`
- Registers: Vuex store, Pinia, Vue Router, i18n (vue-i18n), FormKit, FloatingVue, DOMPurify
- Syncs Vuex store with router via `vuex-router-sync`
- Sets up Sentry error tracking (if `window.errorLoggingConfig` is set)
- Calls `initializeChatwootEvents()` + `initializeAnalyticsEvents()`
- Mounts to `#app` on `window.onload`

---

## Router Structure (`dashboard/routes/`)
Root router file: `routes/index.js`
- Uses Vue Router `createWebHistory`
- Guards: `validateAuthenticateRoutePermission` — checks login, account existence, onboarding steps (account_details → enrichment → inbox_setup)
- All routes scoped under `/app/accounts/:accountId/...`

### Main Route Groups (`dashboard.routes.js`)
| Route Group | Path prefix | Description |
|---|---|---|
| `conversation` | `/conversations/*` | Main inbox, conversation thread, search |
| `settings` | `/settings/*` | All settings sub-pages (25+ sections) |
| `contacts` | `/contacts/*` | Contact list, contact detail |
| `companies` | `/companies/*` | Company CRM |
| `campaigns` | `/campaigns/*` | Campaign management |
| `inbox` | `/inbox/*` | Inbox configuration |
| `helpcenter` | `/portals/*` | Help center / knowledge base articles |
| `captain` | `/captain/*` | AI assistant (Captain) feature |
| `search` | `/search` | Global search |
| `calls` | `/calls/*` | Voice calls module |

### Special Routes
- `/onboarding` → `OnboardingAccountDetails.vue`
- `/onboarding/inbox-setup` → `OnboardingInboxSetup.vue`
- `/suspended` → Suspended account page
- `/no-accounts` → No accounts error page

---

## Settings Sub-sections (`routes/dashboard/settings/`)
25 settings modules, each a separate route:
| Section | What it configures |
|---|---|
| `account` | Account name, timezone, language |
| `agents` | Add/edit/remove agents |
| `teams` | Create teams, assign agents |
| `inbox` | Channel inboxes (WhatsApp, Email, Web, SMS) |
| `labels` | Conversation labels |
| `canned` | Canned responses (quick replies) |
| `automation` | Rule-based automation workflows |
| `integrations` | External app integrations |
| `billing` | Plan & billing |
| `reports` | Analytics & reporting sub-pages |
| `macros` | Reusable action sequences |
| `templates` | Message templates |
| `attributes` | Custom conversation/contact attributes |
| `sla` | SLA policies |
| `captain` | AI assistant configuration |
| `security` | 2FA, session management |
| `profile` | Agent profile settings |
| `customRoles` | Custom agent roles |
| `auditlogs` | Audit trail |

---

## Conversation Module (`routes/dashboard/conversation/`)
The heart of the agent inbox.

**Key files:**
- `conversation.routes.js` — Defines all conversation-related routes (6,760 bytes — largest route file)
- `ConversationView.vue` — Main split-panel layout (list + thread)
- `ContactPanel.vue` — Right-side contact context panel (10,931 bytes)
- `ConversationAction.vue` — Assign agent, team, labels (8,854 bytes)
- `ContactConversations.vue` — All conversations for a contact
- `ConversationParticipant.vue` — Watchers/participants on a conversation
- `ConversationInfo.vue` — Metadata display

**Sub-sections:**
- `contact/` — Contact details within conversation
- `customAttributes/` — Custom field display
- `labels/` — Label management per conversation
- `search/` — In-conversation search
- `Macros/` — Apply macros to conversation

---

## Vuex Store (`dashboard/store/`)
Root: `store/index.js` — Vuex `createStore` with 50+ modules

### Core Conversation Modules
| Module | Responsibility |
|---|---|
| `conversations` | Conversation list, filters, pagination |
| `conversationPage` | Current page state |
| `conversationSearch` | Search across conversations |
| `conversationStats` | Unread counts, stats |
| `conversationLabels` | Labels on conversations |
| `conversationMetadata` | Extra metadata per conversation |
| `conversationTypingStatus` | Typing indicator state |
| `conversationUnreadCounts` | Unread badge counts |
| `conversationWatchers` | Conversation watcher tracking |
| `draftMessages` | Draft reply state |
| `bulkActions` | Multi-select conversation actions |

### Contact / CRM Modules
| Module | Responsibility |
|---|---|
| `contacts` | Contact CRUD |
| `contactConversations` | Conversations belonging to a contact |
| `contactLabels` | Labels on contacts |
| `contactNotes` | Agent notes on contacts |

### Infrastructure Modules
| Module | Responsibility |
|---|---|
| `accounts` | Account settings + switching |
| `auth` | Login/logout/current user |
| `agents` | Agent list |
| `teams` | Team list |
| `inboxes` | Inbox list + config |
| `inboxMembers` | Agents in an inbox |
| `inboxAssignableAgents` | Agents assignable to a conversation |
| `labels` | Global label list |
| `cannedResponse` | Canned response library |
| `macros` | Macro library |
| `webhooks` | Webhook config |
| `integrations` | Integration config |
| `attributes` | Custom attribute definitions |
| `automations` | Automation rules |
| `notifications` | In-app notification feed |
| `userNotificationSettings` | Per-user notification prefs |
| `customViews` | Saved conversation filter views |
| `customRole` | Custom role definitions |
| `sidebarSortPreferences` | Sidebar ordering prefs |
| `dashboardApps` | Embedded dashboard apps |
| `globalConfig` | Platform-wide config (from `shared/store`) |

### Reporting Modules
| Module | Responsibility |
|---|---|
| `reports` | Overview, agent, team, inbox reports |
| `csat` | CSAT score data |
| `sla` | SLA policy data |
| `slaReports` | SLA performance reports |
| `summaryReports` | Summary view data |

### Captain (AI) Modules
| Module | Responsibility |
|---|---|
| `captainAssistants` | AI assistant definitions |
| `captainDocuments` | Knowledge documents for Captain |
| `captainResponses` | AI-suggested responses |
| `captainFaqSuggestions` | FAQ suggestions |
| `captainInboxes` | Captain-linked inboxes |
| `captainAgentSessions` | Agent AI session tracking |
| `captainBulkActions` | Bulk AI actions |
| `copilotThreads` | AI copilot thread context |
| `copilotMessages` | AI copilot messages |
| `captainScenarios` | Predefined scenarios |
| `captainTools` | Built-in AI tools |
| `captainCustomTools` | Custom tool definitions |

---

## API Layer (`dashboard/api/`)
51 API client files — each is a thin wrapper around Axios calls.

**Key API files for Vittain integration:**
| File | What it calls |
|---|---|
| `conversations.js` | GET/PATCH conversations |
| `messages.js` (via `inbox/`) | Send messages, fetch thread |
| `contacts.js` | Contact CRUD + search |
| `campaigns.js` | Campaign list/create |
| `inboxes.js` | Inbox config |
| `auth.js` | Login, logout, sign-up |
| `agents.js` | Agent management |
| `reports.js` | Analytics data |
| `cannedResponse.js` | Canned reply CRUD |
| `webhooks.js` | Webhook CRUD |
| `search.js` | Global search |
| `notifications.js` | Notification feed |

**Special clients:**
- `ApiClient.js` — Base Axios wrapper with auth headers
- `CacheEnabledApiClient.js` — Adds caching layer on top of Axios

---

## Components (`dashboard/components/`)

### Top-level App Components (`components/app/`)
| Component | Purpose |
|---|---|
| `AddAccountModal.vue` | Switch/add account |
| `LowBackupCodesBanner.vue` | 2FA backup code warning |
| `PaymentPendingBanner.vue` | Billing overdue banner |
| `StatusBanner.vue` | System status alerts |
| `UpdateBanner.vue` | New version available banner |

### Widget Components (`components/widgets/`)
Reusable UI pieces used across many pages:
| Component | Purpose |
|---|---|
| `AILoader.vue` | AI thinking spinner |
| `AttachmentsPreview.vue` | File/image preview |
| `AutomationActionInput.vue` | Automation rule builder input |
| `ColorPicker.vue` | Hex/hsl color picker |
| `ChatTypeTabs.vue` | Reply / Private Note tabs |
| `TableFooter.vue` + pagination | Data table footer with page controls |
| `WootWriter/` | Rich text message editor |
| `conversation/` | Conversation-specific sub-widgets |
| `forms/` | Reusable form fields |
| `modal/` | Modal container components |

### Key Chat Components
| Component | Purpose |
|---|---|
| `ChatList.vue` (30,736 bytes) | Conversation list panel — the LEFT column of inbox |
| `ChatListHeader.vue` | Filter tabs, search, sort controls at top of list |
| `ConversationItem.vue` | Single row in conversation list |
| `ConversationList.vue` | Container rendering ConversationItems |
| `CustomAttribute.vue` | Display/edit custom fields |

---

## How Vittain Connects to This

```
Vittain Dashboard (/messages/live)
  └── <iframe src="CHATWOOT_URL/app/accounts/1/conversations" />
        └── This entire dashboard/ SPA renders inside that iframe

Vittain /api/webhooks/chatwoot  ←── Chatwoot POSTs agent replies here
Vittain /api/chat/handoff       ──→ Triggers Chatwoot conversation status change
Vittain lib/chatwoot.ts         ──→ REST calls to Chatwoot API (createContact, createConversation, sendMessage)
```

**Key Chatwoot API endpoints Vittain uses:**
- `POST /api/v1/accounts/:id/contacts` — create contact
- `POST /api/v1/accounts/:id/conversations` — create conversation
- `POST /api/v1/accounts/:id/conversations/:id/messages` — send message
- `POST /api/v1/accounts/:id/conversations/:id/toggle_status` — open/resolve
- `POST /api/v1/accounts/:id/conversations/:id/labels` — add label (e.g. "needs-human")
- `GET /api/v1/accounts/:id/contacts/search` — find existing contact

---

## Relevant Known Bugs (from issue1.txt / issue.txt)
1. **Widget never polls after manual takeover** — Fixed by always checking `/api/chat/sync` mode on widget init, not conditionally
2. **Duplicate messages on sync** — Fixed by `after` param slicing in sync route
3. **Customer message goes to AI when agent active** — Fixed by early-exit in `/api/chat` when Redis mode = `human`
4. **Redis `session_mode` must be set** in the "take over" endpoint for the fast-path sync check to work
