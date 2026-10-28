# Chatwoot — `javascript/shared/` Knowledge Map

## What Is This?
The **shared utilities library** — code used by multiple Chatwoot apps (dashboard, widget, portal, v3). Nothing here is app-specific. Think of it as an internal `@chatwoot/shared` package.

> **Vittain context:** These utilities power cross-cutting concerns in the embedded Chatwoot iframe. The most relevant piece is `sharedFrameEvents.js` (the postMessage event names) and `globalConfig` (the Vuex module that holds platform-wide settings like widget color, account features).

---

## Structure

```
shared/
├── components/     — UI components used in multiple apps
├── composables/    — Vue 3 composables (shared hooks)
├── constants/      — Shared constant values
├── helpers/        — Pure utility functions
├── mixins/         — Vue 2-era mixins (legacy)
└── store/          — Shared Vuex/Pinia stores
```

---

## `shared/constants/`

### `sharedFrameEvents.js` (most important for Vittain)
Defines the **postMessage event name strings** used between the SDK (parent page) and the widget iframe:

```js
// Widget → SDK (parent page)
CHATWOOT_ON_MESSAGE        // new message received
CHATWOOT_ON_READY          // widget fully loaded
CHATWOOT_ON_TOGGLE         // widget opened/closed
CHATWOOT_ERROR             // widget encountered error
SET_COOKIE                 // widget wants SDK to set a cookie

// SDK → Widget (parent page → iframe)
SDK_SET_BUBBLE_VISIBILITY  // show/hide bubble
SET_USER                   // identify user
SET_CUSTOM_ATTRIBUTES      // set contact attributes
SET_LABEL                  // add label
SET_LOCALE                 // change language
SET_COLOR_SCHEME           // light/dark mode
```

These constants prevent magic string bugs — both sides import from the same file.

---

## `shared/components/`

### `FluentIcon/`
Two variants of the Fluent icon component:
- `DashboardIcon.vue` — registered globally in dashboard as `<fluent-icon>`
- `PortalIcon.vue` — used in the portal app

Wraps Fluent UI icons (Microsoft's design system icons) as Vue components. Takes `icon` and `size` props.

### Other shared components:
- Reusable primitive UI pieces (buttons, inputs) that appear in both dashboard and widget
- Shared modal structures

---

## `shared/helpers/`

### `HTMLSanitizer.js`
`domPurifyConfig` — the DOMPurify configuration used to safely render HTML:
- Allows: `a`, `b`, `strong`, `em`, `ul`, `ol`, `li`, `p`, `br`, `code`, `pre`, `blockquote`, `img`
- Strips: `<script>`, `onerror`, `onclick`, and all other event handlers
- Used by `vue-dompurify-html` directive in the dashboard

### Other helpers:
- Date/time formatting utilities shared between widget and dashboard
- URL parsing/sanitization
- String manipulation (truncation, capitalization)
- File size/type helpers (used in both agent upload and widget file attach)

---

## `shared/composables/`
Vue 3 composables available to both dashboard and widget:

| Composable | Purpose |
|---|---|
| `useUISettings` | Read/write persisted UI preferences (sidebar state, dark mode) |
| `useKeyboardShortcuts` | Register and listen for keyboard shortcuts |
| `useAlert` | Show toast/snackbar alerts |
| `useTrack` | Analytics event tracking |

---

## `shared/store/`

### `globalConfig.js` — The Most Important Shared Store Module
This Vuex module is imported into both the dashboard store and other apps. It holds **platform-wide configuration** that comes from the Rails backend on page load:

```js
// State fields (examples):
{
  accountId: 1,
  vapidPublicKey: '...',       // Web Push notifications key
  enabledFeatures: [...],      // Feature flags per account
  isSignupEnabled: true,       // Whether new sign-ups are allowed
  logoThumbnail: '...',        // Account logo URL
  widgetColor: '#2563EB',      // Default widget accent color
  chatwootVersion: '3.x.x',   // Running version
  timezone: 'UTC',
  locale: 'en',
}
```

This is injected into `window.chatwootConfig` by Rails and read by the JS app on boot.

---

## `shared/mixins/` (Legacy)
Vue 2 mixins that have been partially migrated to composables. Still present for backward compatibility in older dashboard components:
- `alertMixin` — `showAlert()` helper
- `uiSettingsMixin` — dark mode, layout prefs
- `labelMixin` — label color/emoji helpers

---

## Key Relationships

```
dashboard/entrypoints/dashboard.js
  └── imports FluentIcon from shared/components/FluentIcon/DashboardIcon.vue
  └── imports domPurifyConfig from shared/helpers/HTMLSanitizer.js
  └── imports globalConfig store from shared/store/globalConfig

sdk/entrypoints/sdk.js
  └── imports SDK_SET_BUBBLE_VISIBILITY from shared/constants/sharedFrameEvents

widget/App.vue
  └── listens to postMessages using shared/constants/sharedFrameEvents event names
```

---

## Vittain Relevance Summary

| Shared piece | Why it matters to Vittain |
|---|---|
| `sharedFrameEvents` | If Vittain ever communicates with the embedded Chatwoot iframe via postMessage, use these event name constants |
| `globalConfig` store | Controls what features are shown in the embedded dashboard (e.g., `enabledFeatures`) |
| `HTMLSanitizer` | If Vittain renders any HTML from Chatwoot (e.g., article content, message history), use the same DOMPurify config |
| `FluentIcon` | Reference for icon system — Chatwoot uses Fluent icons; Vittain uses Lucide React |
