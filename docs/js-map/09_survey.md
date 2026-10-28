# Chatwoot — `javascript/survey/` Knowledge Map

## What Is This?
A **standalone Vue 3 mini-app** for the CSAT (Customer Satisfaction) survey page. When an agent resolves a conversation and CSAT is enabled, the customer receives a link to this page to rate their experience.

> **Vittain context:** CSAT feeds directly into the Analytics page KPI. Vittain's `fetures.txt` specs a "CSAT Score KPI card (thumbs up % of total)" in analytics. Chatwoot's survey module automatically captures this data — Vittain just needs to read it from Chatwoot's reports API.

---

## Structure

```
survey/
├── App.vue          — Root component (minimal, renders the survey form)
├── api/             — Fetch calls to submit survey response
├── assets/          — Icons/images for the survey page
├── components/      — Survey UI components (rating widget, thank you screen)
├── helpers/         — URL parsing (extracts survey token from URL)
├── i18n/            — Translations for survey text
├── store/           — Minimal Pinia store (survey state)
└── views/           — The survey page view
```

Loaded by: `entrypoints/survey.js`

---

## Views (`survey/views/`)

**Single view** — the survey response page:

### Survey Page Structure
1. **Header** — "How was your experience with [Agent Name]?"
2. **Rating** — One of:
   - Emoji scale (😞 😐 😊) — 3-point
   - Thumbs up/down — binary
   - Star rating (1-5) — configured per account
3. **Comment box** (optional) — "Tell us more…"
4. **Submit button**
5. **Thank you screen** — shown after submission

---

## API (`survey/api/`)

| Call | Endpoint | Purpose |
|---|---|---|
| GET survey data | `GET /app/survey?csat_survey_id=:token` | Load survey details (agent name, conversation summary) |
| POST response | `POST /app/survey` | Submit rating + optional comment |

The `csat_survey_id` is a one-time token generated when Chatwoot marks a conversation resolved.

---

## Store (`survey/store/`)
Minimal Pinia store:
- Survey token (from URL)
- Agent info (name, avatar)
- Rating value selected
- Comment text
- Submission state (idle / submitting / submitted / error)

---

## i18n (`survey/i18n/`)
Translations for all survey text strings. Same i18n pattern as the rest of Chatwoot. Supports all languages that Chatwoot supports (50+).

---

## Data Flow

```
Conversation resolved in Chatwoot
  └── Chatwoot generates csat_survey_id token
  └── Chatwoot sends email/WhatsApp to customer:
        "How was your experience? Rate us: https://chatwoot.example.com/app/survey?csat_survey_id=abc123"
  └── Customer clicks link → survey/App.vue loads
  └── Customer submits rating
  └── POST to /app/survey → stored in Chatwoot DB
  └── Available via: GET /api/v1/accounts/:id/reports/agents/satisfaction_reports
```

---

## CSAT Data in Vittain Analytics

The Vittain admin analytics page should pull CSAT data from Chatwoot's API:

```typescript
// In Vittain admin analytics
const csatData = await chatwootFetch<CsatReport>(
  '/reports/agents/satisfaction_reports?since=...&until=...'
)
// Returns: { total_count, satisfied_count, unsatisfied_count, rating_breakdown }
```

This feeds the **CSAT Score KPI card** specified in `fetures.txt`.

---

## Components (`survey/components/`)

| Component | Purpose |
|---|---|
| Rating component | Renders the emoji/star/thumbs rating picker |
| Comment box | Optional text area for feedback |
| Thank you screen | Post-submission confirmation |
| Error state | Network error / already submitted message |
