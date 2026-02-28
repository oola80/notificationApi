# Auth RBAC Service Backend — Endpoint Reference

> **Info:** This file tracks all planned REST API endpoints for the Auth RBAC Service Backend (port 3160). Update the **Status** column as endpoints are implemented.

## Authentication

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/auth/login` | Authenticate with email/password; returns platform token + refresh cookie | Not Started |
| POST | `/auth/refresh` | Exchange refresh token for new platform token (rotation + replay detection) | Not Started |
| POST | `/auth/logout` | Revoke refresh token, clear cookie | Not Started |
| POST | `/auth/forgot-password` | Request password reset email (always returns 200) | Not Started |
| POST | `/auth/reset-password` | Reset password using valid reset token | Not Started |
| POST | `/auth/change-password` | Change password for authenticated user (requires current password) | Not Started |
| GET | `/auth/me` | Get current user profile and application list | Not Started |
| GET | `/auth/app-token` | Issue app-scoped JWT for a specific application (query: applicationId) | Not Started |
| GET | `/auth/app-token/refresh` | Refresh an app-scoped token with fresh expiry | Not Started |
| GET | `/auth/public-key` | JWKS endpoint — RS256 public key for downstream JWT validation | Not Started |

## Application Management

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/applications` | Register a new application | Not Started |
| GET | `/applications` | List applications with pagination | Not Started |
| GET | `/applications/:id` | Get application details | Not Started |
| PUT | `/applications/:id` | Update application (name, description, frontend URL, active status) | Not Started |
| DELETE | `/applications/:id` | Deactivate an application | Not Started |

## Application Roles

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/applications/:id/roles` | List roles for an application | Not Started |
| POST | `/applications/:id/roles` | Create a new role for an application | Not Started |
| PUT | `/applications/:id/roles/:roleId` | Update a role (name, description, level) | Not Started |
| DELETE | `/applications/:id/roles/:roleId` | Delete a role (non-system roles only) | Not Started |
| PUT | `/applications/:id/roles/:roleId/permissions` | Assign permissions to a role (replace full set) | Not Started |

## Application Permissions

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/applications/:id/permissions` | List permissions for an application | Not Started |
| POST | `/applications/:id/permissions` | Create a new permission (resource + action pair) | Not Started |
| DELETE | `/applications/:id/permissions/:permissionId` | Delete a permission | Not Started |

## User Management

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| POST | `/users` | Create a new user | Not Started |
| GET | `/users` | List users with pagination and filtering | Not Started |
| GET | `/users/:id` | Get user details with application assignments | Not Started |
| PUT | `/users/:id` | Update user profile or status | Not Started |
| POST | `/users/:id/reset-password` | Admin-triggered password reset | Not Started |

## User-Application Access

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/users/:id/applications` | List user's application assignments with roles | Not Started |
| POST | `/users/:id/applications` | Grant user access to an application | Not Started |
| DELETE | `/users/:id/applications/:appId` | Revoke user's access to an application | Not Started |
| PUT | `/users/:id/applications/:appId/roles` | Assign roles to user within an application | Not Started |

## Health & Monitoring

| Method | Path | Description | Status |
|--------|------|-------------|--------|
| GET | `/health` | Liveness probe; returns service status | Not Started |
| GET | `/ready` | Readiness probe; checks PostgreSQL connectivity | Not Started |
| GET | `/metrics` | Prometheus metrics | Not Started |
