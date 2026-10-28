# Contacts and CRM dashboard

## Contact list

`/contacts` loads `/api/contacts` and `/api/segments`, supports search/filter, selection, import/create/delete, bulk segment move/add/remove, and links each row to `/contacts/[id]`. Contact records can contain name, email, phone, tags, address, lifecycle stage, company, preferences, channel consent and custom profile fields.

## Customer 360

`/contacts/[id]` loads `/api/contacts/[id]` and presents editable identity, profile, address, communication consent and internal notes. Saving uses `PUT /api/contacts/[id]`. The detail response is expected to include linked orders, bookings, tickets, conversations, events and segment membership so support and sales see one customer record.

## Segments

`/contacts/segments` loads `/api/segments`, shows manual and automatic groups, counts and update semantics, creates manual segments, and deletes only non-system segments. `/api/segments/members` performs bulk membership changes from the Contacts table. Automatic membership is fed by booking, order, support, cart and engagement events.

## Pipeline

`/contacts/pipeline` is a visual drag-and-drop sales pipeline with New Leads, Engaged, Qualified, Closed Won and Closed Lost columns. The current page state and sample cards are local UI data; drag operations do not yet persist to a pipeline API.
