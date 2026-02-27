> *This is a convenience copy. The authoritative version is at `../../docs/13-notification-gateway-v2.md`.*

# 13 — Notification Gateway

**Notification API — Notification Gateway Deep-Dive**

| | |
|---|---|
| **Version:** | 2.0 |
| **Date:** | 2026-02-26 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

> **Note:** This is v2 of the Notification Gateway design, updated for the decoupled provider adapter architecture. The v1 reference is at `13-notification-gateway.md`.

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [Architecture & Integration Points](#2-architecture--integration-points)
3. [Request Processing Pipeline](#3-request-processing-pipeline)
4. [Authentication & Authorization](#4-authentication--authorization)
5. [API Versioning & Routing](#5-api-versioning--routing)
6. [Service Proxy Layer](#6-service-proxy-layer)
7. [Rate Limiting](#7-rate-limiting)
8. [Request Validation](#8-request-validation)
9. [Response Transformation](#9-response-transformation)
10. [CORS Configuration](#10-cors-configuration)
11. [REST API Endpoints](#11-rest-api-endpoints)
12. [Database Design](#12-database-design)
13. [Sequence Diagrams](#13-sequence-diagrams)
14. [Error Handling](#14-error-handling)
15. [Security Considerations](#15-security-considerations)
16. [Monitoring & Health Checks](#16-monitoring--health-checks)
17. [Configuration](#17-configuration)

---

## 1. Service Overview

The Notification Gateway is the Backend-for-Frontend (BFF) and API Gateway for the entire Notification API platform. It is the **single entry point** for the Next.js admin frontend and any external API consumers. All inbound HTTP traffic is routed through this service, which handles cross-cutting concerns — authentication, authorization, request validation, rate limiting, API versioning, and response normalization — before proxying requests to the appropriate internal microservice.

| Attribute | Value |
|---|---|
| **Technology** | NestJS (TypeScript) with `@nestjs/axios` (HttpService), `@nestjs/passport`, `@nestjs/throttler` |
| **Port** | `3150` |
| **Schema** | PostgreSQL — `notification_gateway` |
| **Dependencies** | All internal microservices, Admin Service (auth delegation), Provider Adapter Services (webhook routing), PostgreSQL |
| **Source Repo Folder** | `notification-gateway/` |

### Responsibilities

1. **Authentication & Authorization:** Validates JWT tokens (RS256) on every inbound request. Supports two authentication modes: JWT bearer tokens for admin users (issued after local login or SAML SSO) and API key authentication (`X-API-Key` header) for external source system integrations. Enforces role-based access control (RBAC) with four roles: Super Admin, Admin, Operator, Viewer.
2. **Request Validation:** Leverages NestJS `class-validator` and `class-transformer` to validate and sanitize all incoming request payloads, query parameters, and path parameters before forwarding to downstream services.
3. **Rate Limiting:** Applies configurable per-client and per-endpoint rate limits using a sliding window algorithm backed by an in-memory store (with Redis upgrade path). API key clients and JWT-authenticated users have independent rate limit pools.
4. **API Versioning:** Supports URL-based versioning (`/api/v1/`) with deprecation headers for older versions. All public endpoints are versioned; internal health and readiness endpoints are not.
5. **Service Proxy Layer:** Routes validated requests to the correct internal microservice using NestJS `HttpService` (Axios-based). Implements circuit breakers, timeouts, and retry logic for downstream service calls.
6. **Response Transformation:** Normalizes all downstream service responses into a consistent envelope structure (`{ data, meta, errors }`) regardless of which internal service handled the request.
7. **CORS Configuration:** Manages cross-origin resource sharing policies, allowing the Next.js frontend origin while blocking unauthorized cross-origin requests.
8. **Request Correlation:** Generates or propagates a `X-Correlation-ID` header on every inbound request, passing it to all downstream service calls for end-to-end tracing.
9. **API Key Management:** Stores and validates API keys for external integrations. Keys are scoped to specific endpoint groups and rate-limited independently.
10. **Session Management:** Manages JWT token issuance, refresh token rotation, and session lifecycle for admin users. Delegates credential validation to the Admin Service.
11. **Webhook Routing to Provider Adapters:** Routes inbound provider webhook callbacks (`/webhooks/{provider}`) to the appropriate provider adapter microservice. Each adapter handles its own signature verification and payload parsing.

> **Info:** **BFF Pattern**
>
> The Notification Gateway implements the Backend-for-Frontend (BFF) pattern — the Next.js admin frontend communicates **exclusively** with the gateway and never calls internal services directly. This provides a single security boundary, a consistent API surface, and allows cross-cutting concerns (auth, rate limiting, response shaping) to be handled in one place. Internal service-to-service calls bypass the gateway entirely and use direct HTTP or RabbitMQ.

---

## 2. Architecture & Integration Points

The Notification Gateway sits at the edge layer of the platform, receiving all inbound traffic from the Admin UI and external integrations. It acts as a reverse proxy with intelligence — validating, authenticating, and routing each request to the appropriate compute-layer service.

### Upstream & Downstream Dependencies

| Direction | System | Protocol | Description |
|---|---|---|---|
| **Inbound** | Admin UI (Next.js :3159) | HTTP/REST | All frontend API calls — CRUD operations, dashboard data, notifications, logs |
| **Inbound** | External API Consumers | HTTP/REST | Source system integrations using API key authentication |
| **Inbound** | Provider Webhooks (Mailgun, Braze, WhatsApp/Meta, AWS SES/SNS) | HTTP/REST | Delivery status callbacks from notification providers |
| **Downstream** | Event Ingestion Service :3151 | HTTP/REST (proxy) | Event webhook proxying (`POST /api/v1/events`), event queries |
| **Downstream** | Notification Engine Service :3152 | HTTP/REST (proxy) | Notification CRUD, manual send, rule queries |
| **Downstream** | Template Service :3153 | HTTP/REST (proxy) | Template CRUD, rendering, preview |
| **Downstream** | Channel Router Service :3154 | HTTP/REST (proxy) | Channel config, provider health |
| **Downstream** | Admin Service :3155 | HTTP/REST (proxy + auth) | User management, rule CRUD, SAML IdP config, dashboard metrics, credential validation |
| **Downstream** | Audit Service :3156 | HTTP/REST (proxy) | Audit logs, notification trace, delivery analytics |
| **Downstream** | Email Ingest Service :3157 | HTTP/REST (proxy) | Parsing rule CRUD, processed email queries |
| **Downstream** | Bulk Upload Service :3158 | HTTP/REST (proxy) | File upload proxying, upload status, error retrieval, retry/cancel |
| **Downstream** | adapter-mailgun :3171 | HTTP/REST (proxy) | Mailgun webhook passthrough |
| **Downstream** | adapter-braze :3172 | HTTP/REST (proxy) | Braze webhook/Currents passthrough |
| **Downstream** | adapter-whatsapp :3173 | HTTP/REST (proxy) | WhatsApp/Meta webhook passthrough |
| **Downstream** | adapter-aws-ses :3174 | HTTP/REST (proxy) | AWS SES/SNS notification passthrough |

### Figure 2.1 — Integration Context

```
                    ┌──────────────────────────┐
                    │  Admin UI (Next.js)       │
                    │  :3159                    │
                    │  SSR + SWR fetch          │
                    └────────────┬─────────────┘
                                 │ HTTP/REST (JWT Bearer)
                                 ▼
┌──────────────────┐  ┌─────────────────────────────────────────────────────────────┐
│  External API    │  │                 Notification Gateway                        │
│  Consumers       │──▶                 :3150                                       │
│  (X-API-Key)     │  │                                                             │
└──────────────────┘  │  ┌──────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐  │
                      │  │  Auth    │  │ Validate  │  │  Rate    │  │ Response  │  │
┌──────────────────┐  │  │  Guard   │──▶│  Pipe     │──▶│  Limit  │──▶│ Transform │  │
│  Provider        │──▶  │  (JWT/   │  │ (class-   │  │ (sliding │  │ (envelope │  │
│  Webhooks        │  │  │  API Key)│  │ validator) │  │  window) │  │  { data,  │  │
│  (Mailgun,       │  │  └──────────┘  └───────────┘  └──────────┘  │  meta,    │  │
│   Braze, etc.)   │  │                                              │  errors })│  │
└──────────────────┘  │  PostgreSQL: notification_gateway             └───────────┘  │
                      │  (api_keys, rate_limits, sessions, refresh_tokens)           │
                      └────────────────────────────┬────────────────────────────────┘
                                                   │
                        ┌──────────────────────────┼──────────────────────────┐
                        │           Service Proxy Layer (HttpService/Axios)   │
                        │           Circuit Breaker + Timeout (5s default)    │
                        ▼                          ▼                          ▼
           ┌─────────────────┐      ┌──────────────────┐      ┌──────────────────┐
           │ Event Ingestion │      │ Notification     │      │ Template         │
           │ :3151           │      │ Engine :3152     │      │ Service :3153    │
           └─────────────────┘      └──────────────────┘      └──────────────────┘
                        ▼                          ▼                          ▼
           ┌─────────────────┐      ┌──────────────────┐      ┌──────────────────┐
           │ Channel Router  │      │ Admin Service    │      │ Audit Service    │
           │ :3154           │      │ :3155            │      │ :3156            │
           └─────────────────┘      └──────────────────┘      └──────────────────┘
                        ▼                          ▼
           ┌─────────────────┐      ┌──────────────────┐
           │ Email Ingest    │      │ Bulk Upload      │
           │ :3157           │      │ :3158            │
           └─────────────────┘      └──────────────────┘

           Provider Adapter Services (webhook routing targets)
           ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
           │ adapter-mailgun │  │ adapter-braze   │  │adapter-whatsapp │  │ adapter-aws-ses │
           │ :3171           │  │ :3172           │  │ :3173           │  │ :3174           │
           └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## 3. Request Processing Pipeline

Every inbound HTTP request passes through a 7-step processing pipeline implemented as NestJS middleware, guards, interceptors, and pipes. This pipeline enforces security, validation, and response consistency across all endpoints.

### 3.1 Pipeline Steps

1. **CORS Check:** The CORS middleware evaluates the `Origin` header against the allowlist. Preflight `OPTIONS` requests are handled and returned immediately. Disallowed origins receive a `403 Forbidden`.
2. **Correlation ID:** The `CorrelationIdMiddleware` reads or generates a `X-Correlation-ID` header. If the inbound request carries one, it is preserved; otherwise, a UUIDv4 is generated. The ID is attached to the request context and propagated to all downstream service calls and log entries.
3. **Authentication:** The `AuthGuard` determines the authentication strategy based on the request. Public endpoints (health, SAML metadata) bypass authentication. API key endpoints validate the `X-API-Key` header against the `api_keys` table. All other endpoints require a valid JWT bearer token — the guard verifies the RS256 signature, checks expiry, and extracts user claims.
4. **Authorization:** The `RolesGuard` evaluates whether the authenticated user's role has the required permissions for the target endpoint. Endpoint-to-permission mappings are defined declaratively using `@Roles()` decorators. Insufficient permissions result in `403 Forbidden`.
5. **Rate Limiting:** The `ThrottlerGuard` checks the request against the applicable rate limit pool. API key clients are rate-limited by key ID; JWT users are rate-limited by user ID. Per-endpoint overrides (e.g., stricter limits on auth endpoints) are applied via `@Throttle()` decorators.
6. **Validation:** The NestJS `ValidationPipe` with `class-validator` validates the request body (DTO), query parameters, and path parameters. Invalid payloads receive a `422 Unprocessable Entity` with field-level error details.
7. **Proxy & Transform:** The controller handler invokes the `ServiceProxyService` to forward the validated request to the appropriate internal service. The response is wrapped in the standard envelope format and returned to the caller.

> **Note:** **Webhook Routing Bypass**
>
> Provider webhook endpoints (`POST /webhooks/{provider}`) bypass the full authentication and validation pipeline. These requests originate from external provider systems (Mailgun, Braze, WhatsApp/Meta, AWS SES/SNS) and carry provider-specific signatures. The gateway performs only CORS check and correlation ID assignment before proxying to the target adapter service. Signature verification and payload validation are the responsibility of each adapter service.

### Figure 3.1 — Request Processing Pipeline Flowchart

```
    ┌─────────────────────────────────┐
    │  Inbound HTTP Request            │
    │  (Admin UI or External Client)   │
    └──────────────┬──────────────────┘
                   ▼
    ┌─────────────────────────────────┐
    │  1. CORS Middleware              │
    │  Check Origin against allowlist  │
    └──────────────┬──────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
       Allowed          Blocked
          │                 │
          │                 ▼
          │        ┌────────────────┐
          │        │ 403 Forbidden  │
          │        └────────────────┘
          ▼
    ┌─────────────────────────────────┐
    │  2. Correlation ID Middleware    │
    │  Read or generate UUID           │
    │  Attach to request context       │
    └──────────────┬──────────────────┘
                   ▼
    ┌─────────────────────────────────┐
    │  3. Authentication Guard         │
    │  JWT Bearer / API Key / Public   │
    └──────────────┬──────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
       Valid            Invalid
          │                 │
          │                 ▼
          │        ┌────────────────┐
          │        │ 401 Unauth.    │
          │        └────────────────┘
          ▼
    ┌─────────────────────────────────┐
    │  4. Authorization Guard          │
    │  Role-based permission check     │
    └──────────────┬──────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
       Permitted        Denied
          │                 │
          │                 ▼
          │        ┌────────────────┐
          │        │ 403 Forbidden  │
          │        └────────────────┘
          ▼
    ┌─────────────────────────────────┐
    │  5. Rate Limit Guard             │
    │  Sliding window check            │
    │  (by API key ID or user ID)      │
    └──────────────┬──────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
       Under Limit     Exceeded
          │                 │
          │                 ▼
          │        ┌────────────────────┐
          │        │ 429 Too Many Req.  │
          │        │ Retry-After header │
          │        └────────────────────┘
          ▼
    ┌─────────────────────────────────┐
    │  6. Validation Pipe              │
    │  Body, query, path validation    │
    │  (class-validator DTOs)          │
    └──────────────┬──────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
       Valid            Invalid
          │                 │
          │                 ▼
          │        ┌─────────────────────┐
          │        │ 422 Unprocessable   │
          │        │ Field-level errors  │
          │        └─────────────────────┘
          ▼
    ┌─────────────────────────────────┐
    │  7. Service Proxy + Transform    │
    │  Forward to internal service     │
    │  Wrap response in envelope       │
    └──────────────┬──────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
       Success          Failure
       (2xx)            (4xx/5xx/timeout)
          │                 │
          ▼                 ▼
    ┌──────────────┐  ┌──────────────────┐
    │ { data,      │  │ { data: null,    │
    │   meta,      │  │   meta,          │
    │   errors:    │  │   errors: [...] }│
    │   null }     │  └──────────────────┘
    └──────────────┘
```

---

## 4. Authentication & Authorization

The gateway implements a two-tier authentication model: **JWT bearer tokens** for admin users and **API keys** for external integrations. Both tiers converge on a unified authorization layer that enforces role-based permissions.

### 4.1 JWT Authentication (Admin Users)

Admin users authenticate via local credentials (email/password) or SAML 2.0 SSO with Azure AD — both methods issue platform-managed JWT tokens. The gateway validates JWT tokens on every request using RS256 asymmetric signature verification.

| Aspect | Detail |
|---|---|
| **Algorithm** | RS256 (RSA SHA-256) |
| **Key Management** | Asymmetric keypair — private key for signing (held by gateway), public key for verification (shared with internal services if needed) |
| **Access Token TTL** | 15 minutes (configurable via `JWT_ACCESS_TOKEN_EXPIRY`) |
| **Refresh Token TTL** | 7 days (configurable via `JWT_REFRESH_TOKEN_EXPIRY`) |
| **Refresh Token Storage** | HTTP-only, Secure, SameSite=Strict cookie |
| **Token Rotation** | Refresh tokens are single-use — each refresh invalidates the old token and issues a new one |
| **Replay Detection** | If a previously-used refresh token is presented, all tokens for that user are invalidated (forced re-auth) |

#### JWT Claims Structure

```json
{
  "sub": "uuid-of-admin-user",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "admin",
  "permissions": ["rules:read", "rules:write", "templates:read", "templates:write"],
  "auth_method": "local | saml",
  "idp_id": "uuid-of-idp | null",
  "iat": 1708300800,
  "exp": 1708301700,
  "iss": "notification-api"
}
```

#### JWT Validation Flow

```
    ┌──────────────────────────────────────────────┐
    │  Extract token from Authorization header      │
    │  "Bearer <token>"                             │
    └─────────────────────┬────────────────────────┘
                          ▼
    ┌──────────────────────────────────────────────┐
    │  Verify RS256 signature with public key       │
    └─────────────────────┬────────────────────────┘
                          │
                 ┌────────┴────────┐
                 │                 │
              Valid             Invalid
                 │                 │
                 ▼                 ▼
    ┌────────────────────┐   ┌────────────────┐
    │  Check exp claim   │   │ 401 Invalid    │
    │  (is token expired │   │     signature  │
    │   within clock     │   └────────────────┘
    │   skew tolerance?) │
    └────────┬───────────┘
             │
    ┌────────┴────────┐
    │                 │
  Active           Expired
    │                 │
    ▼                 ▼
    ┌──────────────┐  ┌─────────────────────┐
    │ Check iss    │  │ 401 Token expired   │
    │ claim matches│  │ (client must        │
    │ "notification│  │  use refresh token) │
    │ -api"        │  └─────────────────────┘
    └──────┬───────┘
           │
    ┌──────┴──────┐
    │             │
  Match       Mismatch
    │             │
    ▼             ▼
    ┌──────────┐  ┌─────────────────┐
    │ Check    │  │ 401 Invalid iss │
    │ blacklist│  └─────────────────┘
    │ (revoked │
    │  tokens) │
    └────┬─────┘
         │
    ┌────┴────┐
    │         │
  Active    Revoked
    │         │
    ▼         ▼
    ┌─────────────────┐  ┌──────────────────┐
    │ Attach user     │  │ 401 Token revoked│
    │ claims to       │  └──────────────────┘
    │ request context │
    └─────────────────┘
```

### 4.2 API Key Authentication (External Integrations)

External source systems and third-party integrations authenticate using API keys passed in the `X-API-Key` header. API keys are managed through the Admin Service and stored hashed (SHA-256) in the gateway's `api_keys` table.

| Aspect | Detail |
|---|---|
| **Header** | `X-API-Key` |
| **Storage** | SHA-256 hash in `api_keys` table (raw key shown only at creation time) |
| **Scoping** | Each key is scoped to a set of allowed endpoint patterns (e.g., `/api/v1/events/**`) |
| **Rate Limiting** | Independent per-key rate limits (configurable in `api_keys.rate_limit_per_minute`) |
| **Expiry** | Configurable TTL (default 90 days); expired keys are rejected |
| **Rotation** | New key issued → old key enters a grace period (configurable, default 24 hours) → old key revoked |

#### API Key Validation Flow

```
    ┌────────────────────────────────────┐
    │  Extract X-API-Key header           │
    └──────────────┬─────────────────────┘
                   ▼
    ┌────────────────────────────────────┐
    │  SHA-256 hash the provided key     │
    │  Look up hash in api_keys table    │
    └──────────────┬─────────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
        Found           Not Found
          │                 │
          │                 ▼
          │        ┌────────────────┐
          │        │ 401 Invalid    │
          │        │     API key    │
          │        └────────────────┘
          ▼
    ┌────────────────────────────────────┐
    │  Check is_active and expiry        │
    └──────────────┬─────────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
       Active           Inactive/
          │             Expired
          │                 │
          ▼                 ▼
    ┌──────────────┐  ┌──────────────────┐
    │ Check scope  │  │ 401 Key inactive │
    │ (endpoint    │  │     or expired   │
    │  pattern     │  └──────────────────┘
    │  matches?)   │
    └──────┬───────┘
           │
    ┌──────┴──────┐
    │             │
  Allowed     Denied
    │             │
    ▼             ▼
    ┌─────────────────┐  ┌─────────────────┐
    │ Attach key      │  │ 403 Key not     │
    │ identity to     │  │ authorized for  │
    │ request context │  │ this endpoint   │
    └─────────────────┘  └─────────────────┘
```

### 4.3 Role-Based Access Control (RBAC)

The gateway enforces RBAC using the `@Roles()` decorator on controller methods. The `RolesGuard` inspects the authenticated user's role from JWT claims or the API key's associated role and checks it against the required roles.

| Role | Allowed Operations |
|---|---|
| **[Super Admin]** | Full access: user management, system configuration, IdP management, all CRUD operations, audit logs, bulk operations |
| **[Admin]** | Manage rules, templates, channels, recipient groups, bulk uploads, event mappings. View audit logs. Cannot manage users or system config. |
| **[Operator]** | View and edit templates and rules. View notification logs and upload history. Cannot modify channel configs, manage users, or retry/cancel bulk uploads. |
| **[Viewer]** | Read-only access to dashboards, notification logs, delivery analytics, and upload history. |
| **[API Key]** | Scoped by `allowed_endpoints` pattern. Typically restricted to event submission and notification status queries. |

#### Endpoint-to-Role Mapping

| Endpoint Pattern | Required Role(s) |
|---|---|
| `GET /api/v1/dashboard/*` | Viewer, Operator, Admin, Super Admin |
| `GET /api/v1/notifications/*` | Viewer, Operator, Admin, Super Admin |
| `POST /api/v1/notifications/send` | Operator, Admin, Super Admin |
| `GET /api/v1/templates` | Viewer, Operator, Admin, Super Admin |
| `POST /api/v1/templates` | Operator, Admin, Super Admin |
| `PUT /api/v1/templates/:id` | Operator, Admin, Super Admin |
| `GET /api/v1/rules` | Viewer, Operator, Admin, Super Admin |
| `POST /api/v1/rules` | Admin, Super Admin |
| `PUT /api/v1/rules/:id` | Admin, Super Admin |
| `GET /api/v1/channels` | Viewer, Operator, Admin, Super Admin |
| `PUT /api/v1/channels/:id/config` | Admin, Super Admin |
| `POST /api/v1/bulk-upload/uploads` | Operator, Admin, Super Admin |
| `POST /api/v1/bulk-upload/uploads/:id/retry` | Admin, Super Admin |
| `DELETE /api/v1/bulk-upload/uploads/:id` | Admin, Super Admin |
| `GET /api/v1/audit/logs` | Viewer, Operator, Admin, Super Admin |
| `GET /api/v1/event-mappings` | Operator, Admin, Super Admin |
| `POST /api/v1/event-mappings` | Admin, Super Admin |
| `PUT /api/v1/event-mappings/:id` | Admin, Super Admin |
| `DELETE /api/v1/event-mappings/:id` | Admin, Super Admin |
| `/api/v1/auth/*` | Public (no auth required except `/auth/me`, `/auth/change-password`, `/auth/logout`) |
| `GET /admin/saml/idp` | Super Admin |
| `POST /admin/saml/idp` | Super Admin |
| `PUT /admin/saml/idp/:id` | Super Admin |
| `DELETE /admin/saml/idp/:id` | Super Admin |
| `GET /api/v1/users/*` | Admin, Super Admin |
| `POST /api/v1/users` | Super Admin |
| `POST /webhooks/{provider}` | Public (no auth — provider signature verified by adapter service) |

> **Info:** **Auth Bypass for Internal Services**
>
> Internal service-to-service calls do not pass through the gateway. When the Notification Engine calls the Template Service for rendering, or the Bulk Upload Service calls Event Ingestion, these are direct HTTP calls within the Docker network. Internal calls authenticate using a shared HMAC-based `X-Service-Signature` header. The gateway's auth layer only applies to external-facing traffic.

---

## 5. API Versioning & Routing

### 5.1 Versioning Strategy

The gateway uses **URL-based versioning** — all public API endpoints are prefixed with `/api/v{n}/`. This approach was chosen for its simplicity, discoverability, and compatibility with API documentation tools.

| Aspect | Detail |
|---|---|
| **Current Version** | `v1` |
| **URL Pattern** | `/api/v1/{resource}` |
| **Deprecation** | Deprecated versions return `Sunset` and `Deprecation` headers with the retirement date |
| **Version Lifecycle** | Active → Deprecated (6 months notice) → Retired (returns 410 Gone) |

#### Deprecation Headers (Example)

```
HTTP/1.1 200 OK
Sunset: Sat, 01 Jan 2027 00:00:00 GMT
Deprecation: true
Link: </api/v2/notifications>; rel="successor-version"
```

### 5.2 Route Registry

The gateway maintains a declarative route registry that maps external URL paths to internal service endpoints. This provides a clear, auditable routing table and enables route-level configuration (timeouts, retries, rate limits).

```
    ┌──────────────────────────────────────────────────────────────────────┐
    │                     Route Registry (Simplified)                      │
    ├──────────────────────────────┬─────────────────┬─────────────────────┤
    │  External Path               │ Internal Service│ Internal Path       │
    ├──────────────────────────────┼─────────────────┼─────────────────────┤
    │  /api/v1/notifications/*     │ Engine :3152    │ /notifications/*    │
    │  /api/v1/templates/*         │ Template :3153  │ /templates/*        │
    │  /api/v1/rules/*             │ Admin :3155     │ /admin/rules/*      │
    │  /api/v1/channels/*          │ Admin :3155     │ /admin/channels/*   │
    │  /api/v1/event-mappings/*    │ Admin :3155     │ /event-mappings/*   │
    │  /api/v1/bulk-upload/*       │ Bulk :3158      │ /*                  │
    │  /api/v1/email-ingest/*      │ Email :3157     │ /*                  │
    │  /api/v1/audit/*             │ Audit :3156     │ /audit/*            │
    │  /api/v1/dashboard/*         │ Admin :3155     │ /admin/dashboard/*  │
    │  /api/v1/auth/*              │ Gateway/Admin   │ (local + proxy)     │
    │  /api/v1/users/*             │ Admin :3155     │ /admin/users/*      │
    │  /admin/saml/*               │ Admin :3155     │ /admin/saml/*       │
    └──────────────────────────────┴─────────────────┴─────────────────────┘
```

### 5.3 Webhook Routing to Provider Adapter Services

In the decoupled provider adapter architecture, delivery status webhooks from external notification providers are routed by the gateway directly to the appropriate provider adapter microservice. Each adapter is an independent service responsible for its own webhook signature verification, payload parsing, and status event publishing.

| External Path | Target Service | Target URL |
|---|---|---|
| `POST /webhooks/mailgun` | adapter-mailgun | `http://provider-adapter-mailgun:3171/webhooks/inbound` |
| `POST /webhooks/braze` | adapter-braze | `http://provider-adapter-braze:3172/webhooks/inbound` |
| `POST /webhooks/whatsapp` | adapter-whatsapp | `http://provider-adapter-whatsapp:3173/webhooks/inbound` |
| `POST /webhooks/aws-ses` | adapter-aws-ses | `http://provider-adapter-aws-ses:3174/webhooks/inbound` |

> **Info:** **Webhook Routing Is Configuration Only**
>
> Adding a new webhook route for a new provider adapter is configuration only — a new proxy rule, no code changes. The Gateway does not verify webhook signatures; that responsibility belongs to each adapter service. The gateway proxies the raw request body and all headers unmodified to the target adapter, preserving the original `Content-Type` and any provider-specific headers required for signature verification.

> **Note:** **Auth Endpoints Are Local**
>
> Authentication endpoints (`/api/v1/auth/login`, `/api/v1/auth/refresh`, `/api/v1/auth/logout`) are handled locally by the gateway. The gateway delegates credential validation to the Admin Service via an internal HTTP call but manages token issuance, refresh rotation, and session lifecycle itself. SAML endpoints (`/api/v1/auth/saml/*`) are also handled locally, with assertion validation delegated to the Admin Service for user lookup/creation.

---

## 6. Service Proxy Layer

The Service Proxy Layer is the core routing mechanism that forwards validated requests from the gateway to the appropriate internal microservice. It is implemented as a `ServiceProxyService` that wraps NestJS `HttpService` (Axios) with resilience patterns.

### 6.1 Proxy Behavior

| Aspect | Detail |
|---|---|
| **HTTP Client** | NestJS `HttpService` (Axios-based) with per-service base URLs |
| **Timeout** | Default 5 seconds per request (configurable per route via `PROXY_TIMEOUT_MS`) |
| **Retries** | 1 retry on 502/503/504 with 500ms delay (configurable; no retry on 4xx or timeouts) |
| **Circuit Breaker** | Per-service circuit breaker (5 failures in 60 seconds → open for 30 seconds) |
| **Header Propagation** | `X-Correlation-ID`, `X-User-ID`, `X-User-Role`, `X-Service-Signature` forwarded to downstream |
| **Multipart Forwarding** | For file upload endpoints (`POST /api/v1/bulk-upload/uploads`), the gateway streams the multipart body directly to the downstream service without buffering the entire file in memory |
| **Webhook Passthrough** | For provider webhook endpoints (`POST /webhooks/{provider}`), the gateway proxies the raw body and all headers to the target adapter service without modification |

### 6.2 Circuit Breaker per Service

Each downstream service has an independent circuit breaker to prevent cascading failures when a service is unhealthy.

```
    Circuit Breaker State Machine (per downstream service)

    ┌──────────┐   failure count     ┌──────────┐   cooldown     ┌───────────┐
    │  CLOSED  │──────────────────▶ │   OPEN   │──────────────▶ │ HALF_OPEN │
    │          │   >= threshold      │          │   expires      │           │
    │ (normal) │                     │(fast-fail│                │ (test 1   │
    └──────────┘                     │ all req) │                │  request) │
         ▲                           └──────────┘                └─────┬─────┘
         │                                ▲                           │
         │ success                        │ failure                   │
         │                                │                    ┌──────┴──────┐
         └────────────────────────────────┴────────────────────│  success →  │
                                                               │  CLOSED     │
                                                               │  failure →  │
                                                               │  OPEN       │
                                                               └─────────────┘

    Configuration:
    ┌────────────────────────────┬──────────┐
    │ Parameter                  │ Default  │
    ├────────────────────────────┼──────────┤
    │ Failure threshold          │ 5        │
    │ Failure window             │ 60s      │
    │ Open duration (cooldown)   │ 30s      │
    │ Half-open test count       │ 1        │
    └────────────────────────────┴──────────┘
```

### 6.3 Header Propagation

The gateway attaches contextual headers to every proxied request, enabling downstream services to identify the caller, trace requests, and enforce internal auth.

| Header | Source | Purpose |
|---|---|---|
| `X-Correlation-ID` | Generated or propagated from inbound request | End-to-end request tracing across all services |
| `X-User-ID` | Extracted from JWT `sub` claim or API key owner | Identifies the acting user for audit logging |
| `X-User-Role` | Extracted from JWT `role` claim or API key role | Downstream services can use for secondary authorization |
| `X-Service-Signature` | HMAC-SHA256 of request body with shared secret | Service-to-service authentication |
| `X-Request-Timestamp` | ISO-8601 UTC timestamp of proxy time | Request timing for downstream metrics |
| `Content-Type` | Passed through from inbound request | Preserved for downstream parsing |

---

## 7. Rate Limiting

The gateway implements a multi-layer rate limiting strategy to protect downstream services from abuse, traffic spikes, and accidental flooding.

### 7.1 Rate Limit Architecture

```
    ┌──────────────────────────────────────────────────────┐
    │                    Rate Limiting                      │
    │                                                      │
    │  Layer 1: Global (all requests)                      │
    │  ┌────────────────────────────────────────────────┐  │
    │  │  1,000 requests/minute per IP                  │  │
    │  └────────────────────────────────────────────────┘  │
    │                                                      │
    │  Layer 2: Per-Identity                               │
    │  ┌────────────────────────────────────────────────┐  │
    │  │  JWT Users: 200 requests/minute per user ID    │  │
    │  │  API Keys:  custom per key (api_keys table)    │  │
    │  └────────────────────────────────────────────────┘  │
    │                                                      │
    │  Layer 3: Per-Endpoint (overrides)                   │
    │  ┌────────────────────────────────────────────────┐  │
    │  │  POST /auth/login:  5 failed/15min per account │  │
    │  │  POST /auth/login: 20 requests/min per IP      │  │
    │  │  POST /bulk-upload: 10 requests/hour per user  │  │
    │  │  POST /notifications/send: 60/min per user     │  │
    │  └────────────────────────────────────────────────┘  │
    └──────────────────────────────────────────────────────┘
```

### 7.2 Sliding Window Algorithm

Rate limits use a sliding window counter algorithm stored in memory (with Redis upgrade path for multi-instance deployments). The window slides continuously — unlike fixed windows, this prevents burst allowance at window boundaries.

| Parameter | Value |
|---|---|
| **Algorithm** | Sliding window counter |
| **Storage** | In-memory (default) / Redis (multi-instance) |
| **Window Size** | Per-limit configurable (1 minute, 15 minutes, 1 hour) |
| **Resolution** | 1-second sub-windows |
| **Response Headers** | `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` |

### 7.3 Rate Limit Response

When a rate limit is exceeded, the gateway returns:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 45
X-RateLimit-Limit: 200
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1708301745

{
  "data": null,
  "meta": { "timestamp": "2026-02-21T10:15:00.000Z" },
  "errors": [
    {
      "code": "RATE_LIMIT_EXCEEDED",
      "message": "Rate limit exceeded. Try again in 45 seconds.",
      "retryAfter": 45
    }
  ]
}
```

### 7.4 Rate Limit Configuration Table

| Endpoint / Scope | Limit | Window | Key |
|---|---|---|---|
| Global (all requests) | 1,000 | 1 minute | IP address |
| JWT-authenticated requests | 200 | 1 minute | User ID |
| API key requests | Configurable per key | 1 minute | API key ID |
| `POST /api/v1/auth/login` | 20 | 1 minute | IP address |
| `POST /api/v1/auth/login` (failed attempts) | 5 | 15 minutes | Account email |
| `POST /api/v1/bulk-upload/uploads` | 10 | 1 hour | User ID |
| `POST /api/v1/notifications/send` | 60 | 1 minute | User ID |
| `POST /api/v1/auth/forgot-password` | 3 | 15 minutes | IP address |

---

## 8. Request Validation

The gateway validates all inbound request data before proxying to downstream services, preventing malformed or malicious payloads from reaching internal services.

### 8.1 Validation Strategy

| Layer | Mechanism | What It Validates |
|---|---|---|
| **Path Parameters** | `@Param()` with `ParseUUIDPipe` | UUID format for resource IDs (`:id` parameters) |
| **Query Parameters** | DTO classes with `@Query()` | Pagination (`page`, `limit`), date ranges (`dateFrom`, `dateTo`), enum filters (`status`, `channel`) |
| **Request Body** | DTO classes with `@Body()` | Required fields, type constraints, string length limits, nested object validation, enum values |
| **File Uploads** | `@UseInterceptors(FileInterceptor)` with `FileValidator` | File size (max 10 MB), MIME type (`.xlsx`), extension validation |
| **Headers** | Custom decorators | `X-API-Key` format, `Authorization` bearer token format |

### 8.2 Validation Error Response

```json
{
  "data": null,
  "meta": {
    "timestamp": "2026-02-21T10:15:00.000Z",
    "correlationId": "corr-abc-123"
  },
  "errors": [
    {
      "field": "customerEmail",
      "code": "IS_EMAIL",
      "message": "customerEmail must be a valid email address"
    },
    {
      "field": "channels",
      "code": "IS_NOT_EMPTY",
      "message": "channels must not be empty"
    },
    {
      "field": "templateId",
      "code": "IS_UUID",
      "message": "templateId must be a valid UUID"
    }
  ]
}
```

### 8.3 Common Validation Rules

| Field | Rule | DTO Decorator |
|---|---|---|
| `email` | Valid email format | `@IsEmail()` |
| `page` | Positive integer, default 1 | `@IsOptional()`, `@IsInt()`, `@Min(1)` |
| `limit` | Integer 1-100, default 20 | `@IsOptional()`, `@IsInt()`, `@Min(1)`, `@Max(100)` |
| `dateFrom` / `dateTo` | ISO-8601 date string | `@IsOptional()`, `@IsDateString()` |
| `status` | Enum value from allowed set | `@IsOptional()`, `@IsEnum(StatusEnum)` |
| `channel` | One of: email, sms, whatsapp, push | `@IsOptional()`, `@IsEnum(ChannelEnum)` |
| `templateId` | UUID v4 format | `@IsUUID('4')` |
| Resource `:id` params | UUID v4 format | `ParseUUIDPipe` |
| `password` | Min 12 chars, complexity requirements | `@MinLength(12)`, `@Matches(/regex/)` |

---

## 9. Response Transformation

All responses from downstream services are wrapped in a consistent envelope format by the gateway's `ResponseTransformInterceptor`. This ensures the Admin UI receives a predictable structure regardless of which internal service handled the request.

### 9.1 Response Envelope Structure

```json
{
  "data": { ... },
  "meta": {
    "timestamp": "2026-02-21T10:15:00.000Z",
    "correlationId": "corr-abc-123",
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 147,
      "totalPages": 8
    }
  },
  "errors": null
}
```

| Field | Type | Description |
|---|---|---|
| `data` | `object \| array \| null` | The response payload. `null` on error responses. |
| `meta` | `object` | Response metadata: timestamp, correlation ID, pagination (when applicable) |
| `meta.pagination` | `object \| undefined` | Present only for list endpoints. Contains `page`, `limit`, `total`, `totalPages`. |
| `errors` | `array \| null` | `null` on success. Array of error objects on failure. |

### 9.2 Error Envelope Structure

```json
{
  "data": null,
  "meta": {
    "timestamp": "2026-02-21T10:15:00.000Z",
    "correlationId": "corr-abc-123"
  },
  "errors": [
    {
      "code": "RESOURCE_NOT_FOUND",
      "message": "Template with ID tpl-xyz not found",
      "field": null,
      "details": null
    }
  ]
}
```

### 9.3 HTTP Status Code Mapping

The gateway maps downstream service responses and internal errors to appropriate HTTP status codes:

| Scenario | HTTP Status | Error Code |
|---|---|---|
| Successful response | `200 OK` | N/A |
| Resource created | `201 Created` | N/A |
| Async operation accepted | `202 Accepted` | N/A |
| No content (logout, delete) | `204 No Content` | N/A |
| Validation error | `422 Unprocessable Entity` | `VALIDATION_ERROR` |
| Missing or invalid auth | `401 Unauthorized` | `AUTHENTICATION_REQUIRED` |
| Insufficient permissions | `403 Forbidden` | `INSUFFICIENT_PERMISSIONS` |
| Resource not found | `404 Not Found` | `RESOURCE_NOT_FOUND` |
| Conflict (duplicate) | `409 Conflict` | `RESOURCE_CONFLICT` |
| Rate limit exceeded | `429 Too Many Requests` | `RATE_LIMIT_EXCEEDED` |
| Downstream service error | `502 Bad Gateway` | `UPSTREAM_SERVICE_ERROR` |
| Downstream service timeout | `504 Gateway Timeout` | `UPSTREAM_SERVICE_TIMEOUT` |
| Downstream circuit open | `503 Service Unavailable` | `SERVICE_TEMPORARILY_UNAVAILABLE` |
| Internal gateway error | `500 Internal Server Error` | `INTERNAL_ERROR` |

---

## 10. CORS Configuration

The gateway manages CORS policies to allow the Next.js frontend to communicate while blocking unauthorized cross-origin requests.

### 10.1 CORS Policy

| Setting | Value | Notes |
|---|---|---|
| **Allowed Origins** | Configurable via `CORS_ALLOWED_ORIGINS` | Default: `http://localhost:3159` (development). Production: frontend domain(s). |
| **Allowed Methods** | `GET, POST, PUT, DELETE, PATCH, OPTIONS` | All standard HTTP methods |
| **Allowed Headers** | `Authorization, Content-Type, X-API-Key, X-Correlation-ID, X-Requested-With` | Custom headers used by the platform |
| **Exposed Headers** | `X-Correlation-ID, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset, Retry-After, Sunset, Deprecation` | Headers the frontend JavaScript can read |
| **Credentials** | `true` | Required for HTTP-only refresh token cookies |
| **Max Age** | `86400` (24 hours) | Preflight cache duration |

> **Warning:** **Production CORS**
>
> In production, `CORS_ALLOWED_ORIGINS` must be set to the exact frontend domain(s) — never use `*` with `credentials: true`. Wildcard origins with credentials are rejected by browsers per the CORS specification.

---

## 11. REST API Endpoints

The gateway exposes a unified API surface that the Admin UI and external clients consume. Endpoints are organized by domain and proxied to the appropriate internal service.

### 11.1 Authentication Endpoints (Local)

These endpoints are handled locally by the gateway (not proxied).

**POST** `/api/v1/auth/login`
Authenticate with email and password. Delegates credential validation to Admin Service. Issues JWT access token in response body and sets refresh token as HTTP-only cookie.
- Rate limit: 5 failed attempts per account per 15 minutes; 20 requests per IP per minute
- Request: `{ "email": "string", "password": "string" }`
- Response (200): `{ "data": { "accessToken": "string", "expiresIn": 900, "user": { "id", "email", "name", "role" } }, "meta": {...}, "errors": null }`
- Errors: `401` Invalid credentials, `429` Account locked / rate limited

**POST** `/api/v1/auth/refresh`
Exchange a valid refresh token (from HTTP-only cookie) for a new access token and rotated refresh token.
- Response (200): `{ "data": { "accessToken": "string", "expiresIn": 900 }, "meta": {...}, "errors": null }`
- Errors: `401` Invalid or expired refresh token

**POST** `/api/v1/auth/logout`
Invalidate the current session. Revokes the refresh token and clears the cookie.
- Required role: Authenticated (any)
- Response: `204 No Content`

**POST** `/api/v1/auth/forgot-password`
Request a password reset email. Always returns 200 regardless of whether the email exists (prevents user enumeration).
- Rate limit: 3 requests per IP per 15 minutes
- Request: `{ "email": "string" }`
- Response (200): `{ "data": { "message": "If an account exists, a reset email has been sent." }, "meta": {...}, "errors": null }`

**POST** `/api/v1/auth/reset-password`
Set a new password using a valid reset token.
- Request: `{ "token": "string", "newPassword": "string" }`
- Response (200): `{ "data": { "message": "Password has been reset." }, "meta": {...}, "errors": null }`
- Errors: `400` Invalid/expired token, `422` Password policy violation

**POST** `/api/v1/auth/change-password`
Change password for the currently authenticated user.
- Required role: Authenticated (any, except SAML-only accounts)
- Request: `{ "currentPassword": "string", "newPassword": "string" }`
- Response (200): `{ "data": { "message": "Password changed successfully." }, "meta": {...}, "errors": null }`
- Errors: `400` Current password incorrect, `403` SAML-only account, `422` Password policy violation

**GET** `/api/v1/auth/me`
Returns the currently authenticated user's profile and permissions.
- Required role: Authenticated (any)
- Response (200): `{ "data": { "id", "email", "fullName", "role", "permissions": [...], "authMethod": "local"|"saml", "lastLoginAt" }, "meta": {...}, "errors": null }`

### 11.2 SAML SSO Endpoints (Local)

**GET** `/api/v1/auth/saml/login`
Initiate SP-initiated SAML SSO flow. Generates AuthnRequest and redirects to IdP.
- Query: `idp` (optional — IdP ID if multiple configured)
- Response: `302 Redirect` to Azure AD

**POST** `/api/v1/auth/saml/acs`
Assertion Consumer Service. Receives SAML Response, validates assertion, issues JWT tokens.
- Request: `application/x-www-form-urlencoded` with `SAMLResponse` and optional `RelayState`
- Response: `302 Redirect` to `/dashboard` with refresh token cookie set
- Errors: `401` Assertion validation failed, `403` User not provisioned and auto-provision disabled

**GET** `/api/v1/auth/saml/metadata`
Returns SP metadata XML for IdP configuration.
- Response (200): `application/xml`

**POST** `/api/v1/auth/saml/slo`
Single Logout endpoint. Receives IdP LogoutRequest, invalidates sessions.
- Request: `application/x-www-form-urlencoded` with `SAMLRequest`
- Response (200): LogoutResponse

See [04 — Authentication & Identity](04-authentication-identity.md) for the complete SAML specification.

### 11.3 Notification Endpoints (Proxied → Notification Engine :3152)

**POST** `/api/v1/notifications/send`
Manually send a notification. Accepts recipient details, template ID, channel preferences, and variable data.
- Required role: Operator, Admin, Super Admin
- Rate limit: 60/minute per user
- Request: `{ "templateId": "uuid", "channels": ["email", "sms"], "recipient": { "email": "string", "phone": "string", "name": "string" }, "data": { ... }, "priority": "normal" | "critical" }`
- Response (202): `{ "data": { "notificationId": "uuid", "status": "PENDING" }, "meta": {...}, "errors": null }`

**GET** `/api/v1/notifications`
List notifications with filters and pagination.
- Required role: Viewer, Operator, Admin, Super Admin
- Query: `status`, `channel`, `dateFrom`, `dateTo`, `recipientEmail`, `eventType`, `page`, `limit`
- Response (200): Paginated notification list

**GET** `/api/v1/notifications/:id`
Retrieve full notification details including lifecycle status log, delivery attempts, and rendered content per channel.
- Required role: Viewer, Operator, Admin, Super Admin
- Response (200): Full notification detail object

**GET** `/api/v1/notifications/:id/trace`
End-to-end notification trace. Returns the complete lifecycle timeline aggregated from all services.
- Required role: Viewer, Operator, Admin, Super Admin
- Proxied to: Audit Service `GET /audit/trace/:notificationId`
- Response (200): Timeline array with stages (EVENT_INGESTED, RULE_MATCHED, TEMPLATE_RENDERED, DELIVERY_ATTEMPTED, DELIVERED, etc.)

### 11.4 Template Endpoints (Proxied → Template Service :3153)

**GET** `/api/v1/templates`
List templates with pagination.
- Required role: Viewer, Operator, Admin, Super Admin
- Query: `channel`, `search`, `isActive`, `page`, `limit`

**POST** `/api/v1/templates`
Create a new template with channel variants.
- Required role: Operator, Admin, Super Admin
- Request: Template creation payload (see [10 — Template Service](10-template-service.md))

**GET** `/api/v1/templates/:id`
Retrieve full template details including channel variants, variables, and version history.
- Required role: Viewer, Operator, Admin, Super Admin

**PUT** `/api/v1/templates/:id`
Update a template. Creates a new immutable version.
- Required role: Operator, Admin, Super Admin

**POST** `/api/v1/templates/:id/render`
Render a template with variable data.
- Required role: Operator, Admin, Super Admin

**POST** `/api/v1/templates/:id/preview`
Preview a template with sample data across all channels.
- Required role: Operator, Admin, Super Admin

### 11.5 Rule Endpoints (Proxied → Admin Service :3155)

**GET** `/api/v1/rules`
List notification rules with pagination and filters.
- Required role: Viewer, Operator, Admin, Super Admin
- Query: `eventType`, `isActive`, `channel`, `page`, `limit`

**POST** `/api/v1/rules`
Create a new notification rule.
- Required role: Admin, Super Admin

**PUT** `/api/v1/rules/:id`
Update an existing rule.
- Required role: Admin, Super Admin

**DELETE** `/api/v1/rules/:id`
Soft-delete a notification rule.
- Required role: Admin, Super Admin

### 11.6 Channel Endpoints (Proxied → Admin Service :3155)

**GET** `/api/v1/channels`
List all notification channels with configuration status, provider details, and health.
- Required role: Viewer, Operator, Admin, Super Admin

**PUT** `/api/v1/channels/:id/config`
Update channel configuration (provider credentials, sender identity).
- Required role: Admin, Super Admin

### 11.7 Event Mapping Endpoints (Proxied → Admin Service :3155)

**GET** `/api/v1/event-mappings`
List event mapping configurations.
- Required role: Operator, Admin, Super Admin
- Query: `sourceId`, `eventType`, `isActive`, `page`, `limit`

**POST** `/api/v1/event-mappings`
Create a new event mapping configuration.
- Required role: Admin, Super Admin

**GET** `/api/v1/event-mappings/:id`
Retrieve full mapping details.
- Required role: Operator, Admin, Super Admin

**PUT** `/api/v1/event-mappings/:id`
Update an event mapping. Increments version.
- Required role: Admin, Super Admin

**DELETE** `/api/v1/event-mappings/:id`
Soft-delete an event mapping.
- Required role: Admin, Super Admin

**POST** `/api/v1/event-mappings/:id/test`
Test a mapping with a sample payload.
- Required role: Admin, Super Admin

### 11.8 Bulk Upload Endpoints (Proxied → Bulk Upload Service :3158)

**POST** `/api/v1/bulk-upload/uploads`
Upload an XLSX file for bulk event submission.
- Required role: Operator, Admin, Super Admin
- Rate limit: 10 uploads/hour per user
- Content-Type: `multipart/form-data`
- Response (202): `{ "data": { "uploadId": "uuid", "fileName": "string", "totalRows": number, "status": "queued" }, "meta": {...}, "errors": null }`

**GET** `/api/v1/bulk-upload/uploads`
List bulk uploads with pagination and filters.
- Required role: Viewer, Operator, Admin, Super Admin
- Query: `status`, `uploadedBy`, `dateFrom`, `dateTo`, `page`, `limit`

**GET** `/api/v1/bulk-upload/uploads/:id`
Get upload status and progress.
- Required role: Viewer, Operator, Admin, Super Admin

**GET** `/api/v1/bulk-upload/uploads/:id/errors`
Get failed row details for a specific upload.
- Required role: Viewer, Operator, Admin, Super Admin

**POST** `/api/v1/bulk-upload/uploads/:id/retry`
Retry failed rows.
- Required role: Admin, Super Admin

**DELETE** `/api/v1/bulk-upload/uploads/:id`
Cancel or delete an upload.
- Required role: Admin, Super Admin

### 11.9 Email Ingest Endpoints (Proxied → Email Ingest Service :3157)

**GET** `/api/v1/email-ingest/parsing-rules`
List email parsing rules.
- Required role: Operator, Admin, Super Admin
- Query: `isActive`, `eventType`, `page`, `limit`

**POST** `/api/v1/email-ingest/parsing-rules`
Create a new email parsing rule.
- Required role: Admin, Super Admin

**PUT** `/api/v1/email-ingest/parsing-rules/:id`
Update a parsing rule.
- Required role: Admin, Super Admin

**DELETE** `/api/v1/email-ingest/parsing-rules/:id`
Soft-delete a parsing rule.
- Required role: Admin, Super Admin

**GET** `/api/v1/email-ingest/processed-emails`
List processed emails.
- Required role: Operator, Admin, Super Admin
- Query: `status`, `sender`, `dateFrom`, `dateTo`, `page`, `limit`

**GET** `/api/v1/email-ingest/processed-emails/:id`
Retrieve full processed email details.
- Required role: Operator, Admin, Super Admin

### 11.10 Audit & Dashboard Endpoints (Proxied → Audit Service :3156 / Admin Service :3155)

**GET** `/api/v1/audit/logs`
Retrieve audit logs with filtering.
- Required role: Viewer, Operator, Admin, Super Admin
- Query: `action`, `userId`, `resourceType`, `dateFrom`, `dateTo`, `page`, `limit`
- Proxied to: Audit Service `GET /audit/logs`

**GET** `/api/v1/dashboard/stats`
Dashboard statistics — aggregated notification metrics.
- Required role: Viewer, Operator, Admin, Super Admin
- Proxied to: Admin Service `GET /admin/dashboard`

### 11.11 User Management Endpoints (Proxied → Admin Service :3155)

**GET** `/api/v1/users`
List admin users.
- Required role: Admin, Super Admin

**POST** `/api/v1/users`
Create a new admin user.
- Required role: Super Admin

**GET** `/api/v1/users/:id`
Get admin user details.
- Required role: Admin, Super Admin

**PUT** `/api/v1/users/:id`
Update admin user (role, active status).
- Required role: Super Admin

**DELETE** `/api/v1/users/:id`
Deactivate an admin user.
- Required role: Super Admin

### 11.12 API Key Management Endpoints (Local)

**GET** `/api/v1/api-keys`
List all API keys (masked, showing only last 8 characters).
- Required role: Admin, Super Admin

**POST** `/api/v1/api-keys`
Create a new API key. Returns the full key **only once** in the response.
- Required role: Super Admin
- Request: `{ "name": "string", "allowedEndpoints": ["string"], "rateLimitPerMinute": number, "expiresAt": "ISO-8601" }`
- Response (201): `{ "data": { "id": "uuid", "key": "napi_live_...", "name": "string", "expiresAt": "..." }, "meta": {...}, "errors": null }`

**PUT** `/api/v1/api-keys/:id`
Update API key metadata (name, scopes, rate limit). Cannot change the key value.
- Required role: Super Admin

**DELETE** `/api/v1/api-keys/:id`
Revoke an API key.
- Required role: Super Admin

**POST** `/api/v1/api-keys/:id/rotate`
Rotate an API key. Issues a new key and places the old key in a grace period (default 24 hours).
- Required role: Super Admin
- Response (200): `{ "data": { "id": "uuid", "newKey": "napi_live_...", "oldKeyExpiresAt": "..." }, "meta": {...}, "errors": null }`

### 11.13 Webhook Endpoints (Proxied → Provider Adapter Services)

Provider webhook endpoints receive delivery status callbacks from external notification providers. These endpoints bypass the standard authentication pipeline — each adapter service is responsible for verifying its provider's webhook signatures.

**POST** `/webhooks/mailgun`
Proxied to adapter-mailgun :3171 at `/webhooks/inbound`.
- Auth: None (HMAC-SHA256 signature verified by adapter)

**POST** `/webhooks/braze`
Proxied to adapter-braze :3172 at `/webhooks/inbound`.
- Auth: None (shared secret header verified by adapter)

**GET** `/webhooks/whatsapp`
Meta webhook verification challenge (GET with `hub.verify_token`). Proxied to adapter-whatsapp :3173 at `/webhooks/inbound`.
- Auth: None (verify token checked by adapter)

**POST** `/webhooks/whatsapp`
Proxied to adapter-whatsapp :3173 at `/webhooks/inbound`.
- Auth: None (X-Hub-Signature-256 verified by adapter)

**POST** `/webhooks/aws-ses`
Proxied to adapter-aws-ses :3174 at `/webhooks/inbound`.
- Auth: None (SNS X.509 signature verified by adapter)

### 11.14 Health Endpoints (Public — No Auth)

**GET** `/health`
Liveness probe. Returns service status.
- Response (200): `{ "status": "ok", "uptime": 3600 }`

**GET** `/ready`
Readiness probe. Checks database connectivity and downstream service health.
- Response (200): `{ "status": "ready", "checks": { "database": "up", "services": { "event-ingestion": "up", "notification-engine": "up", ... }, "adapters": { "adapter-mailgun": "up", "adapter-braze": "up", "adapter-whatsapp": "up", "adapter-aws-ses": "up" } } }`
- Response (503): If any critical dependency is unhealthy.

---

## 12. Database Design

The gateway owns the `notification_gateway` PostgreSQL schema, storing authentication artifacts, API keys, rate limit state, and session data.

### 12.1 Entity Relationship Diagram

```
    notification_gateway — Entity Relationships

    ┌──────────────────────────┐
    │ api_keys                 │
    │──────────────────────────│
    │ PK  id UUID              │
    │     name VARCHAR(255)    │
    │     key_hash VARCHAR(64) │        ┌──────────────────────────┐
    │     key_prefix           │        │ sessions                 │
    │       VARCHAR(12)        │        │──────────────────────────│
    │     allowed_endpoints    │        │ PK  id UUID              │
    │       JSONB              │        │     user_id UUID         │
    │     rate_limit_per_minute│        │     refresh_token_hash   │
    │       INTEGER            │        │       VARCHAR(64)        │
    │     is_active BOOLEAN    │        │     token_family UUID    │
    │     expires_at           │        │     ip_address           │
    │       TIMESTAMPTZ        │        │       VARCHAR(45)        │
    │     last_used_at         │        │     user_agent TEXT      │
    │       TIMESTAMPTZ        │        │     is_revoked BOOLEAN   │
    │     created_by UUID      │        │     expires_at           │
    │     created_at           │        │       TIMESTAMPTZ        │
    │       TIMESTAMPTZ        │        │     created_at           │
    │     updated_at           │        │       TIMESTAMPTZ        │
    │       TIMESTAMPTZ        │        └──────────────────────────┘
    └──────────────────────────┘

    ┌──────────────────────────┐        ┌──────────────────────────┐
    │ rate_limits              │        │ token_blacklist          │
    │──────────────────────────│        │──────────────────────────│
    │ PK  id UUID              │        │ PK  id UUID              │
    │     key VARCHAR(255)     │        │     jti VARCHAR(64)      │
    │     window_start         │        │     expires_at           │
    │       TIMESTAMPTZ        │        │       TIMESTAMPTZ        │
    │     request_count        │        │     revoked_at           │
    │       INTEGER            │        │       TIMESTAMPTZ        │
    │     created_at           │        │     reason VARCHAR(100)  │
    │       TIMESTAMPTZ        │        └──────────────────────────┘
    └──────────────────────────┘
```

### 12.2 Table Specifications

#### `api_keys` — External integration API keys

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | Unique key identifier |
| `name` | VARCHAR(255) | NOT NULL | Human-readable key name (e.g., "OMS Production") |
| `key_hash` | VARCHAR(64) | NOT NULL, UNIQUE | SHA-256 hash of the API key (raw key never stored) |
| `key_prefix` | VARCHAR(12) | NOT NULL | First 8 characters of the key for identification (e.g., "napi_liv") |
| `allowed_endpoints` | JSONB | NOT NULL, DEFAULT '["*"]' | Array of endpoint patterns the key can access (e.g., `["/api/v1/events/**"]`) |
| `rate_limit_per_minute` | INTEGER | NOT NULL, DEFAULT 100 | Per-key rate limit |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT true | Key active status |
| `expires_at` | TIMESTAMPTZ | NULL | Key expiration (null = no expiry) |
| `last_used_at` | TIMESTAMPTZ | NULL | Last time the key was used |
| `created_by` | UUID | NOT NULL | Admin user who created the key |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Last update timestamp |

**Indexes:**
- `idx_api_keys_key_hash` — UNIQUE on `key_hash` (lookup by hash)
- `idx_api_keys_is_active` — Partial on `is_active = true` (filter active keys)
- `idx_api_keys_expires_at` — On `expires_at` WHERE `expires_at IS NOT NULL` (expiry cleanup)

#### `sessions` — Refresh token sessions

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | Session identifier |
| `user_id` | UUID | NOT NULL | Admin user ID (references `admin_service.admin_users.id` logically) |
| `refresh_token_hash` | VARCHAR(64) | NOT NULL, UNIQUE | SHA-256 hash of the refresh token |
| `token_family` | UUID | NOT NULL | Token family ID for rotation tracking; all rotated tokens share the same family |
| `ip_address` | VARCHAR(45) | NULL | Client IP at session creation (IPv4 or IPv6) |
| `user_agent` | TEXT | NULL | Client User-Agent at session creation |
| `is_revoked` | BOOLEAN | NOT NULL, DEFAULT false | Whether the session has been revoked |
| `expires_at` | TIMESTAMPTZ | NOT NULL | Session expiry (matches refresh token TTL) |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Session creation timestamp |

**Indexes:**
- `idx_sessions_refresh_token_hash` — UNIQUE on `refresh_token_hash` (token lookup)
- `idx_sessions_user_id` — On `user_id` (find all sessions for a user)
- `idx_sessions_token_family` — On `token_family` (detect replay attacks)
- `idx_sessions_expires_at` — On `expires_at` (cleanup expired sessions)

#### `rate_limits` — Sliding window counters (in-memory primary, DB for persistence)

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | Record identifier |
| `key` | VARCHAR(255) | NOT NULL | Composite key: `{type}:{identifier}:{endpoint}` (e.g., `user:uuid:POST:/api/v1/notifications/send`) |
| `window_start` | TIMESTAMPTZ | NOT NULL | Start of the current sliding window |
| `request_count` | INTEGER | NOT NULL, DEFAULT 0 | Number of requests in this window |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | Record creation timestamp |

**Indexes:**
- `idx_rate_limits_key_window` — UNIQUE on `(key, window_start)` (window lookup)

> **Info:** **In-Memory Primary, DB Secondary**
>
> Rate limit counters are maintained primarily in memory for performance. The `rate_limits` table serves as a fallback for persistence across gateway restarts and as a source for rate limit analytics. In multi-instance deployments, Redis replaces both the in-memory store and this table — the database table is only used in single-instance mode.

#### `token_blacklist` — Revoked JWT access tokens

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK, DEFAULT gen_random_uuid() | Record identifier |
| `jti` | VARCHAR(64) | NOT NULL, UNIQUE | JWT token identifier (from the `jti` claim) |
| `expires_at` | TIMESTAMPTZ | NOT NULL | Token's original expiry (records are cleaned up after this time) |
| `revoked_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | When the token was revoked |
| `reason` | VARCHAR(100) | NULL | Revocation reason (e.g., "logout", "password_change", "admin_revoke") |

**Indexes:**
- `idx_token_blacklist_jti` — UNIQUE on `jti` (fast lookup during JWT validation)
- `idx_token_blacklist_expires_at` — On `expires_at` (cleanup of expired entries)

> **Note:** **Token Blacklist Cleanup**
>
> A scheduled job (`purge_expired_blacklist()`) runs hourly to delete `token_blacklist` entries where `expires_at < NOW()`. Since access tokens have a 15-minute TTL, the blacklist remains small — at most containing tokens revoked in the last 15 minutes.

### 12.3 Database Growth Estimate

| Table | Estimated Rows (Year 1) | Estimated Size | Notes |
|---|---|---|---|
| `api_keys` | ~50-100 | < 1 MB | Low volume; few external integrations |
| `sessions` | ~10,000 active | ~5 MB | Active sessions cleaned on expiry |
| `rate_limits` | ~50,000 windows | ~20 MB | Sliding windows, cleaned periodically |
| `token_blacklist` | ~1,000 active | < 1 MB | Only holds unexpired revoked tokens |
| **Total** | | **< 30 MB active** | Estimated ~1 GB total including historical data |

---

## 13. Sequence Diagrams

### 13.1 Admin UI Login Flow (Local Auth)

```
Admin UI          Gateway :3150           Admin Service :3155        PostgreSQL
   │                    │                        │                        │
   │  POST /auth/login  │                        │                        │
   │  { email, password}│                        │                        │
   │───────────────────▶│                        │                        │
   │                    │                        │                        │
   │                    │  1. Rate limit check    │                        │
   │                    │     (sliding window)    │                        │
   │                    │                        │                        │
   │                    │  POST /admin/auth/      │                        │
   │                    │  validate-credentials   │                        │
   │                    │  { email, password }    │                        │
   │                    │───────────────────────▶│                        │
   │                    │                        │  2. Lookup user         │
   │                    │                        │     by email            │
   │                    │                        │───────────────────────▶│
   │                    │                        │◀───────────────────────│
   │                    │                        │                        │
   │                    │                        │  3. bcrypt compare      │
   │                    │                        │     password_hash       │
   │                    │                        │                        │
   │                    │  { valid: true,         │                        │
   │                    │    user: { id, email,   │                        │
   │                    │    role, permissions }}  │                        │
   │                    │◀───────────────────────│                        │
   │                    │                        │                        │
   │                    │  4. Generate JWT access  │                        │
   │                    │     token (RS256)        │                        │
   │                    │                        │                        │
   │                    │  5. Generate refresh     │                        │
   │                    │     token, hash, store   │                        │
   │                    │     in sessions table    │                        │
   │                    │───────────────────────────────────────────────▶│
   │                    │                        │                        │
   │  200 OK            │                        │                        │
   │  { accessToken,    │                        │                        │
   │    expiresIn, user}│                        │                        │
   │  Set-Cookie:       │                        │                        │
   │    refresh_token   │                        │                        │
   │◀───────────────────│                        │                        │
```

### 13.2 Authenticated API Request Flow (Proxy)

```
Admin UI          Gateway :3150           Downstream Service         PostgreSQL
   │                    │                        │                        │
   │  GET /api/v1/      │                        │                        │
   │  templates?page=1  │                        │                        │
   │  Authorization:    │                        │                        │
   │  Bearer <jwt>      │                        │                        │
   │───────────────────▶│                        │                        │
   │                    │                        │                        │
   │                    │  1. CORS check          │                        │
   │                    │  2. Correlation ID       │                        │
   │                    │     (generate UUID)      │                        │
   │                    │  3. JWT validation       │                        │
   │                    │     (RS256 verify,        │                        │
   │                    │      expiry, issuer,      │                        │
   │                    │      blacklist check)     │                        │
   │                    │  4. Role check           │                        │
   │                    │     (Viewer+ required)    │                        │
   │                    │  5. Rate limit check      │                        │
   │                    │  6. Validate query params │                        │
   │                    │                        │                        │
   │                    │  GET /templates?page=1  │                        │
   │                    │  X-Correlation-ID: ...  │                        │
   │                    │  X-User-ID: ...         │                        │
   │                    │  X-User-Role: viewer    │                        │
   │                    │  X-Service-Signature: ..│                        │
   │                    │───────────────────────▶│                        │
   │                    │                        │  Query templates        │
   │                    │                        │───────────────────────▶│
   │                    │                        │◀───────────────────────│
   │                    │  200 OK                │                        │
   │                    │  { templates: [...],   │                        │
   │                    │    total: 147 }         │                        │
   │                    │◀───────────────────────│                        │
   │                    │                        │                        │
   │                    │  7. Transform response  │                        │
   │                    │     into envelope        │                        │
   │                    │                        │                        │
   │  200 OK            │                        │                        │
   │  { data: [...],    │                        │                        │
   │    meta: {         │                        │                        │
   │      pagination:   │                        │                        │
   │      { page: 1,    │                        │                        │
   │        total: 147 }│                        │                        │
   │    },              │                        │                        │
   │    errors: null }  │                        │                        │
   │◀───────────────────│                        │                        │
```

### 13.3 Token Refresh Flow

```
Admin UI          Gateway :3150                              PostgreSQL
   │                    │                                         │
   │  POST /auth/refresh│                                         │
   │  Cookie:           │                                         │
   │  refresh_token=... │                                         │
   │───────────────────▶│                                         │
   │                    │                                         │
   │                    │  1. Extract refresh token from cookie    │
   │                    │  2. SHA-256 hash the token               │
   │                    │  3. Look up hash in sessions table       │
   │                    │─────────────────────────────────────────▶│
   │                    │                                         │
   │                    │     Session found?                       │
   │                    │◀─────────────────────────────────────────│
   │                    │                                         │
   │                    │  4. Check: is_revoked = false?           │
   │                    │     Check: expires_at > NOW()?           │
   │                    │                                         │
   │                    │  5. Check: was this token already used?  │
   │                    │     (token_family has newer session?)     │
   │                    │─────────────────────────────────────────▶│
   │                    │◀─────────────────────────────────────────│
   │                    │                                         │
   │                    │  ┌─ If replay detected ─────────────┐   │
   │                    │  │ Revoke ALL sessions in this       │   │
   │                    │  │ token_family → 401 Unauthorized   │   │
   │                    │  └───────────────────────────────────┘   │
   │                    │                                         │
   │                    │  6. Mark current session as revoked      │
   │                    │─────────────────────────────────────────▶│
   │                    │                                         │
   │                    │  7. Generate new refresh token           │
   │                    │     Create new session (same family)     │
   │                    │─────────────────────────────────────────▶│
   │                    │                                         │
   │                    │  8. Generate new JWT access token        │
   │                    │                                         │
   │  200 OK            │                                         │
   │  { accessToken,    │                                         │
   │    expiresIn }     │                                         │
   │  Set-Cookie:       │                                         │
   │    refresh_token   │                                         │
   │    (new)           │                                         │
   │◀───────────────────│                                         │
```

### 13.4 API Key Request Flow (External Integration)

```
External Client       Gateway :3150           Event Ingestion :3151
   │                    │                        │
   │  POST /api/v1/     │                        │
   │  events            │                        │
   │  X-API-Key: napi_..│                        │
   │  { sourceId: "oms",│                        │
   │    eventType: ... } │                        │
   │───────────────────▶│                        │
   │                    │                        │
   │                    │  1. CORS check          │
   │                    │  2. Correlation ID       │
   │                    │  3. API key validation   │
   │                    │     (SHA-256 hash →       │
   │                    │      lookup → scope →     │
   │                    │      expiry check)        │
   │                    │  4. Rate limit check      │
   │                    │     (per-key limit)       │
   │                    │  5. Validate request body │
   │                    │                        │
   │                    │  POST /webhooks/events  │
   │                    │  X-Correlation-ID: ...  │
   │                    │  X-Service-Signature: ..│
   │                    │  { sourceId: "oms", ... }│
   │                    │───────────────────────▶│
   │                    │                        │
   │                    │  202 Accepted           │
   │                    │  { eventId: "uuid" }    │
   │                    │◀───────────────────────│
   │                    │                        │
   │  202 Accepted      │                        │
   │  { data: {         │                        │
   │      eventId: "..." │                        │
   │    },              │                        │
   │    meta: {...},    │                        │
   │    errors: null }  │                        │
   │◀───────────────────│                        │
```

### 13.5 Downstream Service Failure (Circuit Breaker)

```
Admin UI          Gateway :3150           Template Service :3153
   │                    │                        │
   │  GET /api/v1/      │                        │
   │  templates         │                        │
   │───────────────────▶│                        │
   │                    │                        │
   │                    │  1-6. Auth, rate limit,  │
   │                    │       validation pass    │
   │                    │                        │
   │                    │  7. Check circuit breaker │
   │                    │     State: CLOSED        │
   │                    │                        │
   │                    │  GET /templates          │
   │                    │───────────────────────▶│
   │                    │                        │  (service down)
   │                    │  ← timeout (5s) ──────│
   │                    │                        │
   │                    │  8. Increment failure    │
   │                    │     counter (now 5/5)    │
   │                    │  9. Circuit → OPEN       │
   │                    │                        │
   │  503 Service       │                        │
   │  Unavailable       │                        │
   │  { errors: [{      │                        │
   │    code: "SERVICE_ │                        │
   │    TEMPORARILY_    │                        │
   │    UNAVAILABLE" }] │                        │
   │  }                 │                        │
   │◀───────────────────│                        │
   │                    │                        │
   │                    │  ── 30s cooldown ──     │
   │                    │                        │
   │  GET /api/v1/      │                        │
   │  templates         │                        │
   │───────────────────▶│                        │
   │                    │                        │
   │                    │  10. Circuit: HALF_OPEN  │
   │                    │      Allow 1 test req    │
   │                    │                        │
   │                    │  GET /templates          │
   │                    │───────────────────────▶│
   │                    │                        │  (service recovered)
   │                    │  200 OK { ... }         │
   │                    │◀───────────────────────│
   │                    │                        │
   │                    │  11. Circuit → CLOSED    │
   │                    │                        │
   │  200 OK            │                        │
   │  { data: [...] }   │                        │
   │◀───────────────────│                        │
```

### 13.6 Provider Webhook Routing Flow

```
Provider (e.g.       Gateway :3150           adapter-mailgun :3171
Mailgun)
   │                    │                        │
   │  POST /webhooks/   │                        │
   │  mailgun           │                        │
   │  Content-Type:     │                        │
   │    application/json│                        │
   │  timestamp: ...    │                        │
   │  token: ...        │                        │
   │  signature: ...    │                        │
   │  { delivery status │                        │
   │    payload }       │                        │
   │───────────────────▶│                        │
   │                    │                        │
   │                    │  1. CORS check (pass)    │
   │                    │  2. Correlation ID        │
   │                    │     (generate UUID)       │
   │                    │  3. Auth: bypass           │
   │                    │     (webhook route)        │
   │                    │                        │
   │                    │  POST /webhooks/inbound │
   │                    │  X-Correlation-ID: ...  │
   │                    │  (all original headers   │
   │                    │   + body preserved)      │
   │                    │───────────────────────▶│
   │                    │                        │
   │                    │                        │  4. Verify provider
   │                    │                        │     signature
   │                    │                        │  5. Parse payload
   │                    │                        │  6. Publish status
   │                    │                        │     to RabbitMQ
   │                    │                        │
   │                    │  200 OK                │
   │                    │◀───────────────────────│
   │                    │                        │
   │  200 OK            │                        │
   │◀───────────────────│                        │
```

---

## 14. Error Handling

The gateway implements a centralized error handling strategy using NestJS exception filters. All errors — whether from authentication, validation, rate limiting, downstream services, or unexpected exceptions — are caught and transformed into the standard response envelope.

### 14.1 Error Categories

| Category | Source | HTTP Status | Handling |
|---|---|---|---|
| **Authentication Errors** | JWT validation, API key lookup | `401` | Clear error message; no credential hints |
| **Authorization Errors** | RBAC guard | `403` | Lists required role(s) without revealing endpoint internals |
| **Validation Errors** | class-validator pipe | `422` | Field-level error array with specific constraint violations |
| **Rate Limit Errors** | Throttler guard | `429` | Includes `Retry-After` header and remaining limit info |
| **Downstream Client Errors** | Internal service returns 4xx | Pass-through | Downstream error response is transformed into gateway envelope |
| **Downstream Server Errors** | Internal service returns 5xx | `502` | Generic upstream error message; details logged (not exposed) |
| **Downstream Timeout** | Axios timeout exceeded | `504` | Gateway timeout message; correlation ID for investigation |
| **Circuit Breaker Open** | Service proxy circuit open | `503` | Service temporarily unavailable; retry-after suggested |
| **Unexpected Errors** | Unhandled exceptions | `500` | Generic error message; full stack trace logged internally |

### 14.2 Error Response Examples

#### Authentication Error (401)

```json
{
  "data": null,
  "meta": { "timestamp": "2026-02-21T10:15:00.000Z", "correlationId": "corr-abc-123" },
  "errors": [{ "code": "AUTHENTICATION_REQUIRED", "message": "Invalid or expired access token" }]
}
```

#### Downstream Timeout (504)

```json
{
  "data": null,
  "meta": { "timestamp": "2026-02-21T10:15:05.000Z", "correlationId": "corr-abc-123" },
  "errors": [{ "code": "UPSTREAM_SERVICE_TIMEOUT", "message": "The request to the upstream service timed out. Please try again.", "service": "template-service" }]
}
```

### 14.3 Error Logging

All errors are logged with structured JSON including:

| Field | Description |
|---|---|
| `correlationId` | Request correlation ID for tracing |
| `errorCode` | Machine-readable error code |
| `httpStatus` | HTTP status code returned to client |
| `path` | Request URL path |
| `method` | HTTP method |
| `userId` | Authenticated user ID (if available) |
| `clientIp` | Client IP address (masked for PII compliance) |
| `downstreamService` | Target service (for proxy errors) |
| `duration` | Request processing time in milliseconds |
| `stack` | Stack trace (only for 5xx errors, never exposed to client) |

---

## 15. Security Considerations

| Concern | Mitigation |
|---|---|
| **JWT Key Security** | RS256 private key stored on filesystem with restricted permissions (600). In production, loaded from a secrets manager (Vault, AWS Secrets Manager). Public key shared with services that need to verify tokens independently. |
| **API Key Storage** | Only SHA-256 hashes stored in the database. Raw keys shown once at creation. Key prefixes (`napi_live_`, `napi_test_`) aid identification without exposing the full key. |
| **Refresh Token Security** | HTTP-only, Secure, SameSite=Strict cookies prevent JavaScript access, CSRF, and cross-site leakage. Token rotation with replay detection invalidates entire token families on compromise. |
| **Rate Limiting Bypass** | Rate limits applied at multiple layers (IP, identity, endpoint) to prevent bypass via different identifiers. Proxy/load balancer must forward `X-Forwarded-For` for accurate IP-based limiting. |
| **Request Smuggling** | Strict HTTP parsing with NestJS/Express defaults. `Content-Length` and `Transfer-Encoding` inconsistencies are rejected. |
| **Header Injection** | All user-supplied header values are sanitized. Internal headers (`X-User-ID`, `X-Service-Signature`) are stripped from inbound requests before being set by the gateway. |
| **Error Information Leakage** | 5xx errors return generic messages. Stack traces, internal service names, and database errors are never exposed to external clients. Downstream error details are logged internally only. |
| **CORS Misconfiguration** | Origins are validated against an explicit allowlist. Dynamic origin reflection is not used. Credentials mode requires specific origin (no wildcard). |
| **Timing Attacks** | API key comparison uses constant-time comparison (`crypto.timingSafeEqual`) after hashing to prevent timing-based key extraction. |
| **Denial of Service** | Request body size limited to 10 MB (configurable). JSON parsing depth limited. Multipart file uploads streamed (not buffered) for bulk upload. Rate limits prevent request flooding. |
| **Webhook Signature Delegation** | The gateway does not verify provider webhook signatures. Each adapter service is responsible for verifying signatures using the provider's recommended mechanism. This prevents the gateway from needing to hold provider-specific secrets. |

---

## 16. Monitoring & Health Checks

### 16.1 Health Check Endpoints

| Endpoint | Type | Checks | Used By |
|---|---|---|---|
| `GET /health` | Liveness | Gateway process is running | Container orchestrator (Docker, K8s) |
| `GET /ready` | Readiness | Database connected, downstream services reachable, adapter services reachable (optional) | Load balancer, container orchestrator |

### 16.2 Readiness Check Details

The readiness probe checks connectivity to all critical downstream services. It can optionally aggregate provider adapter service health status to determine whether webhook routing is available.

```json
{
  "status": "ready",
  "checks": {
    "database": { "status": "up", "latency": "2ms" },
    "services": {
      "event-ingestion": { "status": "up", "latency": "5ms" },
      "notification-engine": { "status": "up", "latency": "3ms" },
      "template-service": { "status": "up", "latency": "4ms" },
      "channel-router": { "status": "up", "latency": "6ms" },
      "admin-service": { "status": "up", "latency": "3ms" },
      "audit-service": { "status": "up", "latency": "4ms" },
      "email-ingest": { "status": "up", "latency": "5ms" },
      "bulk-upload": { "status": "up", "latency": "4ms" }
    },
    "adapters": {
      "adapter-mailgun": { "status": "up", "latency": "4ms" },
      "adapter-braze": { "status": "up", "latency": "3ms" },
      "adapter-whatsapp": { "status": "up", "latency": "5ms" },
      "adapter-aws-ses": { "status": "up", "latency": "4ms" }
    }
  }
}
```

> **Info:** **Adapter Health and Readiness**
>
> The `/ready` endpoint should consider adapter service availability for webhook routing. If an adapter service is unreachable, the gateway can still report overall readiness as `"ready"` (since adapter unavailability does not prevent admin UI or event ingestion traffic), but the specific adapter's status will show as `"down"` in the `adapters` section. This allows monitoring systems to alert on individual adapter outages without blocking gateway traffic.

### 16.3 Monitoring Metrics

| Metric | Type | Description |
|---|---|---|
| `gateway_requests_total` | Counter | Total requests by method, path, and status code |
| `gateway_request_duration_ms` | Histogram | Request processing time (end-to-end including proxy) |
| `gateway_proxy_duration_ms` | Histogram | Downstream service response time by service |
| `gateway_auth_failures_total` | Counter | Authentication failures by type (jwt_invalid, jwt_expired, api_key_invalid, api_key_expired) |
| `gateway_rate_limit_hits_total` | Counter | Rate limit rejections by identity type and endpoint |
| `gateway_validation_errors_total` | Counter | Request validation failures by endpoint |
| `gateway_circuit_breaker_state` | Gauge | Circuit breaker state per downstream service (0=closed, 1=open, 2=half_open) |
| `gateway_circuit_breaker_trips_total` | Counter | Circuit breaker trips (CLOSED→OPEN transitions) by service |
| `gateway_active_sessions` | Gauge | Number of active (non-revoked, non-expired) refresh token sessions |
| `gateway_api_keys_active` | Gauge | Number of active, non-expired API keys |
| `gateway_proxy_retries_total` | Counter | Downstream request retries by service |
| `gateway_proxy_timeouts_total` | Counter | Downstream request timeouts by service |
| `gateway_token_refresh_total` | Counter | Successful token refresh operations |
| `gateway_token_replay_detected_total` | Counter | Refresh token replay detection events (indicates potential compromise) |
| `gateway_webhook_proxy_total` | Counter | Webhook proxy requests by provider adapter and status code |
| `gateway_webhook_proxy_duration_ms` | Histogram | Webhook proxy response time by provider adapter |

---

## 17. Configuration

### 17.1 Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PORT` | Gateway HTTP port | `3150` |
| `NODE_ENV` | Environment (development, staging, production) | `development` |
| `DATABASE_URL` | PostgreSQL connection string for `notification_gateway` schema | `postgresql://notification_gateway_user:***@localhost:5432/notificationapi?schema=notification_gateway` |
| `JWT_PRIVATE_KEY_PATH` | Path to RS256 private key for JWT signing | `./keys/jwt-private.pem` |
| `JWT_PUBLIC_KEY_PATH` | Path to RS256 public key for JWT verification | `./keys/jwt-public.pem` |
| `JWT_ACCESS_TOKEN_EXPIRY` | Access token TTL | `15m` |
| `JWT_REFRESH_TOKEN_EXPIRY` | Refresh token TTL | `7d` |
| `JWT_ISSUER` | JWT `iss` claim value | `notification-api` |
| `JWT_CLOCK_SKEW_SECONDS` | Allowed clock skew for JWT validation | `30` |
| `CORS_ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins | `http://localhost:3159` |
| `CORS_MAX_AGE` | CORS preflight cache duration in seconds | `86400` |
| `RATE_LIMIT_GLOBAL_PER_MINUTE` | Global rate limit per IP | `1000` |
| `RATE_LIMIT_USER_PER_MINUTE` | Per-user rate limit | `200` |
| `RATE_LIMIT_LOGIN_PER_IP` | Login attempts per IP per minute | `20` |
| `RATE_LIMIT_LOGIN_FAILED_MAX` | Max failed login attempts per account | `5` |
| `RATE_LIMIT_LOGIN_LOCKOUT_MINUTES` | Account lockout duration | `15` |
| `RATE_LIMIT_STORE` | Rate limit storage backend (`memory` or `redis`) | `memory` |
| `REDIS_URL` | Redis connection string (when `RATE_LIMIT_STORE=redis`) | `null` |
| `PROXY_TIMEOUT_MS` | Default downstream service timeout | `5000` |
| `PROXY_RETRY_COUNT` | Number of retries on 502/503/504 | `1` |
| `PROXY_RETRY_DELAY_MS` | Delay between retries | `500` |
| `CB_FAILURE_THRESHOLD` | Circuit breaker failure threshold | `5` |
| `CB_FAILURE_WINDOW_MS` | Circuit breaker failure counting window | `60000` |
| `CB_OPEN_DURATION_MS` | Circuit breaker open duration (cooldown) | `30000` |
| `SERVICE_SECRET` | Shared HMAC secret for `X-Service-Signature` | (required) |
| `API_KEY_GRACE_PERIOD_HOURS` | Grace period for rotated API keys | `24` |
| `MAX_REQUEST_BODY_SIZE` | Maximum request body size | `10mb` |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | `info` |
| `SAML_SP_ENTITY_ID` | SAML Service Provider entity ID | `https://notifications.example.com/saml` |
| `SAML_SP_CERT_PATH` | Path to SP signing certificate | `./keys/saml-sp-cert.pem` |
| `SAML_SP_KEY_PATH` | Path to SP private key | `./keys/saml-sp-key.pem` |
| `SAML_CLOCK_SKEW_MS` | Allowed SAML assertion clock skew | `30000` |

### 17.2 Internal Service URLs

| Variable | Description | Default |
|---|---|---|
| `EVENT_INGESTION_URL` | Event Ingestion Service base URL | `http://event-ingestion-service:3151` |
| `NOTIFICATION_ENGINE_URL` | Notification Engine Service base URL | `http://notification-engine-service:3152` |
| `TEMPLATE_SERVICE_URL` | Template Service base URL | `http://template-service:3153` |
| `CHANNEL_ROUTER_URL` | Channel Router Service base URL | `http://channel-router-service:3154` |
| `ADMIN_SERVICE_URL` | Admin Service base URL | `http://admin-service:3155` |
| `AUDIT_SERVICE_URL` | Audit Service base URL | `http://audit-service:3156` |
| `EMAIL_INGEST_URL` | Email Ingest Service base URL | `http://email-ingest-service:3157` |
| `BULK_UPLOAD_URL` | Bulk Upload Service base URL | `http://bulk-upload-service:3158` |

### 17.3 Provider Adapter Service URLs

Webhook routes (`POST /webhooks/{provider}`) target provider adapter services directly. Each adapter is an independent microservice responsible for a single provider's delivery and webhook handling.

| Variable | Description | Default |
|---|---|---|
| `ADAPTER_MAILGUN_URL` | Mailgun adapter service base URL | `http://provider-adapter-mailgun:3171` |
| `ADAPTER_BRAZE_URL` | Braze adapter service base URL | `http://provider-adapter-braze:3172` |
| `ADAPTER_WHATSAPP_URL` | WhatsApp/Meta adapter service base URL | `http://provider-adapter-whatsapp:3173` |
| `ADAPTER_AWS_SES_URL` | AWS SES adapter service base URL | `http://provider-adapter-aws-ses:3174` |

> **Info:** **Adding New Provider Adapters**
>
> To onboard a new notification provider, deploy the new adapter service and add its URL environment variable to the gateway configuration. Then add a new webhook proxy rule mapping `/webhooks/{new-provider}` to the adapter's `/webhooks/inbound` endpoint. No gateway code changes are required.

---

*Notification API Documentation v2.0 -- Architecture Team -- 2026*
