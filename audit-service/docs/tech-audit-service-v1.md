# Audit Service — Technical Reference v1

## 1. Overview

| Attribute | Value |
|---|---|
| **Port** | 3156 |
| **Technology** | NestJS 11, TypeScript 5.7, Node.js (ES2023) |
| **DB Schema** | `audit_service` |
| **Status** | Phase 4 complete |
| **Unit Tests** | 338 across 41 suites |
| **E2E Tests** | 58 across 8 suites |

Append-only event sourcing system that consumes events from all upstream services to build a complete notification lifecycle audit trail. Provides REST APIs for querying audit logs, full-text search, notification/correlation/cycle traces, delivery receipts, analytics aggregation, and DLQ lifecycle management. Also hosts data retention cron jobs.

---

## 2. Architecture

### Module Structure (`app.module.ts`)

| Module | Responsibility |
|---|---|
| `AppConfigModule` | `ConfigModule.forRoot` with env validation |
| `LoggerModule` | Pino structured logging |
| `TypeOrmModule` | PostgreSQL (`audit_service` schema) |
| `CommonModule` | `@Global()` — 9 AUD-prefixed errors, filters, pipes, interceptors |
| `MetricsModule` | `@Global()` — 15 Prometheus metrics, `GET /metrics` |
| `EventsModule` | Audit event CRUD + audit logs + full-text search |
| `ReceiptsModule` | Delivery receipt storage and lookup |
| `SearchModule` | Full-text search controller + service |
| `TraceModule` | Notification/correlation/cycle timeline APIs |
| `AnalyticsModule` | Analytics query + aggregation cron jobs |
| `DlqModule` | DLQ entry CRUD + reprocess publishing |
| `RetentionModule` | Retention cron jobs |
| `ConsumersModule` | `BatchBufferService` + 5 consumer handlers |
| `AppRabbitMQModule` | 4 exchanges, 5 named consumer channels + `DlqPublisher` |
| `HealthModule` | `GET /health` (liveness) + `GET /health/ready` (readiness) |

### Layered Architecture

```
Controllers (HTTP handlers, zero business logic)
    ↓
Services (all orchestration + business rules)
    ↓
Repositories (sole DB access via TypeORM, extend PgBaseRepository)
```

---

## 3. Features & Functionality

### 3.1 Consumer Pipeline & Batch Buffer

**`BatchBufferService`** (`src/consumers/batch-buffer.service.ts`) — generic configurable batch buffer:

- Accumulates messages up to `CONSUMER_BATCH_SIZE` (default 50) or `CONSUMER_FLUSH_INTERVAL_MS` (default 2000ms), whichever comes first
- **Deferred ACK/NACK pattern**: holds AMQP ack/nack callbacks until batch flush confirms DB success
- **Transient vs permanent error classification**: transient errors retry with `CONSUMER_RETRY_DELAY_MS` delay; permanent errors (e.g., DB constraint violations) are discarded immediately
- **Poison message detection**: fingerprints messages by content hash; after `CONSUMER_MAX_RETRIES` failures for the same fingerprint, the message is discarded and logged as poison

**5 Consumer Handlers:**

| Consumer | Queue | Event Types Written |
|---|---|---|
| `EventsConsumer` | `audit.events` | `EVENT_INGESTED`, `EVENT_NORMALIZED`, `EVENT_VALIDATION_FAILED`, `EVENT_DUPLICATE_DETECTED` |
| `DeliverConsumer` | `audit.deliver` | `DELIVERY_DISPATCHED` |
| `StatusConsumer` | `q.status.updates` | Delivery status events (dual routing keys: `notification.status.#` + `adapter.webhook.#`) |
| `TemplateConsumer` | `q.audit.template` | `TEMPLATE_CREATED`, `TEMPLATE_UPDATED`, `TEMPLATE_DELETED`, `TEMPLATE_ROLLEDBACK` |
| `DlqConsumer` | `audit.dlq` | `DLQ_CAPTURED` (with `x-death` header extraction for original exchange/queue/routing key) |

### 3.2 Full-Text Search

**`SearchService`** (`src/search/`) — PostgreSQL `tsvector`/`tsquery`:

- `search_vector` column on `audit_events` maintained by trigger (`to_tsvector('english', ...)`)
- `GIN` index on `search_vector` for fast lookups
- **Operator detection**: `SearchService` parses query string for boolean operators (`&`, `|`, `!`) to determine `tsquery` type
- **Ranking**: `ts_rank_cd(search_vector, query)` for relevance ordering
- Max results enforced: `SEARCH_MAX_RESULTS` (default 200, throws `AUD-007` if exceeded)

### 3.3 Trace APIs

**`TraceService`** (`src/trace/`) — 3 timeline views:

| Endpoint | Data | Description |
|---|---|---|
| `GET /audit/trace/:notificationId` | Single notification | All audit events + receipts merged chronologically, with summary extraction |
| `GET /audit/trace/correlation/:correlationId` | All notifications sharing `correlationId` | Grouped by notification, sorted by first event timestamp |
| `GET /audit/trace/cycle/:cycleId` | All notifications within a business cycle | Grouped by notification, sorted by first event timestamp |

Timeline merge: audit events and delivery receipts are interleaved by timestamp. Summary extraction identifies key lifecycle milestones (created, sent, delivered, failed).

### 3.4 Analytics Aggregation

**`AggregationService`** (`src/analytics/`) — scheduled cron jobs:

| Cron | Schedule (default) | Action |
|---|---|---|
| Hourly aggregation | `5 * * * *` | Aggregate from `delivery_receipts` + `audit_events`, upsert to `notification_analytics` with `period = 'hourly'` |
| Daily aggregation | `15 0 * * *` | Aggregate prior day totals, upsert with `period = 'daily'` |

**Idempotent upsert**: uses `COALESCE`-based unique index on `(period, date, channel, event_type)` (NULL-safe via `COALESCE(channel, '_all')`, `COALESCE(event_type, '_all')`). `_all` rows represent cross-channel totals.

**Analytics query** (`GET /audit/analytics`): filters by `period`, `from`, `to`, `channel`, `eventType`.

**Summary** (`GET /audit/analytics/summary`): today's totals, last 7 days totals, per-channel breakdown.

### 3.5 DLQ Management

**`DlqService`** (`src/dlq/`) — lifecycle management for dead-lettered messages:

| Status | Transition | Description |
|---|---|---|
| `PENDING` → `INVESTIGATED` | `PATCH /audit/dlq/:id` | Mark as under investigation |
| `PENDING` → `REPROCESSED` | `POST /audit/dlq/:id/reprocess` | Republish to original exchange + mark resolved |
| `PENDING` → `DISCARDED` | `PATCH /audit/dlq/:id` | Mark as intentionally discarded |
| `INVESTIGATED` → `REPROCESSED` | `POST /audit/dlq/:id/reprocess` | Republish after investigation |
| `INVESTIGATED` → `DISCARDED` | `PATCH /audit/dlq/:id` | Discard after investigation |

Invalid transitions throw `AUD-006`.

**`DlqPublisher`** (`src/rabbitmq/dlq-publisher.service.ts`) — republishes the original message payload to the original `exchange` + `routingKey` extracted from `x-death` header.

### 3.6 Data Retention

**`RetentionService`** (`src/retention/`) — 2 scheduled cron jobs:

| Job | Schedule | Action |
|---|---|---|
| Payload purge | `03:00 UTC` | Calls `purge_audit_payloads()` — NULLs `payload` on `audit_events` older than `RETENTION_PAYLOAD_DAYS` (default 90) |
| DLQ cleanup | `03:30 UTC` | Deletes resolved DLQ entries (`REPROCESSED`/`DISCARDED`) older than `RETENTION_PAYLOAD_DAYS` days |

---

## 4. Data Model

### Tables (schema: `audit_service`)

#### `audit_events`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `notification_id` | VARCHAR(255) | Cross-service correlation |
| `correlation_id` | VARCHAR(255) | Business correlation ID |
| `cycle_id` | VARCHAR(255) | Business cycle ID |
| `event_type` | VARCHAR(100) | `EVENT_INGESTED`, `DELIVERY_DISPATCHED`, etc. |
| `actor` | VARCHAR(255) | Source service name |
| `metadata` | JSONB | Event-specific metadata |
| `payload` | JSONB | Full message snapshot (nulled after retention) |
| `search_vector` | TSVECTOR | Auto-maintained by trigger on metadata + event_type |
| `created_at` | TIMESTAMPTZ | |

Indexes: `idx_audit_events_notification_id`, `idx_audit_events_correlation_id`, `idx_audit_events_cycle_id`, `idx_audit_events_event_type`, `idx_audit_events_created_at`, GIN index on `search_vector`.

Append-only — never updated or deleted (payload only NULLed by retention job).

#### `delivery_receipts`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `notification_id` | VARCHAR(255) | |
| `provider_id` | VARCHAR(100) | |
| `provider_message_id` | VARCHAR(500) | Provider-assigned ID |
| `channel` | VARCHAR(20) | |
| `status` | VARCHAR(50) | `DELIVERED`, `FAILED`, `BOUNCED`, etc. |
| `raw_event` | JSONB | Original webhook payload |
| `event_timestamp` | TIMESTAMPTZ | When the event occurred at provider |
| `created_at` | TIMESTAMPTZ | |

Indexes: `idx_receipts_notification_id`, `idx_receipts_provider_message_id`.

#### `notification_analytics`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `period` | VARCHAR(10) | `hourly` or `daily` |
| `date` | TIMESTAMPTZ | Period start time |
| `channel` | VARCHAR(20) | Channel type or `_all` |
| `event_type` | VARCHAR(100) | Event type or `_all` |
| `total_sent` | BIGINT | |
| `total_delivered` | BIGINT | |
| `total_failed` | BIGINT | |
| `total_suppressed` | BIGINT | |
| `avg_delivery_ms` | DECIMAL | Average delivery latency |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

Unique index (COALESCE-based): `(period, date, COALESCE(channel,'_all'), COALESCE(event_type,'_all'))` for idempotent upsert.

#### `dlq_entries`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `original_exchange` | VARCHAR(255) | From `x-death` header |
| `original_routing_key` | VARCHAR(500) | From `x-death` header |
| `original_queue` | VARCHAR(255) | From `x-death` header |
| `payload` | JSONB | Original message body |
| `headers` | JSONB | Original AMQP headers |
| `death_reason` | VARCHAR(100) | RabbitMQ death reason (e.g., `rejected`) |
| `death_count` | INTEGER | Number of times dead-lettered |
| `status` | VARCHAR(30) | `PENDING`, `INVESTIGATED`, `REPROCESSED`, `DISCARDED` |
| `notes` | TEXT | Investigation notes |
| `resolved_by` | VARCHAR(255) | Who resolved |
| `captured_at` | TIMESTAMPTZ | When DLQ entry was captured |
| `created_at` | TIMESTAMPTZ | |

CHECK constraint: `status IN ('PENDING','INVESTIGATED','REPROCESSED','DISCARDED')`.

Indexes: `idx_dlq_status`, `idx_dlq_original_queue`, `idx_dlq_captured_at`.

#### Maintenance Functions
- **`purge_audit_payloads()`** — PL/pgSQL: NULLs `payload` on `audit_events` older than configured days

---

## 5. RabbitMQ Integration

### Exchanges

| Exchange | Type | Purpose |
|---|---|---|
| `xch.events.normalized` | Topic | Inbound normalized events from EIS |
| `xch.notifications.deliver` | Topic | Inbound delivery dispatch messages from NES |
| `xch.notifications.status` | Topic | Inbound status updates + outbound DLQ reprocessing |
| `xch.notifications.dlq` | Fanout | Inbound dead-lettered messages |

### Queues Consumed

| Queue | Exchange | Routing Key | Purpose |
|---|---|---|---|
| `audit.events` | `xch.events.normalized` | `event.#` | All normalized events |
| `audit.deliver` | `xch.notifications.deliver` | `notification.deliver.#` | All dispatch messages |
| `q.status.updates` | `xch.notifications.status` | `notification.status.#` + `adapter.webhook.#` | Delivery status (dual routing) |
| `q.audit.template` | `xch.notifications.status` | `template.#` | Template lifecycle events |
| `audit.dlq` | `xch.notifications.dlq` | (fanout) | Dead-lettered messages |

### Published Messages

**`DlqPublisher`** — republishes DLQ entry payload to original exchange/routing key for reprocessing:

```typescript
amqpConnection.publish(originalExchange, originalRoutingKey, payload, { headers });
```

---

## 6. REST API

### Audit Logs

| Method | Path | Description |
|---|---|---|
| `GET` | `/audit/logs` | Paginated logs (filters: `notificationId`, `correlationId`, `cycleId`, `eventType`, `actor`, `from`, `to`, `q` inline FTS, `page`, `pageSize`; max 90-day range) |

### Search

| Method | Path | Description |
|---|---|---|
| `GET` | `/audit/search` | Full-text search (required `q`, optional `from`, `to`, `page`, `pageSize`; max `SEARCH_MAX_RESULTS`) |

### Trace

| Method | Path | Description |
|---|---|---|
| `GET` | `/audit/trace/:notificationId` | Complete notification lifecycle timeline |
| `GET` | `/audit/trace/correlation/:correlationId` | All notifications sharing a correlation ID |
| `GET` | `/audit/trace/cycle/:cycleId` | All notifications within a business cycle |

### Receipts

| Method | Path | Description |
|---|---|---|
| `GET` | `/audit/receipts/:notificationId` | All delivery receipts for a notification |

### Analytics

| Method | Path | Description |
|---|---|---|
| `GET` | `/audit/analytics` | Analytics (filters: `period`, `from` (required), `to` (required), `channel`, `eventType`, `page`, `pageSize`) |
| `GET` | `/audit/analytics/summary` | Dashboard summary (today, 7-day, channel breakdown) |

### DLQ

| Method | Path | Description |
|---|---|---|
| `GET` | `/audit/dlq` | List DLQ entries (filters: `status`, `originalQueue`, `from`, `to`, `page`, `pageSize`; includes `statusCounts`) |
| `PATCH` | `/audit/dlq/:id` | Update DLQ entry status (with transition validation) |
| `POST` | `/audit/dlq/:id/reprocess` | Republish to original exchange + mark `REPROCESSED` |

### Observability

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness check |
| `GET` | `/health/ready` | Readiness: DB + RabbitMQ + DLQ pending count + consumer connectivity |
| `GET` | `/metrics` | Prometheus metrics (text/plain) |

---

## 7. Service Integrations

| Direction | Service | Protocol | Purpose |
|---|---|---|---|
| Upstream | `event-ingestion-service` (:3151) | AMQP | Consumes normalized events |
| Upstream | `notification-engine-service` (:3152) | AMQP | Consumes delivery dispatch + status messages |
| Upstream | `channel-router-service` (:3154) | AMQP | Consumes delivery status events |
| Upstream | `template-service` (:3153) | AMQP | Consumes template lifecycle events |
| Upstream | Provider adapters (:3171–3174) | AMQP | Consumes webhook status events |
| Queried by | `admin-service` (:3155) | HTTP | Audit logs, traces, analytics queries |

---

## 8. Configuration

| Variable | Type | Default | Description |
|---|---|---|---|
| `NODE_ENV` | string | — | Runtime environment |
| `PORT` | number | `3156` | HTTP listen port |
| `DB_HOST` | string | — | PostgreSQL host |
| `DB_PORT` | number | `5433` | PostgreSQL port |
| `DB_NAME` | string | — | PostgreSQL database |
| `DB_SCHEMA` | string | `audit_service` | PostgreSQL schema |
| `DB_USER` | string | — | PostgreSQL user |
| `DB_PASSWORD` | string | — | PostgreSQL password |
| `RABBITMQ_HOST` | string | — | RabbitMQ host |
| `RABBITMQ_PORT` | number | `5672` | RabbitMQ AMQP port |
| `RABBITMQ_MANAGEMENT_URL` | string | — | Management UI URL |
| `RABBITMQ_VHOST` | string | `vhnotificationapi` | Virtual host |
| `RABBITMQ_USER` | string | — | RabbitMQ username |
| `RABBITMQ_PASSWORD` | string | — | RabbitMQ password |
| `CONSUMER_BATCH_SIZE` | number | `50` | Messages per batch insert |
| `CONSUMER_FLUSH_INTERVAL_MS` | number | `2000` | Max time between batch flushes (ms) |
| `CONSUMER_RETRY_DELAY_MS` | number | `5000` | Delay after batch failure (ms) |
| `CONSUMER_MAX_RETRIES` | number | `3` | Max retries before poison message discarded |
| `RETENTION_PAYLOAD_DAYS` | number | `90` | Days to retain payload data |
| `RETENTION_METADATA_DAYS` | number | `730` | Days to retain metadata (2 years) |
| `ANALYTICS_HOURLY_CRON` | string | `5 * * * *` | Cron schedule for hourly aggregation |
| `ANALYTICS_DAILY_CRON` | string | `15 0 * * *` | Cron schedule for daily aggregation |
| `SEARCH_MAX_RESULTS` | number | `200` | Maximum search query result limit |
| `LOG_LEVEL` | string | `info` | Log level (debug/info/warn/error) |

---

## 9. Error Codes

| Code | HTTP | Details | Message |
|---|---|---|---|
| `AUD-001` | 400 | `VALIDATION_ERROR` | The request body is invalid |
| `AUD-002` | 404 | `AUDIT_EVENT_NOT_FOUND` | The requested audit event was not found |
| `AUD-003` | 404 | `DLQ_ENTRY_NOT_FOUND` | The requested DLQ entry was not found |
| `AUD-004` | 400 | `INVALID_DATE_RANGE` | The provided date range is invalid or exceeds the maximum allowed |
| `AUD-005` | 400 | `INVALID_UUID` | The provided ID is not a valid UUID |
| `AUD-006` | 409 | `DLQ_INVALID_STATUS_TRANSITION` | Invalid DLQ entry status transition |
| `AUD-007` | 400 | `SEARCH_RESULTS_LIMIT_EXCEEDED` | Search query exceeds the maximum result limit |
| `AUD-008` | 404 | `NOTIFICATION_NOT_FOUND` | No audit events found for the specified notification |
| `AUD-009` | 500 | `INTERNAL_SERVER_ERROR` | An unexpected error occurred |

All error responses follow the schema: `{ code, details, message, status }`.

---

## 10. Observability

### Prometheus Metrics (`GET /metrics`)

15 custom metrics (6 counters, 5 histograms, 4 gauges):

| Metric | Type | Labels | Description |
|---|---|---|---|
| `audit_events_consumed_total` | Counter | `consumer`, `eventType` | Total events consumed per consumer |
| `audit_events_persisted_total` | Counter | `eventType` | Total events persisted to DB |
| `audit_events_failed_total` | Counter | `consumer` | Total consumer processing failures |
| `audit_search_requests_total` | Counter | — | Total full-text search requests |
| `audit_dlq_reprocess_total` | Counter | — | Total DLQ reprocess operations |
| `audit_retention_purged_total` | Counter | `type` | Total records purged by retention job |
| `audit_batch_flush_duration_seconds` | Histogram | `consumer` | Batch flush duration |
| `audit_search_duration_seconds` | Histogram | — | Search query duration |
| `audit_trace_duration_seconds` | Histogram | — | Trace query duration |
| `audit_analytics_query_duration_seconds` | Histogram | — | Analytics query duration |
| `audit_batch_insert_duration_seconds` | Histogram | `consumer` | DB batch insert duration |
| `audit_consumer_batch_size` | Gauge | `consumer` | Current pending batch size |
| `audit_dlq_pending_count` | Gauge | — | Current DLQ entries with PENDING status |
| `audit_queue_depth` | Gauge | `queue_name` | RabbitMQ queue depth |
| `audit_consumer_connected` | Gauge | — | RabbitMQ consumer connection status (0/1) |

Default Node.js process metrics are also collected via `collectDefaultMetrics`.
