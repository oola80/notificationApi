# Event Ingestion Service — Technical Reference v1

> This is a convenience copy. The authoritative version is at `../../docs/07-event-ingestion-service.md`.

## 1. Overview

| Attribute | Value |
|---|---|
| **Port** | 3151 |
| **Technology** | NestJS 11, TypeScript 5.7, Node.js (ES2023) |
| **DB Schema** | `event_ingestion_service` |
| **Status** | Step 4 complete |
| **Unit Tests** | 264 across 33 suites |
| **E2E Tests** | 1 file (`app.e2e-spec.ts`) |

Receives events from external source systems (via HTTP webhook, AMQP relay, or email-ingest forwarding), validates, deduplicates, normalizes using runtime field mapping configuration, and publishes canonical events downstream to the notification engine.

---

## 2. Architecture

### Module Structure (`app.module.ts`)

| Module | Responsibility |
|---|---|
| `AppConfigModule` | `ConfigModule.forRoot` with env validation |
| `LoggerModule` | Pino structured logging |
| `TypeOrmModule` | PostgreSQL connection (`event_ingestion_service` schema, synchronize: false) |
| `CommonModule` | `@Global()` — errors, filters, pipes, interceptors, base repo |
| `MetricsModule` | `@Global()` — 13 Prometheus metrics, `GET /metrics` |
| `NormalizationModule` | MappingEngine, EventTypeResolver, PayloadValidator |
| `EventMappingsModule` | Event mapping CRUD + RabbitMQ config publishing |
| `EventSourcesModule` | Event source registry |
| `EventsModule` | Ingested event CRUD |
| `MappingCacheModule` | In-memory mapping cache with RabbitMQ invalidation |
| `RateLimiterModule` | Sliding-window global + per-source rate limiting |
| `AppRabbitMQModule` | `@golevelup/nestjs-rabbitmq` wrapper (4 exchanges) |
| `ConsumersModule` | 3 consumer handlers + shared pipeline |
| `WebhookModule` | HTTP webhook controller + source auth guard |
| `HealthModule` | `GET /health` with DB + RabbitMQ checks |

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

### 3.1 Event Processing Pipeline

The shared `EventProcessingService` implements a 10-step pipeline invoked by all 3 consumer types (webhook, AMQP relay, email-ingest):

1. **Rate limit check** — WebhookRateLimitGuard (global + per-source sliding window)
2. **Source authentication** — `SourceAuthService`: API key / Bearer / HMAC timing-safe comparison
3. **Source lookup** — Find registered `EventSource` by `sourceId`
4. **Event type resolution** — `EventTypeResolverService`: exact match → wildcard → passthrough
5. **Mapping lookup** — `MappingCacheService` (cache-first) or direct DB query
6. **Deduplication** — `DeduplicationService`: check `events` table within `DEDUP_WINDOW_HOURS`
7. **JSON Schema validation** — `PayloadValidatorService` (AJV draft-07, optional schema on mapping)
8. **Normalization** — `MappingEngineService`: per-field extraction + 13 transform types
9. **Persistence** — Save event to `events` table (raw + normalized payload, status, cycle_id)
10. **Publish** — `EventPublisherService`: publish to `xch.events.normalized` with priority routing key

Duplicate events return `200` with `EIS-004`. New events return `202`.

### 3.2 Normalization Engine

**`MappingEngineService`** (`src/normalization/mapping-engine.service.ts`)

- Per-field extraction using dot-path notation or JSONPath expressions
- Applies 13 registered transform functions sequentially per field

**Transform Registry** (`src/normalization/transforms/transform-registry.ts`) — 13 types:

| Transform | Description |
|---|---|
| `string` | Cast to string |
| `number` | Parse to number |
| `boolean` | Parse to boolean |
| `date_iso8601` | Normalize to ISO 8601 string |
| `date_epoch_ms` | Normalize epoch milliseconds → ISO 8601 |
| `date_epoch_s` | Normalize epoch seconds → ISO 8601 |
| `date_custom` | Parse with custom Dayjs format string |
| `uppercase` | Convert string to uppercase |
| `lowercase` | Convert string to lowercase |
| `trim` | Strip leading/trailing whitespace |
| `jsonPath` | Extract value via JSONPath Plus expression |
| `default` | Return configured default if field missing |
| `static` | Always emit a configured static value |

**`EventTypeResolverService`** — event type resolution with 3 tiers: exact match → wildcard (`*`) → passthrough (use raw event type).

**`PayloadValidatorService`** — AJV draft-07 JSON Schema validation against `validationSchema` on the mapping. Throws `EIS-005` on failure.

### 3.3 Mapping Cache

**`MappingCacheService`** (`src/mapping-cache/`)

- Optional in-memory `Map` keyed by `sourceId:eventType`
- Warm-up on `OnModuleInit` from DB
- Single-flight fetch: concurrent requests for the same key share one DB query
- RabbitMQ-driven invalidation via `q.config.mapping-cache` (`config.mapping.changed`)
- Controlled by `MAPPING_CACHE_ENABLED` env var

### 3.4 Rate Limiter

**`RateLimiterService`** (`src/rate-limiter/`) — sliding-window algorithm:

- Global webhook rate limit: `WEBHOOK_RATE_LIMIT` requests/second
- Per-source limit: extracted from `EventSource.rateLimit`
- `WebhookRateLimitGuard`: responds `429` with `Retry-After` header on breach (error `EIS-017`)

### 3.5 Event Mapping CRUD

**`EventMappingsController`** (`src/event-mappings/`) — 6 endpoints managing runtime field mapping configurations. Each mutation publishes a `config.mapping.changed` event to `xch.config.events` to invalidate downstream caches.

### 3.6 Consumer Retry / DLQ

**`BaseEventConsumer`** (`src/consumers/base-event.consumer.ts`) — abstract base for all 3 consumer types:

- On processing error, checks `isRetryable(error)`
- Increments `x-retry-count` header and republishes to original queue with exponential backoff delay
- Delay formula: `min(RETRY_INITIAL_DELAY_MS × RETRY_BACKOFF_MULTIPLIER^attempt, RETRY_MAX_DELAY_MS)`
- After `DLQ_MAX_RETRIES` attempts, message is rejected (NACK without requeue → dead-letter queue)

---

## 4. Data Model

### Tables (schema: `event_ingestion_service`)

#### `event_sources`
| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | Auto-increment integer |
| `name` | VARCHAR(100) UNIQUE | Unique source identifier |
| `auth_type` | VARCHAR(20) | `api_key`, `bearer`, `hmac` |
| `auth_config` | JSONB | Auth credentials/config |
| `rate_limit` | INTEGER | Per-source rate limit (req/s) |
| `is_active` | BOOLEAN | Soft-delete flag |
| `created_at` / `updated_at` | TIMESTAMPTZ | Audit timestamps |

#### `event_mappings`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `source_id` | INTEGER FK | → `event_sources` |
| `event_type` | VARCHAR(100) | Supports wildcard `*` |
| `name` | VARCHAR(255) | Human-readable name |
| `priority` | VARCHAR(20) | `normal` or `critical` |
| `field_mappings` | JSONB | Array of field mapping rules |
| `validation_schema` | JSONB | Optional AJV draft-07 schema |
| `is_active` | BOOLEAN | Soft-delete flag |
| `version` | INTEGER | Incremented on update |
| `created_by` / `updated_by` | VARCHAR | Actor tracking |
| `created_at` / `updated_at` | TIMESTAMPTZ | Audit timestamps |

Unique constraint: `(source_id, event_type)` where `is_active = true`.

#### `events`
| Column | Type | Notes |
|---|---|---|
| `id` | BIGSERIAL PK | |
| `event_id` | UUID UNIQUE | Canonical event identifier |
| `source_id` | INTEGER | FK to `event_sources` |
| `event_type` | VARCHAR(100) | Resolved event type |
| `source_event_id` | VARCHAR(255) | Provider-assigned ID (dedup key) |
| `cycle_id` | VARCHAR(255) | Business cycle identifier |
| `status` | VARCHAR(50) | `received`, `processing`, `published`, `failed`, `duplicate` |
| `priority` | VARCHAR(20) | `normal` or `critical` |
| `raw_payload` | JSONB | Original inbound payload |
| `normalized_payload` | JSONB | Mapped canonical payload |
| `created_at` | TIMESTAMPTZ | |

Index: `(source_id, source_event_id, created_at DESC)` for deduplication lookup.

#### Maintenance Functions
- **`purge_event_payloads()`** — PL/pgSQL function to NULL `raw_payload` and `normalized_payload` on events older than 90 days (data retention)

---

## 5. RabbitMQ Integration

### Exchanges

| Exchange | Type | Purpose |
|---|---|---|
| `xch.events.incoming` | Topic | Inbound raw events from all sources |
| `xch.events.normalized` | Topic | Outbound normalized canonical events |
| `xch.config.events` | Topic | Configuration change invalidation |
| `xch.notifications.status` | Topic | (declared but not published to by EIS) |

### Queues Consumed

| Queue | Binding Exchange | Routing Key | Consumers | Prefetch |
|---|---|---|---|---|
| `q.events.amqp` | `xch.events.incoming` | `source.*.#` | 3 | 10 |
| `q.events.webhook` | `xch.events.incoming` | `source.webhook.#` | 2 | 10 |
| `q.events.email-ingest` | `xch.events.incoming` | `source.email-ingest.#` | 2 | 10 |
| `q.config.mapping-cache` | `xch.config.events` | `config.mapping.changed` | 1 | 1 |

### Published Messages

**To `xch.events.normalized`:**
- Routing key: `event.critical.{eventType}` or `event.normal.{eventType}`
- Message type: `NormalizedEventMessage`

```typescript
interface NormalizedEventMessage {
  eventId: string;         // UUID
  sourceId: number;
  eventType: string;
  cycleId?: string;
  priority: 'normal' | 'critical';
  payload: Record<string, unknown>;  // normalized canonical payload
  timestamp: string;       // ISO 8601
  mappingId: string;       // UUID of mapping used
  correlationId?: string;
}
```

**To `xch.events.incoming`** (webhook relay):
- Routing key: `source.webhook.{eventType}`
- Published by `WebhookController` before returning 202

**To `xch.config.events`:**
- Routing key: `config.mapping.changed`
- Published by `EventMappingsService` on create/update/delete

---

## 6. REST API

### Webhook

| Method | Path | Description | Response |
|---|---|---|---|
| `POST` | `/webhooks/events` | Receive and process a webhook event | `202 Accepted` (new) / `200 OK` (duplicate) |

**Request body:**
```json
{
  "sourceId": "shopify-prod",
  "cycleId": "order-12345",
  "eventType": "order.delay",
  "sourceEventId": "evt-abc",
  "timestamp": "2026-01-15T10:00:00Z",
  "payload": { "orderId": "12345", "customerId": "C-001" }
}
```

**Response (202):**
```json
{
  "eventId": "uuid",
  "status": "received",
  "priority": "normal",
  "eventType": "order.delay"
}
```

### Event Mappings

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/event-mappings` | List mappings (filters: `sourceId`, `eventType`, `isActive`, `page`, `limit`) |
| `POST` | `/api/v1/event-mappings` | Create new mapping |
| `GET` | `/api/v1/event-mappings/:id` | Get mapping by UUID |
| `PUT` | `/api/v1/event-mappings/:id` | Update mapping (publishes cache invalidation) |
| `DELETE` | `/api/v1/event-mappings/:id` | Soft-delete mapping |
| `POST` | `/api/v1/event-mappings/:id/test` | Test mapping with sample payload (no persist/publish) |

### Events

| Method | Path | Description |
|---|---|---|
| `GET` | `/events/:eventId` | Get single event by canonical UUID |
| `GET` | `/events` | List events (filters: `sourceId`, `eventType`, `status`, `from`, `to`, `page`, `limit`) |

### Observability

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | DB + RabbitMQ health check |
| `GET` | `/metrics` | Prometheus metrics (text/plain) |

---

## 7. Service Integrations

| Direction | Service | Protocol | Purpose |
|---|---|---|---|
| Upstream | External source systems | HTTP POST | Send webhook events to `/webhooks/events` |
| Upstream | `email-ingest-service` (:3157) | AMQP | Publishes to `xch.events.incoming` via `source.email-ingest.*` |
| Upstream | `bulk-upload-service` (:3158) | HTTP POST | Calls `/webhooks/events` for each row |
| Downstream | `notification-engine-service` (:3152) | AMQP | Consumes from `xch.events.normalized` |
| Config | `admin-service` (:3155) | HTTP | Manages event mappings via CRUD endpoints |

---

## 8. Configuration

| Variable | Type | Default | Description |
|---|---|---|---|
| `NODE_ENV` | string | — | Runtime environment |
| `PORT` | number | `3151` | HTTP listen port |
| `DB_HOST` | string | — | PostgreSQL host |
| `DB_PORT` | number | `5433` | PostgreSQL port |
| `DB_NAME` | string | — | PostgreSQL database name |
| `DB_SCHEMA` | string | `event_ingestion_service` | PostgreSQL schema |
| `DB_USER` | string | — | PostgreSQL user |
| `DB_PASSWORD` | string | — | PostgreSQL password |
| `RABBITMQ_HOST` | string | — | RabbitMQ host |
| `RABBITMQ_PORT` | number | `5672` | RabbitMQ AMQP port |
| `RABBITMQ_MANAGEMENT_URL` | string | — | RabbitMQ Management UI URL |
| `RABBITMQ_VHOST` | string | `vhnotificationapi` | RabbitMQ virtual host |
| `RABBITMQ_USER` | string | — | RabbitMQ username |
| `RABBITMQ_PASSWORD` | string | — | RabbitMQ password |
| `DEDUP_WINDOW_HOURS` | number | `24` | Deduplication time window |
| `RABBITMQ_PREFETCH` | number | `10` | Consumer prefetch count |
| `DLQ_MAX_RETRIES` | number | `3` | Max retry attempts before DLQ |
| `RETRY_INITIAL_DELAY_MS` | number | `1000` | Initial retry delay (ms) |
| `RETRY_BACKOFF_MULTIPLIER` | number | `2` | Exponential backoff multiplier |
| `RETRY_MAX_DELAY_MS` | number | `30000` | Maximum retry delay (ms) |
| `MAPPING_CACHE_ENABLED` | boolean | `false` | Enable in-memory mapping cache |
| `WEBHOOK_RATE_LIMIT` | number | `100` | Global webhook rate limit (req/s) |

---

## 9. Error Codes

| Code | HTTP | Details | Message |
|---|---|---|---|
| `EIS-001` | 400 | `INVALID_REQUEST_BODY` | The request body is invalid |
| `EIS-002` | 404 | `EVENT_MAPPING_NOT_FOUND` | The requested event mapping was not found |
| `EIS-003` | 404 | `EVENT_SOURCE_NOT_FOUND` | The requested event source was not found |
| `EIS-004` | 200 | `DUPLICATE_EVENT` | This event has already been processed |
| `EIS-005` | 422 | `VALIDATION_FAILED` | Event validation failed against the mapping schema |
| `EIS-006` | 500 | `DATABASE_ERROR` | A database operation failed |
| `EIS-007` | 500 | `INTERNAL_SERVER_ERROR` | An unexpected error occurred |
| `EIS-008` | 422 | `EVENT_SOURCE_INACTIVE` | The event source is inactive |
| `EIS-009` | 409 | `MAPPING_CONFLICT` | An active mapping already exists for this source and event type combination |
| `EIS-010` | 400 | `INVALID_UUID` | The provided ID is not a valid UUID |
| `EIS-011` | 400 | `INVALID_QUERY_PARAMS` | One or more query parameters are invalid |
| `EIS-012` | 400 | `INVALID_PRIORITY` | Priority must be either "normal" or "critical" |
| `EIS-013` | 401 | `UNAUTHORIZED` | Source authentication failed |
| `EIS-014` | 422 | `MAPPING_NOT_FOUND` | No active mapping found for this source and event type |
| `EIS-015` | 404 | `EVENT_NOT_FOUND` | Event not found |
| `EIS-016` | 422 | `NORMALIZATION_FAILED` | Event normalization failed |
| `EIS-017` | 429 | `RATE_LIMIT_EXCEEDED` | Source rate limit exceeded |
| `EIS-018` | 500 | `RABBITMQ_PUBLISH_FAILED` | Failed to publish message to RabbitMQ |
| `EIS-019` | 500 | `CONSUMER_PROCESSING_FAILED` | Consumer failed to process message |
| `EIS-020` | 400 | `INVALID_ROUTING_KEY` | The message routing key is invalid |
| `EIS-021` | 503 | `CACHE_NOT_READY` | Mapping cache is warming up |

All error responses follow the schema: `{ code, details, message, status }`.

---

## 10. Observability

### Prometheus Metrics (`GET /metrics`)

| Metric | Type | Labels | Description |
|---|---|---|---|
| `event_ingestion_received_total` | Counter | `sourceId` | Total events received |
| `event_ingestion_published_total` | Counter | — | Total events successfully published |
| `event_ingestion_failed_total` | Counter | — | Total events that failed processing |
| `event_ingestion_duplicate_total` | Counter | — | Total duplicate events detected |
| `event_ingestion_validation_errors_total` | Counter | `sourceId` | Total validation errors |
| `event_ingestion_mapping_not_found_total` | Counter | — | Total mapping not found errors |
| `event_ingestion_mapping_cache_invalidations_total` | Counter | — | Total mapping cache invalidations |
| `event_ingestion_processing_duration_ms` | Histogram | — | Event processing duration (ms); buckets: 5, 10, 25, 50, 100, 250, 500, 1000 |
| `event_ingestion_queue_depth` | Gauge | `queue_name` | Current queue depth |
| `event_ingestion_consumer_lag` | Gauge | `queue_name` | Consumer lag per queue |
| `event_ingestion_dlq_depth` | Gauge | — | Dead letter queue depth |
| `event_ingestion_service_pool_active` | Gauge | — | Active DB pool connections |
| `event_ingestion_mapping_cache_hit_rate` | Gauge | — | Mapping cache hit rate (0–1) |

Default Node.js process metrics are also collected via `collectDefaultMetrics`.
