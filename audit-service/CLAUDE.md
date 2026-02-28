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

**Publishes to:** DLQ reprocessing only — republishes DLQ entry payload to original exchange/routing key via `DlqPublisher` (single outbound use case)

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

**Phase 4 complete** — DLQ monitoring with CRUD + reprocessing, analytics aggregation engine with cron jobs, and data retention scheduling. 338 unit tests across 41 suites, 58 E2E tests across 8 suites.

- **Phase 1:** NestJS scaffold (main.ts bootstrap with Pino, global pipes/filters/interceptors, CORS, port 3156), Config module (appConfig, databaseConfig, rabbitmqConfig, env validation), Common module (@Global, 9 AUD-prefixed error codes, HttpExceptionFilter, DtoValidationPipe, LoggingInterceptor, PgBaseRepository), TypeORM entities (AuditEvent, DeliveryReceipt, NotificationAnalytics, DlqEntry), 4 repositories extending PgBaseRepository, 4 feature modules (Events, Receipts, Analytics, DLQ), Metrics module (@Global, 15 custom metrics: 6 counters, 5 histograms, 4 gauges, GET /metrics), Health module (GET /health liveness, GET /health/ready readiness with DB + RabbitMQ + DLQ pending + consumers), Database scripts (4 tables, 14 indexes, search_vector trigger, purge function, CHECK constraint).
- **Phase 2:** RabbitMQ consumer-only module (@golevelup/nestjs-rabbitmq, 4 exchanges, 5 consumed queues, 5 named channels with per-queue prefetch), BatchBufferService (generic batch buffer with deferred ACK/NACK via Promises, transient/permanent error classification, poison message tracking via fingerprinting, graceful shutdown), 5 consumer handlers (EventsConsumer, DeliverConsumer, StatusConsumer with dual routing keys, TemplateConsumer, DlqConsumer with x-death extraction), ConsumerHealthIndicator (AmqpConnection.connected check + queue depth gauge via Management API), PgBaseRepository.insertMany() bulk insert method.
- **Phase 3:** REST query API — AuditLogsController (`GET /audit/logs` with 7 filters + inline FTS + 90-day date range validation), SearchController (`GET /audit/search` with operator detection + ts_rank_cd ranking + searchMaxResults enforcement), TraceController (`GET /audit/trace/:notificationId`, `GET /audit/trace/correlation/:correlationId`, `GET /audit/trace/cycle/:cycleId` with timeline merge + summary extraction), AuditReceiptsController (`GET /audit/receipts/:notificationId`). AuditEventsRepository enhanced with findWithFilters, fullTextSearch, findByNotificationIdOrdered, findDistinctNotificationIds. DeliveryReceiptsRepository enhanced with findByNotificationIdOrdered, findByNotificationId. SearchModule + TraceModule added to app.module.ts.
- **Phase 4:** DLQ monitoring CRUD — DlqController (`GET /audit/dlq` with 4 filters + statusCounts, `PATCH /audit/dlq/:id` with status transition validation, `POST /audit/dlq/:id/reprocess` with RabbitMQ republishing). DlqEntriesRepository enhanced with findWithFilters, statusCounts, updateEntry. DlqPublisher for outbound RabbitMQ publish. Analytics engine — AnalyticsController (`GET /audit/analytics` with period/date/channel/eventType filters, `GET /audit/analytics/summary` with today/7d/channelBreakdown). AggregationService with @Cron hourly/daily rollups from delivery_receipts + audit_events, idempotent upsert, _all cross-channel totals. NotificationAnalyticsRepository enhanced with findWithFilters, upsertRow, aggregateFromReceipts, countSuppressed, findForSummary. Data retention — RetentionService with @Cron payload purge (03:00) and DLQ cleanup (03:30). DB script updated: COALESCE-based unique index for NULL-safe upsert, new DLQ captured_at index. @nestjs/schedule added.

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
    app.module.ts              # Root module: Config, Logger, TypeORM, Common, Metrics, Events, Receipts, Analytics, DLQ, Search, Trace, Consumers, Health
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
      events.module.ts         # TypeORM feature, controllers + services + exports AuditEventsRepository
      audit-logs.controller.ts       # GET /audit/logs — paginated logs with filters
      audit-logs.controller.spec.ts
      audit-logs.service.ts          # Filter delegation, date range validation, response transform
      audit-logs.service.spec.ts
      audit-events.repository.ts     # Extends PgBaseRepository + findWithFilters, fullTextSearch, findByNotificationIdOrdered, findDistinctNotificationIds
      audit-events.repository.spec.ts
      dto/
        list-audit-logs-query.dto.ts # Query params: notificationId, correlationId, cycleId, eventType, actor, from, to, q, page, pageSize
      entities/
        audit-event.entity.ts        # 10 columns, UUID PK, tsvector search_vector
        audit-event.entity.spec.ts
    receipts/
      receipts.module.ts       # TypeORM feature, controllers + services + exports DeliveryReceiptsRepository
      audit-receipts.controller.ts   # GET /audit/receipts/:notificationId
      audit-receipts.controller.spec.ts
      audit-receipts.service.ts      # Receipt lookup, 404 handling
      audit-receipts.service.spec.ts
      delivery-receipts.repository.ts  # Extends PgBaseRepository + findByNotificationIdOrdered, findByNotificationId
      delivery-receipts.repository.spec.ts
      entities/
        delivery-receipt.entity.ts   # 10 columns, UUID PK
        delivery-receipt.entity.spec.ts
    search/
      search.module.ts         # Imports EventsModule, provides SearchController + SearchService
      search.controller.ts     # GET /audit/search — full-text search
      search.controller.spec.ts
      search.service.ts        # Operator detection, searchMaxResults enforcement, duration metric
      search.service.spec.ts
      dto/
        search-query.dto.ts    # Required q, optional from, to, page, pageSize
    trace/
      trace.module.ts          # Imports EventsModule + ReceiptsModule
      trace.controller.ts      # GET /audit/trace/:notificationId, correlation/:id, cycle/:id
      trace.controller.spec.ts
      trace.service.ts         # Timeline merge, summary extraction, correlation/cycle grouping
      trace.service.spec.ts
      interfaces/
        trace-response.interface.ts  # TimelineEntry, NotificationTraceResponse, CorrelationTraceResponse, CycleTraceResponse
    analytics/
      analytics.module.ts      # TypeORM feature + ScheduleModule, controller + services
      analytics.controller.ts  # GET /audit/analytics, GET /audit/analytics/summary
      analytics.controller.spec.ts
      analytics.service.ts     # Query + summary computation
      analytics.service.spec.ts
      aggregation.service.ts   # @Cron hourly/daily rollups, idempotent upsert
      aggregation.service.spec.ts
      notification-analytics.repository.ts  # Extends PgBaseRepository + findWithFilters, upsertRow, aggregateFromReceipts, countSuppressed, findForSummary
      notification-analytics.repository.spec.ts
      dto/
        query-analytics.dto.ts # period, from (required), to (required), channel, eventType, page, pageSize
      entities/
        notification-analytics.entity.ts  # 14 columns, UUID PK, COALESCE-based unique index
        notification-analytics.entity.spec.ts
    dlq/
      dlq.module.ts            # TypeORM feature + AppRabbitMQModule, controller + service
      dlq.controller.ts        # GET /audit/dlq, PATCH /audit/dlq/:id, POST /audit/dlq/:id/reprocess
      dlq.controller.spec.ts
      dlq.service.ts           # List, status update with transition validation, reprocess with RabbitMQ publish
      dlq.service.spec.ts
      dlq-entries.repository.ts      # Extends PgBaseRepository + countPending, findWithFilters, statusCounts, updateEntry
      dlq-entries.repository.spec.ts
      dto/
        list-dlq-query.dto.ts        # status, originalQueue, from, to, page, pageSize
        update-dlq-status.dto.ts     # status (required), notes, resolvedBy
      entities/
        dlq-entry.entity.ts          # 13 columns, UUID PK, DlqEntryStatus enum, CHECK constraint
        dlq-entry.entity.spec.ts
    retention/
      retention.module.ts      # Retention module
      retention.service.ts     # @Cron payload purge (03:00) + DLQ cleanup (03:30)
      retention.service.spec.ts
    rabbitmq/
      rabbitmq.module.ts       # RabbitMQ module (4 exchanges, 5 queues, 5 named channels, DlqPublisher)
      rabbitmq.constants.ts    # Exchange, queue, channel, routing key constants + helpers
      rabbitmq.constants.spec.ts
      dlq-publisher.service.ts       # Outbound RabbitMQ publisher for DLQ reprocessing
      dlq-publisher.service.spec.ts
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
      health.module.ts         # Health module with 3 custom indicators, imports DlqModule + AppRabbitMQModule
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
    test-utils.ts              # Shared E2E helper: createTestApp, mock factories (with query API + DLQ + analytics methods)
    app.e2e-spec.ts            # E2E: health, ready, metrics (5 tests)
    consumers.e2e-spec.ts      # E2E: consumer pipeline (batch flush, timer, errors, status dual-key, DLQ)
    logs.e2e-spec.ts           # E2E: audit logs pagination, filters, date range, inline FTS (7 tests)
    search.e2e-spec.ts         # E2E: full-text search, operators, max results (6 tests)
    trace.e2e-spec.ts          # E2E: notification/correlation/cycle trace, 404s (7 tests)
    receipts.e2e-spec.ts       # E2E: receipt lookup, 404 (4 tests)
    dlq.e2e-spec.ts            # E2E: DLQ list, status update lifecycle, reprocess, invalid transitions (13 tests)
    analytics.e2e-spec.ts      # E2E: analytics query, default period, filters, summary (8 tests)
    jest-e2e.json              # Jest E2E config
  dbscripts/
    schema-audit-service.sql         # Schema/role/user/grants only
    audit-service-dbscripts.sql      # 4 tables, 14 indexes, trigger, purge function
  docs/
    16-audit-service-v2.md
    changelog_dev.md
```
