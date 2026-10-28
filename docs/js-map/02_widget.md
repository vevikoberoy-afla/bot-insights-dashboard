# Chatwoot — `javascript/widget/` Knowledge Map

## What Is This?
The **customer-facing chat widget** — a Vue 3 SPA that renders inside an iframe injected into client websites. This is what the end-user (website visitor) actually sees and types into. It is separate from Vittain's own `widget.js` — Chatwoot's widget is the one embedded on client sites via Chatwoot's SDK.

> **Vittain context:** For the web chat channel, Vittain originally built its own `public/widget.js` (vanilla JS). Chatwoot's widget is the alternative — when Chatwoot is fully integrated, the client site can embed Chatwoot's SDK instead, which routes through Chatwoot → Vittain handoff layer.

---

## Entry Point
`javascript/entrypoints/widget.js` (1,443 bytes)
- Boots the widget Vue app (similar pattern to dashboard.js)
- Mounts `widget/App.vue` into `#app`

---

## App Root (`widget/App.vue`) — 13,656 bytes
The root Vue component. Manages:
- Widget open/closed state
- Pre-chat form display logic
- Unread message count badge
- Campaign popup display
- Language/locale loading
- Color scheme (light/dark)
- Connection status (online/offline)

---

## Views (`widget/views/`)
Six page-level views rendered inside the widget iframe:

| View | File | Purpose |
|---|---|---|
| Home | `Home.vue` | Welcome screen — shows agent availability, team info, "Start Conversation" button |
| Messages | `Messages.vue` | Active conversation thread view |
| Pre-Chat Form | `PreChatForm.vue` | Captures visitor name/email before chat starts (if enabled) |
| Unread Messages | `UnreadMessages.vue` | "You have N unread messages" entry screen |
| Campaigns | `Campaigns.vue` | Proactive campaign message display |
| Article Viewer | `ArticleViewer.vue` | Renders a Help Center article inside the widget |

---

## Components (`widget/components/`)
26 component files + 6 sub-directories.

### Message Rendering
| Component | Purpose |
|---|---|
| `AgentMessage.vue` (7,869 bytes) | Renders an agent's message bubble — avatar, content, timestamp |
| `AgentMessageBubble.vue` | Inner bubble for agent message (text + rich content) |
| `UserMessage.vue` (5,309 bytes) | Renders visitor's own message bubble |
| `UserMessageBubble.vue` | Inner bubble for user message |
| `AgentTypingBubble.vue` | "Agent is typing…" animated dots |
| `ChatMessage.vue` | Generic message wrapper — delegates to Agent or User variant |
| `UnreadMessage.vue` (3,286 bytes) | Single unread message preview card |
| `UnreadMessageList.vue` (3,476 bytes) | List of unread messages shown on home screen |

### Rich Media Bubbles
| Component | Purpose |
|---|---|
| `ImageBubble.vue` | Inline image display |
| `VideoBubble.vue` | Video player embed |
| `FileBubble.vue` | File download card |
| `ChatAttachment.vue` (4,750 bytes) | File/image attachment upload display |
| `ReplyToChip.vue` | "Replying to: …" thread reference chip |

### Input & Footer
| Component | Purpose |
|---|---|
| `ChatFooter.vue` (5,168 bytes) | Bottom bar — input, send, emoji, attach |
| `ChatInputWrap.vue` (5,155 bytes) | Text input with emoji picker integration |
| `ChatSendButton.vue` | Send button with loading state |
| `FooterReplyTo.vue` | Reply-to indicator above input |

### Header
| Component | Purpose |
|---|---|
| `ChatHeader.vue` (2,007 bytes) | Widget header — agent name, avatar, close/back |
| `ChatHeaderExpanded.vue` | Expanded header showing full team info |
| `HeaderActions.vue` (3,244 bytes) | Actions in header (popout, minimize, end conversation) |
| `GroupedAvatars.vue` | Shows multiple agent avatars grouped |
| `TeamAvailability.vue` | "Our team is available / away" status |

### Layout
| Component | Purpose |
|---|---|
| `ConversationWrap.vue` (3,913 bytes) | Scrollable conversation area container |
| `DragWrapper.vue` | Handles drag-to-resize widget |
| `Banner.vue` | Informational banner inside widget |

### Sub-directories
| Dir | Contents |
|---|---|
| `Availability/` | Agent online/offline availability display |
| `Form/` | Pre-chat form field components |
| `PreChat/` | Pre-chat form screen components |
| `layouts/` | Layout wrappers (full-page vs embedded) |
| `pageComponents/` | Page-level component wrappers |
| `template/` | Message template display components |

---

## Store (`widget/store/`)
Widget Vuex store — simpler than dashboard's store.

Key state managed:
- Current conversation + messages
- Agent info and availability
- Widget configuration (colors, title, welcome text)
- Pre-chat form data
- Campaign messages
- Contact/user identity

---

## API (`widget/api/`)
REST calls the widget makes to the Chatwoot server:
- Create conversation
- Send message
- Get conversation messages
- Fetch agent availability
- Submit CSAT rating
- Pre-chat form submission

---

## Key Configuration Options (from `sdk.js`)
These are the `window.chatwootSettings` options that control widget behavior:

| Option | Type | Default | Effect |
|---|---|---|---|
| `hideMessageBubble` | bool | false | Hides the floating bubble |
| `position` | `'left'|'right'` | `'right'` | Bubble position |
| `locale` | string | `'en'` | Language |
| `useBrowserLanguage` | bool | false | Auto-detect browser lang |
| `type` | `'standard'|'expanded_bubble'` | `'standard'` | Bubble appearance |
| `launcherTitle` | string | `''` | Text next to bubble |
| `showPopoutButton` | bool | false | Popout window button |
| `showUnreadMessagesDialog` | bool | true | Unread count dialog |
| `widgetStyle` | `'standard'|'flat'` | `'standard'` | Visual style |
| `darkMode` | `'auto'|'light'|'dark'` | `'auto'` | Color scheme |
| `welcomeTitle` | string | — | Home screen title |
| `welcomeDescription` | string | — | Home screen subtitle |
| `enableFileUpload` | bool | — | Attachment upload |
| `enableEmojiPicker` | bool | true | Emoji picker |
| `enableEndConversation` | bool | true | "End conversation" button |

---

## Vittain Integration Points

```
Client website
  └── Embeds Chatwoot SDK snippet (or Vittain's own widget.js)
        └── widget/App.vue renders conversation UI
              └── Sends messages → POST /api/v1/accounts/:id/conversations/:id/messages
                    └── Chatwoot stores message
                          └── Chatwoot webhook POSTs to Vittain /api/webhooks/chatwoot
                                └── Vittain saves to messages table + sets session mode
```

**When agent takes over:**
1. Agent types reply in Chatwoot dashboard → message saved in Chatwoot
2. Chatwoot webhook fires to Vittain → Vittain saves `sender_type: 'human'` message
3. Vittain sets Redis `session_mode:${sessionId}` = `'human'`
4. Vittain's `widget.js` polls `/api/chat/sync` → gets new human messages → displays them

---

## Helpers (`widget/helpers/`)
Utility functions used across widget components:
- URL/domain helpers
- Date formatting
- Message content parsing (markdown, links)
- Emoji utilities
