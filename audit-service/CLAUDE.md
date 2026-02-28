# Audit Service

Notification tracking, delivery receipts, analytics, DLQ monitoring — immutable event sourcing model for complete notification lifecycle audit trail.

## Service Info

| Attribute | Value |
|---|---|
| **Port** | 3156 |
| **Technology** | NestJS (TypeScript) |
| **DB Schema** | `audit_service` |
| **DB Role** | `audit_service_user_role` |
| **DB User** | `audit_service_user` |

## Database Tables

- `audit_events` — immutable notification lifecycle event logging (UUID PK, notification_id, correlation_id, cycle_id, event type taxonomy, actor, metadata JSONB, payload snapshot JSONB, tsvector search vector)
- `delivery_receipts` — provider-reported delivery outcomes correlated via provider_message_id
- `notification_analytics` — pre-aggregated hourly/daily rollups with idempotent upsert
- `dlq_entries` — dead-letter queue monitoring with status tracking (pending/investigated/reprocessed/discarded)
- `purge_audit_payloads()` — PL/pgSQL function to NULL payload data older than 90 days

## RabbitMQ

**Publishes to:** None (pure consumer/sink)

**Consumes from:**
- `audit.events` — bound to `xch.events.normalized` via `event.#` (all normalized events)
- `audit.deliver` — bound to `xch.notifications.deliver` via `notification.deliver.#` (all dispatch messages)
- `q.status.updates` — bound to `xch.notifications.status` via `notification.status.#` (all delivery status updates)
- `q.audit.template` — bound to `xch.notifications.status` via `template.#` (template lifecycle events)
- `audit.dlq` — bound to `xch.notifications.dlq` (fanout — dead-lettered messages)

## Environment Configuration

The `.env` file (git-ignored) provides local development settings. Key variables:

| Variable | Dev Value | Description |
|---|---|---|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3156` | HTTP server port |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5433` | PostgreSQL port (local dev) |
| `DB_NAME` | `postgres` | PostgreSQL database name |
| `DB_SCHEMA` | `audit_service` | PostgreSQL schema |
| `DB_USER` | `audit_service_user` | PostgreSQL user |
| `DB_PASSWORD` | *(in .env)* | PostgreSQL password |
| `RABBITMQ_HOST` | `localhost` | RabbitMQ host |
| `RABBITMQ_PORT` | `5672` | RabbitMQ AMQP port |
| `RABBITMQ_MANAGEMENT_URL` | `http://localhost:15672` | RabbitMQ Management API |
| `RABBITMQ_VHOST` | `vhnotificationapi` | RabbitMQ virtual host |
| `RABBITMQ_USER` | `notificationapi` | RabbitMQ user |
| `RABBITMQ_PASSWORD` | *(in .env)* | RabbitMQ password |
| `CONSUMER_BATCH_SIZE` | `50` | Messages per batch insert |
| `CONSUMER_FLUSH_INTERVAL_MS` | `2000` | Max time between batch flushes (ms) |
| `CONSUMER_RETRY_DELAY_MS` | `5000` | Delay after batch failure before retry (ms) |
| `CONSUMER_MAX_RETRIES` | `3` | Max retries before poison message discarded |
| `RETENTION_PAYLOAD_DAYS` | `90` | Days to retain payload data |
| `RETENTION_METADATA_DAYS` | `730` | Days to retain metadata (2 years) |
| `ANALYTICS_HOURLY_CRON` | `5 * * * *` | Cron for hourly aggregation |
| `ANALYTICS_DAILY_CRON` | `15 0 * * *` | Cron for daily aggregation |
| `SEARCH_MAX_RESULTS` | `200` | Maximum search query results |
| `LOG_LEVEL` | `info` | Log level (debug/info/warn/error) |

## Dependencies

- PostgreSQL, RabbitMQ

## Related Services

- Upstream: all services publish events that audit-service consumes
- Queried by: admin-service (:3155), notification-gateway (:3150) for audit logs and traces

## Key References

- Design doc (v2): `docs/16-audit-service-v2.md` (convenience copy) — authoritative at `../../docs/16-audit-service-v2.md`
- Design doc (v1): `../../docs/16-audit-service.md` (original design)
- Endpoints: `../../endpoints/endpoints-audit-service.md`
- DB schema script: `dbscripts/schema-audit-service.sql`
- DB objects script: `dbscripts/audit-service-dbscripts.sql` — **must be updated on every database change**

## Coding Conventions

- Follow NestJS module structure
- All audit events are append-only / immutable — never update or delete
- Consumer handlers must be idempotent (use notification_id + event_type for deduplication)
- Analytics aggregation uses idempotent upsert pattern
- Full-text search via PostgreSQL tsvector/tsquery

## Coding Standards

1. **camelCase for JSON** — Always use camelCase notation for naming JSON object properties in request payloads and response bodies.

2. **Layered Architecture (Controllers → Services → Repositories)** — Strict separation of concerns:
   - **Controllers** — Thin HTTP handlers that only inject services and delegate. Zero business logic.
   - **Services** — All business orchestration lives here. Coordinate between repositories, helpers, and other services.
   - **Repositories** — Sole data access point, whether PostgreSQL (via TypeORM extending a `PgBaseRepository`) or external APIs.

3. **Standardized Error Responses** — All errors follow a consistent JSON schema:
   - Schema: `{ code: string, details: string, message: string, status: number, stack?: string }`
   - Example: `{ "code": "AUD-001", "details": "INVALID_QUERY", "message": "date range exceeds maximum of 90 days", "status": 400 }`
   - **Error Registry (`errors.ts`)** — Centralized error code definitions with HTTP status, message, and details. Error codes use domain-specific prefixes (e.g., `AUD-` for Audit Service). No duplicates.
   - **Global Exception Filter** — A single `@Catch(HttpException)` filter maps every thrown exception to the standardized JSON response `{ code, details, message, status }`.

4. **Global Middleware via NestJS Bootstrap (`main.ts`)** — Cross-cutting concerns applied once at the application level:
   - **DtoValidationPipe** — Automatic request body validation via `class-validator` decorators on DTOs.
   - **HttpExceptionFilter** — The centralized error filter described above.
   - **LoggingInterceptor** — Structured HTTP request/response logging (Pino) with service metadata, timing, and severity-based log levels (`warn` for 4xx, `error` for 5xx).

## Implementation Status

**Phase 2 complete** — RabbitMQ consumer pipeline with batch insert optimization. 178 unit tests across 26 suites, 13 E2E tests across 2 suites.

- **Phase 1:** NestJS scaffold (main.ts bootstrap with Pino, global pipes/filters/interceptors, CORS, port 3156), Config module (appConfig, databaseConfig, rabbitmqConfig, env validation), Common module (@Global, 9 AUD-prefixed error codes, HttpExceptionFilter, DtoValidationPipe, LoggingInterceptor, PgBaseRepository), TypeORM entities (AuditEvent, DeliveryReceipt, NotificationAnalytics, DlqEntry), 4 repositories extending PgBaseRepository, 4 feature modules (Events, Receipts, Analytics, DLQ), Metrics module (@Global, 15 custom metrics: 6 counters, 5 histograms, 4 gauges, GET /metrics), Health module (GET /health liveness, GET /health/ready readiness with DB + RabbitMQ + DLQ pending + consumers), Database scripts (4 tables, 14 indexes, search_vector trigger, purge function, CHECK constraint).
- **Phase 2:** RabbitMQ consumer-only module (@golevelup/nestjs-rabbitmq, 4 exchanges, 5 consumed queues, 5 named channels with per-queue prefetch), BatchBufferService (generic batch buffer with deferred ACK/NACK via Promises, transient/permanent error classification, poison message tracking via fingerprinting, graceful shutdown), 5 consumer handlers (EventsConsumer, DeliverConsumer, StatusConsumer with dual routing keys, TemplateConsumer, DlqConsumer with x-death extraction), ConsumerHealthIndicator (connection status + queue depth gauge), PgBaseRepository.insertMany() bulk insert method.

## Current Folder Structure

```
audit-service/
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
    main.ts                    # Bootstrap: Pino logger, global pipes/filters/interceptors, CORS, port 3156
    app.module.ts              # Root module: Config, Logger, TypeORM, Common, Metrics, Events, Receipts, Analytics, DLQ, Consumers, Health
    common/
      common.module.ts         # @Global() module
      errors.ts                # Error registry (9 AUD-prefixed codes) + createErrorResponse()
      errors.spec.ts
      interfaces/
        error-response.interface.ts  # { code, details, message, status, stack? }
      filters/
        http-exception.filter.ts     # Global @Catch(HttpException) → standardized JSON
        http-exception.filter.spec.ts
      pipes/
        dto-validation.pipe.ts       # Extends ValidationPipe, AUD-001 wrapping
        dto-validation.pipe.spec.ts
      interceptors/
        logging.interceptor.ts       # HTTP request/response logging (info/warn/error)
        logging.interceptor.spec.ts
      base/
        pg-base.repository.ts        # Abstract base repository (composition pattern) + insertMany()
    config/
      config.module.ts         # ConfigModule.forRoot (isGlobal, env validation)
      app.config.ts            # port, nodeEnv, consumer settings, retention, analytics, search
      database.config.ts       # PostgreSQL connection params
      rabbitmq.config.ts       # RabbitMQ connection config (host, port, vhost, credentials, management URL)
      env.validation.ts        # class-validator EnvironmentVariables + validate()
      env.validation.spec.ts
    events/
      events.module.ts         # TypeORM feature, exports AuditEventsRepository
      audit-events.repository.ts     # Extends PgBaseRepository
      audit-events.repository.spec.ts
      entities/
        audit-event.entity.ts        # 10 columns, UUID PK, tsvector search_vector
        audit-event.entity.spec.ts
    receipts/
      receipts.module.ts       # TypeORM feature, exports DeliveryReceiptsRepository
      delivery-receipts.repository.ts  # Extends PgBaseRepository
      delivery-receipts.repository.spec.ts
      entities/
        delivery-receipt.entity.ts   # 10 columns, UUID PK
        delivery-receipt.entity.spec.ts
    analytics/
      analytics.module.ts      # TypeORM feature, exports NotificationAnalyticsRepository
      notification-analytics.repository.ts  # Extends PgBaseRepository
      notification-analytics.repository.spec.ts
      entities/
        notification-analytics.entity.ts  # 14 columns, UUID PK, unique composite index
        notification-analytics.entity.spec.ts
    dlq/
      dlq.module.ts            # TypeORM feature, exports DlqEntriesRepository
      dlq-entries.repository.ts      # Extends PgBaseRepository + countPending()
      dlq-entries.repository.spec.ts
      entities/
        dlq-entry.entity.ts          # 13 columns, UUID PK, DlqEntryStatus enum, CHECK constraint
        dlq-entry.entity.spec.ts
    rabbitmq/
      rabbitmq.module.ts       # Consumer-only RabbitMQ module (4 exchanges, 5 queues, 5 named channels)
      rabbitmq.constants.ts    # Exchange, queue, channel, routing key constants + helpers
      rabbitmq.constants.spec.ts
    consumers/
      consumers.module.ts      # Wires BatchBufferService + 5 consumers
      batch-buffer.service.ts  # Generic batch buffer (deferred ACK/NACK, transient/permanent error handling, poison tracking)
      batch-buffer.service.spec.ts
      events.consumer.ts       # audit.events → EVENT_INGESTED/NORMALIZED/VALIDATION_FAILED/DUPLICATE_DETECTED
      events.consumer.spec.ts
      deliver.consumer.ts      # audit.deliver → DELIVERY_DISPATCHED
      deliver.consumer.spec.ts
      status.consumer.ts       # q.status.updates → delivery-path + webhook status, dual routing keys
      status.consumer.spec.ts
      template.consumer.ts     # q.audit.template → TEMPLATE_CREATED/UPDATED/DELETED/ROLLEDBACK
      template.consumer.spec.ts
      dlq.consumer.ts          # audit.dlq → DLQ_CAPTURED with x-death extraction
      dlq.consumer.spec.ts
    metrics/
      metrics.module.ts        # @Global() module, provides + exports MetricsService
      metrics.service.ts       # prom-client wrapper: 15 metrics (6 counters, 5 histograms, 4 gauges)
      metrics.service.spec.ts
      metrics.controller.ts    # GET /metrics — Prometheus text format
      metrics.controller.spec.ts
    health/
      health.module.ts         # Health module with 3 custom indicators, imports DlqModule
      health.controller.ts     # GET /health (liveness), GET /health/ready (readiness with 4 checks)
      health.controller.spec.ts
      indicators/
        rabbitmq-health.indicator.ts       # RabbitMQ Management API health check
        rabbitmq-health.indicator.spec.ts
        dlq-pending-health.indicator.ts    # DLQ pending count check via DlqEntriesRepository
        dlq-pending-health.indicator.spec.ts
        consumer-health.indicator.ts       # AmqpConnection status + queue depth gauge
        consumer-health.indicator.spec.ts
  test/
    test-utils.ts              # Shared E2E helper: createTestApp, mock factories
    app.e2e-spec.ts            # E2E: health, ready, metrics (5 tests)
    consumers.e2e-spec.ts      # E2E: consumer pipeline (batch flush, timer, errors, status dual-key, DLQ)
    jest-e2e.json              # Jest E2E config
  dbscripts/
    schema-audit-service.sql         # Schema/role/user/grants only
    audit-service-dbscripts.sql      # 4 tables, 14 indexes, trigger, purge function
  docs/
    16-audit-service-v2.md
    changelog_dev.md
```
