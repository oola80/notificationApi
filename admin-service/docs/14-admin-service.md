---

# 14 — Admin Service

**Notification API — Admin Service Deep-Dive**

| | |
|---|---|
| **Version:** | 1.0 |
| **Date:** | 2026-02-21 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [Architecture & Integration Points](#2-architecture--integration-points)
3. [User Management](#3-user-management)
4. [Role-Based Access Control (RBAC)](#4-role-based-access-control-rbac)
5. [Notification Rule Management](#5-notification-rule-management)
6. [Event Mapping Management](#6-event-mapping-management)
7. [Template Management Delegation](#7-template-management-delegation)
8. [Channel Configuration Management](#8-channel-configuration-management)
9. [Recipient Group Management](#9-recipient-group-management)
10. [System Configuration](#10-system-configuration)
11. [Dashboard Data Aggregation](#11-dashboard-data-aggregation)
12. [RabbitMQ Topology (Config Invalidation)](#12-rabbitmq-topology-config-invalidation)
13. [REST API Endpoints](#13-rest-api-endpoints)
14. [Database Design](#14-database-design)
15. [Sequence Diagrams](#15-sequence-diagrams)
16. [Error Handling](#16-error-handling)
17. [Security Considerations](#17-security-considerations)
18. [Monitoring & Health Checks](#18-monitoring--health-checks)
19. [Configuration](#19-configuration)

---

## 1. Service Overview

The Admin Service is the backoffice administration hub for the Notification API platform. It provides the operative team with a unified management interface for user accounts, notification rules, event mapping configurations, channel settings, recipient groups, and global system configuration. Rather than owning notification processing or delivery logic, the Admin Service acts as the management plane — orchestrating CRUD operations across multiple downstream services and publishing configuration change events via RabbitMQ for cache invalidation in the Event Ingestion Service and Notification Engine Service.

| Attribute | Value |
|---|---|
| **Technology** | NestJS (TypeScript) |
| **Port** | `3155` |
| **Schema** | PostgreSQL — `admin_service` |
| **Dependencies** | Notification Engine (HTTP), Template Service (HTTP), Channel Router (HTTP), Event Ingestion (HTTP), Audit Service (HTTP), RabbitMQ (config invalidation), PostgreSQL |
| **Source Repo Folder** | `admin-service/` |

### Responsibilities

1. **User Management:** Full lifecycle management of admin user accounts — creation, role assignment, password resets, deactivation, and activity tracking. Supports local authentication (bcrypt-hashed passwords) and SAML 2.0 SSO account linking with Azure AD.
2. **RBAC Enforcement:** Defines and manages four predefined roles (Super Admin, Admin, Operator, Viewer) with granular permission matrices. The Gateway enforces RBAC on every request using role claims from JWT tokens issued after authentication.
3. **Notification Rule CRUD:** Provides management endpoints for notification rules stored in the Notification Engine Service. Validates rule configurations (event types, template references, channel availability, suppression settings) before forwarding to the Notification Engine. Publishes rule change events for cache invalidation.
4. **Event Mapping Management:** Provides CRUD and test endpoints for runtime field mapping configurations stored in the Event Ingestion Service. Publishes mapping change events to the `xch.config.events` exchange for cache invalidation in the Event Ingestion Service.
5. **Template Management Delegation:** Proxies all template CRUD, preview, and version management requests to the Template Service. Does not store template data directly — provides a unified API surface through the Gateway.
6. **Channel Configuration Management:** Manages provider credentials, sender identities, and channel-specific settings via the Channel Router Service. Sensitive values (API keys, auth tokens) are encrypted at rest.
7. **Recipient Group Management:** Creates and manages named recipient groups used in notification rules for group-based recipient resolution.
8. **System Configuration:** Manages global platform configuration key-value pairs (retention periods, feature flags, rate limit overrides).
9. **Dashboard Data Aggregation:** Aggregates metrics from multiple services (Notification Engine, Audit Service, Channel Router) to power the admin dashboard — notification volumes, delivery rates, channel breakdown, and failure analysis.
10. **SAML IdP Management:** Manages SAML 2.0 Identity Provider configurations for Azure AD SSO. Handles IdP metadata import, attribute mapping, auto-provisioning settings, and SP metadata generation.
11. **Asynchronous Config Event Publishing:** Publishes configuration change events (mapping updates, rule updates, override updates) to RabbitMQ for cache invalidation in downstream services. Uses fire-and-forget messaging — publishing failures are logged but do not block the admin operation.

> **Info:** **Management Plane, Not Data Plane**
>
> The Admin Service sits outside the notification processing pipeline. It never directly processes events, renders templates, or delivers notifications. Instead, it manages the configuration that controls how those operations behave. This separation means the Admin Service can be deployed, scaled, and maintained independently without affecting the critical notification delivery path.

---

## 2. Architecture & Integration Points

The Admin Service sits in the compute layer alongside other backend services but occupies a unique position — it is the only service that orchestrates configuration changes across multiple downstream services. All admin traffic flows through the Notification Gateway (BFF), which handles authentication and RBAC before proxying to the Admin Service.

### Upstream & Downstream Dependencies

| Direction | System | Protocol | Description |
|---|---|---|---|
| **Inbound** | Notification Gateway :3150 | HTTP/REST (sync) | All admin operations proxied through the Gateway after auth/RBAC |
| **Downstream** | Notification Engine :3152 | HTTP/REST (sync) | Rule CRUD, notification queries, dashboard data, critical override management |
| **Downstream** | Template Service :3153 | HTTP/REST (sync) | Template CRUD, preview, version management (proxied) |
| **Downstream** | Channel Router :3154 | HTTP/REST (sync) | Channel configuration, provider health, delivery metrics |
| **Downstream** | Event Ingestion :3151 | HTTP/REST (sync) | Event mapping CRUD, mapping test, source registration |
| **Downstream** | Audit Service :3156 | HTTP/REST (sync) | Audit log queries, notification trace, analytics data |
| **Downstream** | RabbitMQ | AMQP (async) | Config change events for cache invalidation in downstream services |

### Figure 2.1 — Integration Context

```
┌──────────────────────────┐
│  Admin UI :3159           │
│  All management pages     │
└───────────┬──────────────┘
            │ HTTP (all admin ops)
            ▼
┌──────────────────────────┐
│  Notification Gateway    │
│  :3150 (BFF)             │
│  Auth · RBAC · Rate Limit│
└───────────┬──────────────┘
            │ HTTP proxy
            ▼
┌────────────────────────────────────────────────────────────────────┐
│                       Admin Service :3155                           │
│                                                                    │
│  ┌────────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │  User       │  │  Rule        │  │  Event Mapping            │  │
│  │  Management │  │  Management  │  │  Management               │  │
│  │  (Local)    │  │  (Proxy)     │  │  (Proxy + Cache Invalidate│) │
│  └────────────┘  └──────────────┘  └───────────────────────────┘  │
│                                                                    │
│  ┌────────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │  Template   │  │  Channel     │  │  Dashboard                │  │
│  │  Delegation │  │  Config      │  │  Aggregation              │  │
│  │  (Proxy)    │  │  (Proxy)     │  │  (Multi-Service)          │  │
│  └────────────┘  └──────────────┘  └───────────────────────────┘  │
│                                                                    │
│  PostgreSQL: admin_service                                         │
└───────┬──────────────┬──────────────┬──────────────┬──────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Notification │ │ Template     │ │ Channel      │ │ Event        │
│ Engine :3152 │ │ Service :3153│ │ Router :3154 │ │ Ingestion    │
│              │ │              │ │              │ │ :3151        │
│ Rule CRUD    │ │ Template     │ │ Channel      │ │ Mapping      │
│ Notification │ │ CRUD         │ │ Config       │ │ CRUD         │
│ queries      │ │ Preview      │ │ Provider     │ │ Test         │
│ Preferences  │ │ Render       │ │ health       │ │              │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
        │                                                 │
        │              ┌──────────────┐                   │
        │              │ Audit        │                   │
        └─────────────▶│ Service :3156│◄──────────────────┘
                       │ Logs, trace, │
                       │ analytics    │
                       └──────────────┘

                       ┌──────────────────────────────────┐
                       │  xch.config.events               │
                       │  (RabbitMQ Topic Exchange)        │
                       │                                   │
                       │  Config invalidation events:      │
                       │  config.mapping.*, config.rule.*, │
                       │  config.override.*                │
                       └──────────────────────────────────┘
```

### Communication Patterns

| Pattern | Usage | Justification |
|---|---|---|
| **Synchronous HTTP (inbound)** | All admin operations from the Gateway | Admin users need immediate feedback — create/update/delete operations require success/failure confirmation |
| **Synchronous HTTP (outbound)** | Proxy calls to downstream services (rules, templates, channels, mappings, audit logs) | Admin operations are user-driven and require immediate confirmation; the operative team expects real-time responses |
| **Asynchronous RabbitMQ** | Config change invalidation events | Downstream caches (mapping cache, rule cache, override cache) must be invalidated when configuration changes, but this must not block the admin operation |

> **Info:** **Proxy vs. Local Storage**
>
> The Admin Service uses a hybrid data strategy. It **owns** user management data (admin_users, admin_roles, admin_permissions, system_configs, SAML tables) in its own PostgreSQL schema. For notification rules, templates, channels, and event mappings, it acts as a **proxy** — forwarding CRUD operations to the owning service (Notification Engine, Template Service, Channel Router, Event Ingestion) and adding cross-cutting concerns like validation, audit logging, and cache invalidation. This avoids data duplication while providing a unified management surface.

---

## 3. User Management

The Admin Service manages the complete lifecycle of admin user accounts. All users are stored in the `admin_users` table within the `admin_service` schema. Authentication credentials (bcrypt-hashed passwords) are validated locally; SAML SSO users are linked via the `user_identity_links` table.

### 3.1 User Lifecycle

```
    ┌─────────────────────────┐
    │  1. Create User          │  ◄── POST /admin/users (Super Admin / Admin)
    │     { email, fullName,   │
    │       roleId, password } │
    └────────────┬────────────┘
                 ▼
     ◆ Email unique?           ◆────── No ──▶ [409 Conflict]
                 │
                Yes
                 ▼
    ┌─────────────────────────┐
    │  2. Validate password    │  ◄── 12+ chars, complexity rules
    │     against policy       │
    └────────────┬────────────┘
                 ▼
     ◆ Password valid?         ◆────── No ──▶ [400 Bad Request]
                 │
                Yes
                 ▼
    ┌─────────────────────────┐
    │  3. Hash password        │  ◄── bcrypt cost factor 12
    │     (bcrypt)             │
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  4. INSERT admin_users   │  ◄── is_active = true
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  5. Send welcome email   │  ◄── Via platform's own notification pipeline
    │     (optional)           │      POST /webhooks/events { eventType: "admin.user.created" }
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  6. Return 201 Created   │  ──▶ { id, email, fullName, role, isActive }
    └─────────────────────────┘
```

### 3.2 User State Machine

```
                          ┌─────────┐
  Create ────────────────▶│ ACTIVE  │
                          └────┬────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
    ┌──────────────┐  ┌──────────────┐  ┌────────────────┐
    │ LOCKED       │  │ DEACTIVATED  │  │ PASSWORD_RESET  │
    │ (auto, 15m)  │  │ (manual)     │  │ PENDING         │
    └──────┬───────┘  └──────┬───────┘  └───────┬────────┘
           │                 │                   │
           │ Auto-unlock     │ Reactivate        │ Reset complete
           ▼                 ▼                   ▼
    ┌──────────────────────────────────────────────┐
    │                   ACTIVE                      │
    └──────────────────────────────────────────────┘
```

| State | Description | Trigger |
|---|---|---|
| **ACTIVE** | User can authenticate and access the platform | Account creation, reactivation, auto-unlock |
| **LOCKED** | Temporarily blocked after 5 failed login attempts | 5 failed attempts within 15 minutes |
| **DEACTIVATED** | Manually disabled by a Super Admin or Admin | `PUT /admin/users/:id` with `isActive: false` |
| **PASSWORD_RESET_PENDING** | User has requested a password reset; existing sessions revoked | `POST /admin/auth/forgot-password` |

### 3.3 Password Policy

| Rule | Requirement |
|---|---|
| Minimum length | 12 characters |
| Complexity | At least one uppercase, one lowercase, one digit, and one special character |
| Hashing algorithm | bcrypt with cost factor 12 |
| Password history | Cannot reuse last 5 passwords (stored as bcrypt hashes in `password_history` JSONB) |
| Maximum age | 90 days (configurable via `PASSWORD_MAX_AGE_DAYS`) |
| Account lockout | 5 failed attempts in 15 minutes → 15-minute lock |

### 3.4 SAML Account Linking

When a SAML SSO user authenticates for the first time, the Admin Service checks if a local user with the same email exists. If found, the accounts are automatically linked via the `user_identity_links` table. If not found and auto-provisioning is enabled on the IdP configuration, a new local user is created with the `Operator` role (configurable default). See [04 — Authentication & Identity](04-authentication-identity.md) for the complete SAML SSO flow.

---

## 4. Role-Based Access Control (RBAC)

The Admin Service defines the RBAC model used across the entire platform. Roles and permissions are stored locally; the Gateway enforces them on every request using role claims embedded in JWT tokens.

### 4.1 Predefined Roles

| Role | Level | Description |
|---|---|---|
| **Super Admin** | 1 | Full platform access. User management, system configuration, IdP settings, all CRUD operations, audit log access. Intended for platform administrators. |
| **Admin** | 2 | Manage rules, templates, channels, event mappings, and recipient groups. View audit logs. Cannot manage users, system config, or IdP settings. Intended for team leads. |
| **Operator** | 3 | Create and edit rules, templates, and event mappings. View notification logs and channel status. Cannot modify channel configs, manage users, or access system settings. Intended for the day-to-day operative team. |
| **Viewer** | 4 | Read-only access to dashboards, notification logs, delivery analytics, and template previews. Cannot create or modify any resources. Intended for stakeholders and read-only auditors. |

### 4.2 Permission Matrix

| Resource | Action | Super Admin | Admin | Operator | Viewer |
|---|---|---|---|---|---|
| **Users** | List / View | Yes | Yes | No | No |
| **Users** | Create / Update / Deactivate | Yes | Yes (except Super Admin users) | No | No |
| **Roles** | View | Yes | Yes | No | No |
| **Roles** | Update permissions | Yes | No | No | No |
| **Rules** | List / View | Yes | Yes | Yes | Yes |
| **Rules** | Create / Update | Yes | Yes | Yes | No |
| **Rules** | Delete / Enable / Disable | Yes | Yes | No | No |
| **Templates** | List / View / Preview | Yes | Yes | Yes | Yes |
| **Templates** | Create / Update | Yes | Yes | Yes | No |
| **Templates** | Delete (soft) | Yes | Yes | No | No |
| **Templates** | Rollback version | Yes | Yes | No | No |
| **Channels** | List / View status | Yes | Yes | Yes | Yes |
| **Channels** | Update config / Credentials | Yes | Yes | No | No |
| **Event Mappings** | List / View | Yes | Yes | Yes | Yes |
| **Event Mappings** | Create / Update / Test | Yes | Yes | Yes | No |
| **Event Mappings** | Delete | Yes | Yes | No | No |
| **Recipient Groups** | List / View | Yes | Yes | Yes | Yes |
| **Recipient Groups** | Create / Update / Delete | Yes | Yes | Yes | No |
| **Notifications** | List / View / Search | Yes | Yes | Yes | Yes |
| **Notifications** | Manual Send | Yes | Yes | Yes | No |
| **Bulk Upload** | Upload / View / Retry | Yes | Yes | Yes | No |
| **Bulk Upload** | Cancel / Delete | Yes | Yes | No | No |
| **Audit Logs** | View | Yes | Yes | Yes | Yes |
| **Dashboard** | View | Yes | Yes | Yes | Yes |
| **System Config** | View / Update | Yes | No | No | No |
| **SAML IdP Settings** | View / Manage | Yes | No | No | No |
| **API Keys** | List / Create / Revoke | Yes | Yes | No | No |

### 4.3 Permission Enforcement Pipeline

```
    ┌─────────────────────────┐
    │  1. Request arrives at   │  ◄── Admin UI → Gateway → Admin Service
    │     Gateway              │
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  2. JWT token validated  │  ◄── RS256 signature, expiry, issuer
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  3. Extract role claim   │  ◄── role: "admin", permissions: [...]
    │     from JWT             │
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  4. Match endpoint       │  ◄── e.g., PUT /admin/channels/:id
    │     against RBAC table   │      → requires Admin or Super Admin
    └────────────┬────────────┘
                 ▼
     ◆ Role authorized?        ◆────── No ──▶ [403 Forbidden]
                 │
                Yes
                 ▼
    ┌─────────────────────────┐
    │  5. Proxy to Admin       │  ◄── Forward with X-User-ID, X-User-Role
    │     Service              │
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  6. Admin Service        │  ◄── Executes operation
    │     processes request    │
    └─────────────────────────┘
```

> **Info:** **Gateway-Enforced RBAC**
>
> The RBAC check happens at the Gateway layer before the request reaches the Admin Service. The Admin Service trusts that any request it receives has already been authorized. However, the Admin Service performs **resource-level** authorization when needed — for example, preventing an Admin-role user from deactivating a Super Admin user. The `X-User-ID` and `X-User-Role` headers propagated by the Gateway enable these fine-grained checks.

---

## 5. Notification Rule Management

The Admin Service provides the management interface for notification rules, which are stored in the Notification Engine Service's `notification_rules` table. The Admin Service does not store rule data — it proxies CRUD operations to the Notification Engine while adding cross-cutting validation and cache invalidation.

### 5.1 Rule CRUD Pipeline

```
    ┌─────────────────────────┐
    │  1. Receive rule request │  ◄── POST/PUT/DELETE /admin/rules
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  2. Pre-validate         │  ◄── Admin Service local checks
    │     - Event type exists  │      (calls Event Ingestion for sources)
    │     - Template exists    │      (calls Template Service)
    │     - Channels are active│      (calls Channel Router)
    │     - Suppression config │      (structural validation)
    │       is well-formed     │
    └────────────┬────────────┘
                 ▼
     ◆ Validation passed?      ◆────── No ──▶ [400 Bad Request]
                 │
                Yes
                 ▼
    ┌─────────────────────────┐
    │  3. Forward to           │  ◄── HTTP POST/PUT/DELETE to
    │     Notification Engine  │      Notification Engine :3152
    └────────────┬────────────┘
                 ▼
     ◆ Engine accepted?        ◆────── No ──▶ [4xx/5xx from Engine]
                 │
                Yes
                 ▼
    ┌─────────────────────────┐
    │  4. Publish config       │  ◄── Fire-and-forget to
    │     invalidation event   │      xch.config.events exchange
    │     (if RULE_CACHE       │      routing key: config.rule.updated
    │      is enabled)         │
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  5. Return response      │  ──▶ Created/Updated rule
    └─────────────────────────┘
```

### 5.2 Pre-Validation Cross-Service Checks

Before forwarding a rule creation or update to the Notification Engine, the Admin Service performs cross-service validation to catch misconfigurations early:

| Check | Target Service | Condition | Error |
|---|---|---|---|
| Event type exists | Event Ingestion | At least one active mapping exists for the rule's `eventType` | `400: No active mapping found for event type '{eventType}'` |
| Template exists | Template Service | `GET /templates/:id` returns `200` and `isActive = true` | `400: Template '{templateId}' not found or inactive` |
| Channels available | Channel Router | Each channel in the rule's `actions[].channels` has an active configuration | `400: Channel '{channel}' is not configured or inactive` |
| Suppression well-formed | Local | If `suppression` is present: `dedupKey` is non-empty, at least one mode is defined, all window/interval values are > 0 | `400: Invalid suppression config: {details}` |

### 5.3 Suppression Configuration Validation

When a rule includes a `suppression` object, the Admin Service validates its structure before forwarding to the Notification Engine:

| Field | Validation Rule | Error Message |
|---|---|---|
| `dedupKey` | Non-empty array of strings; each string is a valid dot-notation path | `dedupKey must be a non-empty array of field path strings` |
| `modes` | At least one mode (`dedup`, `maxCount`, `cooldown`) must be present | `At least one suppression mode must be configured` |
| `modes.dedup.windowMinutes` | Integer > 0 | `Dedup window must be a positive integer (minutes)` |
| `modes.maxCount.limit` | Integer > 0 | `Max count limit must be a positive integer` |
| `modes.maxCount.windowMinutes` | Integer > 0 | `Max count window must be a positive integer (minutes)` |
| `modes.cooldown.intervalMinutes` | Integer > 0 | `Cooldown interval must be a positive integer (minutes)` |

---

## 6. Event Mapping Management

The Admin Service provides CRUD and test endpoints for runtime field mapping configurations stored in the Event Ingestion Service's `event_mappings` table. When a mapping is created, updated, or deleted, the Admin Service publishes a cache invalidation event to the `xch.config.events` exchange so that the Event Ingestion Service's in-memory mapping cache (when `MAPPING_CACHE_ENABLED = true`) can refresh.

### 6.1 Mapping CRUD with Cache Invalidation

```
    ┌─────────────────────────┐
    │  1. Receive mapping      │  ◄── POST/PUT/DELETE /admin/event-mappings
    │     request              │
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  2. Validate mapping     │
    │     - sourceId refers    │  ◄── Check Event Ingestion's event_sources
    │       to active source   │
    │     - fieldMappings      │  ◄── Structural validation
    │       well-formed        │      (source paths, transform types)
    │     - priority is        │
    │       'normal' or        │
    │       'critical'         │
    └────────────┬────────────┘
                 ▼
     ◆ Validation passed?      ◆────── No ──▶ [400 Bad Request]
                 │
                Yes
                 ▼
    ┌─────────────────────────┐
    │  3. Forward to Event     │  ◄── HTTP to Event Ingestion :3151
    │     Ingestion Service    │
    └────────────┬────────────┘
                 ▼
     ◆ Ingestion accepted?     ◆────── No ──▶ [4xx/5xx from Ingestion]
                 │
                Yes
                 ▼
    ┌─────────────────────────┐
    │  4. Publish cache        │  ◄── Fire-and-forget to
    │     invalidation event   │      xch.config.events exchange
    │     routing key:         │      routing key: config.mapping.updated
    │     config.mapping.*     │
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  5. Return response      │  ──▶ Created/Updated mapping
    └─────────────────────────┘
```

### 6.2 Mapping Test Endpoint

The `POST /admin/event-mappings/:id/test` endpoint enables the operative team to validate a mapping configuration against a sample payload before activation. The Admin Service forwards the test request to the Event Ingestion Service, which applies the mapping and returns the resulting canonical event without persisting or publishing it.

```
    ┌─────────────────────────┐
    │  1. Receive test request │  ◄── POST /admin/event-mappings/:id/test
    │     { samplePayload }    │
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  2. Forward to Event     │  ◄── POST to Event Ingestion :3151
    │     Ingestion test       │      POST /event-mappings/:id/test
    │     endpoint             │
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  3. Event Ingestion      │
    │     applies mapping,     │
    │     returns normalized   │
    │     event (dry run)      │
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  4. Return test result   │  ──▶ { normalizedEvent, warnings[], errors[] }
    └─────────────────────────┘
```

> **Info:** **Cache Invalidation Protocol**
>
> When `MAPPING_CACHE_ENABLED = true` in the Event Ingestion Service, all active mappings are loaded into an in-memory cache at startup. The Admin Service publishes invalidation events to `xch.config.events` with routing key `config.mapping.updated` on every mapping CRUD operation. The Event Ingestion Service listens on `q.config.mapping-cache` and reloads the affected mapping from the database. See [07 — Event Ingestion Service §3.3](07-event-ingestion-service.md#33-mapping-cache-strategy) for the cache invalidation protocol details.

---

## 7. Template Management Delegation

The Admin Service delegates all template operations to the Template Service. It acts as a transparent proxy — forwarding requests through the Gateway to the Template Service and returning responses without transformation. Template data is never stored in the Admin Service's database.

### 7.1 Proxied Operations

| Admin Endpoint | Target Service Endpoint | Description |
|---|---|---|
| `GET /admin/templates` | `GET /templates` | List templates with pagination and filtering |
| `GET /admin/templates/:id` | `GET /templates/:id` | Get template details with versions and variables |
| `POST /admin/templates` | `POST /templates` | Create a new template with channel variants |
| `PUT /admin/templates/:id` | `PUT /templates/:id` | Update a template (creates new version) |
| `DELETE /admin/templates/:id` | `DELETE /templates/:id` | Soft-delete (deactivate) a template |
| `POST /admin/templates/:id/preview` | `POST /templates/:id/preview` | Preview template with sample data |
| `PUT /admin/templates/:id/rollback` | `PUT /templates/:id/rollback` | Roll back to a previous version |

### 7.2 Delegation Flow

```
Admin UI            Gateway             Admin Service          Template Service
   │                   │                      │                       │
   │  POST /api/v1/    │                      │                       │
   │  templates         │                      │                       │
   │  { slug, name,    │                      │                       │
   │    channels }     │                      │                       │
   │──────────────────▶│                      │                       │
   │                   │  Auth + RBAC check   │                       │
   │                   │  (requires Operator+)│                       │
   │                   │─────────────────────▶│                       │
   │                   │                      │  Forward POST         │
   │                   │                      │  /templates           │
   │                   │                      │─────────────────────▶│
   │                   │                      │                       │
   │                   │                      │  201 Created          │
   │                   │                      │◄─────────────────────│
   │                   │  201 Created         │                       │
   │                   │◄─────────────────────│                       │
   │  201 Created      │                      │                       │
   │◄──────────────────│                      │                       │
```

> **Info:** **Why Proxy via Admin Service?**
>
> The Gateway could proxy template requests directly to the Template Service, bypassing the Admin Service. However, routing through the Admin Service provides a single management API surface, enables the Admin Service to apply additional business logic (e.g., verifying template dependencies before deletion), and keeps the Gateway's routing configuration simple (all admin operations go to one service).

---

## 8. Channel Configuration Management

The Admin Service provides the management interface for notification channels and their provider configurations, which are stored in the Channel Router Service's `channels` and `channel_configs` tables.

### 8.1 Channel Configuration Flow

```
    ┌──────────────────────────────┐
    │  1. Receive channel config   │  ◄── PUT /admin/channels/:id
    │     update request           │      { provider, credentials, senderIdentity }
    └─────────────┬────────────────┘
                  ▼
    ┌──────────────────────────────┐
    │  2. Validate config          │
    │     - Provider type valid    │
    │     - Required credentials   │
    │       present                │
    │     - Sender identity format │
    └─────────────┬────────────────┘
                  ▼
     ◆ Validation passed?          ◆────── No ──▶ [400 Bad Request]
                  │
                 Yes
                  ▼
    ┌──────────────────────────────┐
    │  3. Connectivity test        │  ◄── Optional dry-run
    │     (if dryRun = true)       │      Forward test request to
    │                              │      Channel Router :3154
    └─────────────┬────────────────┘
                  ▼
     ◆ Connection successful?      ◆────── No ──▶ [422: Provider connectivity failed]
                  │
                 Yes (or skip if no dry-run)
                  ▼
    ┌──────────────────────────────┐
    │  4. Forward to Channel       │  ◄── PUT to Channel Router :3154
    │     Router Service           │
    └─────────────┬────────────────┘
                  ▼
    ┌──────────────────────────────┐
    │  5. Return updated config    │  ──▶ { channelId, provider, status }
    │     (credentials masked)     │      API keys masked: "sk-***...abc"
    └──────────────────────────────┘
```

### 8.2 Credential Masking

All sensitive configuration values are masked in API responses. The Admin Service instructs the Channel Router to mask credentials before returning them:

| Field Type | Masking Pattern | Example |
|---|---|---|
| API Key | First 3 + `***...` + last 3 | `SG.***...xYz` |
| Auth Token | `***...` + last 4 | `***...7f9a` |
| Webhook Secret | `[CONFIGURED]` | `[CONFIGURED]` |
| SMTP Password | `[CONFIGURED]` | `[CONFIGURED]` |

---

## 9. Recipient Group Management

Recipient groups allow the operative team to define named collections of recipients for use in notification rules with `recipientType: "group"`. Groups are managed by the Admin Service and stored in the Notification Engine Service's `recipient_groups` and `recipient_group_members` tables.

### 9.1 Group Types

| Type | Description | Member Resolution |
|---|---|---|
| **Static** | Fixed list of recipients explicitly added by the admin | Members are stored in `recipient_group_members` table |
| **Dynamic** | Criteria-based group resolved at notification time | `criteria` JSONB defines filter rules (e.g., `{ "customerSegment": "VIP" }`) evaluated against event data |

### 9.2 Group CRUD Endpoints

| Endpoint | Method | Description | Role Required |
|---|---|---|---|
| `/admin/recipient-groups` | GET | List groups with pagination and search | Viewer+ |
| `/admin/recipient-groups` | POST | Create a new group | Operator+ |
| `/admin/recipient-groups/:id` | GET | Get group details with member count | Viewer+ |
| `/admin/recipient-groups/:id` | PUT | Update group name, description, or criteria | Operator+ |
| `/admin/recipient-groups/:id` | DELETE | Soft-delete a group | Admin+ |
| `/admin/recipient-groups/:id/members` | GET | List group members with pagination | Viewer+ |
| `/admin/recipient-groups/:id/members` | POST | Add members to a static group | Operator+ |
| `/admin/recipient-groups/:id/members/:memberId` | DELETE | Remove a member from a static group | Operator+ |

---

## 10. System Configuration

The Admin Service manages global platform configuration through the `system_configs` table — a key-value store for settings that affect platform-wide behavior.

### 10.1 Configuration Categories

| Category | Example Keys | Description |
|---|---|---|
| **Retention** | `retention.events.days`, `retention.notifications.days`, `retention.audit.days` | Data retention periods for scheduled purge functions |
| **Feature Flags** | `feature.mapping_cache.enabled`, `feature.rule_cache.enabled` | Enable/disable optional features across services |
| **Rate Limits** | `ratelimit.global.per_minute`, `ratelimit.api_key.per_minute` | Global rate limit overrides |
| **Notification** | `notification.max_recipients_per_rule`, `notification.suppression.global_window_minutes` | Notification processing constraints |
| **Provider** | `provider.default_email`, `provider.default_sms` | Default provider selection when multiple are configured |

### 10.2 Configuration Access

| Endpoint | Method | Description | Role Required |
|---|---|---|---|
| `/admin/system-configs` | GET | List all configuration key-value pairs | Super Admin |
| `/admin/system-configs/:key` | GET | Get a specific configuration value | Super Admin |
| `/admin/system-configs/:key` | PUT | Update a configuration value | Super Admin |

> **Warning:** **Super Admin Only**
>
> System configuration changes can affect the entire platform's behavior. Only Super Admin users can view or modify these settings. All changes are audit-logged with the user ID, previous value, and new value.

---

## 11. Dashboard Data Aggregation

The Admin Service aggregates data from multiple downstream services to power the admin dashboard. Rather than maintaining its own analytics tables, it queries each service on demand and assembles a unified dashboard response.

### 11.1 Dashboard Metrics

| Metric | Source Service | Query |
|---|---|---|
| Notification volume (today / week / month) | Audit Service | `GET /audit/stats/volume?period={period}` |
| Delivery success rate (per channel) | Audit Service | `GET /audit/stats/delivery-rates` |
| Top triggered rules (last 7 days) | Notification Engine | `GET /engine/stats/top-rules?days=7` |
| Recent failures (last 24 hours) | Audit Service | `GET /audit/stats/failures?hours=24` |
| Channel health status | Channel Router | `GET /channels/health` |
| Queue depths (per exchange) | RabbitMQ Management API | `GET /api/queues/vhnotificationapi` |
| Active event sources | Event Ingestion | `GET /event-sources?isActive=true` |

### 11.2 Aggregation Flow

```
    ┌─────────────────────────┐
    │  1. GET /admin/dashboard │  ◄── Admin UI requests dashboard data
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  2. Parallel fan-out     │  ◄── Promise.all() to downstream services
    │     queries              │
    │                          │
    │  ┌── Audit Service ──────┤  GET /audit/stats/volume
    │  │                       │  GET /audit/stats/delivery-rates
    │  │                       │  GET /audit/stats/failures
    │  │                       │
    │  ├── Notification Engine─┤  GET /engine/stats/top-rules
    │  │                       │
    │  ├── Channel Router ─────┤  GET /channels/health
    │  │                       │
    │  └── Event Ingestion ────┤  GET /event-sources?isActive=true
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  3. Assemble response    │  ◄── Merge results into unified payload
    └────────────┬────────────┘
                 ▼
     ◆ Any service failed?     ◆────── Yes ──▶ Include partial data
                 │                             with degraded flag
                No
                 ▼
    ┌─────────────────────────┐
    │  4. Return 200 OK        │  ──▶ { volume, deliveryRates, topRules,
    │     with full dashboard  │       failures, channelHealth, sources }
    └─────────────────────────┘
```

### 11.3 Graceful Degradation

If any downstream service is unavailable during dashboard aggregation, the Admin Service returns partial results with a `degraded` flag and a list of unavailable services. The Admin UI displays available metrics and shows a warning banner for missing sections.

```json
{
  "data": {
    "volume": { "today": 1234, "week": 8765, "month": 34567 },
    "deliveryRates": { "email": 0.98, "sms": 0.95, "whatsapp": 0.97, "push": 0.92 },
    "topRules": [ ... ],
    "failures": [ ... ],
    "channelHealth": null,
    "sources": [ ... ]
  },
  "meta": {
    "degraded": true,
    "unavailableServices": ["channel-router-service"],
    "message": "Dashboard data is partial — some services are temporarily unavailable"
  }
}
```

---

## 12. RabbitMQ Topology (Config Invalidation)

The Admin Service uses RabbitMQ exclusively for publishing configuration change events. These events trigger cache invalidation in downstream services that maintain in-memory caches of configuration data (Event Ingestion mapping cache, Notification Engine rule cache, override cache).

### 12.1 Design Principle: Fire-and-Forget

Configuration invalidation events are published as fire-and-forget messages. The Admin Service does not wait for consumer acknowledgment — publishing failures are logged locally but do not block the admin CRUD operation. This ensures that cache invalidation is best-effort and never degrades the admin user experience.

### 12.2 Exchange & Routing

| Exchange | Type | Routing Key | Purpose | Consumer |
|---|---|---|---|---|
| `xch.config.events` | Topic | `config.mapping.created` | New mapping created | Event Ingestion (q.config.mapping-cache) |
| `xch.config.events` | Topic | `config.mapping.updated` | Mapping updated | Event Ingestion (q.config.mapping-cache) |
| `xch.config.events` | Topic | `config.mapping.deleted` | Mapping deactivated | Event Ingestion (q.config.mapping-cache) |
| `xch.config.events` | Topic | `config.rule.created` | New rule created | Notification Engine (q.config.rule-cache) |
| `xch.config.events` | Topic | `config.rule.updated` | Rule updated | Notification Engine (q.config.rule-cache) |
| `xch.config.events` | Topic | `config.rule.deleted` | Rule deactivated | Notification Engine (q.config.rule-cache) |
| `xch.config.events` | Topic | `config.override.created` | New critical override created | Notification Engine (q.config.override-cache) |
| `xch.config.events` | Topic | `config.override.updated` | Override updated | Notification Engine (q.config.override-cache) |
| `xch.config.events` | Topic | `config.override.deleted` | Override deactivated | Notification Engine (q.config.override-cache) |

### 12.3 Message Schema

All config invalidation messages follow a common envelope:

```json
{
  "eventId": "uuid-v4",
  "source": "admin-service",
  "type": "config.mapping.updated",
  "timestamp": "2026-02-21T10:30:00.000Z",
  "data": {
    "resourceId": "mapping-uuid",
    "resourceType": "event_mapping",
    "action": "updated",
    "changedBy": "admin-user-uuid",
    "metadata": {
      "sourceId": "oms",
      "eventType": "order.shipped"
    }
  }
}
```

### Figure 12.1 — Config Invalidation Topology

```
┌──────────────────────────────────────┐
│        Admin Service :3155            │
│                                       │
│  Mapping CRUD / Rule CRUD /           │
│  Override CRUD                         │
│  ┌────────────────────────┐          │
│  │ Config changed          │          │
│  │ (create/update/delete)  │          │
│  └──────┬─────────────────┘          │
│         │                            │
│         ▼                            │
│  ┌────────────────────────┐          │
│  │  Publish to             │  Fire-  │
│  │  xch.config.events      │  and-   │
│  │  exchange                │  forget │
│  └──────┬─────────────────┘          │
│         │  (non-blocking)            │
└─────────┼────────────────────────────┘
          │
          ▼
┌──────────────────────────────┐
│  xch.config.events            │
│  (Topic Exchange)             │
│                               │
│  Routing keys:                │
│  config.mapping.*             │
│  config.rule.*                │
│  config.override.*            │
└───────┬───────────┬──────────┘
        │           │
        ▼           ▼
┌──────────────┐  ┌──────────────────────┐
│ q.config.    │  │ q.config.rule-cache  │
│ mapping-cache│  │ q.config.override-   │
│ (1 consumer) │  │ cache                │
└──────┬───────┘  │ (1 consumer each)    │
       │          └──────────┬───────────┘
       ▼                     ▼
┌──────────────┐  ┌──────────────────────┐
│ Event        │  │ Notification Engine  │
│ Ingestion    │  │ :3152                │
│ :3151        │  │ Reload rule or       │
│ Reload       │  │ override from DB     │
│ mapping      │  └──────────────────────┘
│ from DB      │
└──────────────┘
```

---

## 13. REST API Endpoints

All Admin Service endpoints are prefixed with `/admin/` and accessed through the Notification Gateway at `/api/v1/`. The Gateway handles authentication and RBAC before proxying.

### User Management

#### POST /admin/users

Create a new admin user.

**Request Body**

```json
{
  "email": "operator@company.com",
  "fullName": "Jane Smith",
  "roleId": "uuid-of-operator-role",
  "password": "SecureP@ss2026!",
  "sendWelcomeEmail": true
}
```

**Validation Rules**

| Field | Rule | Error |
|---|---|---|
| `email` | Required, valid email format, unique | `400` / `409 Conflict` |
| `fullName` | Required, 2-100 characters | `400` |
| `roleId` | Required, references existing role | `400` |
| `password` | Required, meets password policy | `400` |

**Responses**

| Status | Description |
|---|---|
| `201 Created` | User created successfully |
| `400 Bad Request` | Validation error |
| `409 Conflict` | Email already registered |

#### GET /admin/users

List admin users with pagination and filtering.

**Query Parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `role` | string | — | Filter by role name |
| `isActive` | boolean | — | Filter by active status |
| `search` | string | — | Search by name or email |
| `page` | integer | 1 | Page number |
| `limit` | integer | 50 | Items per page (max 200) |

**Response (200 OK)**

```json
{
  "data": [
    {
      "id": "uuid",
      "email": "operator@company.com",
      "fullName": "Jane Smith",
      "role": { "id": "uuid", "name": "Operator" },
      "isActive": true,
      "lastLoginAt": "2026-02-20T14:30:00Z",
      "createdAt": "2026-01-15T10:00:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 8, "totalPages": 1 }
}
```

#### PUT /admin/users/:id

Update an admin user's profile, role, or status.

**Request Body**

```json
{
  "fullName": "Jane Smith-Jones",
  "roleId": "uuid-of-admin-role",
  "isActive": true
}
```

**Responses**

| Status | Description |
|---|---|
| `200 OK` | User updated |
| `400 Bad Request` | Validation error |
| `403 Forbidden` | Cannot modify a Super Admin user (unless requester is Super Admin) |
| `404 Not Found` | User not found |

#### POST /admin/users/:id/reset-password

Trigger a password reset for a specific user. Sends a reset email and invalidates existing sessions. Only available to Super Admin and Admin roles.

**Responses**

| Status | Description |
|---|---|
| `202 Accepted` | Password reset email sent |
| `404 Not Found` | User not found |

### Notification Rules

#### GET /admin/rules

List notification rules with pagination, sorting, and filtering.

**Query Parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `eventType` | string | — | Filter by event type |
| `isActive` | boolean | — | Filter by active status |
| `channel` | string | — | Filter by channel in actions |
| `search` | string | — | Search by rule name |
| `sortBy` | string | `createdAt` | Sort field (`name`, `eventType`, `priority`, `createdAt`) |
| `sortOrder` | string | `desc` | Sort direction (`asc`, `desc`) |
| `page` | integer | 1 | Page number |
| `limit` | integer | 50 | Items per page (max 200) |

**Response (200 OK)**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Order Shipped — Email + SMS",
      "eventType": "order.shipped",
      "priority": 10,
      "isActive": true,
      "isExclusive": false,
      "channels": ["email", "sms"],
      "templateId": "uuid",
      "templateName": "order-shipped",
      "hasSuppression": true,
      "triggerCount7d": 1234,
      "createdAt": "2026-01-10T08:00:00Z",
      "updatedAt": "2026-02-20T14:30:00Z"
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 25, "totalPages": 1 }
}
```

#### POST /admin/rules

Create a new notification rule. Validates cross-service dependencies before forwarding.

**Request Body**

```json
{
  "name": "Order Shipped — Email + SMS",
  "eventType": "order.shipped",
  "priority": 10,
  "isExclusive": false,
  "conditions": {
    "totalAmount": { "$gte": 50 }
  },
  "actions": [
    {
      "templateId": "uuid",
      "channels": ["email", "sms"],
      "recipientType": "customer"
    }
  ],
  "suppression": {
    "dedupKey": ["eventType", "orderId", "recipient.email"],
    "modes": {
      "dedup": { "windowMinutes": 60 }
    }
  },
  "deliveryPriority": null
}
```

**Responses**

| Status | Description |
|---|---|
| `201 Created` | Rule created |
| `400 Bad Request` | Validation error (invalid event type, missing template, inactive channel, malformed suppression) |

#### PUT /admin/rules/:id

Update an existing rule. Supports partial updates.

**Responses**

| Status | Description |
|---|---|
| `200 OK` | Rule updated |
| `400 Bad Request` | Validation error |
| `404 Not Found` | Rule not found |

#### DELETE /admin/rules/:id

Soft-delete a rule (sets `is_active = false`).

**Responses**

| Status | Description |
|---|---|
| `200 OK` | Rule deactivated |
| `404 Not Found` | Rule not found |

### Event Mappings

#### GET /admin/event-mappings

List event mapping configurations with pagination.

**Query Parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `sourceId` | string | — | Filter by source system ID |
| `eventType` | string | — | Filter by event type |
| `isActive` | boolean | — | Filter by active status |
| `priority` | string | — | Filter by priority (`normal`, `critical`) |
| `page` | integer | 1 | Page number |
| `limit` | integer | 50 | Items per page (max 200) |

#### POST /admin/event-mappings

Create a new event mapping configuration.

**Request Body**

```json
{
  "sourceId": "oms",
  "eventType": "order.shipped",
  "name": "OMS Order Shipped Mapping",
  "priority": "normal",
  "fieldMappings": {
    "orderId": { "source": "data.orderNumber", "transform": "toString" },
    "customerEmail": { "source": "data.customer.email", "required": true },
    "customerName": { "source": "data.customer.name", "transform": "trim" },
    "totalAmount": { "source": "data.total", "transform": "toNumber" },
    "currency": { "source": "data.currency", "default": "USD" }
  },
  "validationSchema": {
    "required": ["orderId", "customerEmail"]
  }
}
```

**Responses**

| Status | Description |
|---|---|
| `201 Created` | Mapping created, cache invalidation event published |
| `400 Bad Request` | Validation error (unknown source, malformed mappings) |

#### PUT /admin/event-mappings/:id

Update an existing mapping. Increments the `version` field.

#### DELETE /admin/event-mappings/:id

Soft-delete a mapping (sets `is_active = false`). Cache invalidation event published.

#### POST /admin/event-mappings/:id/test

Test a mapping against a sample payload. Returns normalized event without persisting.

**Request Body**

```json
{
  "samplePayload": {
    "data": {
      "orderNumber": "ORD-2026-00451",
      "customer": { "email": "jane@example.com", "name": "Jane Doe" },
      "total": 79.99,
      "currency": "USD"
    }
  }
}
```

**Response (200 OK)**

```json
{
  "normalizedEvent": {
    "eventId": "test-uuid",
    "sourceId": "oms",
    "eventType": "order.shipped",
    "orderId": "ORD-2026-00451",
    "customerEmail": "jane@example.com",
    "customerName": "Jane Doe",
    "totalAmount": 79.99,
    "currency": "USD",
    "priority": "normal",
    "metadata": { "schemaVersion": "2.0" }
  },
  "warnings": [],
  "errors": []
}
```

### Channel Configuration

#### GET /admin/channels

List all channels with status and health indicators.

**Response (200 OK)**

```json
{
  "data": [
    {
      "id": "uuid",
      "channel": "email",
      "provider": "sendgrid",
      "status": "active",
      "health": "healthy",
      "senderIdentity": "notifications@company.com",
      "lastDeliveryAt": "2026-02-21T10:30:00Z",
      "deliveryRate24h": 0.98,
      "configuredAt": "2026-01-05T09:00:00Z"
    }
  ]
}
```

#### PUT /admin/channels/:id

Update channel configuration with optional connectivity dry-run.

**Request Body**

```json
{
  "provider": "sendgrid",
  "credentials": {
    "apiKey": "SG.new-api-key-here"
  },
  "senderIdentity": {
    "fromEmail": "notifications@company.com",
    "fromName": "Company Notifications",
    "replyTo": "support@company.com"
  },
  "dryRun": true
}
```

### Recipient Groups

#### POST /admin/recipient-groups

Create a new recipient group.

**Request Body**

```json
{
  "name": "VIP Customers",
  "description": "High-value customers eligible for priority notifications",
  "type": "static",
  "members": [
    { "customerId": "CUST-001", "email": "vip1@example.com", "name": "John Doe" },
    { "customerId": "CUST-002", "email": "vip2@example.com", "name": "Jane Smith" }
  ]
}
```

### Dashboard

#### GET /admin/dashboard

Dashboard metrics aggregated from all downstream services. Supports time window selection.

**Query Parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `period` | string | `today` | Time period (`today`, `7d`, `30d`, `90d`) |

### System Configuration

#### GET /admin/system-configs

List all system configuration key-value pairs. Super Admin only.

#### PUT /admin/system-configs/:key

Update a system configuration value.

**Request Body**

```json
{
  "value": "180",
  "description": "Event payload retention period in days"
}
```

### SAML Identity Provider Management

#### GET /admin/saml/idp

List configured SAML Identity Providers. Super Admin only.

#### POST /admin/saml/idp

Register a new SAML Identity Provider by importing IdP metadata XML.

**Request Body**

```json
{
  "name": "Corporate Azure AD",
  "metadataXml": "<?xml version=\"1.0\"?>...",
  "attributeMapping": {
    "email": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    "firstName": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname",
    "lastName": "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"
  },
  "autoProvision": true,
  "defaultRole": "Operator"
}
```

**Responses**

| Status | Description |
|---|---|
| `201 Created` | IdP registered, SP metadata generated |
| `400 Bad Request` | Invalid metadata XML or attribute mapping |

#### PUT /admin/saml/idp/:id

Update an existing IdP configuration.

#### DELETE /admin/saml/idp/:id

Deactivate a SAML IdP. Users linked to this IdP can still authenticate via local credentials if they have a password set.

### Audit Logs

#### GET /admin/logs

Retrieve audit logs with comprehensive filtering. Proxied to Audit Service.

**Query Parameters**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `action` | string | — | Filter by action type (e.g., `rule.created`, `template.updated`) |
| `userId` | string | — | Filter by admin user ID |
| `resourceType` | string | — | Filter by resource type (`rule`, `template`, `mapping`, `channel`, `user`) |
| `notificationId` | string | — | Filter by notification ID |
| `dateFrom` | ISO-8601 | — | Start date filter |
| `dateTo` | ISO-8601 | — | End date filter |
| `page` | integer | 1 | Page number |
| `limit` | integer | 50 | Items per page (max 200) |

### Health Check

#### GET /admin/health

Health check endpoint. Returns service status, database connectivity, downstream service health, and RabbitMQ connection status.

**Response (200 OK)**

```json
{
  "status": "healthy",
  "uptime": 86400,
  "checks": {
    "database": { "status": "up", "latencyMs": 2 },
    "rabbitmq": { "status": "up", "latencyMs": 5 },
    "downstreamServices": {
      "notification-engine": { "status": "up", "latencyMs": 12 },
      "template-service": { "status": "up", "latencyMs": 8 },
      "channel-router": { "status": "up", "latencyMs": 15 },
      "event-ingestion": { "status": "up", "latencyMs": 10 },
      "audit-service": { "status": "up", "latencyMs": 11 }
    }
  }
}
```

---

## 14. Database Design

- **Schema:** `admin_service`
- **User:** `admin_service_user`
- **DB Script:** `admin-service/dbscripts/schema-admin-service.sql`

### admin_users Table

Admin user accounts. Stores local authentication credentials and profile information. This is the authoritative source for all admin user identities in the platform. SAML SSO users are linked to local accounts via the `user_identity_links` table.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | User identifier |
| `email` | `VARCHAR(255)` | `NOT NULL UNIQUE` | Login email address |
| `password_hash` | `VARCHAR(255)` | | bcrypt-hashed password (NULL for SSO-only users) |
| `password_history` | `JSONB` | `DEFAULT '[]'` | Array of last 5 password hashes for reuse prevention |
| `full_name` | `VARCHAR(100)` | `NOT NULL` | User's display name |
| `role_id` | `UUID` | `NOT NULL REFERENCES admin_roles(id)` | Assigned role |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT true` | Whether the user can authenticate |
| `failed_login_attempts` | `INTEGER` | `NOT NULL DEFAULT 0` | Failed login counter (reset on success) |
| `locked_until` | `TIMESTAMPTZ` | | Account lockout expiry (NULL = not locked) |
| `password_changed_at` | `TIMESTAMPTZ` | | Last password change timestamp |
| `last_login_at` | `TIMESTAMPTZ` | | Most recent successful login |
| `created_by` | `VARCHAR(100)` | | User who created this account |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

#### Indexes

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_admin_users_email` | `email` | UNIQUE | Email-based authentication lookup |
| `idx_admin_users_role_id` | `role_id` | B-Tree | Filter users by role |
| `idx_admin_users_is_active` | `is_active` | B-Tree | Filter by active status |

### admin_roles Table

Role definitions with permission sets. The platform ships with four predefined system roles. Custom roles can be created by Super Admins but cannot exceed the permission scope of existing system roles.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Role identifier |
| `name` | `VARCHAR(50)` | `NOT NULL UNIQUE` | Role name (e.g., `Super Admin`, `Operator`) |
| `description` | `TEXT` | | Human-readable role description |
| `permissions` | `JSONB` | `NOT NULL DEFAULT '{}'` | Permission matrix `{ resource: { action: boolean } }` |
| `level` | `INTEGER` | `NOT NULL` | Role hierarchy level (1 = highest) |
| `is_system` | `BOOLEAN` | `NOT NULL DEFAULT false` | Whether this is a predefined system role |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

### admin_permissions Table

Granular permission definitions. Each row defines a single resource-action pair that can be referenced in role permission matrices. This table serves as a catalog of all available permissions.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Permission identifier |
| `resource` | `VARCHAR(50)` | `NOT NULL` | Resource name (e.g., `rules`, `templates`, `users`) |
| `action` | `VARCHAR(50)` | `NOT NULL` | Action name (e.g., `create`, `read`, `update`, `delete`) |
| `description` | `TEXT` | | Human-readable permission description |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |

#### Indexes

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_admin_permissions_resource_action` | `resource, action` | UNIQUE | Ensure unique resource-action pairs |

### system_configs Table

Global system configuration key-value pairs. Used for platform-wide settings that affect behavior across services. All changes are audit-logged.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Config record identifier |
| `config_key` | `VARCHAR(255)` | `NOT NULL UNIQUE` | Configuration key (dot-notation, e.g., `retention.events.days`) |
| `config_value` | `TEXT` | `NOT NULL` | Configuration value (string; caller parses to appropriate type) |
| `value_type` | `VARCHAR(20)` | `NOT NULL DEFAULT 'string'` | Value type hint (`string`, `integer`, `boolean`, `json`) |
| `description` | `TEXT` | | Human-readable description of the configuration |
| `updated_by` | `VARCHAR(100)` | | User who last modified this config |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last modification timestamp |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |

#### Indexes

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_system_configs_key` | `config_key` | UNIQUE | Key-based configuration lookup |

### saml_identity_providers Table

SAML 2.0 Identity Provider configurations. Each row represents a trust relationship with an external IdP (e.g., Azure AD). The Admin Service generates SP metadata and keypair on registration.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | IdP configuration identifier |
| `name` | `VARCHAR(255)` | `NOT NULL` | Human-readable IdP name (e.g., "Corporate Azure AD") |
| `entity_id` | `VARCHAR(500)` | `NOT NULL UNIQUE` | IdP entity ID from metadata XML |
| `sso_url` | `VARCHAR(500)` | `NOT NULL` | IdP Single Sign-On URL |
| `slo_url` | `VARCHAR(500)` | | IdP Single Logout URL (optional) |
| `certificate` | `TEXT` | `NOT NULL` | IdP X.509 signing certificate (PEM format) |
| `metadata_xml` | `TEXT` | | Original IdP metadata XML document |
| `sp_private_key` | `TEXT` | `NOT NULL` | SP private key for request signing (encrypted at rest) |
| `sp_certificate` | `TEXT` | `NOT NULL` | SP X.509 certificate (public) |
| `attribute_mapping` | `JSONB` | `NOT NULL DEFAULT '{}'` | Maps SAML attributes to local user fields |
| `auto_provision` | `BOOLEAN` | `NOT NULL DEFAULT false` | Auto-create local users on first SSO login |
| `default_role_id` | `UUID` | `REFERENCES admin_roles(id)` | Default role for auto-provisioned users |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT true` | Whether this IdP is enabled |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

#### Indexes

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_saml_idp_entity_id` | `entity_id` | UNIQUE | Entity ID lookup during SAML assertion validation |
| `idx_saml_idp_is_active` | `is_active` | B-Tree | Filter active IdPs |

### user_identity_links Table

Maps local admin user accounts to external SAML identities. A user can be linked to multiple IdPs, and each external identity maps to exactly one local account.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Link record identifier |
| `user_id` | `UUID` | `NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE` | Local user account |
| `idp_id` | `UUID` | `NOT NULL REFERENCES saml_identity_providers(id)` | Identity Provider |
| `external_id` | `VARCHAR(500)` | `NOT NULL` | External identity (NameID from SAML assertion) |
| `linked_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | When the link was established |
| `last_login_at` | `TIMESTAMPTZ` | | Most recent SSO login via this link |

#### Indexes

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_user_identity_links_idp_external` | `idp_id, external_id` | UNIQUE | Lookup by IdP + external identity |
| `idx_user_identity_links_user_id` | `user_id` | B-Tree | Find all IdP links for a user |

### saml_sessions Table

Active SAML sessions for Single Logout (SLO) support. When a user authenticates via SAML SSO, a session record is created. On SLO, all sessions for the user across all IdPs can be invalidated.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Session identifier |
| `user_id` | `UUID` | `NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE` | Local user account |
| `idp_id` | `UUID` | `NOT NULL REFERENCES saml_identity_providers(id)` | Identity Provider |
| `session_index` | `VARCHAR(500)` | `NOT NULL` | SAML SessionIndex from the assertion |
| `name_id` | `VARCHAR(500)` | `NOT NULL` | SAML NameID from the assertion |
| `expires_at` | `TIMESTAMPTZ` | `NOT NULL` | Session expiry time |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Session creation timestamp |

#### Indexes

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_saml_sessions_user_id` | `user_id` | B-Tree | Find all sessions for a user (SLO) |
| `idx_saml_sessions_expires_at` | `expires_at` | B-Tree | Cleanup expired sessions |

### Figure 14.1 — Entity Relationship Diagram

```
┌──────────────────────────────┐
│          admin_roles          │
├──────────────────────────────┤
│ PK  id               UUID    │
│ UK  name             VARCHAR │
│     description      TEXT    │
│     permissions      JSONB   │
│     level            INTEGER │
│     is_system        BOOLEAN │
│     created_at       TSTZ   │
│     updated_at       TSTZ   │
└──────────┬───────────────────┘
           │
           │ role_id (FK)
           ▼
┌──────────────────────────────┐       ┌──────────────────────────────┐
│         admin_users           │       │     admin_permissions         │
├──────────────────────────────┤       ├──────────────────────────────┤
│ PK  id               UUID    │       │ PK  id               UUID    │
│ UK  email            VARCHAR │       │     resource         VARCHAR │
│     password_hash    VARCHAR │       │     action           VARCHAR │
│     password_history JSONB   │       │     description      TEXT    │
│ FK  role_id          UUID    │       │     created_at       TSTZ   │
│     full_name        VARCHAR │       ├──────────────────────────────┤
│     is_active        BOOLEAN │       │ UK  (resource, action)       │
│     failed_login_    INTEGER │       └──────────────────────────────┘
│       attempts               │
│     locked_until     TSTZ   │
│     password_changed TSTZ   │
│     last_login_at    TSTZ   │       ┌──────────────────────────────┐
│     created_by       VARCHAR │       │       system_configs          │
│     created_at       TSTZ   │       ├──────────────────────────────┤
│     updated_at       TSTZ   │       │ PK  id               UUID    │
└──────────┬───────────────────┘       │ UK  config_key       VARCHAR │
           │                           │     config_value     TEXT    │
           │ user_id (FK)              │     value_type       VARCHAR │
           │                           │     description      TEXT    │
     ┌─────┴──────────┐               │     updated_by       VARCHAR │
     │                │               │     updated_at       TSTZ   │
     ▼                ▼               │     created_at       TSTZ   │
┌─────────────────┐ ┌──────────────┐  └──────────────────────────────┘
│ user_identity_  │ │ saml_        │
│ links           │ │ sessions     │
├─────────────────┤ ├──────────────┤
│ PK id      UUID │ │ PK id   UUID│
│ FK user_id UUID │ │ FK user_id  │
│ FK idp_id  UUID │ │    UUID     │
│    external_id  │ │ FK idp_id   │
│    VARCHAR      │ │    UUID     │
│    linked_at    │ │ session_    │
│    TSTZ         │ │   index     │
│    last_login   │ │ name_id     │
│    TSTZ         │ │ expires_at  │
├─────────────────┤ │    TSTZ     │
│ UK (idp_id,     │ │ created_at  │
│    external_id) │ │    TSTZ     │
└────────┬────────┘ └──────┬──────┘
         │                 │
         │ idp_id (FK)     │ idp_id (FK)
         │                 │
         ▼                 ▼
┌──────────────────────────────┐
│   saml_identity_providers     │
├──────────────────────────────┤
│ PK  id               UUID    │
│     name             VARCHAR │
│ UK  entity_id        VARCHAR │
│     sso_url          VARCHAR │
│     slo_url          VARCHAR │
│     certificate      TEXT    │
│     metadata_xml     TEXT    │
│     sp_private_key   TEXT    │
│     sp_certificate   TEXT    │
│     attribute_mapping JSONB  │
│     auto_provision   BOOLEAN │
│ FK  default_role_id  UUID    │
│     is_active        BOOLEAN │
│     created_at       TSTZ   │
│     updated_at       TSTZ   │
└──────────────────────────────┘
```

### Growth Estimates

| Table | Estimated Rows (Year 1) | Estimated Size | Growth Rate |
|---|---|---|---|
| `admin_users` | 10-100 | ~100 KB | Very low (~1-5 users/month) |
| `admin_roles` | 4-10 | ~10 KB | Near zero (4 system roles + rare custom) |
| `admin_permissions` | 50-100 | ~50 KB | Near zero (stable permission catalog) |
| `system_configs` | 20-50 | ~20 KB | Very low |
| `saml_identity_providers` | 1-5 | ~50 KB | Near zero |
| `user_identity_links` | 10-100 | ~50 KB | Tracks SSO users |
| `saml_sessions` | 0-50 active | ~30 KB | TTL-managed, auto-cleaned |
| **Total** | — | **~310 KB** | **~100 MB max projected** |

> **Info:** **Minimal Storage Footprint**
>
> The Admin Service has the smallest database footprint of all backend services. Its tables store configuration and user metadata — not transactional notification data. The estimated Year 1 total is under 1 MB of active data, with a maximum projection of ~100 MB including indexes, TOAST, and JSONB overhead.

---

## 15. Sequence Diagrams

### 15.1 Admin User Login (Local Authentication)

```
Admin UI            Gateway             Admin Service          PostgreSQL
   │                   │                      │                       │
   │  POST /api/v1/    │                      │                       │
   │  auth/login       │                      │                       │
   │  { email, pwd }   │                      │                       │
   │──────────────────▶│                      │                       │
   │                   │  Forward to Admin    │                       │
   │                   │  Service             │                       │
   │                   │─────────────────────▶│                       │
   │                   │                      │  SELECT admin_users   │
   │                   │                      │  WHERE email = ?      │
   │                   │                      │──────────────────────▶│
   │                   │                      │  User record          │
   │                   │                      │◄──────────────────────│
   │                   │                      │                       │
   │                   │                      │  Check locked_until   │
   │                   │                      │  bcrypt.compare(pwd,  │
   │                   │                      │    password_hash)     │
   │                   │                      │                       │
   │                   │                      │  [Match]              │
   │                   │                      │  Reset failed_login   │
   │                   │                      │  Update last_login_at │
   │                   │                      │──────────────────────▶│
   │                   │                      │                       │
   │                   │                      │  Issue JWT access     │
   │                   │                      │  token (RS256)        │
   │                   │                      │  + refresh token      │
   │                   │                      │                       │
   │                   │  200 OK              │                       │
   │                   │  { accessToken,      │                       │
   │                   │    user: {...} }     │                       │
   │                   │  Set-Cookie:         │                       │
   │                   │  refreshToken=...    │                       │
   │                   │◄─────────────────────│                       │
   │  200 OK           │                      │                       │
   │  + Set-Cookie     │                      │                       │
   │◄──────────────────│                      │                       │
```

### 15.2 Notification Rule Creation with Cross-Service Validation

```
Admin UI       Gateway        Admin Service     Event Ingestion  Template Svc   Channel Router  Notif Engine   RabbitMQ
   │              │                │                   │               │               │              │            │
   │ POST /api/v1/│                │                   │               │               │              │            │
   │ rules        │                │                   │               │               │              │            │
   │ { rule... }  │                │                   │               │               │              │            │
   │─────────────▶│                │                   │               │               │              │            │
   │              │ Auth+RBAC      │                   │               │               │              │            │
   │              │───────────────▶│                   │               │               │              │            │
   │              │                │                   │               │               │              │            │
   │              │                │  Validate:        │               │               │              │            │
   │              │                │  eventType exists?│               │               │              │            │
   │              │                │──────────────────▶│               │               │              │            │
   │              │                │  200 OK (active)  │               │               │              │            │
   │              │                │◄──────────────────│               │               │              │            │
   │              │                │                   │               │               │              │            │
   │              │                │  template exists? │               │               │              │            │
   │              │                │──────────────────────────────────▶│               │              │            │
   │              │                │  200 OK (active)  │               │               │              │            │
   │              │                │◄──────────────────────────────────│               │              │            │
   │              │                │                   │               │               │              │            │
   │              │                │  channels active? │               │               │              │            │
   │              │                │──────────────────────────────────────────────────▶│              │            │
   │              │                │  200 OK           │               │               │              │            │
   │              │                │◄──────────────────────────────────────────────────│              │            │
   │              │                │                   │               │               │              │            │
   │              │                │  All valid —      │               │               │              │            │
   │              │                │  forward to Engine│               │               │              │            │
   │              │                │─────────────────────────────────────────────────────────────────▶│            │
   │              │                │  201 Created      │               │               │              │            │
   │              │                │◄─────────────────────────────────────────────────────────────────│            │
   │              │                │                   │               │               │              │            │
   │              │                │  Publish config   │               │               │              │            │
   │              │                │  invalidation     │               │               │              │            │
   │              │                │  (fire-and-forget)│               │               │              │            │
   │              │                │────────────────────────────────────────────────────────────────────────────▶│
   │              │                │                   │               │               │              │            │
   │              │  201 Created   │                   │               │               │              │            │
   │              │◄───────────────│                   │               │               │              │            │
   │  201 Created │                │                   │               │               │              │            │
   │◄─────────────│                │                   │               │               │              │            │
```

### 15.3 Event Mapping Update with Cache Invalidation

```
Admin UI       Gateway        Admin Service     Event Ingestion      RabbitMQ
   │              │                │                   │                 │
   │ PUT /api/v1/ │                │                   │                 │
   │ event-       │                │                   │                 │
   │ mappings/:id │                │                   │                 │
   │ { fields }   │                │                   │                 │
   │─────────────▶│                │                   │                 │
   │              │ Auth+RBAC      │                   │                 │
   │              │───────────────▶│                   │                 │
   │              │                │                   │                 │
   │              │                │  Validate mapping │                 │
   │              │                │  structure         │                 │
   │              │                │                   │                 │
   │              │                │  Forward PUT to   │                 │
   │              │                │  Event Ingestion  │                 │
   │              │                │──────────────────▶│                 │
   │              │                │  200 OK (updated) │                 │
   │              │                │◄──────────────────│                 │
   │              │                │                   │                 │
   │              │                │  Publish to       │                 │
   │              │                │  xch.config.events│                 │
   │              │                │  config.mapping.  │                 │
   │              │                │  updated          │                 │
   │              │                │────────────────────────────────────▶│
   │              │                │                   │                 │
   │              │                │                   │  q.config.      │
   │              │                │                   │  mapping-cache  │
   │              │                │                   │◄────────────────│
   │              │                │                   │                 │
   │              │                │                   │  Reload mapping │
   │              │                │                   │  from DB        │
   │              │                │                   │                 │
   │              │  200 OK        │                   │                 │
   │              │◄───────────────│                   │                 │
   │  200 OK      │                │                   │                 │
   │◄─────────────│                │                   │                 │
```

### 15.4 Dashboard Data Aggregation

```
Admin UI       Gateway        Admin Service     Audit Svc    Notif Engine   Channel Router   Event Ingestion
   │              │                │                │              │               │                │
   │ GET /api/v1/ │                │                │              │               │                │
   │ dashboard    │                │                │              │               │                │
   │ ?period=7d   │                │                │              │               │                │
   │─────────────▶│                │                │              │               │                │
   │              │───────────────▶│                │              │               │                │
   │              │                │                │              │               │                │
   │              │                │  Promise.all() │              │               │                │
   │              │                │                │              │               │                │
   │              │                │  GET /audit/   │              │               │                │
   │              │                │  stats/volume  │              │               │                │
   │              │                │───────────────▶│              │               │                │
   │              │                │                │              │               │                │
   │              │                │  GET /engine/  │              │               │                │
   │              │                │  stats/top-    │              │               │                │
   │              │                │  rules         │              │               │                │
   │              │                │───────────────────────────────▶               │                │
   │              │                │                │              │               │                │
   │              │                │  GET /channels/│              │               │                │
   │              │                │  health        │              │               │                │
   │              │                │───────────────────────────────────────────────▶│                │
   │              │                │                │              │               │                │
   │              │                │  GET /event-   │              │               │                │
   │              │                │  sources       │              │               │                │
   │              │                │──────────────────────────────────────────────────────────────▶│
   │              │                │                │              │               │                │
   │              │                │◄───────────────│              │               │                │
   │              │                │◄───────────────────────────────               │                │
   │              │                │◄───────────────────────────────────────────────│                │
   │              │                │◄──────────────────────────────────────────────────────────────│
   │              │                │                │              │               │                │
   │              │                │  Assemble      │              │               │                │
   │              │                │  response      │              │               │                │
   │              │                │                │              │               │                │
   │              │  200 OK        │                │              │               │                │
   │              │  { volume,     │                │              │               │                │
   │              │    rates, ... }│                │              │               │                │
   │              │◄───────────────│                │              │               │                │
   │  200 OK      │                │                │              │               │                │
   │◄─────────────│                │                │              │               │                │
```

---

## 16. Error Handling

### Error Categories

| Category | HTTP Status | Handling | Retry Policy |
|---|---|---|---|
| **User Not Found** | 404 | Return error with user ID | No |
| **Email Conflict** | 409 | Return conflict error with existing email | No |
| **Password Policy Violation** | 400 | Return specific policy failure details | No |
| **Account Locked** | 429 | Return `Retry-After` header with lockout expiry | Wait for lockout to expire |
| **RBAC Forbidden** | 403 | Return forbidden with required role | No |
| **Resource-Level Forbidden** | 403 | Return forbidden with reason (e.g., "Cannot modify Super Admin") | No |
| **Downstream Service Error** | 502 | Log upstream error, return generic "Service unavailable" | Yes — transient |
| **Downstream Service Timeout** | 504 | Log timeout, return gateway timeout | Yes — transient |
| **Validation Error** | 400 | Return detailed field-level validation errors | No |
| **Cross-Service Validation** | 400 | Return specific failure (e.g., "Template not found") | No |
| **SAML Configuration Error** | 400 | Return metadata parsing error details | No |
| **Database Error** | 500 | Log error, return generic server error | Yes — transient |
| **RabbitMQ Publish Failure** | N/A | Log warning, do not fail admin operation | Best-effort |

### Error Response Format

All error responses follow a consistent JSON structure:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Rule validation failed",
  "details": [
    { "field": "actions[0].templateId", "error": "Template 'abc-uuid' not found or inactive" },
    { "field": "suppression.modes.dedup.windowMinutes", "error": "Must be a positive integer" }
  ]
}
```

### Downstream Service Failure Handling

When a downstream service is unavailable, the Admin Service applies the following strategy:

| Scenario | Behavior |
|---|---|
| **CRUD operation** (rule, template, channel, mapping) | Return `502 Bad Gateway` with a message indicating which service is unavailable |
| **Dashboard aggregation** | Return partial results with `degraded: true` flag |
| **Cross-service validation** (pre-validation checks) | Return `400` with a message indicating validation could not be completed |
| **Cache invalidation** (RabbitMQ publish) | Log warning, complete the admin operation successfully |

---

## 17. Security Considerations

### 17.1 Authentication Boundary

The Admin Service is the credential validation authority for local authentication. It stores bcrypt-hashed passwords, enforces password policies, manages account lockouts, and issues JWT tokens after successful authentication. SAML SSO authentication delegates to the external IdP but converges on the same JWT token model.

| Concern | Implementation |
|---|---|
| **Password storage** | bcrypt with cost factor 12; raw passwords never stored or logged |
| **Password history** | Last 5 hashes stored in `password_history` JSONB to prevent reuse |
| **Account lockout** | 5 failed attempts in 15 minutes → 15-minute auto-lock |
| **JWT issuance** | RS256 asymmetric signing; access tokens (15min) + refresh tokens (7 days with rotation) |
| **Session invalidation** | Password reset, account deactivation, and suspicious activity trigger all-session revocation |

### 17.2 SAML Security

| Concern | Implementation |
|---|---|
| **Assertion validation** | Signature verification using IdP's X.509 certificate; audience restriction check; time-based validity (NotBefore, NotOnOrAfter) |
| **SP private key** | Encrypted at rest in `saml_identity_providers.sp_private_key` using AES-256-GCM |
| **Replay prevention** | `InResponseTo` validation against pending authentication requests; one-time assertion use |
| **Certificate rotation** | IdP certificate expiry warnings (30/14/7 days) shown in Admin UI |

### 17.3 Credential Encryption at Rest

Provider credentials managed through the Admin Service (channel API keys, SMTP passwords, webhook secrets) are encrypted at the application level before being stored by the Channel Router:

| Data | Encryption | Key Management |
|---|---|---|
| Channel provider API keys | AES-256-GCM | Cloud KMS (envelope encryption) |
| SMTP passwords | AES-256-GCM | Cloud KMS |
| SAML SP private keys | AES-256-GCM | Cloud KMS |
| Webhook signing secrets | AES-256-GCM | Cloud KMS |

### 17.4 Audit Logging

All admin operations that create, update, or delete resources are audit-logged. The audit record includes:

| Field | Description |
|---|---|
| `userId` | Admin user who performed the action |
| `action` | Operation type (e.g., `rule.created`, `user.deactivated`, `mapping.updated`) |
| `resourceType` | Resource category (e.g., `rule`, `template`, `user`, `mapping`, `channel`) |
| `resourceId` | ID of the affected resource |
| `previousValue` | Resource state before the change (for updates) |
| `newValue` | Resource state after the change (for creates and updates) |
| `ipAddress` | Client IP address |
| `timestamp` | When the action occurred |

### 17.5 Input Validation

All incoming payloads are validated using NestJS `class-validator` DTOs:

- **String fields:** Length limits, pattern matching (e.g., email format, slug format)
- **JSONB fields:** Schema validation for `conditions`, `actions`, `suppression`, `fieldMappings`, `attributeMapping`
- **UUID fields:** Format validation for all `id` parameters
- **Query parameters:** Type coercion and range validation (`page >= 1`, `limit <= 200`)

---

## 18. Monitoring & Health Checks

### Key Metrics

| Metric | Description | Alert Threshold |
|---|---|---|
| `admin_login_total` | Total login attempts (by method: local/saml, by result: success/failure) | — |
| `admin_login_failures_total` | Failed login attempts | > 20/min |
| `admin_account_lockouts_total` | Account lockout events | > 5/hour |
| `admin_crud_total` | CRUD operations (by resource type: rule/template/mapping/channel/user) | — |
| `admin_crud_duration_ms` | CRUD operation latency (p50, p95, p99) | p99 > 2000ms |
| `admin_downstream_errors_total` | Failed calls to downstream services (by service) | > 10/min |
| `admin_downstream_latency_ms` | Downstream service call latency (by service) | p95 > 5000ms |
| `admin_dashboard_latency_ms` | Dashboard aggregation latency | p95 > 3000ms |
| `admin_dashboard_degraded_total` | Dashboard responses with degraded flag | > 5/hour |
| `admin_config_publish_total` | Config invalidation events published to RabbitMQ | — |
| `admin_config_publish_failures_total` | Failed config invalidation publishes | > 5/hour |
| `admin_active_users` | Number of active admin users (gauge) | — |
| `admin_saml_assertions_total` | SAML assertion validation attempts (by IdP, by result) | — |
| `admin_service_pool_active` | Active database connections | > 80% of pool |

### Health Check

The `GET /admin/health` endpoint verifies:

1. **Database Connectivity:** Executes a lightweight query (`SELECT 1`) and reports latency.
2. **RabbitMQ Connection:** Verifies the AMQP connection is active for config invalidation publishing.
3. **Downstream Services:** Pings each downstream service's `/health` endpoint and reports individual status.

### Structured Logging

All log entries use structured JSON format:

```json
{
  "timestamp": "2026-02-21T10:30:00.123Z",
  "level": "info",
  "service": "admin-service",
  "correlationId": "corr-uuid",
  "userId": "admin-user-uuid",
  "action": "rule.created",
  "resourceType": "rule",
  "resourceId": "rule-uuid",
  "message": "Notification rule created successfully",
  "durationMs": 245
}
```

---

## 19. Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3155` | HTTP server port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `RABBITMQ_URL` | — | RabbitMQ connection string (AMQP) |
| `JWT_PRIVATE_KEY` | — | RSA private key for JWT signing (PEM format) |
| `JWT_PUBLIC_KEY` | — | RSA public key for JWT verification (PEM format) |
| `JWT_ACCESS_TOKEN_EXPIRY` | `15m` | Access token expiry duration |
| `JWT_REFRESH_TOKEN_EXPIRY` | `7d` | Refresh token expiry duration |
| `BCRYPT_COST_FACTOR` | `12` | bcrypt hashing cost factor |
| `PASSWORD_MAX_AGE_DAYS` | `90` | Maximum password age before forced rotation |
| `PASSWORD_HISTORY_SIZE` | `5` | Number of previous passwords to check for reuse |
| `LOGIN_MAX_ATTEMPTS` | `5` | Failed login attempts before lockout |
| `LOGIN_LOCKOUT_MINUTES` | `15` | Account lockout duration |
| `DOWNSTREAM_TIMEOUT_MS` | `5000` | Timeout for downstream service HTTP calls |
| `DASHBOARD_TIMEOUT_MS` | `8000` | Timeout for dashboard aggregation (longer due to fan-out) |
| `SAML_SP_ENTITY_ID` | — | SAML Service Provider entity ID |
| `SAML_SP_ACS_URL` | — | SAML Assertion Consumer Service URL |
| `SAML_AUTO_PROVISION_DEFAULT_ROLE` | `Operator` | Default role for auto-provisioned SAML users |
| `CONFIG_INVALIDATION_ENABLED` | `true` | Enable/disable RabbitMQ config invalidation publishing |
| `LOG_LEVEL` | `info` | Logging level (`debug`, `info`, `warn`, `error`) |
| `HEALTH_CHECK_INTERVAL_MS` | `30000` | Health check polling interval |
| `CREDENTIAL_ENCRYPTION_KEY` | — | AES-256 key for encrypting stored credentials (or KMS key ARN) |

---

*Notification API Documentation v1.0 -- Architecture Team -- 2026*
