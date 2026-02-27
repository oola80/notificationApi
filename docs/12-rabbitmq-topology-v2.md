# 12 — RabbitMQ Topology

**Notification API — Complete Exchange, Queue & Binding Reference**

| | |
|---|---|
| **Version:** | 2.0 |
| **Date:** | 2026-02-26 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

> **Note:** This is v2 of the RabbitMQ topology reference, updated for the decoupled provider adapter architecture. The v1 reference is at `12-rabbitmq-topology.md`.

---

## Table of Contents

- [1. Overview](#1-overview)
- [2. Vhost](#2-vhost)
- [3. Exchanges](#3-exchanges)
- [4. Queues](#4-queues)
- [5. Bindings](#5-bindings)
- [6. Routing Key Reference](#6-routing-key-reference)
- [7. Dead-Letter Configuration](#7-dead-letter-configuration)
- [8. Consumer Allocation Summary](#8-consumer-allocation-summary)
- [9. Retry Configuration Per Service](#9-retry-configuration-per-service)
- [10. System-Wide Message Flow](#10-system-wide-message-flow)
- [11. Importable Definitions File](#11-importable-definitions-file)
- [12. Topology Counts Summary](#12-topology-counts-summary)

---

## 1. Overview

This document is the authoritative reference for the Notification API's RabbitMQ topology. It consolidates all exchange, queue, binding, and routing key definitions from the service-specific deep-dive documents (07, 08, 09, 10, 11) into a single source of truth.

> **Info:** All resources are scoped to vhost `vhnotificationapi`. An importable RabbitMQ definitions JSON file is available at `rabbitmq/definitions.json`.

---

## 2. Vhost

| Parameter | Value |
|---|---|
| **Name** | `vhnotificationapi` |
| **Purpose** | Isolates all Notification API messaging resources from other applications on the same RabbitMQ cluster |

---

## 3. Exchanges

All exchanges are **durable** and survive broker restarts. None are auto-delete or internal.

| Name | Type | Declaring Service(s) | Purpose |
|---|---|---|---|
| `xch.events.incoming` | topic | event-ingestion-service | Raw events from source systems (AMQP sources, webhook relay, email-ingest relay) |
| `xch.events.normalized` | topic | event-ingestion-service | Normalized canonical events with priority-tiered routing — consumed downstream by Notification Engine and Audit Service |
| `xch.notifications.deliver` | topic | notification-engine-service | Rendered notification dispatch messages — consumed by Channel Router for provider delivery and Audit Service |
| `xch.notifications.status` | topic | notification-engine-service, channel-router-service, template-service, provider adapter services (adapter-mailgun, adapter-braze, adapter-whatsapp, adapter-aws-ses) | Notification lifecycle status transitions, delivery status updates, template audit events, and adapter webhook events |
| `xch.config.events` | topic | admin-service | Configuration change invalidation events (mapping, rule, and override changes) |
| `xch.notifications.dlq` | fanout | shared | Dead-letter exchange for failed messages across all DLQ-enabled queues |

---

## 4. Queues

### 4.1 Event Ingestion Service (4 queues)

| Queue | Durable | DLX | Arguments | Purpose |
|---|---|---|---|---|
| `q.events.amqp` | yes | `xch.notifications.dlq` | `x-dead-letter-exchange` | All direct AMQP source system events |
| `q.events.webhook` | yes | `xch.notifications.dlq` | `x-dead-letter-exchange` | Webhook-relayed events (internal publish after HTTP receipt) |
| `q.events.email-ingest` | yes | `xch.notifications.dlq` | `x-dead-letter-exchange` | Parsed email events from Email Ingest Service |
| `q.config.mapping-cache` | yes | — | — | Mapping cache invalidation (when `MAPPING_CACHE_ENABLED=true`) |

### 4.2 Notification Engine Service (5 queues)

| Queue | Durable | DLX | Arguments | Purpose |
|---|---|---|---|---|
| `q.engine.events.critical` | yes | `xch.notifications.dlq` | `x-dead-letter-exchange` | Critical-priority normalized events (2x consumer allocation) |
| `q.engine.events.normal` | yes | `xch.notifications.dlq` | `x-dead-letter-exchange` | Normal-priority normalized events |
| `q.config.rule-cache` | yes | — | — | Rule cache invalidation (when `RULE_CACHE_ENABLED=true`) |
| `q.config.override-cache` | yes | — | — | Critical override cache invalidation |
| `q.engine.status.inbound` | yes | `xch.notifications.dlq` | `x-dead-letter-exchange` | Inbound delivery status updates from Channel Router and provider adapter services |

### 4.3 Channel Router Service (8 queues)

| Queue | Durable | DLX | Arguments | Purpose |
|---|---|---|---|---|
| `q.deliver.email.critical` | yes | `xch.notifications.dlq` | `x-dead-letter-exchange` | Critical email delivery |
| `q.deliver.email.normal` | yes | `xch.notifications.dlq` | `x-dead-letter-exchange` | Normal email delivery |
| `q.deliver.sms.critical` | yes | `xch.notifications.dlq` | `x-dead-letter-exchange` | Critical SMS delivery |
| `q.deliver.sms.normal` | yes | `xch.notifications.dlq` | `x-dead-letter-exchange` | Normal SMS delivery |
| `q.deliver.whatsapp.critical` | yes | `xch.notifications.dlq` | `x-dead-letter-exchange` | Critical WhatsApp delivery |
| `q.deliver.whatsapp.normal` | yes | `xch.notifications.dlq` | `x-dead-letter-exchange` | Normal WhatsApp delivery |
| `q.deliver.push.critical` | yes | `xch.notifications.dlq` | `x-dead-letter-exchange` | Critical push delivery |
| `q.deliver.push.normal` | yes | `xch.notifications.dlq` | `x-dead-letter-exchange` | Normal push delivery |

> **Info:** These 8 queues are consumed by the Channel Router Core service (:3154), which dispatches to the appropriate provider adapter service via HTTP. Adapter services do NOT consume from these delivery queues — they only receive requests via HTTP from the core and publish webhook-originated events to `xch.notifications.status`.

### 4.4 Audit Service (5 queues)

| Queue | Durable | DLX | Arguments | Purpose |
|---|---|---|---|---|
| `q.audit.template` | yes | — | — | Template lifecycle audit events |
| `q.status.updates` | yes | `xch.notifications.dlq` | `x-dead-letter-exchange` | Delivery status updates |
| `audit.events` | yes | — | — | Event ingestion audit trail |
| `audit.deliver` | yes | — | — | Dispatch audit trail |
| `audit.dlq` | yes | — | — | Dead-lettered messages for manual review |

### 4.5 Dead-Letter (1 queue)

| Queue | Durable | DLX | Arguments | Purpose |
|---|---|---|---|---|
| `q.dlq` | yes | — | — | Central dead-letter queue for all failed messages |

### 4.6 Services with No Consumer Queues

| Service | Notes |
|---|---|
| Template Service (:3153) | Publish-only — fire-and-forget audit messages to `xch.notifications.status` |
| Provider Adapter Services (:3171-:3174) | Publish-only — normalized webhook events to `xch.notifications.status` |
| Notification Gateway (:3150) | No RabbitMQ interaction — pure HTTP/REST BFF |

---

## 5. Bindings

### 5.1 `xch.events.incoming` (topic) — 3 bindings

| Source Exchange | Destination Queue | Routing Key | Notes |
|---|---|---|---|
| `xch.events.incoming` | `q.events.amqp` | `source.*.#` | Matches all AMQP source events |
| `xch.events.incoming` | `q.events.webhook` | `source.webhook.#` | Matches webhook-relayed events |
| `xch.events.incoming` | `q.events.email-ingest` | `source.email-ingest.#` | Matches email ingest events |

### 5.2 `xch.events.normalized` (topic) — 3 bindings

| Source Exchange | Destination Queue | Routing Key | Notes |
|---|---|---|---|
| `xch.events.normalized` | `q.engine.events.critical` | `event.critical.#` | Critical-priority events to engine |
| `xch.events.normalized` | `q.engine.events.normal` | `event.normal.#` | Normal-priority events to engine |
| `xch.events.normalized` | `audit.events` | `event.#` | All events to audit trail |

### 5.3 `xch.notifications.deliver` (topic) — 9 bindings

| Source Exchange | Destination Queue | Routing Key | Notes |
|---|---|---|---|
| `xch.notifications.deliver` | `q.deliver.email.critical` | `notification.deliver.critical.email` | Critical email |
| `xch.notifications.deliver` | `q.deliver.email.normal` | `notification.deliver.normal.email` | Normal email |
| `xch.notifications.deliver` | `q.deliver.sms.critical` | `notification.deliver.critical.sms` | Critical SMS |
| `xch.notifications.deliver` | `q.deliver.sms.normal` | `notification.deliver.normal.sms` | Normal SMS |
| `xch.notifications.deliver` | `q.deliver.whatsapp.critical` | `notification.deliver.critical.whatsapp` | Critical WhatsApp |
| `xch.notifications.deliver` | `q.deliver.whatsapp.normal` | `notification.deliver.normal.whatsapp` | Normal WhatsApp |
| `xch.notifications.deliver` | `q.deliver.push.critical` | `notification.deliver.critical.push` | Critical push |
| `xch.notifications.deliver` | `q.deliver.push.normal` | `notification.deliver.normal.push` | Normal push |
| `xch.notifications.deliver` | `audit.deliver` | `notification.deliver.#` | All dispatches to audit trail |

### 5.4 `xch.notifications.status` (topic) — 6 bindings

| Source Exchange | Destination Queue | Routing Key | Notes |
|---|---|---|---|
| `xch.notifications.status` | `q.engine.status.inbound` | `notification.status.delivered` | Delivery confirmation to engine |
| `xch.notifications.status` | `q.engine.status.inbound` | `notification.status.failed` | Failure notification to engine |
| `xch.notifications.status` | `q.audit.template` | `template.#` | Template lifecycle events to audit |
| `xch.notifications.status` | `q.status.updates` | `notification.status.#` | All status updates to audit |
| `xch.notifications.status` | `q.status.updates` | `adapter.webhook.#` | Adapter webhook events to audit |
| `xch.notifications.status` | `q.engine.status.inbound` | `adapter.webhook.*` | Adapter webhook delivery confirmations to engine |

### 5.5 `xch.config.events` (topic) — 3 bindings

| Source Exchange | Destination Queue | Routing Key | Notes |
|---|---|---|---|
| `xch.config.events` | `q.config.mapping-cache` | `config.mapping.changed` | Mapping cache invalidation |
| `xch.config.events` | `q.config.rule-cache` | `config.rule.changed` | Rule cache invalidation |
| `xch.config.events` | `q.config.override-cache` | `config.override.changed` | Override cache invalidation |

### 5.6 `xch.notifications.dlq` (fanout) — 2 bindings

| Source Exchange | Destination Queue | Routing Key | Notes |
|---|---|---|---|
| `xch.notifications.dlq` | `q.dlq` | _(fanout)_ | Central DLQ for processing/requeue |
| `xch.notifications.dlq` | `audit.dlq` | _(fanout)_ | DLQ audit trail for manual review |

---

## 6. Routing Key Reference

### 6.1 `xch.events.incoming`

Pattern: `source.{sourceId}.{eventType}`

| Pattern | Example | Publisher | Consumer Queue |
|---|---|---|---|
| `source.{sourceId}.{eventType}` | `source.erp-system-1.order.shipped` | External AMQP sources | `q.events.amqp` |
| `source.webhook.{eventType}` | `source.webhook.order.created` | Event Ingestion (webhook relay) | `q.events.webhook` |
| `source.email-ingest.{eventType}` | `source.email-ingest.inbound-email` | Email Ingest Service | `q.events.email-ingest` |

### 6.2 `xch.events.normalized`

Pattern: `event.{priority}.{eventType}`

| Pattern | Example | Publisher | Consumer Queue |
|---|---|---|---|
| `event.critical.{eventType}` | `event.critical.order.delayed` | Event Ingestion Service | `q.engine.events.critical` |
| `event.normal.{eventType}` | `event.normal.order.shipped` | Event Ingestion Service | `q.engine.events.normal` |

> **Info:** Priority is determined by the `priority` field in the event mapping configuration (`normal` default, `critical` for time-sensitive event types).

### 6.3 `xch.notifications.deliver`

Pattern: `notification.deliver.{priority}.{channel}`

| Pattern | Publisher | Consumer Queue |
|---|---|---|
| `notification.deliver.critical.email` | Notification Engine | `q.deliver.email.critical` |
| `notification.deliver.normal.email` | Notification Engine | `q.deliver.email.normal` |
| `notification.deliver.critical.sms` | Notification Engine | `q.deliver.sms.critical` |
| `notification.deliver.normal.sms` | Notification Engine | `q.deliver.sms.normal` |
| `notification.deliver.critical.whatsapp` | Notification Engine | `q.deliver.whatsapp.critical` |
| `notification.deliver.normal.whatsapp` | Notification Engine | `q.deliver.whatsapp.normal` |
| `notification.deliver.critical.push` | Notification Engine | `q.deliver.push.critical` |
| `notification.deliver.normal.push` | Notification Engine | `q.deliver.push.normal` |

### 6.4 `xch.notifications.status`

Pattern: `{domain}.{entity}.{outcome}` or `{domain}.{action}.{outcome}`

| Pattern | Publisher | Consumer Queue |
|---|---|---|
| `notification.status.processing` | Notification Engine | `q.status.updates` (Audit) |
| `notification.status.rendering` | Notification Engine | `q.status.updates` (Audit) |
| `notification.status.delivering` | Notification Engine | `q.status.updates` (Audit) |
| `notification.status.suppressed` | Notification Engine | `q.status.updates` (Audit) |
| `notification.status.sent` | Channel Router | `q.status.updates` (Audit) |
| `notification.status.delivered` | Channel Router | `q.engine.status.inbound`, `q.status.updates` (Audit) |
| `notification.status.failed` | Channel Router | `q.engine.status.inbound`, `q.status.updates` (Audit) |
| `channel-router.delivery-attempt.sent` | Channel Router | `q.status.updates` (Audit) |
| `channel-router.delivery-attempt.failed` | Channel Router | `q.status.updates` (Audit) |
| `channel-router.delivery-attempt.retrying` | Channel Router | `q.status.updates` (Audit) |
| `channel-router.webhook.received` | Channel Router | `q.status.updates` (Audit) |
| `adapter.webhook.{providerId}` | Provider Adapter Services | `q.status.updates` (Audit), `q.engine.status.inbound` |
| `template.template.created` | Template Service | `q.audit.template` |
| `template.template.updated` | Template Service | `q.audit.template` |
| `template.template.deleted` | Template Service | `q.audit.template` |
| `template.template.rolledback` | Template Service | `q.audit.template` |
| `template.render.completed` | Template Service | `q.audit.template` |
| `template.render.failed` | Template Service | `q.audit.template` |

> **Info:** Adapter services publish standardized webhook events with routing key `adapter.webhook.{providerId}` (e.g. `adapter.webhook.mailgun`). These are webhook-originated status events (DELIVERED, FAILED, etc.) that have been verified and normalized by the adapter. The core's `channel-router.delivery-attempt.*` and `channel-router.webhook.*` keys continue to be published by the Channel Router Core for delivery-path events.

### 6.5 `xch.config.events`

| Pattern | Publisher | Consumer Queue |
|---|---|---|
| `config.mapping.changed` | Admin Service | `q.config.mapping-cache` (Event Ingestion) |
| `config.rule.changed` | Admin Service / Notification Engine | `q.config.rule-cache` (Notification Engine) |
| `config.override.changed` | Notification Engine | `q.config.override-cache` (Notification Engine) |

### 6.6 `xch.notifications.dlq`

No routing keys — fanout exchange distributes to all bound queues (`q.dlq`, `audit.dlq`).

---

## 7. Dead-Letter Configuration

| Parameter | Value |
|---|---|
| **DLQ Exchange** | `xch.notifications.dlq` (fanout) |
| **DLQ Queue** | `q.dlq` |
| **Audit DLQ Queue** | `audit.dlq` |
| **Binding** | All DLQ-enabled queues declare `x-dead-letter-exchange: xch.notifications.dlq` |
| **Trigger** | After max retry attempts exhausted (tracked via `x-death` headers) |
| **Monitoring** | DLQ depth exposed in each service's `/health` endpoint and as a Prometheus metric |
| **Processing** | Manual review via Admin UI or automatic scheduled reprocessing |

### 7.1 Queues with DLQ Enabled (17 queues)

| Queue | Service |
|---|---|
| `q.events.amqp` | Event Ingestion |
| `q.events.webhook` | Event Ingestion |
| `q.events.email-ingest` | Event Ingestion |
| `q.engine.events.critical` | Notification Engine |
| `q.engine.events.normal` | Notification Engine |
| `q.engine.status.inbound` | Notification Engine |
| `q.deliver.email.critical` | Channel Router |
| `q.deliver.email.normal` | Channel Router |
| `q.deliver.sms.critical` | Channel Router |
| `q.deliver.sms.normal` | Channel Router |
| `q.deliver.whatsapp.critical` | Channel Router |
| `q.deliver.whatsapp.normal` | Channel Router |
| `q.deliver.push.critical` | Channel Router |
| `q.deliver.push.normal` | Channel Router |
| `q.status.updates` | Audit |

### 7.2 Queues without DLQ (6 queues)

| Queue | Service | Rationale |
|---|---|---|
| `q.config.mapping-cache` | Event Ingestion | Best-effort cache invalidation — TTL fallback |
| `q.config.rule-cache` | Notification Engine | Best-effort cache invalidation — TTL fallback |
| `q.config.override-cache` | Notification Engine | Best-effort cache invalidation — TTL fallback |
| `q.audit.template` | Audit | Fire-and-forget — message loss acceptable |
| `audit.events` | Audit | Fire-and-forget audit trail |
| `audit.deliver` | Audit | Fire-and-forget audit trail |

### 7.3 Dead-Letter Flow

```
  Message processing fails
  (max retries exhausted)
           |
           v
  Queue declares x-dead-letter-exchange: xch.notifications.dlq
           |
           v
  +----------------------------+
  | xch.notifications.dlq      |
  | (Fanout Exchange)          |
  +------+---------------+----+
         |               |
         v               v
  +-----------+   +-----------+
  | q.dlq     |   | audit.dlq |
  | (manual   |   | (audit    |
  |  review)  |   |  trail)   |
  +-----------+   +-----------+
```

---

## 8. Consumer Allocation Summary

### 8.1 Per-Service Consumer Counts (Single Instance)

| Service | Queue | Consumers | Prefetch |
|---|---|---|---|
| **Event Ingestion** | `q.events.amqp` | 3 | 10 |
| | `q.events.webhook` | 2 | 10 |
| | `q.events.email-ingest` | 2 | 10 |
| | `q.config.mapping-cache` | 1 | 1 |
| | **Subtotal** | **8** | |
| **Notification Engine** | `q.engine.events.critical` | 4 | 5 |
| | `q.engine.events.normal` | 2 | 10 |
| | `q.config.rule-cache` | 1 | 1 |
| | `q.config.override-cache` | 1 | 1 |
| | `q.engine.status.inbound` | 2 | 10 |
| | **Subtotal** | **10** | |
| **Channel Router** | `q.deliver.email.critical` | 3 | 5 |
| | `q.deliver.email.normal` | 2 | 10 |
| | `q.deliver.sms.critical` | 2 | 5 |
| | `q.deliver.sms.normal` | 1 | 10 |
| | `q.deliver.whatsapp.critical` | 2 | 5 |
| | `q.deliver.whatsapp.normal` | 1 | 10 |
| | `q.deliver.push.critical` | 2 | 5 |
| | `q.deliver.push.normal` | 1 | 10 |
| | **Subtotal** | **14** | |
| **Template Service** | _(none)_ | 0 | — |
| **Gateway** | _(none)_ | 0 | — |
| | **TOTAL** | **32** | |

> **Info:** Provider adapter services have their own RabbitMQ connections for publishing webhook events to `xch.notifications.status`. They do not consume from any queues — their only RabbitMQ activity is publishing.

### 8.2 Priority Tier Ratios

| Tier | Engine Consumers | Router Consumers (per channel) | Rationale |
|---|---|---|---|
| Critical | 4 | 2-3 | 2x allocation for time-sensitive events |
| Normal | 2 | 1-2 | Baseline throughput |

---

## 9. Retry Configuration Per Service

### 9.1 Event Ingestion Service

| Parameter | Default | Env Var |
|---|---|---|
| Max retries | 3 | `DLQ_MAX_RETRIES` |
| Initial delay | 1,000 ms | `RETRY_INITIAL_DELAY_MS` |
| Backoff multiplier | 2x | `RETRY_BACKOFF_MULTIPLIER` |
| Max delay | 30,000 ms | `RETRY_MAX_DELAY_MS` |

Retry sequence: **1s -> 2s -> 4s** -> DLQ

### 9.2 Notification Engine Service

| Parameter | Default | Env Var |
|---|---|---|
| Max retries | 3 | `DLQ_MAX_RETRIES` |
| Initial delay | 1,000 ms | `RETRY_INITIAL_DELAY_MS` |
| Backoff multiplier | 3x | `RETRY_BACKOFF_MULTIPLIER` |
| Max delay | 30,000 ms | `RETRY_MAX_DELAY_MS` |

Retry sequence: **1s -> 3s -> 9s** -> DLQ

### 9.3 Channel Router Service — Per Channel

| Channel | Max Retries | Retry Delays | Cumulative Wait |
|---|---|---|---|
| Email | 5 | 5s, 30s, 2m, 10m, 30m | ~42.5 min |
| SMS | 3 | 5s, 30s, 2m | ~2.5 min |
| WhatsApp | 4 | 5s, 30s, 2m, 10m | ~12.5 min |
| Push | 4 | 5s, 30s, 2m, 10m | ~12.5 min |

Backoff formula: `delay = baseDelay * (multiplier ^ attempt) + jitter(0, delay * 0.2)`

### 9.4 Template Service

No retry configuration — fire-and-forget publishing only.

---

## 10. System-Wide Message Flow

```
  Source Systems                                                                External Providers
  (AMQP/Webhook/Email)                                                         (Mailgun, Braze, etc.)
        |                                                                              ^
        v                                                                              |
+------------------+                                                        +----------------------+
| xch.events.      |                                                        | Provider Adapter     |
| incoming         |                                                        | Services :3171-:3174 |
| (Topic Exchange) |                                                        | (adapter-mailgun,    |
+---+------+---+---+                                                        |  adapter-braze,      |
    |      |   |                                                            |  adapter-whatsapp,   |
    v      v   v                                                            |  adapter-aws-ses)    |
+-------++-------++----------+                                              |                      |
|q.amqp ||q.web- ||q.email-  |                                              +-----^----------+-----+
|       ||hook   ||ingest    |                                                    |          |
+---+---++---+---++----+-----+                                               HTTP |          | Publish
    +--------+--------+                                                    (from  |          | adapter.webhook.{providerId}
             v                                                              core) |          v
+------------------------+    +-----------------------+                           |   +---------------------------+
|  Event Ingestion       |    | xch.events.normalized |                           |   | xch.notifications.status  |
|  Service :3151         |--->| (Topic Exchange)      |                           |   +---------------------------+
|                        |    +---+---------------+---+                           |
|  Normalize, validate,  |        |               |                               |
|  assign priority       |        v               v                               |
+------------------------+  +----------+   +----------+                           |
                            |q.engine. |   |q.engine. |                           |
                            |events.   |   |events.   |              +------------+----------+
                            |critical  |   |normal    |              |  Channel Router Core   |
                            |(4 cons)  |   |(2 cons)  |              |  Service :3154         |
                            +----+-----+   +----+-----+              |                        |
                                 +-------+------+                    |  8 delivery queues     |
                                         v                           |  (4 channels x 2       |
                            +------------------------+               |   priority tiers)      |
                            |  Notification Engine   |   HTTP POST   |                        |
                            |  Service :3152         |-------------->|  Dispatches to adapters|
                            |                        |   /render     |  via HTTP              |
                            |  Rules -> Recipients ->|<-----------   +----------^-------------+
                            |  Suppress -> Render -> |  Template                |
                            |  Dispatch              |  Service :3153           |
                            +-----------+------------+              +-----------+-----------+
                                        |                           | xch.notifications.    |
                                        |   Publish to              | deliver               |
                                        |   xch.notifications.      | (Topic Exchange)      |
                                        |   deliver                 +-----------^-----------+
                                        |                                       |
                                        |                                       |
                                        v
                            +---------------------------+
                            | xch.notifications.status  |
                            | (Topic Exchange)          |
                            |                           |
                            |  Status transitions,      |
                            |  delivery updates,        |
                            |  template audit events,   |
                            |  adapter webhook events   |------> Audit Service :3156
                            +---------------------------+

  Webhook Flow (provider -> adapter -> RabbitMQ):

  External Providers --webhooks--> Gateway :3150 --HTTP--> Adapter Services :3171-:3174
                                                                    |
                                                                    | Publish adapter.webhook.{providerId}
                                                                    v
                                                           xch.notifications.status
                                                                    |
                                                      +-------------+-------------+
                                                      |                           |
                                                      v                           v
                                              q.engine.status.inbound    q.status.updates
                                              (Notification Engine)      (Audit Service)

                            +---------------------------+
                            | xch.notifications.dlq     |
                            | (Fanout Exchange)         |
                            |                           |
                            |  Failed messages from     |
                            |  all DLQ-enabled queues   |------> q.dlq (manual review)
                            +---------------------------+

                            +---------------------------+
                            | xch.config.events         |
                            | (Topic Exchange)          |
                            |                           |
                            |  config.mapping.changed   |------> q.config.mapping-cache (Event Ingestion)
                            |  config.rule.changed      |------> q.config.rule-cache (Notification Engine)
                            |  config.override.changed  |------> q.config.override-cache (Notification Engine)
                            +---------------------------+
```

---

## 11. Importable Definitions File

A complete RabbitMQ definitions JSON file is maintained at `rabbitmq/definitions.json`. This file can be imported via:

- **Management UI:** Definitions -> Import -> Upload file
- **CLI:** `rabbitmqadmin import rabbitmq/definitions.json`
- **Config:** Set `management.load_definitions` in `rabbitmq.conf`

The file contains all vhosts, permissions, exchanges, queues (with DLX arguments), and bindings documented in this reference.

---

## 12. Topology Counts Summary

| Resource | Count |
|---|---|
| **Vhost** | 1 (`vhnotificationapi`) |
| **Exchanges** | 6 |
| **Queues (total)** | 23 (4 ingestion + 5 engine + 8 router + 5 audit + 1 DLQ) |
| **Bindings** | 26 |
| **Consumers (single instance)** | 32 |
| **Routing key patterns** | 30+ distinct patterns |
| **Services publishing** | 4 + N adapter services (adapter services publish to `xch.notifications.status` only) |
| **Services consuming** | 4 (Event Ingestion, Notification Engine, Channel Router, Audit Service) |
| **Services with no RabbitMQ consumers** | 1 + 4 adapter services (Notification Gateway has no RabbitMQ; adapter services are publish-only) |

---

*Notification API Documentation v3.3 -- Architecture Team -- 2026*
