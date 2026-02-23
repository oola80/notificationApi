# Notification Gateway — Endpoint Reference

> **Info:** This file tracks all planned REST API endpoints for the Notification Gateway (port 3150). Update the **Status** column as endpoints are implemented.

## Authentication Endpoints (Local)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/api/v1/auth/login` | Authenticate with email and password; issues JWT access token + refresh token cookie | Not Started |
| POST | `/api/v1/auth/refresh` | Exchange refresh token for new access token with rotated refresh token | Not Started |
| POST | `/api/v1/auth/logout` | Invalidate current session; revoke refresh token and clear cookie | Not Started |
| POST | `/api/v1/auth/forgot-password` | Request a password reset email (always returns 200 to prevent enumeration) | Not Started |
| POST | `/api/v1/auth/reset-password` | Set a new password using a valid reset token | Not Started |
| POST | `/api/v1/auth/change-password` | Change password for the currently authenticated user | Not Started |
| GET | `/api/v1/auth/me` | Returns the currently authenticated user's profile and permissions | Not Started |

## SAML SSO Endpoints (Local)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/api/v1/auth/saml/login` | Initiate SP-initiated SAML SSO flow; redirects to IdP | Not Started |
| POST | `/api/v1/auth/saml/acs` | Assertion Consumer Service; receives SAML Response, validates, issues JWT tokens | Not Started |
| GET | `/api/v1/auth/saml/metadata` | Returns SP metadata XML for IdP configuration | Not Started |
| POST | `/api/v1/auth/saml/slo` | Single Logout endpoint; receives IdP LogoutRequest, invalidates sessions | Not Started |

## Notification Endpoints (Proxied to Notification Engine :3152)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/api/v1/notifications/send` | Manually send a notification with recipient details, template ID, channels, and variable data | Not Started |
| GET | `/api/v1/notifications` | List notifications with filters and pagination | Not Started |
| GET | `/api/v1/notifications/:id` | Retrieve full notification details including lifecycle status log and delivery attempts | Not Started |
| GET | `/api/v1/notifications/:id/trace` | End-to-end notification trace; returns complete lifecycle timeline (proxied to Audit Service) | Not Started |

## Template Endpoints (Proxied to Template Service :3153)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/api/v1/templates` | List templates with pagination | Not Started |
| POST | `/api/v1/templates` | Create a new template with channel variants | Not Started |
| GET | `/api/v1/templates/:id` | Retrieve full template details including channel variants, variables, and version history | Not Started |
| PUT | `/api/v1/templates/:id` | Update a template; creates a new immutable version | Not Started |
| POST | `/api/v1/templates/:id/render` | Render a template with variable data | Not Started |
| POST | `/api/v1/templates/:id/preview` | Preview a template with sample data across all channels | Not Started |

## Rule Endpoints (Proxied to Admin Service :3155)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/api/v1/rules` | List notification rules with pagination and filters | Not Started |
| POST | `/api/v1/rules` | Create a new notification rule | Not Started |
| PUT | `/api/v1/rules/:id` | Update an existing rule | Not Started |
| DELETE | `/api/v1/rules/:id` | Soft-delete a notification rule | Not Started |

## Channel Endpoints (Proxied to Admin Service :3155)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/api/v1/channels` | List all notification channels with configuration status, provider details, and health | Not Started |
| PUT | `/api/v1/channels/:id/config` | Update channel configuration (provider credentials, sender identity) | Not Started |

## Event Mapping Endpoints (Proxied to Admin Service :3155)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/api/v1/event-mappings` | List event mapping configurations | Not Started |
| POST | `/api/v1/event-mappings` | Create a new event mapping configuration | Not Started |
| GET | `/api/v1/event-mappings/:id` | Retrieve full mapping details | Not Started |
| PUT | `/api/v1/event-mappings/:id` | Update an event mapping; increments version | Not Started |
| DELETE | `/api/v1/event-mappings/:id` | Soft-delete an event mapping | Not Started |
| POST | `/api/v1/event-mappings/:id/test` | Test a mapping with a sample payload | Not Started |

## Bulk Upload Endpoints (Proxied to Bulk Upload Service :3158)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/api/v1/bulk-upload/uploads` | Upload an XLSX file for bulk event submission (multipart/form-data) | Not Started |
| GET | `/api/v1/bulk-upload/uploads` | List bulk uploads with pagination and filters | Not Started |
| GET | `/api/v1/bulk-upload/uploads/:id` | Get upload status and progress | Not Started |
| GET | `/api/v1/bulk-upload/uploads/:id/errors` | Get failed row details for a specific upload | Not Started |
| POST | `/api/v1/bulk-upload/uploads/:id/retry` | Retry failed rows | Not Started |
| DELETE | `/api/v1/bulk-upload/uploads/:id` | Cancel or delete an upload | Not Started |

## Email Ingest Endpoints (Proxied to Email Ingest Service :3157)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/api/v1/email-ingest/parsing-rules` | List email parsing rules | Not Started |
| POST | `/api/v1/email-ingest/parsing-rules` | Create a new email parsing rule | Not Started |
| PUT | `/api/v1/email-ingest/parsing-rules/:id` | Update a parsing rule | Not Started |
| DELETE | `/api/v1/email-ingest/parsing-rules/:id` | Soft-delete a parsing rule | Not Started |
| GET | `/api/v1/email-ingest/processed-emails` | List processed emails | Not Started |
| GET | `/api/v1/email-ingest/processed-emails/:id` | Retrieve full processed email details | Not Started |

## Audit & Dashboard Endpoints (Proxied to Audit Service :3156 / Admin Service :3155)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/api/v1/audit/logs` | Retrieve audit logs with filtering (proxied to Audit Service) | Not Started |
| GET | `/api/v1/dashboard/stats` | Dashboard statistics — aggregated notification metrics (proxied to Admin Service) | Not Started |

## User Management Endpoints (Proxied to Admin Service :3155)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/api/v1/users` | List admin users | Not Started |
| POST | `/api/v1/users` | Create a new admin user | Not Started |
| GET | `/api/v1/users/:id` | Get admin user details | Not Started |
| PUT | `/api/v1/users/:id` | Update admin user (role, active status) | Not Started |
| DELETE | `/api/v1/users/:id` | Deactivate an admin user | Not Started |

## API Key Management Endpoints (Local)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/api/v1/api-keys` | List all API keys (masked, showing only last 8 characters) | Not Started |
| POST | `/api/v1/api-keys` | Create a new API key; returns the full key only once in the response | Not Started |
| PUT | `/api/v1/api-keys/:id` | Update API key metadata (name, scopes, rate limit) | Not Started |
| DELETE | `/api/v1/api-keys/:id` | Revoke an API key | Not Started |
| POST | `/api/v1/api-keys/:id/rotate` | Rotate an API key; issues new key with grace period for old key | Not Started |

## Health Endpoints (Public — No Auth)

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/health` | Liveness probe; returns service status | Not Started |
| GET | `/ready` | Readiness probe; checks database connectivity and downstream service health | Not Started |
