# Notification Admin UI — Route Reference

> **Info:** This file tracks all planned pages/routes for the Notification Admin UI (port 3159, Next.js). Update the **Status** column as pages are implemented.

## Public Routes

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/login` | Login | Login page with local credentials (email/password) and SAML SSO button | Not Started |
| `/forgot-password` | Password Reset Request | Password reset request form | Not Started |
| `/reset-password` | Password Reset Form | Password reset form with token validation (token-gated) | Not Started |

## Dashboard

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/dashboard` | Dashboard | Metrics, charts, channel health, top rules, and recent failures | Not Started |

## Rules

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/rules` | Rule List | Rule list with filters, sorting, pagination, and actions | Not Started |
| `/rules/new` | Create Rule | Create notification rule form with condition builder, template picker, channel selector | Not Started |
| `/rules/:id` | Rule Detail / Edit | Rule detail view and edit form | Not Started |
| `/rules/:id/history` | Rule Change History | Rule change history timeline | Not Started |

## Templates

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/templates` | Template List | Template list with card grid, filters, and actions | Not Started |
| `/templates/new` | Create Template | Create template with WYSIWYG editor and channel variants | Not Started |
| `/templates/:id` | Template Editor | Template editor with WYSIWYG, live preview, variable toolbar | Not Started |
| `/templates/:id/versions` | Version History | Template version history with rollback | Not Started |

## Channels

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/channels` | Channel List | Channel list with health cards, provider details, and delivery rates | Not Started |
| `/channels/:id` | Channel Configuration | Provider configuration form with credentials, sender identity, and connection test | Not Started |

## Notification Logs

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/logs` | Notification Log List | Notification log list with filters, expandable rows, and lifecycle timeline | Not Started |
| `/logs/:id` | Notification Detail / Trace | Notification detail with lifecycle timeline, rendered content preview, delivery attempts | Not Started |

## Event Mappings

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/event-mappings` | Mapping List | Event mapping list with filters and pagination | Not Started |
| `/event-mappings/new` | Create Mapping | Create event mapping with field mapping builder | Not Started |
| `/event-mappings/:id` | Mapping Editor / Test | Mapping editor with field mappings and test panel | Not Started |

## Bulk Upload

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/bulk-upload` | Upload Zone + History | Drag-and-drop upload zone, upload history, progress tracking | Not Started |
| `/bulk-upload/:id` | Upload Detail | Upload detail with error rows, retry, and download result | Not Started |

## Recipient Groups

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/recipient-groups` | Group List | Recipient group list with type, member count, and status | Not Started |
| `/recipient-groups/new` | Create Group | Create static or dynamic recipient group | Not Started |
| `/recipient-groups/:id` | Group Detail | Group detail with member list, add/remove members, rules using this group | Not Started |

## User Management (Admin+ only)

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/users` | User Management | User list with role badges, status, last login, and actions | Not Started |
| `/users/:id` | User Detail / Edit | User detail with edit, password reset, and activity log | Not Started |

## Audit

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/audit` | Audit Log Viewer | Audit log viewer with filters, expandable rows, and CSV export | Not Started |

## Settings (Super Admin only)

| Route | Page | Description | Status |
|-------|------|-------------|--------|
| `/settings` | System Configuration | System configuration key-value editor | Not Started |
| `/settings/identity-providers` | SAML IdP List | SAML Identity Provider list with status, certificate expiry | Not Started |
| `/settings/identity-providers/:id` | IdP Detail / Edit | IdP detail with metadata, SP download, test connection | Not Started |
