# 02 — Detailed Microservices

**Notification API — Service Specifications**

| | |
|---|---|
| **Version:** | 1.0 |
| **Date:** | 2026-02-19 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Table of Contents

1. [Microservices Overview](#1-microservices-overview)
2. [Notification Gateway (BFF)](#2-notification-gateway-bff)
3. [Event Ingestion Service](#3-event-ingestion-service)
4. [Notification Engine Service](#4-notification-engine-service)
5. [Template Service](#5-template-service)
6. [Channel Router Service](#6-channel-router-service)
7. [Admin Service](#7-admin-service)
8. [Audit Service](#8-audit-service)
9. [Email Ingest Service](#9-email-ingest-service)
10. [Bulk Upload Service](#10-bulk-upload-service)
11. [Notification Admin UI (Frontend)](#11-notification-admin-ui-frontend)
12. [Database Schema Overview](#12-database-schema-overview)
13. [Inter-Service Communication](#13-inter-service-communication)
14. [Security Considerations](#14-security-considerations)

---

## 1. Microservices Overview

The Notification API platform is composed of nine backend services, one frontend application, and a shared messaging backbone built on RabbitMQ. Each microservice is independently deployable, owns its own PostgreSQL database (where applicable), and communicates through well-defined synchronous (HTTP/REST) or asynchronous (AMQP) interfaces. This architecture enables the team to develop, test, scale, and deploy each service independently while maintaining clear ownership boundaries.

The following table provides a high-level summary of every service in the ecosystem. Detailed specifications for each service follow in subsequent sections.

| Service Name | Port | Database | Key Responsibility | Dependencies |
|---|---|---|---|---|
| **Notification Gateway** | `3000` | None (stateless) | BFF / API Gateway — auth, validation, routing | All internal services |
| **Event Ingestion** | `3001` | `event_ingestion_db` | Receive & normalize events from source systems | RabbitMQ |
| **Notification Engine** | `3002` | `notification_engine_db` | Rule matching, orchestration, lifecycle management | Event Ingestion, Template Service, Channel Router, RabbitMQ |
| **Template Service** | `3003` | `template_db` | Template CRUD, rendering with Handlebars | PostgreSQL |
| **Channel Router** | `3004` | `channel_router_db` | Route to delivery providers (SendGrid, Twilio, Firebase) | External providers, RabbitMQ |
| **Admin Service** | `3005` | `admin_db` | Backoffice administration, user & rule management | Notification Engine, Template Service, Channel Router |
| **Audit Service** | `3006` | `audit_db` | Event sourcing, delivery tracking, compliance logging | RabbitMQ (all status exchanges) |
| **Email Ingest** | `3007` / `2525` | `email_ingest_db` | SMTP ingest — receive emails, parse against rules, generate events | RabbitMQ, PostgreSQL |
| **Bulk Upload** | `3008` | `bulk_upload_db` | XLSX file upload — parse rows into event payloads, submit to Event Ingestion | Event Ingestion Service |
| **Notification Admin UI** | `3010` | None | Next.js backoffice for the operative team | Notification Gateway (BFF) |

---

## 2. Notification Gateway (BFF)

### Purpose

The Notification Gateway acts as the Backend-for-Frontend (BFF) and API Gateway for the entire platform. It is the single entry point for the Next.js admin frontend and any external API consumers. All inbound HTTP traffic is routed through this service, which handles cross-cutting concerns such as authentication, authorization, request validation, rate limiting, and API versioning before proxying requests to the appropriate internal microservice.

| Attribute | Value |
|---|---|
| **Technology** | NestJS |
| **Port** | `3000` |
| **Database** | None (stateless proxy) |
| **Dependencies** | All internal microservices |

### Responsibilities

- **Authentication & Authorization:** Validates JWT tokens issued by the platform's own auth system (local login or SAML SSO). Enforces role-based access control (RBAC) for admin endpoints and API-key authentication for external integrations. See [04 — Authentication & Identity](04-authentication-identity.md) for full details.
- **Request Validation:** Leverages NestJS class-validator and class-transformer to validate and sanitize all incoming payloads before they reach downstream services.
- **Rate Limiting:** Applies configurable per-client and per-endpoint rate limits using a sliding window algorithm backed by an in-memory store (with Redis upgrade path).
- **API Versioning:** Supports URL-based versioning (`/api/v1/`) with clear deprecation headers for older versions.
- **Request Routing:** Proxies validated requests to the correct internal service using NestJS `HttpService` (Axios-based).
- **Response Transformation:** Normalizes response envelopes to a consistent structure (`{ data, meta, errors }`) regardless of which internal service handles the request.
- **CORS Configuration:** Allows the Next.js frontend origin while blocking unauthorized cross-origin requests.

### Key API Endpoints

**POST** `/api/v1/notifications/send` — Manually send a notification. Accepts a payload with recipient details, template ID, channel preferences, and variable data. The request is forwarded to the Notification Engine for processing.

**GET** `/api/v1/notifications` — List notifications with filters. Supports query parameters: `status`, `channel`, `dateFrom`, `dateTo`, `recipientEmail`, `page`, `limit`. Returns paginated results with metadata.

**GET** `/api/v1/notifications/:id` — Retrieve full details for a specific notification, including its lifecycle status log, delivery attempts, and rendered content for each channel.

**GET** `/api/v1/templates` — List all notification templates. Supports query parameters: `channel`, `search`, `isActive`, `page`, `limit`. Returns template summaries without full body content.

**POST** `/api/v1/templates` — Create a new notification template. Requires `name`, `description`, and at least one channel variant. Template variables are auto-detected from Handlebars expressions in the body.

**PUT** `/api/v1/templates/:id` — Update an existing template. Creates a new version internally; previous versions are retained for audit purposes. Supports partial updates.

**GET** `/api/v1/channels` — List all available notification channels (Email, SMS, WhatsApp, Push) with their current configuration status, provider details, and health indicators.

**PUT** `/api/v1/channels/:id/config` — Update the configuration for a specific channel. Includes provider credentials, sender identity settings, and channel-specific options (e.g., email reply-to address, SMS sender ID).

**GET** `/api/v1/rules` — List notification rules with pagination and filters. Supports filtering by `eventType`, `isActive`, and `channel`.

**POST** `/api/v1/rules` — Create a new notification rule. Defines the mapping between an event type and the notification actions to execute (template, channels, recipients).

**GET** `/api/v1/email-ingest/parsing-rules` — List all email parsing rules. Supports query parameters: `isActive`, `eventType`, `page`, `limit`. Proxied to the Email Ingest Service.

**POST** `/api/v1/email-ingest/parsing-rules` — Create a new email parsing rule. Defines sender filters, subject/body regex patterns, and event type mapping. Proxied to the Email Ingest Service.

**GET** `/api/v1/email-ingest/processed-emails` — List processed emails with filters. Supports query parameters: `status`, `sender`, `dateFrom`, `dateTo`, `page`, `limit`. Proxied to the Email Ingest Service.

**POST** `/api/v1/bulk-upload/uploads` — Upload an XLSX file for bulk event submission. Accepts `multipart/form-data` with a single `.xlsx` file (max 10 MB, max 5,000 rows). Returns `202 Accepted` with `uploadId`. Proxied to the Bulk Upload Service.

**GET** `/api/v1/bulk-upload/uploads` — List bulk uploads with pagination and filters. Supports query parameters: `status`, `uploadedBy`, `dateFrom`, `dateTo`, `page`, `limit`. Proxied to the Bulk Upload Service.

**GET** `/api/v1/bulk-upload/uploads/:id` — Get upload status and progress for a specific upload. Returns total, processed, succeeded, and failed row counts. Proxied to the Bulk Upload Service.

**GET** `/api/v1/bulk-upload/uploads/:id/errors` — Get failed row details for a specific upload. Returns row number, error message, and raw data for each failed row. Proxied to the Bulk Upload Service.

**POST** `/api/v1/bulk-upload/uploads/:id/retry` — Retry failed rows for a specific upload. Only available when upload status is `partial` or `failed`. Requires Admin role. Proxied to the Bulk Upload Service.

**DELETE** `/api/v1/bulk-upload/uploads/:id` — Cancel an in-progress upload or delete a completed upload record. Requires Admin role. Proxied to the Bulk Upload Service.

**GET** `/api/v1/audit/logs` — Retrieve audit logs with comprehensive filtering. Supports query parameters: `action`, `userId`, `resourceType`, `dateFrom`, `dateTo`, `page`, `limit`.

**GET** `/api/v1/dashboard/stats` — Dashboard statistics endpoint. Returns aggregated metrics including total notifications sent (by channel, by status), delivery success rates, average delivery latency, and trend data for configurable time windows.

**POST** `/api/v1/auth/login` — Local authentication endpoint. Validates email/password credentials and issues JWT access token + refresh token cookie. Rate limited: 5 failed attempts per account per 15 minutes.

**POST** `/api/v1/auth/saml/acs` — SAML Assertion Consumer Service. Receives SAML Response from the IdP (Azure AD), validates the assertion, links or creates the user, and issues JWT tokens. See [04 — Authentication & Identity](04-authentication-identity.md).

**GET** `/api/v1/auth/saml/metadata` — Returns the SAML Service Provider metadata XML document for configuring trust in the Identity Provider.

> **Note:** **Authentication Strategy**
> The gateway uses a two-tier authentication model. Admin users authenticate via local credentials (email/password) or SAML 2.0 SSO with Azure AD — both methods issue platform-managed JWT tokens (short-lived access tokens with refresh token rotation). External system integrations (OMS, Magento, etc.) authenticate using API keys passed in the `X-API-Key` header. API keys are scoped to specific endpoints and rate-limited independently. All tokens and keys are validated on every request before proxying to internal services. Internal service-to-service calls bypass the gateway and use mutual TLS or shared secrets. See [04 — Authentication & Identity](04-authentication-identity.md) for the complete authentication design.

---

## 3. Event Ingestion Service

### Purpose

The Event Ingestion Service is the universal entry point for all business events that may trigger notifications. It receives events from five distinct source systems — OMS (in-house order management), Magento 2 (eCommerce platform), Mirakl Marketplace, Chat Commerce, and manual triggers — normalizes them into a canonical event schema, and publishes them to the internal RabbitMQ exchange for downstream processing.

| Attribute | Value |
|---|---|
| **Technology** | NestJS with RabbitMQ consumers (amqplib / @golevelup/nestjs-rabbitmq) |
| **Port** | `3001` |
| **Database** | PostgreSQL — `event_ingestion_db` |
| **Dependencies** | RabbitMQ, PostgreSQL |

### Responsibilities

- **RabbitMQ Consumers:** Dedicated consumers for each source system (OMS, Magento 2, Mirakl, Chat Commerce) that listen on source-specific queues. Each consumer understands the schema of its source system and can map it to the canonical format.
- **REST Webhook Endpoint:** An HTTP endpoint (`POST /webhooks/events`) for external integrations that cannot publish directly to RabbitMQ. Accepts events with a source identifier and processes them through the same normalization pipeline.
- **Event Schema Validation:** Validates incoming events against registered JSON schemas per source and event type. Invalid events are rejected with detailed error messages and logged for investigation.
- **Event Normalization:** Transforms source-specific event payloads into the canonical event format. This includes field mapping, data type coercion, timestamp normalization (to ISO-8601 UTC), and enrichment with metadata (correlation IDs, source event IDs).
- **Publishing Normalized Events:** Publishes validated and normalized events to the `events.normalized` exchange with appropriate routing keys for downstream consumers.
- **Event Persistence:** Stores all raw and normalized events in the database for auditability and replay capabilities.

### RabbitMQ Configuration

#### Exchanges

| Exchange | Type | Purpose | Durable |
|---|---|---|---|
| `events.incoming` | Topic | Receives raw events from source systems | Yes |
| `events.normalized` | Topic | Publishes normalized canonical events | Yes |

#### Queues

| Queue | Bound To | Routing Key | Consumer Concurrency |
|---|---|---|---|
| `events.oms` | `events.incoming` | `source.oms.#` | 3 |
| `events.magento` | `events.incoming` | `source.magento.#` | 3 |
| `events.mirakl` | `events.incoming` | `source.mirakl.#` | 2 |
| `events.chat` | `events.incoming` | `source.chat.#` | 2 |
| `events.webhook` | `events.incoming` | `source.webhook.#` | 2 |
| `q.events.email-ingest` | `events.incoming` | `source.email-ingest.#` | 2 |

### Canonical Event Schema

```json
{
  "eventId": "af47ac10b-58cc-4372-a567-0e02b2c3d479",
  "source": "oms | magento | mirakl | chat | manual | email-ingest",
  "eventType": "order.created | order.shipped | order.delivered | order.cancelled | payment.confirmed | return.requested | return.approved | chat.escalated",
  "timestamp": "2026-02-19T14:30:00.000Z",
  "payload": {
    "orderId": "ORD-2026-00451",
    "customerEmail": "customer@example.com",
    "customerName": "Jane Doe",
    "customerPhone": "+1234567890",
    "items": [
      {
        "sku": "PROD-001",
        "name": "Wireless Headphones",
        "quantity": 1,
        "price": 79.99
      }
    ],
    "totalAmount": 79.99,
    "currency": "USD"
  },
  "metadata": {
    "correlationId": "corr-8f14e45f-ceea-467f-a8f5-5f1b39e5c7e2",
    "sourceEventId": "OMS-EVT-78901",
    "receivedAt": "2026-02-19T14:30:00.123Z",
    "normalizedAt": "2026-02-19T14:30:00.456Z",
    "schemaVersion": "1.0"
  }
}
```

### Database Tables

| Table | Description | Key Columns |
|---|---|---|
| `events` | Stores all ingested events (raw and normalized) | `id`, `event_id`, `source`, `event_type`, `raw_payload`, `normalized_payload`, `status`, `created_at` |
| `event_sources` | Registered source system configurations | `id`, `name`, `type`, `connection_config`, `is_active`, `created_at` |
| `event_schemas` | JSON schemas for validating events per source and type | `id`, `source`, `event_type`, `schema_json`, `version`, `is_active` |

### Key Endpoints

**POST** `/webhooks/events` — Receive webhook events from external integrations. Expects a JSON body with `source`, `eventType`, and `payload` fields. Returns `202 Accepted` with an `eventId` for tracking. The event is validated, normalized, and published asynchronously.

**GET** `/health` — Health check endpoint. Returns the service status, RabbitMQ connection health, database connectivity, and consumer queue depths.

> **Info:** **Idempotency Handling**
> Every incoming event is assigned or carries a `sourceEventId` from the originating system. The Event Ingestion Service maintains a deduplication window (configurable, default 24 hours) using a unique constraint on `(source, source_event_id)` in the `events` table. If a duplicate event is received within the window, the service returns `200 OK` with the existing `eventId` and does not re-publish to RabbitMQ. This guarantees at-least-once delivery semantics without producing duplicate notifications downstream.

---

## 4. Notification Engine Service

### Purpose

The Notification Engine is the central orchestrator of the platform — the "brain" that determines what notifications to send, to whom, using which templates and channels. It consumes normalized events, evaluates them against a configurable rule engine, resolves recipient lists, coordinates template rendering, and dispatches notifications to the Channel Router for delivery.

| Attribute | Value |
|---|---|
| **Technology** | NestJS |
| **Port** | `3002` |
| **Database** | PostgreSQL — `notification_engine_db` |
| **Dependencies** | Event Ingestion (via RabbitMQ), Template Service (HTTP), Channel Router (via RabbitMQ), PostgreSQL |

### Responsibilities

- **Event Consumption:** Subscribes to the `events.normalized` exchange and processes each normalized event through the rule evaluation pipeline.
- **Rule Matching:** Evaluates each event against all active notification rules. A rule matches when the event type equals the rule's configured event type and all additional conditions (e.g., source channel, order priority, customer segment) are satisfied.
- **Recipient Resolution:** Determines the notification recipients based on the rule's `recipientType`. For `customer`, extracts contact details from the event payload. For `group`, resolves the recipient group membership. For `custom`, uses the explicitly defined recipient list.
- **Template Rendering Coordination:** Calls the Template Service (HTTP) to render the appropriate template for each channel, passing the event payload as variable data.
- **Dispatch to Channel Router:** Publishes rendered notifications to the `notifications.deliver` exchange with channel-specific routing keys for the Channel Router to pick up.
- **Lifecycle Management:** Tracks each notification through its lifecycle states: **[Pending]** **[Processing]** **[Sent]** **[Delivered]** **[Failed]**. Status transitions are logged in the `notification_status_log` table.
- **Recipient Preferences:** Respects recipient opt-out preferences and channel preferences before dispatching notifications.
- **Suppression & Deduplication:** Evaluates optional per-rule suppression policies (deduplication windows, max send counts, cooldown periods) after recipient resolution to prevent duplicate or excessive notifications.

### Rule Engine

The rule engine uses a declarative, condition-based matching system. When a normalized event arrives, the engine queries all active rules whose `eventType` matches the event. For each matching rule, it evaluates the `conditions` object against the event payload using a simple expression evaluator. Conditions support equality checks, "in" list checks, and nested property access. When all conditions are satisfied, the rule's `actions` array is executed sequentially — each action specifies a template, a set of channels, and a recipient type.

Rules are prioritized by a `priority` field (lower number = higher priority). If multiple rules match a single event, all matching rules are executed unless a rule is marked as `exclusive`, in which case only the highest-priority exclusive rule runs and subsequent matches are skipped.

### Suppression & Deduplication

Each notification rule may include an optional `suppression` configuration (JSONB) that prevents duplicate or excessive notifications. Suppression is evaluated **per-recipient**, after recipient resolution and before template rendering. If a notification is suppressed, it is logged with a `SUPPRESSED` terminal status in the `notification_status_log` table but not persisted as a full `notifications` row, keeping send counts accurate.

#### Suppression Configuration Structure

| Field | Type | Description |
|---|---|---|
| `dedupKey` | `string[]` | Array of dot-notation paths resolved against the event context and recipient (e.g., `["eventType", "payload.orderId", "recipient.email"]`). Values are concatenated and SHA-256 hashed into a fixed-length lookup key. |
| `modes.dedup` | `{ windowMinutes: number }` | Suppress if any notification with the same dedup key hash was sent within the specified window. |
| `modes.maxCount` | `{ limit: number, windowMinutes: number }` | Suppress if `limit` or more notifications with the same dedup key hash were sent within the specified window. |
| `modes.cooldown` | `{ intervalMinutes: number }` | Suppress if the last notification with the same dedup key hash was sent less than `intervalMinutes` ago. |

#### Dedup Key Resolution

At evaluation time, each path in the `dedupKey` array is resolved against the combined event context (event type, source, payload) and the current recipient. The resolved values are concatenated with a pipe delimiter and hashed using SHA-256 to produce a fixed 64-character hex string stored in the `dedup_key_hash` column. The original resolved values are also stored in `dedup_key_values` (JSONB) for human-readable display in the Admin UI.

#### Suppression Evaluation Logic

When a rule has a `suppression` configuration, the engine evaluates all configured modes in order: **dedup → cooldown → maxCount**. The first mode that triggers causes the notification to be suppressed — all modes must pass for the notification to proceed (logical AND). The suppression reason is recorded in the status log metadata.

#### Suppression Query

```sql
SELECT id, status, created_at
FROM notifications
WHERE rule_id = :ruleId
  AND dedup_key_hash = :hash
  AND status NOT IN ('FAILED')
  AND created_at >= NOW() - INTERVAL ':windowMinutes minutes'
ORDER BY created_at DESC;
```

This query leverages a partial index on `(rule_id, dedup_key_hash, created_at DESC) WHERE dedup_key_hash IS NOT NULL` for efficient lookups.

#### Failed Notification Exclusion

Notifications with `FAILED` status are excluded from suppression queries (`WHERE status NOT IN ('FAILED')`) so that failed delivery attempts do not block legitimate retries or re-sends.

> **Info:** **Optional Per-Rule Configuration**
> Suppression is entirely optional. When the `suppression` field is `NULL` (the default), the rule operates without any deduplication or rate limiting — every matched event produces a notification. This ensures backward compatibility with existing rules.

#### Example Suppression Configurations

**Late Delivery — no repeat within 24h:**
```json
"suppression": {
  "dedupKey": ["eventType", "payload.orderId", "recipient.email"],
  "modes": { "dedup": { "windowMinutes": 1440 } }
}
```

**Order Status — max 5 per order per week:**
```json
"suppression": {
  "dedupKey": ["payload.orderId", "recipient.email"],
  "modes": { "maxCount": { "limit": 5, "windowMinutes": 10080 } }
}
```

**Promo Reminder — cooldown 3 days per customer:**
```json
"suppression": {
  "dedupKey": ["recipient.email"],
  "modes": { "cooldown": { "intervalMinutes": 4320 } }
}
```

**Payment Failure — combined dedup + max 3/week + 4h cooldown:**
```json
"suppression": {
  "dedupKey": ["eventType", "payload.orderId", "payload.paymentAttemptId", "recipient.email"],
  "modes": {
    "dedup": { "windowMinutes": 10080 },
    "maxCount": { "limit": 3, "windowMinutes": 10080 },
    "cooldown": { "intervalMinutes": 240 }
  }
}
```

### RabbitMQ Configuration

| Direction | Exchange / Queue | Routing Key | Purpose |
|---|---|---|---|
| Consumes | `events.normalized` / `engine.events` | `event.#` | Receive normalized events for rule evaluation |
| Publishes | `notifications.render` | `notification.render.{channel}` | Request template rendering (if async rendering is enabled) |
| Publishes | `notifications.deliver` | `notification.deliver.{channel}` | Dispatch rendered notifications for delivery |

### Database Tables

| Table | Description | Key Columns |
|---|---|---|
| `notification_rules` | Rule definitions with event type, conditions, and actions | `id`, `name`, `event_type`, `conditions`, `actions`, `suppression`, `priority`, `is_exclusive`, `is_active`, `created_at`, `updated_at` |
| `notifications` | Core notification records | `id`, `event_id`, `rule_id`, `template_id`, `status`, `channels`, `dedup_key_hash`, `dedup_key_values`, `created_at`, `updated_at` |
| `notification_recipients` | Resolved recipients for each notification | `id`, `notification_id`, `recipient_type`, `email`, `phone`, `device_token`, `status` |
| `notification_status_log` | Lifecycle status transitions | `id`, `notification_id`, `from_status`, `to_status`, `channel`, `metadata`, `created_at` |
| `recipient_groups` | Named groups of recipients for bulk notifications | `id`, `name`, `description`, `member_count`, `is_active` |
| `recipient_preferences` | Per-recipient channel opt-in/opt-out preferences | `id`, `recipient_email`, `channel`, `is_opted_in`, `updated_at` |

### Rule Configuration Schema

```json
{
  "ruleId": "r-550e8400-e29b-41d4-a716-446655440000",
  "name": "Order Shipped Notification",
  "eventType": "order.shipped",
  "conditions": {
    "source": { "$in": ["oms", "magento"] },
    "payload.totalAmount": { "$gte": 0 },
    "payload.customerEmail": { "$exists": true }
  },
  "actions": [
    {
      "templateId": "tpl-order-shipped",
      "channels": ["email", "sms", "push"],
      "recipientType": "customer",
      "delayMinutes": 0
    },
    {
      "templateId": "tpl-order-shipped-internal",
      "channels": ["email"],
      "recipientType": "group",
      "recipientGroupId": "grp-ops-team",
      "delayMinutes": 5
    }
  ],
  "suppression": {
    "dedupKey": ["eventType", "payload.orderId", "recipient.email"],
    "modes": {
      "cooldown": { "intervalMinutes": 1440 }
    }
  },
  "priority": 10,
  "isExclusive": false,
  "isActive": true,
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-02-10T08:30:00.000Z"
}
```

> **Success:** **Decoupled Rule-Based Architecture**
> The rule-based approach completely decouples event producers from notification logic. Source systems (OMS, Magento, Mirakl, Chat Commerce) publish events without any knowledge of what notifications will be triggered. The operative team can create, modify, enable, or disable notification rules at any time through the Admin UI without requiring code changes or deployments. This empowers the business team to respond rapidly to changing communication requirements — adding a new WhatsApp channel to an existing order confirmation rule, for example, takes seconds rather than a development sprint.

---

## 5. Template Service

### Purpose

The Template Service manages the full lifecycle of notification message templates. It provides CRUD operations for templates, supports multi-channel variants (HTML email, plain text SMS, WhatsApp messages, push notification content), renders templates with dynamic variable substitution using the Handlebars engine, and maintains a complete version history for audit and rollback capabilities.

| Attribute | Value |
|---|---|
| **Technology** | NestJS with Handlebars (handlebars.js) |
| **Port** | `3003` |
| **Database** | PostgreSQL — `template_db` |
| **Dependencies** | PostgreSQL |

### Responsibilities

- **Template CRUD:** Full create, read, update, and delete operations for notification templates. Each template has a unique slug, display name, description, and one or more channel variants.
- **Multi-Channel Variants:** A single template can have different content variants for each notification channel — an HTML-rich email, a concise SMS (limited to 160 characters), a WhatsApp message (with optional media), and a push notification (title + body, limited to 256 characters total).
- **Variable Substitution:** Uses Handlebars for dynamic content rendering. Supports simple variables (`{{customerName}}`), conditional blocks (`{{#if trackingUrl}}`), iteration (`{{#each items}}`), and custom helpers (e.g., `{{formatCurrency totalAmount currency}}`, `{{formatDate timestamp "MMM DD, YYYY"}}`).
- **Template Versioning:** Every update creates a new version. Previous versions are immutable and retained indefinitely. Active notifications reference a specific version ID, ensuring delivery consistency even if a template is modified after a notification is queued.
- **Template Preview & Testing:** Endpoints to preview a rendered template with sample data and send a test notification to a specified recipient.

### Database Tables

| Table | Description | Key Columns |
|---|---|---|
| `templates` | Master template records | `id`, `slug`, `name`, `description`, `current_version_id`, `is_active`, `created_at`, `updated_at` |
| `template_versions` | Immutable version snapshots | `id`, `template_id`, `version_number`, `change_summary`, `created_by`, `created_at` |
| `template_channels` | Channel-specific content for each version | `id`, `template_version_id`, `channel`, `subject`, `body`, `metadata` |
| `template_variables` | Declared template variables with defaults and descriptions | `id`, `template_id`, `variable_name`, `description`, `default_value`, `is_required` |

### Template Structure

```json
{
  "id": "tpl-order-shipped",
  "slug": "order-shipped",
  "name": "Order Shipped Confirmation",
  "description": "Sent to customers when their order has been dispatched",
  "currentVersion": 3,
  "isActive": true,
  "channels": {
    "email": {
      "subject": "Your order {{orderNumber}} has been shipped!",
      "body": "<html><body><h1>Hi {{customerName}},</h1><p>Great news! Your order <strong>{{orderNumber}}</strong> has been shipped.</p>{{#if trackingUrl}}<p><a href=\"{{trackingUrl}}\">Track your package</a></p>{{/if}}<p>Estimated delivery: {{estimatedDelivery}}</p>{{#each items}}<p>- {{this.name}} (x{{this.quantity}})</p>{{/each}}</body></html>"
    },
    "sms": {
      "body": "Hi {{customerName}}, your order {{orderNumber}} has been shipped! {{#if trackingUrl}}Track it: {{trackingUrl}}{{/if}}"
    },
    "whatsapp": {
      "body": "Hello {{customerName}}! Your order *{{orderNumber}}* is on its way. {{#if trackingUrl}}Track your delivery here: {{trackingUrl}}{{/if}} Estimated arrival: {{estimatedDelivery}}"
    },
    "push": {
      "title": "Order Shipped",
      "body": "Your order {{orderNumber}} is on its way!",
      "data": {
        "orderId": "{{orderId}}",
        "action": "open_order_tracking"
      }
    }
  },
  "variables": [
    "customerName", "orderNumber", "trackingUrl",
    "estimatedDelivery", "items", "orderId"
  ]
}
```

### Key Endpoints

**GET** `/templates` — List all templates with pagination. Supports filters: `channel`, `isActive`, `search` (name/slug). Returns template metadata without full body content.

**POST** `/templates` — Create a new template with channel variants. Validates Handlebars syntax, auto-detects variables, and creates version 1.

**GET** `/templates/:id` — Retrieve full template details including all channel variants, variables, and version history.

**PUT** `/templates/:id` — Update a template. Creates a new immutable version. Requires a `changeSummary` field describing the modification.

**POST** `/templates/:id/render` — Render a template with provided variable data. Accepts `channel` and `data` in the request body. Returns the fully rendered content for the specified channel.

**POST** `/templates/:id/preview` — Preview a template with sample data across all channels. Returns rendered previews for each channel variant without sending any actual notifications.

### Supported Variables

| Variable | Type | Description | Example |
|---|---|---|---|
| `{{customerName}}` | String | Full name of the customer | Jane Doe |
| `{{customerEmail}}` | String | Customer email address | jane@example.com |
| `{{orderNumber}}` | String | Order reference number | ORD-2026-00451 |
| `{{trackingUrl}}` | String | Package tracking URL | https://track.carrier.com/ABC123 |
| `{{estimatedDelivery}}` | String | Expected delivery date | Feb 25, 2026 |
| `{{totalAmount}}` | Number | Order total amount | 79.99 |
| `{{currency}}` | String | Currency code | USD |
| `{{items}}` | Array | List of order items (iterable with `{{#each}}`) | [{ name, sku, quantity, price }] |
| `{{storeName}}` | String | Name of the store or brand | MyStore |
| `{{supportUrl}}` | String | Customer support link | https://support.mystore.com |
| `{{unsubscribeUrl}}` | String | Notification opt-out link | https://mystore.com/unsubscribe?token=xyz |

> **Info:** **Handlebars Template Engine**
> The Template Service uses [Handlebars.js](https://handlebarsjs.com/) as its rendering engine. Handlebars provides logic-less templates with a simple `{{variable}}` syntax, conditional blocks (`{{#if}}`, `{{#unless}}`), iteration (`{{#each}}`), and partials. The service registers custom helpers for common formatting needs: `{{formatCurrency amount code}}` for locale-aware currency formatting, `{{formatDate date pattern}}` for date formatting, `{{uppercase text}}` and `{{lowercase text}}` for text transformation, and `{{truncate text length}}` for safe text truncation. Templates are pre-compiled and cached in memory for high-performance rendering.

---

## 6. Channel Router Service

### Purpose

The Channel Router Service is responsible for the last-mile delivery of notifications. It receives rendered notification messages from the Notification Engine (via RabbitMQ), routes them to the appropriate external delivery provider based on the target channel, manages delivery retries with exponential backoff, implements circuit breaker patterns for provider resilience, tracks delivery statuses, and supports fallback channel logic when a primary channel fails.

| Attribute | Value |
|---|---|
| **Technology** | NestJS |
| **Port** | `3004` |
| **Database** | PostgreSQL — `channel_router_db` |
| **Dependencies** | RabbitMQ, External providers (SendGrid, Twilio, Firebase), PostgreSQL |

### Responsibilities

- **Channel Routing Logic:** Receives notifications tagged with a target channel and routes them to the corresponding provider adapter. Each adapter encapsulates the provider-specific API integration.
- **Provider Integration:** Maintains dedicated adapter modules for each external provider — SendGrid for transactional email, Twilio for SMS and WhatsApp messaging, and Firebase Cloud Messaging (FCM) for push notifications.
- **Retry Logic with Exponential Backoff:** Failed deliveries are retried with configurable exponential backoff delays. Each channel has its own retry policy (max attempts, base delay, backoff multiplier). After exhausting retries, the notification is moved to the dead letter queue.
- **Circuit Breaker Pattern:** Implements a circuit breaker for each provider. If a provider exceeds a failure threshold within a time window, the circuit opens and subsequent requests are immediately failed (fast-fail) until the provider recovers. This prevents cascading failures and resource exhaustion.
- **Delivery Status Tracking:** Publishes delivery status updates (sent, delivered, bounced, failed) to the `notifications.status` exchange for consumption by the Audit Service and Notification Engine.
- **Fallback Channel Support:** When a primary channel fails after all retries, the service can optionally trigger a fallback channel (e.g., if SMS delivery fails, attempt email delivery) based on the notification's fallback configuration.
- **Webhook Receivers:** Exposes webhook endpoints for delivery status callbacks from providers (SendGrid delivery events, Twilio status callbacks).

### Database Tables

| Table | Description | Key Columns |
|---|---|---|
| `channels` | Channel definitions (email, sms, whatsapp, push) | `id`, `name`, `type`, `is_active`, `provider_id`, `created_at` |
| `channel_configs` | Channel-level settings (sender identity, limits) | `id`, `channel_id`, `config_key`, `config_value`, `is_encrypted` |
| `delivery_attempts` | Record of each delivery attempt per notification per channel | `id`, `notification_id`, `channel`, `attempt_number`, `status`, `provider_response`, `error_message`, `attempted_at` |
| `provider_configs` | External provider credentials and settings | `id`, `provider_name`, `config_json`, `is_active`, `circuit_breaker_state`, `last_health_check` |

### RabbitMQ Configuration

| Direction | Exchange / Queue | Routing Key | Purpose |
|---|---|---|---|
| Consumes | `notifications.deliver` / `router.email` | `notification.deliver.email` | Email delivery queue |
| Consumes | `notifications.deliver` / `router.sms` | `notification.deliver.sms` | SMS delivery queue |
| Consumes | `notifications.deliver` / `router.whatsapp` | `notification.deliver.whatsapp` | WhatsApp delivery queue |
| Consumes | `notifications.deliver` / `router.push` | `notification.deliver.push` | Push notification delivery queue |
| Publishes | `notifications.status` | `notification.status.{outcome}` | Delivery status updates |
| DLQ | `notifications.dlq` | `#` | Dead letter queue for permanently failed deliveries |

### Provider Configuration

| Channel | Provider | Config Keys | Rate Limit |
|---|---|---|---|
| **[Email]** | SendGrid | `apiKey`, `fromAddress`, `fromName`, `replyToAddress` | 100 emails/sec |
| **[SMS]** | Twilio | `accountSid`, `authToken`, `fromNumber`, `messagingServiceSid` | 30 SMS/sec |
| **[WhatsApp]** | Twilio / Meta Business | `accountSid`, `authToken`, `businessNumber`, `templateNamespace` | 80 messages/sec |
| **[Push]** | Firebase Cloud Messaging | `projectId`, `serviceAccountKey`, `defaultTopic` | 500 messages/sec |

### Retry Strategy

| Attempt | Delay | Cumulative Wait | Applies To |
|---|---|---|---|
| 1st retry | 5 seconds | 5 seconds | All channels |
| 2nd retry | 30 seconds | 35 seconds | All channels |
| 3rd retry | 2 minutes | ~2.5 minutes | All channels |
| 4th retry | 10 minutes | ~12.5 minutes | Email, WhatsApp, Push |
| 5th retry | 30 minutes | ~42.5 minutes | Email only |
| Max exceeded | -- | -- | Moved to DLQ; fallback channel triggered if configured |

SMS has a maximum of 3 retry attempts due to the higher per-message cost and the time-sensitive nature of SMS content. Email allows up to 5 retries because delivery delays are more tolerable. Push notifications allow 4 retries. Retry delays use exponential backoff with jitter to avoid thundering herd effects.

> **Warning:** **Rate Limiting & Provider Quotas**
> Each external provider enforces its own rate limits and quotas. The Channel Router implements a token bucket rate limiter per provider to ensure outbound request rates stay within contractual limits. Exceeding provider quotas can result in temporary bans, throttling, or financial penalties. Monitor the `provider_configs.circuit_breaker_state` field and the dashboard metrics for early warning signs. SendGrid free-tier accounts are limited to 100 emails/day — ensure production accounts have adequate provisioning. Twilio SMS rates vary by destination country; international SMS may incur significantly higher costs and stricter rate limits.

---

## 7. Admin Service

### Purpose

The Admin Service provides the backoffice administration layer for the operative team. It manages admin user accounts and roles, provides CRUD operations for notification rules and channel configurations, delegates template management to the Template Service, supports recipient group management, aggregates notification history and search, and produces dashboard metrics.

| Attribute | Value |
|---|---|
| **Technology** | NestJS |
| **Port** | `3005` |
| **Database** | PostgreSQL — `admin_db` |
| **Dependencies** | Notification Engine, Template Service, Channel Router, Audit Service |

### Responsibilities

- **User Management:** Manages admin user accounts including creation, deactivation, role assignment, and password reset. Supports RBAC with predefined roles: **[Super Admin]**, **[Admin]**, **[Operator]**, **[Viewer]**.
- **Notification Rule CRUD:** Provides a management interface for creating, updating, enabling/disabling, and deleting notification rules. Validates rule configurations before persisting (via the Notification Engine).
- **Channel Configuration:** Manages provider credentials, sender identities, and channel-specific settings. Sensitive values (API keys, auth tokens) are encrypted at rest.
- **Template Management Delegation:** Proxies template management requests to the Template Service. The Admin Service does not store template data directly but provides a unified API surface.
- **Recipient Group Management:** Allows operators to create and manage named groups of recipients (e.g., "Operations Team", "VIP Customers", "Regional Managers") for use in notification rules.
- **Notification History & Search:** Provides a comprehensive search interface across all sent notifications, filterable by channel, status, date range, recipient, and event type.
- **Dashboard Data Aggregation:** Aggregates metrics from multiple services to power the admin dashboard — total notifications, delivery rates, channel breakdown, failure rates, and trend analysis.

### Database Tables

| Table | Description | Key Columns |
|---|---|---|
| `admin_users` | Admin user accounts | `id`, `email`, `password_hash`, `full_name`, `role_id`, `is_active`, `last_login_at`, `created_at` |
| `admin_roles` | Role definitions | `id`, `name`, `description`, `permissions`, `is_system` |
| `admin_permissions` | Granular permission definitions | `id`, `resource`, `action`, `description` |
| `system_configs` | Global system configuration key-value pairs | `id`, `config_key`, `config_value`, `description`, `updated_by`, `updated_at` |
| `saml_identity_providers` | SAML IdP configurations (Azure AD metadata, SP certs, attribute mapping) | `id`, `name`, `entity_id`, `sso_url`, `certificate`, `metadata_xml`, `attribute_mapping`, `auto_provision`, `is_active` |
| `user_identity_links` | Maps local users to external SAML identities | `id`, `user_id`, `idp_id`, `external_id`, `linked_at`, `last_login_at`. Unique on `(idp_id, external_id)` |
| `saml_sessions` | Active SAML sessions for Single Logout (SLO) support | `id`, `user_id`, `idp_id`, `session_index`, `name_id`, `expires_at` |

> **Info:** **SAML Tables:** The three SAML-related tables (`saml_identity_providers`, `user_identity_links`, `saml_sessions`) support SAML 2.0 SSO with Azure AD. Full schema details including all columns and constraints are documented in [04 — Authentication & Identity §6](04-authentication-identity.md#6-database-schema-additions).

### Key Endpoints

**GET** `/admin/dashboard` — Dashboard metrics endpoint. Returns notification volume (today, this week, this month), delivery success rate per channel, top triggered rules, recent failures, and system health indicators.

**GET** `/admin/rules` — List notification rules with pagination, sorting, and filtering. Supports filters: `eventType`, `isActive`, `channel`. Returns rule summaries with recent trigger counts.

**POST** `/admin/rules` — Create a new notification rule. Validates the rule configuration (event type exists, template exists, channels are active) before persisting. If a `suppression` configuration is provided, validates that `dedupKey` paths are valid dot-notation strings, at least one mode is specified, and all `windowMinutes` / `intervalMinutes` values are greater than zero. Returns the created rule with its generated ID.

**PUT** `/admin/rules/:id` — Update an existing rule. Supports partial updates. Setting `suppression: null` removes the suppression configuration from the rule. Changes are audit-logged with the admin user ID and timestamp.

**GET** `/admin/channels` — List all channel configurations with their current status, provider details, and health metrics. Sensitive configuration values (API keys) are masked in the response.

**PUT** `/admin/channels/:id` — Update channel configuration. Validates provider connectivity before saving (optional dry-run mode). Encrypted values are re-encrypted on update.

**GET** `/admin/logs` — Notification audit logs with full-text search. Supports filters: `action`, `userId`, `resourceType`, `notificationId`, `dateFrom`, `dateTo`. Returns paginated log entries with detailed metadata.

**GET** `/admin/saml/idp` — List configured SAML Identity Providers. **[Super Admin]** only. See [04 — Auth & Identity §7](04-authentication-identity.md#7-api-endpoints) for full CRUD endpoints.

**POST** `/admin/saml/idp` — Register a new SAML Identity Provider by importing IdP metadata XML. Parses entityID, SSO URL, X.509 certificate. Generates SP keypair. **[Super Admin]** only.

---

## 8. Audit Service

### Purpose

The Audit Service provides comprehensive logging, tracking, and analytics for the entire notification lifecycle. It operates on an event-sourcing model, consuming status updates from all services via RabbitMQ, and maintains a complete, immutable record of every notification event from ingestion through delivery. This service is critical for compliance, debugging, and business intelligence.

| Attribute | Value |
|---|---|
| **Technology** | NestJS |
| **Port** | `3006` |
| **Database** | PostgreSQL — `audit_db` |
| **Dependencies** | RabbitMQ (all status exchanges) |

### Responsibilities

- **Event Sourcing:** Captures every state transition in the notification lifecycle as an immutable audit event. Events are never updated or deleted — only appended.
- **Delivery Receipt Tracking:** Records delivery receipts from external providers (opened, clicked, bounced, unsubscribed) via webhook callbacks proxied through the Channel Router.
- **Searchable Notification History:** Provides full-text search across notification content, recipients, and metadata. Supports complex queries for investigating delivery issues.
- **Analytics Data:** Aggregates notification metrics for dashboard consumption — delivery rates, channel performance, average delivery latency, hourly/daily volume trends, and failure categorization.
- **Compliance Logging:** Maintains records required for regulatory compliance (GDPR, CAN-SPAM). Tracks consent status, opt-out events, and data access requests.
- **Data Retention:** Implements configurable retention policies. Audit events are retained for the compliance-required period (default 2 years). Detailed payload data can be purged after a shorter window (default 90 days) while retaining metadata.

### Database Tables

| Table | Description | Key Columns |
|---|---|---|
| `audit_events` | Immutable event log for all notification lifecycle transitions | `id`, `notification_id`, `event_type`, `actor`, `metadata`, `payload_snapshot`, `created_at` |
| `delivery_receipts` | Provider-reported delivery outcomes | `id`, `notification_id`, `channel`, `provider`, `status`, `provider_message_id`, `raw_response`, `received_at` |
| `notification_analytics` | Pre-aggregated analytics data (hourly/daily rollups) | `id`, `period`, `period_start`, `channel`, `total_sent`, `total_delivered`, `total_failed`, `total_opened`, `total_clicked`, `avg_latency_ms` |

### RabbitMQ Configuration

The Audit Service subscribes to multiple exchanges to capture the complete notification flow:

| Exchange | Queue | Routing Key | Events Captured |
|---|---|---|---|
| `events.normalized` | `audit.events` | `event.#` | Event ingestion and normalization |
| `notifications.render` | `audit.render` | `notification.render.#` | Template rendering requests |
| `notifications.deliver` | `audit.deliver` | `notification.deliver.#` | Delivery dispatch events |
| `notifications.status` | `audit.status` | `notification.status.#` | Delivery status updates (sent, delivered, failed, bounced) |
| `notifications.dlq` | `audit.dlq` | `#` | Permanently failed notifications |

---

## 9. Email Ingest Service

### Purpose

The Email Ingest Service extends the platform's event ingestion capabilities to support closed or legacy systems that cannot publish events via RabbitMQ or REST webhooks — systems that can only send emails. It acts as an SMTP server, receives emails from these source systems, parses them against configurable criteria (sender patterns, subject regex, body extraction rules), and generates standardized events that are published to the Event Ingestion layer via RabbitMQ.

| Attribute | Value |
|---|---|
| **Technology** | NestJS + `smtp-server` npm package |
| **REST Port** | `3007` |
| **SMTP Port** | `2525` |
| **Database** | PostgreSQL — `email_ingest_db` |
| **Dependencies** | RabbitMQ, PostgreSQL |

### Responsibilities

- **SMTP Server:** Runs an embedded SMTP server on port `2525` using the `smtp-server` npm package. Accepts inbound emails from whitelisted source systems and processes them through the parsing pipeline.
- **Sender Whitelisting:** Maintains a registry of authorized email sources (`email_sources` table). Only emails from registered sender patterns are accepted; all others are rejected at the SMTP level.
- **Email Parsing:** Applies configurable parsing rules to extract structured data from incoming emails. Rules match on sender patterns, subject line regex, and body content extraction using regular expressions.
- **Event Generation:** Transforms parsed email data into canonical events using configurable payload templates. Generated events are published to the `events.incoming` RabbitMQ exchange with routing key `source.email-ingest.{eventType}`.
- **Parsing Rule Management:** Exposes REST API endpoints for CRUD operations on email parsing rules, allowing the operative team to configure how emails are parsed and mapped to events via the Admin UI.
- **Audit Trail:** Stores all received emails and their processing results in the `processed_emails` table for debugging, auditing, and reprocessing capabilities.

### SMTP Configuration

| Setting | Value | Description |
|---|---|---|
| **Port** | `2525` | Non-standard SMTP port to avoid conflicts with system mail services |
| **TLS** | STARTTLS supported | Opportunistic TLS encryption for inbound connections |
| **Auth** | Optional SMTP AUTH | Configurable per-source authentication (PLAIN/LOGIN) |
| **Max Message Size** | 10 MB | Configurable limit to prevent oversized email processing |
| **Concurrency** | 10 concurrent connections | Limits simultaneous SMTP sessions to manage resource usage |

### Email Parsing Rule Schema

```json
{
  "ruleId": "uuid",
  "name": "ERP Order Confirmation",
  "sourceFilter": {
    "senderPattern": "*@erp-system.company.com",
    "subjectRegex": "^Order Confirmation #\\d+"
  },
  "bodyParsing": {
    "format": "html | text",
    "extractionRules": [
      {
        "field": "orderNumber",
        "regex": "Order #(\\d+)"
      }
    ]
  },
  "eventMapping": {
    "eventType": "order.confirmed",
    "payloadTemplate": {
      "orderNumber": "{{orderNumber}}"
    }
  },
  "isActive": true
}
```

### Key API Endpoints

**GET** `/health` — Health check endpoint. Returns the service status, SMTP server health, RabbitMQ connection health, and database connectivity.

**GET** `/parsing-rules` — List all email parsing rules. Supports query parameters: `isActive`, `eventType`, `page`, `limit`.

**POST** `/parsing-rules` — Create a new email parsing rule. Requires `name`, `sourceFilter`, `bodyParsing`, and `eventMapping` fields. Validates regex patterns before persisting.

**PUT** `/parsing-rules/:id` — Update an existing parsing rule. Supports partial updates. Changes take effect immediately for subsequent incoming emails.

**DELETE** `/parsing-rules/:id` — Delete a parsing rule. Soft-deletes the rule (sets `isActive` to false) to preserve audit history.

**GET** `/processed-emails` — List processed emails with filters. Supports query parameters: `status` (parsed, failed, skipped), `sender`, `dateFrom`, `dateTo`, `page`, `limit`.

**GET** `/processed-emails/:id` — Retrieve full details for a specific processed email, including the original email content, matched parsing rule, extracted fields, and generated event payload.

### Database Tables

| Table | Description | Key Columns |
|---|---|---|
| `email_parsing_rules` | Configurable rules mapping email criteria to event types | `id`, `name`, `sender_pattern`, `subject_regex`, `body_parsing_config`, `event_type`, `payload_template`, `is_active`, `created_at`, `updated_at` |
| `processed_emails` | Log of all received and parsed emails (audit trail) | `id`, `message_id`, `sender`, `subject`, `received_at`, `matched_rule_id`, `extracted_data`, `generated_event_id`, `status`, `error_message` |
| `email_sources` | Registered source system identities (sender whitelist, auth config) | `id`, `name`, `sender_pattern`, `description`, `auth_config`, `is_active`, `created_at` |

### RabbitMQ Configuration

| Direction | Exchange | Routing Key | Purpose |
|---|---|---|---|
| Publishes | `events.incoming` | `source.email-ingest.{eventType}` | Publish parsed email events for downstream processing by Event Ingestion Service |

> **Info:** **SMTP Security**
> The Email Ingest Service implements multiple security layers: sender whitelisting ensures only registered source systems can submit emails, STARTTLS provides encryption for inbound SMTP connections, optional SMTP AUTH adds per-source authentication, and all incoming emails are size-limited and rate-limited to prevent abuse. Emails from unknown senders are rejected at the SMTP handshake level before any content is accepted.

> **Note:** **Email Parsing Reliability**
> Email parsing is inherently less structured than REST or RabbitMQ event ingestion. Parsing rules should be thoroughly tested with sample emails before activation. The service logs all parsing failures with the original email content for investigation. When a parsing rule fails to extract required fields, the email is stored with a `failed` status and no event is generated — preventing malformed data from entering the notification pipeline. Operators can review failed emails through the Admin UI and adjust parsing rules accordingly.

---

## 10. Bulk Upload Service

### Purpose

The Bulk Upload Service enables the operative team to trigger bulk notifications by uploading XLSX spreadsheet files through the Admin UI. Each row in the spreadsheet is parsed into an event payload and submitted to the Event Ingestion Service via HTTP, preserving Event Ingestion as the single entry point for all events in the platform. This service fills a gap in the current architecture: while OMS, Magento, Mirakl, and Chat Commerce publish events automatically, there was no mechanism for manually triggering bulk notifications from structured data files.

| Attribute | Value |
|---|---|
| **Service Name** | `bulk-upload-service` |
| **Port** | `3008` |
| **Technology** | NestJS (TypeScript) + `exceljs` |
| **Database** | `bulk_upload_db` (PostgreSQL) |
| **Source Identifier** | `bulk-upload` (used as `source` field in event payloads) |
| **Communication** | HTTP POST to Event Ingestion Service (`POST /webhooks/events`) |
| **Admin UI Route** | `/bulk-upload` |
| **RBAC** | Admin, Operator |

### Responsibilities

- Accept XLSX file uploads via multipart/form-data from the Admin UI (through the Gateway)
- Validate uploaded files: format (`.xlsx` only), size (max 10 MB), row count (max 5,000 rows), and header row presence
- Parse XLSX rows using a fully flexible column-mapping approach — only `eventType` is required; all other column headers become payload fields dynamically
- Construct event payloads for each row and submit them to the Event Ingestion Service via HTTP (`POST /webhooks/events`)
- Track upload progress and per-row processing status in its own database
- Support retry of failed rows and cancellation of in-progress uploads
- Provide upload history, status, and error details via REST API

### XLSX File Format (Flexible Mapping)

The Bulk Upload Service uses a **fully flexible column-mapping** approach — there is no predefined schema for the XLSX file beyond requiring an `eventType` column. This allows any event type to be submitted without requiring code changes or schema updates.

**Mapping Rules:**

| Rule | Description |
|---|---|
| **Header Row** | The first row must be the header row (column names) |
| **`eventType` Column** | Required — determines the event type for each row |
| **Dynamic Columns** | All other column headers map directly as keys in the `payload` object |
| **Empty Cells** | Omitted from the payload (not included as null) |
| **JSON Values** | Columns with JSON-parseable values (e.g., `[{"sku":"X"}]`) are parsed as JSON; otherwise treated as strings/numbers |
| **Numeric Values** | Values that parse as numbers are stored as numbers, not strings |

**Example XLSX:**

| eventType | customerEmail | customerName | orderId | totalAmount |
|---|---|---|---|---|
| order.shipped | jane@example.com | Jane Doe | ORD-001 | 79.99 |
| order.created | john@example.com | John Smith | ORD-002 | 149.50 |

**Resulting event payload for row 1:**

```json
{
  "source": "bulk-upload",
  "eventType": "order.shipped",
  "payload": {
    "customerEmail": "jane@example.com",
    "customerName": "Jane Doe",
    "orderId": "ORD-001",
    "totalAmount": 79.99
  }
}
```

**Validation Limits:**

| Limit | Value |
|---|---|
| Maximum rows per file | 5,000 |
| Maximum file size | 10 MB |
| Accepted format | `.xlsx` only |

### API Endpoints

**POST** `/uploads` — Upload an XLSX file for bulk event submission. Accepts `multipart/form-data` with a single `.xlsx` file. Validates file format, size, and header row. Returns `202 Accepted` with `uploadId` and begins background processing. Request: `file` (multipart field). Response: `{ uploadId, fileName, totalRows, status: "queued" }`.

**GET** `/uploads` — List all uploads with pagination and filters. Supports query parameters: `status` (queued, processing, completed, partial, failed, cancelled), `uploadedBy`, `dateFrom`, `dateTo`, `page`, `limit`.

**GET** `/uploads/:id` — Get detailed status for a specific upload. Returns `{ id, fileName, fileSize, totalRows, processedRows, succeededRows, failedRows, status, uploadedBy, startedAt, completedAt }`.

**GET** `/uploads/:id/errors` — Get failed row details for a specific upload. Returns paginated list of `{ rowNumber, errorMessage, rawData }` for rows with `failed` status.

**POST** `/uploads/:id/retry` — Retry all failed rows for a specific upload. Resets failed rows to `pending` and restarts background processing. Only available when upload status is `partial` or `failed`. Requires Admin role.

**DELETE** `/uploads/:id` — Cancel an in-progress upload or delete a completed upload record. If processing is active, sets status to `cancelled` and stops processing remaining rows. Requires Admin role.

### Processing Flow

1. User uploads XLSX file via Admin UI → Gateway proxies to Bulk Upload Service (`POST /uploads`)
2. Service validates file (format, size, header row present) → returns `202 Accepted` with `uploadId`
3. Upload record created with status `queued`; background worker picks up the job
4. Worker parses the XLSX file row-by-row using `exceljs`
5. For each row: extract `eventType` from the designated column, map all remaining columns to `payload` fields
6. Events are submitted to Event Ingestion Service (`POST /webhooks/events`) with `source: "bulk-upload"`, configurable concurrency (default: 5 parallel requests, rate limit: max 50 events/second)
7. Per-row status tracked in `upload_rows` table; aggregate counters updated in `uploads` table
8. Admin UI polls `GET /uploads/:id` for real-time progress updates

### Database Tables

**`uploads` Table:**

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Unique upload identifier |
| `file_name` | VARCHAR | Original uploaded file name |
| `file_size` | INTEGER | File size in bytes |
| `total_rows` | INTEGER | Total data rows in the XLSX (excluding header) |
| `processed_rows` | INTEGER | Number of rows processed so far |
| `succeeded_rows` | INTEGER | Number of rows successfully submitted |
| `failed_rows` | INTEGER | Number of rows that failed submission |
| `status` | ENUM | Upload status: `queued`, `processing`, `completed`, `partial`, `failed`, `cancelled` |
| `uploaded_by` | UUID | Admin user ID who uploaded the file |
| `started_at` | TIMESTAMP | When processing began |
| `completed_at` | TIMESTAMP | When processing finished |
| `created_at` | TIMESTAMP | Record creation timestamp |
| `updated_at` | TIMESTAMP | Record last update timestamp |

**`upload_rows` Table:**

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Unique row record identifier |
| `upload_id` | UUID (FK) | Reference to parent upload |
| `row_number` | INTEGER | Row number in the XLSX file |
| `raw_data` | JSONB | Original row data as parsed from the XLSX |
| `mapped_payload` | JSONB | Constructed event payload sent to Event Ingestion |
| `event_id` | UUID (nullable) | Event ID returned by Event Ingestion Service |
| `status` | ENUM | Row status: `pending`, `processing`, `succeeded`, `failed`, `skipped` |
| `error_message` | TEXT | Error description if status is `failed` |
| `processed_at` | TIMESTAMP | When this row was processed |

### Upload Status State Machine

| Status | Description | Transitions To |
|---|---|---|
| `queued` | File uploaded, waiting for worker | `processing`, `cancelled` |
| `processing` | Worker is actively processing rows | `completed`, `partial`, `failed`, `cancelled` |
| `completed` | All rows processed successfully | — (terminal) |
| `partial` | Processing finished but some rows failed | `processing` (via retry) |
| `failed` | Processing finished but all rows failed, or a critical error occurred | `processing` (via retry) |
| `cancelled` | Upload cancelled by an admin user | — (terminal) |

### Error Handling

| Error Type | Handling |
|---|---|
| **File-level validation** | Invalid format, oversized file, or missing header row → `400 Bad Request` returned immediately, no upload record created |
| **Row-level validation** | Missing `eventType`, invalid data types → row marked as `failed` with descriptive error message, processing continues with next row |
| **Event Ingestion submission** | HTTP error or timeout from Event Ingestion Service → row marked as `failed`, error message includes HTTP status and response body, processing continues |
| **Partial failure** | If some rows succeed and some fail → upload status set to `partial`, failed rows available for retry |
| **Critical failure** | Unrecoverable error (e.g., database unavailable) → upload status set to `failed`, partial progress is preserved |

### Security Considerations

- **RBAC:** Upload, list, and view operations require Admin or Operator role. Retry and cancel operations require Admin role.
- **File validation:** Only `.xlsx` files accepted; MIME type and file extension are both validated to prevent malicious file uploads.
- **Size limits:** 10 MB file size and 5,000 row limits prevent resource exhaustion.
- **Rate limiting:** Event submission to Event Ingestion is rate-limited (50 events/second) to prevent overwhelming downstream services.
- **Audit trail:** All upload operations are logged in the Audit Service, including the uploading user, file name, row counts, and final status.

> **Info:** **Why HTTP Instead of Direct RabbitMQ?**
> The Bulk Upload Service submits events via HTTP to the Event Ingestion Service rather than publishing directly to RabbitMQ. This preserves Event Ingestion as the single entry point for all events — ensuring consistent validation, normalization, schema enforcement, and source tracking regardless of origin. While direct RabbitMQ publishing would offer slightly lower latency, the HTTP approach maintains architectural consistency and avoids duplicating event validation logic.

---

## 11. Notification Admin UI (Frontend)

### Purpose

The Notification Admin UI is the Next.js-powered backoffice application used by the operative team to manage all aspects of the notification platform. It provides a modern, responsive interface for managing notification rules, editing templates, configuring channels, monitoring delivery metrics, and searching notification history.

| Attribute | Value |
|---|---|
| **Technology** | Next.js 14 (App Router) with TypeScript |
| **Port** | `3010` |
| **Database** | None (all data through API) |
| **Dependencies** | Notification Gateway (BFF) only |

### Key Pages & Features

| Page | Route | Features |
|---|---|---|
| **Dashboard** | `/dashboard` | Real-time notification volume charts, delivery success rate gauges, channel breakdown pie chart, recent failures list, top triggered rules, system health indicators |
| **Rule Management** | `/rules` | List view with search, filter, and sort. Create/edit rule modal with event type selector, condition builder (visual), template picker, channel selector, recipient configuration, enable/disable toggle |
| **Template Editor** | `/templates` | List view with template cards. WYSIWYG editor for HTML email templates (based on TipTap/ProseMirror), plain text editor for SMS, WhatsApp message composer, push notification previewer. Live preview panel, variable insertion toolbar, version history sidebar |
| **Channel Configuration** | `/channels` | Channel cards showing provider status and health. Configuration forms for each provider (SendGrid, Twilio, Firebase). Connection test button, credential rotation workflow |
| **Notification Logs** | `/logs` | Searchable, filterable log table with expandable rows. Filters: date range, channel, status, recipient, event type. Detail view showing full lifecycle timeline, rendered content, delivery attempts |
| **User Management** | `/users` | Admin user list, role assignment, invitation workflow, activity log per user. Restricted to Super Admin and Admin roles |
| **Login** | `/login` | Email/password login form with "Sign in with SSO" button (displayed when a SAML IdP is configured). Forgot password link. See [04 — Auth & Identity §8](04-authentication-identity.md#8-frontend-integration) |
| **Bulk Upload** | `/bulk-upload` | Drag-and-drop XLSX upload zone, upload progress bar with real-time polling, upload history table (file name, uploaded by, date, status, row counts), error detail panel for failed rows with CSV export, sample template download |
| **Identity Provider Settings** | `/settings/identity-providers` | SAML IdP configuration: metadata XML import, attribute mapping, auto-provisioning toggle, SP metadata download, certificate expiry warnings. **[Super Admin]** only |

> **Note:** **BFF Pattern — Frontend Communication**
> The Notification Admin UI communicates **exclusively** through the Notification Gateway (BFF) on port `3000`. It never calls internal microservices directly. This provides a single security boundary, consistent API surface, and allows the gateway to handle authentication, rate limiting, and response transformation. The frontend uses `fetch` with JWT bearer tokens stored in HTTP-only cookies for secure authentication. Server components in the Next.js App Router fetch data during SSR through the gateway, while client components use SWR for data fetching with automatic revalidation.

---

## 12. Database Schema Overview

### Database Summary

Each microservice owns its database, following the database-per-service pattern. This ensures loose coupling, independent schema evolution, and isolated failure domains. Cross-service data access is performed exclusively through APIs, never through shared databases.

| Database | Owner Service | Tables | Estimated Size (Year 1) | Growth Rate |
|---|---|---|---|---|
| `event_ingestion_db` | Event Ingestion Service | `events`, `event_sources`, `event_schemas` | ~50 GB | ~5 GB/month |
| `notification_engine_db` | Notification Engine | `notification_rules`, `notifications`, `notification_recipients`, `notification_status_log`, `recipient_groups`, `recipient_preferences` | ~80 GB | ~8 GB/month |
| `template_db` | Template Service | `templates`, `template_versions`, `template_channels`, `template_variables` | ~500 MB | Minimal |
| `channel_router_db` | Channel Router | `channels`, `channel_configs`, `delivery_attempts`, `provider_configs` | ~60 GB | ~6 GB/month |
| `admin_db` | Admin Service | `admin_users`, `admin_roles`, `admin_permissions`, `system_configs`, `saml_identity_providers`, `user_identity_links`, `saml_sessions` | ~100 MB | Minimal |
| `audit_db` | Audit Service | `audit_events`, `delivery_receipts`, `notification_analytics` | ~120 GB | ~12 GB/month |
| `email_ingest_db` | Email Ingest Service | `email_parsing_rules`, `processed_emails`, `email_sources` | ~20 GB | ~2 GB/month |
| `bulk_upload_db` | Bulk Upload Service | `uploads`, `upload_rows` | ~5 GB | ~500 MB/month |

### Key Relationships

While each database is physically isolated, logical relationships exist across service boundaries. These are maintained through shared identifiers (UUIDs) rather than foreign keys:

- **Event --> Notification:** The `notifications.event_id` column in the Notification Engine DB references the `events.event_id` from the Event Ingestion DB. This link is maintained by passing the event ID through RabbitMQ messages.
- **Notification --> Template:** The `notifications.template_id` references a template in the Template DB. The Notification Engine resolves this by calling the Template Service API at render time.
- **Notification --> Delivery Attempts:** The `delivery_attempts.notification_id` in the Channel Router DB corresponds to the `notifications.id` in the Notification Engine DB. This is propagated via RabbitMQ message headers.
- **Notification --> Audit Events:** The `audit_events.notification_id` in the Audit DB references notifications across all services. The audit service reconstructs the full lifecycle by correlating events with the same notification ID.
- **Rule --> Template:** The `notification_rules.actions[].templateId` references a template. This is validated at rule creation time by calling the Template Service.

### Data Retention Policies

| Data Category | Retention Period | Purge Strategy | Notes |
|---|---|---|---|
| Raw event payloads | 90 days | Automated daily job; payload set to null, metadata retained | Full payload available for debugging within 90 days |
| Notification records | 1 year | Archived to cold storage after 1 year, deleted after 3 years | Metadata and status retained; rendered content purged |
| Delivery attempts | 6 months | Aggregated into analytics; raw records deleted | Provider responses may contain PII |
| Audit events | 2 years | Immutable; archived to cold storage after 2 years | Required for regulatory compliance |
| Analytics rollups | Indefinite | No purge; aggregated data only (no PII) | Hourly rollups compacted to daily after 90 days |
| Template versions | Indefinite | No purge | Required for audit trail of sent notifications |

---

## 13. Inter-Service Communication

The microservices communicate through two patterns: synchronous HTTP/REST for request-response interactions, and asynchronous RabbitMQ messaging for event-driven, fire-and-forget workflows. The choice of pattern depends on whether the caller needs an immediate response (synchronous) or can operate with eventual consistency (asynchronous).

### Communication Map

| From | To | Protocol | Pattern | Purpose |
|---|---|---|---|---|
| Admin UI | Notification Gateway | HTTP/REST | Synchronous | All frontend API calls (CRUD, dashboard, logs) |
| Notification Gateway | All internal services | HTTP/REST | Synchronous | Request proxying and aggregation |
| Source Systems (OMS, Magento, etc.) | Event Ingestion | AMQP / HTTP | Asynchronous | Business event delivery |
| Event Ingestion | Notification Engine | AMQP | Asynchronous | Normalized event publishing |
| Notification Engine | Template Service | HTTP/REST | Synchronous | Template rendering requests |
| Notification Engine | Channel Router | AMQP | Asynchronous | Rendered notification dispatch |
| Channel Router | External Providers | HTTP/REST | Synchronous | SendGrid, Twilio, Firebase API calls |
| Channel Router | Notification Engine | AMQP | Asynchronous | Delivery status updates |
| All Services | Audit Service | AMQP | Asynchronous | Lifecycle events and status updates |
| Admin Service | Notification Engine | HTTP/REST | Synchronous | Rule management, notification queries |
| Admin Service | Channel Router | HTTP/REST | Synchronous | Channel configuration management |
| Admin Service | Audit Service | HTTP/REST | Synchronous | Log queries and analytics data |
| Email Ingest Service | Event Ingestion (via RabbitMQ) | AMQP | Asynchronous | Publish parsed email events to `events.incoming` exchange |
| Notification Gateway | Email Ingest Service | HTTP/REST | Synchronous | Email parsing rule management, processed email queries |
| Notification Gateway | Bulk Upload Service | HTTP/REST | Synchronous | Upload proxying, upload status queries, error retrieval |
| Bulk Upload Service | Event Ingestion Service | HTTP/REST | Synchronous | Submit parsed XLSX row payloads as events (`POST /webhooks/events`) |

### Synchronous vs. Asynchronous Patterns

#### Synchronous (HTTP/REST)

Used when the caller requires an immediate response to proceed. Examples include template rendering (the engine needs the rendered content before it can dispatch), dashboard data aggregation (the admin UI needs data to display), and CRUD operations (the user expects confirmation). Synchronous calls use circuit breakers and timeouts (default 5 seconds) to prevent cascading failures.

#### Asynchronous (RabbitMQ / AMQP)

Used for the core notification pipeline where loose coupling, resilience, and throughput are prioritized over immediate response. Event ingestion, notification dispatch, delivery status updates, and audit logging all use asynchronous messaging. Messages are durable and persisted to disk by RabbitMQ, ensuring no data loss even if a consumer is temporarily unavailable. All queues are configured with dead letter exchanges for handling poison messages.

> **Info:** **Eventual Consistency**
> The asynchronous communication pattern means the system operates under eventual consistency. When an event is ingested, there is a brief window (typically milliseconds to seconds) before the Notification Engine processes it and the Audit Service records it. The Admin UI dashboard may show slightly stale data during peak loads. This trade-off is intentional — it enables the system to handle high event volumes (10,000+ events/minute) without blocking, while providing resilience against individual service failures. If a downstream service is temporarily unavailable, messages queue up in RabbitMQ and are processed when the service recovers, ensuring zero data loss.

---

## 14. Security Considerations

### JWT Authentication at Gateway Level

All external requests (from the Admin UI and external API consumers) must pass through the Notification Gateway, which enforces authentication on every request. The gateway validates JWT access tokens using RS256 asymmetric signatures. Tokens are issued by the platform itself after successful authentication via either local credentials (email/password with bcrypt verification) or SAML 2.0 SSO with Azure AD. Both methods produce identical JWT tokens, so downstream services are unaware of the authentication method. Tokens contain the user's identity, role, permissions, and `auth_method` claim ("local" or "saml"). Access tokens have a short expiry (15 minutes) and are refreshed using HTTP-only, secure, SameSite refresh tokens (7-day expiry with rotation). See [04 — Authentication & Identity](04-authentication-identity.md) for the complete authentication and SSO design.

| Auth Method | Used By | Token Type | Expiry |
|---|---|---|---|
| JWT Bearer Token | Admin UI users | Access Token (RS256) | 15 minutes |
| Refresh Token | Admin UI users | HTTP-only Cookie | 7 days (with rotation) |
| API Key | External integrations | X-API-Key header | Configurable (default 90 days) |

### Service-to-Service Authentication

Internal microservices communicate within a trusted network boundary (Docker bridge network or Kubernetes cluster network). Service-to-service HTTP calls use a shared HMAC-based authentication mechanism: each request includes a signed `X-Service-Signature` header computed from the request body and a shared secret. In production environments, mutual TLS (mTLS) is recommended for an additional layer of transport security. RabbitMQ connections use dedicated service accounts with per-queue permissions following the principle of least privilege.

### Data Encryption

| Scope | Method | Details |
|---|---|---|
| **In Transit** | TLS 1.2+ | All HTTP traffic between services uses TLS. RabbitMQ connections use AMQPS (AMQP over TLS). Database connections use SSL mode `require`. |
| **At Rest — Database** | PostgreSQL TDE | Transparent Data Encryption enabled for all databases. Managed encryption keys via the cloud provider's KMS. |
| **At Rest — Secrets** | AES-256-GCM | Provider credentials (API keys, auth tokens) stored in `channel_configs` and `provider_configs` are encrypted at the application level using AES-256-GCM with keys managed by the secrets manager. |
| **At Rest — Backups** | AES-256 | Database backups are encrypted using the cloud provider's managed encryption. |

### PII Handling in Notification Data

Notifications inherently contain personally identifiable information (PII) — customer names, email addresses, phone numbers, order details. The platform implements the following safeguards:

- **Data Minimization:** Services only store the PII they need to fulfill their function. The Audit Service, for example, stores notification IDs and metadata but can be configured to redact PII from payload snapshots after a retention window.
- **Access Control:** Database access is restricted to the owning service. No cross-database queries are permitted. Admin users see PII only through the gateway, which enforces role-based access.
- **Log Sanitization:** Application logs are sanitized to replace PII with masked values (e.g., `j***@example.com`, `+1***567890`). Full PII is never written to application log files.
- **Right to Erasure (GDPR Article 17):** The system supports a "forget" workflow that, given a customer identifier, purges or anonymizes all PII across all databases while retaining anonymized aggregate data for analytics.
- **Consent Tracking:** The `recipient_preferences` table tracks opt-in/opt-out status per channel. The Notification Engine checks consent before dispatching, ensuring compliance with GDPR and CAN-SPAM requirements.
- **Audit Trail:** All access to PII-containing records through the Admin UI is logged in the Audit Service, including the admin user identity, timestamp, and the specific records accessed.

> **Warning:** **Security Review Required**
> Before production deployment, a comprehensive security review must be conducted covering: penetration testing of the gateway endpoints, review of RBAC policies and permission grants, validation of encryption key management procedures, verification of PII handling compliance with GDPR and local data protection regulations, and audit of RabbitMQ access control lists. All provider API credentials must be rotated from development values to production secrets managed through a dedicated secrets manager (e.g., HashiCorp Vault, AWS Secrets Manager).

---

Notification API Documentation v1.0 -- Architecture Team -- 2026
