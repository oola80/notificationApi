# Bulk Upload Service — Development Changelog

> **Info:** This changelog tracks **code changes only**.
> Design changes are tracked in the root `docs/06-changelog.md`.

## [Unreleased]

### 2026-02-27 — order.delay Bulk Upload Configuration

- **Test XLSX file:** `docs/test-order-delay.xlsx` — 3 data rows (2 grouped events) demonstrating group mode with `item.*` prefix columns for the `order.delay` scenario. Generated via `docs/generate-test-xlsx.js` using exceljs.
- **Template configuration doc:** `docs/template-order-delay.md` — reference document covering XLSX column layout (17 columns), group mode env var configuration, example data, resulting event payload structure, and type coercion notes.

### 2026-02-27 — Phase 4: RabbitMQ Integration, Enhanced Health Checks & E2E Tests

- **RabbitMQ module:** @golevelup/nestjs-rabbitmq integration with fire-and-forget audit event publishing. AppRabbitMQModule with forRootAsync config (topic exchange `xch.notifications.status`, connection timeout 10s, heartbeat 30s, reconnect 5s, no consumers). Service works without RabbitMQ (graceful degradation).
- **Audit publisher service:** AuditPublisherService with 6 fire-and-forget publish methods — publishUploadCreated, publishUploadProcessing, publishUploadProgress, publishUploadCompleted, publishUploadCancelled, publishUploadRetried. Message envelope: `{ eventId, source, type, timestamp, data }`. Routing keys: `bulk-upload.upload.{created|processing|progress|completed|cancelled|retried}`. All publishing wrapped in try/catch with warn-level logging on failure (never blocks processing).
- **Audit integration:** UploadsService publishes created, cancelled, retried events. ProcessingService publishes processing (at start), progress (after each batch), completed (at end) events. Progress events include current progressPercent.
- **Enhanced health checks:** GET /health (liveness — DB ping only) and GET /ready (readiness — DB + RabbitMQ Management API + Event Ingestion Service + Disk Space in parallel). Three new health indicators: RabbitMQHealthIndicator (Management API /api/health/checks/alarms with Basic auth, 5s timeout), EventIngestionHealthIndicator (HTTP GET to EIS /health, 5s timeout), DiskSpaceHealthIndicator (fs.statfsSync on upload directories, 100MB minimum). Removed @nestjs/terminus dependency in favor of custom implementation.
- **Prometheus metrics:** 2 new metrics — bus_rabbitmq_publish_total (counter with routingKey + status labels), bus_rabbitmq_publish_duration_seconds (histogram with ms-level buckets). Total: 18 metrics.
- **Config updates:** rabbitmq.config.ts finalized (removed placeholder comment), env.validation.ts updated (RabbitMQ marked as optional with graceful degradation note).
- **E2E tests:** 4 test files — app.e2e-spec.ts (health + ready + metrics, 5 tests), processing.e2e-spec.ts (standard mode + results + audit, 8 tests), group-mode.e2e-spec.ts (auto-detection + grouping + conflicts, 5 tests), retry.e2e-spec.ts (uploads CRUD + retry lifecycle + validation, 6 tests). Shared test-utils.ts with createTestApp, mock factories for all repositories/services. Total: 24 E2E tests across 4 suites.
- **Unit tests:** 30 new tests — audit-publisher.service.spec.ts (12), rabbitmq.constants.spec.ts (1), health indicators (10), health.controller.spec.ts (6 rewritten). Total: 387 unit tests across 23 suites + 24 E2E tests across 4 suites.
- **Dependencies added:** @golevelup/nestjs-rabbitmq ^7.1.2, @types/amqplib ^0.10.8 (devDependency)

### 2026-02-27 — Phase 3: Group Mode, Circuit Breaker, Rate Limiter & Retry

- **Group mode processing:** ParsingService.extractGroupData() groups rows by composite key (eventType + groupKeyColumn value), extracts order-level fields from first row, collects item-level fields from all rows with prefix stripping (item.sku → sku), detects order-level field conflicts (warn mode: log + use first row; strict mode: mark group as failed). GroupedRows and GroupedData interfaces. ProcessingService: group mode auto-detection triggers group insert (rows with groupKey), group batch processing (one event per group, all rows same status), totalEvents = group count. Group event payload: `{...orderFields, items: [{stripped item fields}]}` with sourceEventId `{uploadId}-group-{eventType}-{groupKeyValue}`.
- **Circuit breaker module (@Global):** CircuitBreakerService with CLOSED → OPEN → HALF_OPEN state machine. In-memory only (no DB persistence). Configurable threshold (CIRCUIT_BREAKER_THRESHOLD, default 3) and cooldown (CIRCUIT_BREAKER_COOLDOWN_MS, default 30000). Integrated into ProcessingService: recordSuccess on 2xx, recordFailure on 5xx/connection errors only (not 4xx), skip remaining rows when circuit opens, auto-retry after cooldown.
- **Rate limiter module (@Global):** RateLimiterService with token bucket algorithm. Capacity and refill rate from WORKER_RATE_LIMIT (default 50). In-memory only. Integrated into ProcessingService: acquire() before each event submission with metrics observation.
- **Retry endpoint:** POST /uploads/:id/retry returns 202 Accepted with `{uploadId, status, retryableRows}`. Validates upload exists and is partial/failed (BUS-016 error otherwise). Resets failed/skipped rows to pending via resetFailedRows(), resets upload counters (processedRows = succeededRows, failedRows = 0), sets status back to queued. Worker re-processes only pending rows on retry. Result file regenerated after retry.
- **Repository additions:** UploadRowsRepository.resetFailedRows(), UploadRowsRepository.updateGroupRowStatuses(). UploadsRepository: PARTIAL/FAILED → QUEUED transition added.
- **Metrics additions:** 5 new Prometheus metrics (bus_circuit_breaker_state gauge, bus_circuit_breaker_trips_total counter, bus_rate_limiter_wait_seconds histogram, bus_group_size histogram, bus_retry_total counter). Total: 16 metrics.
- **Error codes:** Added BUS-016 (RETRY_NOT_ALLOWED, 409)
- **App module updated:** Imports CircuitBreakerModule, RateLimiterModule
- **Unit tests:** 130 new tests across 3 new suites (circuit-breaker: 48, rate-limiter: 33, parsing-group: 22) + updates to existing suites (processing: 17, uploads-service: +8 retry, uploads-controller: +2 retry, metrics: +10). Total: 357 tests across 23 suites.

### 2026-02-27 — Phase 2: XLSX Parsing, Standard Mode Worker & Result Generation

- **Parsing module:** ParsingService with parseHeaders, parseRows (async generator), type coercion (empty cells omitted, JSON parsing, numeric detection, reserved column filtering, boolean preservation, Date → ISO string), detectMode (standard vs group detection by item.* prefix). ParsedRow and ModeDetectionResult interfaces.
- **Event Ingestion HTTP client:** EventIngestionClient using @nestjs/axios HttpModule, POST to EIS /webhooks/events with configurable timeout, maps 2xx → success, 4xx → failed with validation message, 5xx → failed with status code, timeout → "timeout after {ms}ms", ECONNREFUSED → "connection refused".
- **Processing module:** ProcessingService background worker with polling loop (OnModuleInit/OnModuleDestroy), 9-step pipeline (claim → parse → bulk insert → detect mode → batch process → update counters → finalize → generate result → update upload), configurable batch size and concurrency (Promise.allSettled), graceful shutdown (shutdownRequested flag, marks in-progress upload as failed). Standard mode only (group mode detection implemented, processing deferred to Phase 3).
- **Results module:** ResultsService generates result XLSX with _notification_status column appended. Cell styling: sent → green (#E6F4EA/#137333), failed → red (#FCE8E6/#C5221F), skipped → yellow (#FEF7E0/#B05A00). Cleans up original temp file after generation. Paginated row outcome fetching.
- **Result download endpoint:** GET /uploads/:id/result with StreamableFile response, Content-Disposition header, 409 if still processing (BUS-015), 404 if no result file.
- **Metrics additions:** 6 new Prometheus metrics (bus_worker_processing_duration_seconds, bus_worker_batch_duration_seconds, bus_event_submission_duration_seconds, bus_event_submission_total, bus_worker_active_uploads, bus_rows_per_second). Total: 11 metrics.
- **Repository additions:** UploadsRepository.save(), UploadRowsRepository.findPendingBatch()
- **Error codes:** Added BUS-015 (RESULT_NOT_READY, 409)
- **Dependencies added:** @nestjs/axios, axios
- **App module updated:** Imports ParsingModule, EventIngestionModule, ResultsModule, ProcessingModule
- **Unit tests:** 66 new tests across 4 new suites (parsing: 21, event-ingestion: 14, processing: 18, results: 9) + 4 new controller tests. Total: 227 tests across 20 suites.

### 2026-02-27 — Phase 1: Foundation, Data Layer & Upload CRUD

- **Bootstrap:** NestJS scaffold with Pino logger, global DtoValidationPipe, HttpExceptionFilter, LoggingInterceptor, CORS, port 3158
- **Common module (@Global):** BUS-prefixed error codes (BUS-001 through BUS-014), HttpExceptionFilter, DtoValidationPipe, LoggingInterceptor, PgBaseRepository
- **Config module:** app config (port, upload settings, worker settings, group mode, circuit breaker, retention), database config, RabbitMQ placeholder, env validation with class-validator
- **TypeORM entities:** Upload entity (16 columns, UUID PK, status enum), UploadRow entity (11 columns, FK to uploads with CASCADE)
- **Repositories:** UploadsRepository (findWithFilters, claimNextQueued, updateCounters, updateStatus with state machine validation), UploadRowsRepository (bulkInsert, findFailedByUploadId, updateRowStatus, countByStatus)
- **Uploads module:** Controller with 6 endpoints (POST /uploads, GET /uploads, GET /uploads/:id, GET /uploads/:id/status, GET /uploads/:id/errors, DELETE /uploads/:id), Service with full XLSX validation pipeline (8 steps: extension, MIME, size, header, eventType, group key, row limit, min rows), file storage, status tracking
- **Metrics module (@Global):** 5 Prometheus metrics (bus_uploads_total, bus_upload_rows_total, bus_upload_file_size_bytes, bus_upload_duration_seconds, bus_active_uploads), GET /metrics endpoint
- **Health module:** GET /health with @nestjs/terminus DB ping check
- **Database scripts:** uploads table, upload_rows table, 8 indexes, purge_old_uploads() function, updated_at trigger
- **Dependencies:** @nestjs/config, @nestjs/typeorm, @nestjs/terminus, class-validator, class-transformer, exceljs, nestjs-pino, pino, prom-client, pg, typeorm, uuid
- **Unit tests:** 161 tests across 16 suites — errors, filter, pipe, interceptor, env validation, controller, service, repositories, entities, DTOs, metrics, health
