# Notification Admin UI — Route Reference

> **Info:** This file tracks all planned pages/routes for the Notification Admin UI (port 3159, Next.js). Update the **Status** column as pages are implemented.
>
> **v2 Note:** Authentication, user management, and SAML IdP routes have been removed per [15 — Notification Admin UI v2.0](../docs/15-notification-admin-ui.md). The application operates without authentication. All pages are public.

## Dashboard

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/dashboard` | Dashboard | Metrics, charts, channel health, top rules, and recent failures | Done |

## Rules

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/rules` | Rule List | Rule list with filters, sorting, pagination, and actions | Done |
| `/rules/new` | Create Rule | Create notification rule form with condition builder, template picker, channel selector | Done |
| `/rules/:id` | Rule Detail / Edit | Rule detail view and edit form | Done |
| `/rules/:id/history` | Rule Change History | Rule change history timeline | Not Started |

## Templates

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/templates` | Template List | Template list with card grid, filters, and actions | Done |
| `/templates/new` | Create Template | Create template with WYSIWYG editor and channel variants | Done |
| `/templates/:id` | Template Editor | Template editor with WYSIWYG, live preview, variable toolbar | Done |
| `/templates/:id/versions` | Version History | Template version history with rollback | Done |

## Channels

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/channels` | Channel List | Channel list with health cards, provider details, and delivery rates | Done |
| `/channels/:id` | Channel Configuration | Provider configuration form with credentials, sender identity, and connection test | Done |

## Notification Logs

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/logs` | Notification Log List | Notification log list with filters, expandable rows, and lifecycle timeline | Done |
| `/logs/:id` | Notification Detail / Trace | Notification detail with lifecycle timeline, rendered content preview, delivery attempts | Done |

## Event Mappings

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/event-mappings` | Mapping List | Event mapping list with filters and pagination | Done |
| `/event-mappings/new` | Create Mapping | Create event mapping with field mapping builder | Done |
| `/event-mappings/:id` | Mapping Editor / Test | Mapping editor with field mappings and test panel | Done |

## Bulk Upload

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/bulk-upload` | Upload Zone + History | Drag-and-drop upload zone, upload history, progress tracking | Done |
| `/bulk-upload/:id` | Upload Detail | Upload detail with error rows, retry, and download result | Done |

## Recipient Groups

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/recipient-groups` | Group List | Recipient group list with type, member count, and status | Done |
| `/recipient-groups/new` | Create Group | Create static or dynamic recipient group | Done |
| `/recipient-groups/:id` | Group Detail | Group detail with member list, add/remove members, rules using this group | Done |

## Audit

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/audit` | Audit Log Viewer | Audit log viewer with filters, expandable rows, CSV export, and DLQ management | Done |

## Settings

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/settings` | System Configuration | System configuration key-value editor | Done |

## Removed Routes (v2)

> The following routes were removed per [15 — Notification Admin UI v2.0](../docs/15-notification-admin-ui.md). Authentication is deferred; user management is handled by auth-rbac-service-frontend (:3161).

| Route | Page | Reason | Status |
|-------|------|--------|--------|
| `/login` | Login | Auth deferred — no login page | Removed |
| `/forgot-password` | Password Reset Request | Auth deferred | Removed |
| `/reset-password` | Password Reset Form | Auth deferred | Removed |
| `/users` | User Management | Moved to auth-rbac-service-frontend | Removed |
| `/users/:id` | User Detail / Edit | Moved to auth-rbac-service-frontend | Removed |
| `/settings/identity-providers` | SAML IdP List | Auth deferred | Removed |
| `/settings/identity-providers/:id` | IdP Detail / Edit | Auth deferred | Removed |
