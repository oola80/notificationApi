# 18 — Auth/RBAC Architecture Addendum

**Notification API — Auth/RBAC Decoupling & Architecture Restructuring**

| | |
|---|---|
| **Version:** | 1.0 |
| **Date:** | 2026-02-27 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Table of Contents

1. [Purpose & Scope](#1-purpose--scope)
2. [Motivation for Decoupling](#2-motivation-for-decoupling)
3. [Architectural Changes Summary](#3-architectural-changes-summary)
4. [New Services](#4-new-services)
5. [Removed: Notification Gateway (:3150)](#5-removed-notification-gateway-3150)
6. [Modified: Admin Service](#6-modified-admin-service)
7. [Modified: Notification Admin UI](#7-modified-notification-admin-ui)
8. [Auth Token Flow](#8-auth-token-flow)
9. [JWT Architecture](#9-jwt-architecture)
10. [RS256 Key Distribution](#10-rs256-key-distribution)
11. [Impact on Existing Services](#11-impact-on-existing-services)
12. [Updated Port Table](#12-updated-port-table)
13. [Error Code Prefixes](#13-error-code-prefixes)
14. [Webhook Routing Migration](#14-webhook-routing-migration)

---

## 1. Purpose & Scope

This document is an **addendum** to the existing Notification API architecture documentation. It does not replace any existing design documents but describes a set of structural changes to decouple authentication and RBAC into a standalone multi-application service, remove the BFF gateway layer, and introduce an application launcher for cross-application navigation.

> **Info:** **Addendum, Not Replacement**
>
> Existing design documents (01–17) remain valid for their respective services' internal architecture. This addendum describes the changes to inter-service boundaries, authentication flow, and the addition/removal of services. Refer to the individual service design docs (19, 20, 21) for deep-dive specifications of the new services.

---

## 2. Motivation for Decoupling

The original architecture embedded authentication, user management, and RBAC into two tightly coupled services:

- **notification-gateway** (:3150) — BFF proxy layer that handled JWT issuance, session management, SAML SSO, API key management, RBAC enforcement, rate limiting, and service proxying.
- **admin-service** (:3155) — Owned `admin_users`, `admin_roles`, and `admin_permissions` tables alongside its configuration management responsibilities. Managed user lifecycle, SAML IdP configuration, and role assignment.

This design has several limitations:

1. **Single-application coupling** — Auth and RBAC are hardcoded to the Notification API. Adding a second application (e.g., eCommerce backoffice, inventory management) would require duplicating the entire auth stack or routing all applications through the notification gateway.

2. **BFF overhead** — The gateway proxies every request between the admin UI and backend services, adding latency, a single point of failure, and operational complexity without proportional benefit. The admin UI is the only consumer.

3. **Mixed responsibilities** — The admin-service mixes configuration management (rules, mappings, channels) with user lifecycle management (CRUD, password resets, SAML). These concerns have different change frequencies and scaling requirements.

4. **No multi-application support** — There is no concept of "applications" in the auth model. Roles and permissions are global rather than scoped to specific applications.

---

## 3. Architectural Changes Summary

| Aspect | Before | After |
|--------|--------|-------|
| **Authentication** | notification-gateway issues JWTs | auth-rbac-service-backend issues JWTs (platform + app-scoped) |
| **User Management** | admin-service owns admin_users table | auth-rbac-service-backend owns users table |
| **RBAC** | Gateway enforces roles from admin-service | Each service validates app-scoped JWT claims locally |
| **SAML SSO** | notification-gateway handles SAML flows | Removed (future consideration for auth-rbac-service) |
| **API Gateway** | notification-gateway proxies all requests | Removed — frontends connect directly to backend services |
| **Rate Limiting** | notification-gateway sliding window | Moved to infrastructure reverse proxy (e.g., Nginx, API Gateway) |
| **Admin UI Backend** | notification-gateway (:3150) | admin-service (:3155) directly |
| **Auth Admin UI** | Part of notification-admin-ui | Separate auth-rbac-service-frontend (:3161) |
| **Login Portal** | notification-admin-ui login page | ecommerce-backoffice (:3162) |
| **Application Scope** | Single-application (Notification API) | Multi-application platform |

---

## 4. New Services

Three new services are introduced:

| Service | Port | Technology | DB Schema | Purpose |
|---------|------|-----------|-----------|---------|
| auth-rbac-service-backend | 3160 | NestJS (TypeScript) | `auth_rbac_service_backend` | Multi-application authentication, user management, RBAC, JWT issuance |
| auth-rbac-service-frontend | 3161 | Next.js 14 (TypeScript) | None | Admin UI for managing users, roles, permissions, and applications |
| ecommerce-backoffice | 3162 | Next.js 14 (TypeScript) | None | Login portal and application launcher with app-scoped token redirect |

See the dedicated design documents for each:
- [19 — Auth RBAC Service Backend](19-auth-rbac-service-backend.md)
- [20 — Auth RBAC Service Frontend](20-auth-rbac-service-frontend.md)
- [21 — eCommerce Backoffice](21-ecommerce-backoffice.md)

---

## 5. Removed: Notification Gateway (:3150)

The notification-gateway service is **deprecated and removed**. Its responsibilities are redistributed as follows:

| Gateway Responsibility | New Owner | Notes |
|------------------------|-----------|-------|
| JWT authentication (login, refresh, logout) | auth-rbac-service-backend (:3160) | Platform + app-scoped tokens |
| SAML SSO (login, ACS, metadata, SLO) | Removed | Future consideration for auth-rbac-service |
| RBAC enforcement | Each backend service | Local JWT claim validation using RS256 public key |
| Rate limiting | Infrastructure reverse proxy | Nginx, AWS API Gateway, or similar |
| Service proxying | Removed | Frontends connect directly to backend services |
| API key management | Removed | Future consideration if external API access is needed |
| Request validation | Each backend service | Already implemented via DtoValidationPipe |
| Response envelope transformation | Removed | Services return responses directly |
| CORS configuration | Each backend service | Already configured in main.ts |
| Webhook routing (provider callbacks) | Infrastructure reverse proxy | Routes `/webhooks/{provider}` to adapter services |

> **Info:** **No Code Deletion Required**
>
> The notification-gateway folder has no application code (only CLAUDE.md, dbscripts/, docs/). Marking it as deprecated in documentation is sufficient. The folder and design documents are preserved for historical reference.

---

## 6. Modified: Admin Service

The admin-service (:3155) is simplified by removing all user management, SAML, and authentication responsibilities:

### Removed from Admin Service

| Responsibility | Moved To |
|----------------|----------|
| User management CRUD (admin_users) | auth-rbac-service-backend |
| Role assignment | auth-rbac-service-backend |
| Permission management | auth-rbac-service-backend |
| SAML IdP management | Removed |
| Password reset triggers | auth-rbac-service-backend |
| Database tables: admin_users, admin_roles, admin_permissions | auth-rbac-service-backend |

### Added to Admin Service

| Responsibility | Description |
|----------------|-------------|
| JWT validation guard | Validates app-scoped JWTs from auth-rbac-service-backend using RS256 public key. Extracts roles/permissions from JWT claims for endpoint-level authorization. |

### Retained (Unchanged)

- Notification rule management (proxied to notification-engine-service)
- Event mapping management (proxied to event-ingestion-service)
- Template management delegation (proxied to template-service)
- Channel configuration management (proxied to channel-router-service)
- Recipient group management
- System configuration (system_configs table)
- Dashboard data aggregation
- RabbitMQ config invalidation publishing
- Audit log proxy

---

## 7. Modified: Notification Admin UI

The notification-admin-ui (:3159) changes its API backend:

| Aspect | Before | After |
|--------|--------|-------|
| API Backend | notification-gateway (:3150) | admin-service (:3155) |
| API Base URL | `/api/v1/*` via gateway | Direct to admin-service endpoints |
| Authentication | Gateway-managed JWT sessions | App-scoped JWT from ecommerce-backoffice redirect |
| Login Flow | In-app login page → gateway `/auth/login` | Redirect to ecommerce-backoffice → app-scoped token returned |
| User Management Pages | In-app (via gateway → admin-service) | Removed — managed in auth-rbac-service-frontend |

The notification-admin-ui no longer needs its own login page. Users authenticate via the ecommerce-backoffice, which issues an app-scoped JWT and redirects to the notification-admin-ui with the token.

---

## 8. Auth Token Flow

The authentication system uses a two-token model with RS256 asymmetric signing:

### 8.1 Login Flow

```
┌──────────────────────┐     ┌──────────────────────────┐
│  ecommerce-backoffice│     │  auth-rbac-service-backend│
│  :3162               │     │  :3160                    │
└──────────┬───────────┘     └────────────┬──────────────┘
           │                              │
           │  POST /auth/login            │
           │  { email, password }         │
           │─────────────────────────────►│
           │                              │  Validate credentials
           │                              │  bcrypt.compare()
           │                              │  Load user applications
           │                              │
           │  200 OK                      │
           │  { accessToken (platform),   │
           │    user: { id, email, ...},  │
           │    applications: [...] }     │
           │  + Set-Cookie: refreshToken  │
           │◄─────────────────────────────│
           │                              │
```

### 8.2 Application Launch Flow

```
┌──────────────────────┐     ┌──────────────────────────┐     ┌──────────────────┐
│  ecommerce-backoffice│     │  auth-rbac-service-backend│     │  Target App      │
│  :3162               │     │  :3160                    │     │  (e.g., :3159)   │
└──────────┬───────────┘     └────────────┬──────────────┘     └────────┬─────────┘
           │                              │                             │
           │  GET /auth/app-token         │                             │
           │  ?applicationId={id}         │                             │
           │  Authorization: Bearer       │                             │
           │  {platformToken}             │                             │
           │─────────────────────────────►│                             │
           │                              │  Validate platform token    │
           │                              │  Check user-app access      │
           │                              │  Load roles + permissions   │
           │                              │                             │
           │  200 OK                      │                             │
           │  { appToken (app-scoped) }   │                             │
           │◄─────────────────────────────│                             │
           │                              │                             │
           │  Redirect to app frontend    │                             │
           │  {frontendUrl}?token=        │                             │
           │  {appToken}                  │                             │
           │──────────────────────────────────────────────────────────►│
           │                              │                             │
```

### 8.3 Token Validation in Downstream Services

```
┌──────────────────┐     ┌──────────────────────┐     ┌──────────────────────────┐
│  notification-    │     │  admin-service        │     │  auth-rbac-service-backend│
│  admin-ui :3159   │     │  :3155                │     │  :3160                    │
└────────┬─────────┘     └──────────┬────────────┘     └────────────┬──────────────┘
         │                          │                               │
         │  GET /admin/rules        │                               │
         │  Authorization: Bearer   │                               │
         │  {appToken}              │                               │
         │─────────────────────────►│                               │
         │                          │                               │
         │                          │  Validate JWT locally         │
         │                          │  (RS256 public key, no        │
         │                          │   network call to auth svc)   │
         │                          │                               │
         │                          │  Extract roles/permissions    │
         │                          │  from JWT claims              │
         │                          │                               │
         │  200 OK                  │                               │
         │  { rules: [...] }        │                               │
         │◄─────────────────────────│                               │
         │                          │                               │
```

---

## 9. JWT Architecture

### 9.1 Platform Token (Access Token)

Issued at login. Carries user identity and list of accessible applications. Not scoped to any single application.

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "email": "admin@company.com",
  "fullName": "John Admin",
  "type": "platform",
  "applications": [
    { "id": "app-uuid-1", "code": "notification-api", "name": "Notification API" },
    { "id": "app-uuid-2", "code": "inventory-mgmt", "name": "Inventory Management" }
  ],
  "iat": 1709000000,
  "exp": 1709000900
}
```

- **Lifetime:** 15 minutes
- **Algorithm:** RS256
- **Usage:** Authenticate to ecommerce-backoffice, request app-scoped tokens

### 9.2 Application Token (App-Scoped Token)

Issued when launching an application. Scoped to a single application with full role and permission details.

```json
{
  "sub": "550e8400-e29b-41d4-a716-446655440000",
  "email": "admin@company.com",
  "fullName": "John Admin",
  "type": "application",
  "applicationId": "app-uuid-1",
  "applicationCode": "notification-api",
  "roles": ["Admin"],
  "permissions": [
    "rules:read", "rules:write",
    "templates:read", "templates:write",
    "channels:read",
    "users:read"
  ],
  "iat": 1709000000,
  "exp": 1709000900
}
```

- **Lifetime:** 15 minutes
- **Algorithm:** RS256
- **Usage:** Authenticate to downstream backend services (admin-service, etc.)

### 9.3 Refresh Token

- Stored as HTTP-only secure cookie
- **Lifetime:** 7 days
- **Rotation:** Each refresh issues a new refresh token and revokes the old one
- **Replay Detection:** If a revoked token is reused, all tokens in the family are revoked
- **Storage:** Hashed in `refresh_tokens` table with `replaced_by_id` chain

---

## 10. RS256 Key Distribution

The auth-rbac-service-backend generates and manages an RS256 key pair:

- **Private Key:** Used only by auth-rbac-service-backend to sign JWTs. Stored securely (environment variable or secrets manager).
- **Public Key:** Exposed via `GET /auth/public-key` endpoint (JWKS format). Downstream services fetch this key at startup and cache it.

### Key Rotation

- The JWKS endpoint can serve multiple keys with `kid` (Key ID) headers
- During rotation, both old and new keys are served until old tokens expire
- Downstream services refresh cached keys periodically or on `kid` mismatch

### Downstream Validation Pattern

Each backend service validates app-scoped JWTs locally:

1. Extract JWT from `Authorization: Bearer {token}` header
2. Verify RS256 signature using cached public key
3. Check `exp` claim (reject expired tokens)
4. Check `type === "application"` (reject platform tokens)
5. Check `applicationCode` matches the service's registered application
6. Extract `roles` and `permissions` arrays for endpoint-level authorization

No network call to auth-rbac-service-backend is required for validation.

---

## 11. Impact on Existing Services

| Service | Impact | Details |
|---------|--------|---------|
| event-ingestion-service (:3151) | None | Source auth (API key/HMAC) is independent of user auth |
| notification-engine-service (:3152) | None | Internal service — no user-facing endpoints |
| template-service (:3153) | None | Called by admin-service and notification-engine-service, not by UI directly |
| channel-router-service (:3154) | None | Internal service — no user-facing endpoints |
| admin-service (:3155) | **Modified** | Remove user/SAML, add JWT validation guard |
| audit-service (:3156) | Minimal | Update "queried by" references from gateway to admin-service |
| email-ingest-service (:3157) | None | Independent SMTP ingest |
| bulk-upload-service (:3158) | None | Called by admin-service, not by UI directly |
| notification-admin-ui (:3159) | **Modified** | API backend changes from gateway to admin-service |
| notification-gateway (:3150) | **Deprecated** | Entire service removed |
| provider-adapters (:3171-3174) | None | Stateless adapters — no auth dependency |

---

## 12. Updated Port Table

| Service | Port | Status |
|---------|------|--------|
| notification-gateway | 3150 | **Deprecated** |
| event-ingestion-service | 3151 | Active |
| notification-engine-service | 3152 | Active |
| template-service | 3153 | Active |
| channel-router-service | 3154 | Active |
| admin-service | 3155 | Active (modified) |
| audit-service | 3156 | Active |
| email-ingest-service | 3157 | Active |
| bulk-upload-service | 3158 | Active |
| notification-admin-ui | 3159 | Active (modified) |
| **auth-rbac-service-backend** | **3160** | **New** |
| **auth-rbac-service-frontend** | **3161** | **New** |
| **ecommerce-backoffice** | **3162** | **New** |
| provider-adapters (adapter-mailgun) | 3171 | Active |
| provider-adapters (adapter-braze) | 3172 | Active |
| provider-adapters (adapter-whatsapp) | 3173 | Active |
| provider-adapters (adapter-aws-ses) | 3174 | Active |

---

## 13. Error Code Prefixes

Two new error code prefixes are introduced:

| Prefix | Service | Example |
|--------|---------|---------|
| `ARS-` | auth-rbac-service-backend | `ARS-001` (INVALID_CREDENTIALS) |
| `ECB-` | ecommerce-backoffice | `ECB-001` (SESSION_EXPIRED) |

These follow the existing convention of domain-specific prefixes (EIS-, NES-, TS-, CRS-, ADM-, AUD-, EMI-, BUS-).

---

## 14. Webhook Routing Migration

Provider webhook callbacks (Mailgun, Braze, WhatsApp, AWS SES) were previously routed through the notification-gateway. With the gateway removed, webhook routing moves to the infrastructure layer:

### Infrastructure Reverse Proxy Configuration

```
/webhooks/mailgun     →  adapter-mailgun  :3171  /webhooks/inbound
/webhooks/braze       →  adapter-braze    :3172  /webhooks/inbound
/webhooks/whatsapp    →  adapter-whatsapp :3173  /webhooks/inbound
/webhooks/aws-ses     →  adapter-aws-ses  :3174  /webhooks/inbound
```

This can be implemented via:
- **Nginx** location blocks
- **AWS API Gateway** / **ALB** path-based routing rules
- **Kubernetes Ingress** path rules
- **Docker Compose** Traefik labels

Each adapter service already implements its own webhook signature verification (HMAC-SHA256, SNS certificate validation, etc.), so no authentication layer is needed at the proxy level.

---

*Notification API — Auth/RBAC Architecture Addendum v1.0 — Architecture Team — 2026*
