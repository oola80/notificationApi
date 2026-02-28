# Channel Router Service — Development Changelog

> **Info:** This changelog tracks **code changes only**.
> Design changes are tracked in the root `docs/06-changelog.md`.

## [Unreleased]

### Bugfix: Adapter send request contract mismatch (2026-02-27)

- Added private `toAdapterPayload()` method in `AdapterClientService` to transform the internal CRS `SendRequest` into the format expected by the provider adapter `SendRequestDto`
- Transforms: `notificationId` and `priority` moved from root to `metadata` object, `recipient.email`/`phone`/`deviceToken` resolved to `recipient.address`, `media` array moved from root into `content.media` with `mimeType` → `contentType` rename
- Without this transform, the adapter's `DtoValidationPipe` rejected the request with HTTP 400 (`property notificationId should not exist`)

### 2026-02-26 — Phase 4: RabbitMQ, Consumers, Delivery Pipeline, Fallback, Audit Publishing, Adapter Health Monitoring

**RabbitMQ module (`src/rabbitmq/`):**
- `AppRabbitMQModule` — `@golevelup/nestjs-rabbitmq` forRootAsync (3 exchanges, named channels, heartbeat, reconnect)
- `RabbitMQPublisherService` — Fire-and-forget publishing (5 methods):
  - `publishDeliveryStatus()` — Notification status updates → `xch.notifications.status`
  - `publishDeliveryAttempt()` — Per-attempt audit events → `xch.notifications.status`
  - `publishToDlq()` — Dead-letter messages → `xch.notifications.dlq`
  - `publishFallbackDispatch()` — Fallback channel dispatch → `xch.notifications.deliver`
  - `republishForRetry()` — Delayed retry republish with headers (async)
- `rabbitmq.constants.ts` — 3 exchange constants, 8 queue constants, 3 routing key builders
- `publisher.interfaces.ts` — DeliveryStatusMessage, DeliveryAttemptMessage

**Dispatch interfaces (`src/delivery/interfaces/`):**
- `DispatchMessage` — Inbound dispatch message from NES (notificationId, channel, priority, recipient, content, media, metadata, attemptNumber, isFallback)
- `PipelineResult` — Pipeline execution result (success, provider info, attempt, duration, retry/fallback flags)

**Delivery Pipeline (`src/delivery/delivery-pipeline.service.ts`):**
- `DeliveryPipelineService` — 7-step delivery orchestrator:
  1. Parse & validate required fields
  2. Resolve adapter (primary/weighted/failover routing modes, cache with DB fallback)
  3. Check circuit breaker (OPEN → retry/fallback)
  4. Rate limit with 5s timeout (timeout → retry/fallback)
  5. Process media (graceful degradation on failure)
  6. Send to adapter via AdapterClientService
  7. Handle result (success → SENT status; retryable → delayed republish; non-retryable → FAILED, no CB trip; terminal → fallback → DLQ)
- Maps DispatchMessage → SendRequest for adapter HTTP call
- Persists DeliveryAttempt to DB (fire-and-forget)
- Full Prometheus metrics instrumentation (delivery, adapter call, rate limit, retry, DLQ)

**Fallback module (`src/fallback/`):**
- `FallbackService` — Single-level fallback chain
  - `triggerFallback()` — No cascading (isFallback guard), lookup fallback channel, publish dispatch
  - Receives RabbitMQPublisherService as method param (avoids circular deps)

**Consumers module (`src/consumers/`):**
- `BaseDeliveryConsumer` — Abstract base: delegates to pipeline, void (ACK) on success, Nack(false) on unhandled error
- 8 concrete consumers (4 channels × 2 priorities):
  - EmailCritical, EmailNormal (prefetch: critical=5, normal=10)
  - SmsCritical, SmsNormal
  - WhatsappCritical, WhatsappNormal
  - PushCritical, PushNormal
  - All bind to `xch.notifications.deliver` with `createQueueIfNotExists: false` and DLQ argument

**Health Monitor module (`src/health-monitor/`):**
- `AdapterHealthMonitorService` — Periodic adapter health checks
  - Runs on interval (configurable via ADAPTER_HEALTH_CHECK_INTERVAL_MS, default 30s)
  - Initial check after 5s delay; deduplicates providers across channels
  - Records CB success/failure based on health response
  - Updates provider lastHealthCheck in DB (fire-and-forget)
  - `getHealthStatus()` — Returns Map of per-provider health status

**Health controller updates:**
- Enhanced `GET /ready` with adapter health check: total/healthy/unhealthy counts, per-provider status
- Readiness requires DB + RabbitMQ + at least one healthy adapter (or no adapters registered)

**Module wiring:**
- Updated `app.module.ts`: added FallbackModule, AppRabbitMQModule, HealthMonitorModule, ConsumersModule
- Updated `delivery.module.ts`: added 9 module imports + DeliveryPipelineService provider/export
- Updated `health.module.ts`: imports HealthMonitorModule
- Updated `health.controller.ts`: injected AdapterHealthMonitorService

**Tests:**
- 432 unit tests across 46 suites (all passing, +118 tests, +14 suites vs Phase 3)
- New test suites: rabbitmq.constants (5), RabbitMQPublisherService (12), DeliveryPipelineService (30), FallbackService (8), BaseDeliveryConsumer (5), 8 × consumer handlers (24), AdapterHealthMonitorService (10), HealthController updated (4 new adapter tests)

### 2026-02-26 — Phase 3: Circuit Breaker, Rate Limiter, Retry Engine, Media Processor

**Circuit Breaker module (`src/circuit-breaker/`):**
- `CircuitBreakerService` — Per-provider circuit breaker state machine (CLOSED → OPEN → HALF_OPEN → CLOSED)
  - `getState()` — Returns current state with auto-transition from OPEN → HALF_OPEN after cooldown
  - `canExecute()` — Returns true if CLOSED or HALF_OPEN (under max attempts)
  - `recordSuccess()` — Transition HALF_OPEN → CLOSED after success threshold; resets failure count in CLOSED
  - `recordFailure()` — Counts failures within sliding window; trips CLOSED → OPEN at threshold; any failure in HALF_OPEN → OPEN
  - `recordHealthCheckFailure()` — Delegates to recordFailure (preemptive circuit opening)
  - `reset()` — Manual reset to CLOSED (admin use)
  - `getAll()` — Returns all breaker snapshots (monitoring)
  - DB persistence: loads state from provider_configs on startup, persists on every transition
  - Prometheus metrics: circuit_breaker_state gauge, circuit_breaker_trips_total counter
- Configuration via env vars: CB_FAILURE_THRESHOLD, CB_FAILURE_WINDOW_MS, CB_COOLDOWN_MS, CB_HALF_OPEN_MAX_ATTEMPTS, CB_SUCCESS_THRESHOLD

**Rate Limiter module (`src/rate-limiter/`):**
- `RateLimiterService` — Per-provider token bucket rate limiter
  - `initBucket()` — Create/update bucket with tokensPerSec and maxBurst
  - `acquire()` — Acquire 1 token with optional timeout; waits for refill if empty
  - `getStatus()` — Returns available tokens, capacity, refill rate
  - Token refill based on elapsed time, capped at capacity
  - Prometheus metrics: rate_limit_wait_ms histogram per acquire call

**Retry Engine module (`src/retry/`):**
- `RetryService` — Per-channel exponential backoff with jitter
  - `getRetryPolicy()` — Returns max retries and base delay per channel
  - `calculateDelay()` — Exponential backoff (baseDelay * multiplier^attempt) + random jitter (0 to delay * factor)
  - `shouldRetry()` — Determines if retry is appropriate: checks retryable flag, max retries, calculates delay
  - Channel policies: email (5), SMS (3), WhatsApp (4), push (4)
  - Configuration via env vars: RETRY_*_MAX, RETRY_BACKOFF_MULTIPLIER, RETRY_JITTER_FACTOR
  - Prometheus metrics: retry_total counter per retry triggered

**Media Processor module (`src/media/`):**
- `MediaProcessorService` — Channel-specific media processing
  - `processMedia()` — Routes to channel-specific handler
  - Email: skips inline images, downloads attachments → Base64-encode, enforces per-file (10 MB) and total (30 MB) limits
  - SMS: returns empty array (text-only channel)
  - WhatsApp: passes media URLs through, enforces 16 MB per-message limit via HEAD request
  - Push: extracts first inline image URL, ignores attachments, enforces 1 MB limit
  - HTTPS URL validation, Content-Type from response headers, download timeout handling
  - Graceful degradation: on any media failure, proceeds without that attachment
  - Prometheus metrics: media_download_duration_ms histogram, media_failure_total counter

**Module wiring:**
- Updated app.module.ts: added CircuitBreakerModule, RateLimiterModule, RetryModule, MediaModule

**Tests:**
- 314 unit tests across 32 suites (all passing, +115 tests, +4 suites vs Phase 2)
- New test suites: CircuitBreakerService (42 tests), RateLimiterService (21 tests), RetryService (22 tests), MediaProcessorService (30 tests)

### 2026-02-26 — Phase 2: Channel & Provider CRUD, Adapter HTTP Client, Provider Cache

**Channel Configuration module (`src/channels/`):**
- `ChannelsController` — `GET /channels` (list with provider info), `PUT /channels/:id/config` (update routing mode, fallback, active status)
- `ChannelsService` — findAll with joined provider data, updateConfig with validation (provider existence, channel match, self-fallback prevention), seed 4 default channels on startup (email, sms, whatsapp, push)
- `UpdateChannelConfigDto` — routingMode (primary/weighted/failover), activeProviderId, fallbackChannelId, isActive (all optional)
- Added `findAll()` method to ChannelsRepository

**Provider Management module (`src/providers/`):**
- `ProvidersController` — `POST /providers/register`, `DELETE /providers/:id`, `GET /providers`, `PUT /providers/:id/config`, `GET /providers/:id/capabilities`, `GET /providers/:id/health`
- `ProvidersService` — register (validates uniqueness, calls adapter /capabilities + /health, stores config_json), deregister (hard delete + cache invalidation), updateConfig (duplicate URL check), getCapabilities/getHealth (proxy via adapter client), findActiveByChannel (cache-aware)
- `ProviderCacheService` — In-memory cache with TTL-based auto-refresh, invalidate on provider changes, PROVIDER_CACHE_ENABLED toggle, onModuleInit loading
- `RegisterProviderDto` — providerName, providerId, channel, adapterUrl, isActive, routingWeight, rateLimitTokensPerSec, rateLimitMaxBurst
- `UpdateProviderConfigDto` — adapterUrl, routingWeight, rateLimitTokensPerSec, rateLimitMaxBurst, isActive (all optional)
- Added `findAllProviders()` and `remove()` methods to ProviderConfigsRepository

**Adapter HTTP Client module (`src/adapter-client/`):**
- `AdapterClientService` — HTTP client using @nestjs/axios for adapter communication
  - `send()` — POST /send with graceful error handling (retryable/non-retryable classification)
  - `checkHealth()` — GET /health proxy
  - `getCapabilities()` — GET /capabilities proxy
  - Configurable timeout via ADAPTER_HTTP_TIMEOUT_MS
  - Structured logging for all adapter calls (URL, duration, status)
- `adapter-client.interfaces.ts` — SendRequest, SendResult, AdapterHealthResponse, AdapterCapabilitiesResponse

**Module wiring:**
- Updated ChannelsModule: imports ProvidersModule, registers ChannelsService + ChannelsController
- Updated ProvidersModule: imports AdapterClientModule, registers ProvidersService + ProvidersController + ProviderCacheService
- Added @nestjs/axios and axios dependencies

**Tests:**
- 199 unit tests across 28 suites (all passing, +88 tests, +9 suites vs Phase 1)
- New test suites: ChannelsController, ChannelsService, ProvidersController, ProvidersService, AdapterClientService, ProviderCacheService, UpdateChannelConfigDto, RegisterProviderDto, UpdateProviderConfigDto
- E2E test files for channels and providers lifecycle

### 2026-02-26 — Phase 1: Foundation, Data Layer, Health & Metrics

**Project scaffolding:**
- Created NestJS project with package.json (NestJS 11, TypeScript 5.7, Jest 30)
- Added tsconfig.json (ES2023, nodenext modules, decorators enabled), tsconfig.build.json
- Added eslint.config.mjs (flat config, typescript-eslint + prettier), .prettierrc, .gitignore
- Added nest-cli.json (sourceRoot: src, deleteOutDir)

**Configuration module (`src/config/`):**
- `AppConfigModule` with `ConfigModule.forRoot` (isGlobal, env validation)
- `app.config.ts` — 33 config values: port, nodeEnv, provider cache, adapter, circuit breaker, retry, media, consumer prefetch
- `database.config.ts` — PostgreSQL connection params
- `rabbitmq.config.ts` — RabbitMQ connection config
- `env.validation.ts` — class-validator validation for all 33 env vars

**Common module (`src/common/`) — @Global:**
- `errors.ts` — 24 CRS-prefixed error codes with `createErrorResponse()` helper
- `http-exception.filter.ts` — Global `@Catch(HttpException)` with standardized JSON response
- `dto-validation.pipe.ts` — Extends `ValidationPipe`, wraps validation errors as CRS-001
- `logging.interceptor.ts` — Pino structured HTTP logging with correlation ID, severity-based levels
- `pg-base.repository.ts` — Abstract base repository with `findById()` and `findWithPagination()`
- `error-response.interface.ts` — `{ code, details, message, status, stack? }`

**TypeORM entities & repositories:**
- `Channel` entity (8 columns, UUID PK, self-referencing FK for fallback)
- `ChannelConfig` entity (7 columns, UUID PK, FK to channels)
- `ProviderConfig` entity (16 columns, UUID PK, circuit breaker state, rate limits)
- `DeliveryAttempt` entity (12 columns, UUID PK, FK to provider_configs)
- `ChannelsRepository` — findByType, findAllActive
- `ChannelConfigsRepository` — findByChannelId
- `ProviderConfigsRepository` — findActiveByChannel, findByAdapterUrl
- `DeliveryAttemptsRepository` — findByNotificationId, findByProviderMessageId

**Database scripts:**
- Updated `channel-router-service-dbscripts.sql`: 4 tables (channels, channel_configs, provider_configs, delivery_attempts), 8 indexes, CHECK constraints, `set_updated_at()` trigger function, `purge_delivery_attempts()` retention function

**Health module (`src/health/`):**
- `GET /health` — liveness probe (always 200)
- `GET /ready` — readiness probe: PostgreSQL `SELECT 1` + RabbitMQ Management API reachable

**Metrics module (`src/metrics/`) — @Global:**
- 13 custom Prometheus metrics: 7 counters, 4 histograms, 2 gauges
- `GET /metrics` endpoint in Prometheus text format
- Helper methods for all metric operations

**Bootstrap (`src/main.ts`):**
- Pino logger, global DtoValidationPipe, HttpExceptionFilter, LoggingInterceptor, CORS, port 3154

**App module (`src/app.module.ts`):**
- Wires: AppConfigModule, LoggerModule, TypeOrmModule (autoLoadEntities), CommonModule, MetricsModule, ChannelsModule, ProvidersModule, DeliveryModule, HealthModule

**Tests:**
- 111 unit tests across 19 suites (all passing)
- Config validation, error registry, filter, pipe, interceptor, health controller, metrics service/controller, all 4 entities, all 4 repositories
- E2E test file for health + metrics endpoints
