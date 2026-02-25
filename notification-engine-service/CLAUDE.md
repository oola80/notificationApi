# Notification Engine Service

Core orchestrator — rules evaluation, recipient resolution, template rendering dispatch, notification lifecycle management; priority-aware processing via tiered queues.

## Service Info

| Attribute | Value |
|---|---|
| **Port** | 3152 |
| **Technology** | NestJS 11 (TypeScript 5.7) |
| **Runtime** | Node.js (ES2023 target) |
| **DB Schema** | `notification_engine_service` |
| **DB Role** | `notification_engine_service_user_role` |
| **DB User** | `notification_engine_service_user` |

## Implementation Status

**Phase 7 complete** — Performance Optimizations & DB Maintenance.

- **Phase 7:** Circuit breaker for template service (CLOSED/OPEN/HALF_OPEN state machine, configurable threshold and reset timeout, NES-020 error code, Prometheus gauge). Per-queue prefetch via named RabbitMQ channels (channel-critical, channel-normal). Parallel channel processing via Promise.allSettled() in event processing pipeline. 4 new DB indexes (recipient, created_at, rule_id, status_log created_at). Suppression index fix (INCLUDE status, dedup_key_hash IS NOT NULL). FILLFACTOR tuning (notifications 80, notification_recipients 85) + autovacuum tuning for 3 high-write tables. purge_notification_content() PL/pgSQL function for batch content retention. ~504 unit tests across ~51 suites.
- **Phase 6:** Prometheus metrics via `prom-client` — @Global MetricsModule with 14 custom metrics (7 counters, 3 histograms, 4 gauges) + Node.js default metrics. `GET /metrics` endpoint (text/plain Prometheus format). Pipeline and all 3 cache services instrumented with counters/histograms/gauges. Enhanced structured logging across all consumers and pipeline (correlation context, step timing, RabbitMQ context). Manual send endpoint completed: full lifecycle (create → render template → dispatch) with per-recipient/channel error isolation and metrics tracking. Custom health controller (replaces Terminus) with enriched response: database/rabbitmq/templateService latency, queue depths, rule cache status, overall status (healthy/degraded/unhealthy). RuleCacheService lastInvalidation tracking. 5 E2E test files (app, rules, recipient-groups, overrides, notifications) against real infrastructure. 482 unit tests across 49 suites.
- **Phase 5:** RabbitMQ integration via `@golevelup/nestjs-rabbitmq` (5 exchanges, 5 queues). 6 consumers: CriticalEventConsumer (`event.critical.#`), NormalEventConsumer (`event.normal.#`), StatusInboundConsumer (DELIVERED/FAILED from channel-router), RuleCacheInvalidationConsumer (`config.rule.changed`), OverrideCacheInvalidationConsumer (`config.override.changed`) — all with abstract BaseEventConsumer retry/DLQ logic (exponential backoff, configurable max retries). 9-step EventProcessingPipelineService orchestrating all domain services: parse → rule lookup (cache) → match → priority → recipients → channels → suppression → create notification → render template → dispatch. TemplateClientService HTTP client (`@nestjs/axios`) with 3-attempt retry + exponential backoff. RuleCacheService (in-memory Map, eager warm-up, RabbitMQ-driven invalidation with timestamp comparison). NotificationPublisherService (publishToDeliver, publishStatus, publishConfigEvent). RabbitMQ health indicator (connection check + queue depth monitoring). Cache invalidation publishing wired into NotificationRulesService and CriticalChannelOverridesService. 4 new error codes (NES-016–NES-019). 452 unit tests across 47 suites.
- **Phase 4:** Notification CRUD (`GET /notifications`, `GET /notifications/:id`, `GET /notifications/:id/timeline`, `POST /notifications/send`). Notification entity (BIGSERIAL PK, UUID notification_id unique, status state machine). Lifecycle service with valid-transitions map (PENDING→PROCESSING→SUPPRESSED|RENDERING→FAILED|DELIVERING→SENT→DELIVERED|FAILED), synchronous status update, asynchronous fire-and-forget status log. Suppression engine: DedupKeyResolverService (field resolution, pipe concatenation, SHA-256 hash), SuppressionEvaluatorService (3 modes: dedup, cooldown, maxCount — short-circuit, FAILED exclusion). NotificationStatusLog and NotificationRecipient entities. 1 new error code (NES-015), 3 new DB tables, 5 new indexes. 333 unit tests across 35 suites.
- **Phase 3:** Recipient groups CRUD (`POST/GET/PUT /recipient-groups`) with member management (bulk add/deactivate). Customer channel preferences webhook (`POST /customer-preferences`, `POST /customer-preferences/bulk`) with X-API-Key guard, upsert-on-conflict, LRU read-through cache (configurable TTL/max size). Critical channel overrides CRUD (`POST/GET/GET :id/PUT/DELETE /critical-channel-overrides`) with eager in-memory cache. RecipientResolverService (customer/group/custom types). ChannelResolverService (preferences filtering + override merging). 4 new error codes (NES-011–NES-014), 4 new DB tables, 4 new config values. 227 unit tests across 27 suites.
- **Phase 2:** Rules CRUD endpoints (`POST/GET/GET :id/PUT/DELETE /rules`) + standalone rule evaluation engine. Entity, DTOs (with `@ValidateNested` actions array), repository (JSONB duplicate detection via `@>`/`<@`), service (CRUD with NES-002/NES-006 error handling), controller (thin delegation). Rule engine: ConditionEvaluatorService (10 operators, AND logic), RuleMatcherService (priority-sorted matching, exclusive rule support), PriorityResolverService (rule overrides event priority). `notification_rules` table DDL added. 125 unit tests across 13 suites.
- **Phase 1:** Project foundation — global middleware (DtoValidationPipe, HttpExceptionFilter, LoggingInterceptor), configuration module (app, database, RabbitMQ configs with env validation), TypeORM connection (`notification_engine_service` schema, synchronize: false), common module (error registry with 14 NES-prefixed codes, PgBaseRepository base class), health endpoint (DB ping only). 36 unit tests passing across 7 suites.

## Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@nestjs/common` | ^11.0.1 | NestJS core framework |
| `@nestjs/core` | ^11.0.1 | NestJS core framework |
| `@nestjs/platform-express` | ^11.0.1 | Express HTTP adapter |
| `@nestjs/config` | ^4.0.3 | Configuration management (registerAs, env validation) |
| `@nestjs/typeorm` | ^11.0.0 | TypeORM integration for NestJS |
| `@nestjs/terminus` | ^11.1.1 | Health checks (RabbitMQHealthIndicator base) |
| `prom-client` | ^15.1.3 | Prometheus metrics (Registry, Counter, Histogram, Gauge) |
| `@nestjs/mapped-types` | ^2.1.0 | PartialType/OmitType for DTOs |
| `@nestjs/axios` | ^4.0.1 | HTTP client module (template service) |
| `@golevelup/nestjs-rabbitmq` | ^7.1.2 | RabbitMQ integration (AMQP consumers, publisher) |
| `axios` | ^1.7.0 | HTTP client (used by @nestjs/axios) |
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

- `notification_rules` — Rule definitions (UUID PK, JSONB conditions/actions/suppression, priority ordering, exclusive flag, delivery priority override). Index: `idx_rules_event_type_active` on `(event_type, is_active, priority)`.
- `recipient_groups` — Recipient group definitions (UUID PK, unique name, description, isActive). Groups of recipients for notification delivery.
- `recipient_group_members` — Group members (BIGINT identity PK, FK→recipient_groups ON DELETE CASCADE, email/phone/deviceToken/memberName, isActive). Index: `idx_group_members_group` on `(group_id, is_active)`.
- `customer_channel_preferences` — Per-customer per-channel opt-in/opt-out preferences (BIGINT identity PK, unique customer_id+channel, FILLFACTOR 90, autovacuum tuning). Index: `idx_cust_prefs_customer_id` on `customer_id`.
- `critical_channel_overrides` — Forced-channel rules per event type (UUID PK, unique event_type+channel, reason, created_by/updated_by). Partial index: `idx_overrides_event_type_active` on `event_type WHERE is_active = true`.
- `notifications` — Core notification records (BIGSERIAL PK, UUID notification_id unique, event/rule/template refs, status state machine, dedup hash, rendered content, correlation/cycle tracking, FILLFACTOR 80, autovacuum tuned). Indexes: `idx_notifications_suppression` (rule_id, dedup_key_hash, created_at DESC INCLUDE status WHERE dedup_key_hash IS NOT NULL AND status != 'FAILED'), `idx_notifications_status` (status, created_at DESC), `idx_notifications_event_id` (event_id), `idx_notifications_recipient` (recipient_email, created_at DESC), `idx_notifications_created_at` (created_at), `idx_notifications_rule_id` (rule_id, created_at DESC).
- `notification_status_log` — Immutable audit log of notification status transitions (BIGSERIAL PK, notification_id, from/to status, channel, metadata JSONB, autovacuum tuned). Indexes: `idx_status_log_notification_id` (notification_id, created_at ASC), `idx_status_log_created_at` (created_at).
- `notification_recipients` — Per-notification recipient details (BIGSERIAL PK, notification_id, recipient_type, contact info, status, FILLFACTOR 85, autovacuum tuned). Index: `idx_recipients_notification_id` (notification_id).

## RabbitMQ

**Publishes to:**
- `xch.notifications.deliver` — routing key `notification.deliver.{priority}.{channel}` (8 patterns: critical/normal x email/sms/whatsapp/push)
- `xch.notifications.status` — lifecycle status transitions (processing, rendering, delivering, suppressed)
- `xch.config.events` — config change invalidation (rule.changed, override.changed)

**Consumes from:**
- `q.engine.events.critical` — bound to `xch.events.normalized` via `event.critical.#` (4 consumers, prefetch 5)
- `q.engine.events.normal` — bound to `xch.events.normalized` via `event.normal.#` (2 consumers, prefetch 10)
- `q.engine.status.inbound` — bound to `xch.notifications.status` via `notification.status.delivered` / `notification.status.failed` (2 consumers, prefetch 10)
- `q.config.rule-cache` — bound to `xch.config.events` via `config.rule.changed` (1 consumer, prefetch 1)
- `q.config.override-cache` — bound to `xch.config.events` via `config.override.changed` (1 consumer, prefetch 1)

## Environment Variables

Configured via `.env` file in the service root (git-ignored). Required for local development:

| Variable | Description | Dev Value |
|---|---|---|
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | HTTP listen port | `3152` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5433` |
| `DB_NAME` | PostgreSQL database name | `postgres` |
| `DB_SCHEMA` | PostgreSQL schema | `notification_engine_service` |
| `DB_USER` | PostgreSQL user | `notification_engine_service_user` |
| `DB_PASSWORD` | PostgreSQL password | *(see .env)* |
| `RABBITMQ_HOST` | RabbitMQ host | `localhost` |
| `RABBITMQ_PORT` | RabbitMQ AMQP port | `5672` |
| `RABBITMQ_MANAGEMENT_URL` | RabbitMQ Management UI URL | `http://localhost:15672` |
| `RABBITMQ_VHOST` | RabbitMQ virtual host | `vhnotificationapi` |
| `RABBITMQ_USER` | RabbitMQ user | `notificationapi` |
| `RABBITMQ_PASSWORD` | RabbitMQ password | *(see .env)* |
| `TEMPLATE_SERVICE_URL` | Template service base URL | `http://localhost:3153` |
| `RULE_CACHE_ENABLED` | Enable in-memory rule cache | `false` |
| `PREFERENCE_WEBHOOK_API_KEY` | API key for customer preference webhook | *(see .env)* |
| `PREF_CACHE_ENABLED` | Enable preference LRU cache | `true` |
| `PREF_CACHE_TTL_SECONDS` | Preference cache TTL in seconds | `300` |
| `PREF_CACHE_MAX_SIZE` | Max entries in preference cache | `50000` |
| `OVERRIDE_CACHE_ENABLED` | Enable override eager cache | `true` |
| `TEMPLATE_SERVICE_CB_THRESHOLD` | Circuit breaker failure threshold | `5` |
| `TEMPLATE_SERVICE_CB_RESET_MS` | Circuit breaker reset timeout (ms) | `60000` |
| `RABBITMQ_PREFETCH_CRITICAL` | Prefetch count for critical event queue | `5` |
| `RABBITMQ_PREFETCH_NORMAL` | Prefetch count for normal event queue | `10` |

## Dependencies

- PostgreSQL, RabbitMQ
- template-service (:3153) via HTTP for template rendering

## Related Services

- Upstream: event-ingestion-service (:3151) produces normalized events
- Downstream: channel-router-service (:3154) receives delivery messages
- Collaborators: template-service (:3153), audit-service (:3156)

## Key References

- Design doc: `docs/08-notification-engine-service.md` (convenience copy) — authoritative at `../../docs/08-notification-engine-service.md`
- Endpoints: `../../endpoints/endpoints-notification-engine-service.md`
- DB schema script: `dbscripts/schema-notification-engine-service.sql`
- DB objects script: `dbscripts/notification-engine-service-dbscripts.sql` — **must be updated on every database change**

## Coding Conventions

- Follow NestJS module structure (module, controller, service, dto)
- Use class-validator for DTO validation
- Rule evaluation must be cached and invalidated via RabbitMQ config events
- Critical events get higher consumer concurrency and lower prefetch
- All consumer handlers must be idempotent
- Notification lifecycle tracked via status log entries

## Coding Standards

1. **camelCase for JSON** — Always use camelCase notation for naming JSON object properties in request payloads and response bodies.

2. **Layered Architecture (Controllers → Services → Repositories)** — Strict separation of concerns:
   - **Controllers** — Thin HTTP handlers that only inject services and delegate. Zero business logic.
   - **Services** — All business orchestration lives here. Coordinate between repositories, helpers, and other services.
   - **Repositories** — Sole data access point, whether PostgreSQL (via TypeORM extending a `PgBaseRepository`) or external APIs.

3. **Standardized Error Responses** — All errors follow a consistent JSON schema:
   - Schema: `{ code: string, details: string, message: string, status: number, stack?: string }`
   - Example: `{ "code": "NES-001", "details": "INVALID_REQUEST_BODY", "message": "The request body is invalid", "status": 400 }`
   - **Error Registry (`errors.ts`)** — Centralized error code definitions with HTTP status, message, and details. Error codes use domain-specific prefixes (e.g., `NES-` for Notification Engine Service). No duplicates.
   - **Global Exception Filter** — A single `@Catch(HttpException)` filter maps every thrown exception to the standardized JSON response `{ code, details, message, status }`.

4. **Global Middleware via NestJS Bootstrap (`main.ts`)** — Cross-cutting concerns applied once at the application level:
   - **DtoValidationPipe** — Automatic request body validation via `class-validator` decorators on DTOs.
   - **HttpExceptionFilter** — The centralized error filter described above.
   - **LoggingInterceptor** — Structured HTTP request/response logging (Pino) with service metadata, timing, and severity-based log levels (`warn` for 4xx, `error` for 5xx).

## Current Folder Structure

```
notification-engine-service/
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
    main.ts                    # Bootstrap: Pino logger, global pipes/filters/interceptors, CORS, port 3152
    app.module.ts              # Root module: Config, Logger, TypeORM, Common, Metrics, Health, Rules, Recipients, Preferences, Overrides, Notifications, RabbitMQ, TemplateClient, Consumers
    common/
      common.module.ts         # @Global() module
      errors.ts                # Error registry (20 NES-prefixed codes) + createErrorResponse()
      errors.spec.ts           # Unit tests for error registry
      interfaces/
        error-response.interface.ts  # { code, details, message, status, stack? }
      filters/
        http-exception.filter.ts     # Global @Catch(HttpException) → standardized JSON
        http-exception.filter.spec.ts
      pipes/
        dto-validation.pipe.ts       # Extends ValidationPipe, NES-001 wrapping
        dto-validation.pipe.spec.ts
      interceptors/
        logging.interceptor.ts       # HTTP request/response logging (info/warn/error)
        logging.interceptor.spec.ts
      base/
        pg-base.repository.ts        # Abstract base repository (composition pattern)
        pg-base.repository.spec.ts
    config/
      config.module.ts         # ConfigModule.forRoot (isGlobal, env validation)
      app.config.ts            # port, nodeEnv, ruleCacheEnabled, preferenceWebhookApiKey, templateServiceUrl, prefCache*, overrideCacheEnabled, templateServiceCb*
      database.config.ts       # PostgreSQL connection params
      rabbitmq.config.ts       # RabbitMQ connection params + prefetch, retry/DLQ config, per-queue prefetch (critical/normal)
      env.validation.ts        # class-validator EnvironmentVariables + validate()
      env.validation.spec.ts
    metrics/
      metrics.module.ts        # @Global() module — exports MetricsService
      metrics.service.ts       # prom-client Registry: 7 counters, 3 histograms, 4 gauges + default metrics
      metrics.service.spec.ts
      metrics.controller.ts    # GET /metrics → Prometheus text format (text/plain; version=0.0.4)
      metrics.controller.spec.ts
    health/
      health.module.ts         # Health module (DB, RabbitMQ, template service, queue depths, rule cache)
      health.controller.ts     # GET /health → custom enriched response (healthy/degraded/unhealthy)
      health.controller.spec.ts
      rabbitmq.health-indicator.ts   # RabbitMQ connection + queue depth monitoring
      rabbitmq.health-indicator.spec.ts
    rules/
      rules.module.ts                        # Feature module (TypeORM, services, controller, imports AppRabbitMQModule)
      notification-rules.controller.ts       # @Controller('rules') — 5 endpoints
      notification-rules.controller.spec.ts
      notification-rules.service.ts          # CRUD + duplicate check + config event publishing (NES-002, NES-006)
      notification-rules.service.spec.ts
      notification-rules.repository.ts       # Extends PgBaseRepository, JSONB queries
      notification-rules.repository.spec.ts
      rule-cache.service.ts                  # In-memory Map cache (eventType→rules), eager warm-up, RabbitMQ invalidation
      rule-cache.service.spec.ts
      entities/
        notification-rule.entity.ts          # TypeORM entity (15 columns, notification_rules table)
      dto/
        index.ts                             # Barrel export
        rule-action.dto.ts                   # Nested action validation
        create-rule.dto.ts                   # @ValidateNested actions array
        update-rule.dto.ts                   # PartialType(OmitType(Create, [createdBy, eventType]))
        list-rules-query.dto.ts              # Pagination + eventType/isActive filters
      rule-engine/
        condition-evaluator.service.ts       # 10 operators, AND logic, null=match-all
        condition-evaluator.service.spec.ts
        rule-matcher.service.ts              # Priority-sorted matching, exclusive rules
        rule-matcher.service.spec.ts
        priority-resolver.service.ts         # Rule overrides event priority
        priority-resolver.service.spec.ts
    recipients/
      recipients.module.ts                           # Feature module (TypeORM, services, controller, imports Preferences+Overrides)
      recipient-groups.controller.ts                 # @Controller('recipient-groups') — 3 endpoints
      recipient-groups.controller.spec.ts
      recipient-groups.service.ts                    # CRUD + name uniqueness (NES-004, NES-014)
      recipient-groups.service.spec.ts
      recipient-groups.repository.ts                 # Extends PgBaseRepository, member management
      recipient-groups.repository.spec.ts
      recipient-resolver.service.ts                  # Resolves recipients by type (customer/group/custom)
      recipient-resolver.service.spec.ts
      channel-resolver.service.ts                    # Resolves effective channels (preferences + overrides)
      channel-resolver.service.spec.ts
      entities/
        recipient-group.entity.ts                    # TypeORM entity (recipient_groups table)
        recipient-group-member.entity.ts             # TypeORM entity (recipient_group_members table)
      dto/
        index.ts                                     # Barrel export
        create-recipient-group.dto.ts                # @ValidateNested members array
        update-recipient-group.dto.ts                # addMembers/removeMemberIds
        list-recipient-groups-query.dto.ts           # Pagination + isActive filter
        recipient-group-member.dto.ts                # Nested member validation
      interfaces/
        resolved-recipient.interface.ts              # ResolvedRecipient type
        channel-resolution-result.interface.ts       # ChannelResolutionResult type
    preferences/
      preferences.module.ts                          # Feature module (TypeORM, cache, guard)
      customer-preferences.controller.ts             # @Controller('customer-preferences') — 2 endpoints
      customer-preferences.controller.spec.ts
      customer-preferences.service.ts                # Upsert + bulk + cache eviction
      customer-preferences.service.spec.ts
      customer-preferences.repository.ts             # Upsert-focused (INSERT ON CONFLICT DO UPDATE)
      customer-preferences.repository.spec.ts
      preference-cache.service.ts                    # LRU read-through cache (TTL + max size)
      preference-cache.service.spec.ts
      entities/
        customer-channel-preference.entity.ts        # TypeORM entity (customer_channel_preferences table)
      dto/
        index.ts                                     # Barrel export
        upsert-preference.dto.ts                     # Single upsert validation
        bulk-upsert-preferences.dto.ts               # Bulk upsert (@ArrayMaxSize 1000)
      guards/
        preference-webhook.guard.ts                  # X-API-Key validation (NES-013)
        preference-webhook.guard.spec.ts
    overrides/
      overrides.module.ts                            # Feature module (TypeORM, cache, imports AppRabbitMQModule)
      critical-channel-overrides.controller.ts       # @Controller('critical-channel-overrides') — 5 endpoints
      critical-channel-overrides.controller.spec.ts
      critical-channel-overrides.service.ts          # CRUD + cache invalidation + config event publishing (NES-005, NES-011)
      critical-channel-overrides.service.spec.ts
      critical-channel-overrides.repository.ts       # Extends PgBaseRepository, active override queries
      critical-channel-overrides.repository.spec.ts
      override-cache.service.ts                      # Eager in-memory Map cache (eventType→channels[])
      override-cache.service.spec.ts
      entities/
        critical-channel-override.entity.ts          # TypeORM entity (critical_channel_overrides table)
      dto/
        index.ts                                     # Barrel export
        create-override.dto.ts                       # Create validation
        update-override.dto.ts                       # Update validation (reason, isActive, updatedBy)
        list-overrides-query.dto.ts                  # Pagination + eventType/isActive filters
    notifications/
      notifications.module.ts                        # Feature module (TypeORM, 3 entities, services, controller)
      notifications.controller.ts                    # @Controller('notifications') — 4 endpoints
      notifications.controller.spec.ts
      notifications.service.ts                       # CRUD + manual send + find with filters
      notifications.service.spec.ts
      notifications.repository.ts                    # Extends PgBaseRepository, suppression queries, date-range filters
      notifications.repository.spec.ts
      notification-status-log.repository.ts          # Status log CRUD (createLogEntry, findByNotificationId)
      notification-status-log.repository.spec.ts
      notification-recipients.repository.ts          # Batch create, findByNotificationId
      notification-recipients.repository.spec.ts
      notification-lifecycle.service.ts              # State machine (VALID_TRANSITIONS map, transition validation, fire-and-forget log)
      notification-lifecycle.service.spec.ts
      entities/
        notification.entity.ts                       # TypeORM entity (notifications table, BIGSERIAL PK, UUID notification_id)
        notification-status-log.entity.ts            # TypeORM entity (notification_status_log table)
        notification-recipient.entity.ts             # TypeORM entity (notification_recipients table)
      dto/
        index.ts                                     # Barrel export
        list-notifications-query.dto.ts              # Pagination + 7 filters (status, channel, eventType, ruleId, recipientEmail, dateFrom, dateTo)
        manual-send.dto.ts                           # ManualSendDto + ManualSendRecipientDto
      suppression/
        dedup-key-resolver.service.ts                # Field resolution, pipe concatenation, SHA-256 hash
        dedup-key-resolver.service.spec.ts
        suppression-evaluator.service.ts             # 3 modes (dedup, cooldown, maxCount), short-circuit, FAILED exclusion
        suppression-evaluator.service.spec.ts
    rabbitmq/
      rabbitmq.module.ts                     # AppRabbitMQModule: @golevelup/nestjs-rabbitmq forRootAsync (5 exchanges, prefetch, heartbeat)
      rabbitmq.constants.ts                  # Exchange/queue constants, routing key builders
      rabbitmq.constants.spec.ts
      notification-publisher.service.ts      # publishToDeliver, publishStatus, publishConfigEvent
      notification-publisher.service.spec.ts
      interfaces/
        normalized-event-message.interface.ts  # Inbound message shape from EIS
        deliver-message.interface.ts           # Outbound message to channel-router
    template-client/
      template-client.module.ts              # HttpModule.registerAsync (baseURL from config, 5s timeout)
      template-client.service.ts             # render() with circuit breaker + 3 retries, exponential backoff (NES-018, NES-019, NES-020)
      template-client.service.spec.ts
      circuit-breaker.service.ts             # Circuit breaker state machine (CLOSED/OPEN/HALF_OPEN, configurable threshold/reset)
      circuit-breaker.service.spec.ts
    consumers/
      consumers.module.ts                    # Imports all feature modules + RabbitMQ + TemplateClient
      base-event.consumer.ts                 # Abstract base: retryOrDlq, isRetryable, exponential backoff
      base-event.consumer.spec.ts
      critical-event.consumer.ts             # @RabbitSubscribe event.critical.# → pipeline
      critical-event.consumer.spec.ts
      normal-event.consumer.ts               # @RabbitSubscribe event.normal.# → pipeline
      normal-event.consumer.spec.ts
      rule-cache-invalidation.consumer.ts    # @RabbitSubscribe config.rule.changed → RuleCacheService
      rule-cache-invalidation.consumer.spec.ts
      override-cache-invalidation.consumer.ts   # @RabbitSubscribe config.override.changed → OverrideCacheService
      override-cache-invalidation.consumer.spec.ts
      status-inbound.consumer.ts             # @RabbitSubscribe notification.status.delivered/failed → lifecycle
      status-inbound.consumer.spec.ts
      event-processing-pipeline.service.ts   # 9-step pipeline orchestrating all domain services
      event-processing-pipeline.service.spec.ts
  test/
    test-utils.ts              # Shared E2E helper: createTestApp(), cleanupTestData()
    app.e2e-spec.ts            # E2E: enriched health response + metrics endpoint
    rules.e2e-spec.ts          # E2E: rules CRUD lifecycle, validation, duplicate detection
    recipient-groups.e2e-spec.ts  # E2E: recipient groups CRUD + member management
    overrides.e2e-spec.ts      # E2E: critical channel overrides CRUD + duplicate detection
    notifications.e2e-spec.ts  # E2E: notifications list/filter/findById/timeline
    jest-e2e.json              # Jest E2E config (moduleNameMapper, 30s timeout)
  dbscripts/
    schema-notification-engine-service.sql       # Schema/role/user/grants only
    notification-engine-service-dbscripts.sql    # All table/index/function DDL
  docs/
    08-notification-engine-service.md
    changelog_dev.md
```
