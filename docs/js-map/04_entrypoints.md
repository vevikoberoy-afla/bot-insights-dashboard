# Chatwoot — `javascript/entrypoints/` Knowledge Map

## What Is This?
The **Webpack/Vite entrypoints** — each file here is a separate JS bundle that gets compiled and loaded for a specific part of the Chatwoot application. Think of them as the `main.ts` for each sub-app.

---

## File Overview

| File | Size | Bundle for |
|---|---|---|
| `dashboard.js` | 3,372 bytes | Main agent dashboard SPA |
| `sdk.js` | 7,137 bytes | Website embed SDK (`window.chatwootSDK`) |
| `widget.js` | 1,443 bytes | Customer-facing chat widget iframe |
| `portal.js` | 284 bytes | Help center portal (customer-facing KB) |
| `v3app.js` | 1,700 bytes | v3 auth/login/onboarding flows |
| `superadmin.js` | 1,401 bytes | Superadmin panel (Chatwoot platform admin) |
| `superadmin_pages.js` | 937 bytes | Additional superadmin page bundle |
| `survey.js` | 554 bytes | CSAT survey response page |

---

## `dashboard.js` — Agent Dashboard Entrypoint

**Full stack it sets up:**
```
Vue 3 createApp(App)
  ├── vue-i18n        → internationalization (50+ languages)
  ├── Vuex store      → 50+ modules (see 01_dashboard.md)
  ├── Pinia           → modern stores (used in newer components)
  ├── Vue Router      → SPA routing (see routes section in 01_dashboard.md)
  ├── vuex-router-sync → keeps $route in Vuex state
  ├── @formkit/vue   → form management
  ├── FloatingVue    → tooltips/popovers (uses 'fixed' strategy to prevent scroll bugs)
  ├── @highlightjs/vue-plugin → code syntax highlighting
  ├── vue-dompurify-html → safe HTML rendering
  ├── @sentry/vue    → error tracking (if window.errorLoggingConfig set)
  └── Directives:
        v-resize      → @vueuse/components ResizeObserver
        v-on-clickaway → click outside detection
```

**Global components registered:**
- `woot-wizard` → multi-step wizard UI
- `fluent-icon` → Fluent UI icon system

**Bootstrap sequence:**
1. Create i18n with all locale messages
2. Sync Vuex store with router
3. Create Pinia
4. Mount Vue app
5. Register all plugins + directives
6. `initializeChatwootEvents()` — sets up internal event bus
7. `initializeAnalyticsEvents()` — wires up analytics tracking
8. `initalizeRouter()` — starts router with auth guard
9. `window.onload` → `app.mount('#app')`

---

## `sdk.js` — Website Embed SDK Entrypoint

Sets up `window.chatwootSDK = { run: runSDK }`.

**Initialization flow when `chatwootSDK.run({ baseUrl, websiteToken })` is called:**
1. Guard: if `window.$chatwoot` already exists, bail (prevent double init)
2. Register Turbo/Turbolinks/Astro navigation event listeners (to preserve iframe across page transitions)
3. Read `window.chatwootSettings` config
4. Build `window.$chatwoot` object with all public API methods
5. Call `IFrameHelper.createFrame({ baseUrl, websiteToken })` — injects the iframe

See `03_sdk.md` for full API details.

---

## `widget.js` — Chat Widget Entrypoint (1,443 bytes)

Minimal bootstrap — just mounts `widget/App.vue` into `#app`.
- Sets up vue-i18n with widget-specific locale messages
- Sets up Pinia
- Registers widget-specific directives
- Mounts to `#app` inside the iframe

---

## `portal.js` — Help Center Portal (284 bytes)

The smallest entrypoint — boots the customer-facing Help Center (knowledge base article browser). Very lightweight since it's mostly server-rendered with Vue hydration.

---

## `v3app.js` — Auth/Onboarding Entrypoint (1,700 bytes)

Powers the routes in `javascript/v3/`:
- Login page
- Sign-up / registration
- Onboarding flows (account setup, inbox setup)

**Uses:**
- Vue 3 + vue-i18n
- Pinia (no Vuex — newer code)
- `v3/views/routes.js` for routing

---

## `superadmin.js` — Superadmin Panel (1,401 bytes)

Powers the **Chatwoot platform superadmin** — the admin-of-admins interface where the Chatwoot instance owner manages:
- All accounts on the platform
- Feature flags per account
- Global system settings

> **Vittain context:** This is Chatwoot's own internal admin, NOT Vittain's `/admin` panel. Vittain's superadmin is at `/admin` in the Next.js app. Chatwoot's superadmin is accessed at `CHATWOOT_URL/super_admin`.

---

## `superadmin_pages.js` — Additional Superadmin Bundle (937 bytes)

Secondary bundle for superadmin — handles specific sub-pages that are loaded separately for performance. See `javascript/superadmin_pages/` for what's in it.

---

## `survey.js` — CSAT Survey (554 bytes)

Standalone page shown to customers when they receive a CSAT (Customer Satisfaction) survey link after a resolved conversation. Renders a simple thumbs-up/thumbs-down (or star rating) form.

---

## Build System Note
These entrypoints are consumed by Chatwoot's Vite config (originally Webpacker/Webpack). Each compiles into a separate `packs/js/[name].js` bundle served by the Rails asset pipeline or Vite dev server.
