# Admin Service — Endpoint Reference

> **Info:** This file tracks all planned REST API endpoints for the Admin Service (port 3155). Update the **Status** column as endpoints are implemented.

## User Management

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/admin/users` | Create a new admin user | Not Started |
| GET | `/admin/users` | List admin users with pagination and filtering | Not Started |
| PUT | `/admin/users/:id` | Update an admin user's profile, role, or status | Not Started |
| POST | `/admin/users/:id/reset-password` | Trigger a password reset for a specific user | Not Started |

## Notification Rules

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/admin/rules` | List notification rules with pagination, sorting, and filtering | Not Started |
| POST | `/admin/rules` | Create a new notification rule with cross-service validation | Not Started |
| PUT | `/admin/rules/:id` | Update an existing rule; supports partial updates | Not Started |
| DELETE | `/admin/rules/:id` | Soft-delete a rule (sets is_active = false) | Not Started |

## Event Mappings

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/admin/event-mappings` | List event mapping configurations with pagination | Not Started |
| POST | `/admin/event-mappings` | Create a new event mapping configuration | Not Started |
| PUT | `/admin/event-mappings/:id` | Update an existing mapping; increments version | Not Started |
| DELETE | `/admin/event-mappings/:id` | Soft-delete a mapping; cache invalidation event published | Not Started |
| POST | `/admin/event-mappings/:id/test` | Test a mapping against a sample payload; returns normalized event without persisting | Not Started |

## Template Management (Proxied to Template Service :3153)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/admin/templates` | List templates with pagination and filtering | Not Started |
| GET | `/admin/templates/:id` | Get template details with versions and variables | Not Started |
| POST | `/admin/templates` | Create a new template with channel variants | Not Started |
| PUT | `/admin/templates/:id` | Update a template (creates new version) | Not Started |
| DELETE | `/admin/templates/:id` | Soft-delete (deactivate) a template | Not Started |
| POST | `/admin/templates/:id/preview` | Preview template with sample data | Not Started |
| PUT | `/admin/templates/:id/rollback` | Roll back to a previous version | Not Started |

## Channel Configuration

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/admin/channels` | List all channels with status and health indicators | Not Started |
| PUT | `/admin/channels/:id` | Update channel configuration with optional connectivity dry-run | Not Started |

## Recipient Groups

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/admin/recipient-groups` | List groups with pagination and search | Not Started |
| POST | `/admin/recipient-groups` | Create a new recipient group | Not Started |
| GET | `/admin/recipient-groups/:id` | Get group details with member count | Not Started |
| PUT | `/admin/recipient-groups/:id` | Update group name, description, or criteria | Not Started |
| DELETE | `/admin/recipient-groups/:id` | Soft-delete a group | Not Started |
| GET | `/admin/recipient-groups/:id/members` | List group members with pagination | Not Started |
| POST | `/admin/recipient-groups/:id/members` | Add members to a static group | Not Started |
| DELETE | `/admin/recipient-groups/:id/members/:memberId` | Remove a member from a static group | Not Started |

## Dashboard

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/admin/dashboard` | Dashboard metrics aggregated from all downstream services | Not Started |

## System Configuration

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/admin/system-configs` | List all system configuration key-value pairs (Super Admin only) | Not Started |
| GET | `/admin/system-configs/:key` | Get a specific configuration value (Super Admin only) | Not Started |
| PUT | `/admin/system-configs/:key` | Update a configuration value (Super Admin only) | Not Started |

## SAML Identity Provider Management

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/admin/saml/idp` | List configured SAML Identity Providers (Super Admin only) | Not Started |
| POST | `/admin/saml/idp` | Register a new SAML Identity Provider by importing IdP metadata XML | Not Started |
| PUT | `/admin/saml/idp/:id` | Update an existing IdP configuration | Not Started |
| DELETE | `/admin/saml/idp/:id` | Deactivate a SAML IdP | Not Started |

## Audit Logs

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/admin/logs` | Retrieve audit logs with comprehensive filtering (proxied to Audit Service) | Not Started |

## Health

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/admin/health` | Health check; returns service status, database, downstream services, and RabbitMQ connectivity | Not Started |
