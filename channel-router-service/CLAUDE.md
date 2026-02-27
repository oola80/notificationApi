# Channel Router Service

Routes rendered notifications to delivery providers via external provider adapter microservices; core orchestration (circuit breaker, rate limiting, retry, fallback, media processing); priority-tiered delivery queues per channel; fire-and-forget audit logging.

## Service Info

| Attribute | Value |
|---|---|
| **Port** | 3154 |
| **Technology** | NestJS 11 (TypeScript 5.7) |
| **Runtime** | Node.js (ES2023 target) |
| **DB Schema** | `channel_router_service` |
| **DB Role** | `channel_router_service_user_role` |
| **DB User** | `channel_router_service_user` |

## Implementation Status

**Phase 4 complete** — RabbitMQ, Consumers, Delivery Pipeline, Fallback, Audit Publishing, Adapter Health Monitoring.

- **Phase 4:** RabbitMQ integration via `@golevelup/nestjs-rabbitmq` (3 exchanges, 8 queues, named channels). 8 consumers (4 channels × 2 priorities) with abstract BaseDeliveryConsumer. 7-step DeliveryPipelineService orchestrator (validate → resolve adapter → circuit breaker → rate limit → media → send → handle result). RabbitMQPublisherService (5 fire-and-forget publish methods: status, delivery attempt, DLQ, fallback dispatch, retry republish). FallbackService (single-level, no cascading, publisher as method param to avoid circular deps). AdapterHealthMonitorService (periodic checks, CB integration, per-provider status map). Enhanced GET /ready with adapter health. Weighted/failover/primary provider routing. Graceful media degradation. Delayed retry via setTimeout + republish. Non-retryable errors don't trip circuit breaker. 432 unit tests passing across 46 suites.
- **Phase 1:** NestJS project scaffolding, ConfigModule with Joi env validation (33 env vars), CommonModule (@Global: errors with 24 CRS-prefixed codes, HttpExceptionFilter, DtoValidationPipe, LoggingInterceptor, PgBaseRepository), TypeORM entities & repositories (channels, channel_configs, provider_configs, delivery_attempts), database scripts (4 tables, 8 indexes, purge function, updated_at triggers), HealthModule (GET /health liveness, GET /ready readiness with DB + RabbitMQ Management API checks), MetricsModule (@Global: 13 custom Prometheus metrics at GET /metrics), structured Pino logging. 111 unit tests passing across 19 suites.
- **Phase 2:** Channel configuration CRUD (GET /channels with provider info, PUT /channels/:id/config with validation, auto-seed 4 default channels), provider adapter management (POST /providers/register with capability discovery, DELETE /providers/:id, GET /providers, PUT /providers/:id/config, GET /providers/:id/capabilities proxy, GET /providers/:id/health proxy), adapter HTTP client (@nestjs/axios with configurable timeout, send/health/capabilities methods, graceful error handling), provider config cache (in-memory with TTL auto-refresh, invalidation on changes, PROVIDER_CACHE_ENABLED toggle). 199 unit tests passing across 28 suites.
- **Phase 3:** Circuit breaker per provider (CLOSED/OPEN/HALF_OPEN state machine, failure window, cooldown, success threshold, DB persistence, manual reset, Prometheus metrics), token bucket rate limiter per provider (acquire with wait/timeout, refill over time, bucket reinitialization), retry engine per channel (exponential backoff with jitter, channel-specific max retries, shouldRetry decision), media processor per channel (email: download+Base64, SMS: skip, WhatsApp: URL passthrough, push: first inline image; HTTPS validation, size enforcement, graceful degradation, download timeout). 314 unit tests passing across 32 suites.

## Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@nestjs/common` | ^11.0.1 | NestJS core framework |
| `@nestjs/core` | ^11.0.1 | NestJS core framework |
| `@nestjs/platform-express` | ^11.0.1 | Express HTTP adapter |
| `@nestjs/config` | ^4.0.3 | Configuration management (registerAs, env validation) |
| `@nestjs/typeorm` | ^11.0.0 | TypeORM integration for NestJS |
| `@nestjs/terminus` | ^11.1.1 | Health checks |
| `@nestjs/mapped-types` | ^2.1.0 | DTO utilities (PartialType, OmitType) |
| `@nestjs/axios` | ^1.x | HTTP client module for adapter communication |
| `axios` | ^1.x | HTTP client for adapter service calls |
| `@golevelup/nestjs-rabbitmq` | ^7.1.2 | NestJS-idiomatic RabbitMQ integration |
| `prom-client` | ^15.x | Prometheus metrics (Registry, Counter, Histogram, Gauge) |
| `typeorm` | ^0.3.28 | ORM (PostgreSQL, entities, repositories) |
| `pg` | ^8.18.0 | PostgreSQL driver |
| `class-validator` | ^0.14.3 | DTO validation decorators |
| `class-transformer` | ^0.5.1 | Object transformation (implicit conversion) |
| `nestjs-pino` | ^4.6.0 | Pino logger integration for NestJS |
| `pino` / `pino-http` / `pino-pretty` | latest | Structured JSON logging |
| `rxjs` | ^7.8.1 | Reactive extensions |
| `typescript` | ^5.7.3 | TypeScript compiler |
| `jest` | ^30.0.0 | Unit testing |
| `supertest` | ^7.0.0 | HTTP integration testing |
| `eslint` | ^9.18.0 | Linting (flat config + typescript-eslint + prettier) |
| `prettier` | ^3.4.2 | Code formatting |

## NPM Scripts

| Script | Command | Description |
|---|---|---|
| `start` | `nest start` | Run app |
| `start:dev` | `nest start --watch` | Run with file watcher |
| `start:debug` | `nest start --debug --watch` | Run with debugger |
| `start:prod` | `node dist/main` | Run compiled output |
| `build` | `nest build` | Compile TypeScript |
| `lint` | `eslint "{src,apps,libs,test}/**/*.ts" --fix` | Lint and auto-fix |
| `format` | `prettier --write "src/**/*.ts" "test/**/*.ts"` | Format code |
| `test` | `jest` | Run unit tests |
| `test:watch` | `jest --watch` | Tests in watch mode |
| `test:cov` | `jest --coverage` | Tests with coverage |
| `test:e2e` | `jest --config ./test/jest-e2e.json` | E2E tests |

## Database Tables

- `channels` — Channel definitions (email, sms, whatsapp, push) with routing mode and fallback support
- `channel_configs` — Channel-level key-value settings (sender identity, limits)
- `provider_configs` — Provider adapter service registration, configuration, circuit breaker state, rate limits
- `delivery_attempts` — Record of each delivery attempt per notification (highest-volume table)
- `purge_delivery_attempts()` — PL/pgSQL function to delete attempts older than 6 months

## RabbitMQ

**Publishes to:**
- `xch.notifications.status` — delivery status updates (sent, delivered, failed, delivery-attempt.sent/failed/retrying, webhook.received)

> **Note:** Provider adapter services also publish to `xch.notifications.status` with routing key `adapter.webhook.{providerId}` for webhook-originated status events.

**Consumes from:**
- `q.deliver.email.critical` — `notification.deliver.critical.email` (3 consumers, prefetch 5)
- `q.deliver.email.normal` — `notification.deliver.normal.email` (2 consumers, prefetch 10)
- `q.deliver.sms.critical` — `notification.deliver.critical.sms` (2 consumers, prefetch 5)
- `q.deliver.sms.normal` — `notification.deliver.normal.sms` (1 consumer, prefetch 10)
- `q.deliver.whatsapp.critical` — `notification.deliver.critical.whatsapp` (2 consumers, prefetch 5)
- `q.deliver.whatsapp.normal` — `notification.deliver.normal.whatsapp` (1 consumer, prefetch 10)
- `q.deliver.push.critical` — `notification.deliver.critical.push` (2 consumers, prefetch 5)
- `q.deliver.push.normal` — `notification.deliver.normal.push` (1 consumer, prefetch 10)

**Retry policies:** Email (5 retries, ~42.5 min), SMS (3 retries, ~2.5 min), WhatsApp (4 retries, ~12.5 min), Push (4 retries, ~12.5 min)

## Environment Variables

Configured via `.env` file in the service root (git-ignored). Required for local development:

| Variable | Description | Dev Value |
|---|---|---|
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | HTTP listen port | `3154` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5433` |
| `DB_NAME` | PostgreSQL database name | `postgres` |
| `DB_SCHEMA` | PostgreSQL schema | `channel_router_service` |
| `DB_USER` | PostgreSQL user | `channel_router_service_user` |
| `DB_PASSWORD` | PostgreSQL password | *(see .env)* |
| `RABBITMQ_HOST` | RabbitMQ host | `localhost` |
| `RABBITMQ_PORT` | RabbitMQ AMQP port | `5672` |
| `RABBITMQ_MANAGEMENT_URL` | RabbitMQ Management UI URL | `http://localhost:15672` |
| `RABBITMQ_VHOST` | RabbitMQ virtual host | `vhnotificationapi` |
| `RABBITMQ_USER` | RabbitMQ user | `notificationapi` |
| `RABBITMQ_PASSWORD` | RabbitMQ password | *(see .env)* |
| `PROVIDER_CACHE_ENABLED` | Cache provider configs in memory | `true` |
| `PROVIDER_CACHE_TTL_SECONDS` | TTL for provider config cache (seconds) | `300` |
| `ADAPTER_HTTP_TIMEOUT_MS` | HTTP timeout for adapter service calls (ms) | `10000` |
| `ADAPTER_HEALTH_CHECK_INTERVAL_MS` | Interval for periodic adapter health checks (ms) | `30000` |
| `CB_FAILURE_THRESHOLD` | Failures to trip the circuit breaker | `5` |
| `CB_FAILURE_WINDOW_MS` | Failure counting window (ms) | `60000` |
| `CB_COOLDOWN_MS` | Open state duration before half-open (ms) | `30000` |
| `CB_HALF_OPEN_MAX_ATTEMPTS` | Test requests in half-open state | `1` |
| `CB_SUCCESS_THRESHOLD` | Successes to close from half-open | `2` |
| `RETRY_EMAIL_MAX` | Max retries for email | `5` |
| `RETRY_SMS_MAX` | Max retries for SMS | `3` |
| `RETRY_WHATSAPP_MAX` | Max retries for WhatsApp | `4` |
| `RETRY_PUSH_MAX` | Max retries for push | `4` |
| `RETRY_BACKOFF_MULTIPLIER` | Exponential backoff multiplier | `2` |
| `RETRY_JITTER_FACTOR` | Max jitter as fraction of delay | `0.2` |
| `MEDIA_DOWNLOAD_TIMEOUT_MS` | Timeout for downloading media assets (ms) | `10000` |
| `MEDIA_MAX_FILE_SIZE_MB` | Max file size per attachment (MB) | `10` |
| `MEDIA_MAX_TOTAL_SIZE_MB` | Max total attachment size per notification (MB) | `30` |
| `CONSUMER_PREFETCH_CRITICAL` | Prefetch count for critical queues | `5` |
| `CONSUMER_PREFETCH_NORMAL` | Prefetch count for normal queues | `10` |

## Dependencies

- PostgreSQL, RabbitMQ
- Provider adapter services: adapter-mailgun (:3171), adapter-braze (:3172), adapter-whatsapp (:3173), adapter-aws-ses (:3174)

## Related Services

- Upstream: notification-engine-service (:3152) dispatches delivery messages
- Downstream: audit-service (:3156) consumes status events
- Downstream: adapter-mailgun (:3171), adapter-braze (:3172), adapter-whatsapp (:3173), adapter-aws-ses (:3174) — provider delivery via standardized HTTP contract (`POST /send`, `GET /health`, `GET /capabilities`)
- Webhook sources: Provider webhooks (Mailgun, Braze, WhatsApp/Meta, AWS SES/SNS) route through notification-gateway to their respective adapter services, not to the channel-router-service core

## Key References

- Design doc (v2): `docs/11-channel-router-service-v2.md` (convenience copy) — authoritative at `../../docs/11-channel-router-service-v2.md`
- Design doc (v1): `../../docs/11-channel-router-service.md` (original monolithic design)
- Endpoints (v2): `../../endpoints/endpoints-channel-router-service-v2.md`
- Endpoints (v1): `../../endpoints/endpoints-channel-router-service.md`
- DB schema script: `dbscripts/schema-channel-router-service.sql`
- DB objects script: `dbscripts/channel-router-service-dbscripts.sql` — **must be updated on every database change**

## Coding Conventions

- Follow NestJS module structure
- Use HTTP adapter client for all provider delivery (standardized POST /send contract)
- All providers are dumb pipes — content is pre-rendered, no provider-side templating
- Implement circuit breaker per adapter service
- All consumer handlers must be idempotent
- Adapter services own webhook verification and provider-specific logic; core is provider-agnostic

## Coding Standards

1. **camelCase for JSON** — Always use camelCase notation for naming JSON object properties in request payloads and response bodies.

2. **Layered Architecture (Controllers -> Services -> Repositories)** — Strict separation of concerns:
   - **Controllers** — Thin HTTP handlers that only inject services and delegate. Zero business logic.
   - **Services** — All business orchestration lives here. Coordinate between repositories, helpers, and other services.
   - **Repositories** — Sole data access point, whether PostgreSQL (via TypeORM extending a `PgBaseRepository`) or external APIs.

3. **Standardized Error Responses** — All errors follow a consistent JSON schema:
   - Schema: `{ code: string, details: string, message: string, status: number, stack?: string }`
   - Example: `{ "code": "CRS-001", "details": "ADAPTER_UNAVAILABLE", "message": "adapter-mailgun circuit breaker is open", "status": 503 }`
   - **Error Registry (`errors.ts`)** — Centralized error code definitions with HTTP status, message, and details. Error codes use domain-specific prefixes (e.g., `CRS-` for Channel Router Service). No duplicates.
   - **Global Exception Filter** — A single `@Catch(HttpException)` filter maps every thrown exception to the standardized JSON response `{ code, details, message, status }`.

4. **Global Middleware via NestJS Bootstrap (`main.ts`)** — Cross-cutting concerns applied once at the application level:
   - **DtoValidationPipe** — Automatic request body validation via `class-validator` decorators on DTOs.
   - **HttpExceptionFilter** — The centralized error filter described above.
   - **LoggingInterceptor** — Structured HTTP request/response logging (Pino) with service metadata, timing, and severity-based log levels (`warn` for 4xx, `error` for 5xx).

## Current Folder Structure

```
channel-router-service/
  .env                         # Local environment variables (git-ignored)
  .gitignore                   # Node/NestJS ignores (dist, node_modules, .env, coverage, etc.)
  .prettierrc                  # { singleQuote: true, trailingComma: "all" }
  eslint.config.mjs            # ESLint flat config (typescript-eslint + prettier)
  nest-cli.json                # NestJS CLI config (sourceRoot: src, deleteOutDir)
  package.json                 # Dependencies and npm scripts
  package-lock.json
  tsconfig.json                # ES2023 target, nodenext modules, decorators enabled
  tsconfig.build.json          # Build-specific TS config (excludes test files)
  src/
    main.ts                    # Bootstrap: Pino logger, global pipes/filters/interceptors, CORS, port 3154
    app.module.ts              # Root module: Config, Logger, TypeORM, Common, Metrics, Channels, Providers, Delivery, CircuitBreaker, RateLimiter, Retry, Media, Fallback, RabbitMQ, HealthMonitor, Consumers, Health
    common/
      common.module.ts         # @Global() module
      errors.ts                # Error registry (24 CRS-prefixed codes) + createErrorResponse()
      errors.spec.ts
      interfaces/
        error-response.interface.ts  # { code, details, message, status, stack? }
      filters/
        http-exception.filter.ts     # Global @Catch(HttpException) → standardized JSON
        http-exception.filter.spec.ts
      pipes/
        dto-validation.pipe.ts       # Extends ValidationPipe, CRS-001 wrapping
        dto-validation.pipe.spec.ts
      interceptors/
        logging.interceptor.ts       # HTTP request/response logging (info/warn/error)
        logging.interceptor.spec.ts
      base/
        pg-base.repository.ts        # Abstract base repository (composition pattern)
    config/
      config.module.ts         # ConfigModule.forRoot (isGlobal, env validation)
      app.config.ts            # port, nodeEnv, provider cache, adapter, CB, retry, media, consumer configs
      app.config.spec.ts
      database.config.ts       # PostgreSQL connection params
      database.config.spec.ts
      rabbitmq.config.ts       # RabbitMQ connection config
      rabbitmq.config.spec.ts
      env.validation.ts        # class-validator EnvironmentVariables + validate() (33 env vars)
      env.validation.spec.ts
    channels/
      channels.module.ts       # TypeORM feature module, imports ProvidersModule, controller + service + repos
      channels.controller.ts   # GET /channels, PUT /channels/:id/config
      channels.controller.spec.ts
      channels.service.ts      # findAll with provider info, updateConfig, seed default channels
      channels.service.spec.ts
      channels.repository.ts   # Extends PgBaseRepository, findAll, findByType, findAllActive
      channels.repository.spec.ts
      channel-configs.repository.ts   # Extends PgBaseRepository, findByChannelId
      channel-configs.repository.spec.ts
      dto/
        update-channel-config.dto.ts       # routingMode, activeProviderId, fallbackChannelId, isActive
        update-channel-config.dto.spec.ts
      entities/
        channel.entity.ts      # 8 columns, UUID PK, self-referencing FK
        channel.entity.spec.ts
        channel-config.entity.ts  # 7 columns, UUID PK, FK to channels
        channel-config.entity.spec.ts
    providers/
      providers.module.ts      # TypeORM feature module, imports AdapterClientModule, controller + service + cache
      providers.controller.ts  # POST /providers/register, DELETE /:id, GET /, PUT /:id/config, GET /:id/capabilities, GET /:id/health
      providers.controller.spec.ts
      providers.service.ts     # register, deregister, findAll, updateConfig, getCapabilities, getHealth, findActiveByChannel
      providers.service.spec.ts
      provider-cache.service.ts  # In-memory cache, TTL refresh, invalidation, PROVIDER_CACHE_ENABLED toggle
      provider-cache.service.spec.ts
      provider-configs.repository.ts  # Extends PgBaseRepository, findAllProviders, findActiveByChannel, findByAdapterUrl, remove
      provider-configs.repository.spec.ts
      dto/
        register-provider.dto.ts       # providerName, providerId, channel, adapterUrl, isActive, routingWeight, rate limits
        register-provider.dto.spec.ts
        update-provider-config.dto.ts  # adapterUrl, routingWeight, rateLimitTokensPerSec, rateLimitMaxBurst, isActive
        update-provider-config.dto.spec.ts
      entities/
        provider-config.entity.ts  # 16 columns, UUID PK, circuit breaker state, rate limits
        provider-config.entity.spec.ts
    adapter-client/
      adapter-client.module.ts    # HttpModule + AdapterClientService
      adapter-client.service.ts   # send(), checkHealth(), getCapabilities() via @nestjs/axios
      adapter-client.service.spec.ts
      interfaces/
        adapter-client.interfaces.ts  # SendRequest, SendResult, AdapterHealthResponse, AdapterCapabilitiesResponse
    delivery/
      delivery.module.ts       # TypeORM feature module, imports 9 dependent modules, exports repo + pipeline
      delivery-pipeline.service.ts   # 7-step delivery orchestrator (validate, resolve, CB, rate limit, media, send, handle)
      delivery-pipeline.service.spec.ts
      delivery-attempts.repository.ts  # Extends PgBaseRepository, findByNotificationId, findByProviderMessageId
      delivery-attempts.repository.spec.ts
      interfaces/
        dispatch-message.interface.ts  # DispatchMessage, MediaEntry
        pipeline-result.interface.ts   # PipelineResult
      entities/
        delivery-attempt.entity.ts  # 12 columns, UUID PK, FK to provider_configs
        delivery-attempt.entity.spec.ts
    circuit-breaker/
      circuit-breaker.module.ts       # TypeORM feature module, exports CircuitBreakerService
      circuit-breaker.service.ts      # Per-provider state machine (CLOSED/OPEN/HALF_OPEN), DB persistence, metrics
      circuit-breaker.service.spec.ts
      interfaces/
        circuit-breaker.interfaces.ts  # CircuitBreakerState enum, CircuitBreakerEntry, CircuitBreakerSnapshot
    rate-limiter/
      rate-limiter.module.ts     # Exports RateLimiterService
      rate-limiter.service.ts    # Token bucket per provider: initBucket, acquire (wait/timeout), getStatus, refill
      rate-limiter.service.spec.ts
      interfaces/
        rate-limiter.interfaces.ts  # TokenBucket, AcquireResult, BucketStatus
    retry/
      retry.module.ts            # Exports RetryService
      retry.service.ts           # Per-channel policies, exponential backoff + jitter, shouldRetry decision
      retry.service.spec.ts
      interfaces/
        retry.interfaces.ts      # RetryPolicy, ShouldRetryResult
    media/
      media.module.ts            # Imports HttpModule, exports MediaProcessorService
      media-processor.service.ts # Channel-specific media processing (email/SMS/WhatsApp/push)
      media-processor.service.spec.ts
      interfaces/
        media.interfaces.ts      # MediaEntry, ProcessedMedia
    rabbitmq/
      rabbitmq.module.ts         # AppRabbitMQModule: @golevelup/nestjs-rabbitmq forRootAsync (3 exchanges, named channels)
      rabbitmq.constants.ts      # 3 exchange constants, 8 queue constants, 3 routing key builders
      rabbitmq.constants.spec.ts
      rabbitmq-publisher.service.ts   # Fire-and-forget publisher (5 methods: status, attempt, DLQ, fallback, retry)
      rabbitmq-publisher.service.spec.ts
      interfaces/
        publisher.interfaces.ts  # DeliveryStatusMessage, DeliveryAttemptMessage
    fallback/
      fallback.module.ts         # Imports ChannelsModule
      fallback.service.ts        # Single-level fallback: triggerFallback(dispatch, publisherService)
      fallback.service.spec.ts
    consumers/
      consumers.module.ts        # Imports AppRabbitMQModule + DeliveryModule, registers 8 consumers
      base-delivery.consumer.ts  # Abstract base: delegates to pipeline, void (ACK), Nack(false) (reject)
      base-delivery.consumer.spec.ts
      email-critical.consumer.ts      # @RabbitSubscribe → q.deliver.email.critical (channel-critical)
      email-critical.consumer.spec.ts
      email-normal.consumer.ts        # @RabbitSubscribe → q.deliver.email.normal (channel-normal)
      email-normal.consumer.spec.ts
      sms-critical.consumer.ts        # @RabbitSubscribe → q.deliver.sms.critical
      sms-critical.consumer.spec.ts
      sms-normal.consumer.ts          # @RabbitSubscribe → q.deliver.sms.normal
      sms-normal.consumer.spec.ts
      whatsapp-critical.consumer.ts   # @RabbitSubscribe → q.deliver.whatsapp.critical
      whatsapp-critical.consumer.spec.ts
      whatsapp-normal.consumer.ts     # @RabbitSubscribe → q.deliver.whatsapp.normal
      whatsapp-normal.consumer.spec.ts
      push-critical.consumer.ts       # @RabbitSubscribe → q.deliver.push.critical
      push-critical.consumer.spec.ts
      push-normal.consumer.ts         # @RabbitSubscribe → q.deliver.push.normal
      push-normal.consumer.spec.ts
    health-monitor/
      health-monitor.module.ts   # Imports AdapterClientModule, ProvidersModule, CircuitBreakerModule
      adapter-health-monitor.service.ts   # Periodic health checks, CB integration, per-provider status map
      adapter-health-monitor.service.spec.ts
    metrics/
      metrics.module.ts        # @Global() module, provides + exports MetricsService
      metrics.service.ts       # prom-client wrapper: 13 metrics (7 counters, 4 histograms, 2 gauges)
      metrics.service.spec.ts
      metrics.controller.ts    # GET /metrics — Prometheus text format
      metrics.controller.spec.ts
    health/
      health.module.ts         # Health controller module, imports HealthMonitorModule
      health.controller.ts     # GET /health (liveness), GET /ready (readiness: DB + RabbitMQ + adapter health)
      health.controller.spec.ts
  test/
    test-utils.ts              # Shared E2E helper (createTestApp, cleanupTestData)
    app.e2e-spec.ts            # E2E: health, ready, metrics
    channels.e2e-spec.ts       # E2E: channel list, update config, validation
    providers.e2e-spec.ts      # E2E: register, deregister, list, update, capabilities, health
    delivery.e2e-spec.ts       # E2E: delivery pipeline (happy path, retry, fallback) with mocked adapter
    jest-e2e.json              # Jest E2E config
  dbscripts/
    schema-channel-router-service.sql       # Schema/role/user/grants only
    channel-router-service-dbscripts.sql    # 4 tables, 8 indexes, purge function, updated_at triggers
  docs/
    11-channel-router-service-v2.md  # Convenience copy of design doc (v2)
    changelog_dev.md
```
