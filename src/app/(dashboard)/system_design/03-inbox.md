# Inbox and human handoff

`/inbox` is a three-pane conversation workspace with a conversation list, message thread and optional context panel.

## Conversation lifecycle

1. The page authenticates and obtains `clientId`.
2. `/api/inbox?client_id=…` loads conversations; browser memory/localStorage cache (`rag_convos_*`) makes repeat navigation instant.
3. Selecting a session calls `/api/inbox/[sessionId]?action=messages`; message history uses `rag_msgs_*` with a five-minute TTL.
4. Realtime Supabase channels (`chatRoomChannel`, `storeInboxChannel`) append new messages without replacing the whole thread.
5. `/api/inbox/[sessionId]/context-card` loads customer/order/booking/ticket context on demand.
6. Agent replies use server action `sendAgentReply`; session actions use `handleSessionAction` and `/api/inbox/handoff` where required.

## UI behavior

Tabs are All, Bot Active, Waiting (Handoff), Human (Mine), and Resolved. Channel icons cover widget/website, WhatsApp, email and Telegram. Flow cards are rendered by `DashboardFlowCard`, so product, booking, return, ticket, photo and CSAT interactions remain visible to agents.

The composer supports text, attachments, emoji, internal/private notes and send state. Handoff stops bot ownership; a human response is persisted to the same session and broadcast to the widget/channel through the realtime/message path.

## Failure and performance

The page debounces conversation refresh, guards duplicate message/conversation fetches with refs, and uses cache-first rendering. Network errors remain visible through toast/status feedback instead of silently replacing a live conversation with mock data.
