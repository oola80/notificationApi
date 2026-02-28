# Audit Service — Development Changelog

> **Info:** This changelog tracks **code changes only**.
> Design changes are tracked in the root `docs/06-changelog.md`.

## [Unreleased]

### Phase 2 — RabbitMQ Consumer Pipeline with Batch Insert (2026-02-27)

- **RabbitMQ module** — `AppRabbitMQModule` with `@golevelup/nestjs-rabbitmq` v7.1.2, consumer-only setup (no publisher), 4 exchanges (`xch.events.normalized`, `xch.notifications.deliver`, `xch.notifications.status`, `xch.notifications.dlq`), 5 consumed queues, 5 named channels with per-queue prefetch (events:20, deliver:20, status:15, template:10, dlq:5), heartbeat 30s, reconnect 5s.
- **RabbitMQ constants** — Exchange, queue, channel, routing key constants, `ALL_CONSUMED_QUEUES` array, `extractProviderFromWebhookKey()` and `isWebhookRoutingKey()` helper functions.
- **BatchBufferService** — Generic batch buffer accumulating messages up to `CONSUMER_BATCH_SIZE`, flushing on size or timer (`CONSUMER_FLUSH_INTERVAL_MS`). Deferred ACK/NACK via Promises (handler returns `Promise<void | Nack>` that resolves when batch flushes). Transient error detection by PostgreSQL error codes (08000, 08003, 08006, 40001, 40P01, 55P03, 57014) and message patterns (Connection, timeout, ECONNREFUSED, ECONNRESET). NACK+requeue on transient failure, ACK+discard on permanent error, poison message handling after `CONSUMER_MAX_RETRIES` with in-memory fingerprint-based retry tracking. Graceful shutdown via `OnModuleDestroy`.
- **EventsConsumer** — Consumes `audit.events` (routing key `event.#`). Maps messages to `EVENT_INGESTED`/`EVENT_NORMALIZED`/`EVENT_VALIDATION_FAILED`/`EVENT_DUPLICATE_DETECTED` based on auditEventType, status, validationErrors, isDuplicate, and normalizedPayload fields. Actor: `event-ingestion-service`. Batch inserts into `audit_events`.
- **DeliverConsumer** — Consumes `audit.deliver` (routing key `notification.deliver.#`). Maps all messages to `DELIVERY_DISPATCHED`. Actor: `notification-engine-service`. Batch inserts into `audit_events`.
- **StatusConsumer** — Consumes `q.status.updates` with dual routing keys (`notification.status.#`, `adapter.webhook.#`). Delivery-path messages map to `DELIVERY_ATTEMPTED`/`SENT`/`FAILED`/`RETRYING`; creates `DeliveryReceipt` only when status=sent and providerMessageId present. Webhook messages map to `DELIVERED`/`BOUNCED`/`OPENED`/`CLICKED`/`UNSUBSCRIBED`/`SPAM_COMPLAINT`; always creates `DeliveryReceipt`; detects orphaned receipts (no notificationId). Uses compound `StatusBufferRecord` for batch inserts into `audit_events` + `delivery_receipts`.
- **TemplateConsumer** — Consumes `q.audit.template` (routing key `template.#`). Maps routing key action to `TEMPLATE_CREATED`/`UPDATED`/`DELETED`/`ROLLEDBACK`. Actor: `template-service`. Sets notificationId to templateId.
- **DlqConsumer** — Consumes `audit.dlq` (fanout). Extracts `x-death` headers (queue, exchange, routing-keys, reason, count). Creates both `DlqEntry` (status: pending) and `AuditEvent` (type: `DLQ_CAPTURED`). Uses compound `DlqBufferRecord` for batch inserts into `audit_events` + `dlq_entries`.
- **ConsumersModule** — Wires all 5 consumers + BatchBufferService, imports AppRabbitMQModule, EventsModule, ReceiptsModule, DlqModule.
- **PgBaseRepository.insertMany()** — Added bulk insert method using TypeORM `insert()` for efficient batch INSERTs (vs N individual `save()` calls).
- **ConsumerHealthIndicator** — Checks `AmqpConnection.managedChannel` for connection status, fetches per-queue message depths from RabbitMQ Management API, updates `audit_consumer_lag` gauge.
- **Health controller updated** — Readiness endpoint now includes 4 checks: database, rabbitmq, dlqDepth, consumers (was 3).
- **Metrics updated** — Added `audit_poison_messages_total` counter (labels: queue). Now 15 custom metrics (6 counters, 5 histograms, 4 gauges).
- **Unit tests** — 100 new tests across 8 new suites: rabbitmq.constants.spec.ts (11), batch-buffer.service.spec.ts (13), events.consumer.spec.ts (10), deliver.consumer.spec.ts (9), status.consumer.spec.ts (16), template.consumer.spec.ts (10), dlq.consumer.spec.ts (11), consumer-health.indicator.spec.ts (4). Updated health.controller.spec.ts (+2), metrics.service.spec.ts (+2). **Total: 178 unit tests across 26 suites.**
- **E2E tests** — 8 new tests in consumers.e2e-spec.ts (batch flush, timer flush, deserialization errors, status consumer with dual routing keys, DLQ consumer with x-death extraction). Updated app.e2e-spec.ts with ConsumerHealthIndicator mock. **Total: 13 E2E tests across 2 suites.**

### Phase 1 — Foundation, Data Layer, Health & Metrics (2026-02-27)

- **NestJS scaffold** — main.ts bootstrap (Pino logger, global DtoValidationPipe, HttpExceptionFilter, LoggingInterceptor, CORS, port 3156), app.module.ts root module with TypeORM, ConfigModule, LoggerModule.
- **Config module** — AppConfigModule with appConfig (consumer, retention, analytics, search settings), databaseConfig, rabbitmqConfig factories and Joi env validation (all variables from design doc Section 19).
- **Common module** — @Global() with error registry (9 AUD-prefixed codes), ErrorResponse interface, HttpExceptionFilter, DtoValidationPipe, LoggingInterceptor, PgBaseRepository base class.
- **TypeORM entities** — AuditEvent (audit_events, 10 columns), DeliveryReceipt (delivery_receipts, 10 columns), NotificationAnalytics (notification_analytics, 14 columns), DlqEntry (dlq_entries, 13 columns with DlqEntryStatus enum).
- **Repositories** — AuditEventsRepository, DeliveryReceiptsRepository, NotificationAnalyticsRepository, DlqEntriesRepository (with countPending), all extending PgBaseRepository.
- **Feature modules** — EventsModule, ReceiptsModule, AnalyticsModule, DlqModule (TypeORM feature imports, repository providers/exports).
- **Metrics module** — @Global() MetricsModule with MetricsService (14 custom metrics: 5 counters, 5 histograms, 4 gauges per design doc Section 18), MetricsController (GET /metrics in Prometheus text format).
- **Health module** — HealthController (GET /health liveness with service name + timestamp, GET /health/ready readiness with database ping + RabbitMQ Management API check + DLQ pending count), RabbitMQHealthIndicator, DlqPendingHealthIndicator.
- **Database scripts** — audit-service-dbscripts.sql with all 4 tables, 14 indexes (7 for audit_events including GIN for search_vector, 4 for delivery_receipts, 2 for notification_analytics, 1 for dlq_entries), search_vector trigger (update_search_vector function), purge_audit_payloads() function, CHECK constraint on dlq_entries.status.
- **Unit tests** — 78 tests across 18 suites (entity instantiation, repository base methods, config validation, error registry, filter/pipe/interceptor, health indicators, metrics registration).
- **E2E tests** — 5 tests in app.e2e-spec.ts (GET /health, GET /health/ready with healthy/degraded scenarios, GET /metrics).
- **Project config** — package.json (NestJS 11, TypeScript 5.7, Jest 30, prom-client, nestjs-pino, TypeORM), tsconfig.json, .env, .gitignore, .prettierrc, eslint.config.mjs, jest-e2e.json with moduleNameMapper.
