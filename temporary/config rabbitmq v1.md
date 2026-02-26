# RabbitMQ Configuration — Unified Reference

**Services Covered:** Event Ingestion, Notification Engine, Template Service, Channel Router, Notification Gateway
**Date:** 2026-02-21

---

## 1. Exchanges (System-Wide)

All exchanges are **durable** and survive broker restarts.

| Exchange | Type | Declaring Service(s) | Purpose |
|---|---|---|---|
| `xch.events.incoming` | Topic | event-ingestion-service | Raw events from source systems (AMQP sources, webhook relay, email-ingest relay) |
| `xch.events.normalized` | Topic | event-ingestion-service | Normalized canonical events with priority-tiered routing — consumed downstream by Notification Engine |
| `xch.notifications.deliver` | Topic | notification-engine-service | Rendered notification dispatch messages — consumed by Channel Router for provider delivery |
| `xch.notifications.status` | Topic | notification-engine-service, channel-router-service, template-service | Notification lifecycle status transitions, delivery status updates, and template audit events (fire-and-forget) |
| `xch.config.events` | Topic | admin-service | Configuration change invalidation events (rule changes, mapping changes, override changes) |
| `xch.notifications.dlq` | Fanout | shared | Dead-letter exchange for failed messages across all services |

---

## 2. Queues — Complete Registry

### 2.1 Event Ingestion Service (Consumers)

| Queue | Bound Exchange | Routing Key | Consumers | Prefetch | DLQ | Purpose |
|---|---|---|---|---|---|---|
| `q.events.amqp` | `xch.events.incoming` | `source.*.#` | 3 | 10 | Yes | All direct AMQP source system events |
| `q.events.webhook` | `xch.events.incoming` | `source.webhook.#` | 2 | 10 | Yes | Webhook-relayed events (internal publish after HTTP receipt) |
| `q.events.email-ingest` | `xch.events.incoming` | `source.email-ingest.#` | 2 | 10 | Yes | Parsed email events from Email Ingest Service |
| `q.config.mapping-cache` | `xch.config.events` | `config.mapping.changed` | 1 | 1 | No | Mapping cache invalidation (when `MAPPING_CACHE_ENABLED=true`) |

### 2.2 Notification Engine Service (Consumers)

| Queue | Bound Exchange | Routing Key | Consumers | Prefetch | DLQ | Purpose |
|---|---|---|---|---|---|---|
| `q.engine.events.critical` | `xch.events.normalized` | `event.critical.#` | 4 | 5 | Yes | Critical-priority normalized events (2x consumer allocation) |
| `q.engine.events.normal` | `xch.events.normalized` | `event.normal.#` | 2 | 10 | Yes | Normal-priority normalized events |
| `q.config.rule-cache` | `xch.config.events` | `config.rule.changed` | 1 | 1 | No | Rule cache invalidation (when `RULE_CACHE_ENABLED=true`) |
| `q.config.override-cache` | `xch.config.events` | `config.override.changed` | 1 | 1 | No | Critical override cache invalidation |
| `q.engine.status.inbound` | `xch.notifications.status` | `notification.status.delivered`, `notification.status.failed` | 2 | 10 | Yes | Inbound delivery status updates from Channel Router |

### 2.3 Channel Router Service (Consumers)

| Queue | Bound Exchange | Routing Key | Consumers | Prefetch | DLQ | Purpose |
|---|---|---|---|---|---|---|
| `q.deliver.email.critical` | `xch.notifications.deliver` | `notification.deliver.critical.email` | 3 | 5 | Yes | Critical email delivery |
| `q.deliver.email.normal` | `xch.notifications.deliver` | `notification.deliver.normal.email` | 2 | 10 | Yes | Normal email delivery |
| `q.deliver.sms.critical` | `xch.notifications.deliver` | `notification.deliver.critical.sms` | 2 | 5 | Yes | Critical SMS delivery |
| `q.deliver.sms.normal` | `xch.notifications.deliver` | `notification.deliver.normal.sms` | 1 | 10 | Yes | Normal SMS delivery |
| `q.deliver.whatsapp.critical` | `xch.notifications.deliver` | `notification.deliver.critical.whatsapp` | 2 | 5 | Yes | Critical WhatsApp delivery |
| `q.deliver.whatsapp.normal` | `xch.notifications.deliver` | `notification.deliver.normal.whatsapp` | 1 | 10 | Yes | Normal WhatsApp delivery |
| `q.deliver.push.critical` | `xch.notifications.deliver` | `notification.deliver.critical.push` | 2 | 5 | Yes | Critical push (FCM) delivery |
| `q.deliver.push.normal` | `xch.notifications.deliver` | `notification.deliver.normal.push` | 1 | 10 | Yes | Normal push (FCM) delivery |

### 2.4 Template Service

The Template Service has **no consumer queues**. It only publishes fire-and-forget audit messages (see Section 4.3).

### 2.5 Notification Gateway

The Notification Gateway **does not interact with RabbitMQ directly**. It is a pure HTTP/REST BFF that proxies requests to backend services. All asynchronous messaging is handled by the downstream microservices.

### 2.6 Audit Service (Consumers) — for reference

| Queue | Bound Exchange | Routing Key | Consumers | Prefetch | DLQ | Purpose |
|---|---|---|---|---|---|---|
| `q.audit.template` | `xch.notifications.status` | `template.#` | 1 | — | No | Template lifecycle audit events |
| `q.status.updates` | `xch.notifications.status` | `notification.status.#` | — | — | Yes | Delivery status updates |
| `audit.events` | `xch.events.normalized` | `event.#` | — | — | — | Event ingestion audit trail |
| `audit.deliver` | `xch.notifications.deliver` | `notification.deliver.#` | — | — | — | Dispatch audit trail |
| `audit.dlq` | `xch.notifications.dlq` | `#` (fanout) | — | — | No | Dead-lettered messages for manual review |

---

## 3. Routing Keys — Complete Reference

### 3.1 `xch.events.incoming` (Topic)

| Pattern | Example | Publisher | Consumer Queue |
|---|---|---|---|
| `source.{sourceId}.{eventType}` | `source.erp-system-1.order.shipped` | External AMQP sources | `q.events.amqp` |
| `source.webhook.{eventType}` | `source.webhook.order.created` | Event Ingestion (webhook relay) | `q.events.webhook` |
| `source.email-ingest.{eventType}` | `source.email-ingest.inbound-email` | Email Ingest Service | `q.events.email-ingest` |

### 3.2 `xch.events.normalized` (Topic)

| Pattern | Example | Publisher | Consumer Queue |
|---|---|---|---|
| `event.critical.{eventType}` | `event.critical.order.delayed` | Event Ingestion Service | `q.engine.events.critical` |
| `event.normal.{eventType}` | `event.normal.order.shipped` | Event Ingestion Service | `q.engine.events.normal` |

Priority is determined by the `priority` field in the event mapping configuration (`normal` default, `critical` for time-sensitive event types).

### 3.3 `xch.notifications.deliver` (Topic)

| Pattern | Example | Publisher | Consumer Queue |
|---|---|---|---|
| `notification.deliver.critical.email` | — | Notification Engine | `q.deliver.email.critical` |
| `notification.deliver.normal.email` | — | Notification Engine | `q.deliver.email.normal` |
| `notification.deliver.critical.sms` | — | Notification Engine | `q.deliver.sms.critical` |
| `notification.deliver.normal.sms` | — | Notification Engine | `q.deliver.sms.normal` |
| `notification.deliver.critical.whatsapp` | — | Notification Engine | `q.deliver.whatsapp.critical` |
| `notification.deliver.normal.whatsapp` | — | Notification Engine | `q.deliver.whatsapp.normal` |
| `notification.deliver.critical.push` | — | Notification Engine | `q.deliver.push.critical` |
| `notification.deliver.normal.push` | — | Notification Engine | `q.deliver.push.normal` |

### 3.4 `xch.notifications.status` (Topic)

| Pattern | Example | Publisher | Consumer Queue |
|---|---|---|---|
| `notification.status.processing` | — | Notification Engine | Audit Service |
| `notification.status.rendering` | — | Notification Engine | Audit Service |
| `notification.status.delivering` | — | Notification Engine | Audit Service |
| `notification.status.suppressed` | — | Notification Engine | Audit Service |
| `notification.status.sent` | — | Channel Router | `q.engine.status.inbound`, Audit Service |
| `notification.status.delivered` | — | Channel Router | `q.engine.status.inbound`, Audit Service |
| `notification.status.failed` | — | Channel Router | `q.engine.status.inbound`, Audit Service |
| `channel-router.delivery-attempt.sent` | — | Channel Router | Audit Service |
| `channel-router.delivery-attempt.failed` | — | Channel Router | Audit Service |
| `channel-router.delivery-attempt.retrying` | — | Channel Router | Audit Service |
| `channel-router.webhook.received` | — | Channel Router | Audit Service |
| `template.template.created` | — | Template Service | `q.audit.template` |
| `template.template.updated` | — | Template Service | `q.audit.template` |
| `template.template.deleted` | — | Template Service | `q.audit.template` |
| `template.template.rolledback` | — | Template Service | `q.audit.template` |
| `template.render.completed` | — | Template Service | `q.audit.template` |
| `template.render.failed` | — | Template Service | `q.audit.template` |

### 3.5 `xch.config.events` (Topic)

| Pattern | Example | Publisher | Consumer Queue |
|---|---|---|---|
| `config.mapping.changed` | — | Admin Service | `q.config.mapping-cache` (Event Ingestion) |
| `config.rule.changed` | — | Admin Service / Notification Engine | `q.config.rule-cache` (Notification Engine) |
| `config.override.changed` | — | Notification Engine | `q.config.override-cache` (Notification Engine) |

### 3.6 `xch.notifications.dlq` (Fanout)

No routing keys — fanout distributes to all bound queues (`q.dlq` / `audit.dlq`).

---

## 4. Publisher/Consumer Matrix — Per Service

### 4.1 Event Ingestion Service

| Direction | Exchange | Routing Key | Description |
|---|---|---|---|
| **Consumes** | `xch.events.incoming` | `source.*.#` | Raw events from AMQP sources |
| **Consumes** | `xch.events.incoming` | `source.webhook.#` | Webhook-relayed events |
| **Consumes** | `xch.events.incoming` | `source.email-ingest.#` | Email ingest events |
| **Consumes** | `xch.config.events` | `config.mapping.changed` | Mapping cache invalidation |
| **Publishes** | `xch.events.normalized` | `event.{priority}.{eventType}` | Normalized canonical events |

### 4.2 Notification Engine Service

| Direction | Exchange | Routing Key | Description |
|---|---|---|---|
| **Consumes** | `xch.events.normalized` | `event.critical.#` | Critical normalized events |
| **Consumes** | `xch.events.normalized` | `event.normal.#` | Normal normalized events |
| **Consumes** | `xch.config.events` | `config.rule.changed` | Rule cache invalidation |
| **Consumes** | `xch.config.events` | `config.override.changed` | Override cache invalidation |
| **Consumes** | `xch.notifications.status` | `notification.status.delivered`, `notification.status.failed` | Inbound delivery status from Channel Router |
| **Publishes** | `xch.notifications.deliver` | `notification.deliver.{priority}.{channel}` | Rendered notifications to Channel Router |
| **Publishes** | `xch.notifications.status` | `notification.status.{outcome}` | Lifecycle status transitions (fire-and-forget) |
| **Publishes** | `xch.config.events` | `config.rule.changed` | Rule invalidation on CRUD (when cache enabled) |
| **Publishes** | `xch.config.events` | `config.override.changed` | Override invalidation on CRUD |

### 4.3 Template Service

| Direction | Exchange | Routing Key | Description |
|---|---|---|---|
| **Publishes** | `xch.notifications.status` | `template.template.created` | Template created audit |
| **Publishes** | `xch.notifications.status` | `template.template.updated` | Template updated audit |
| **Publishes** | `xch.notifications.status` | `template.template.deleted` | Template deleted audit |
| **Publishes** | `xch.notifications.status` | `template.template.rolledback` | Template rollback audit |
| **Publishes** | `xch.notifications.status` | `template.render.completed` | Render success audit |
| **Publishes** | `xch.notifications.status` | `template.render.failed` | Render failure audit |

All publishes are **fire-and-forget** (`{ mandatory: false }`). No consumer queues. No DLQ. No retries. Message loss is acceptable — PostgreSQL is the system of record.

### 4.4 Channel Router Service

| Direction | Exchange | Routing Key | Description |
|---|---|---|---|
| **Consumes** | `xch.notifications.deliver` | `notification.deliver.critical.email` | Critical email delivery |
| **Consumes** | `xch.notifications.deliver` | `notification.deliver.normal.email` | Normal email delivery |
| **Consumes** | `xch.notifications.deliver` | `notification.deliver.critical.sms` | Critical SMS delivery |
| **Consumes** | `xch.notifications.deliver` | `notification.deliver.normal.sms` | Normal SMS delivery |
| **Consumes** | `xch.notifications.deliver` | `notification.deliver.critical.whatsapp` | Critical WhatsApp delivery |
| **Consumes** | `xch.notifications.deliver` | `notification.deliver.normal.whatsapp` | Normal WhatsApp delivery |
| **Consumes** | `xch.notifications.deliver` | `notification.deliver.critical.push` | Critical push delivery |
| **Consumes** | `xch.notifications.deliver` | `notification.deliver.normal.push` | Normal push delivery |
| **Publishes** | `xch.notifications.status` | `notification.status.sent` | Provider accepted |
| **Publishes** | `xch.notifications.status` | `notification.status.delivered` | Delivery confirmed |
| **Publishes** | `xch.notifications.status` | `notification.status.failed` | Permanent failure |
| **Publishes** | `xch.notifications.status` | `channel-router.delivery-attempt.*` | Delivery attempt audit (fire-and-forget) |
| **Publishes** | `xch.notifications.status` | `channel-router.webhook.*` | Webhook receipt audit (fire-and-forget) |

### 4.5 Notification Gateway

**No RabbitMQ interaction.** Pure HTTP/REST BFF — proxies requests to backend services.

---

## 5. Consumer Allocation Summary

### 5.1 Total Consumer Count (Single Instance Per Service)

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
| **Template Service** | (none) | 0 | — |
| **Gateway** | (none) | 0 | — |
| | **TOTAL** | **32** | |

### 5.2 Priority Tier Ratios

| Tier | Engine Consumers | Router Consumers (per channel) | Rationale |
|---|---|---|---|
| Critical | 4 | 2–3 | 2x allocation for time-sensitive events |
| Normal | 2 | 1–2 | Baseline throughput |

---

## 6. Dead-Letter Queue Configuration

| Parameter | Value |
|---|---|
| **DLQ Exchange** | `xch.notifications.dlq` (Fanout) |
| **DLQ Queue** | `q.dlq` |
| **Binding** | All DLQ-enabled queues declare `x-dead-letter-exchange: xch.notifications.dlq` |
| **Trigger** | After max retry attempts exhausted (tracked via `x-death` headers) |
| **Monitoring** | DLQ depth exposed in each service's `/health` endpoint and as a Prometheus metric |
| **Processing** | Manual review via Admin UI or automatic scheduled reprocessing |

### Queues with DLQ Enabled

| Queue | Service | DLQ |
|---|---|---|
| `q.events.amqp` | Event Ingestion | Yes |
| `q.events.webhook` | Event Ingestion | Yes |
| `q.events.email-ingest` | Event Ingestion | Yes |
| `q.config.mapping-cache` | Event Ingestion | **No** |
| `q.engine.events.critical` | Notification Engine | Yes |
| `q.engine.events.normal` | Notification Engine | Yes |
| `q.config.rule-cache` | Notification Engine | **No** |
| `q.config.override-cache` | Notification Engine | **No** |
| `q.engine.status.inbound` | Notification Engine | Yes |
| `q.deliver.email.critical` | Channel Router | Yes |
| `q.deliver.email.normal` | Channel Router | Yes |
| `q.deliver.sms.critical` | Channel Router | Yes |
| `q.deliver.sms.normal` | Channel Router | Yes |
| `q.deliver.whatsapp.critical` | Channel Router | Yes |
| `q.deliver.whatsapp.normal` | Channel Router | Yes |
| `q.deliver.push.critical` | Channel Router | Yes |
| `q.deliver.push.normal` | Channel Router | Yes |

Config/cache invalidation queues intentionally have **no DLQ** — these are best-effort delivery with TTL-based fallback.

---

## 7. Retry Configuration — Per Service

### 7.1 Event Ingestion Service

| Parameter | Default | Env Var |
|---|---|---|
| Max retries | 3 | `DLQ_MAX_RETRIES` |
| Initial delay | 1,000 ms | `RETRY_INITIAL_DELAY_MS` |
| Backoff multiplier | 2x | `RETRY_BACKOFF_MULTIPLIER` |
| Max delay | 30,000 ms | `RETRY_MAX_DELAY_MS` |

Retry sequence: **1s → 2s → 4s** → DLQ

### 7.2 Notification Engine Service

| Parameter | Default | Env Var |
|---|---|---|
| Max retries | 3 | `DLQ_MAX_RETRIES` |
| Initial delay | 1,000 ms | `RETRY_INITIAL_DELAY_MS` |
| Backoff multiplier | 3x | `RETRY_BACKOFF_MULTIPLIER` |
| Max delay | 30,000 ms | `RETRY_MAX_DELAY_MS` |

Retry sequence: **1s → 3s → 9s** → DLQ

### 7.3 Channel Router Service — Per Channel

| Channel | Max Retries | Retry Delays | Cumulative Wait |
|---|---|---|---|
| Email | 5 | 5s, 30s, 2m, 10m, 30m | ~42.5 min |
| SMS | 3 | 5s, 30s, 2m | ~2.5 min |
| WhatsApp | 4 | 5s, 30s, 2m, 10m | ~12.5 min |
| Push | 4 | 5s, 30s, 2m, 10m | ~12.5 min |

Backoff formula: `delay = baseDelay * (multiplier ^ attempt) + jitter(0, delay * 0.2)`

### 7.4 Template Service

No retry configuration — fire-and-forget only.

---

## 8. Environment Variables — RabbitMQ Related

### 8.1 Event Ingestion Service

| Variable | Default | Description |
|---|---|---|
| `RABBITMQ_URL` | — (required) | AMQP connection string |
| `RABBITMQ_PREFETCH` | `10` | Per-consumer prefetch for all source queues |
| `MAPPING_CACHE_ENABLED` | `false` | Enables `q.config.mapping-cache` consumer for cache invalidation |
| `DLQ_MAX_RETRIES` | `3` | Max retries before dead-lettering |
| `RETRY_INITIAL_DELAY_MS` | `1000` | Initial retry delay |
| `RETRY_BACKOFF_MULTIPLIER` | `2` | Backoff multiplier |
| `RETRY_MAX_DELAY_MS` | `30000` | Max retry delay |

### 8.2 Notification Engine Service

| Variable | Default | Description |
|---|---|---|
| `RABBITMQ_URL` | — (required) | AMQP connection string |
| `RABBITMQ_PREFETCH_CRITICAL` | `5` | Prefetch for `q.engine.events.critical` |
| `RABBITMQ_PREFETCH_NORMAL` | `10` | Prefetch for `q.engine.events.normal` |
| `CRITICAL_CONSUMERS` | `4` | Consumers on critical queue |
| `NORMAL_CONSUMERS` | `2` | Consumers on normal queue |
| `RULE_CACHE_ENABLED` | `false` | Enables `q.config.rule-cache` consumer |
| `OVERRIDE_CACHE_ENABLED` | `true` | Enables `q.config.override-cache` consumer |
| `DLQ_MAX_RETRIES` | `3` | Max retries before dead-lettering |
| `RETRY_INITIAL_DELAY_MS` | `1000` | Initial retry delay |
| `RETRY_BACKOFF_MULTIPLIER` | `3` | Backoff multiplier |
| `RETRY_MAX_DELAY_MS` | `30000` | Max retry delay |

### 8.3 Template Service

| Variable | Default | Description |
|---|---|---|
| `RABBITMQ_URL` | — | AMQP connection string (for fire-and-forget audit publishing) |

### 8.4 Channel Router Service

| Variable | Default | Description |
|---|---|---|
| `RABBITMQ_URL` | — (required) | AMQP connection string |
| `CONSUMER_PREFETCH_CRITICAL` | `5` | Prefetch for critical delivery queues |
| `CONSUMER_PREFETCH_NORMAL` | `10` | Prefetch for normal delivery queues |

### 8.5 Notification Gateway

No RabbitMQ environment variables — does not use RabbitMQ.

---

## 9. System-Wide Message Flow

```
  Source Systems                                                                External Providers
  (AMQP/Webhook/Email)                                                         (SendGrid, Twilio, etc.)
        │                                                                              ▲
        ▼                                                                              │
┌──────────────────┐                                                        ┌──────────────────────┐
│ xch.events.      │                                                        │  Channel Router      │
│ incoming         │                                                        │  Service :3154       │
│ (Topic Exchange) │                                                        │                      │
└───┬──────┬───┬───┘                                                        │  8 delivery queues   │
    │      │   │                                                            │  (4 channels × 2     │
    ▼      ▼   ▼                                                            │   priority tiers)    │
┌───────┐┌───────┐┌─────────┐                                              └──────────▲───────────┘
│q.amqp ││q.web- ││q.email- │                                                         │
│       ││hook   ││ingest   │                                              ┌───────────┴──────────┐
└───┬───┘└───┬───┘└────┬────┘                                              │ xch.notifications.   │
    └────────┼─────────┘                                                   │ deliver              │
             ▼                                                             │ (Topic Exchange)     │
┌────────────────────────┐    ┌───────────────────────┐                    └───────────▲──────────┘
│  Event Ingestion       │    │ xch.events.normalized │                               │
│  Service :3151         │───▶│ (Topic Exchange)      │                               │
│                        │    └───┬───────────────┬───┘                               │
│  Normalize, validate,  │        │               │                                   │
│  assign priority       │        ▼               ▼                                   │
└────────────────────────┘  ┌──────────┐   ┌──────────┐                               │
                            │q.engine. │   │q.engine. │                               │
                            │events.   │   │events.   │                               │
                            │critical  │   │normal    │                               │
                            │(4 cons)  │   │(2 cons)  │                               │
                            └────┬─────┘   └────┬─────┘                               │
                                 └───────┬──────┘                                     │
                                         ▼                                            │
                            ┌────────────────────────┐   HTTP POST                    │
                            │  Notification Engine   │──────────────▶ Template Service │
                            │  Service :3152         │   /render     :3153             │
                            │                        │◀──────────────                  │
                            │  Rules → Recipients →  │   Rendered                     │
                            │  Suppress → Render →   │   content                      │
                            │  Dispatch              │────────────────────────────────▶│
                            └───────────┬────────────┘  Publish to xch.notifications.
                                        │               deliver
                                        │
                                        ▼
                            ┌───────────────────────────┐
                            │ xch.notifications.status  │
                            │ (Topic Exchange)          │
                            │                           │
                            │  Status transitions,      │
                            │  delivery updates,        │
                            │  template audit events    │──────▶ Audit Service :3156
                            └───────────────────────────┘

                            ┌───────────────────────────┐
                            │ xch.notifications.dlq     │
                            │ (Fanout Exchange)         │
                            │                           │
                            │  Failed messages from     │
                            │  all DLQ-enabled queues   │──────▶ q.dlq (manual review)
                            └───────────────────────────┘

                            ┌───────────────────────────┐
                            │ xch.config.events         │
                            │ (Topic Exchange)          │
                            │                           │
                            │  config.mapping.changed   │──────▶ q.config.mapping-cache (Event Ingestion)
                            │  config.rule.changed      │──────▶ q.config.rule-cache (Notification Engine)
                            │  config.override.changed  │──────▶ q.config.override-cache (Notification Engine)
                            └───────────────────────────┘
```

---

## 10. Topology Counts Summary

| Resource | Count |
|---|---|
| **Exchanges** | 6 |
| **Queues (total)** | 22 (4 ingestion + 5 engine + 8 router + 5 audit) |
| **Consumers (single instance)** | 32 |
| **Routing key patterns** | 28+ distinct patterns |
| **Services publishing** | 4 (Event Ingestion, Notification Engine, Channel Router, Template Service) |
| **Services consuming** | 4 (Event Ingestion, Notification Engine, Channel Router, Audit Service) |
| **Services with no RabbitMQ** | 1 (Notification Gateway) |
