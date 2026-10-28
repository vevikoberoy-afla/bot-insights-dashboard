# Tickets and support dashboard

## Queue

`/tickets` redirects to `/tickets/all`. The queue loads `/api/tickets` with pagination, search, status, priority, type, assignment and date filters. `tickets-cache.ts` stores recent list and analytics responses so navigation does not flash a full loading screen.

Each row exposes ticket reference, subject/type, customer, status, priority, SLA/age and assignment. `/tickets/new` loads bots, team members, contacts and recent tickets, supports contact selection/creation, rich text, internal/public mode, attachments and POST ticket creation.

## Ticket detail

`/tickets/[id]` loads `/api/tickets/[id]`, edits status/priority/assignment, posts customer replies or internal notes through `/reply`, and creates signed/linked references through `/links`. The thread shows bot/customer/agent messages and order/return/booking context.

## Analytics and lifecycle

`/tickets/analytics` calls `/api/tickets/analytics?client_id=…&days=…` and reports volume, open/resolved, priority, SLA and CSAT trends. Ticket transitions are persisted with events/audit records; promotion/escalation routes are available via `/api/tickets/promote`.

The dashboard is the human-side completion of chatbot ticket flows: tickets created by the widget appear in the same queue, and agent replies use the shared inbox/session channel rather than creating a disconnected conversation.
