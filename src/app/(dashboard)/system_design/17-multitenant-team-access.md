# Multitenant team and employee access

## Product model

Each customer business is a workspace (`clients.id`). A user can belong to multiple workspaces through `workspace_memberships`; permissions never cross workspace boundaries. The workspace owner or workspace administrator invites employees by verified email from **Settings → Team & Access**. The invitation is single-use, expires after seven days, and carries both a role template and an explicit permission snapshot.

The founder controls the maximum number of active employees plus unexpired invitations with the `members.seats` entitlement. It is configured in immutable plan versions and can be adjusted for one customer through an expiring entitlement override in the master-admin Account 360 screen. The database locks the workspace account while inviting or restoring a member, then counts active memberships and pending invitations before allowing another seat. A client-side disabled button is only a convenience; it is not the quota control.

## Permission model

An employee receives one of three access levels for every module:

- `none`: module is absent from their navigation and direct route/API access is denied.
- `read`: screens and records are visible, but creation, edits, status changes, exports that mutate state, and configuration changes are denied.
- `write`: read plus the module’s operational actions.

Owners and workspace administrators retain full workspace access. The standard Agent, Booking & Commerce Operator, Analyst, and Billing Manager roles provide editable starting templates. Saving the matrix stores a complete JSON permission snapshot on the membership, so later changes to a template do not silently expand an employee’s access.

The modules are Overview, Live Inbox, Bookings, Services, Offers, Booking Analytics, Products, Orders, Inventory, Bots, Campaigns, Tickets, Contacts, Knowledge, Sources, Customer Analytics, Templates, Workspace Settings, Team & Access, Billing, and Usage.

Examples:

- A spa receptionist can receive `bookings: write`, `services: read`, and everything else `none`.
- A restaurant host can receive `bookings: write`, `offers: read`, and `booking_analytics: read`.
- A fulfilment employee can receive `orders: write`, `products: read`, and `inventory: write`.
- A support agent can receive `inbox: write`, `tickets: write`, and `contacts: read`.

## Enforcement path

`/api/workspaces/current` and `/api/workspaces/state` return only the current member’s role and permission snapshot. `WorkspaceStateProvider` evaluates access, the sidebar omits inaccessible destinations, and a direct URL renders an access-denied screen. These are usability controls.

Authoritative controls run separately:

1. Management endpoints call `requireWorkspace` or `getAuthenticatedWorkspaceUser` with a module and read/write intent.
2. Booking and commerce APIs resolve granular modules (`bookings`, `services`, `offers`, `products`, `orders`, or `inventory`) before reading or mutating.
3. `saas_member_access` enforces the same matrix for authenticated Supabase access.
4. Migration 074 remaps booking and commerce row-level policies from broad feature areas to granular modules.
5. `saas_team_mutate` validates permissions, enforces seat limits under a database lock, protects the owner and acting administrator, and writes an audit event.
6. Workspace lifecycle restrictions and plan feature gates still apply after employee permission checks. Employee grants can narrow plan access; they cannot enable a feature excluded by the plan or revive a suspended workspace.

Server/service-role customer-facing automation remains governed by runtime entitlements, not by an employee’s dashboard role. This keeps chatbot bookings, orders, and support flows separate from staff access.

## Data and security rules

- `workspace_memberships.permissions` and `saas_invitations.permissions` accept only known module keys and `none/read/write` values.
- Authorization always uses authenticated `user_id + client_id`; email is only used to bind invitation acceptance to a verified account.
- Owners cannot be demoted or removed through ordinary membership mutation, and administrators cannot remove themselves.
- Revocation takes effect when APIs re-read membership and when the browser’s workspace state refreshes. Realtime subscriptions must also rely on RLS.
- Every invite, access edit, restoration, and revocation is written to `saas_audit_events` without exposing the invitation token.

## Deployment

Apply migrations in order through `supabase/074_workspace_member_permissions.sql`. Existing employees keep their former role behavior because a null permission snapshot falls back to the legacy role template. Editing them in Team & Access writes the new explicit matrix. New invitations always carry an explicit matrix.

The founder manages plan-wide seat defaults under **Master Admin → Plans & Entitlements** and per-workspace seat exceptions under **Account 360 → Entitlements → Grant override → Team seats**.
