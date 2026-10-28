# Databases and live sources

## Pages

- `/databases/all` lists tenant databases, searches/filtering, creates a database and deletes it. It uses `/api/databases?client_id=…`.
- `/databases/[id]` edits name/type/configuration, manages source rows, tests a source, and runs a lookup query.
- `/databases/analytics` is currently `ComingSoon`.

## Source configuration

The detail page supports linked sources with endpoint URL, source type, auth header, HTTP method, request body, lookup field, sheet tab and field mapping. Source test calls `/api/databases/[id]/sources/[sourceId]/test`; lookup calls `/api/databases/[id]/query?lookup_value=…`.

Supported production paths include Google Sheets, CSV URLs, REST GET/POST and database-source adapters. `orderResolver.ts` normalizes aliases such as order ID, email/phone, SKU, item name, quantity, status, delivery date and totals. The bot editor assigns databases per bot through `/api/bot-databases`; the chat runtime must only search linked tenant sources.

## UI and operational details

The bot editor refreshes database assignments in the background. The database detail page has a mock database fallback only for IDs beginning `mock-db-`; that fallback is for visual testing and is not a live source. Source tests and lookup failures should expose the provider/schema error so the client can correct mapping without silently returning invented data.
