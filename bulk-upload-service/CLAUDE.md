# Bulk Upload Service

XLSX bulk upload — async file processing, per-row event submission to Event Ingestion Service, result file with per-row status, fire-and-forget audit logging.

## Service Info

| Attribute | Value |
|---|---|
| **Port** | 3158 |
| **Technology** | NestJS 11 (TypeScript 5.7) |
| **Runtime** | Node.js (ES2023 target) |
| **DB Schema** | `bulk_upload_service` |
| **DB Role** | `bulk_upload_service_user_role` |
| **DB User** | `bulk_upload_service_user` |

## Database Tables

- `uploads` — tracking XLSX file uploads (UUID PK, status state machine, aggregate row counters, total_events for group mode, result file path)
- `upload_rows` — per-row processing tracking (FK to uploads with ON DELETE CASCADE, raw data, mapped payload, event ID, status, group_key with partial index)
- `purge_old_uploads()` — PL/pgSQL function to delete terminal-state uploads older than 90 days

## RabbitMQ

Fire-and-forget audit logging only. Publishes lifecycle events to `xch.notifications.status` (topic exchange). No consumers.

**Publishes to:**
- `xch.notifications.status` — routing keys: `bulk-upload.upload.created`, `bulk-upload.upload.processing`, `bulk-upload.upload.progress`, `bulk-upload.upload.completed`, `bulk-upload.upload.cancelled`, `bulk-upload.upload.retried`

**Consumed by:**
- Audit Service via `q.audit.bulk-upload` (bound with `bulk-upload.upload.#`)

## Dependencies

- PostgreSQL
- RabbitMQ (fire-and-forget audit publishing)
- event-ingestion-service (:3151) via HTTP for event submission

## Related Services

- Downstream: event-ingestion-service (:3151) receives events via HTTP POST
- Proxied through: notification-gateway (:3150)
- Managed by: admin-service (:3155) via gateway
- Audit: audit-service (:3156) consumes lifecycle events from RabbitMQ

## Environment Variables

Configured via `.env` file in the service root (git-ignored). Required for local development:

| Variable | Description | Dev Value |
|---|---|---|
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | HTTP listen port | `3158` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5433` |
| `DB_NAME` | PostgreSQL database name | `postgres` |
| `DB_SCHEMA` | PostgreSQL schema | `bulk_upload_service` |
| `DB_USER` | PostgreSQL user | `bulk_upload_service_user` |
| `DB_PASSWORD` | PostgreSQL password | *(see .env)* |
| `RABBITMQ_HOST` | RabbitMQ host | `localhost` |
| `RABBITMQ_PORT` | RabbitMQ AMQP port | `5672` |
| `RABBITMQ_MANAGEMENT_URL` | RabbitMQ Management UI URL | `http://localhost:15672` |
| `RABBITMQ_VHOST` | RabbitMQ virtual host | `vhnotificationapi` |
| `RABBITMQ_USER` | RabbitMQ user | `notificationapi` |
| `RABBITMQ_PASSWORD` | RabbitMQ password | *(see .env)* |
| `EVENT_INGESTION_URL` | Event Ingestion Service base URL | `http://localhost:3151` |
| `UPLOAD_TEMP_DIR` | Temporary directory for uploaded XLSX files | `./uploads/temp` |
| `UPLOAD_RESULT_DIR` | Directory for generated result XLSX files | `./uploads/results` |
| `UPLOAD_MAX_FILE_SIZE_MB` | Maximum upload file size in megabytes | `10` |
| `UPLOAD_MAX_ROWS` | Maximum data rows per XLSX file | `5000` |
| `GROUP_KEY_COLUMN` | Column used as the group key in group mode | `orderId` |
| `GROUP_ITEMS_PREFIX` | Column name prefix that identifies item-level fields | `item.` |
| `GROUP_ITEMS_TARGET_FIELD` | Array field name where item objects are collected | `items` |
| `GROUP_CONFLICT_MODE` | Conflicting order-level data handling: `warn` or `strict` | `warn` |
| `WORKER_BATCH_SIZE` | Rows processed per database iteration | `50` |
| `WORKER_CONCURRENCY` | Maximum parallel HTTP requests to Event Ingestion | `5` |
| `WORKER_RATE_LIMIT` | Maximum events submitted per second | `50` |
| `WORKER_POLL_INTERVAL_MS` | Polling interval for queued uploads (ms) | `2000` |
| `WORKER_REQUEST_TIMEOUT_MS` | HTTP timeout per Event Ingestion request (ms) | `10000` |
| `CIRCUIT_BREAKER_THRESHOLD` | Consecutive failures to trip circuit breaker | `3` |
| `CIRCUIT_BREAKER_COOLDOWN_MS` | Circuit breaker recovery wait time (ms) | `30000` |
| `RESULT_RETENTION_DAYS` | Days to retain result XLSX files on disk | `30` |
| `UPLOAD_RETENTION_DAYS` | Days to retain upload records in database | `90` |
| `UPLOAD_RATE_LIMIT_PER_HOUR` | Maximum uploads per user per hour | `10` |
| `LOG_LEVEL` | Logging level (`debug`, `info`, `warn`, `error`) | `info` |
| `HEALTH_CHECK_INTERVAL_MS` | Health check polling interval (ms) | `30000` |

## Key References

- Design doc: `docs/09-bulk-upload-service.md`
- Endpoints: `../../endpoints/endpoints-bulk-upload-service.md`
- DB schema script: `dbscripts/schema-bulk-upload-service.sql`
- DB objects script: `dbscripts/bulk-upload-service-dbscripts.sql` — **must be updated on every database change**

## Coding Conventions

- Follow NestJS module structure (module, controller, service, dto)
- Use exceljs for XLSX parsing and result file generation
- File size limit: 10 MB, row limit: 5,000 rows
- Processing is asynchronous — upload endpoint returns immediately, background worker processes rows
- Each row is submitted individually to Event Ingestion Service via HTTP
- Result file contains all original columns plus `_notification_status` column
- Use class-validator for DTO validation

## Coding Standards

1. **camelCase for JSON** — Always use camelCase notation for naming JSON object properties in request payloads and response bodies.

2. **Layered Architecture (Controllers → Services → Repositories)** — Strict separation of concerns:
   - **Controllers** — Thin HTTP handlers that only inject services and delegate. Zero business logic.
   - **Services** — All business orchestration lives here. Coordinate between repositories, helpers, and other services.
   - **Repositories** — Sole data access point, whether PostgreSQL (via TypeORM extending a `PgBaseRepository`) or external APIs.

3. **Standardized Error Responses** — All errors follow a consistent JSON schema:
   - Schema: `{ code: string, details: string, message: string, status: number, stack?: string }`
   - Example: `{ "code": "BUS-001", "details": "FILE_TOO_LARGE", "message": "file exceeds 10 MB limit", "status": 400 }`
   - **Error Registry (`errors.ts`)** — Centralized error code definitions with HTTP status, message, and details. Error codes use domain-specific prefixes (e.g., `BUS-` for Bulk Upload Service). No duplicates.
   - **Global Exception Filter** — A single `@Catch(HttpException)` filter maps every thrown exception to the standardized JSON response `{ code, details, message, status }`.

4. **Global Middleware via NestJS Bootstrap (`main.ts`)** — Cross-cutting concerns applied once at the application level:
   - **DtoValidationPipe** — Automatic request body validation via `class-validator` decorators on DTOs.
   - **HttpExceptionFilter** — The centralized error filter described above.
   - **LoggingInterceptor** — Structured HTTP request/response logging (Pino) with service metadata, timing, and severity-based log levels (`warn` for 4xx, `error` for 5xx).

## Implementation Status

**Phase 4 complete** — RabbitMQ integration, enhanced health checks, E2E tests. 387 unit tests across 23 suites, 24 E2E tests across 4 suites.

- **Phase 4:** RabbitMQ module (@golevelup/nestjs-rabbitmq, fire-and-forget audit publishing to `xch.notifications.status` with 6 routing keys, graceful degradation without RabbitMQ), AuditPublisherService (6 lifecycle event methods), Enhanced health (GET /health liveness DB-only, GET /ready readiness with DB + RabbitMQ + EIS + Disk Space), 3 health indicators (RabbitMQ Management API, Event Ingestion HTTP, Disk Space statfs), 2 new Prometheus metrics (rabbitmq publish counter + duration histogram), 5 E2E test files (31 tests with mocked dependencies).
- **Phase 3:** Group mode (auto-detected by item.* columns, composite key grouping, order-level field extraction from first row, item prefix stripping, conflict detection with warn/strict modes, group event payload with items[] array, all rows in group get same status), Circuit breaker (@Global module, CLOSED→OPEN→HALF_OPEN state machine, in-memory, configurable threshold/cooldown, 5xx-only failure tracking, integrated into processing pipeline), Rate limiter (@Global module, token bucket algorithm, in-memory, configurable capacity, integrated into processing pipeline), Retry endpoint (POST /uploads/:id/retry, resets failed/skipped rows, preserves succeeded, requeues for worker), 5 new Prometheus metrics, BUS-016 error code.
- **Phase 2:** Parsing module (parseHeaders, parseRows with type coercion, detectMode), Event Ingestion HTTP client (@nestjs/axios, POST /webhooks/events, error classification), Processing module (background worker with polling, 9-step pipeline, batch processing with configurable concurrency, graceful shutdown), Results module (result XLSX with _notification_status column, cell styling, file cleanup), GET /uploads/:id/result endpoint, 6 new Prometheus metrics, BUS-015 error code.
- **Phase 1:** Foundation, data layer, upload CRUD, XLSX validation, metrics, health checks.

## Current Folder Structure

```
bulk-upload-service/
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
    main.ts                    # Bootstrap: Pino logger, global pipes/filters/interceptors, CORS, port 3158
    app.module.ts              # Root module: Config, Logger, TypeORM, Common, Metrics, Uploads, CircuitBreaker, RateLimiter, RabbitMQ, Health
    common/
      common.module.ts         # @Global() module
      errors.ts                # Error registry (16 BUS-prefixed codes) + createErrorResponse()
      interfaces/
        error-response.interface.ts  # { code, details, message, status, stack? }
      filters/
        http-exception.filter.ts     # Global @Catch(HttpException) → standardized JSON
        http-exception.filter.spec.ts
      pipes/
        dto-validation.pipe.ts       # Extends ValidationPipe, BUS-001 wrapping
        dto-validation.pipe.spec.ts
      interceptors/
        logging.interceptor.ts       # HTTP request/response logging (info/warn/error)
        logging.interceptor.spec.ts
      base/
        pg-base.repository.ts        # Abstract base repository (composition pattern)
    config/
      config.module.ts         # ConfigModule.forRoot (isGlobal, env validation)
      app.config.ts            # port, nodeEnv, upload settings, worker settings, group mode, circuit breaker
      database.config.ts       # PostgreSQL connection params
      rabbitmq.config.ts       # RabbitMQ connection config (host, port, vhost, credentials, management URL)
      env.validation.ts        # class-validator EnvironmentVariables + validate()
      env.validation.spec.ts
    uploads/
      uploads.module.ts        # TypeORM feature, exports service + repositories
      uploads.controller.ts    # 7 REST endpoints (POST, GET list, GET :id, GET :id/status, POST :id/retry, GET :id/errors, DELETE :id)
      uploads.controller.spec.ts
      uploads.service.ts       # Upload processing, XLSX validation (8-step pipeline), CRUD operations
      uploads.service.spec.ts
      uploads.repository.ts    # Extends PgBaseRepository, findWithFilters, claimNextQueued, updateCounters, updateStatus
      uploads.repository.spec.ts
      upload-rows.repository.ts  # Extends PgBaseRepository, bulkInsert, findFailedByUploadId, updateRowStatus, countByStatus, resetFailedRows, updateGroupRowStatuses
      upload-rows.repository.spec.ts
      entities/
        upload.entity.ts       # 16 columns, UUID PK, UploadStatus enum (6 states)
        upload.entity.spec.ts
        upload-row.entity.ts   # 11 columns, FK to uploads, UploadRowStatus enum (5 states)
        upload-row.entity.spec.ts
      dto/
        query-uploads.dto.ts   # Pagination + filters (status, uploadedBy, dateRange, sort)
        error-rows-query.dto.ts  # Pagination for error rows
        upload-response.dto.ts   # Entity → response mapping with resultFileReady flag
        upload-response.dto.spec.ts
        upload-status-response.dto.ts  # Progress, ETA, status polling response
        upload-status-response.dto.spec.ts
    parsing/
      parsing.module.ts        # ParsingModule: provides + exports ParsingService
      parsing.service.ts       # parseHeaders, parseRows (async generator), detectMode, extractGroupData, type coercion
      parsing.service.spec.ts
      parsing-group.service.spec.ts  # Group mode tests: grouping, conflicts, prefix stripping
      interfaces/
        parsed-row.interface.ts  # ParsedRow, ModeDetectionResult, GroupedData, GroupedRows
    event-ingestion/
      event-ingestion.module.ts  # EventIngestionModule: HttpModule + EventIngestionClient
      event-ingestion.client.ts  # POST /webhooks/events, timeout/connection error handling
      event-ingestion.client.spec.ts
    circuit-breaker/
      circuit-breaker.module.ts  # @Global() module
      circuit-breaker.service.ts # CLOSED→OPEN→HALF_OPEN state machine, configurable threshold/cooldown
      circuit-breaker.service.spec.ts
    rate-limiter/
      rate-limiter.module.ts   # @Global() module
      rate-limiter.service.ts  # Token bucket algorithm, configurable capacity/refill rate
      rate-limiter.service.spec.ts
    processing/
      processing.module.ts     # ProcessingModule: imports Parsing, EventIngestion, Results, Uploads, CircuitBreaker, RateLimiter
      processing.service.ts    # Background worker: polling, standard + group mode pipeline, CB/RL integration, retry support
      processing.service.spec.ts
    results/
      results.module.ts        # ResultsModule: imports UploadsModule
      results.service.ts       # generateResult: _notification_status column, cell styling, file cleanup
      results.service.spec.ts
    metrics/
      metrics.module.ts        # @Global() module, provides + exports MetricsService
      metrics.service.ts       # prom-client wrapper: 18 metrics (counters, histograms, gauges)
      metrics.service.spec.ts
      metrics.controller.ts    # GET /metrics — Prometheus text format
      metrics.controller.spec.ts
    rabbitmq/
      rabbitmq.module.ts       # AppRabbitMQModule: @golevelup/nestjs-rabbitmq forRootAsync, publish-only
      rabbitmq.constants.ts    # Exchange + 6 routing key constants
      rabbitmq.constants.spec.ts
      audit-publisher.service.ts  # 6 fire-and-forget publish methods (created, processing, progress, completed, cancelled, retried)
      audit-publisher.service.spec.ts
    health/
      health.module.ts         # Health module with 3 custom indicators
      health.controller.ts     # GET /health (liveness, DB only), GET /ready (readiness, all deps)
      health.controller.spec.ts
      indicators/
        rabbitmq-health.indicator.ts       # RabbitMQ Management API health check
        rabbitmq-health.indicator.spec.ts
        event-ingestion-health.indicator.ts  # Event Ingestion Service HTTP health check
        event-ingestion-health.indicator.spec.ts
        disk-space-health.indicator.ts       # Disk space check via fs.statfsSync
        disk-space-health.indicator.spec.ts
  test/
    test-utils.ts              # Shared E2E helper: createTestApp, mock factories for repos/services
    app.e2e-spec.ts            # E2E: health, ready, metrics (5 tests)
    processing.e2e-spec.ts     # E2E: standard mode, results, audit publishing (8 tests)
    group-mode.e2e-spec.ts     # E2E: group mode auto-detection, grouping, conflicts (5 tests)
    retry.e2e-spec.ts          # E2E: uploads CRUD + retry lifecycle (6 tests)
    jest-e2e.json              # Jest E2E config
  dbscripts/
    schema-bulk-upload-service.sql       # Schema/role/user/grants only
    bulk-upload-service-dbscripts.sql    # uploads, upload_rows tables, indexes, purge function, trigger
  docs/
    09-bulk-upload-service.md
    changelog_dev.md
```
