# 07 — Event Ingestion Service

**Notification API — Event Ingestion Deep-Dive**

| | |
|---|---|
| **Version:** | 2.0 |
| **Date:** | 2026-02-20 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [Architecture & Integration Points](#2-architecture--integration-points)
3. [Source System Integration](#3-source-system-integration)
4. [Event Processing Pipeline](#4-event-processing-pipeline)
5. [RabbitMQ Topology](#5-rabbitmq-topology)
6. [REST API Endpoints](#6-rest-api-endpoints)
7. [Canonical Event Schema](#7-canonical-event-schema)
8. [Database Design](#8-database-design)
9. [Event Validation](#9-event-validation)
10. [Idempotency & Deduplication](#10-idempotency--deduplication)
11. [Sequence Diagrams](#11-sequence-diagrams)
12. [Error Handling & Dead Letters](#12-error-handling--dead-letters)
13. [Monitoring & Health Checks](#13-monitoring--health-checks)
14. [Configuration](#14-configuration)

---

## 1. Service Overview

The Event Ingestion Service is the universal entry point for all business events that may trigger notifications within the platform. It receives events from any registered source system, applies admin-configured runtime field mappings to normalize them into a flat canonical event format, and publishes them to the internal RabbitMQ exchange for downstream processing by the Notification Engine.

| Attribute | Value |
|---|---|
| **Technology** | NestJS (TypeScript) with RabbitMQ consumers (`@golevelup/nestjs-rabbitmq`) |
| **Port** | `3151` |
| **Schema** | PostgreSQL — `event_ingestion_service` |
| **Dependencies** | RabbitMQ, PostgreSQL |
| **Source Repo Folder** | `event-ingestion-service/` |

### Responsibilities

1. **RabbitMQ Consumers:** Generic consumers on the `q.events.amqp` and `q.events.email-ingest` queues that accept events from any source system publishing to the `events.incoming` exchange.
2. **REST Webhook Endpoint:** An HTTP endpoint (`POST /webhooks/events`) for external integrations that cannot publish directly to RabbitMQ — including webhook-capable source systems, Bulk Upload Service submissions, and manual triggers via the Gateway.
3. **Runtime Mapping Configuration:** Admin-driven field mapping keyed by `(sourceId, eventType)` — no code changes required to onboard a new source system. Mapping configurations define field extraction paths, transformations, event type resolution, and optional validation schemas.
4. **Event Normalization:** Transforms source-specific payloads into the flat canonical event format using the runtime mapping engine — field extraction, transform functions, timestamp normalization (ISO-8601 UTC), and metadata enrichment.
5. **Publishing Normalized Events:** Publishes validated and normalized events to the `events.normalized` exchange with routing keys for downstream consumers.
6. **Event Persistence:** Stores all raw and normalized events in PostgreSQL for auditability and replay capabilities.
7. **Idempotency & Deduplication:** Maintains a deduplication window using composite keys to prevent duplicate event processing.

> **Info:** **Runtime Mapping Configuration**
>
> Source systems are integrated through admin-configured mapping rules stored in the `event_mappings` table, not through coded adapters. Each mapping configuration defines how to extract fields from a source payload, which transforms to apply, and how to resolve event types. Onboarding a new source system requires only registering the source in `event_sources` and creating mapping configurations via the Admin UI — no code changes or deployments needed.

---

## 2. Architecture & Integration Points

The Event Ingestion Service sits between the external source systems and the internal notification pipeline. It acts as the normalization layer — accepting events in various formats from any registered upstream system and producing a single, consistent canonical event format consumed by the Notification Engine downstream.

### Upstream & Downstream Dependencies

| Direction | System | Protocol | Description |
|---|---|---|---|
| **Upstream** | Any Source (AMQP) | RabbitMQ (AMQP) | Publishes events to `events.incoming` exchange with routing key `source.{sourceId}.{eventType}` |
| **Upstream** | Any Source (Webhook) | REST Webhook | Sends HTTP POST with authentication (API key, HMAC, or bearer token) to `/webhooks/events` |
| **Upstream** | Email Ingest Service | RabbitMQ (AMQP) | Publishes parsed email events to `events.incoming` exchange |
| **Upstream** | Bulk Upload Service | REST (HTTP) | Submits parsed XLSX rows as events via `POST /webhooks/events` |
| **Upstream** | Manual Trigger | REST via Gateway | Admin users trigger events through Gateway → `POST /webhooks/events` |
| **Downstream** | Notification Engine | RabbitMQ (AMQP) | Consumes normalized events from `events.normalized` exchange |
| **Downstream** | Audit Service | RabbitMQ (AMQP) | Consumes event lifecycle updates for audit trail |

### Figure 2.1 — Integration Context

```
┌──────────────────────┐
│ Source A (RabbitMQ)   │──┐
├──────────────────────┤  │
│ Source B (Webhook)    │──┤
├──────────────────────┤  │      ┌─────────────────────────────┐      ┌───────────────────────┐
│ Source C (Webhook)    │──┼─────▶│   Event Ingestion Service   │─────▶│   events.normalized   │
├──────────────────────┤  │      │   :3151                     │      │   (Topic Exchange)    │
│ Email Ingest (AMQP)  │──┤      │   Map · Validate · Normalize│      └───────────┬───────────┘
├──────────────────────┤  │      │   PostgreSQL                │                  │
│  Bulk Upload (HTTP)  │──┤      └─────────────────────────────┘          ┌────────┴────────┐
├──────────────────────┤  │                                               │                 │
│ Manual Trigger (REST)│──┘                                    ┌──────────┴──┐  ┌───────────┴──┐
├──────────────────────┤                                       │ Notification │  │    Audit     │
│ Source N (AMQP/HTTP) │──────▶ ... (any registered source)    │ Engine :3152 │  │ Service :3156│
└──────────────────────┘                                       └─────────────┘  └──────────────┘
```

---

## 3. Source System Integration

Source systems integrate with the Event Ingestion Service through one of two patterns: **direct AMQP** or **REST webhook**. There is no hardcoded list of source systems — any system can be onboarded by registering it in the `event_sources` table and creating runtime mapping configurations in the `event_mappings` table via the Admin UI.

### 3.1 Integration Patterns

#### Pattern A — Direct AMQP

Source systems that can publish directly to RabbitMQ send messages to the `events.incoming` topic exchange with routing key `source.{sourceId}.{eventType}`. The Event Ingestion Service consumes these from the `q.events.amqp` generic queue.

| Attribute | Value |
|---|---|
| **Exchange** | `events.incoming` (topic) |
| **Queue** | `q.events.amqp` |
| **Routing Key** | `source.{sourceId}.{eventType}` (e.g., `source.erp-system-1.order.shipped`) |
| **Concurrency** | Configurable (default: 3 consumers) |
| **Prefetch** | Configurable (default: 10) |

#### Pattern B — REST Webhook

Source systems that integrate via HTTP send a POST request to `/webhooks/events` with the `sourceId` field in the request body. Authentication is verified against the credentials stored in the `event_sources` table (API key, HMAC signing secret, or bearer token).

| Attribute | Value |
|---|---|
| **Endpoint** | `POST /webhooks/events` |
| **Authentication** | Per-source: API key (`X-API-Key` header), HMAC signature (`X-Signature` header), or bearer token (`Authorization` header) |
| **Source Identifier** | `sourceId` field in request body |
| **Rate Limit** | Per-source, configured in `event_sources` table |

> **Info:** **Email Ingest Service** — The Email Ingest Service (port 3157/2525) receives emails from closed/legacy systems that cannot integrate via API or RabbitMQ. It parses the email content using configurable rules, extracts structured data, and publishes normalized events to the `events.incoming` exchange with routing key `source.email-ingest.{eventType}`. The Event Ingestion Service consumes these from the dedicated `q.events.email-ingest` queue and processes them identically to any other source.

### 3.2 Runtime Mapping Configuration

Each source system's events are normalized using admin-configured mapping rules stored in the `event_mappings` table. Mappings are keyed by `(sourceId, eventType)` and define how to extract and transform fields from the source payload into the flat canonical event format.

#### Mapping Configuration Table

| Column | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `source_id` | VARCHAR(50) | Registered source system identifier |
| `event_type` | VARCHAR(100) | Canonical event type (or `*` for wildcard) |
| `name` | VARCHAR(255) | Human-readable mapping name |
| `field_mappings` | JSONB | Field extraction and transformation rules |
| `event_type_mapping` | JSONB | Source event types → canonical event types |
| `timestamp_field` | VARCHAR(255) | Dot-path to timestamp in source payload |
| `timestamp_format` | VARCHAR(50) | Timestamp format (`iso8601`, `epoch_ms`, `epoch_s`, custom) |
| `source_event_id_field` | VARCHAR(255) | Dot-path to source deduplication ID |
| `validation_schema` | JSONB | Optional JSON Schema for incoming payload validation |
| `priority` | VARCHAR(10) | Event priority tier: `normal` (default) or `critical`. Determines the routing key segment when publishing to `events.normalized`. |
| `is_active` | BOOLEAN | Only active mappings are used |
| `version` | INTEGER | Configuration version for audit trail |

See [Section 8 — Database Design](#8-database-design) for the full table DDL.

#### Field Mapping Rule Structure

Each key in `field_mappings` is a canonical field name. The value defines how to extract and transform data from the source payload:

```json
{
  "customerId": {
    "source": "customer.id",
    "transform": "direct",
    "required": true
  },
  "orderId": {
    "source": "order_reference",
    "transform": "prefix",
    "options": { "prefix": "ERP-" },
    "required": true
  },
  "customerName": {
    "source": ["customer.first_name", "customer.last_name"],
    "transform": "concatenate",
    "options": { "separator": " " }
  },
  "items": {
    "source": "line_items",
    "transform": "arrayMap",
    "options": { "fieldRenames": { "qty": "quantity", "unit_price": "price" } }
  }
}
```

#### Supported Transforms

| Transform | Description | Options |
|---|---|---|
| `direct` | Copy value as-is from source path | — |
| `concatenate` | Join multiple source values | `separator` (string) |
| `map` | Lookup value in a mapping table | `mappings` (object: source → target) |
| `prefix` | Prepend a string | `prefix` (string) |
| `suffix` | Append a string | `suffix` (string) |
| `template` | Handlebars-style string template | `template` (string) |
| `dateFormat` | Parse and reformat a date string | `inputFormat`, `outputFormat` |
| `epochToIso` | Convert epoch timestamp to ISO-8601 | `unit` (`ms` or `s`) |
| `toNumber` | Cast to number | — |
| `toString` | Cast to string | — |
| `arrayMap` | Transform array elements | `fieldRenames` (object) |
| `jsonPath` | Extract via JSONPath expression | `expression` (string) |
| `static` | Use a fixed value | `value` (any) |

#### Event Type Mapping

The `event_type_mapping` field maps source-specific event type values to canonical dot-notation event types:

```json
{
  "ORDER_SHIPPED": "order.shipped",
  "ORDER_CREATED": "order.created",
  "ORDER_CANCELLED": "order.cancelled",
  "PAYMENT_CONFIRMED": "payment.confirmed"
}
```

#### Mapping Resolution at Runtime

1. Extract `sourceId` from routing key (AMQP: second segment of `source.{sourceId}.{eventType}`) or request body (webhook: `sourceId` field).
2. If `eventTypeMapping` is configured for this source, resolve the raw event type to the canonical event type.
3. Lookup active `event_mappings` row for `(sourceId, eventType)`.
4. **Fallback:** If no exact match, try wildcard `(sourceId, '*')`.
5. **Not found:** Reject with `422 Unprocessable Entity` and error `"No mapping configuration found for source '{sourceId}' and event type '{eventType}'"`.
6. If the mapping has a `validationSchema`, validate the incoming payload against it using `ajv`.
7. Apply field mapping rules using the mapping engine → produce flat canonical event.
8. Validate that all required canonical fields are present.

#### Mapping Cache Strategy

By default (`MAPPING_CACHE_ENABLED=false`), every mapping lookup queries PostgreSQL directly — no caching layer is involved. This is the simplest mode and suitable for development, low-throughput environments, and simple deployments.

When `MAPPING_CACHE_ENABLED=true`, the service uses an **eager cache** with **event-driven invalidation** to keep the database off the hot path entirely:

**Phase 1 — Eager Warm-Up**

On startup, before the service begins accepting events, it executes:

```sql
SELECT * FROM event_mappings WHERE is_active = true;
```

All rows are loaded into an in-memory `Map<sourceId:eventType, MappingConfig>`. The service does not bind its RabbitMQ consumers or open the webhook endpoint until the cache is fully populated.

**Phase 2 — Event-Driven Invalidation**

Whenever a mapping is created, updated, or deactivated via the Admin Service, the Admin Service publishes an invalidation event to the `config.events` exchange with routing key `config.mapping.changed`. The event payload contains the mapping `id` and the new `version` number.

The Event Ingestion Service subscribes via the `q.config.mapping-cache` queue. On receiving an invalidation event, it:

1. Fetches the updated `event_mappings` row from PostgreSQL by `id`.
2. Compares the fetched `version` with the cached version.
3. If the fetched version is newer, replaces the entry in the cache (or removes it if `is_active = false`).
4. If the fetched version is equal or older (out-of-order delivery), the event is discarded.

```
  Admin Service                    RabbitMQ                    Event Ingestion Service
       │                              │                                │
       │  Mapping updated             │                                │
       │  (via Admin UI)              │                                │
       │                              │                                │
       │  Publish to config.events    │                                │
       │  key: config.mapping.changed │                                │
       │─────────────────────────────▶│                                │
       │                              │  Deliver to                    │
       │                              │  q.config.mapping-cache        │
       │                              │───────────────────────────────▶│
       │                              │                                │
       │                              │                    ┌───────────┴───────────┐
       │                              │                    │ 1. Fetch updated row  │
       │                              │                    │    from PostgreSQL    │
       │                              │                    │ 2. Compare version    │
       │                              │                    │ 3. Replace in cache   │
       │                              │                    │    (if newer)         │
       │                              │                    └───────────┬───────────┘
       │                              │                                │
       │                              │                    Cache updated (~100ms)
```

**Single-Flight Pattern**

On a cache miss (e.g., a brand-new mapping not yet received via invalidation event), only one database query is issued per cache key. Concurrent requests for the same `(sourceId, eventType)` wait for the in-flight query to complete rather than issuing redundant queries.

> **Info:** **When to Enable Caching**
>
> Enable `MAPPING_CACHE_ENABLED=true` in **production** and **high-throughput** environments where mapping lookups would otherwise add unnecessary latency and database pressure on every event. Leave it disabled (`false`) in **development** and **simple deployments** where the operational simplicity of direct database queries is preferred and event volumes are low.

### 3.3 Example — Onboarding a New Source

This example shows how to onboard an ERP system that publishes order events via RabbitMQ.

**Step 1:** Register the source in `event_sources`:

| Field | Value |
|---|---|
| `name` | `erp-system-1` |
| `display_name` | `ERP System (Warehouse)` |
| `type` | `rabbitmq` |
| `is_active` | `true` |

**Step 2:** Create a mapping configuration in `event_mappings`:

```json
{
  "sourceId": "erp-system-1",
  "eventType": "order.shipped",
  "name": "ERP Order Shipped Mapping",
  "fieldMappings": {
    "customerId": { "source": "customer.id", "transform": "direct", "required": true },
    "cycleId": { "source": "cycle_id", "transform": "direct", "required": true },
    "orderId": { "source": "order_reference", "transform": "prefix", "options": { "prefix": "ERP-" }, "required": true },
    "customerEmail": { "source": "customer.email", "transform": "direct", "required": true },
    "customerPhone": { "source": "customer.phone", "transform": "direct" },
    "customerName": { "source": ["customer.first_name", "customer.last_name"], "transform": "concatenate", "options": { "separator": " " } },
    "items": { "source": "line_items", "transform": "arrayMap", "options": { "fieldRenames": { "qty": "quantity", "unit_price": "price" } } },
    "totalAmount": { "source": "order_total", "transform": "direct" },
    "currency": { "source": "currency_code", "transform": "direct" }
  },
  "eventTypeMapping": { "ORDER_SHIPPED": "order.shipped", "ORDER_CREATED": "order.created" },
  "timestampField": "occurred_at",
  "timestampFormat": "iso8601",
  "sourceEventIdField": "event_id",
  "priority": "normal"
}
```

**Step 3:** The ERP publishes to `events.incoming` with routing key `source.erp-system-1.order.shipped`. The Event Ingestion Service consumes, applies the mapping, and produces a canonical event — no code changes required.

---

## 4. Event Processing Pipeline

Every event — whether received via RabbitMQ consumer or REST webhook — passes through the same 10-step processing pipeline. This guarantees consistent validation, normalization, and publishing regardless of the source system.

1. **Receive Event:** Accept raw event from RabbitMQ consumer or REST webhook endpoint.
2. **Extract Source ID:** Determine the source system from the message routing key (RabbitMQ: second segment of `source.{sourceId}.{eventType}`) or `sourceId` field (webhook).
3. **Source Lookup:** Verify the source is registered and active in the `event_sources` table.
4. **Mapping Lookup:** Find the active `event_mappings` row for `(sourceId, eventType)`. By default, mapping configs are fetched directly from PostgreSQL. When `MAPPING_CACHE_ENABLED=true`, mappings are resolved from an in-memory cache with event-driven invalidation (see [Mapping Cache Strategy](#mapping-cache-strategy)). Fallback to wildcard `(sourceId, '*')` if no exact match.
5. **Validate (optional):** If the mapping configuration includes a `validationSchema`, validate the incoming payload against it using `ajv`. On failure, reject with detailed errors.
6. **Deduplication Check:** Extract the source event ID using the `sourceEventIdField` path from the mapping config. Check the `(source_id, source_event_id)` composite key against the events table. If a match exists within the dedup window, return the existing event ID.
7. **Normalize:** Apply the runtime mapping engine — extract fields using dot-path notation, apply configured transforms, resolve event types, normalize timestamps to ISO-8601 UTC, assign the `priority` from the mapping configuration (default: `normal`), and assemble the flat canonical event.
8. **Enrich Metadata:** Add `eventId` (UUID v4), `correlationId`, `receivedAt`, `normalizedAt`, `schemaVersion` ("2.0"), and `mappingConfigId` to the metadata object.
9. **Persist:** Insert the event record (raw + normalized) into the `events` table with status `received`. Update status to `published` after successful publish.
10. **Publish & ACK:** Publish the normalized event to the `events.normalized` exchange with routing key `event.{priority}.{eventType}` (e.g., `event.critical.order.delayed` or `event.normal.order.shipped`). Acknowledge the RabbitMQ message (or return `202 Accepted` for webhook requests).

### Figure 4.1 — Event Processing Pipeline

```
    ┌─────────────────────────┐
    │    1. Receive Event      │  ◄── RabbitMQ msg or HTTP POST
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │   2. Extract Source ID   │
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │    3. Source Lookup       │  ◄── Verify registered & active
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │    4. Mapping Lookup     │  ◄── (sourceId, eventType) → config
    └────────────┬────────────┘
                 ▼
     ◆ 5. Validate (optional) ◆────── Fail ──▶ [REJECT 422]
                 │
                Pass
                 ▼
     ◆ 6. Dedup Check ◆──────────── Yes ──▶ [Return existing ID]
                 │
                 No
                 ▼
    ┌─────────────────────────┐
    │  7. Normalize (Mapping)  │  ◄── Runtime mapping engine
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │   8. Enrich Metadata     │
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │  9. Persist to PostgreSQL│
    └────────────┬────────────┘
                 ▼
    ┌─────────────────────────┐
    │10. Publish & ACK / 202   │
    └─────────────────────────┘
```

---

## 5. RabbitMQ Topology

### Exchanges

| Exchange | Type | Purpose | Durable |
|---|---|---|---|
| `events.incoming` | Topic | Receives raw events from source systems | Yes |
| `events.normalized` | Topic | Publishes normalized canonical events with priority-tiered routing keys | Yes |
| `notifications.dlq` | Fanout | Dead-letter exchange for failed messages | Yes |
| `config.events` | Topic | Publishes mapping configuration change events (used when `MAPPING_CACHE_ENABLED=true`) | Yes |

### Queues

| Queue | Bound To | Routing Key | Concurrency | Prefetch | DLQ |
|---|---|---|---|---|---|
| `q.events.amqp` | `events.incoming` | `source.*.#` | 3 | 10 | Yes |
| `q.events.webhook` | `events.incoming` | `source.webhook.#` | 2 | 10 | Yes |
| `q.events.email-ingest` | `events.incoming` | `source.email-ingest.#` | 2 | 10 | Yes |
| `q.config.mapping-cache` | `config.events` | `config.mapping.changed` | 1 | 1 | No |

### Routing Key Format

**Incoming events** follow the pattern `source.{sourceId}.{eventType}`, where `sourceId` identifies the registered source system and `eventType` uses dot-notation for the business event (e.g., `source.erp-system-1.order.shipped`). The `q.events.amqp` queue uses `source.*.#` to consume all events from all AMQP sources. The `q.events.email-ingest` queue is dedicated to the Email Ingest Service for operational isolation.

**Normalized events** are published to the `events.normalized` exchange with routing key `event.{priority}.{eventType}` (e.g., `event.critical.order.delayed` or `event.normal.order.shipped`). The priority tier is determined by the `priority` field in the event mapping configuration (default: `normal`). Downstream consumers bind to priority-specific queues for differentiated processing — see [02 — Detailed Microservices](02-detailed-microservices.md) for the Notification Engine and Channel Router queue topology.

### Figure 5.1 — RabbitMQ Topology

```
                    ┌──────────────────┐
                    │  events.incoming  │
                    │  (Topic Exchange) │
                    └──┬──────┬──────┬─┘
                       │      │      │
        ┌──────────────┘      │      └──────────────┐
        ▼                     ▼                      ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│  q.events.amqp   │ │ q.events.webhook │ │q.events.email-   │
│  source.*.#      │ │ source.webhook.# │ │    ingest         │
│  (all AMQP srcs) │ │ (webhook events) │ │source.email-      │
└────────┬─────────┘ └────────┬─────────┘ │  ingest.#         │
         │                    │           └────────┬──────────┘
         └────────────────────┴────────────────────┘
                              │
                              ▼
                   ┌─────────────────────┐
                   │  Event Ingestion    │
                   │  Consumers+Pipeline │
                   └──────────┬──────────┘
                              │
                              ▼
                   ┌─────────────────────┐       ┌─────────────────┐
                   │ events.normalized   │       │ notifications.  │
                   │ (Topic Exchange)    │       │ dlq (DLQ)       │
                   │                     │       └─────────────────┘
                   │ Routing keys:       │
                   │ event.critical.{t}  │
                   │ event.normal.{t}    │
                   └─────────────────────┘
```

---

## 6. REST API Endpoints

### POST /webhooks/events

Receive webhook events from external integrations. Validates, normalizes using runtime mapping configuration, and publishes the event asynchronously.

#### Request Headers

| Header | Required | Description |
|---|---|---|
| `Content-Type` | Yes | `application/json` |
| `X-API-Key` | Conditional | API key for source authentication (configured per source) |
| `X-Signature` | Conditional | HMAC signature for sources using HMAC authentication |
| `Authorization` | Conditional | Bearer token for sources using token authentication |
| `X-Request-ID` | No | Optional correlation ID; generated if not provided |

#### Request Body

```json
{
  "sourceId": "erp-system-1",
  "cycleId": "CYC-2026-00451",
  "eventType": "ORDER_SHIPPED",
  "sourceEventId": "ERP-EVT-78901",
  "timestamp": "2026-02-20T10:15:30Z",
  "payload": {
    "order_reference": "ORD-2026-00451",
    "customer": {
      "id": "CUST-00451",
      "email": "jane.doe@example.com",
      "first_name": "Jane",
      "last_name": "Doe",
      "phone": "+1234567890"
    },
    "line_items": [
      { "sku": "PROD-001", "name": "Wireless Headphones", "qty": 1, "unit_price": 79.99 }
    ],
    "order_total": 79.99,
    "currency_code": "USD"
  }
}
```

#### Field Descriptions

| Field | Type | Required | Description |
|---|---|---|---|
| `sourceId` | string | Yes | Registered source system identifier |
| `cycleId` | string | Yes | Business cycle identifier |
| `eventType` | string | Yes | Event type — either canonical dot-notation or source-native (resolved via `eventTypeMapping`) |
| `sourceEventId` | string | No | Unique event ID from the source system (used for deduplication) |
| `timestamp` | string | No | ISO-8601 timestamp of when the event occurred; defaults to current time |
| `payload` | object | Yes | Source-specific event data (normalized via runtime mapping configuration) |

#### Responses

| Status | Description | Body |
|---|---|---|
| `202 Accepted` | Event accepted for processing | `{ "eventId": "uuid", "status": "accepted" }` |
| `200 OK` | Duplicate event (already processed) | `{ "eventId": "existing-uuid", "status": "duplicate" }` |
| `400 Bad Request` | Malformed JSON or missing required fields | `{ "error": "...", "details": [...] }` |
| `401 Unauthorized` | Invalid API key, HMAC signature, or bearer token | `{ "error": "Authentication failed" }` |
| `422 Unprocessable Entity` | Mapping not found or validation failed | `{ "error": "...", "details": [...] }` |
| `429 Too Many Requests` | Rate limit exceeded | `{ "error": "Rate limit exceeded", "retryAfter": 1000 }` |
| `500 Internal Server Error` | Unexpected server error | `{ "error": "Internal server error" }` |

### Event Mapping CRUD Endpoints

These endpoints are exposed through the Admin Service (port 3155) for managing runtime mapping configurations.

| Method | Route | Description |
|---|---|---|
| GET | `/api/v1/event-mappings` | List mappings (filter by `sourceId`, `eventType`, `isActive`) |
| POST | `/api/v1/event-mappings` | Create a new mapping configuration |
| GET | `/api/v1/event-mappings/:id` | Get mapping detail by ID |
| PUT | `/api/v1/event-mappings/:id` | Update a mapping configuration |
| DELETE | `/api/v1/event-mappings/:id` | Soft-delete a mapping configuration |
| POST | `/api/v1/event-mappings/:id/test` | Test a mapping with a sample payload |

#### Test Mapping — POST /api/v1/event-mappings/:id/test

Accepts a sample source payload and returns the resulting canonical event without persisting or publishing. Useful for validating mapping configurations before activating them.

**Request:**

```json
{
  "samplePayload": {
    "order_reference": "TEST-001",
    "customer": { "id": "C-1", "email": "test@example.com", "first_name": "Test", "last_name": "User" }
  }
}
```

**Response (200 OK):**

```json
{
  "canonicalEvent": {
    "sourceId": "erp-system-1",
    "eventType": "order.shipped",
    "customerId": "C-1",
    "orderId": "ERP-TEST-001",
    "customerEmail": "test@example.com",
    "customerName": "Test User"
  },
  "warnings": [],
  "missingRequiredFields": []
}
```

### GET /health

Health check endpoint. Returns service status, database connectivity, RabbitMQ connection health, and consumer queue depths.

#### Response (200 OK)

```json
{
  "status": "healthy",
  "uptime": 86400,
  "checks": {
    "database": { "status": "up", "latencyMs": 2 },
    "rabbitmq": { "status": "up", "latencyMs": 5 },
    "queues": {
      "q.events.amqp": { "depth": 14, "consumers": 3 },
      "q.events.webhook": { "depth": 5, "consumers": 2 },
      "q.events.email-ingest": { "depth": 0, "consumers": 2 }
    }
  }
}
```

### GET /events/:eventId

Internal endpoint — retrieves a single event by its canonical `eventId`. Returns the full event record including raw payload, normalized payload, status, and metadata.

### GET /events

Internal list/filter endpoint — returns paginated events with optional filters.

#### Query Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `sourceId` | string | — | Filter by source system |
| `eventType` | string | — | Filter by event type |
| `status` | string | — | Filter by status (`received`, `published`, `failed`) |
| `from` | ISO-8601 | — | Start of date range |
| `to` | ISO-8601 | — | End of date range |
| `page` | integer | 1 | Page number |
| `limit` | integer | 50 | Items per page (max 200) |

---

## 7. Canonical Event Schema

All events — regardless of source — are normalized into this flat canonical format (v2.0) before publishing to the `events.normalized` exchange. This guarantees that downstream consumers (Notification Engine, Audit Service) work with a single, predictable schema.

### Required Fields (top-level)

| Field | Type | Required | Description |
|---|---|---|---|
| `eventId` | string (UUID v4) | Yes | Unique identifier generated by the ingestion service |
| `sourceId` | string | Yes | Registered source system identifier |
| `cycleId` | string | Yes | Business cycle identifier |
| `eventType` | string | Yes | Dot-notation event type (e.g., `order.shipped`) |
| `customerId` | string | Yes | Customer identifier |
| `orderId` | string | Yes | Order identifier |
| `customerEmail` | string | Yes | Customer email address |
| `customerPhone` | string | Yes | Customer phone number (E.164 format) |
| `timestamp` | string (ISO-8601) | Yes | When the business event occurred (UTC) |
| `priority` | string | Yes | Priority tier for downstream processing: `normal` (default) or `critical`. Determined by the `priority` field in the event mapping configuration. |

### Optional Fields (top-level)

| Field | Type | Description |
|---|---|---|
| `customerName` | string | Customer full name |
| `items` | array | Array of order line items |
| `totalAmount` | number | Total order amount |
| `currency` | string | ISO-4217 currency code |
| `additionalData` | object | Extra source-specific fields not covered by canonical schema |

### System Metadata (`metadata` object)

Auto-generated by the ingestion service — not populated from source data.

| Field | Type | Description |
|---|---|---|
| `correlationId` | string | Unique correlation ID for tracing the event through the pipeline |
| `sourceEventId` | string | Original event ID from the source system (used for deduplication) |
| `receivedAt` | string (ISO-8601) | Timestamp when the event was received by the ingestion service |
| `normalizedAt` | string (ISO-8601) | Timestamp when normalization completed |
| `schemaVersion` | string | Version of the canonical schema (`"2.0"`) |
| `mappingConfigId` | string (UUID) | ID of the `event_mappings` configuration used for normalization |

### Full Canonical Event Example

```json
{
  "eventId": "af47ac10b-58cc-4372-a567-0e02b2c3d479",
  "sourceId": "erp-system-1",
  "cycleId": "CYC-2026-00451",
  "eventType": "order.shipped",
  "customerId": "CUST-00451",
  "orderId": "ERP-ORD-2026-00451",
  "customerEmail": "jane.doe@example.com",
  "customerPhone": "+1234567890",
  "timestamp": "2026-02-20T10:15:30.000Z",
  "priority": "critical",
  "customerName": "Jane Doe",
  "items": [
    {
      "sku": "PROD-001",
      "name": "Wireless Headphones",
      "quantity": 1,
      "price": 79.99
    }
  ],
  "totalAmount": 79.99,
  "currency": "USD",
  "additionalData": {
    "trackingNumber": "794644790132",
    "carrier": "FedEx"
  },
  "metadata": {
    "correlationId": "corr-8f14e45f-ceea-467f-a8f5-5f1b39e5c7e2",
    "sourceEventId": "ERP-EVT-78901",
    "receivedAt": "2026-02-20T10:15:30.123Z",
    "normalizedAt": "2026-02-20T10:15:30.456Z",
    "schemaVersion": "2.0",
    "mappingConfigId": "d4f8e2a1-3b5c-4d6e-8f9a-1b2c3d4e5f6a"
  }
}
```

---

## 8. Database Design

- **Schema:** `event_ingestion_service`
- **User:** `event_ingestion_service_user`
- **DB Script:** `event-ingestion-service/dbscripts/schema-event-ingestion-service.sql`

### events Table

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `BIGSERIAL` | `PRIMARY KEY` | Auto-increment surrogate key |
| `event_id` | `UUID` | `NOT NULL UNIQUE DEFAULT gen_random_uuid()` | Canonical event identifier |
| `source_id` | `VARCHAR(50)` | `NOT NULL` | Registered source system identifier |
| `cycle_id` | `VARCHAR(255)` | `NOT NULL` | Business cycle identifier |
| `event_type` | `VARCHAR(100)` | `NOT NULL` | Dot-notation event type |
| `source_event_id` | `VARCHAR(255)` | | Original event ID from source |
| `raw_payload` | `JSONB` | `NOT NULL` | Original payload as received |
| `normalized_payload` | `JSONB` | | Canonical format after normalization |
| `status` | `VARCHAR(20)` | `NOT NULL DEFAULT 'received'` | Processing status |
| `error_message` | `TEXT` | | Error details if processing failed |
| `correlation_id` | `UUID` | | Correlation ID for distributed tracing |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

#### Indexes

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_events_event_id` | `event_id` | UNIQUE | Fast lookup by canonical ID |
| `idx_events_source_source_event_id` | `source_id, source_event_id` | UNIQUE (partial, WHERE source_event_id IS NOT NULL) | Deduplication composite key |
| `idx_events_source_type` | `source_id, event_type` | B-Tree | Filter by source and type |
| `idx_events_status` | `status` | B-Tree | Filter by processing status |
| `idx_events_created_at` | `created_at` | B-Tree | Time-range queries |

#### Status Enum Values

| Status | Description |
|---|---|
| `received` | Event received and persisted, awaiting normalization |
| `validated` | Payload validation passed (if `validationSchema` was configured) |
| `normalized` | Normalization completed |
| `published` | Successfully published to `events.normalized` exchange |
| `failed` | Processing failed (see `error_message`) |
| `duplicate` | Identified as duplicate, not re-processed |

### event_sources Table

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `SERIAL` | `PRIMARY KEY` | Auto-increment surrogate key |
| `name` | `VARCHAR(50)` | `NOT NULL UNIQUE` | Source system identifier (used as `sourceId`) |
| `display_name` | `VARCHAR(100)` | `NOT NULL` | Human-readable name |
| `type` | `VARCHAR(20)` | `NOT NULL` | Integration type (`rabbitmq`, `webhook`) |
| `connection_config` | `JSONB` | | Connection configuration (queue names, routing keys) |
| `api_key_hash` | `VARCHAR(128)` | | SHA-256 hash of API key (webhook sources) |
| `signing_secret_hash` | `VARCHAR(128)` | | SHA-256 hash of signing secret (HMAC sources) |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT true` | Whether the source is active |
| `rate_limit` | `INTEGER` | | Max events per second (null = unlimited) |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

### event_mappings Table

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Mapping configuration identifier |
| `source_id` | `VARCHAR(50)` | `NOT NULL` | Registered source system identifier |
| `event_type` | `VARCHAR(100)` | `NOT NULL` | Canonical event type (or `*` for wildcard) |
| `name` | `VARCHAR(255)` | `NOT NULL` | Human-readable mapping name |
| `description` | `TEXT` | | Description of the mapping purpose |
| `field_mappings` | `JSONB` | `NOT NULL` | Field extraction and transformation rules |
| `event_type_mapping` | `JSONB` | | Source event types → canonical event types |
| `timestamp_field` | `VARCHAR(255)` | | Dot-path to timestamp in source payload |
| `timestamp_format` | `VARCHAR(50)` | `DEFAULT 'iso8601'` | Timestamp format |
| `source_event_id_field` | `VARCHAR(255)` | | Dot-path to source deduplication ID |
| `validation_schema` | `JSONB` | | Optional JSON Schema for incoming payload validation |
| `priority` | `VARCHAR(10)` | `NOT NULL DEFAULT 'normal'` | Event priority tier: `normal` or `critical` |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT true` | Whether this mapping is active |
| `version` | `INTEGER` | `NOT NULL DEFAULT 1` | Configuration version |
| `created_by` | `VARCHAR(100)` | | User who created the mapping |
| `updated_by` | `VARCHAR(100)` | | User who last updated the mapping |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

**Unique constraint:** `(source_id, event_type) WHERE is_active = true` — ensures only one active mapping per source+type pair.

### Figure 8.1 — Entity Relationship Diagram

```
┌──────────────────────────────┐       ┌──────────────────────────────┐
│         event_sources        │       │        event_mappings        │
├──────────────────────────────┤       ├──────────────────────────────┤
│ PK  id          SERIAL       │       │ PK  id          UUID         │
│     name        VARCHAR(50)  │       │     source_id   VARCHAR(50)  │
│     display_name VARCHAR(100)│       │     event_type  VARCHAR(100) │
│     type        VARCHAR(20)  │       │     name        VARCHAR(255) │
│     connection_config JSONB  │       │     field_mappings JSONB     │
│     api_key_hash VARCHAR(128)│       │     event_type_mapping JSONB │
│     signing_secret_hash      │       │     timestamp_field          │
│     is_active   BOOLEAN      │       │     validation_schema JSONB  │
│     rate_limit  INTEGER      │       │     is_active   BOOLEAN      │
│     created_at  TIMESTAMPTZ  │       │     version     INTEGER      │
│     updated_at  TIMESTAMPTZ  │       │     created_at  TIMESTAMPTZ  │
└──────────────┬───────────────┘       │     updated_at  TIMESTAMPTZ  │
               │                       └──────────────┬───────────────┘
               │ source_id (name)                     │
               │                                      │ source_id + event_type
               ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                             events                                  │
├─────────────────────────────────────────────────────────────────────┤
│ PK  id                 BIGSERIAL                                    │
│ UK  event_id           UUID                                         │
│     source_id          VARCHAR(50)      ◄── FK to event_sources     │
│     cycle_id           VARCHAR(255)                                  │
│     event_type         VARCHAR(100)     ◄── lookup in event_mappings│
│     source_event_id    VARCHAR(255)                                  │
│     raw_payload        JSONB                                         │
│     normalized_payload JSONB                                         │
│     status             VARCHAR(20)                                   │
│     error_message      TEXT                                          │
│     correlation_id     UUID                                          │
│     created_at         TIMESTAMPTZ                                   │
│     updated_at         TIMESTAMPTZ                                   │
├─────────────────────────────────────────────────────────────────────┤
│ UK  (source_id, source_event_id) WHERE source_event_id IS NOT NULL  │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Retention

The `events` table is the dominant growth table in the platform (~5 GB/month, ~50 GB/year). A scheduled payload purge reclaims storage from large JSONB payloads while preserving event metadata for audit and debugging.

#### Payload Purge

After 90 days (configurable), the `raw_payload` and `normalized_payload` columns are set to `NULL`. The event row itself — including `event_id`, `source_id`, `event_type`, `status`, `correlation_id`, and timestamps — is retained indefinitely for audit and tracing.

#### Purge Function

`event_ingestion_service.purge_event_payloads()` is a PL/pgSQL function that performs the purge:

| Parameter | Default | Description |
|---|---|---|
| `p_older_than_days` | 90 | NULL out `raw_payload` and `normalized_payload` on rows older than this |

**Usage:**

```sql
-- Run with default (90 days)
SELECT event_ingestion_service.purge_event_payloads();

-- Custom retention period
SELECT event_ingestion_service.purge_event_payloads(60);
```

**Returns** a JSONB summary:

```json
{
  "purged_rows": 142857,
  "cutoff": "2025-11-22T02:00:00.000Z",
  "executed_at": "2026-02-20T02:00:00.000Z"
}
```

**Scheduling:** The function is designed to be called by `pg_cron` (e.g., daily at 02:00 UTC), an application-level scheduler, or manually during maintenance windows.

---

## 9. Event Validation

### Validation Flow

Validation is optional and driven by the mapping configuration. If an `event_mappings` row includes a `validationSchema` (JSON Schema), the incoming payload is validated before normalization. This replaces the previous schema registry approach — validation schemas are now stored inline in the mapping configuration.

1. **Lookup mapping** for `(sourceId, eventType)` (done in pipeline step 4).
2. **Check `validationSchema`:** If the mapping has a `validationSchema` field, proceed to validation. If not, skip to dedup check.
3. **Validate** the raw payload against the JSON Schema using `ajv` (Another JSON Validator).
4. **Pass:** Proceed to deduplication and normalization.
5. **Fail:** Reject with `422 Unprocessable Entity` including all violation details.

### Example Validation Schema (in mapping config)

```json
{
  "validationSchema": {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "required": ["order_reference", "customer"],
    "properties": {
      "order_reference": { "type": "string", "minLength": 1 },
      "customer": {
        "type": "object",
        "required": ["email", "id"],
        "properties": {
          "email": { "type": "string", "format": "email" },
          "id": { "type": "string", "minLength": 1 },
          "phone": { "type": "string", "pattern": "^\\+[1-9]\\d{1,14}$" }
        }
      },
      "line_items": {
        "type": "array",
        "items": {
          "type": "object",
          "required": ["sku", "name", "qty", "unit_price"],
          "properties": {
            "sku": { "type": "string" },
            "name": { "type": "string" },
            "qty": { "type": "integer", "minimum": 1 },
            "unit_price": { "type": "number", "minimum": 0 }
          }
        }
      }
    }
  }
}
```

> **Info:** **Inline Validation:** Validation schemas are stored directly in the `event_mappings` table alongside field mappings, consolidating mapping + validation into a single configuration per `(sourceId, eventType)`. Updates take effect immediately on the next database query (default mode), or within ~100ms when eager caching is enabled (`MAPPING_CACHE_ENABLED=true`) via event-driven invalidation.

> **Warning:** **Strict vs. Permissive Validation:** Unlike a global schema registry, validation strictness is now per-mapping. Some mappings may use `"additionalProperties": false` for strict validation, while others may omit validation entirely if the source is trusted. Choose the appropriate level per source system.

---

## 10. Idempotency & Deduplication

### Deduplication Strategy

The Event Ingestion Service prevents duplicate event processing using a composite key strategy:

- **Composite Key:** `(source_id, source_event_id)` — unique per source system within the dedup window.
- **Source Event ID Extraction:** The `sourceEventIdField` in the mapping configuration defines the dot-path to the deduplication ID in the source payload. For webhook events, the `sourceEventId` field from the request body is used directly if present.
- **Dedup Window:** Configurable via `DEDUP_WINDOW_HOURS` (default: 24 hours).
- **Mechanism:** `INSERT ... ON CONFLICT (source_id, source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING`.
- **Result:** If the insert succeeds, the event is new. If it conflicts, the existing event ID is returned.

### Figure 10.1 — Idempotency Check Flow

```
                 ┌──────────────────────┐
                 │   Incoming Event      │
                 └──────────┬───────────┘
                            ▼
                ◆ sourceEventId present? ◆
                   │                │
                  Yes               No
                   │                │
                   ▼                ▼
        ◆ Exists in DB within  ◆   Generate new eventId
        ◆ dedup window?        ◆   Proceed to normalize
                   │                │
                  Yes               │
                   │                │
                   ▼                │
          Return existing           │
          eventId (200 OK)          │
                                    │
                  No ◄──────────────┘
                   │
                   ▼
          INSERT new event
          Proceed to normalize
```

### Edge Cases

| Scenario | Behavior |
|---|---|
| **Missing sourceEventId** | Event is always treated as new — no dedup check. A new `eventId` is generated. |
| **Same sourceEventId, different sourceId** | Treated as separate events — the composite key includes the `sourceId`. |
| **Same event within dedup window** | Returns `200 OK` with the existing `eventId` and `"status": "duplicate"`. |
| **Same event after dedup window** | Treated as a new event — the original record may have been archived. |
| **Concurrent duplicates** | PostgreSQL's `ON CONFLICT` handles race conditions atomically. |

---

## 11. Sequence Diagrams

### 11.1 Webhook Flow

```
Source System          Gateway           Event Ingestion         PostgreSQL / RabbitMQ
     │                    │                     │                         │
     │  HTTP POST         │                     │                         │
     │  /webhooks/events  │                     │                         │
     │───────────────────▶│                     │                         │
     │                    │  Validate auth      │                         │
     │                    │  (per-source)       │                         │
     │                    │────────────────────▶│                         │
     │                    │                     │  Lookup mapping         │
     │                    │                     │────────────────────────▶│
     │                    │                     │  Mapping config         │
     │                    │                     │◄────────────────────────│
     │                    │                     │  Validate (optional)    │
     │                    │                     │  Check dedup            │
     │                    │                     │────────────────────────▶│
     │                    │                     │  Dedup result           │
     │                    │                     │◄────────────────────────│
     │                    │                     │  Normalize (mapping)    │
     │                    │                     │                         │
     │                    │                     │  INSERT event           │
     │                    │                     │────────────────────────▶│
     │                    │                     │  Confirm                │
     │                    │                     │◄────────────────────────│
     │                    │                     │  Publish to             │
     │                    │                     │  events.normalized      │
     │                    │                     │────────────────────────▶│
     │                    │  202 Accepted        │                         │
     │                    │◄────────────────────│                         │
     │  202 Accepted      │                     │                         │
     │◄───────────────────│                     │                         │
```

### 11.2 RabbitMQ Consumer Flow

```
Source System     events.incoming      Consumer           PostgreSQL / events.normalized
     │              Exchange              │                         │
     │                 │                  │                         │
     │  Publish msg    │                  │                         │
     │  source.{id}.*  │                  │                         │
     │────────────────▶│                  │                         │
     │                 │  Deliver to       │                         │
     │                 │  q.events.amqp   │                         │
     │                 │─────────────────▶│                         │
     │                 │                  │  Lookup mapping         │
     │                 │                  │────────────────────────▶│
     │                 │                  │  Mapping config         │
     │                 │                  │◄────────────────────────│
     │                 │                  │  Validate (optional)    │
     │                 │                  │  Check dedup            │
     │                 │                  │────────────────────────▶│
     │                 │                  │  Dedup result           │
     │                 │                  │◄────────────────────────│
     │                 │                  │  Normalize (mapping)    │
     │                 │                  │  INSERT event           │
     │                 │                  │────────────────────────▶│
     │                 │                  │  Publish to normalized  │
     │                 │                  │────────────────────────▶│
     │                 │  ACK message     │                         │
     │                 │◄─────────────────│                         │
     │                 │                  │                         │
     │                 │    ┌─────────────────────────────┐         │
     │                 │    │ ALT: Failure                 │         │
     │                 │    │  NACK → DLQ after 3 retries  │         │
     │                 │    └─────────────────────────────┘         │
```

---

## 12. Error Handling & Dead Letters

### Error Categories

| Category | HTTP Status | Handling | Retry |
|---|---|---|---|
| **Validation Error** | 422 | Reject with violation details, log warning | No |
| **Mapping Not Found** | 422 | Reject — no mapping config for `(sourceId, eventType)` | No |
| **Duplicate Event** | 200 | Return existing eventId, no processing | No |
| **Auth Failure** | 401 | Reject, log security warning | No |
| **Transient DB Error** | 500 | Retry with exponential backoff | Yes (3x) |
| **Transient RabbitMQ Error** | 500 | NACK + requeue, retry with backoff | Yes (3x) |
| **Normalization Error** | 500 | Log error, mark event as failed | No |

### Dead-Letter Queue Strategy

- **DLQ Exchange:** `notifications.dlq` (fanout)
- **Configuration:** All source queues declare `x-dead-letter-exchange: notifications.dlq`
- **Trigger:** Messages are dead-lettered after 3 failed delivery attempts (tracked via `x-death` headers)
- **`x-death` Headers:** RabbitMQ automatically appends `x-death` headers with failure count, reason, original exchange, and routing key

### Retry Configuration

| Parameter | Value | Description |
|---|---|---|
| `maxRetries` | 3 | Maximum retry attempts before dead-lettering |
| `initialDelay` | 1000 ms | First retry delay |
| `backoffMultiplier` | 2x | Exponential backoff multiplier |
| `maxDelay` | 30,000 ms | Maximum delay between retries |

> **Warning:** **Poison Messages:** Messages that consistently fail processing (e.g., malformed headers, corrupt payloads) will be dead-lettered after 3 attempts. The DLQ should be monitored and dead-lettered messages investigated manually. A dedicated DLQ consumer can be added to alert operations teams and provide automated triage.

---

## 13. Monitoring & Health Checks

### Key Metrics

| Metric | Description | Alert Threshold |
|---|---|---|
| `event_ingestion_received_total` | Total events received (by sourceId) | — |
| `event_ingestion_published_total` | Total events published to normalized exchange | — |
| `event_ingestion_failed_total` | Total events that failed processing | > 10/min |
| `event_ingestion_duplicate_total` | Total duplicate events detected | — |
| `event_ingestion_validation_errors_total` | Total validation failures (by sourceId) | > 50/min |
| `event_ingestion_mapping_not_found_total` | Total mapping-not-found rejections | > 5/min |
| `event_ingestion_processing_duration_ms` | Event processing latency (p50, p95, p99) | p99 > 500ms |
| `event_ingestion_queue_depth` | Current queue depth per queue | > 1000 |
| `event_ingestion_consumer_lag` | Consumer lag (messages behind) | > 5000 |
| `event_ingestion_dlq_depth` | Dead-letter queue depth | > 0 |
| `event_ingestion_service_pool_active` | Active database connections | > 80% of pool |
| `event_ingestion_mapping_cache_hit_rate` | Mapping config cache hit ratio (when `MAPPING_CACHE_ENABLED=true`) | < 80% |
| `event_ingestion_mapping_cache_invalidations_total` | Total cache invalidation events received | — |

### Structured Logging

All log entries use structured JSON format with the following standard fields:

```json
{
  "timestamp": "2026-02-20T10:15:30.123Z",
  "level": "info",
  "service": "event-ingestion-service",
  "correlationId": "corr-8f14e45f-ceea-467f-a8f5-5f1b39e5c7e2",
  "eventId": "af47ac10b-58cc-4372-a567-0e02b2c3d479",
  "sourceId": "erp-system-1",
  "eventType": "order.shipped",
  "message": "Event normalized and published successfully",
  "durationMs": 45
}
```

> **Info:** **Prometheus + Grafana:** All metrics are exposed via a `/metrics` endpoint in Prometheus format. A pre-configured Grafana dashboard provides real-time visibility into event throughput, processing latency, error rates, queue depths, and consumer health. Alerts are configured in Grafana for critical thresholds.

---

## 14. Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3151` | HTTP server port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `RABBITMQ_URL` | — | RabbitMQ connection string (AMQP) |
| `RABBITMQ_PREFETCH` | `10` | Per-consumer prefetch count |
| `DEDUP_WINDOW_HOURS` | `24` | Deduplication window in hours |
| `WEBHOOK_RATE_LIMIT` | `100` | Max webhook requests per second (global default) |
| `LOG_LEVEL` | `info` | Logging level (`debug`, `info`, `warn`, `error`) |
| `MAPPING_CACHE_ENABLED` | `false` | Enable eager mapping cache with event-driven invalidation via RabbitMQ. When `false`, every mapping lookup queries PostgreSQL directly. |
| `DLQ_MAX_RETRIES` | `3` | Maximum retries before dead-lettering |
| `RETRY_INITIAL_DELAY_MS` | `1000` | Initial retry delay in milliseconds |
| `RETRY_BACKOFF_MULTIPLIER` | `2` | Exponential backoff multiplier |
| `RETRY_MAX_DELAY_MS` | `30000` | Maximum retry delay in milliseconds |
| `HEALTH_CHECK_INTERVAL_MS` | `30000` | Health check polling interval |

---

*Notification API Documentation v2.0 -- Architecture Team -- 2026*
