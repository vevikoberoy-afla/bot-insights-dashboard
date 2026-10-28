# Chatwoot — `javascript/portal/` Knowledge Map

## What Is This?
The **customer-facing Help Center portal** — a Vue 3 app that renders a public knowledge base where website visitors can browse and read articles without opening the chat widget. It's completely separate from the agent dashboard.

> **Vittain context:** The portal maps to the **Knowledge Chunks** system in Vittain. If Vittain eventually wants a public-facing FAQ/help center, this portal is the template. Currently it's not directly integrated — Vittain uses the RAG system internally (bot queries knowledge chunks), not as a public browsable portal.

---

## File Overview

| File / Dir | Size | Purpose |
|---|---|---|
| `portalHelpers.js` | 6,598 bytes | Core portal utilities — theme, TOC generation, article parsing |
| `portalThemeHelper.js` | 4,731 bytes | CSS custom property injection for portal theming |
| `application.scss` | 1,084 bytes | Portal-specific global styles |
| `api/` | — | API calls for fetching portal/article data |
| `components/` | — | Portal UI components (article list, article viewer, search) |
| `specs/` | — | Test files |

---

## `portalHelpers.js` (6,598 bytes)

Utility functions used across portal components:

### Key functions:
| Function | Purpose |
|---|---|
| `getPortalLink(portalSlug, locale)` | Build URL for a portal: `/hc/${portalSlug}/${locale}` |
| `getArticleLink(portalSlug, locale, articleSlug)` | Build URL for a specific article |
| `getCategoryLink(portalSlug, locale, categorySlug)` | Build URL for a category |
| `generateTableOfContents(articleContent)` | Parse article HTML → extract headings → build TOC array |
| `formatArticleContent(content)` | Process raw article markdown/HTML for display |
| `getPortalColor(portal)` | Extract accent color from portal config |

### URL Structure
```
/hc/:portalSlug/          → Portal home (article list, search)
/hc/:portalSlug/:locale/  → Locale-specific home
/hc/:portalSlug/:locale/articles/:articleSlug  → Article detail
/hc/:portalSlug/:locale/categories/:categorySlug → Category list
```

---

## `portalThemeHelper.js` (4,731 bytes)

Injects CSS custom properties into the document root to theme the portal based on the account's brand settings:

```js
// Sets variables like:
--portal-bg-color: #ffffff
--portal-accent-color: #2563EB
--portal-text-color: #1A1A19
--portal-font-family: 'Inter', sans-serif
```

This allows each Chatwoot account to have its own branded portal appearance without CSS specificity wars.

---

## `api/` — Portal API Calls
Fetch calls to the Chatwoot REST API:
- `GET /api/v1/portals` — List all portals for an account
- `GET /api/v1/portals/:slug/articles` — List articles
- `GET /api/v1/portals/:slug/articles/:slug` — Get single article
- `GET /api/v1/portals/:slug/categories` — Get category list
- `POST /api/v1/portals/:slug/articles/:slug/upvote` — Article helpful vote

---

## `components/` — Portal UI Components

Key components (inferred from Chatwoot's standard portal):
- **PortalSearch** — Full-text search across all articles
- **ArticleList** — Grid/list of article cards
- **ArticleViewer** — Renders article content with TOC sidebar
- **CategoryList** — Browse articles by category
- **PortalHeader** — Branding header with logo + search
- **BreadCrumb** — Navigation breadcrumb

---

## Data Model (What a Portal Contains)

```
Portal
  ├── slug (URL identifier)
  ├── name
  ├── color (accent/brand color)
  ├── logo_url
  ├── custom_domain (optional)
  └── locale(s) supported
        └── Categories
              └── Articles
                    ├── title
                    ├── slug
                    ├── content (markdown)
                    ├── author
                    ├── views_count
                    └── status (draft | published)
```

---

## Vittain Mapping

| Chatwoot Portal Concept | Vittain Equivalent |
|---|---|
| Portal | Knowledge Base (per client) |
| Article | Knowledge Chunk / document |
| Category | Chunk Tag / Category |
| Article content | Chunk content (indexed by pgvector) |
| Article viewer | — (no public portal yet in Vittain) |
| Portal search | RAG vector search (internal, bot-only) |

The key difference: Chatwoot's portal is **publicly browsable by humans**. Vittain's knowledge base is **queried by the AI bot** in real time — not browsed by users directly.
