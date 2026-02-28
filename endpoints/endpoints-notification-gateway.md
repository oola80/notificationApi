# Notification Gateway — Endpoint Reference

> **Info:** **DEPRECATED** — The Notification Gateway (:3150) has been removed. Authentication moved to auth-rbac-service-backend (:3160). RBAC enforcement moved to per-service JWT validation. Service proxying removed — frontends connect directly to backend services. Webhook routing moved to infrastructure reverse proxy. See `docs/18-auth-rbac-architecture-addendum.md` for details.

## Authentication Endpoints (Local)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/api/v1/auth/login` | Authenticate with email and password; issues JWT access token + refresh token cookie | Deprecated — service removed |
| POST | `/api/v1/auth/refresh` | Exchange refresh token for new access token with rotated refresh token | Deprecated — service removed |
| POST | `/api/v1/auth/logout` | Invalidate current session; revoke refresh token and clear cookie | Deprecated — service removed |
| POST | `/api/v1/auth/forgot-password` | Request a password reset email (always returns 200 to prevent enumeration) | Deprecated — service removed |
| POST | `/api/v1/auth/reset-password` | Set a new password using a valid reset token | Deprecated — service removed |
| POST | `/api/v1/auth/change-password` | Change password for the currently authenticated user | Deprecated — service removed |
| GET | `/api/v1/auth/me` | Returns the currently authenticated user's profile and permissions | Deprecated — service removed |

## SAML SSO Endpoints (Local)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/api/v1/auth/saml/login` | Initiate SP-initiated SAML SSO flow; redirects to IdP | Deprecated — service removed |
| POST | `/api/v1/auth/saml/acs` | Assertion Consumer Service; receives SAML Response, validates, issues JWT tokens | Deprecated — service removed |
| GET | `/api/v1/auth/saml/metadata` | Returns SP metadata XML for IdP configuration | Deprecated — service removed |
| POST | `/api/v1/auth/saml/slo` | Single Logout endpoint; receives IdP LogoutRequest, invalidates sessions | Deprecated — service removed |

## Notification Endpoints (Proxied to Notification Engine :3152)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/api/v1/notifications/send` | Manually send a notification with recipient details, template ID, channels, and variable data | Deprecated — service removed |
| GET | `/api/v1/notifications` | List notifications with filters and pagination | Deprecated — service removed |
| GET | `/api/v1/notifications/:id` | Retrieve full notification details including lifecycle status log and delivery attempts | Deprecated — service removed |
| GET | `/api/v1/notifications/:id/trace` | End-to-end notification trace; returns complete lifecycle timeline (proxied to Audit Service) | Deprecated — service removed |

## Template Endpoints (Proxied to Template Service :3153)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/api/v1/templates` | List templates with pagination | Deprecated — service removed |
| POST | `/api/v1/templates` | Create a new template with channel variants | Deprecated — service removed |
| GET | `/api/v1/templates/:id` | Retrieve full template details including channel variants, variables, and version history | Deprecated — service removed |
| PUT | `/api/v1/templates/:id` | Update a template; creates a new immutable version | Deprecated — service removed |
| POST | `/api/v1/templates/:id/render` | Render a template with variable data | Deprecated — service removed |
| POST | `/api/v1/templates/:id/preview` | Preview a template with sample data across all channels | Deprecated — service removed |

## Rule Endpoints (Proxied to Admin Service :3155)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/api/v1/rules` | List notification rules with pagination and filters | Deprecated — service removed |
| POST | `/api/v1/rules` | Create a new notification rule | Deprecated — service removed |
| PUT | `/api/v1/rules/:id` | Update an existing rule | Deprecated — service removed |
| DELETE | `/api/v1/rules/:id` | Soft-delete a notification rule | Deprecated — service removed |

## Channel Endpoints (Proxied to Admin Service :3155)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/api/v1/channels` | List all notification channels with configuration status, provider details, and health | Deprecated — service removed |
| PUT | `/api/v1/channels/:id/config` | Update channel configuration (provider credentials, sender identity) | Deprecated — service removed |

## Event Mapping Endpoints (Proxied to Admin Service :3155)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/api/v1/event-mappings` | List event mapping configurations | Deprecated — service removed |
| POST | `/api/v1/event-mappings` | Create a new event mapping configuration | Deprecated — service removed |
| GET | `/api/v1/event-mappings/:id` | Retrieve full mapping details | Deprecated — service removed |
| PUT | `/api/v1/event-mappings/:id` | Update an event mapping; increments version | Deprecated — service removed |
| DELETE | `/api/v1/event-mappings/:id` | Soft-delete an event mapping | Deprecated — service removed |
| POST | `/api/v1/event-mappings/:id/test` | Test a mapping with a sample payload | Deprecated — service removed |

## Bulk Upload Endpoints (Proxied to Bulk Upload Service :3158)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/api/v1/bulk-upload/uploads` | Upload an XLSX file for bulk event submission (multipart/form-data) | Deprecated — service removed |
| GET | `/api/v1/bulk-upload/uploads` | List bulk uploads with pagination and filters | Deprecated — service removed |
| GET | `/api/v1/bulk-upload/uploads/:id` | Get upload status and progress | Deprecated — service removed |
| GET | `/api/v1/bulk-upload/uploads/:id/errors` | Get failed row details for a specific upload | Deprecated — service removed |
| POST | `/api/v1/bulk-upload/uploads/:id/retry` | Retry failed rows | Deprecated — service removed |
| DELETE | `/api/v1/bulk-upload/uploads/:id` | Cancel or delete an upload | Deprecated — service removed |

## Email Ingest Endpoints (Proxied to Email Ingest Service :3157)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/api/v1/email-ingest/parsing-rules` | List email parsing rules | Deprecated — service removed |
| POST | `/api/v1/email-ingest/parsing-rules` | Create a new email parsing rule | Deprecated — service removed |
| PUT | `/api/v1/email-ingest/parsing-rules/:id` | Update a parsing rule | Deprecated — service removed |
| DELETE | `/api/v1/email-ingest/parsing-rules/:id` | Soft-delete a parsing rule | Deprecated — service removed |
| GET | `/api/v1/email-ingest/processed-emails` | List processed emails | Deprecated — service removed |
| GET | `/api/v1/email-ingest/processed-emails/:id` | Retrieve full processed email details | Deprecated — service removed |

## Audit & Dashboard Endpoints (Proxied to Audit Service :3156 / Admin Service :3155)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/api/v1/audit/logs` | Retrieve audit logs with filtering (proxied to Audit Service) | Deprecated — service removed |
| GET | `/api/v1/dashboard/stats` | Dashboard statistics — aggregated notification metrics (proxied to Admin Service) | Deprecated — service removed |

## User Management Endpoints (Proxied to Admin Service :3155)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/api/v1/users` | List admin users | Deprecated — service removed |
| POST | `/api/v1/users` | Create a new admin user | Deprecated — service removed |
| GET | `/api/v1/users/:id` | Get admin user details | Deprecated — service removed |
| PUT | `/api/v1/users/:id` | Update admin user (role, active status) | Deprecated — service removed |
| DELETE | `/api/v1/users/:id` | Deactivate an admin user | Deprecated — service removed |

## API Key Management Endpoints (Local)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/api/v1/api-keys` | List all API keys (masked, showing only last 8 characters) | Deprecated — service removed |
| POST | `/api/v1/api-keys` | Create a new API key; returns the full key only once in the response | Deprecated — service removed |
| PUT | `/api/v1/api-keys/:id` | Update API key metadata (name, scopes, rate limit) | Deprecated — service removed |
| DELETE | `/api/v1/api-keys/:id` | Revoke an API key | Deprecated — service removed |
| POST | `/api/v1/api-keys/:id/rotate` | Rotate an API key; issues new key with grace period for old key | Deprecated — service removed |

## Provider Webhook Endpoints (Proxied → Provider Adapter Services, No Auth)

Provider webhook endpoints receive delivery status callbacks from external notification providers. These endpoints bypass the standard authentication pipeline — each adapter service verifies its own webhook signatures. **Webhook routing has moved to infrastructure reverse proxy (Nginx, AWS API Gateway, Kubernetes Ingress).**

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/webhooks/mailgun` | Mailgun delivery status webhooks; proxied to adapter-mailgun :3171 `/webhooks/inbound` | Deprecated — service removed |
| POST | `/webhooks/braze` | Braze transactional postbacks and Currents events; proxied to adapter-braze :3172 `/webhooks/inbound` | Deprecated — service removed |
| GET | `/webhooks/whatsapp` | Meta webhook verification challenge (hub.verify_token); proxied to adapter-whatsapp :3173 `/webhooks/inbound` | Deprecated — service removed |
| POST | `/webhooks/whatsapp` | WhatsApp/Meta delivery status webhooks; proxied to adapter-whatsapp :3173 `/webhooks/inbound` | Deprecated — service removed |
| POST | `/webhooks/aws-ses` | AWS SES/SNS delivery notifications; proxied to adapter-aws-ses :3174 `/webhooks/inbound` | Deprecated — service removed |

## Health Endpoints (Public — No Auth)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/health` | Liveness probe; returns service status | Deprecated — service removed |
| GET | `/ready` | Readiness probe; checks database connectivity and downstream service health | Deprecated — service removed |
