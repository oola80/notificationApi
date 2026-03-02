# Channel Router Service — Technical Reference v1

> This is a convenience copy. The authoritative version is at `../../docs/11-channel-router-service-v2.md`.

## 1. Overview

| Attribute | Value |
|---|---|
| **Port** | 3154 |
| **Technology** | NestJS 11, TypeScript 5.7, Node.js (ES2023) |
| **DB Schema** | `channel_router_service` |
| **Status** | Phase 4 complete |
| **Unit Tests** | 432 across 46 suites |
| **E2E Tests** | 5 files |

Routes pre-rendered notifications to provider adapter microservices. Implements the delivery orchestration layer: circuit breaker per provider, token-bucket rate limiting, per-channel retry policies with exponential backoff and jitter, channel-specific media processing, single-level fallback, and fire-and-forget audit publishing. All providers are dumb pipes — content is delivered pre-rendered.

---

## 2. Architecture

### Module Structure (`app.module.ts`)

| Module | Responsibility |
|---|---|
| `AppConfigModule` | `ConfigModule.forRoot` with 33 env var validation |
| `LoggerModule` | Pino structured logging |
| `TypeOrmModule` | PostgreSQL (`channel_router_service` schema) |
| `CommonModule` | `@Global()` — 24 CRS-prefixed errors, filters, pipes, interceptors |
| `MetricsModule` | `@Global()` — 13 Prometheus metrics, `GET /metrics` |
| `ChannelsModule` | Channel config CRUD + auto-seed 4 default channels |
| `ProvidersModule` | Provider adapter registry + provider config cache |
| `AdapterClientModule` | HTTP client for adapter `POST /send`, `GET /health`, `GET /capabilities` |
| `DeliveryModule` | 7-step pipeline + delivery attempt repository |
| `CircuitBreakerModule` | Per-provider CLOSED/OPEN/HALF_OPEN state machine (DB-persisted) |
| `RateLimiterModule` | Token-bucket rate limiter per provider |
| `RetryModule` | Per-channel retry policies + exponential backoff |
| `MediaModule` | Channel-specific media processing |
| `FallbackModule` | Single-level channel fallback |
| `AppRabbitMQModule` | `@golevelup/nestjs-rabbitmq` (3 exchanges, named channels) |
| `HealthMonitorModule` | Periodic adapter health checks + CB integration |
| `ConsumersModule` | 8 consumer handlers (4 channels × 2 priorities) |
| `HealthModule` | `GET /health` (liveness) + `GET /ready` (readiness) |

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

### 3.1 Delivery Pipeline

**`DeliveryPipelineService`** (`src/delivery/delivery-pipeline.service.ts`) — 7-step orchestrator:

1. **Validate** — Deserialize and validate `DispatchMessage` payload (throws `CRS-007`)
2. **Resolve adapter** — `ProvidersService.findActiveByChannel()` → weighted/failover/primary routing
3. **Circuit breaker** — `CircuitBreakerService.checkAndRecord()`: throws `CRS-003` if OPEN
4. **Rate limit** — `RateLimiterService.acquire()`: blocks up to configured timeout, throws `CRS-004` if exceeded
5. **Media process** — `MediaProcessorService`: channel-specific attachment handling
6. **Adapter send** — `AdapterClientService.send()` → HTTP `POST /send` to adapter
7. **Handle result** — on success: record attempt + publish status; on failure: classify → retry or DLQ

### 3.2 Circuit Breaker

**`CircuitBreakerService`** (`src/circuit-breaker/`) — state machine per provider, persisted to `provider_configs`:

| State | Behavior |
|---|---|
| `CLOSED` | Normal operation. Failures increment counter within `CB_FAILURE_WINDOW_MS`. |
| `OPEN` | Rejects all requests. Entered after `CB_FAILURE_THRESHOLD` failures. Stays open for `CB_COOLDOWN_MS`. |
| `HALF_OPEN` | Allows `CB_HALF_OPEN_MAX_ATTEMPTS` test requests. Success (×`CB_SUCCESS_THRESHOLD`) → CLOSED. Failure → OPEN. |

Non-retryable errors (e.g., `400 Bad Request` from adapter) do NOT trip the circuit breaker. Prometheus gauge tracks state per provider.

### 3.3 Token-Bucket Rate Limiter

**`RateLimiterService`** (`src/rate-limiter/`) — in-memory token bucket per provider:

- Configured via `rateLimitTokensPerSec` and `rateLimitMaxBurst` on `provider_configs`
- `acquire()` waits up to configured timeout for a token; returns `CRS-004` if still unavailable
- Bucket refills continuously at `tokensPerSec` rate
- Re-initialized on provider config update

### 3.4 Retry Engine

**`RetryService`** (`src/retry/`) — per-channel policies:

| Channel | Max Retries | Total Duration |
|---|---|---|
| `email` | 5 | ~42.5 min |
| `sms` | 3 | ~2.5 min |
| `whatsapp` | 4 | ~12.5 min |
| `push` | 4 | ~12.5 min |

Delay formula: `baseDelay × RETRY_BACKOFF_MULTIPLIER^attempt × (1 + jitter)` where jitter is `random(0, RETRY_JITTER_FACTOR)` (default 20% max jitter).

Retry is implemented as delayed republish: `setTimeout` → `RabbitMQPublisherService.retryRepublish()` — increments `x-retry-count` header and republishes to original queue.

### 3.5 Media Processor

**`MediaProcessorService`** (`src/media/`) — channel-specific processing:

| Channel | Strategy |
|---|---|
| `email` | Downloads media URLs, validates HTTPS + file size, Base64 encodes attachments |
| `sms` | Skip — no media processing |
| `whatsapp` | URL passthrough — validates HTTPS, passes URL to adapter |
| `push` | First inline image only — extracts first image URL for notification icon |

Limits enforced: `MEDIA_MAX_FILE_SIZE_MB` per file, `MEDIA_MAX_TOTAL_SIZE_MB` total. Graceful degradation: if download fails or size exceeded, attachment is omitted (logged as warning) unless it's the sole content.

### 3.6 Fallback

**`FallbackService`** (`src/fallback/`) — single-level channel fallback (no cascading):

- Triggered when primary delivery fails after all retries are exhausted
- Looks up `channel.fallback_channel_id` → resolves active provider for fallback channel
- Dispatches to fallback via `publisherService.publishFallbackDispatch()`
- Only one level: no recursive fallback chains

### 3.7 Provider Adapter Registry

**`ProvidersService`** (`src/providers/`) — manages adapter registrations:

- **`POST /providers/register`** — registers adapter URL, triggers `GET /capabilities` discovery
- **`ProviderCacheService`** — in-memory cache of `provider_configs` with TTL auto-refresh, invalidated on config changes
- **`AdapterHealthMonitorService`** — periodic health checks (`ADAPTER_HEALTH_CHECK_INTERVAL_MS`), integrates with circuit breaker

### 3.8 Consumer Priority Architecture

8 consumers across 4 channels × 2 priorities:

| Consumer | Queue | Consumers | Prefetch |
|---|---|---|---|
| `EmailCriticalConsumer` | `q.deliver.email.critical` | 3 | 5 |
| `EmailNormalConsumer` | `q.deliver.email.normal` | 2 | 10 |
| `SmsCriticalConsumer` | `q.deliver.sms.critical` | 2 | 5 |
| `SmsNormalConsumer` | `q.deliver.sms.normal` | 1 | 10 |
| `WhatsappCriticalConsumer` | `q.deliver.whatsapp.critical` | 2 | 5 |
| `WhatsappNormalConsumer` | `q.deliver.whatsapp.normal` | 1 | 10 |
| `PushCriticalConsumer` | `q.deliver.push.critical` | 2 | 5 |
| `PushNormalConsumer` | `q.deliver.push.normal` | 1 | 10 |

All extend `BaseDeliveryConsumer`: on success → void (ACK); on failure → `Nack(false)` (reject to DLQ).

---

## 4. Data Model

### Tables (schema: `channel_router_service`)

#### `channels`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `channel_type` | VARCHAR(20) | `email`, `sms`, `whatsapp`, `push` |
| `routing_mode` | VARCHAR(20) | `primary`, `weighted`, `failover` |
| `active_provider_id` | UUID FK | → `provider_configs` (nullable) |
| `fallback_channel_id` | UUID FK | Self-referencing (nullable) |
| `is_active` | BOOLEAN | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

Auto-seeded: 4 rows (one per channel type) on first startup.

#### `channel_configs`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `channel_id` | UUID FK | → `channels` |
| `config_key` | VARCHAR(100) | |
| `config_value` | TEXT | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

#### `provider_configs`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `provider_name` | VARCHAR(100) | |
| `provider_id` | VARCHAR(100) | Unique adapter identifier |
| `channel` | VARCHAR(20) | Associated channel type |
| `adapter_url` | VARCHAR(500) UNIQUE | HTTP URL for adapter service |
| `is_active` | BOOLEAN | |
| `routing_weight` | INTEGER | For weighted routing mode |
| `rate_limit_tokens_per_sec` | DECIMAL | Token bucket refill rate |
| `rate_limit_max_burst` | INTEGER | Token bucket max capacity |
| `circuit_breaker_state` | VARCHAR(20) | `CLOSED`, `OPEN`, `HALF_OPEN` |
| `circuit_breaker_failure_count` | INTEGER | Current failure count |
| `circuit_breaker_last_failure_at` | TIMESTAMPTZ | |
| `circuit_breaker_opened_at` | TIMESTAMPTZ | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

#### `delivery_attempts`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `notification_id` | VARCHAR(255) | From dispatch message |
| `provider_config_id` | UUID FK | → `provider_configs` |
| `channel` | VARCHAR(20) | |
| `status` | VARCHAR(20) | `sent`, `failed`, `retrying` |
| `attempt_number` | INTEGER | |
| `provider_message_id` | VARCHAR(500) | Provider-assigned message ID |
| `error_code` | VARCHAR(50) | |
| `error_message` | TEXT | |
| `response_time_ms` | INTEGER | |
| `created_at` | TIMESTAMPTZ | |

#### Maintenance Functions
- **`purge_delivery_attempts()`** — PL/pgSQL: deletes attempts older than 6 months

---

## 5. RabbitMQ Integration

### Exchanges

| Exchange | Type | Purpose |
|---|---|---|
| `xch.notifications.deliver` | Topic | Inbound delivery messages from NES |
| `xch.notifications.status` | Topic | Outbound delivery status events |
| `xch.notifications.dlq` | Fanout | Dead-lettered messages |

### Queues Consumed

| Queue | Binding Exchange | Routing Key | Consumers | Prefetch |
|---|---|---|---|---|
| `q.deliver.email.critical` | `xch.notifications.deliver` | `notification.deliver.critical.email` | 3 | 5 |
| `q.deliver.email.normal` | `xch.notifications.deliver` | `notification.deliver.normal.email` | 2 | 10 |
| `q.deliver.sms.critical` | `xch.notifications.deliver` | `notification.deliver.critical.sms` | 2 | 5 |
| `q.deliver.sms.normal` | `xch.notifications.deliver` | `notification.deliver.normal.sms` | 1 | 10 |
| `q.deliver.whatsapp.critical` | `xch.notifications.deliver` | `notification.deliver.critical.whatsapp` | 2 | 5 |
| `q.deliver.whatsapp.normal` | `xch.notifications.deliver` | `notification.deliver.normal.whatsapp` | 1 | 10 |
| `q.deliver.push.critical` | `xch.notifications.deliver` | `notification.deliver.critical.push` | 2 | 5 |
| `q.deliver.push.normal` | `xch.notifications.deliver` | `notification.deliver.normal.push` | 1 | 10 |

### Published Messages

**To `xch.notifications.status`** — 5 publish methods via `RabbitMQPublisherService`:

| Method | Routing Key | Purpose |
|---|---|---|
| `publishStatus` | `notification.status.{status}` | Delivery status (sent/failed) |
| `publishDeliveryAttempt` | `notification.delivery-attempt.{status}` | Per-attempt tracking |
| `publishDlq` | `notification.dlq.{channel}` | DLQ routing for failed messages |
| `publishFallbackDispatch` | `notification.fallback.{channel}` | Fallback channel dispatch |
| `retryRepublish` | (original routing key) | Retry republish to source queue |

> **Note:** Provider adapters also publish to `xch.notifications.status` with routing key `adapter.webhook.{providerId}` for webhook-originated events.

---

## 6. REST API

### Channel Configuration

| Method | Path | Description |
|---|---|---|
| `GET` | `/channels` | List channels with provider info |
| `GET` | `/channels/:id` | Get channel by ID |
| `PUT` | `/channels/:id/config` | Update channel routing config |

### Provider Management

| Method | Path | Description |
|---|---|---|
| `POST` | `/providers/register` | Register adapter (triggers capability discovery) |
| `DELETE` | `/providers/:id` | Deregister adapter |
| `GET` | `/providers` | List all registered adapters |
| `PUT` | `/providers/:id/config` | Update adapter config (URL, weights, rate limits) |
| `GET` | `/providers/:id/capabilities` | Proxy to adapter `GET /capabilities` |
| `GET` | `/providers/:id/health` | Proxy to adapter `GET /health` |

### Observability

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness: service process running |
| `GET` | `/ready` | Readiness: DB + RabbitMQ + adapter health |
| `GET` | `/metrics` | Prometheus metrics (text/plain) |

---

## 7. Service Integrations

| Direction | Service | Protocol | Purpose |
|---|---|---|---|
| Upstream | `notification-engine-service` (:3152) | AMQP | Produces dispatch messages |
| Downstream | `adapter-mailgun` (:3171) | HTTP | Email delivery |
| Downstream | `adapter-braze` (:3172) | HTTP | Email/SMS/WhatsApp/Push delivery |
| Downstream | `adapter-whatsapp` (:3173) | HTTP | WhatsApp delivery |
| Downstream | `adapter-aws-ses` (:3174) | HTTP | Email delivery |
| Downstream | `audit-service` (:3156) | AMQP | Consumes delivery status events |

---

## 8. Configuration

| Variable | Type | Default | Description |
|---|---|---|---|
| `NODE_ENV` | string | — | Runtime environment |
| `PORT` | number | `3154` | HTTP listen port |
| `DB_HOST` | string | — | PostgreSQL host |
| `DB_PORT` | number | `5433` | PostgreSQL port |
| `DB_NAME` | string | — | PostgreSQL database |
| `DB_SCHEMA` | string | `channel_router_service` | PostgreSQL schema |
| `DB_USER` | string | — | PostgreSQL user |
| `DB_PASSWORD` | string | — | PostgreSQL password |
| `RABBITMQ_HOST` | string | — | RabbitMQ host |
| `RABBITMQ_PORT` | number | `5672` | RabbitMQ AMQP port |
| `RABBITMQ_MANAGEMENT_URL` | string | — | Management UI URL |
| `RABBITMQ_VHOST` | string | `vhnotificationapi` | Virtual host |
| `RABBITMQ_USER` | string | — | RabbitMQ username |
| `RABBITMQ_PASSWORD` | string | — | RabbitMQ password |
| `PROVIDER_CACHE_ENABLED` | boolean | `true` | Cache provider configs in memory |
| `PROVIDER_CACHE_TTL_SECONDS` | number | `300` | Provider config cache TTL |
| `ADAPTER_HTTP_TIMEOUT_MS` | number | `10000` | HTTP timeout for adapter calls (ms) |
| `ADAPTER_HEALTH_CHECK_INTERVAL_MS` | number | `30000` | Interval for adapter health checks (ms) |
| `CB_FAILURE_THRESHOLD` | number | `5` | Failures to trip circuit breaker |
| `CB_FAILURE_WINDOW_MS` | number | `60000` | Failure counting window (ms) |
| `CB_COOLDOWN_MS` | number | `30000` | OPEN state duration before HALF_OPEN |
| `CB_HALF_OPEN_MAX_ATTEMPTS` | number | `1` | Test requests in HALF_OPEN state |
| `CB_SUCCESS_THRESHOLD` | number | `2` | Successes to close from HALF_OPEN |
| `RETRY_EMAIL_MAX` | number | `5` | Max retries for email |
| `RETRY_SMS_MAX` | number | `3` | Max retries for SMS |
| `RETRY_WHATSAPP_MAX` | number | `4` | Max retries for WhatsApp |
| `RETRY_PUSH_MAX` | number | `4` | Max retries for push |
| `RETRY_BACKOFF_MULTIPLIER` | number | `2` | Exponential backoff multiplier |
| `RETRY_JITTER_FACTOR` | number | `0.2` | Max jitter fraction of delay |
| `MEDIA_DOWNLOAD_TIMEOUT_MS` | number | `10000` | Timeout for media downloads (ms) |
| `MEDIA_MAX_FILE_SIZE_MB` | number | `10` | Max attachment size per file (MB) |
| `MEDIA_MAX_TOTAL_SIZE_MB` | number | `30` | Max total attachment size (MB) |
| `CONSUMER_PREFETCH_CRITICAL` | number | `5` | Prefetch for critical queues |
| `CONSUMER_PREFETCH_NORMAL` | number | `10` | Prefetch for normal queues |

---

## 9. Error Codes

| Code | HTTP | Details | Message |
|---|---|---|---|
| `CRS-001` | 400 | `INVALID_REQUEST_BODY` | The request body is invalid |
| `CRS-002` | 503 | `ADAPTER_UNAVAILABLE` | The adapter service is unavailable |
| `CRS-003` | 503 | `CIRCUIT_BREAKER_OPEN` | Circuit breaker is open for the adapter |
| `CRS-004` | 429 | `RATE_LIMIT_EXCEEDED` | Rate limit exceeded for the adapter |
| `CRS-005` | 502 | `RETRY_EXHAUSTED` | All retry attempts have been exhausted |
| `CRS-006` | 502 | `MEDIA_DOWNLOAD_FAILED` | Failed to download media attachment |
| `CRS-007` | 400 | `INVALID_DISPATCH_MESSAGE` | The dispatch message is invalid or malformed |
| `CRS-008` | 404 | `CHANNEL_NOT_FOUND` | The requested channel was not found |
| `CRS-009` | 404 | `PROVIDER_NOT_FOUND` | No provider found for the channel |
| `CRS-010` | 422 | `PROVIDER_NOT_ACTIVE` | The selected provider is not active |
| `CRS-011` | 502 | `FALLBACK_FAILED` | Fallback delivery also failed |
| `CRS-012` | 500 | `DLQ_PUBLISH_FAILED` | Failed to publish message to dead letter queue |
| `CRS-013` | 503 | `HEALTH_CHECK_FAILED` | Adapter health check failed |
| `CRS-014` | 500 | `DATABASE_ERROR` | A database operation failed |
| `CRS-015` | 500 | `INTERNAL_SERVER_ERROR` | An unexpected error occurred |
| `CRS-016` | 400 | `INVALID_UUID` | The provided ID is not a valid UUID |
| `CRS-017` | 400 | `INVALID_QUERY_PARAMS` | One or more query parameters are invalid |
| `CRS-018` | 500 | `RABBITMQ_PUBLISH_FAILED` | Failed to publish message to RabbitMQ |
| `CRS-019` | 500 | `CONSUMER_PROCESSING_FAILED` | Consumer failed to process message |
| `CRS-020` | 409 | `DUPLICATE_PROVIDER` | A provider with this adapter URL already exists |
| `CRS-021` | 422 | `MEDIA_TOO_LARGE` | Media attachment exceeds maximum file size |
| `CRS-022` | 422 | `MEDIA_TOTAL_TOO_LARGE` | Total media size exceeds maximum allowed |
| `CRS-023` | 502 | `ADAPTER_SEND_FAILED` | Adapter service returned an error for the send request |
| `CRS-024` | 409 | `CHANNEL_CONFIG_CONFLICT` | A configuration with this key already exists for the channel |

All error responses follow the schema: `{ code, details, message, status }`.

---

## 10. Observability

### Prometheus Metrics (`GET /metrics`)

The service exposes 13 custom metrics (7 counters, 4 histograms, 2 gauges):

| Metric | Type | Labels | Description |
|---|---|---|---|
| `crs_deliveries_total` | Counter | `channel`, `status` | Total delivery attempts |
| `crs_retries_total` | Counter | `channel` | Total retry attempts |
| `crs_dlq_total` | Counter | `channel` | Total messages sent to DLQ |
| `crs_fallbacks_total` | Counter | `channel` | Total fallback dispatches |
| `crs_circuit_breaker_trips_total` | Counter | `providerId` | Total CB trips |
| `crs_rate_limit_hits_total` | Counter | `providerId` | Total rate limit rejections |
| `crs_media_errors_total` | Counter | `channel` | Total media processing errors |
| `crs_delivery_duration_ms` | Histogram | `channel` | Delivery pipeline duration (ms) |
| `crs_adapter_send_duration_ms` | Histogram | `channel` | Adapter HTTP call duration (ms) |
| `crs_media_download_duration_ms` | Histogram | — | Media download duration (ms) |
| `crs_rate_limit_wait_ms` | Histogram | `providerId` | Rate limit wait duration (ms) |
| `crs_circuit_breaker_state` | Gauge | `providerId` | CB state (0=closed, 1=open, 2=half-open) |
| `crs_active_providers` | Gauge | `channel` | Active registered providers per channel |

Default Node.js process metrics are also collected.
