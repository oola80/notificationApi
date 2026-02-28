# 19 — Auth RBAC Service Backend

**Notification API — Auth RBAC Service Backend Deep-Dive**

| | |
|---|---|
| **Version:** | 1.0 |
| **Date:** | 2026-02-27 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [Architecture & Integration Points](#2-architecture--integration-points)
3. [Authentication Flow](#3-authentication-flow)
4. [Password Policy](#4-password-policy)
5. [Application Management](#5-application-management)
6. [User Management](#6-user-management)
7. [Role Management](#7-role-management)
8. [Permission Management](#8-permission-management)
9. [User-Application Access](#9-user-application-access)
10. [JWT Architecture](#10-jwt-architecture)
11. [REST API Endpoints](#11-rest-api-endpoints)
12. [Database Design](#12-database-design)
13. [Sequence Diagrams](#13-sequence-diagrams)
14. [Error Handling](#14-error-handling)
15. [Security Considerations](#15-security-considerations)
16. [Monitoring & Health Checks](#16-monitoring--health-checks)
17. [Configuration](#17-configuration)

---

## 1. Service Overview

The Auth RBAC Service Backend is a standalone multi-application authentication and authorization service. It provides centralized user management, application registration, role-based access control, and JWT token issuance for the entire eCommerce platform. Unlike the previous architecture where auth was embedded in the notification-gateway and admin-service, this service is designed from the ground up to support multiple independent applications, each with their own role and permission models.

| Attribute | Value |
|---|---|
| **Technology** | NestJS (TypeScript) |
| **Port** | `3160` |
| **Schema** | PostgreSQL — `auth_rbac_service_backend` |
| **Dependencies** | PostgreSQL |
| **Source Repo Folder** | `auth-rbac-service-backend/` |

### Responsibilities

1. **Authentication:** Login with email/password, JWT issuance (platform + app-scoped tokens), token refresh with rotation and replay detection, logout, password reset, password change.
2. **Application Management:** Register, update, and deactivate applications that users can access. Each application has its own set of roles and permissions.
3. **User Management:** Full user lifecycle — creation, profile updates, status management (ACTIVE, LOCKED, DEACTIVATED), password management with history tracking.
4. **Role Management:** Define roles per application with hierarchy levels. Supports system roles (non-deletable) and custom roles.
5. **Permission Management:** Define granular permissions per application as resource + action pairs (e.g., `rules:read`, `templates:write`).
6. **User-Application Assignment:** Grant users access to specific applications and assign roles within those applications.
7. **JWT Issuance:** Issue RS256-signed platform tokens (user identity + application list) and application tokens (app-scoped with roles/permissions).
8. **Public Key Distribution:** Expose JWKS endpoint for downstream services to validate JWTs without network calls.

> **Info:** **No RabbitMQ Dependency**
>
> This service is a pure HTTP REST service with no RabbitMQ dependency. All communication is synchronous via REST APIs. This keeps the auth service simple, independently deployable, and free of messaging infrastructure requirements.

---

## 2. Architecture & Integration Points

### Upstream & Downstream Dependencies

| Direction | System | Protocol | Description |
|---|---|---|---|
| **Inbound** | ecommerce-backoffice (:3162) | HTTP/REST (sync) | Login, token refresh, app-token, /me, logout |
| **Inbound** | auth-rbac-service-frontend (:3161) | HTTP/REST (sync) | Application, user, role, permission CRUD |
| **Inbound** | Downstream backend services | HTTP/REST (sync) | `GET /auth/public-key` for JWT validation key |
| **Downstream** | PostgreSQL | TCP | User, application, role, permission data |

### Figure 2.1 — Integration Context

```
┌──────────────────────┐     ┌──────────────────────┐
│  ecommerce-backoffice│     │  auth-rbac-service-   │
│  :3162               │     │  frontend :3161       │
│  Login + App Launcher│     │  User/Role/App Admin  │
└──────────┬───────────┘     └──────────┬────────────┘
           │                            │
           │  Auth endpoints            │  CRUD endpoints
           │  (login, refresh,          │  (applications, users,
           │   app-token, /me)          │   roles, permissions)
           │                            │
           ▼                            ▼
┌─────────────────────────────────────────────────────┐
│              auth-rbac-service-backend :3160         │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Auth     │  │  Users   │  │  Applications    │  │
│  │  Module   │  │  Module  │  │  Module          │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  Roles   │  │  Perms   │  │  User-Access     │  │
│  │  Module  │  │  Module  │  │  Module          │  │
│  └──────────┘  └──────────┘  └──────────────────┘  │
│                                                     │
│  ┌──────────┐  ┌──────────┐                         │
│  │  Crypto  │  │  Health  │                         │
│  │  Module  │  │  Module  │                         │
│  └──────────┘  └──────────┘                         │
│                                                     │
│  PostgreSQL: auth_rbac_service_backend              │
└─────────────────────────────────────────────────────┘
           │
           │  GET /auth/public-key (JWKS)
           ▼
┌──────────────────────────────────────────────────────┐
│  Downstream Backend Services                          │
│  (admin-service, etc.)                                │
│  Validate app-scoped JWTs locally using RS256 public │
│  key — no network call for each request               │
└──────────────────────────────────────────────────────┘
```

---

## 3. Authentication Flow

### 3.1 Login

**Endpoint:** `POST /auth/login`

1. Receive `{ email, password }` credentials
2. Look up user by email (case-insensitive)
3. Check user status — reject if LOCKED (return `locked_until`) or DEACTIVATED
4. Compare password with bcrypt hash (cost factor 12)
5. On failure: increment `failed_login_attempts`, lock if threshold reached (5 failures in 15 minutes → 15-minute lock)
6. On success: reset `failed_login_attempts` to 0, update `last_login_at`
7. Load user's application assignments
8. Issue platform access token (RS256, 15-minute expiry)
9. Issue refresh token (random UUID, 7-day expiry, hashed and stored in `refresh_tokens` table)
10. Return `{ accessToken, user, applications }` with refresh token as HTTP-only secure cookie

### 3.2 Token Refresh

**Endpoint:** `POST /auth/refresh`

1. Extract refresh token from HTTP-only cookie
2. Hash the token and look up in `refresh_tokens` table
3. If token is revoked: **replay detection** — revoke ALL tokens in the family (same `user_id`), return 401
4. If token is expired: return 401
5. Mark current token as revoked, set `replaced_by_id` to new token
6. Issue new platform access token
7. Issue new refresh token (rotation)
8. Return `{ accessToken }` with new refresh token cookie

### 3.3 Logout

**Endpoint:** `POST /auth/logout`

1. Extract refresh token from HTTP-only cookie
2. Mark refresh token as revoked in database
3. Clear refresh token cookie
4. Return 204 No Content

### 3.4 Password Reset

**Endpoint:** `POST /auth/forgot-password`

1. Receive `{ email }`
2. Always return 200 (prevent email enumeration)
3. If user exists: generate a cryptographically random reset token, store hashed token with 1-hour expiry
4. Send password reset email (out-of-band — email sending mechanism TBD)

**Endpoint:** `POST /auth/reset-password`

1. Receive `{ token, newPassword }`
2. Hash token and look up — reject if expired or already used
3. Validate new password against policy (see Section 4)
4. Check password history (last 5 passwords)
5. Hash new password with bcrypt (cost 12)
6. Update user's password, add to password history
7. Revoke all user's refresh tokens (force re-login on all devices)
8. Return 200

### 3.5 Change Password

**Endpoint:** `POST /auth/change-password`

1. Receive `{ currentPassword, newPassword }` (requires valid access token)
2. Verify current password with bcrypt.compare()
3. Validate new password against policy
4. Check password history (last 5)
5. Update password, add to history
6. Revoke all other refresh tokens (keep current session)
7. Return 200

---

## 4. Password Policy

| Rule | Value |
|------|-------|
| Minimum length | 12 characters |
| Complexity | At least 1 uppercase, 1 lowercase, 1 digit, 1 special character |
| Hashing algorithm | bcrypt with cost factor 12 |
| Password history | Last 5 passwords (prevent reuse) |
| Maximum age | 90 days (warn at 75 days) |
| Account lockout threshold | 5 failed attempts within 15 minutes |
| Lockout duration | 15 minutes (auto-unlock) |
| Reset token expiry | 1 hour |

---

## 5. Application Management

Applications represent registered systems that users can access (e.g., "Notification API", "Inventory Management", "Auth RBAC Admin").

### 5.1 Application Entity

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | VARCHAR(100) | Display name (unique) |
| code | VARCHAR(50) | Machine-readable code (unique, e.g., `notification-api`) |
| description | TEXT | Optional description |
| frontendUrl | VARCHAR(500) | URL to redirect to with app-scoped token |
| isActive | BOOLEAN | Whether the application is active |
| createdAt | TIMESTAMPTZ | Creation timestamp |
| updatedAt | TIMESTAMPTZ | Last update timestamp |

### 5.2 Self-Registration

The auth-rbac-service-frontend is itself a registered application in the `applications` table. This means:
- The auth admin UI authenticates through the same flow as any other application
- Users need explicit access to the `auth-rbac-admin` application to manage auth settings
- Roles and permissions for auth administration are managed within the auth application itself

---

## 6. User Management

### 6.1 User Lifecycle States

```
              ┌──────────────────┐
              │     ACTIVE       │
    Create    │  Normal state,   │
   ─────────► │  can login       │
              └────┬────────┬────┘
                   │        │
        5 failed   │        │  Admin action
        logins     │        │
                   ▼        ▼
              ┌──────────┐  ┌──────────────┐
              │  LOCKED  │  │ DEACTIVATED  │
              │  Auto-   │  │ Permanent    │
              │  unlock  │  │ (reversible  │
              │  15 min  │  │  by admin)   │
              └──────────┘  └──────────────┘
```

### 6.2 User Entity

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| email | VARCHAR(255) | Unique, case-insensitive |
| passwordHash | VARCHAR(255) | bcrypt hash (cost 12) |
| fullName | VARCHAR(200) | Display name |
| status | ENUM | ACTIVE, LOCKED, DEACTIVATED |
| failedLoginAttempts | INTEGER | Counter (reset on success) |
| lockedUntil | TIMESTAMPTZ | Auto-unlock timestamp (nullable) |
| passwordChangedAt | TIMESTAMPTZ | Last password change |
| lastLoginAt | TIMESTAMPTZ | Last successful login |
| createdAt | TIMESTAMPTZ | Creation timestamp |
| updatedAt | TIMESTAMPTZ | Last update timestamp |
| createdBy | UUID | Admin who created the user |

---

## 7. Role Management

Roles are defined per application. Each application has its own independent set of roles.

### 7.1 Role Entity

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| applicationId | UUID | FK to applications |
| name | VARCHAR(100) | Role name (unique per application) |
| description | TEXT | Optional description |
| level | INTEGER | Hierarchy level (lower = more powerful, 0 = superadmin) |
| isSystem | BOOLEAN | System role (cannot be deleted) |
| createdAt | TIMESTAMPTZ | Creation timestamp |
| updatedAt | TIMESTAMPTZ | Last update timestamp |

### 7.2 System Roles

Each application is seeded with default system roles that cannot be deleted:

| Role | Level | Description |
|------|-------|-------------|
| Super Admin | 0 | Full access, can manage other admins |
| Admin | 10 | Full operational access, cannot manage Super Admins |
| Operator | 20 | Day-to-day operations (create/edit, no delete or config) |
| Viewer | 30 | Read-only access |

Applications can define additional custom roles with levels between the system roles.

---

## 8. Permission Management

Permissions are defined per application as resource + action pairs.

### 8.1 Permission Entity

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| applicationId | UUID | FK to applications |
| resource | VARCHAR(100) | Resource name (e.g., `rules`, `templates`, `users`) |
| action | VARCHAR(50) | Action (e.g., `read`, `write`, `delete`, `manage`) |
| description | TEXT | Optional description |
| createdAt | TIMESTAMPTZ | Creation timestamp |

Permissions are unique per `(applicationId, resource, action)`.

### 8.2 Role-Permission Mapping

Roles are assigned a set of permissions via the `role_permissions` join table. A role can have any combination of the application's defined permissions.

---

## 9. User-Application Access

Users are granted access to applications via `user_applications`. Within each application assignment, users are given one or more roles via `user_application_roles`.

### 9.1 Access Model

```
User ──(1:N)──► UserApplication ──(1:N)──► UserApplicationRole
                     │                           │
                     │ FK                         │ FK
                     ▼                            ▼
               Application                      Role
                                                  │
                                                  │ (M:N via role_permissions)
                                                  ▼
                                              Permission
```

### 9.2 App Token Generation

When a user requests an app-scoped token (`GET /auth/app-token?applicationId={id}`):

1. Validate platform token
2. Verify user has access to the requested application (check `user_applications`)
3. Load all roles assigned to the user for this application (via `user_application_roles`)
4. Load all permissions for those roles (via `role_permissions`)
5. Deduplicate permissions
6. Issue app-scoped JWT with `roles[]` and `permissions[]` arrays

---

## 10. JWT Architecture

### 10.1 Signing Algorithm

- **Algorithm:** RS256 (RSA Signature with SHA-256)
- **Key Size:** 2048-bit RSA key pair
- **Private Key:** Stored securely, used only by this service for signing
- **Public Key:** Exposed via `GET /auth/public-key` endpoint in JWKS format

### 10.2 Platform Token Claims

```json
{
  "sub": "<user-uuid>",
  "email": "<user-email>",
  "fullName": "<user-full-name>",
  "type": "platform",
  "applications": [
    { "id": "<app-uuid>", "code": "<app-code>", "name": "<app-name>" }
  ],
  "iat": 1709000000,
  "exp": 1709000900
}
```

### 10.3 Application Token Claims

```json
{
  "sub": "<user-uuid>",
  "email": "<user-email>",
  "fullName": "<user-full-name>",
  "type": "application",
  "applicationId": "<app-uuid>",
  "applicationCode": "<app-code>",
  "roles": ["Admin", "Operator"],
  "permissions": ["rules:read", "rules:write", "templates:read"],
  "iat": 1709000000,
  "exp": 1709000900
}
```

### 10.4 JWKS Endpoint

**Endpoint:** `GET /auth/public-key`

Returns the RS256 public key in JWKS (JSON Web Key Set) format:

```json
{
  "keys": [
    {
      "kty": "RSA",
      "kid": "key-2026-02",
      "use": "sig",
      "alg": "RS256",
      "n": "<modulus>",
      "e": "AQAB"
    }
  ]
}
```

### 10.5 App Token Refresh

**Endpoint:** `GET /auth/app-token/refresh`

App-scoped tokens can be refreshed without going through the full app-token flow:

1. Receive current app token (may be near expiry but not yet expired)
2. Validate signature and claims
3. Re-load roles/permissions from database (in case they changed)
4. Issue new app-scoped token with fresh expiry
5. Return `{ appToken }`

---

## 11. REST API Endpoints

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Authenticate with email/password; returns platform token + refresh cookie |
| POST | `/auth/refresh` | Exchange refresh token for new platform token (rotation) |
| POST | `/auth/logout` | Revoke refresh token, clear cookie |
| POST | `/auth/forgot-password` | Request password reset email |
| POST | `/auth/reset-password` | Reset password using token |
| POST | `/auth/change-password` | Change password (authenticated) |
| GET | `/auth/me` | Get current user profile and application list |
| GET | `/auth/app-token` | Issue app-scoped token for a specific application |
| GET | `/auth/app-token/refresh` | Refresh an app-scoped token |
| GET | `/auth/public-key` | JWKS endpoint for RS256 public key |

### Application Management

| Method | Path | Description |
|--------|------|-------------|
| POST | `/applications` | Register a new application |
| GET | `/applications` | List applications with pagination |
| GET | `/applications/:id` | Get application details |
| PUT | `/applications/:id` | Update application |
| DELETE | `/applications/:id` | Deactivate application |
| GET | `/applications/:id/roles` | List roles for an application |
| POST | `/applications/:id/roles` | Create a role for an application |
| PUT | `/applications/:id/roles/:roleId` | Update a role |
| DELETE | `/applications/:id/roles/:roleId` | Delete a role (non-system only) |
| GET | `/applications/:id/permissions` | List permissions for an application |
| POST | `/applications/:id/permissions` | Create a permission for an application |
| DELETE | `/applications/:id/permissions/:permissionId` | Delete a permission |
| PUT | `/applications/:id/roles/:roleId/permissions` | Assign permissions to a role |

### User Management

| Method | Path | Description |
|--------|------|-------------|
| POST | `/users` | Create a new user |
| GET | `/users` | List users with pagination and filtering |
| GET | `/users/:id` | Get user details with application assignments |
| PUT | `/users/:id` | Update user profile or status |
| POST | `/users/:id/reset-password` | Admin-triggered password reset |
| GET | `/users/:id/applications` | List user's application assignments |
| POST | `/users/:id/applications` | Grant user access to an application |
| DELETE | `/users/:id/applications/:appId` | Revoke user's access to an application |
| PUT | `/users/:id/applications/:appId/roles` | Assign roles to user within an application |

### Health & Monitoring

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness probe |
| GET | `/ready` | Readiness probe (DB connectivity) |
| GET | `/metrics` | Prometheus metrics |

---

## 12. Database Design

### 12.1 Entity Relationship Diagram

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│ applications │     │ user_applications│     │    users     │
│──────────────│     │──────────────────│     │──────────────│
│ id (PK)      │◄────│ application_id   │     │ id (PK)      │
│ name (UQ)    │     │ user_id          │────►│ email (UQ)   │
│ code (UQ)    │     │ id (PK)          │     │ password_hash│
│ frontend_url │     │ UNIQUE(user,app) │     │ full_name    │
│ is_active    │     └────────┬─────────┘     │ status       │
│ ...          │              │               │ ...          │
└──────┬───────┘              │               └──────┬───────┘
       │                      │                      │
       │                      ▼                      │
       │         ┌─────────────────────────┐         │
       │         │ user_application_roles  │         │
       │         │─────────────────────────│         │
       │         │ id (PK)                 │         │
       │         │ user_application_id (FK)│         │
       │         │ role_id (FK)            │         │
       │         └────────────┬────────────┘         │
       │                      │                      │
       ▼                      ▼                      │
┌──────────────┐     ┌──────────────┐                │
│    roles     │     │role_permissns│                │
│──────────────│     │──────────────│                │
│ id (PK)      │◄────│ role_id      │                │
│ app_id (FK)  │     │ permission_id│───┐            │
│ name         │     │ PK(role,perm)│   │            │
│ level        │     └──────────────┘   │            │
│ is_system    │                        │            │
│ UQ(app,name) │     ┌──────────────┐   │            │
└──────────────┘     │ permissions  │   │            │
                     │──────────────│   │            │
                     │ id (PK)      │◄──┘            │
                     │ app_id (FK)  │                │
                     │ resource     │                │
                     │ action       │                │
                     │ UQ(app,res,  │                │
                     │    action)   │                │
                     └──────────────┘                │
                                                     │
                     ┌──────────────┐                │
                     │refresh_tokens│                │
                     │──────────────│                │
                     │ id (PK)      │                │
                     │ user_id (FK) │◄───────────────┘
                     │ token_hash   │
                     │ expires_at   │    ┌──────────────────┐
                     │ is_revoked   │    │ password_history  │
                     │ replaced_by  │    │──────────────────│
                     └──────────────┘    │ id (PK)          │
                                         │ user_id (FK)     │
                                         │ password_hash    │
                                         │ created_at       │
                                         └──────────────────┘
```

### 12.2 Table Definitions

#### `applications`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| name | VARCHAR(100) | NOT NULL, UNIQUE |
| code | VARCHAR(50) | NOT NULL, UNIQUE |
| description | TEXT | |
| frontend_url | VARCHAR(500) | NOT NULL |
| is_active | BOOLEAN | NOT NULL, DEFAULT true |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

#### `users`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| email | VARCHAR(255) | NOT NULL, UNIQUE |
| password_hash | VARCHAR(255) | NOT NULL |
| full_name | VARCHAR(200) | NOT NULL |
| status | VARCHAR(20) | NOT NULL, DEFAULT 'ACTIVE', CHECK IN ('ACTIVE', 'LOCKED', 'DEACTIVATED') |
| failed_login_attempts | INTEGER | NOT NULL, DEFAULT 0 |
| locked_until | TIMESTAMPTZ | |
| password_changed_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| last_login_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| created_by | UUID | |

Indexes: `idx_users_email` (email), `idx_users_status` (status)

#### `roles`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| application_id | UUID | NOT NULL, FK → applications(id) |
| name | VARCHAR(100) | NOT NULL |
| description | TEXT | |
| level | INTEGER | NOT NULL, DEFAULT 100 |
| is_system | BOOLEAN | NOT NULL, DEFAULT false |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

Constraints: `UNIQUE(application_id, name)`
Indexes: `idx_roles_application_id` (application_id)

#### `permissions`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| application_id | UUID | NOT NULL, FK → applications(id) |
| resource | VARCHAR(100) | NOT NULL |
| action | VARCHAR(50) | NOT NULL |
| description | TEXT | |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

Constraints: `UNIQUE(application_id, resource, action)`
Indexes: `idx_permissions_application_id` (application_id)

#### `role_permissions`

| Column | Type | Constraints |
|--------|------|-------------|
| role_id | UUID | NOT NULL, FK → roles(id) ON DELETE CASCADE |
| permission_id | UUID | NOT NULL, FK → permissions(id) ON DELETE CASCADE |

Constraints: `PK(role_id, permission_id)`

#### `user_applications`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK → users(id) ON DELETE CASCADE |
| application_id | UUID | NOT NULL, FK → applications(id) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

Constraints: `UNIQUE(user_id, application_id)`
Indexes: `idx_user_applications_user_id` (user_id), `idx_user_applications_application_id` (application_id)

#### `user_application_roles`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_application_id | UUID | NOT NULL, FK → user_applications(id) ON DELETE CASCADE |
| role_id | UUID | NOT NULL, FK → roles(id) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

Constraints: `UNIQUE(user_application_id, role_id)`
Indexes: `idx_user_app_roles_user_application_id` (user_application_id)

#### `refresh_tokens`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK → users(id) ON DELETE CASCADE |
| token_hash | VARCHAR(255) | NOT NULL |
| expires_at | TIMESTAMPTZ | NOT NULL |
| is_revoked | BOOLEAN | NOT NULL, DEFAULT false |
| replaced_by_id | UUID | FK → refresh_tokens(id) |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

Indexes: `idx_refresh_tokens_user_id` (user_id), `idx_refresh_tokens_token_hash` (token_hash), `idx_refresh_tokens_expires_at` (expires_at WHERE is_revoked = false)

#### `password_history`

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK, DEFAULT gen_random_uuid() |
| user_id | UUID | NOT NULL, FK → users(id) ON DELETE CASCADE |
| password_hash | VARCHAR(255) | NOT NULL |
| created_at | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() |

Indexes: `idx_password_history_user_id` (user_id)

---

## 13. Sequence Diagrams

### 13.1 Login Sequence

```
┌────────┐     ┌────────────────────┐     ┌──────────┐
│ Client │     │ auth-rbac-backend  │     │ Database │
└───┬────┘     └─────────┬──────────┘     └────┬─────┘
    │                    │                     │
    │ POST /auth/login   │                     │
    │ {email, password}  │                     │
    │───────────────────►│                     │
    │                    │  SELECT user        │
    │                    │  WHERE email = ?    │
    │                    │────────────────────►│
    │                    │  user row           │
    │                    │◄────────────────────│
    │                    │                     │
    │                    │  bcrypt.compare()   │
    │                    │  (in-process)       │
    │                    │                     │
    │                    │  SELECT apps        │
    │                    │  FROM user_apps     │
    │                    │────────────────────►│
    │                    │  app list           │
    │                    │◄────────────────────│
    │                    │                     │
    │                    │  INSERT refresh     │
    │                    │  token              │
    │                    │────────────────────►│
    │                    │                     │
    │                    │  Sign JWT (RS256)   │
    │                    │                     │
    │ 200 OK             │                     │
    │ {accessToken, user,│                     │
    │  applications}     │                     │
    │ Set-Cookie: refresh│                     │
    │◄───────────────────│                     │
    │                    │                     │
```

### 13.2 App Token Sequence

```
┌────────┐     ┌────────────────────┐     ┌──────────┐
│ Client │     │ auth-rbac-backend  │     │ Database │
└───┬────┘     └─────────┬──────────┘     └────┬─────┘
    │                    │                     │
    │ GET /auth/app-token│                     │
    │ ?applicationId=X   │                     │
    │ Bearer: {platform} │                     │
    │───────────────────►│                     │
    │                    │                     │
    │                    │  Verify JWT (RS256) │
    │                    │  Check type=platform│
    │                    │                     │
    │                    │  SELECT user_app    │
    │                    │  WHERE user=? AND   │
    │                    │  application=?      │
    │                    │────────────────────►│
    │                    │  user_app row       │
    │                    │◄────────────────────│
    │                    │                     │
    │                    │  SELECT roles,      │
    │                    │  permissions        │
    │                    │  (JOIN)             │
    │                    │────────────────────►│
    │                    │  roles + perms      │
    │                    │◄────────────────────│
    │                    │                     │
    │                    │  Sign app JWT       │
    │                    │  (RS256)            │
    │                    │                     │
    │ 200 OK             │                     │
    │ {appToken}         │                     │
    │◄───────────────────│                     │
    │                    │                     │
```

### 13.3 Token Refresh with Replay Detection

```
┌────────┐     ┌────────────────────┐     ┌──────────┐
│ Client │     │ auth-rbac-backend  │     │ Database │
└───┬────┘     └─────────┬──────────┘     └────┬─────┘
    │                    │                     │
    │ POST /auth/refresh │                     │
    │ Cookie: refresh=T1 │                     │
    │───────────────────►│                     │
    │                    │                     │
    │                    │  SELECT token       │
    │                    │  WHERE hash = H(T1) │
    │                    │────────────────────►│
    │                    │  token row          │
    │                    │◄────────────────────│
    │                    │                     │
    │                    │  ┌───────────────┐  │
    │                    │  │ is_revoked?   │  │
    │                    │  │ YES → REPLAY  │  │
    │                    │  │ Revoke ALL    │  │
    │                    │  │ user tokens   │  │
    │                    │  │ Return 401    │  │
    │                    │  │               │  │
    │                    │  │ NO → Continue │  │
    │                    │  └───────────────┘  │
    │                    │                     │
    │                    │  Revoke T1,         │
    │                    │  INSERT T2          │
    │                    │  SET replaced_by=T2 │
    │                    │────────────────────►│
    │                    │                     │
    │ 200 OK             │                     │
    │ {accessToken}      │                     │
    │ Set-Cookie: T2     │                     │
    │◄───────────────────│                     │
    │                    │                     │
```

### 13.4 Password Reset Sequence

```
┌────────┐     ┌────────────────────┐     ┌──────────┐
│ Client │     │ auth-rbac-backend  │     │ Database │
└───┬────┘     └─────────┬──────────┘     └────┬─────┘
    │                    │                     │
    │ POST /auth/        │                     │
    │ forgot-password    │                     │
    │ {email}            │                     │
    │───────────────────►│                     │
    │                    │  Lookup user        │
    │                    │────────────────────►│
    │                    │  user (or null)     │
    │                    │◄────────────────────│
    │                    │                     │
    │ 200 OK (always)    │  If exists:         │
    │◄───────────────────│  Generate token     │
    │                    │  Store hashed token │
    │                    │────────────────────►│
    │                    │  Send email (async) │
    │                    │                     │
    │                    │                     │
    │ POST /auth/        │                     │
    │ reset-password     │                     │
    │ {token, password}  │                     │
    │───────────────────►│                     │
    │                    │  Validate token     │
    │                    │────────────────────►│
    │                    │  token row          │
    │                    │◄────────────────────│
    │                    │                     │
    │                    │  Check pwd history  │
    │                    │────────────────────►│
    │                    │◄────────────────────│
    │                    │                     │
    │                    │  Update password    │
    │                    │  Add to history     │
    │                    │  Revoke all tokens  │
    │                    │────────────────────►│
    │                    │                     │
    │ 200 OK             │                     │
    │◄───────────────────│                     │
    │                    │                     │
```

---

## 14. Error Handling

All errors follow the standardized error response schema:

```json
{
  "code": "ARS-001",
  "details": "INVALID_CREDENTIALS",
  "message": "email or password is incorrect",
  "status": 401
}
```

### Error Codes

| Code | HTTP Status | Details | Message |
|------|-------------|---------|---------|
| ARS-001 | 401 | INVALID_CREDENTIALS | email or password is incorrect |
| ARS-002 | 401 | ACCOUNT_LOCKED | account is locked until {lockedUntil} |
| ARS-003 | 401 | ACCOUNT_DEACTIVATED | account has been deactivated |
| ARS-004 | 401 | TOKEN_EXPIRED | token has expired |
| ARS-005 | 401 | TOKEN_INVALID | token is invalid or malformed |
| ARS-006 | 401 | REFRESH_TOKEN_REVOKED | refresh token has been revoked |
| ARS-007 | 403 | INSUFFICIENT_PERMISSIONS | insufficient permissions for this operation |
| ARS-008 | 403 | NO_APP_ACCESS | user does not have access to this application |
| ARS-009 | 400 | INVALID_BODY | request body validation failed |
| ARS-010 | 400 | PASSWORD_TOO_WEAK | password does not meet complexity requirements |
| ARS-011 | 400 | PASSWORD_RECENTLY_USED | password was used recently (last 5 passwords) |
| ARS-012 | 404 | USER_NOT_FOUND | user not found |
| ARS-013 | 404 | APPLICATION_NOT_FOUND | application not found |
| ARS-014 | 404 | ROLE_NOT_FOUND | role not found |
| ARS-015 | 404 | PERMISSION_NOT_FOUND | permission not found |
| ARS-016 | 409 | EMAIL_ALREADY_EXISTS | a user with this email already exists |
| ARS-017 | 409 | APPLICATION_CODE_EXISTS | an application with this code already exists |
| ARS-018 | 409 | ROLE_NAME_EXISTS | a role with this name already exists in this application |
| ARS-019 | 409 | PERMISSION_EXISTS | this permission already exists in this application |
| ARS-020 | 400 | CANNOT_DELETE_SYSTEM_ROLE | system roles cannot be deleted |
| ARS-021 | 400 | RESET_TOKEN_EXPIRED | password reset token has expired |
| ARS-022 | 400 | RESET_TOKEN_INVALID | password reset token is invalid |
| ARS-023 | 400 | CURRENT_PASSWORD_INCORRECT | current password is incorrect |
| ARS-024 | 400 | APPLICATION_INACTIVE | application is not active |

---

## 15. Security Considerations

1. **Password Hashing:** bcrypt with cost factor 12. Passwords are never stored or logged in plain text.
2. **Refresh Token Storage:** Only the SHA-256 hash of the refresh token is stored. The raw token is returned to the client once and never logged.
3. **Replay Detection:** If a revoked refresh token is reused, the entire token family is revoked (all tokens for that user).
4. **Timing-Safe Comparison:** All token and password comparisons use constant-time comparison to prevent timing attacks.
5. **Email Enumeration Prevention:** `POST /auth/forgot-password` always returns 200 regardless of whether the email exists.
6. **Account Lockout:** 5 failed login attempts in 15 minutes triggers a 15-minute lock. This prevents brute-force attacks while limiting denial-of-service risk.
7. **RS256 Asymmetric Signing:** Private key never leaves the auth service. Downstream services only need the public key.
8. **HTTPS Only:** All tokens are transmitted only over HTTPS. Refresh tokens use `Secure`, `HttpOnly`, `SameSite=Strict` cookie attributes.
9. **CORS:** Strict origin allowlist matching the registered application frontend URLs.

---

## 16. Monitoring & Health Checks

### Health Endpoints

| Endpoint | Type | Checks |
|----------|------|--------|
| `GET /health` | Liveness | Service is running |
| `GET /ready` | Readiness | PostgreSQL connectivity |

### Prometheus Metrics (`GET /metrics`)

| Metric | Type | Description |
|--------|------|-------------|
| `auth_login_total` | Counter | Login attempts (labels: status=success/failure) |
| `auth_login_duration_seconds` | Histogram | Login request duration |
| `auth_token_issued_total` | Counter | Tokens issued (labels: type=platform/application) |
| `auth_token_refresh_total` | Counter | Token refresh attempts (labels: status=success/failure/replay) |
| `auth_password_reset_total` | Counter | Password reset requests |
| `auth_account_locked_total` | Counter | Account lockout events |
| `auth_active_users_gauge` | Gauge | Number of active users |
| `auth_applications_gauge` | Gauge | Number of active applications |
| `http_request_duration_seconds` | Histogram | HTTP request duration (labels: method, path, status) |
| `http_requests_total` | Counter | Total HTTP requests (labels: method, path, status) |

---

## 17. Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | HTTP listen port | `3160` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5433` |
| `DB_NAME` | PostgreSQL database name | `postgres` |
| `DB_SCHEMA` | PostgreSQL schema | `auth_rbac_service_backend` |
| `DB_USER` | PostgreSQL user | `auth_rbac_service_backend_user` |
| `DB_PASSWORD` | PostgreSQL password | *(see .env)* |
| `JWT_PRIVATE_KEY_PATH` | Path to RS256 private key PEM file | `./keys/private.pem` |
| `JWT_PUBLIC_KEY_PATH` | Path to RS256 public key PEM file | `./keys/public.pem` |
| `JWT_ACCESS_TOKEN_EXPIRY` | Platform token expiry | `15m` |
| `JWT_APP_TOKEN_EXPIRY` | App-scoped token expiry | `15m` |
| `JWT_REFRESH_TOKEN_EXPIRY_DAYS` | Refresh token expiry (days) | `7` |
| `BCRYPT_COST_FACTOR` | bcrypt hashing cost | `12` |
| `PASSWORD_HISTORY_COUNT` | Number of previous passwords to check | `5` |
| `PASSWORD_MAX_AGE_DAYS` | Maximum password age (days) | `90` |
| `LOGIN_LOCKOUT_THRESHOLD` | Failed attempts before lockout | `5` |
| `LOGIN_LOCKOUT_WINDOW_MINUTES` | Lockout observation window (minutes) | `15` |
| `LOGIN_LOCKOUT_DURATION_MINUTES` | Lockout duration (minutes) | `15` |

---

*Notification API — Auth RBAC Service Backend v1.0 — Architecture Team — 2026*
