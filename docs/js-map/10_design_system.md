# Chatwoot — `javascript/design-system/` Knowledge Map

## What Is This?
The **design system story/documentation environment** — configuration for [Histoire](https://histoire.dev/), a Storybook alternative for Vue 3. It's used for developing and documenting UI components in isolation. Not deployed to production.

> **Vittain context:** This is purely for Chatwoot's internal development. No integration needed. However, it's useful as a **reference** — if you want to see exactly how any Chatwoot UI component looks and behaves in isolation, you could run `histoire` locally and browse them.

---

## Structure

```
design-system/
├── histoire.scss    (563 bytes) — Global styles for the Histoire dev environment
└── images/          — Static image assets used in component stories
```

**Root-level file:** `javascript/histoire.setup.ts` (1,459 bytes) — Histoire global setup (analogous to Storybook's `preview.js`).

---

## `histoire.setup.ts` (Root level)

Sets up the Histoire environment:
- Imports global CSS
- Registers global Vue components (same ones registered in `dashboard.js`)
- Sets up i18n for stories
- Configures dark/light mode toggle

---

## `histoire.scss`

Global stylesheet for the Histoire dev server interface — not part of any production bundle. Just makes component previews look correct in the Histoire browser.

---

## How to Use (Dev Only)

```bash
# From Chatwoot repo root (on the Oracle VM or locally):
pnpm histoire dev
# Opens at http://localhost:3000 (or configured port)
# Browse all Vue components with their stories
```

---

## Why It's Here

Chatwoot uses Histoire to:
- Document component APIs (props, slots, events)
- Visual regression testing
- Onboard new contributors to the component library
- Design review without needing a full backend

---

## Vittain Development Note

When building new dashboard components (for Vittain's Next.js admin or client dashboard), you can use Histoire as a **reference** to see exactly how Chatwoot renders things like:
- The `ChatList.vue` sidebar
- `ConversationItem.vue` rows
- The `ContactPanel.vue` layout

This helps ensure the embedded Chatwoot iframe feels visually consistent with Vittain's surrounding UI.
