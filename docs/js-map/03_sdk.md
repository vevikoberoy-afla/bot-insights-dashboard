# Chatwoot — `javascript/sdk/` Knowledge Map

## What Is This?
The **JavaScript SDK** that website owners embed into their site to load the Chatwoot chat widget. It creates the floating bubble, injects the widget iframe, and exposes the `window.$chatwoot` API for programmatic control.

> **Vittain context:** This SDK is the bridge between a client's website and the Chatwoot widget iframe. When Vittain integrates Chatwoot for web chat, clients embed this SDK snippet, which calls `window.chatwootSDK.run({ baseUrl, websiteToken })`.

---

## File Overview

| File | Size | Purpose |
|---|---|---|
| `sdk.js` | 7,226 bytes | Core SDK — creates iframe, exposes `window.$chatwoot` API |
| `IFrameHelper.js` | 10,692 bytes | Manages the iframe lifecycle and postMessage communication |
| `bubbleHelpers.js` | 3,766 bytes | Floating bubble DOM creation and positioning |
| `DOMHelpers.js` | 1,950 bytes | Low-level DOM utilities (add/remove classes, restore widget) |
| `cookieHelpers.js` | 1,354 bytes | Cookie management for user identity and conversation persistence |
| `settingsHelper.js` | 507 bytes | Parse `chatwootSettings` config from the embedding page |
| `constants.js` | 165 bytes | SDK constants |

---

## `sdk.js` — The Public API

### How it's loaded
```html
<script>
  window.chatwootSettings = { ... }
</script>
<script async src="https://your-chatwoot.com/packs/js/sdk.js"></script>
<script>
  window.addEventListener('chatwoot:ready', function() {
    window.$chatwoot.setUser('user-id', { name: 'John', email: 'j@example.com' })
  })
</script>
```

### `window.$chatwoot` Public Methods

| Method | Args | What it does |
|---|---|---|
| `toggle(state?)` | `'open'` or `'close'` | Open/close the widget |
| `toggleBubbleVisibility(v)` | `'show'` or `'hide'` | Show/hide the floating bubble |
| `popoutChatWindow()` | — | Open widget in a separate browser window |
| `setUser(id, user)` | `string, {name, email, avatar_url}` | Identify a logged-in user — links conversations to a contact |
| `setCustomAttributes(attrs)` | `{key: value}` | Set contact-level custom attributes |
| `deleteCustomAttribute(key)` | `string` | Remove a contact attribute |
| `setConversationCustomAttributes(attrs)` | `{key: value}` | Set conversation-level attributes |
| `deleteConversationCustomAttribute(key)` | `string` | Remove a conversation attribute |
| `setLabel(label)` | `string` | Add label to current conversation |
| `removeLabel(label)` | `string` | Remove label from conversation |
| `setLocale(locale)` | `string` | Change widget language at runtime |
| `setColorScheme(mode)` | `'light'|'dark'|'auto'` | Switch color scheme |
| `reset()` | — | Clear cookies, reload widget iframe — effectively logs out the visitor |

### Communication Pattern
All `window.$chatwoot` methods (except toggle/visibility) send postMessages to the iframe via `IFrameHelper.sendMessage(type, payload)`. The widget iframe listens and acts accordingly.

---

## `IFrameHelper.js` — iframe Management (10,692 bytes)

The most important file in the SDK. Handles:

### iframe Creation
- Creates `<div class="woot-widget-holder">` container
- Creates `<iframe class="woot-widget-bubble--iframe">` with the widget URL
- Sets `data-turbo-permanent="true"` for Turbo/Turbolinks apps
- Applies position (left/right), dark mode classes

### postMessage Communication
- **Outbound** (`sendMessage`): SDK → widget iframe
- **Inbound** (`receiveMessage`): Widget iframe → parent page

### Inbound events the SDK handles from the widget:
| Event | What happens |
|---|---|
| `loaded` | Widget is ready — fires `chatwoot:ready` on window |
| `setCookies` | Stores conversation cookie on parent domain |
| `toggleBubble` | Updates bubble open/close state |
| `onError` | Logs errors |
| `setBubbleLabel` | Updates unread count badge |
| `setCustomAttributes` | Relays to Chatwoot server |
| `setUser` | Triggers user identification |

### URL Construction
Widget iframe src = `${baseUrl}/widget?website_token=${websiteToken}&locale=${locale}&...`

---

## `bubbleHelpers.js` — Floating Bubble (3,766 bytes)

Creates the DOM for the launcher button (the chat icon bubble):
- Two bubble variants: `standard` (round icon button) and `expanded_bubble` (wider pill with text)
- Positions: `left` or `right` (bottom corner)
- Handles unread count badge (red dot with number)
- Adds hover/click event listeners to toggle widget open/closed

---

## `DOMHelpers.js` — DOM Utilities (1,950 bytes)

```js
addClasses(el, 'class-name')        // add CSS classes
removeClasses(el, 'class-name')     // remove CSS classes  
restoreWidgetInDOM(newBody)         // re-inject widget into new DOM after Turbo navigation
```

`restoreWidgetInDOM` is critical for Turbolinks/Turbo/Astro — when those frameworks swap the page body on navigation, the widget iframe would be destroyed. This function moves it back into the new body.

---

## `cookieHelpers.js` — Cookie Management (1,354 bytes)

| Function | Purpose |
|---|---|
| `getUserCookieName()` | Returns `cw_user_identifier_${websiteToken}` |
| `computeHashForUserData({identifier, user})` | Hash of user identity to detect changes |
| `setCookieWithDomain(name, value, {baseDomain})` | Sets cookie on the correct domain (handles subdomains) |
| `getCookieWithDomain(name)` | Reads cookie |

**Cookies set by the SDK:**
- `cw_conversation` — Persists the conversation ID across page loads
- `cw_user_identifier_${token}` — Stores hash of identified user to prevent redundant `setUser` calls

---

## `settingsHelper.js` — Config Parser (507 bytes)

```js
getBubbleView(type)     // 'expanded_bubble' | 'standard' — validates + returns
getDarkMode(mode)       // 'auto' | 'light' | 'dark' — validates + returns
getWidgetStyle(style)   // 'standard' | 'flat' — validates + returns
```

Reads from `window.chatwootSettings` set by the embedding website.

---

## Framework Compatibility
The SDK explicitly handles:
- **Rails Turbo** — `turbo:before-render` event → `restoreWidgetInDOM`
- **Turbolinks** — `turbolinks:before-render` event → `restoreWidgetInDOM`
- **Astro** — `astro:before-swap` event → `restoreWidgetInDOM`
- **Standard SPA** — No special handling needed

---

## Vittain Integration Notes
- Vittain's own `public/widget.js` is a **separate, custom-built widget** (vanilla JS, not Vue)
- Chatwoot's SDK is used when clients want the **full Chatwoot experience** (file uploads, rich media, article viewer)
- Both widgets ultimately connect to Vittain's `/api/chat` endpoint (via different paths)
- `websiteToken` in the SDK = `context_id` in Vittain's terminology
