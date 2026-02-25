# Event Ingestion Service — Development Changelog

> **Info:** This changelog tracks **code changes only**.
> Design changes are tracked in the root `docs/06-changelog.md`.

## [Unreleased]

### Bugfix: LoggingInterceptor crash on non-HTTP contexts (2026-02-24)

- Added guard in `LoggingInterceptor.intercept()`: when `context.getType() !== 'http'`, returns `next.handle()` immediately (skips logging). Fixes crash when RabbitMQ consumers pass through the interceptor pipeline (no `request`/`response` objects available).
- Fixed `WebhookController` unit tests: removed stale `mockRequest` parameter from `receiveEvent()` calls — the `@Req()` decorator was removed in a previous refactor but tests still passed 4 arguments instead of 3, and the `processWebhookEvent` assertion now expects `null` (not `mockEventSource`) for the second argument.
- Added `getType: () => 'http'` to existing mock context in `logging.interceptor.spec.ts`.
- Added 1 new test: non-HTTP context (`rpc`) passes through without logging.
- **269 tests passing, 33 suites** (was 264 passing + 4 failing).

### Bugfix: RabbitMQ DLQ Exchange Type Mismatch (2026-02-23)

- Fixed `xch.notifications.dlq` exchange type in `rabbitmq/rabbitmq.module.ts` from `topic` to `fanout`, matching the authoritative RabbitMQ topology in `rabbitmq/definitions.json`
- The mismatch caused a `PRECONDITION_FAILED` error on startup (`inequivalent arg 'type' for exchange 'xch.notifications.dlq': received 'topic' but current is 'fanout'`), preventing the service from bootstrapping when the exchange already existed in RabbitMQ

### Fix Gaps 1–3: Metadata Fields, Atomic Deduplication, Key Rename (2026-02-23)

**Gap 1 — Missing metadata fields**
- Added `sourceEventId`, `receivedAt`, and `normalizedAt` fields to the normalized event `metadata` object in `EventProcessingService.processEvent()`
- `receivedAt` captured at pipeline entry, `normalizedAt` captured after timestamp normalization

**Gap 2 — Atomic deduplication via ON CONFLICT**
- Rewrote `EventsRepository.createEvent()` to use `INSERT ... ON CONFLICT (source_id, source_event_id) WHERE source_event_id IS NOT NULL DO NOTHING RETURNING *` for atomic dedup when `sourceEventId` is present
- Exported `CreateEventResult` interface (`{ event: Event | null; isDuplicate: boolean }`)
- Updated `EventsService.createEvent()` return type to `Promise<CreateEventResult>`
- Updated `EventProcessingService` to handle `CreateEventResult`: on duplicate, increments metric, logs, and returns `{ status: 'duplicate' }` without publishing

**Gap 3 — Metadata key rename**
- Renamed `_meta` to `metadata` in `EventProcessingService.processEvent()` and `EventMappingsService.testMapping()`

**Tests**
- Updated mock return shapes for `createEvent` across 3 test locations in `event-processing.service.spec.ts`
- Updated `_meta` references to `metadata` in `event-mappings.service.spec.ts` and `event-mappings.controller.spec.ts`
- Updated `events.service.spec.ts` to match new `CreateEventResult` shape
- Added 4 new tests: metadata fields present, sourceEventId null, metadata key name, ON CONFLICT duplicate at persistence

### Step 1: Foundation, Configuration & Data Layer (2026-02-23)

**Phase 0 — Dependencies**
- Installed `@nestjs/config`, `@nestjs/typeorm`, `typeorm`, `pg`, `class-validator`, `class-transformer`, `nestjs-pino`, `pino`, `pino-http`, `pino-pretty`, `@nestjs/terminus`, `@nestjs/mapped-types`
- Installed `@types/pg` (dev dependency)
- Added Jest `moduleNameMapper` to resolve `.js` extensions for `nodenext` module resolution

**Phase 1 — Database Scripts**
- Moved table/index/function DDL from `schema-event-ingestion-service.sql` to `event-ingestion-service-dbscripts.sql`
- Schema file now contains only schema, role, user, and grants (lines 1–35)

**Phase 2 — Common Module**
- Created `common/interfaces/error-response.interface.ts` — standardized error shape
- Created `common/errors.ts` — error registry with 12 EIS-prefixed codes and `createErrorResponse()` helper
- Created `common/filters/http-exception.filter.ts` — global `@Catch(HttpException)` filter mapping to standardized error JSON
- Created `common/pipes/dto-validation.pipe.ts` — extends `ValidationPipe` with EIS-001 error wrapping, whitelist, forbidNonWhitelisted, transform
- Created `common/interceptors/logging.interceptor.ts` — request/response logging with severity-based levels (info/warn/error)
- Created `common/base/pg-base.repository.ts` — abstract base repository with `findById()` and `findWithPagination()` (composition pattern)
- Created `common/common.module.ts` — `@Global()` module

**Phase 3 — Configuration**
- Created `config/app.config.ts` — port, nodeEnv (registerAs)
- Created `config/database.config.ts` — PostgreSQL connection params (registerAs)
- Created `config/rabbitmq.config.ts` — RabbitMQ connection params stub (registerAs)
- Created `config/env.validation.ts` — class-validator environment variable validation with fail-fast startup
- Created `config/config.module.ts` — `ConfigModule.forRoot` with all config loaders and validation

**Phase 4 — TypeORM Entities**
- Created `event-mappings/entities/event-mapping.entity.ts` — 18 columns, UUID PK, JSONB fields, snake_case column mapping
- Created `event-sources/entities/event-source.entity.ts` — 10 columns, SERIAL PK
- Created `events/entities/event.entity.ts` — 12 columns, BIGSERIAL PK (typed as `string`), UUID eventId

**Phase 5 — Repositories**
- Created `event-mappings/event-mappings.repository.ts` — extends `PgBaseRepository`, adds `findBySourceAndType()`, `existsActiveMapping()`, `save()`, `create()`
- Created `event-sources/event-sources.repository.ts` — base methods only
- Created `events/events.repository.ts` — base methods only

**Phase 6 — Event Mappings CRUD**
- Created `dto/create-event-mapping.dto.ts` — class-validator decorators for required/optional fields
- Created `dto/update-event-mapping.dto.ts` — `PartialType(OmitType(Create))`, adds updatedBy
- Created `dto/list-event-mappings-query.dto.ts` — pagination (page/limit) and filter params
- Created `event-mappings.service.ts` — findAll, findById, create (with conflict check), update (with version increment), softDelete
- Created `event-mappings.controller.ts` — 5 REST endpoints under `api/v1/event-mappings`, thin delegation to service
- Created `event-mappings.module.ts` — TypeORM feature import, exports service + repository

**Phase 7 — Health Check**
- Created `health/health.controller.ts` — `@nestjs/terminus` with TypeORM DB ping check at `GET /health`
- Created `health/health.module.ts`

**Phase 8 — Root Module & Bootstrap**
- Rewrote `app.module.ts` — imports ConfigModule, LoggerModule (pino), TypeOrmModule (async, `synchronize: false`), CommonModule, EventMappingsModule, HealthModule
- Rewrote `main.ts` — Pino logger takeover, global pipes/filters/interceptors, CORS, port from config (default 3151)

**Phase 9 — Scaffold Cleanup**
- Deleted `app.controller.ts`, `app.service.ts`, `app.controller.spec.ts`
- Updated `test/app.e2e-spec.ts` to test `GET /health` instead of removed root handler

**Phase 10 — Unit Tests (34 tests, 6 suites)**
- `http-exception.filter.spec.ts` — ErrorResponse passthrough, class-validator transform, string wrap, stack in dev/prod
- `dto-validation.pipe.spec.ts` — valid pass, missing required fields, reject non-whitelisted with EIS-001
- `logging.interceptor.spec.ts` — success=info, 4xx=warn, 5xx=error, includes method/URL/duration
- `event-mappings.controller.spec.ts` — all 5 endpoints delegate correctly
- `event-mappings.service.spec.ts` — findAll pagination/filters, findById found/not-found, create with conflict, update with version increment, softDelete
- `health.controller.spec.ts` — DB up=ok, DB down=error

**ESLint Configuration**
- Updated `eslint.config.mjs` — added warn-level rules for `no-unsafe-*` in production code; disabled `no-unsafe-*`, `unbound-method`, `require-await` in test files

### Step 2: Mapping Engine, Webhook Pipeline & Event Query (2026-02-23)

**Phase 1 — Utilities**
- Created `common/utils/dot-path.util.ts` — dot-path value extraction (`extractValue`, `extractValues`) for nested property resolution with array index support
- Created `common/utils/timestamp.util.ts` — timestamp normalization (`normalizeTimestamp`) supporting iso8601, epoch_ms, epoch_s, and custom dayjs format strings
- Added 5 new error codes (EIS-013 through EIS-017) to `common/errors.ts`: UNAUTHORIZED, MAPPING_NOT_FOUND, EVENT_NOT_FOUND, NORMALIZATION_FAILED, RATE_LIMIT_EXCEEDED
- Added `dedupWindowHours` to `config/app.config.ts` and `DEDUP_WINDOW_HOURS` env variable to `config/env.validation.ts`

**Phase 2 — Normalization Module**
- Created `normalization/transforms/transform-registry.ts` — 13 transforms (direct, concatenate, map, prefix, suffix, template, dateFormat, epochToIso, toNumber, toString, arrayMap, jsonPath, static) with `TransformFunction` interface
- Created `normalization/mapping-engine.service.ts` — core `normalizePayload()` method processing field mappings with source extraction, default values, transforms, and required field checking
- Created `normalization/event-type-resolver.service.ts` — event type resolution with exact match → wildcard → passthrough priority
- Created `normalization/payload-validator.service.ts` — ajv JSON Schema draft-07 validation
- Created `normalization/normalization.module.ts` — exports all three normalization services

**Phase 3 — Events Module**
- Extended `events/events.repository.ts` — added `createEvent()`, `findByEventId()`, `findDuplicate()` (query builder with time window), `save()`
- Created `events/events.service.ts` — `findByEventId` (EIS-015), `findAll` (pagination + filters), `createEvent`, `updateStatus`
- Created `events/events.controller.ts` — `GET /events/:eventId`, `GET /events` (paginated list with sourceId, eventType, status, date range filters)
- Created `events/dto/list-events-query.dto.ts` — pagination + filter DTO
- Created `events/events.module.ts` — TypeORM feature, exports service + repository

**Phase 4 — Event Sources Module**
- Extended `event-sources/event-sources.repository.ts` — added `findByName()` for source lookup by name
- Created `event-sources/event-sources.module.ts` — TypeORM feature, exports repository

**Phase 5 — Source Authentication**
- Created `webhook/services/source-auth.service.ts` — authenticates sources via API key (SHA-256 hash comparison), Bearer token, or HMAC signature; timing-safe comparison
- Created `webhook/guards/source-auth.guard.ts` — NestJS `CanActivate` guard extracting sourceId from body, calling auth service, attaching `EventSource` to request

**Phase 6 — Deduplication Service**
- Created `webhook/services/deduplication.service.ts` — `checkDuplicate()` with configurable time window (default 24h via `DEDUP_WINDOW_HOURS`), skips when sourceEventId is null/empty

**Phase 7 — Webhook Pipeline**
- Created `webhook/dto/webhook-event.dto.ts` — request body DTO (sourceId, cycleId, eventType, sourceEventId, timestamp, payload)
- Created `webhook/webhook.service.ts` — 10-step pipeline orchestrator: mapping lookup (exact + wildcard fallback), validation, deduplication, normalization, event type resolution, timestamp normalization, metadata enrichment, persistence, publish placeholder
- Created `webhook/webhook.controller.ts` — `POST /webhooks/events` with `@UseGuards(SourceAuthGuard)`, dynamic HTTP status (202 new / 200 duplicate), correlationId from `X-Request-ID` header
- Created `webhook/webhook.module.ts` — imports EventMappingsModule, EventsModule, EventSourcesModule, NormalizationModule

**Phase 8 — Test Mapping Endpoint**
- Created `event-mappings/dto/test-mapping.dto.ts` — samplePayload, optional cycleId/eventType
- Added `testMapping()` method to `event-mappings.service.ts` — runs validation (as warnings), normalization, event type resolution; returns canonical event without persisting
- Added `POST :id/test` endpoint to `event-mappings.controller.ts` with `@HttpCode(200)`
- Added `NormalizationModule` import to `event-mappings.module.ts`

**Phase 9 — App Module Wiring**
- Updated `app.module.ts` — added imports for EventsModule, EventSourcesModule, NormalizationModule, WebhookModule

**Phase 10 — Dependencies & Project Updates**
- Installed `ajv` (JSON Schema validation), `dayjs` (date parsing/formatting), `jsonpath-plus` (JSONPath evaluation)
- Updated `endpoints/endpoints-event-ingestion-service.md` — marked 4 endpoints as Done
- 149 unit tests passing (34 existing + 115 new), 20 test suites

### Step 3: RabbitMQ Integration (2026-02-23)

**Phase 1 — Dependencies & Configuration**
- Installed `@golevelup/nestjs-rabbitmq` (NestJS-idiomatic RabbitMQ integration with decorators, DI, exchange assertions, reconnection)
- Installed `@types/amqplib` (dev dependency)
- Added 5 new config fields to `config/rabbitmq.config.ts`: `prefetch`, `dlqMaxRetries`, `retryInitialDelayMs`, `retryBackoffMultiplier`, `retryMaxDelayMs`
- Added 5 new env var validators to `config/env.validation.ts`: `RABBITMQ_PREFETCH`, `DLQ_MAX_RETRIES`, `RETRY_INITIAL_DELAY_MS`, `RETRY_BACKOFF_MULTIPLIER`, `RETRY_MAX_DELAY_MS`

**Phase 2 — RabbitMQ Constants & Interfaces**
- Created `rabbitmq/rabbitmq.constants.ts` — exchange/queue name constants, `incomingRoutingKey()`, `normalizedRoutingKey()`, `parseIncomingRoutingKey()` builders/parsers
- Created `rabbitmq/interfaces/rabbitmq-event-message.interface.ts` — `RabbitMqEventMessage` (inbound) and `NormalizedEventMessage` (outbound) message type definitions

**Phase 3 — Error Codes**
- Added 3 new error codes to `common/errors.ts`: EIS-018 (RABBITMQ_PUBLISH_FAILED), EIS-019 (CONSUMER_PROCESSING_FAILED), EIS-020 (INVALID_ROUTING_KEY)

**Phase 4 — RabbitMQ Module & Publisher**
- Created `rabbitmq/rabbitmq.module.ts` (`AppRabbitMQModule`) — wraps `RabbitMQModule.forRootAsync()` with ConfigService, builds AMQP URI, asserts 4 exchanges (xch.events.incoming, xch.events.normalized, xch.notifications.dlq, xch.config.events), connection init/reconnection options, controller discovery
- Created `rabbitmq/event-publisher.service.ts` (`EventPublisherService`) — `publishNormalized()` publishes `NormalizedEventMessage` to `xch.events.normalized` with persistent delivery, custom headers (`x-source-id`, `x-event-type`, `x-priority`), throws EIS-018 on failure

**Phase 5 — Event Processing Service (Shared Pipeline)**
- Created `consumers/event-processing.service.ts` (`EventProcessingService`) — extracted shared 10-step pipeline from WebhookService: source lookup → mapping lookup (exact + wildcard fallback) → validation → deduplication → normalization → timestamp normalization → metadata enrichment → persistence → publish via EventPublisherService → status update (published/failed)
- Interfaces: `EventProcessingInput`, `EventProcessingResult`

**Phase 6 — Refactor WebhookService**
- Refactored `webhook/webhook.service.ts` — now a thin adapter that constructs `EventProcessingInput` from `WebhookEventDto` and delegates to `EventProcessingService.processEvent()`
- Updated `webhook/webhook.module.ts` — imports `ConsumersModule` and `EventSourcesModule`, removed direct imports of EventMappingsModule, EventsModule, NormalizationModule, and DeduplicationService provider (now transitively available)

**Phase 7 — Consumer Module & Handlers**
- Created `consumers/consumers.module.ts` (`ConsumersModule`) — imports AppRabbitMQModule, EventMappingsModule, EventsModule, EventSourcesModule, NormalizationModule; provides EventProcessingService, DeduplicationService, and all 3 consumers; exports EventProcessingService
- Created `consumers/base-event.consumer.ts` (`BaseEventConsumer`) — abstract base class with `handleMessage()` (routing key parsing, processEvent delegation), `retryOrDlq()` (republish-with-header retry pattern, exponential backoff, max retry DLQ), `isRetryable()` (non-retryable: EIS-003/005/008/014/016/020), `calculateDelay()` (min of initialDelay × multiplier^retryCount, maxDelay)
- Created `consumers/amqp-event.consumer.ts` — `@RabbitSubscribe` on `q.events.amqp` (routing key `source.*.#`, DLX to `xch.notifications.dlq`)
- Created `consumers/webhook-event.consumer.ts` — `@RabbitSubscribe` on `q.events.webhook` (routing key `source.webhook.#`)
- Created `consumers/email-ingest-event.consumer.ts` — `@RabbitSubscribe` on `q.events.email-ingest` (routing key `source.email-ingest.#`)

**Phase 8 — Health Check Updates**
- Created `health/rabbitmq.health-indicator.ts` (`RabbitMQHealthIndicator`) — extends `HealthIndicator`, checks `AmqpConnection.connected`, fetches queue depths via RabbitMQ Management API (non-critical, logs warning on failure)
- Updated `health/health.controller.ts` — injected `RabbitMQHealthIndicator`, added to health check array
- Updated `health/health.module.ts` — imported `AppRabbitMQModule`, added `RabbitMQHealthIndicator` provider

**Phase 9 — App Module Wiring**
- Updated `app.module.ts` — added `AppRabbitMQModule` and `ConsumersModule` imports

**Phase 10 — Unit Tests (200 total, 27 suites)**
- Created `rabbitmq/rabbitmq.constants.spec.ts` (6 tests) — routing key build/parse, multi-segment event types, invalid format
- Created `rabbitmq/event-publisher.service.spec.ts` (6 tests) — correct exchange/routing key, persistent mode, headers, EIS-018 on failure
- Created `consumers/event-processing.service.spec.ts` (12 tests) — full pipeline, each error path, dedup, publish success/failure, wildcard fallback
- Created `consumers/amqp-event.consumer.spec.ts` (8 tests) — ACK on success, retry with republish, DLQ on max retries, non-retryable → DLQ
- Created `consumers/webhook-event.consumer.spec.ts` (5 tests) — same patterns
- Created `consumers/email-ingest-event.consumer.spec.ts` (5 tests) — same patterns
- Created `health/rabbitmq.health-indicator.spec.ts` (5 tests) — connected/disconnected, queue depths, Management API failure
- Rewrote `webhook/webhook.service.spec.ts` (3 tests) — adapter delegation, input construction, error propagation
- Updated `health/health.controller.spec.ts` (+1 test) — RabbitMQ indicator in check array

### Step 4: Mapping Cache, Rate Limiting & Observability (2026-02-23)

**Phase 1 — Foundation**
- Added `prom-client` ^15.x dependency for Prometheus metrics
- Added `mappingCacheEnabled` and `webhookRateLimit` to `config/app.config.ts`
- Added `MAPPING_CACHE_ENABLED` (string) and `WEBHOOK_RATE_LIMIT` (number) env vars to `config/env.validation.ts`
- Added `QUEUE_CONFIG_MAPPING_CACHE` constant to `rabbitmq/rabbitmq.constants.ts`
- Added EIS-021 (503, CACHE_NOT_READY) error code to `common/errors.ts`
- Added `findAllActive()` method to `event-mappings/event-mappings.repository.ts`

**Phase 2 — Metrics Module (new, @Global)**
- Created `metrics/metrics.module.ts` — `@Global()` module providing and exporting MetricsService
- Created `metrics/metrics.service.ts` — wraps prom-client with 13 metrics: 7 counters (received, published, failed, duplicate, validation errors, mapping not found, cache invalidations), 1 histogram (processing duration with 8 buckets), 5 gauges (queue depth, consumer lag, DLQ depth, pool active, cache hit rate). Typed helper methods. Registers `collectDefaultMetrics()` on init.
- Created `metrics/metrics.controller.ts` — `GET /metrics` returns `registry.metrics()` with Prometheus content type
- Created `metrics/metrics.service.spec.ts` (10 tests) — registration, counter increments with labels, histogram observe, default metrics
- Created `metrics/metrics.controller.spec.ts` (2 tests) — Prometheus format response, correct content-type and status

**Phase 3 — Mapping Cache Module (new)**
- Created `mapping-cache/interfaces/mapping-cache-message.interface.ts` — `MappingCacheInvalidationMessage` class (id, version)
- Created `mapping-cache/mapping-cache.service.ts` — in-memory Map cache keyed by `sourceId:eventType`. Implements `OnModuleInit`: warm-up from DB when enabled, transparent fallback to direct DB when disabled. Single-flight fetch pattern (deduplicates concurrent DB queries for same key). `getMapping()` → exact key → wildcard key → single-flight fetch. `invalidateMapping()` with version-aware updates. `getCacheStats()` for observability.
- Created `mapping-cache/mapping-cache.consumer.ts` — `@RabbitSubscribe` on `q.config.mapping-cache` / `xch.config.events` / `config.mapping.changed`. Delegates to `MappingCacheService.invalidateMapping()`, increments cache invalidation metric.
- Created `mapping-cache/mapping-cache.module.ts` — imports EventMappingsModule, AppRabbitMQModule; provides + exports MappingCacheService
- Created `mapping-cache/mapping-cache.service.spec.ts` (18 tests) — disabled mode (direct DB, wildcard fallback, null return), enabled mode (warm-up, EIS-021 when not ready, cache hits, cache miss with DB fetch, single-flight deduplication), invalidation (version check, inactive removal, deleted removal), getCacheStats
- Created `mapping-cache/mapping-cache.consumer.spec.ts` (4 tests) — delegation, metric increment, error handling

**Phase 4 — Rate Limiter Module (new)**
- Created `rate-limiter/rate-limiter.service.ts` — sliding-window rate limiter using `Map<string, number[]>` of timestamps. `checkGlobalWebhookLimit()` uses configurable limit from `WEBHOOK_RATE_LIMIT`. `checkSourceLimit(sourceId, maxRps)` for per-source limits. Internal `isAllowed()` prunes expired entries (>1s old).
- Created `rate-limiter/guards/webhook-rate-limit.guard.ts` — `CanActivate` guard calling global webhook limit check, sets `Retry-After: 1` header and throws EIS-017 on rejection.
- Created `rate-limiter/rate-limiter.module.ts` — provides + exports RateLimiterService and WebhookRateLimitGuard
- Created `rate-limiter/rate-limiter.service.spec.ts` (10 tests) — global limit allow/reject, window sliding, per-source limit, independent counters, boundary behavior
- Created `rate-limiter/guards/webhook-rate-limit.guard.spec.ts` (4 tests) — allow, reject with EIS-017, Retry-After header

**Phase 5 — Integration**
- Rewrote `consumers/event-processing.service.ts` — replaced `EventMappingsRepository` with `MappingCacheService.getMapping()`, added `MetricsService` and `RateLimiterService` injections. Added: `incrementReceived()` at entry with timer, per-source rate limit check (EIS-017 when exceeded), `incrementMappingNotFound()` on no mapping, `incrementValidationError()` on validation failure, `incrementDuplicate()` on dedup hit, `incrementPublished()` + `observeProcessingDuration()` on success, `incrementFailed()` on 5xx errors.
- Updated `consumers/consumers.module.ts` — added MappingCacheModule and RateLimiterModule imports
- Updated `webhook/webhook.controller.ts` — added `WebhookRateLimitGuard` to `@UseGuards(SourceAuthGuard, WebhookRateLimitGuard)` chain (auth first)
- Updated `webhook/webhook.module.ts` — added RateLimiterModule import, WebhookRateLimitGuard provider
- Updated `consumers/event-processing.service.spec.ts` — replaced EventMappingsRepository mock with MappingCacheService mock, added MetricsService and RateLimiterService mocks, added 6 new tests (mapping not found metric, validation error metric, duplicate metric, received/published metrics, per-source rate limiting)
- Updated `webhook/webhook.controller.spec.ts` — added WebhookRateLimitGuard override

**Phase 6 — Config Change Publishing**
- Updated `event-mappings/event-mappings.service.ts` — injected `AmqpConnection`, added `publishMappingChanged()` private method that publishes `{ id, version }` to `xch.config.events` with routing key `config.mapping.changed` after `create()`, `update()`, and `softDelete()` mutations. Publish failures are logged as warnings (non-blocking).
- Updated `event-mappings/event-mappings.module.ts` — added AppRabbitMQModule import
- Updated `event-mappings/event-mappings.service.spec.ts` — added AmqpConnection mock, added 4 tests (publish after create/update/softDelete, non-blocking on publish failure)

**Phase 7 — Enhanced Structured Logging**
- Updated `common/interceptors/logging.interceptor.ts` — injected `PinoLogger` from nestjs-pino (replacing `new Logger()`). Extracts `correlationId` from `x-request-id` header and `sourceId` from request body. Uses Pino object-first logging: `logger.info({ method, url, statusCode, durationMs, correlationId, sourceId }, message)`.
- Updated `common/common.module.ts` — added LoggingInterceptor as provider and export
- Updated `main.ts` — DI-resolved LoggingInterceptor via `app.get()` instead of `new LoggingInterceptor()`
- Updated `common/interceptors/logging.interceptor.spec.ts` (8 tests) — rewritten for PinoLogger mock, tests structured log context with correlationId, sourceId, durationMs

**Phase 8 — App Module & Documentation**
- Updated `app.module.ts` — added MetricsModule (before feature modules, @Global), MappingCacheModule, RateLimiterModule imports
- Updated `endpoints/endpoints-event-ingestion-service.md` — added `GET /metrics` row (status: Done)

**Test Summary — 264 tests passing, 33 suites**
- New suites: metrics.service (10), metrics.controller (2), mapping-cache.service (18), mapping-cache.consumer (4), rate-limiter.service (10), webhook-rate-limit.guard (4)
- Modified suites: event-processing.service (+6 new, ~10 mock changes), event-mappings.service (+4 new), webhook.controller (+guard override), logging.interceptor (rewritten for PinoLogger)
