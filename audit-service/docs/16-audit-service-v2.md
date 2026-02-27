> *This is a convenience copy. The authoritative version is at `../../docs/16-audit-service-v2.md`.*

# 16 — Audit Service

**Notification API — Audit Service Deep-Dive**

| | |
|---|---|
| **Version:** | 2.0 |
| **Date:** | 2026-02-26 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

> **Info:** This is v2 of the Audit Service design, updated for the decoupled provider adapter architecture. The v1 reference is at `16-audit-service.md`.

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [Architecture & Integration Points](#2-architecture--integration-points)
3. [Event Sourcing Model](#3-event-sourcing-model)
4. [Multi-Source Event Capture Pipeline](#4-multi-source-event-capture-pipeline)
5. [Delivery Receipt Correlation](#5-delivery-receipt-correlation)
6. [End-to-End Notification Trace](#6-end-to-end-notification-trace)
7. [Analytics Aggregation Engine](#7-analytics-aggregation-engine)
8. [Full-Text Search](#8-full-text-search)
9. [Dead-Letter Queue Monitoring](#9-dead-letter-queue-monitoring)
10. [RabbitMQ Topology](#10-rabbitmq-topology)
11. [REST API Endpoints](#11-rest-api-endpoints)
12. [Database Design](#12-database-design)
13. [Data Retention & Purge Strategy](#13-data-retention--purge-strategy)
14. [Sequence Diagrams](#14-sequence-diagrams)
15. [Error Handling & Consumer Resilience](#15-error-handling--consumer-resilience)
16. [GDPR & Compliance](#16-gdpr--compliance)
17. [Security Considerations](#17-security-considerations)
18. [Monitoring & Health Checks](#18-monitoring--health-checks)
19. [Configuration](#19-configuration)

---

## 1. Service Overview

The Audit Service is the observability backbone of the Notification API platform. It provides comprehensive logging, tracking, and analytics for the entire notification lifecycle — from event ingestion through delivery confirmation. Operating on an event-sourcing model, it consumes status updates from all upstream services via RabbitMQ and maintains a complete, immutable record of every notification event. This service is critical for compliance, debugging, business intelligence, and end-to-end notification tracing.

| Attribute | Value |
|---|---|
| **Technology** | NestJS (TypeScript) with RabbitMQ consumers (`@golevelup/nestjs-rabbitmq`) |
| **Port** | `3156` |
| **Schema** | PostgreSQL — `audit_service` |
| **Dependencies** | RabbitMQ (5 consumed queues across 4 exchanges), PostgreSQL |
| **Source Repo Folder** | `audit-service/` |

### Responsibilities

1. **Event Sourcing:** Captures every state transition in the notification lifecycle as an immutable audit event. Events are never updated or deleted — only appended.
2. **Delivery Receipt Tracking:** Records delivery receipts from external providers (opened, clicked, bounced, unsubscribed) via webhook callbacks received by provider adapter microservices and published to `xch.notifications.status`.
3. **End-to-End Notification Trace:** Reconstructs the full lifecycle of any notification — from event ingestion through delivery confirmation — via a unified trace API.
4. **Searchable Notification History:** Provides full-text search across notification content, recipients, and metadata using PostgreSQL `tsvector`/`tsquery`.
5. **Analytics Aggregation:** Pre-aggregates notification metrics for dashboard consumption — delivery rates, channel performance, average delivery latency, hourly/daily volume trends, and failure categorization.
6. **Dead-Letter Queue Monitoring:** Captures and catalogs all permanently failed messages from the central DLQ for investigation, metrics, and optional reprocessing.
7. **Compliance Logging:** Maintains records required for regulatory compliance (GDPR, CAN-SPAM). Tracks consent status, opt-out events, and data access requests.
8. **Data Retention:** Implements configurable two-tier retention policies — audit event payloads purged after 90 days while metadata is retained for 2 years.
9. **Cross-Notification Correlation:** Enables tracing across related notifications using `correlation_id` and `cycle_id` for business cycle and request-level grouping.

> **Info:** **Immutable Event Store**
>
> The Audit Service operates as an append-only event store. All records in `audit_events` and `delivery_receipts` are immutable — no UPDATE or DELETE operations are permitted on these tables during normal operation. The only exception is the scheduled retention purge function, which NULLs payload data while preserving metadata. This immutability guarantee is enforced at the application layer and is critical for regulatory compliance and forensic investigation.

---

## 2. Architecture & Integration Points

The Audit Service is a **consume-only** service — it subscribes to 5 RabbitMQ queues across 4 exchanges and exposes a REST API for querying. It does not publish any messages to RabbitMQ.

### Upstream & Downstream Dependencies

| Direction | Service / Component | Integration | Purpose |
|---|---|---|---|
| **Upstream** | Event Ingestion Service | RabbitMQ (`audit.events` queue) | Event ingestion and normalization audit trail |
| **Upstream** | Notification Engine Service | RabbitMQ (`q.status.updates` queue) | Processing status transitions (processing, rendering, delivering, suppressed) |
| **Upstream** | Channel Router Service (Core) | RabbitMQ (`q.status.updates`, `audit.deliver` queues) | Delivery attempts, delivery status (sent, failed), delivery-path events |
| **Upstream** | Provider Adapter Services | RabbitMQ (`q.status.updates` queue, routing key `adapter.webhook.{providerId}`) | Webhook-originated delivery receipts (delivered, bounced, opened, clicked, etc.) |
| **Upstream** | Template Service | RabbitMQ (`q.audit.template` queue) | Template lifecycle events (created, updated, deleted, rolledback, render completed/failed) |
| **Upstream** | DLQ (all services) | RabbitMQ (`audit.dlq` queue) | Permanently failed messages from all DLQ-enabled queues |
| **Downstream** | Notification Gateway | REST API (proxied) | Trace queries, log queries, analytics, DLQ monitoring |
| **Downstream** | Admin Service | REST API (proxied via Gateway) | Dashboard analytics aggregation |

### Integration Context Diagram

```
+-------------------------------------------------------------+
|                      RabbitMQ Broker                         |
|  vhost: vhnotificationapi                                   |
|                                                              |
|  xch.events.normalized -----> [ audit.events ]               |
|  xch.notifications.deliver -> [ audit.deliver ]              |
|  xch.notifications.status --> [ q.status.updates ]           |
|    routing keys:                                             |
|      notification.status.# (from Channel Router Core)        |
|      adapter.webhook.{providerId} (from Adapter Services)    |
|                           --> [ q.audit.template ]           |
|  xch.notifications.dlq ----> [ audit.dlq ]                  |
+---------------------------+---------------------------------+
                            |
                            v
              +----------------------------+
              |      Audit Service         |
              |      :3156                 |
              |                            |
              |  5 Consumer Groups         |
              |  PostgreSQL audit_service  |
              |  REST API                  |
              +--------+-------------------+
                       |
          +------------+------------+
          |                         |
          v                         v
+-------------------+    +-------------------+
| Gateway :3150     |    | Admin Service     |
| (proxy to REST)   |    | :3155             |
| /api/v1/audit/*   |    | (dashboard data)  |
+-------------------+    +-------------------+
```

*Figure 2.1 — Audit Service integration context showing 5 inbound RabbitMQ queues (including adapter webhook events on `q.status.updates`) and REST API consumers.*

---

## 3. Event Sourcing Model

### Immutability Contract

Every state transition in the notification lifecycle is recorded as an immutable `AuditEvent`. Once written, audit events are never modified or deleted (payload NULLing during scheduled retention is the sole exception). This append-only model provides:

- **Complete History:** Every state a notification has ever been in is preserved.
- **Forensic Capability:** Investigations can reconstruct exact system behavior at any point in time.
- **Compliance Evidence:** Regulators can verify that records have not been tampered with.

### AuditEvent Schema

Each audit event follows a consistent structure regardless of source:

```json
{
  "id": "ae-550e8400-e29b-41d4-a716-446655440000",
  "notificationId": "notif-456",
  "correlationId": "corr-abc-123",
  "cycleId": "CYC-2026-00451",
  "eventType": "DELIVERY_ATTEMPTED",
  "actor": "channel-router-service",
  "metadata": {
    "channel": "email",
    "provider": "mailgun",
    "attempt": 1
  },
  "payloadSnapshot": { "subject": "Your order has shipped", "recipientEmail": "customer@example.com" },
  "createdAt": "2026-02-20T10:15:30.500Z"
}
```

**Webhook-originated event example (adapter as actor):**

```json
{
  "id": "ae-661f9500-f30c-52e5-b827-557766550111",
  "notificationId": "notif-456",
  "correlationId": "corr-abc-123",
  "cycleId": "CYC-2026-00451",
  "eventType": "DELIVERED",
  "actor": "adapter-mailgun",
  "metadata": {
    "channel": "email",
    "provider": "mailgun",
    "providerMessageId": "<20230101.abc123@domain.com>"
  },
  "payloadSnapshot": null,
  "createdAt": "2026-02-20T10:16:05.000Z"
}
```

> **Info:** **Actor Attribution**
>
> For events on the delivery path (`DELIVERY_ATTEMPTED`, `DELIVERY_SENT`, `DELIVERY_FAILED`, `DELIVERY_RETRYING`), the actor is `channel-router-service` — the core orchestrator. For webhook-originated events (`DELIVERED`, `BOUNCED`, `OPENED`, `CLICKED`, `UNSUBSCRIBED`, `SPAM_COMPLAINT`), the actor is `adapter-{providerId}` — the adapter service that received and verified the provider webhook. This distinction is critical for understanding which component produced each audit event.

### Event Type Taxonomy

Audit event types are grouped by lifecycle stage:

| Stage | Event Types | Actor |
|---|---|---|
| **Ingestion** | `EVENT_INGESTED`, `EVENT_NORMALIZED`, `EVENT_VALIDATION_FAILED`, `EVENT_DUPLICATE_DETECTED` | event-ingestion-service |
| **Rule Matching** | `RULE_MATCHED`, `RULE_NO_MATCH`, `NOTIFICATION_SUPPRESSED` | notification-engine-service |
| **Rendering** | `TEMPLATE_RENDERED`, `TEMPLATE_RENDER_FAILED` | notification-engine-service |
| **Delivery** | `DELIVERY_DISPATCHED`, `DELIVERY_ATTEMPTED`, `DELIVERY_SENT`, `DELIVERY_FAILED`, `DELIVERY_RETRYING` | channel-router-service |
| **Provider Status** | `PROVIDER_ACCEPTED`, `DELIVERED`, `BOUNCED`, `OPENED`, `CLICKED`, `UNSUBSCRIBED`, `SPAM_COMPLAINT` | adapter-{providerId} (via webhooks) |
| **Template Lifecycle** | `TEMPLATE_CREATED`, `TEMPLATE_UPDATED`, `TEMPLATE_DELETED`, `TEMPLATE_ROLLEDBACK` | template-service |
| **DLQ** | `DLQ_CAPTURED` | audit-service |

### Correlation Model

Three identifiers enable cross-cutting tracing:

| Identifier | Scope | Purpose |
|---|---|---|
| `notification_id` | Single notification | Traces one notification's lifecycle end-to-end |
| `correlation_id` | Request/batch | Groups all notifications originating from a single API request or bulk upload batch |
| `cycle_id` | Business cycle | Groups all notifications within a business cycle (e.g., all order events for `CYC-2026-00451`) |

### Notification Lifecycle State Diagram

```
                    EVENT_INGESTED
                         |
                         v
                   EVENT_NORMALIZED
                         |
                    +----+----+
                    |         |
                    v         v
             RULE_MATCHED   RULE_NO_MATCH
                    |         (terminal)
                    |
               +----+----+
               |         |
               v         v
     TEMPLATE_RENDERED  NOTIFICATION_SUPPRESSED
               |         (terminal)
               |
               v
        DELIVERY_DISPATCHED
               |
               v
        DELIVERY_ATTEMPTED
               |
          +----+----+----+
          |         |    |
          v         v    v
   DELIVERY_SENT  DELIVERY_FAILED  DELIVERY_RETRYING
          |         |                     |
          v         v                     |
   PROVIDER_ACCEPTED  DLQ_CAPTURED        |
          |           (terminal)    (loops back to
          |                         DELIVERY_ATTEMPTED)
     +----+----+----+----+
     |    |    |    |    |
     v    v    v    v    v
  DELIVERED BOUNCED OPENED CLICKED UNSUBSCRIBED
                                   SPAM_COMPLAINT
```

*Figure 3.1 — Notification lifecycle state transitions captured by the Audit Service.*

> **Info:** **Terminal vs. Intermediate States**
>
> Terminal states (`RULE_NO_MATCH`, `NOTIFICATION_SUPPRESSED`, `DLQ_CAPTURED`, `DELIVERED`, `BOUNCED`) represent the final state of a notification on a given channel. Intermediate states (`DELIVERY_RETRYING`, `DELIVERY_ATTEMPTED`) may occur multiple times per notification. The trace API assembles all states into a chronological timeline.

---

## 4. Multi-Source Event Capture Pipeline

The Audit Service runs 5 independent consumer groups — one per consumed queue. Each consumer processes messages from a specific upstream exchange and persists them as immutable audit events.

### Consumer Architecture

| Consumer | Queue | Exchange | Routing Key | Events Processed |
|---|---|---|---|---|
| **Events Consumer** | `audit.events` | `xch.events.normalized` | `event.#` | Event ingestion/normalization |
| **Deliver Consumer** | `audit.deliver` | `xch.notifications.deliver` | `notification.deliver.#` | Delivery dispatch from engine |
| **Status Consumer** | `q.status.updates` | `xch.notifications.status` | `notification.status.#`, `adapter.webhook.#` | All status transitions (delivery-path from Channel Router Core, webhook events from adapter services) |
| **Template Consumer** | `q.audit.template` | `xch.notifications.status` | `template.#` | Template lifecycle events |
| **DLQ Consumer** | `audit.dlq` | `xch.notifications.dlq` | _(fanout)_ | Permanently failed messages |

### Consumer Processing

Each consumer follows a consistent processing pipeline:

```
  Message received from queue
           |
           v
  +------------------+
  | 1. Deserialize   |
  |    message       |
  +--------+---------+
           |
           v
  +------------------+
  | 2. Extract IDs   |
  |    notification_id|
  |    correlation_id |
  |    cycle_id       |
  +--------+---------+
           |
           v
  +------------------+
  | 3. Map to        |
  |    event_type    |
  |    (taxonomy)    |
  +--------+---------+
           |
           v
  +------------------+
  | 4. Build         |
  |    AuditEvent    |
  |    record        |
  +--------+---------+
           |
           v
  +------------------+     +------------------+
  | 5. Add to batch  |---->| Flush when batch |
  |    buffer        |     | size reached OR  |
  |                  |     | flush interval   |
  +------------------+     +--------+---------+
                                    |
                                    v
                           +------------------+
                           | 6. Bulk INSERT   |
                           |    to            |
                           |    audit_events  |
                           +--------+---------+
                                    |
                                    v
                           +------------------+
                           | 7. ACK messages  |
                           +------------------+
```

*Figure 4.1 — Consumer message processing pipeline with batch insert optimization.*

### Batch Insert Optimization

To minimize database round-trips under high throughput, all consumers use a batch insert strategy:

| Parameter | Default | Env Var |
|---|---|---|
| Batch size | 50 | `CONSUMER_BATCH_SIZE` |
| Flush interval | 2,000 ms | `CONSUMER_FLUSH_INTERVAL_MS` |

Messages are buffered in memory and flushed to the database when either the batch size is reached or the flush interval expires — whichever occurs first. Messages are acknowledged only after the batch insert succeeds.

> **Warning:** **Batch Failure Recovery**
>
> If a batch insert fails, all messages in the batch are NACKed and requeued. The consumer backs off for `CONSUMER_RETRY_DELAY_MS` (default 5,000 ms) before resuming. This prevents tight retry loops during transient database outages while ensuring no audit events are lost.

### Fire-and-Forget Resilience

Upstream services publish audit messages using a fire-and-forget pattern — they do not wait for the Audit Service to acknowledge. This design ensures that audit trail maintenance never blocks the critical notification delivery path. If the Audit Service is temporarily unavailable, messages accumulate in the durable RabbitMQ queues and are processed when the service recovers.

---

## 5. Delivery Receipt Correlation

The delivery receipt correlation flow spans two decoupled paths — the send path (through Channel Router Core and the adapter) and the webhook path (from the provider through the adapter back to the Audit Service). Both paths converge on the `provider_message_id` as the correlation key.

### Send Path — Provider Message ID Acquisition

When the Channel Router Core dispatches a notification for delivery, it calls the appropriate provider adapter microservice via `POST /send`. The adapter communicates with the external provider, receives a `provider_message_id` in the provider's response, and returns it as part of the `SendResult` to the Core. The Core then publishes a delivery-attempt status message to `xch.notifications.status` that includes the `provider_message_id`. The Audit Service consumes this message and persists the `provider_message_id` in the `delivery_receipts` table, establishing the correlation anchor.

### Webhook Path — Provider Event Correlation

When a provider (Mailgun, Braze, etc.) reports a delivery outcome via webhook, the webhook is received by the Notification Gateway, which routes it to the appropriate provider adapter microservice. The adapter verifies the webhook signature, normalizes the provider-specific event into a standardized format, and publishes it to `xch.notifications.status` with routing key `adapter.webhook.{providerId}`. The published message includes the `provider_message_id` from the webhook payload. The Audit Service receives this message on the `q.status.updates` queue and correlates it to the existing `delivery_receipts` record using the `provider_message_id`.

### Correlation Strategy

```
  SEND PATH:

  Channel Router Core
  calls adapter POST /send
           |
           v
  Adapter sends to provider (e.g., Mailgun)
  Provider returns provider_message_id
  (e.g., "<20230101.abc123@domain.com>")
           |
           v
  Adapter returns SendResult
  { providerMessageId: "<20230101.abc123@domain.com>", ... }
  to Channel Router Core
           |
           v
  Core publishes delivery-attempt status
  to xch.notifications.status
  (routing key: notification.status.sent)
           |
           v
  Audit Service (Status Consumer)
  persists to delivery_receipts
           |
           +--- notification_id: "notif-456"
           +--- provider_message_id: "<20230101.abc123@domain.com>"
           +--- status: "sent"
           +--- channel: "email"
           +--- provider: "mailgun"


  WEBHOOK PATH:

  Provider sends webhook to Gateway
           |
           v
  Gateway routes to adapter-mailgun
           |
           v
  Adapter verifies signature,
  normalizes event
           |
           v
  Adapter publishes to xch.notifications.status
  (routing key: adapter.webhook.mailgun)
  { providerMessageId: "<20230101.abc123@domain.com>",
    status: "delivered", ... }
           |
           v
  Audit Service (Status Consumer)
  correlates via provider_message_id
  persists to delivery_receipts
           |
           +--- notification_id: "notif-456"
           +--- provider_message_id: "<20230101.abc123@domain.com>"
           +--- status: "delivered"
           +--- channel: "email"
           +--- provider: "mailgun"
```

*Figure 5.1 — Decoupled correlation flow: send path acquires provider_message_id via adapter SendResult; webhook path correlates via adapter-published normalized event.*

### Provider Status Mapping

The provider adapter microservices normalize provider-specific statuses into a standard set before publishing to `xch.notifications.status`. The Audit Service receives these pre-normalized statuses:

| Provider | Provider Status | Normalized Status |
|---|---|---|
| Mailgun | `delivered` | `DELIVERED` |
| Mailgun | `opened` | `OPENED` |
| Mailgun | `clicked` | `CLICKED` |
| Mailgun | `failed` (permanent) | `BOUNCED` |
| Mailgun | `complained` | `SPAM_COMPLAINT` |
| Mailgun | `unsubscribed` | `UNSUBSCRIBED` |
| Braze | `*.Delivery` | `DELIVERED` |
| Braze | `*.Open` | `OPENED` |
| Braze | `*.Click` | `CLICKED` |
| Braze | `*.Bounce` | `BOUNCED` |
| Braze | `*.SpamReport` | `SPAM_COMPLAINT` |
| WhatsApp (Meta) | `sent` | `SENT` |
| WhatsApp (Meta) | `delivered` | `DELIVERED` |
| WhatsApp (Meta) | `read` | `READ` |
| WhatsApp (Meta) | `failed` | `BOUNCED` |
| AWS SES | `Send` | `SENT` |
| AWS SES | `Delivery` | `DELIVERED` |
| AWS SES | `Bounce` | `BOUNCED` |
| AWS SES | `Complaint` | `SPAM_COMPLAINT` |
| AWS SES | `Open` | `OPENED` |
| AWS SES | `Click` | `CLICKED` |

### Orphaned Webhook Handling

If a delivery receipt arrives for a `provider_message_id` that does not match any known notification, it is logged as an orphaned receipt in the `delivery_receipts` table with `notification_id = NULL`. Orphaned receipts are included in monitoring metrics for investigation.

> **Warning:** **Orphaned Receipt Investigation**
>
> A sustained increase in orphaned receipts may indicate a synchronization issue between the adapter service's webhook events and the Audit Service's receipt store — for example, an adapter publishing a webhook event before the corresponding send-path status message has been consumed, or a provider reporting on messages sent before the platform was deployed. The `audit_orphaned_receipts_total` metric should be monitored with an alerting threshold.

---

## 6. End-to-End Notification Trace

The trace API is the primary debugging and investigation tool. It reconstructs the full lifecycle of a notification by querying both `audit_events` and `delivery_receipts`, merging them into a chronological timeline.

### Trace Reconstruction Algorithm

The trace endpoint executes the following 5-step algorithm:

1. **Fetch Audit Events:** Query `audit_events` WHERE `notification_id = :notificationId` ORDER BY `created_at ASC`.
2. **Fetch Delivery Receipts:** Query `delivery_receipts` WHERE `notification_id = :notificationId` ORDER BY `received_at ASC`.
3. **Merge Timelines:** Interleave audit events and delivery receipts by timestamp into a single chronological array.
4. **Extract Header Fields:** From the earliest `EVENT_INGESTED` audit event, extract `correlationId`, `cycleId`, `eventId`, `sourceId`, and `eventType` for the response header.
5. **Build Response:** Assemble the final trace response with header fields and merged timeline.

### `GET /audit/trace/:notificationId`

Returns the complete end-to-end timeline for a notification.

**Path Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `notificationId` | `string` (UUID) | The notification ID to trace |

**Response — `200 OK`:**

```json
{
  "notificationId": "notif-456",
  "correlationId": "corr-abc-123",
  "cycleId": "CYC-2026-00451",
  "eventId": "evt-123",
  "sourceId": "oms",
  "eventType": "order.shipped",
  "timeline": [
    { "timestamp": "2026-02-20T10:15:30.000Z", "stage": "EVENT_INGESTED", "actor": "event-ingestion-service", "details": {} },
    { "timestamp": "2026-02-20T10:15:30.200Z", "stage": "RULE_MATCHED", "actor": "notification-engine-service", "details": { "ruleId": "r-550e", "ruleName": "Order Shipped" } },
    { "timestamp": "2026-02-20T10:15:30.350Z", "stage": "TEMPLATE_RENDERED", "actor": "notification-engine-service", "details": { "templateId": "tpl-order-shipped", "channel": "email" } },
    { "timestamp": "2026-02-20T10:15:30.500Z", "stage": "DELIVERY_ATTEMPTED", "actor": "channel-router-service", "details": { "channel": "email", "attempt": 1, "provider": "mailgun" } },
    { "timestamp": "2026-02-20T10:15:31.200Z", "stage": "DELIVERY_SENT", "actor": "channel-router-service", "details": { "providerMessageId": "<20230101.abc123@domain.com>" } },
    { "timestamp": "2026-02-20T10:16:05.000Z", "stage": "DELIVERED", "actor": "adapter-mailgun", "details": { "channel": "email", "providerMessageId": "<20230101.abc123@domain.com>" } }
  ]
}
```

> **Info:** **Actor Attribution in Timeline**
>
> Note the actor change at the delivery boundary: `DELIVERY_ATTEMPTED` and `DELIVERY_SENT` show `channel-router-service` (the core orchestrator), while `DELIVERED` shows `adapter-mailgun` because that event originated from a provider webhook received and published by the Mailgun adapter service.

**Response — `404 Not Found`:**

```json
{
  "statusCode": 404,
  "message": "No audit trail found for notification notif-999",
  "error": "Not Found"
}
```

### Timeline Stage Table

| Stage | Source Table | Description |
|---|---|---|
| `EVENT_INGESTED` | `audit_events` | Event received and persisted by Event Ingestion Service |
| `EVENT_NORMALIZED` | `audit_events` | Event normalized to canonical format |
| `RULE_MATCHED` | `audit_events` | Notification rule matched by engine |
| `RULE_NO_MATCH` | `audit_events` | No rules matched — no notification created |
| `NOTIFICATION_SUPPRESSED` | `audit_events` | Notification suppressed by dedup/cooldown rules |
| `TEMPLATE_RENDERED` | `audit_events` | Template rendered for target channel |
| `TEMPLATE_RENDER_FAILED` | `audit_events` | Template rendering failed |
| `DELIVERY_DISPATCHED` | `audit_events` | Notification dispatched to Channel Router queue |
| `DELIVERY_ATTEMPTED` | `audit_events` | Channel Router Core attempted provider delivery (via adapter) |
| `DELIVERY_SENT` | `audit_events` | Provider accepted the message (reported by Channel Router Core via adapter SendResult) |
| `DELIVERY_FAILED` | `audit_events` | Provider rejected the message (reported by Channel Router Core via adapter SendResult) |
| `DELIVERY_RETRYING` | `audit_events` | Delivery scheduled for retry |
| `PROVIDER_ACCEPTED` | `audit_events` | Provider confirmed acceptance |
| `DELIVERED` | `delivery_receipts` | Provider confirmed delivery to recipient (via adapter webhook) |
| `BOUNCED` | `delivery_receipts` | Provider reported bounce (via adapter webhook) |
| `OPENED` | `delivery_receipts` | Provider reported email opened (via adapter webhook) |
| `CLICKED` | `delivery_receipts` | Provider reported link clicked (via adapter webhook) |
| `UNSUBSCRIBED` | `delivery_receipts` | Provider reported unsubscribe (via adapter webhook) |
| `SPAM_COMPLAINT` | `delivery_receipts` | Provider reported spam complaint (via adapter webhook) |

### Trace Merge Diagram

```
  audit_events                          delivery_receipts
  +---------------------------+         +---------------------------+
  | EVENT_INGESTED   10:15:30 |         | DELIVERED       10:16:05  |
  | RULE_MATCHED     10:15:30 |         |  (actor: adapter-mailgun)|
  | TEMPLATE_RENDERED 10:15:30|         | OPENED          10:20:15  |
  | DELIVERY_ATTEMPTED 10:15:30|        |  (actor: adapter-mailgun)|
  |  (actor: channel-router)  |         | CLICKED         10:20:22  |
  | DELIVERY_SENT    10:15:31 |         |  (actor: adapter-mailgun)|
  |  (actor: channel-router)  |         +---------------------------+
  +---------------------------+
              \                            /
               \                          /
                v                        v
         +----------------------------------+
         |     Merged Timeline (sorted)     |
         |                                  |
         | 10:15:30  EVENT_INGESTED         |
         | 10:15:30  RULE_MATCHED           |
         | 10:15:30  TEMPLATE_RENDERED      |
         | 10:15:30  DELIVERY_ATTEMPTED     |
         |            (channel-router-svc)  |
         | 10:15:31  DELIVERY_SENT          |
         |            (channel-router-svc)  |
         | 10:16:05  DELIVERED              |
         |            (adapter-mailgun)    |
         | 10:20:15  OPENED                 |
         |            (adapter-mailgun)    |
         | 10:20:22  CLICKED                |
         |            (adapter-mailgun)    |
         +----------------------------------+
```

*Figure 6.1 — Trace reconstruction merges audit_events and delivery_receipts into a single chronological timeline. Delivery-path events show channel-router-service as actor; webhook-originated events show the adapter service.*

### Cross-Notification Tracing

Beyond single-notification traces, the API supports querying by `correlation_id` or `cycle_id` to find related notifications:

- **`GET /audit/logs?correlationId=corr-abc-123`** — Returns all audit events sharing a correlation ID (e.g., all notifications from a single bulk upload batch).
- **`GET /audit/logs?cycleId=CYC-2026-00451`** — Returns all audit events within a business cycle (e.g., all notifications related to a specific order lifecycle).

> **Info:** **Cycle ID Cross-Referencing**
>
> The `cycle_id` field is particularly powerful for investigating notification chains. For example, an order lifecycle may generate events for `order.created`, `order.shipped`, and `order.delivered` — all sharing the same `cycle_id`. The audit trail can reconstruct the entire communication history for that business cycle.

---

## 7. Analytics Aggregation Engine

The Audit Service pre-aggregates notification metrics into the `notification_analytics` table to enable fast dashboard queries without scanning the full `audit_events` table.

### Pre-Aggregation Strategy

Rather than computing analytics on-the-fly from millions of audit events, the service runs periodic aggregation jobs that summarize key metrics into rollup rows. Dashboard queries then read directly from the pre-aggregated table.

### Dimensions

Each aggregation row is keyed by:

| Dimension | Values | Description |
|---|---|---|
| `period` | `hourly`, `daily` | Rollup granularity |
| `period_start` | ISO-8601 timestamp | Start of the aggregation window |
| `channel` | `email`, `sms`, `whatsapp`, `push`, `_all` | Delivery channel (`_all` for cross-channel totals) |
| `event_type` | e.g., `order.shipped` | Source event type (nullable — `NULL` for cross-type totals) |

### Metrics

| Metric | Type | Description |
|---|---|---|
| `total_sent` | `INTEGER` | Count of notifications dispatched |
| `total_delivered` | `INTEGER` | Count of confirmed deliveries |
| `total_failed` | `INTEGER` | Count of permanent failures |
| `total_opened` | `INTEGER` | Count of email opens |
| `total_clicked` | `INTEGER` | Count of link clicks |
| `total_bounced` | `INTEGER` | Count of bounces |
| `total_suppressed` | `INTEGER` | Count of suppressed notifications |
| `avg_latency_ms` | `NUMERIC(10,2)` | Average time from dispatch to delivery confirmation |

### Aggregation Schedule

| Job | Frequency | Window | Env Var |
|---|---|---|---|
| Hourly rollup | Every hour at :05 | Previous full hour | `ANALYTICS_HOURLY_CRON` |
| Daily rollup | Daily at 00:15 | Previous full day | `ANALYTICS_DAILY_CRON` |

> **Info:** **Staggered Scheduling**
>
> Aggregation jobs run 5–15 minutes after the period boundary to ensure that in-flight messages from the previous period have been consumed and persisted before aggregation begins.

### Idempotent Upsert

Aggregation uses an `INSERT ... ON CONFLICT` (upsert) strategy keyed on `(period, period_start, channel, event_type)`. Re-running an aggregation job for the same window overwrites with fresh data rather than creating duplicates. This ensures safe reprocessing after failures.

### Aggregation Pipeline Flowchart

```
  Cron trigger (hourly or daily)
           |
           v
  +------------------+
  | 1. Compute time  |
  |    window        |
  |    (start, end)  |
  +--------+---------+
           |
           v
  +------------------+
  | 2. Query         |
  |    audit_events  |
  |    + delivery_   |
  |    receipts for  |
  |    window        |
  +--------+---------+
           |
           v
  +------------------+
  | 3. Group by      |
  |    channel,      |
  |    event_type    |
  +--------+---------+
           |
           v
  +------------------+
  | 4. Compute       |
  |    metrics       |
  |    (counts, avg  |
  |    latency)      |
  +--------+---------+
           |
           v
  +------------------+
  | 5. Upsert into   |
  |    notification_ |
  |    analytics     |
  |    (ON CONFLICT  |
  |     DO UPDATE)   |
  +--------+---------+
           |
           v
  +------------------+
  | 6. Log           |
  |    aggregation   |
  |    summary       |
  +------------------+
```

*Figure 7.1 — Analytics aggregation pipeline with idempotent upsert.*

### Dashboard Query Patterns

Common queries served by the pre-aggregated data:

| Dashboard Widget | Query Pattern |
|---|---|
| Daily delivery rate | `WHERE period = 'daily' AND channel = '_all' ORDER BY period_start DESC LIMIT 30` |
| Hourly volume (last 24h) | `WHERE period = 'hourly' AND period_start >= NOW() - INTERVAL '24 hours'` |
| Channel breakdown | `WHERE period = 'daily' AND period_start = :date AND channel != '_all'` |
| Failure rate by channel | `SELECT channel, SUM(total_failed)::FLOAT / NULLIF(SUM(total_sent), 0) ...` |
| Top event types by volume | `WHERE period = 'daily' AND event_type IS NOT NULL GROUP BY event_type ORDER BY SUM(total_sent) DESC LIMIT 10` |

---

## 8. Full-Text Search

The Audit Service provides full-text search across notification audit events using PostgreSQL's built-in `tsvector`/`tsquery` capabilities.

### Search Implementation

A generated `tsvector` column (`search_vector`) on the `audit_events` table is maintained via a trigger. The vector includes:

| Weight | Fields | Rationale |
|---|---|---|
| **A** (highest) | `notification_id`, `correlation_id`, `cycle_id` | Primary lookup identifiers |
| **B** | `event_type`, `actor` | Classification fields |
| **C** | `metadata` (JSONB text content) | Context and details |
| **D** (lowest) | `payload_snapshot` (JSONB text content) | Full payload content |

### GIN Index

```sql
CREATE INDEX idx_audit_events_search
ON audit_service.audit_events
USING GIN (search_vector);
```

### Search API

**`GET /audit/search?q=:query`**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `q` | `string` | _(required)_ | Full-text search query (supports `&`, `|`, `!`, phrase matching) |
| `page` | `integer` | `1` | Page number |
| `pageSize` | `integer` | `50` | Results per page (max 200) |
| `from` | `ISO-8601` | _(optional)_ | Start of time range filter |
| `to` | `ISO-8601` | _(optional)_ | End of time range filter |

**Example — Compound Search:**

```
GET /audit/search?q=order.shipped & mailgun & bounced&from=2026-02-01&to=2026-02-21
```

Returns all audit events mentioning "order.shipped" AND "mailgun" AND "bounced" within the date range.

---

## 9. Dead-Letter Queue Monitoring

The Audit Service consumes from the `audit.dlq` queue — a shadow copy of all messages that enter the dead-letter exchange `xch.notifications.dlq`. This provides visibility into permanently failed messages across the entire platform.

### DLQ Message Processing

When a message arrives on `audit.dlq`, the DLQ Consumer:

1. **Extracts `x-death` headers** — contains the original queue, exchange, routing key, rejection reason, and retry count.
2. **Extracts message payload** — the original message body.
3. **Persists to `dlq_entries`** — immutable record with full context for investigation.
4. **Increments metrics** — `audit_dlq_entries_total` counter by original queue.

### DLQ Entry Structure

```json
{
  "id": "dlq-e29b-41d4-a716-446655440000",
  "originalQueue": "q.deliver.email.normal",
  "originalExchange": "xch.notifications.deliver",
  "originalRoutingKey": "notification.deliver.normal.email",
  "rejectionReason": "max retries exhausted",
  "retryCount": 5,
  "payload": { "notificationId": "notif-789", "channel": "email", "provider": "mailgun" },
  "xDeathHeaders": [ { "count": 5, "queue": "q.deliver.email.normal", "reason": "rejected" } ],
  "status": "pending",
  "capturedAt": "2026-02-20T10:30:00.000Z",
  "resolvedAt": null,
  "resolvedBy": null
}
```

### DLQ Monitoring Flowchart

```
  xch.notifications.dlq (fanout)
           |
     +-----+-----+
     |           |
     v           v
  q.dlq       audit.dlq
  (manual)    (audit)
                |
                v
     +-------------------+
     | DLQ Consumer      |
     |                   |
     | 1. Parse x-death  |
     | 2. Extract payload|
     | 3. Persist to     |
     |    dlq_entries    |
     | 4. Update metrics |
     +--------+----------+
              |
              v
     +-------------------+
     | dlq_entries table  |
     |                   |
     | status: pending   |
     | -> investigated   |
     | -> reprocessed    |
     | -> discarded      |
     +-------------------+
```

*Figure 9.1 — DLQ monitoring pipeline from fanout exchange to persisted entry with status tracking.*

### DLQ Entry Statuses

| Status | Description |
|---|---|
| `pending` | Newly captured, awaiting investigation |
| `investigated` | Reviewed by operator, root cause identified |
| `reprocessed` | Message manually resubmitted to the original queue |
| `discarded` | Message reviewed and intentionally discarded |

> **Info:** **DLQ Reprocessing**
>
> The `POST /audit/dlq/:id/reprocess` endpoint allows operators to resubmit a DLQ entry to its original exchange with the original routing key. This is a manual recovery mechanism — the reprocessed message re-enters the normal pipeline and may succeed if the root cause has been resolved. Reprocessing updates the DLQ entry status to `reprocessed` and records the operator who initiated it.

---

## 10. RabbitMQ Topology

The Audit Service is a **consume-only** participant in the RabbitMQ topology. It subscribes to 5 queues across 4 exchanges and publishes no outbound messages.

### Consumed Queues

| Queue | Exchange | Routing Key | DLX | Consumers | Prefetch | Purpose |
|---|---|---|---|---|---|---|
| `audit.events` | `xch.events.normalized` | `event.#` | — | 2 | 20 | Event ingestion/normalization audit trail |
| `audit.deliver` | `xch.notifications.deliver` | `notification.deliver.#` | — | 2 | 20 | Delivery dispatch audit trail |
| `q.status.updates` | `xch.notifications.status` | `notification.status.#`, `adapter.webhook.#` | `xch.notifications.dlq` | 3 | 15 | Delivery status updates from Channel Router Core (`notification.status.#`) and webhook events from adapter services (`adapter.webhook.{providerId}`) |
| `q.audit.template` | `xch.notifications.status` | `template.#` | — | 1 | 10 | Template lifecycle events (low volume) |
| `audit.dlq` | `xch.notifications.dlq` | _(fanout)_ | — | 1 | 5 | Dead-lettered messages |
| | | | | **Total: 9** | | |

### Consumer Allocation Rationale

- **`q.status.updates` (3 consumers):** Highest volume queue — receives all notification status transitions and delivery-path events from Channel Router Core, plus webhook-originated events from provider adapter services. Priority allocation prevents backlog.
- **`audit.events` and `audit.deliver` (2 each):** Moderate volume — one message per normalized event and one per delivery dispatch.
- **`q.audit.template` (1 consumer):** Low volume — template CRUD and render events are infrequent relative to notification volume.
- **`audit.dlq` (1 consumer):** Low volume by design — only receives permanently failed messages.

### No Outbound Publishing

The Audit Service does not publish to any RabbitMQ exchange. All data leaves the service via its REST API only.

> **Info:** **Fire-and-Forget Queues**
>
> Three of the five consumed queues (`audit.events`, `audit.deliver`, `q.audit.template`) do not have DLX configured — they are fire-and-forget. If the Audit Service fails to process a message from these queues after retries, the message is discarded. This is an intentional design choice: the audit trail is valuable but not worth creating infinite retry loops. Only `q.status.updates` (which carries delivery status critical for receipts) has DLQ enabled.

### Audit Service Topology Diagram

```
+-----------------------------------------------------------------------+
|                        RabbitMQ (vhnotificationapi)                   |
|                                                                       |
|  xch.events.normalized (topic)                                       |
|    |-- event.# -----------------> [ audit.events ] (2 consumers)     |
|                                                                       |
|  xch.notifications.deliver (topic)                                   |
|    |-- notification.deliver.# --> [ audit.deliver ] (2 consumers)    |
|                                                                       |
|  xch.notifications.status (topic)                                    |
|    |-- notification.status.# ---> [ q.status.updates ] (3 consumers) |
|    |-- adapter.webhook.# -------> [ q.status.updates ] (3 consumers) |
|    |-- template.# --------------> [ q.audit.template ] (1 consumer)  |
|                                                                       |
|  xch.notifications.dlq (fanout)                                      |
|    |-- (all) -------------------> [ audit.dlq ] (1 consumer)         |
+-----------------------------------------------------------------------+
           |           |           |           |           |
           v           v           v           v           v
    +--------------------------------------------------------------+
    |                    Audit Service :3156                        |
    |                    9 total consumers                         |
    +--------------------------------------------------------------+
```

*Figure 10.1 — Audit Service RabbitMQ topology showing 5 queues, 4 exchanges, and 9 consumers. The `q.status.updates` queue receives both delivery-path events (from Channel Router Core) and webhook events (from adapter services).*

---

## 11. REST API Endpoints

All endpoints are exposed through the Notification Gateway at `/api/v1/audit/*` and proxied to the Audit Service on port 3156.

### 11.1 Trace Endpoints

#### `GET /audit/trace/:notificationId`

Returns the complete end-to-end notification lifecycle timeline. See [Section 6](#6-end-to-end-notification-trace) for full specification and response examples.

#### `GET /audit/trace/correlation/:correlationId`

Returns merged timelines for all notifications sharing a correlation ID.

**Response — `200 OK`:**

```json
{
  "correlationId": "corr-abc-123",
  "notificationCount": 3,
  "notifications": [
    {
      "notificationId": "notif-456",
      "eventType": "order.shipped",
      "channel": "email",
      "finalStatus": "DELIVERED",
      "timeline": [ "..." ]
    },
    {
      "notificationId": "notif-457",
      "eventType": "order.shipped",
      "channel": "sms",
      "finalStatus": "DELIVERED",
      "timeline": [ "..." ]
    }
  ]
}
```

#### `GET /audit/trace/cycle/:cycleId`

Returns merged timelines for all notifications within a business cycle.

**Response — `200 OK`:**

```json
{
  "cycleId": "CYC-2026-00451",
  "notificationCount": 5,
  "notifications": [
    {
      "notificationId": "notif-400",
      "eventType": "order.created",
      "channel": "email",
      "finalStatus": "DELIVERED",
      "timeline": [ "..." ]
    }
  ]
}
```

### 11.2 Log Endpoints

#### `GET /audit/logs`

Returns paginated audit event log entries with filtering and full-text search.

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `notificationId` | `string` | _(optional)_ | Filter by notification ID |
| `correlationId` | `string` | _(optional)_ | Filter by correlation ID |
| `cycleId` | `string` | _(optional)_ | Filter by cycle ID |
| `eventType` | `string` | _(optional)_ | Filter by event type taxonomy |
| `actor` | `string` | _(optional)_ | Filter by actor service |
| `from` | `ISO-8601` | _(optional)_ | Start of time range |
| `to` | `ISO-8601` | _(optional)_ | End of time range |
| `q` | `string` | _(optional)_ | Full-text search query |
| `page` | `integer` | `1` | Page number |
| `pageSize` | `integer` | `50` | Results per page (max 200) |

**Response — `200 OK`:**

```json
{
  "data": [
    {
      "id": "ae-550e8400-e29b-41d4-a716-446655440000",
      "notificationId": "notif-456",
      "correlationId": "corr-abc-123",
      "cycleId": "CYC-2026-00451",
      "eventType": "DELIVERY_ATTEMPTED",
      "actor": "channel-router-service",
      "metadata": { "channel": "email", "provider": "mailgun", "attempt": 1 },
      "createdAt": "2026-02-20T10:15:30.500Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 50,
    "totalCount": 1247,
    "totalPages": 25
  }
}
```

#### `GET /audit/search`

Full-text search endpoint. See [Section 8](#8-full-text-search) for full specification.

### 11.3 Receipt Endpoints

#### `GET /audit/receipts/:notificationId`

Returns all delivery receipts for a notification.

**Response — `200 OK`:**

```json
{
  "notificationId": "notif-456",
  "receipts": [
    {
      "id": "dr-001",
      "channel": "email",
      "provider": "mailgun",
      "status": "DELIVERED",
      "providerMessageId": "<20230101.abc123@domain.com>",
      "rawResponse": { "event": "delivered", "timestamp": 1708423565 },
      "receivedAt": "2026-02-20T10:16:05.000Z"
    },
    {
      "id": "dr-002",
      "channel": "email",
      "provider": "mailgun",
      "status": "OPENED",
      "providerMessageId": "<20230101.abc123@domain.com>",
      "rawResponse": { "event": "open", "timestamp": 1708423815 },
      "receivedAt": "2026-02-20T10:20:15.000Z"
    }
  ]
}
```

### 11.4 Analytics Endpoints

#### `GET /audit/analytics`

Returns pre-aggregated analytics data.

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `period` | `string` | `daily` | Aggregation period (`hourly` or `daily`) |
| `from` | `ISO-8601` | _(required)_ | Start of date range |
| `to` | `ISO-8601` | _(required)_ | End of date range |
| `channel` | `string` | _(optional)_ | Filter by channel |
| `eventType` | `string` | _(optional)_ | Filter by source event type |

**Response — `200 OK`:**

```json
{
  "data": [
    {
      "period": "daily",
      "periodStart": "2026-02-20T00:00:00.000Z",
      "channel": "_all",
      "totalSent": 4521,
      "totalDelivered": 4389,
      "totalFailed": 87,
      "totalOpened": 1845,
      "totalClicked": 312,
      "totalBounced": 45,
      "totalSuppressed": 120,
      "avgLatencyMs": 1250.50
    }
  ],
  "meta": {
    "period": "daily",
    "from": "2026-02-20T00:00:00.000Z",
    "to": "2026-02-21T00:00:00.000Z",
    "totalRecords": 1
  }
}
```

#### `GET /audit/analytics/summary`

Returns a high-level summary for dashboard consumption.

**Response — `200 OK`:**

```json
{
  "today": {
    "totalSent": 2150,
    "totalDelivered": 2080,
    "deliveryRate": 0.967,
    "totalFailed": 42,
    "failureRate": 0.020
  },
  "last7Days": {
    "totalSent": 15420,
    "totalDelivered": 14950,
    "deliveryRate": 0.970,
    "avgLatencyMs": 1180.25
  },
  "channelBreakdown": [
    { "channel": "email", "sent": 1200, "delivered": 1165, "rate": 0.971 },
    { "channel": "sms", "sent": 650, "delivered": 635, "rate": 0.977 },
    { "channel": "whatsapp", "sent": 200, "delivered": 188, "rate": 0.940 },
    { "channel": "push", "sent": 100, "delivered": 92, "rate": 0.920 }
  ]
}
```

### 11.5 DLQ Endpoints

#### `GET /audit/dlq`

Returns paginated DLQ entries with filtering.

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `status` | `string` | _(optional)_ | Filter by status (`pending`, `investigated`, `reprocessed`, `discarded`) |
| `originalQueue` | `string` | _(optional)_ | Filter by original queue name |
| `from` | `ISO-8601` | _(optional)_ | Start of time range |
| `to` | `ISO-8601` | _(optional)_ | End of time range |
| `page` | `integer` | `1` | Page number |
| `pageSize` | `integer` | `50` | Results per page (max 200) |

**Response — `200 OK`:**

```json
{
  "data": [
    {
      "id": "dlq-e29b-41d4",
      "originalQueue": "q.deliver.email.normal",
      "originalExchange": "xch.notifications.deliver",
      "originalRoutingKey": "notification.deliver.normal.email",
      "rejectionReason": "max retries exhausted",
      "retryCount": 5,
      "status": "pending",
      "capturedAt": "2026-02-20T10:30:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 50,
    "totalCount": 12,
    "totalPages": 1,
    "statusCounts": {
      "pending": 8,
      "investigated": 2,
      "reprocessed": 1,
      "discarded": 1
    }
  }
}
```

#### `PATCH /audit/dlq/:id`

Updates a DLQ entry status (for investigation tracking).

**Request Body:**

```json
{
  "status": "investigated",
  "notes": "Root cause: Mailgun API key expired. Rotated key, ready for reprocessing."
}
```

#### `POST /audit/dlq/:id/reprocess`

Resubmits a DLQ entry to its original exchange/routing key for reprocessing.

**Response — `200 OK`:**

```json
{
  "id": "dlq-e29b-41d4",
  "status": "reprocessed",
  "reprocessedAt": "2026-02-20T11:00:00.000Z",
  "reprocessedBy": "admin@company.com",
  "originalQueue": "q.deliver.email.normal",
  "originalRoutingKey": "notification.deliver.normal.email"
}
```

### 11.6 Health Endpoints

#### `GET /health`

Basic liveness check.

**Response — `200 OK`:**

```json
{
  "status": "ok",
  "service": "audit-service",
  "timestamp": "2026-02-20T10:15:30.000Z"
}
```

#### `GET /health/ready`

Readiness check verifying database and RabbitMQ connectivity.

**Response — `200 OK`:**

```json
{
  "status": "ready",
  "checks": {
    "database": { "status": "up", "responseTime": 5 },
    "rabbitmq": { "status": "up", "consumers": 9 },
    "dlqDepth": { "status": "ok", "pending": 8 }
  }
}
```

---

## 12. Database Design

All tables are created in the `audit_service` PostgreSQL schema.

### Entity Relationship Diagram

```
+----------------------------------+
|          audit_events            |
+----------------------------------+
| PK  id (UUID)                    |
|     notification_id (VARCHAR)    |   1:N  +----------------------------------+
|     correlation_id (VARCHAR)     |------->|       delivery_receipts          |
|     cycle_id (VARCHAR)           |        +----------------------------------+
|     event_type (VARCHAR)         |        | PK  id (UUID)                    |
|     actor (VARCHAR)              |        |     notification_id (VARCHAR)    |
|     metadata (JSONB)             |        |     correlation_id (VARCHAR)     |
|     payload_snapshot (JSONB)     |        |     cycle_id (VARCHAR)           |
|     search_vector (TSVECTOR)     |        |     channel (VARCHAR)            |
|     created_at (TIMESTAMPTZ)     |        |     provider (VARCHAR)           |
+----------------------------------+        |     status (VARCHAR)             |
                                            |     provider_message_id (VARCHAR)|
+----------------------------------+        |     raw_response (JSONB)         |
|     notification_analytics       |        |     received_at (TIMESTAMPTZ)    |
+----------------------------------+        +----------------------------------+
| PK  id (UUID)                    |
|     period (VARCHAR)             |
|     period_start (TIMESTAMPTZ)   |  +----------------------------------+
|     channel (VARCHAR)            |  |          dlq_entries             |
|     event_type (VARCHAR)         |  +----------------------------------+
|     total_sent (INTEGER)         |  | PK  id (UUID)                    |
|     total_delivered (INTEGER)    |  |     original_queue (VARCHAR)     |
|     total_failed (INTEGER)       |  |     original_exchange (VARCHAR)  |
|     total_opened (INTEGER)       |  |     original_routing_key (VARCHAR)|
|     total_clicked (INTEGER)      |  |     rejection_reason (VARCHAR)   |
|     total_bounced (INTEGER)      |  |     retry_count (INTEGER)        |
|     total_suppressed (INTEGER)   |  |     payload (JSONB)              |
|     avg_latency_ms (NUMERIC)     |  |     x_death_headers (JSONB)      |
|     created_at (TIMESTAMPTZ)     |  |     status (VARCHAR)             |
|     updated_at (TIMESTAMPTZ)     |  |     notes (TEXT)                 |
+----------------------------------+  |     captured_at (TIMESTAMPTZ)    |
                                      |     resolved_at (TIMESTAMPTZ)    |
                                      |     resolved_by (VARCHAR)        |
                                      +----------------------------------+
```

*Figure 12.1 — Audit Service entity relationship diagram showing 4 tables.*

### Table: `audit_events`

Immutable event log for all notification lifecycle transitions.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | NO | `gen_random_uuid()` | Primary key |
| `notification_id` | `VARCHAR(255)` | YES | — | Notification ID (NULL for non-notification events like template CRUD) |
| `correlation_id` | `VARCHAR(255)` | YES | — | Request/batch correlation identifier |
| `cycle_id` | `VARCHAR(255)` | YES | — | Business cycle identifier |
| `event_type` | `VARCHAR(100)` | NO | — | Event type from taxonomy (e.g., `DELIVERY_ATTEMPTED`) |
| `actor` | `VARCHAR(100)` | NO | — | Service that produced the event (e.g., `channel-router-service`, `adapter-mailgun`) |
| `metadata` | `JSONB` | YES | `'{}'` | Structured context (channel, provider, attempt, etc.) |
| `payload_snapshot` | `JSONB` | YES | — | Point-in-time payload snapshot (NULLed after retention period) |
| `search_vector` | `TSVECTOR` | YES | — | Generated full-text search vector |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | Event timestamp |

### Table: `delivery_receipts`

Provider-reported delivery outcomes correlated to notifications.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | NO | `gen_random_uuid()` | Primary key |
| `notification_id` | `VARCHAR(255)` | YES | — | Notification ID (NULL for orphaned receipts) |
| `correlation_id` | `VARCHAR(255)` | YES | — | Request/batch correlation identifier |
| `cycle_id` | `VARCHAR(255)` | YES | — | Business cycle identifier |
| `channel` | `VARCHAR(20)` | NO | — | Delivery channel (`email`, `sms`, `whatsapp`, `push`) |
| `provider` | `VARCHAR(50)` | NO | — | Provider name (`mailgun`, `braze`, `whatsapp-meta`, `aws-ses`) |
| `status` | `VARCHAR(30)` | NO | — | Normalized status (`DELIVERED`, `BOUNCED`, `OPENED`, etc.) |
| `provider_message_id` | `VARCHAR(255)` | YES | — | Provider's tracking ID for webhook correlation |
| `raw_response` | `JSONB` | YES | — | Raw provider webhook payload (NULLed after retention period) |
| `received_at` | `TIMESTAMPTZ` | NO | `NOW()` | Timestamp when receipt was recorded |

### Table: `notification_analytics`

Pre-aggregated analytics data for dashboard consumption.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | NO | `gen_random_uuid()` | Primary key |
| `period` | `VARCHAR(10)` | NO | — | Aggregation period (`hourly`, `daily`) |
| `period_start` | `TIMESTAMPTZ` | NO | — | Start of the aggregation window |
| `channel` | `VARCHAR(20)` | NO | — | Channel (`email`, `sms`, `whatsapp`, `push`, `_all`) |
| `event_type` | `VARCHAR(255)` | YES | — | Source event type (NULL for cross-type totals) |
| `total_sent` | `INTEGER` | NO | `0` | Notifications dispatched |
| `total_delivered` | `INTEGER` | NO | `0` | Confirmed deliveries |
| `total_failed` | `INTEGER` | NO | `0` | Permanent failures |
| `total_opened` | `INTEGER` | NO | `0` | Email opens |
| `total_clicked` | `INTEGER` | NO | `0` | Link clicks |
| `total_bounced` | `INTEGER` | NO | `0` | Bounces |
| `total_suppressed` | `INTEGER` | NO | `0` | Suppressed notifications |
| `avg_latency_ms` | `NUMERIC(10,2)` | YES | — | Average dispatch-to-delivery latency |
| `created_at` | `TIMESTAMPTZ` | NO | `NOW()` | Row creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NO | `NOW()` | Last upsert timestamp |

### Table: `dlq_entries`

Dead-letter queue entries for investigation and reprocessing.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | NO | `gen_random_uuid()` | Primary key |
| `original_queue` | `VARCHAR(255)` | NO | — | Queue the message was originally consumed from |
| `original_exchange` | `VARCHAR(255)` | NO | — | Exchange the message was originally published to |
| `original_routing_key` | `VARCHAR(255)` | YES | — | Original routing key (NULL for fanout) |
| `rejection_reason` | `VARCHAR(500)` | YES | — | Why the message was dead-lettered |
| `retry_count` | `INTEGER` | NO | `0` | Number of retry attempts before DLQ |
| `payload` | `JSONB` | NO | — | Original message body |
| `x_death_headers` | `JSONB` | YES | — | RabbitMQ `x-death` header array |
| `status` | `VARCHAR(20)` | NO | `'pending'` | Entry status (`pending`, `investigated`, `reprocessed`, `discarded`) |
| `notes` | `TEXT` | YES | — | Operator investigation notes |
| `captured_at` | `TIMESTAMPTZ` | NO | `NOW()` | When the DLQ entry was captured |
| `resolved_at` | `TIMESTAMPTZ` | YES | — | When the entry was resolved |
| `resolved_by` | `VARCHAR(255)` | YES | — | Operator who resolved the entry |

### Indexes

| Table | Index Name | Columns | Type | Purpose |
|---|---|---|---|---|
| `audit_events` | `idx_audit_events_notification_id` | `notification_id` | B-tree | Trace by notification |
| `audit_events` | `idx_audit_events_correlation_id` | `correlation_id` | B-tree | Cross-notification tracing |
| `audit_events` | `idx_audit_events_cycle_id` | `cycle_id` | B-tree | Business cycle tracing |
| `audit_events` | `idx_audit_events_event_type` | `event_type` | B-tree | Filter by event type |
| `audit_events` | `idx_audit_events_created_at` | `created_at` | B-tree | Time range queries |
| `audit_events` | `idx_audit_events_actor` | `actor` | B-tree | Filter by actor service |
| `audit_events` | `idx_audit_events_search` | `search_vector` | GIN | Full-text search |
| `delivery_receipts` | `idx_delivery_receipts_notification_id` | `notification_id` | B-tree | Receipt lookup by notification |
| `delivery_receipts` | `idx_delivery_receipts_provider_msg_id` | `provider_message_id` | B-tree | Webhook correlation |
| `delivery_receipts` | `idx_delivery_receipts_received_at` | `received_at` | B-tree | Time range queries |
| `delivery_receipts` | `idx_delivery_receipts_status` | `status` | B-tree | Filter by delivery status |
| `notification_analytics` | `idx_analytics_period_start` | `period, period_start, channel` | B-tree (unique) | Upsert key / dashboard queries |
| `notification_analytics` | `idx_analytics_event_type` | `period, period_start, event_type` | B-tree | Event type aggregation queries |
| `dlq_entries` | `idx_dlq_entries_status` | `status` | B-tree | Filter by DLQ status |

### Growth Estimates

| Table | Estimated Row Size | Daily Growth (5K events/day) | Monthly Growth | 1-Year Projection |
|---|---|---|---|---|
| `audit_events` | ~1 KB | ~30K rows (~30 MB) | ~900 MB | ~10.8 GB |
| `delivery_receipts` | ~500 B | ~15K rows (~7.5 MB) | ~225 MB | ~2.7 GB |
| `notification_analytics` | ~200 B | ~200 rows (~40 KB) | ~1.2 MB | ~14.4 MB |
| `dlq_entries` | ~2 KB | ~10 rows (~20 KB) | ~600 KB | ~7.2 MB |
| **Total** | | ~37.5 MB/day | ~1.1 GB/month | ~13.5 GB |

> **Warning:** **Payload Purge Impact on Growth**
>
> The growth estimates above assume full payloads. After the 90-day payload retention window, `payload_snapshot` (audit_events) and `raw_response` (delivery_receipts) are NULLed, reclaiming approximately 40-60% of storage. Effective long-term storage is ~60% of the projections above.

---

## 13. Data Retention & Purge Strategy

The Audit Service implements a two-tier retention strategy: payload data is purged after a shorter window while metadata is retained for the full compliance period.

### Retention Tiers

| Tier | Data | Default Retention | Rationale |
|---|---|---|---|
| **Payload** | `audit_events.payload_snapshot`, `delivery_receipts.raw_response` | 90 days | Full payload needed for debugging recent issues; older payloads are storage-heavy and rarely accessed |
| **Metadata** | All other columns in `audit_events` and `delivery_receipts` | 2 years | Required for compliance (GDPR, CAN-SPAM); enables historical trend analysis and lifecycle tracing |

### `purge_audit_payloads()` PL/pgSQL Function

```sql
CREATE OR REPLACE FUNCTION audit_service.purge_audit_payloads(
    p_older_than_days INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_cutoff TIMESTAMPTZ;
    v_audit_count INTEGER;
    v_receipt_count INTEGER;
BEGIN
    v_cutoff := NOW() - (p_older_than_days || ' days')::INTERVAL;

    -- NULL out payload snapshots in audit_events
    UPDATE audit_service.audit_events
    SET payload_snapshot = NULL
    WHERE created_at < v_cutoff
      AND payload_snapshot IS NOT NULL;
    GET DIAGNOSTICS v_audit_count = ROW_COUNT;

    -- NULL out raw responses in delivery_receipts
    UPDATE audit_service.delivery_receipts
    SET raw_response = NULL
    WHERE received_at < v_cutoff
      AND raw_response IS NOT NULL;
    GET DIAGNOSTICS v_receipt_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'cutoffDate', v_cutoff,
        'auditEventsPurged', v_audit_count,
        'deliveryReceiptsPurged', v_receipt_count
    );
END;
$$;
```

**Scheduling:** Call via `pg_cron` or application scheduler (e.g., daily at 03:00):

```sql
SELECT cron.schedule('purge-audit-payloads', '0 3 * * *',
    $$SELECT audit_service.purge_audit_payloads(90)$$
);
```

### DLQ Entry Retention

DLQ entries in terminal states (`reprocessed`, `discarded`) are hard-deleted after 90 days. Entries in `pending` or `investigated` status are never auto-deleted.

### Partitioning Recommendation

For deployments exceeding 50 GB in `audit_events`, range partitioning by `created_at` (monthly partitions) is recommended. Benefits:

- **Partition pruning:** Time-range queries scan only relevant partitions.
- **Efficient drops:** Dropping old partitions is `O(1)` vs. row-by-row deletion.
- **Parallel vacuum:** Each partition is vacuumed independently.

### Data Lifecycle Timeline

```
  Day 0                    Day 90                    Day 730 (2 years)
    |                        |                           |
    v                        v                           v
  +---------------------------------------------------------------+
  | audit_events & delivery_receipts                              |
  |                                                               |
  |  [  Full data (payload + metadata)  ]  [ Metadata only ]      |
  |  <--- 90 days (payload retained) --->  <--- Payload NULLed -->|
  |                                                               |
  |  [ Available for trace, search, analytics, compliance ]       |
  +---------------------------------------------------------------+
                                                        |
                                                        v
                                               Records eligible
                                               for archival or
                                               deletion per
                                               compliance policy

  +---------------------------------------------------------------+
  | dlq_entries                                                   |
  |                                                               |
  |  [ pending / investigated: retained indefinitely ]            |
  |  [ reprocessed / discarded: deleted after 90 days ]           |
  +---------------------------------------------------------------+
```

*Figure 13.1 — Data lifecycle showing two-tier retention for audit data and DLQ entry cleanup.*

> **Info:** **Compliance Override**
>
> The 2-year metadata retention period is a default aligned with common regulatory requirements. Organizations subject to stricter regulations may increase this via the `RETENTION_METADATA_DAYS` environment variable (max 3650 days / 10 years).

---

## 14. Sequence Diagrams

### 14.1 Full Lifecycle Audit Accumulation

Shows how audit events accumulate as a notification progresses through the pipeline.

```
  Event Ingestion      Notification Engine    Channel Router Core     Adapter Service       Audit Service
       |                      |                     |                     |                     |
       | publish event.normal.order.shipped          |                     |                     |
       |--- xch.events.normalized ---------------------------------------------------------->|
       |                      |                     |                     |                     | persist
       |                      |                     |                     |                     | EVENT_INGESTED
       |                      |                     |                     |                     |
       |                      | publish notification.status.processing    |                     |
       |                      |--- xch.notifications.status ---------------------------------------->|
       |                      |                     |                     |                     | persist
       |                      |                     |                     |                     | RULE_MATCHED
       |                      |                     |                     |                     |
       |                      | publish notification.status.rendering     |                     |
       |                      |--- xch.notifications.status ---------------------------------------->|
       |                      |                     |                     |                     | persist
       |                      |                     |                     |                     | TEMPLATE_RENDERED
       |                      |                     |                     |                     |
       |                      | publish notification.deliver.normal.email |                     |
       |                      |--- xch.notifications.deliver ---------------------------------------->|
       |                      |                     |                     |                     | persist
       |                      |                     |                     |                     | DELIVERY_DISPATCHED
       |                      |                     |                     |                     |
       |                      |                     | POST /send          |                     |
       |                      |                     |-------------------->|                     |
       |                      |                     |   SendResult        |                     |
       |                      |                     |<--------------------|                     |
       |                      |                     |                     |                     |
       |                      |                     | publish notification.status.sent          |
       |                      |                     |--- xch.notifications.status ------------->|
       |                      |                     |                     |                     | persist
       |                      |                     |                     |                     | DELIVERY_SENT
       |                      |                     |                     |                     |
       |                      |                     |                     | (provider webhook)  |
       |                      |                     |                     | publish adapter.webhook.mailgun
       |                      |                     |                     |--- xch.notifications.status -->|
       |                      |                     |                     |                     | persist
       |                      |                     |                     |                     | DELIVERED
       |                      |                     |                     |                     | (delivery_receipts)
```

*Figure 14.1 — Full lifecycle audit accumulation from ingestion to delivery confirmation. Note: delivery-path events (DELIVERY_SENT) originate from Channel Router Core; webhook-originated events (DELIVERED) originate from the adapter service.*

### 14.2 Delivery Receipt Correlation

Shows how a provider webhook is correlated back to the notification via the decoupled adapter architecture.

```
  External Provider     Gateway              Adapter Service       RabbitMQ              Audit Service
       |                    |                     |                     |                     |
       | POST /webhooks/mailgun                   |                     |                     |
       |------------------->|                     |                     |                     |
       |                    | Route to adapter    |                     |                     |
       |                    |-------------------->|                     |                     |
       |                    |                     |                     |                     |
       |                    |                     | Verify signature    |                     |
       |                    |                     | Normalize event     |                     |
       |                    |                     |                     |                     |
       |                    |                     | publish adapter.webhook.mailgun           |
       |                    |                     | { notificationId: "notif-456",            |
       |                    |                     |   providerMessageId: "<20230101.abc123>", |
       |                    |                     |   status: "delivered" }                   |
       |                    |                     |--- xch.notifications.status ------------->|
       |                    |                     |                     |                     |
       |                    |                     |                     |                     | Extract notification_id,
       |                    |                     |                     |                     | provider_message_id,
       |                    |                     |                     |                     | channel, status
       |                    |                     |                     |                     |
       |                    |                     |                     |                     | INSERT INTO
       |                    |                     |                     |                     | delivery_receipts
       |                    |                     |                     |                     |
       |                    |                     |                     |                     | INSERT INTO
       |                    |                     |                     |                     | audit_events
       |                    |                     |                     |                     | (DELIVERED,
       |                    |                     |                     |                     |  actor: adapter-mailgun)
       |                    |                     |                     |                     |
       |  200 OK            |                     |                     |                     |
       |<-------------------|                     |                     |                     |
```

*Figure 14.2 — Delivery receipt correlation via decoupled adapter architecture: provider webhook flows through Gateway to adapter, which verifies, normalizes, and publishes to xch.notifications.status for Audit Service consumption.*

### 14.3 Analytics Aggregation Job

Shows the scheduled aggregation job that populates the analytics table.

```
  Scheduler (pg_cron)          Audit Service              PostgreSQL
       |                            |                          |
       | trigger hourly job         |                          |
       |--------------------------->|                          |
       |                            |                          |
       |                            | Compute time window      |
       |                            | (previous full hour)     |
       |                            |                          |
       |                            | SELECT ... FROM          |
       |                            | audit_events WHERE       |
       |                            | created_at BETWEEN       |
       |                            | start AND end            |
       |                            |------------------------->|
       |                            |        result set        |
       |                            |<-------------------------|
       |                            |                          |
       |                            | SELECT ... FROM          |
       |                            | delivery_receipts WHERE  |
       |                            | received_at BETWEEN      |
       |                            | start AND end            |
       |                            |------------------------->|
       |                            |        result set        |
       |                            |<-------------------------|
       |                            |                          |
       |                            | Compute aggregates       |
       |                            | (group by channel,       |
       |                            |  event_type)             |
       |                            |                          |
       |                            | INSERT INTO              |
       |                            | notification_analytics   |
       |                            | ON CONFLICT DO UPDATE    |
       |                            |------------------------->|
       |                            |         OK               |
       |                            |<-------------------------|
       |                            |                          |
       |       job complete         |                          |
       |<---------------------------|                          |
```

*Figure 14.3 — Analytics aggregation job with idempotent upsert.*

### 14.4 DLQ Capture and Reprocessing

Shows a message flowing to the DLQ and being manually reprocessed by an operator.

```
  Channel Router        RabbitMQ (DLQ)            Audit Service          Operator
       |                      |                         |                    |
       | Message fails after  |                         |                    |
       | max retries          |                         |                    |
       |                      |                         |                    |
       | NACK (no requeue)    |                         |                    |
       |--------------------->|                         |                    |
       |                      | Route to                |                    |
       |                      | xch.notifications.dlq   |                    |
       |                      |                         |                    |
       |                      | Fanout to audit.dlq     |                    |
       |                      |------------------------>|                    |
       |                      |                         |                    |
       |                      |                         | Parse x-death      |
       |                      |                         | Extract payload    |
       |                      |                         | INSERT INTO        |
       |                      |                         | dlq_entries        |
       |                      |                         | (status: pending)  |
       |                      |                         |                    |
       |                      |                         |                    | GET /audit/dlq
       |                      |                         |<-------------------|
       |                      |                         | Return pending     |
       |                      |                         | entries            |
       |                      |                         |------------------->|
       |                      |                         |                    |
       |                      |                         |                    | Investigate root cause
       |                      |                         |                    | (e.g., API key expired)
       |                      |                         |                    |
       |                      |                         |                    | Fix root cause
       |                      |                         |                    |
       |                      |                         |                    | POST /audit/dlq/:id/
       |                      |                         |                    |   reprocess
       |                      |                         |<-------------------|
       |                      |                         |                    |
       |                      |                         | Publish to         |
       |                      |                         | original exchange  |
       |                      |                         | with original      |
       |                      |                         | routing key        |
       |                      |<------------------------|                    |
       |                      |                         |                    |
       |                      |                         | UPDATE dlq_entries |
       |                      |                         | SET status =       |
       |                      |                         | 'reprocessed'      |
       |                      |                         |                    |
       |                      |                         | 200 OK             |
       |                      |                         |------------------->|
```

*Figure 14.4 — DLQ capture, investigation, and manual reprocessing flow.*

---

## 15. Error Handling & Consumer Resilience

### Error Classification

| Error Type | Example | Handling Strategy |
|---|---|---|
| **Deserialization Error** | Malformed JSON message | Log warning, ACK message (discard — cannot reprocess), increment `audit_deserialization_errors_total` |
| **Database Transient Error** | Connection timeout, deadlock | NACK + requeue with backoff; batch retry after `CONSUMER_RETRY_DELAY_MS` |
| **Database Permanent Error** | Schema violation, constraint error | Log error with full message context, ACK (discard), increment `audit_db_errors_total` |
| **Missing Required Fields** | No `notification_id` or `event_type` | Log warning with message snapshot, ACK (discard), increment `audit_missing_fields_total` |
| **RabbitMQ Connection Loss** | Broker restart | Automatic reconnection via `@golevelup/nestjs-rabbitmq` with exponential backoff |
| **Out of Memory** | Batch buffer exceeds memory | Flush partial batch, reduce `CONSUMER_BATCH_SIZE` dynamically |

### Poison Message Handling

Messages that fail processing 3 consecutive times (configurable via `CONSUMER_MAX_RETRIES`) are:

1. Logged with full context (message body, error stack, retry count).
2. ACKed (removed from queue to prevent infinite retry loops).
3. Counted in `audit_poison_messages_total` metric.

For `q.status.updates` (the only DLQ-enabled queue), poison messages are routed to `xch.notifications.dlq` and captured by the DLQ Consumer for investigation.

### Idempotency

Consumer processing is idempotent by design:

- **Audit Events:** Each message produces a unique `audit_events` row. If the same message is consumed twice (due to redelivery), a duplicate row is created — this is acceptable for an append-only audit trail and does not affect correctness.
- **Delivery Receipts:** Duplicate receipts (same `provider_message_id` + `status`) are inserted as additional rows. The trace API deduplicates by `(provider_message_id, status)` at query time.
- **Analytics:** The upsert strategy ensures re-aggregation produces identical results.

> **Info:** **Not on the Critical Path**
>
> The Audit Service is deliberately designed as a non-critical service. If it is temporarily unavailable or processing slowly, no other service is affected — upstream services use fire-and-forget publishing and do not wait for acknowledgment. Messages accumulate in durable RabbitMQ queues and are processed when the Audit Service recovers. This isolation ensures that audit trail maintenance never impacts notification delivery latency or availability.

---

## 16. GDPR & Compliance

### Right to Erasure (Article 17)

**`DELETE /audit/gdpr/erasure`**

Processes a data subject erasure request by anonymizing all PII in audit records matching the specified customer.

**Request Body:**

```json
{
  "customerId": "cust-12345",
  "requestedBy": "dpo@company.com",
  "reason": "Data subject erasure request #DR-2026-0042"
}
```

**Processing:**

1. Query `audit_events` WHERE `metadata->>'customerId' = :customerId`.
2. Overwrite PII fields in `metadata` and `payload_snapshot` with `[REDACTED]`.
3. Query `delivery_receipts` WHERE `notification_id` IN (matching notification IDs).
4. Overwrite PII in `raw_response` with `[REDACTED]`.
5. Log the erasure action itself as an audit event (`GDPR_ERASURE_EXECUTED`).
6. Return summary of affected records.

> **Warning:** **Anonymization, Not Deletion**
>
> GDPR erasure in the Audit Service uses anonymization (overwriting PII with `[REDACTED]`) rather than row deletion. This preserves the audit trail's structural integrity — event counts, delivery rates, and timeline sequences remain intact for compliance reporting while removing all personally identifiable information.

### Right of Access (Article 15)

**`GET /audit/gdpr/export?customerId=:customerId`**

Exports all audit data for a customer as a JSON file, including:

- All audit events with the customer's notifications.
- All delivery receipts for those notifications.
- Timeline reconstructions for each notification.

### CAN-SPAM Compliance

The Audit Service records `UNSUBSCRIBED` events from provider webhooks (published by adapter services), enabling compliance verification:

- Timestamp of unsubscribe request.
- Channel and provider that processed the unsubscribe.
- Verification that no further notifications were sent after unsubscribe.

### Consent Tracking

Audit events include preference change records from the Notification Engine:

- Channel opt-in/opt-out changes.
- Preference source (customer portal, admin override, webhook).
- Timestamp of each preference change.

### Data Access Logging

All queries to the audit REST API are logged with:

- Requesting user identity (from JWT).
- Query parameters and filters used.
- Timestamp and response size.
- Purpose classification (if provided via `X-Access-Purpose` header).

---

## 17. Security Considerations

### Data Classification

| Data | Classification | Handling |
|---|---|---|
| `payload_snapshot` | **Confidential** | Contains notification content with potential PII; NULLed after 90 days |
| `raw_response` | **Confidential** | Contains provider response with potential PII; NULLed after 90 days |
| `metadata` | **Internal** | May contain customer identifiers; anonymized on GDPR erasure |
| Aggregated analytics | **Internal** | No PII — safe for dashboard consumption |
| DLQ entries | **Confidential** | May contain full message payloads with PII |

### RBAC per Endpoint

| Endpoint | Super Admin | Admin | Operator | Viewer |
|---|---|---|---|---|
| `GET /audit/trace/*` | Yes | Yes | Yes | Yes |
| `GET /audit/logs` | Yes | Yes | Yes | Yes |
| `GET /audit/search` | Yes | Yes | Yes | Yes |
| `GET /audit/receipts/*` | Yes | Yes | Yes | Yes |
| `GET /audit/analytics/*` | Yes | Yes | Yes | Yes |
| `GET /audit/dlq` | Yes | Yes | Yes | No |
| `PATCH /audit/dlq/:id` | Yes | Yes | No | No |
| `POST /audit/dlq/:id/reprocess` | Yes | Yes | No | No |
| `DELETE /audit/gdpr/erasure` | Yes | No | No | No |
| `GET /audit/gdpr/export` | Yes | Yes | No | No |

### PII Masking in Logs

Application logs never contain raw PII. Email addresses, phone numbers, and customer names are masked in log output:

- `customer@example.com` → `c***r@example.com`
- `+1234567890` → `+1***890`

### Encryption

| Layer | Method | Purpose |
|---|---|---|
| In transit | TLS 1.2+ | All RabbitMQ connections and REST API calls |
| At rest | PostgreSQL TDE (if enabled) | Database-level encryption |
| Backups | AES-256 | Encrypted backup storage |

### Network Isolation

The Audit Service is deployed in the internal network zone. It is not directly accessible from the internet — all external access is routed through the Notification Gateway which handles authentication and authorization.

---

## 18. Monitoring & Health Checks

### Metrics

| Metric | Type | Labels | Description |
|---|---|---|---|
| `audit_events_ingested_total` | Counter | `event_type`, `actor` | Total audit events persisted |
| `audit_receipts_ingested_total` | Counter | `channel`, `provider`, `status` | Total delivery receipts persisted |
| `audit_orphaned_receipts_total` | Counter | `provider` | Receipts with no matching notification |
| `audit_consumer_batch_duration_ms` | Histogram | `queue` | Time to flush a consumer batch |
| `audit_consumer_batch_size` | Histogram | `queue` | Number of messages per batch flush |
| `audit_consumer_lag` | Gauge | `queue` | Approximate message backlog per queue |
| `audit_db_pool_active` | Gauge | — | Active database connections |
| `audit_db_pool_idle` | Gauge | — | Idle database connections |
| `audit_trace_duration_ms` | Histogram | — | Time to reconstruct a notification trace |
| `audit_search_duration_ms` | Histogram | — | Full-text search query execution time |
| `audit_aggregation_duration_ms` | Histogram | `period` | Time to complete aggregation job |
| `audit_dlq_entries_total` | Counter | `original_queue` | Total DLQ entries captured |
| `audit_dlq_pending_count` | Gauge | — | Current pending DLQ entries |
| `audit_deserialization_errors_total` | Counter | `queue` | Messages that failed to deserialize |

### Health & Readiness Endpoints

See [Section 11.6](#116-health-endpoints) for endpoint specifications.

### Alerting Thresholds

| Alert | Condition | Severity |
|---|---|---|
| Consumer lag high | `audit_consumer_lag{queue} > 10,000` for 5 min | Warning |
| Consumer lag critical | `audit_consumer_lag{queue} > 50,000` for 5 min | Critical |
| Orphaned receipts spike | `rate(audit_orphaned_receipts_total[1h]) > 10` | Warning |
| DLQ entries accumulating | `audit_dlq_pending_count > 50` | Warning |
| Database pool exhaustion | `audit_db_pool_active / (audit_db_pool_active + audit_db_pool_idle) > 0.9` | Critical |
| Aggregation job failure | Aggregation job does not complete within 10 min | Warning |
| Search latency high | `audit_search_duration_ms{p99} > 5000` for 10 min | Warning |

---

## 19. Configuration

### Environment Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `PORT` | `integer` | `3156` | HTTP server port |
| `DB_HOST` | `string` | `localhost` | PostgreSQL host |
| `DB_PORT` | `integer` | `5432` | PostgreSQL port |
| `DB_NAME` | `string` | `notification_api` | PostgreSQL database name |
| `DB_SCHEMA` | `string` | `audit_service` | PostgreSQL schema |
| `DB_USER` | `string` | `audit_service_user` | PostgreSQL user |
| `DB_PASSWORD` | `string` | — | PostgreSQL password |
| `DB_POOL_SIZE` | `integer` | `20` | Database connection pool size |
| `RABBITMQ_URL` | `string` | `amqp://localhost:5672/vhnotificationapi` | RabbitMQ connection URL |
| `CONSUMER_BATCH_SIZE` | `integer` | `50` | Messages per batch insert |
| `CONSUMER_FLUSH_INTERVAL_MS` | `integer` | `2000` | Max time between batch flushes |
| `CONSUMER_RETRY_DELAY_MS` | `integer` | `5000` | Delay after batch failure before retry |
| `CONSUMER_MAX_RETRIES` | `integer` | `3` | Max retries before discarding poison message |
| `RETENTION_PAYLOAD_DAYS` | `integer` | `90` | Days to retain payload data |
| `RETENTION_METADATA_DAYS` | `integer` | `730` | Days to retain metadata (2 years) |
| `ANALYTICS_HOURLY_CRON` | `string` | `5 * * * *` | Cron expression for hourly aggregation |
| `ANALYTICS_DAILY_CRON` | `string` | `15 0 * * *` | Cron expression for daily aggregation |
| `SEARCH_MAX_RESULTS` | `integer` | `200` | Maximum results per search query |
| `LOG_LEVEL` | `string` | `info` | Application log level (`debug`, `info`, `warn`, `error`) |

---

*Notification API Documentation v3.7 -- Architecture Team -- 2026*
