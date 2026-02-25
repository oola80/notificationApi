# Notification Engine Service — Development Changelog

> **Info:** This changelog tracks **code changes only**.
> Design changes are tracked in the root `docs/06-changelog.md`.

## [Unreleased]

### 2026-02-24 — Phase 7: Performance Optimizations & DB Maintenance

**Added:**
- `src/template-client/circuit-breaker.service.ts` — Circuit breaker state machine for template service:
  - 3 states: CLOSED (0), OPEN (1), HALF_OPEN (2) with configurable failure threshold and reset timeout
  - `execute<T>(fn)` wraps template render calls; rejects immediately with NES-020 when OPEN
  - Transitions: CLOSED → OPEN (after `threshold` consecutive failures), OPEN → HALF_OPEN (after `resetMs` elapsed), HALF_OPEN → CLOSED (on success) or OPEN (on failure)
  - NES-019 (template not found) excluded from failure tracking (business error, not service outage)
  - Reports state via `nes_template_service_circuit_state` Prometheus gauge on every transition
- `src/template-client/circuit-breaker.service.spec.ts` — 16 unit tests covering all state transitions, NES-019 exclusion, metrics gauge updates
- Error code NES-020 (503, TEMPLATE_SERVICE_CIRCUIT_OPEN) — thrown when circuit breaker is open
- Prometheus gauge `nes_template_service_circuit_state` (0=closed, 1=open, 2=half-open) + `setTemplateServiceCircuitState()` helper
- 4 new environment variables: `TEMPLATE_SERVICE_CB_THRESHOLD` (default 5), `TEMPLATE_SERVICE_CB_RESET_MS` (default 60000), `RABBITMQ_PREFETCH_CRITICAL` (default 5), `RABBITMQ_PREFETCH_NORMAL` (default 10)
- DB indexes: `idx_notifications_recipient` (recipient_email, created_at DESC), `idx_notifications_created_at` (created_at), `idx_notifications_rule_id` (rule_id, created_at DESC), `idx_status_log_created_at` (created_at)
- DB function `purge_notification_content()` — PL/pgSQL function that NULLs `rendered_content` in batches (default 10000) for rows older than threshold (default 90 days), with `pg_sleep(0.1)` yield and `FOR UPDATE SKIP LOCKED`
- 22 new unit tests: circuit-breaker (16), template-client (2), metrics (2), event-processing-pipeline (2)
- Total: ~504 unit tests across ~51 suites (482 Phase 1–6 + 22 Phase 7)

**Changed:**
- `src/template-client/template-client.service.ts` — Wrapped `render()` with circuit breaker: original body moved to `private executeRender()`, new `render()` delegates via `circuitBreakerService.execute()`
- `src/template-client/template-client.module.ts` — Added `CircuitBreakerService` to providers and exports
- `src/consumers/base-event.consumer.ts` — Added NES-020 to `NON_RETRYABLE_CODES` set (circuit-open errors should not be retried)
- `src/consumers/event-processing-pipeline.service.ts` — Replaced sequential `for...of` channel loop with `Promise.allSettled()` for parallel channel processing (each channel creates independent notifications)
- `src/consumers/critical-event.consumer.ts` — Added `channel: 'channel-critical'` to `@RabbitSubscribe` decorator for per-queue prefetch
- `src/consumers/normal-event.consumer.ts` — Added `channel: 'channel-normal'` to `@RabbitSubscribe` decorator for per-queue prefetch
- `src/rabbitmq/rabbitmq.module.ts` — Added named channels (`channel-critical` with prefetch from config, `channel-normal` with prefetch from config) alongside existing global prefetchCount
- `src/config/app.config.ts` — Added `templateServiceCbThreshold`, `templateServiceCbResetMs` config values
- `src/config/rabbitmq.config.ts` — Added `prefetchCritical`, `prefetchNormal` config values
- `src/config/env.validation.ts` — Added 4 new optional env var validators (TEMPLATE_SERVICE_CB_THRESHOLD, TEMPLATE_SERVICE_CB_RESET_MS, RABBITMQ_PREFETCH_CRITICAL, RABBITMQ_PREFETCH_NORMAL)
- `src/common/errors.ts` — Added NES-020 error code (20 total, up from 19)
- `src/metrics/metrics.service.ts` — Added `templateServiceCircuitState` gauge + `setTemplateServiceCircuitState()` helper (14 custom metrics, up from 13)
- `dbscripts/notification-engine-service-dbscripts.sql`:
  - Fixed `idx_notifications_suppression`: added `INCLUDE (status)` for index-only scans and `dedup_key_hash IS NOT NULL` to shrink index
  - Added FILLFACTOR 80 to `notifications` table, FILLFACTOR 85 to `notification_recipients` table
  - Added autovacuum tuning to `notifications` (0.02/0.01/2ms), `notification_status_log` (0.05/0.02), `notification_recipients` (0.05/0.02)
  - Added 4 new indexes and `purge_notification_content()` function

### 2026-02-24 — Phase 6: Metrics, Structured Logging, Manual Send & E2E Tests

**Added:**
- `src/metrics/` module (`@Global()`):
  - `metrics.module.ts` — Global module exporting MetricsService
  - `metrics.service.ts` — `prom-client` Registry with 13 custom metrics:
    - **Counters:** `nes_events_consumed_total` (priority, eventType), `nes_rules_matched_total` (eventType, ruleId), `nes_notifications_created_total` (channel, priority), `nes_notifications_suppressed_total` (mode, ruleId), `nes_notifications_dispatched_total` (channel, priority), `nes_notifications_failed_total` (channel, reason), `nes_template_render_total` (channel, status)
    - **Histograms:** `nes_event_processing_duration_seconds` (priority), `nes_template_render_duration_seconds` (channel), `nes_rule_evaluation_duration_seconds` (no labels)
    - **Gauges:** `nes_rule_cache_size`, `nes_preference_cache_size`, `nes_override_cache_size`
    - Helper methods: incrementEventsConsumed, incrementRulesMatched, incrementNotificationsCreated, incrementSuppressed, incrementDispatched, incrementFailed, incrementTemplateRender, observeEventProcessing, observeTemplateRender, observeRuleEvaluation, setRuleCacheSize, setPreferenceCacheSize, setOverrideCacheSize
    - Implements `OnModuleInit` calling `collectDefaultMetrics()` for Node.js process metrics
  - `metrics.controller.ts` — `GET /metrics` returning Prometheus text format (`text/plain; version=0.0.4`)
  - `metrics.service.spec.ts` — 16 unit tests (counters, histograms, gauges, default metrics)
  - `metrics.controller.spec.ts` — 3 unit tests (content-type, status code)
- E2E test infrastructure:
  - `test/test-utils.ts` — Shared helper: `createTestApp()` (boots real AppModule with global pipes/filters/interceptors), `cleanupTestData()` (deletes test data from DB)
  - `test/app.e2e-spec.ts` — Rewritten for enriched health response + metrics endpoint
  - `test/rules.e2e-spec.ts` — Full CRUD lifecycle (POST→GET list→GET :id→PUT→DELETE→verify soft-delete), validation (400/NES-001), duplicate detection (409/NES-006)
  - `test/recipient-groups.e2e-spec.ts` — Create with members, list, update members, validation
  - `test/overrides.e2e-spec.ts` — Full CRUD lifecycle, duplicate detection (409/NES-011)
  - `test/notifications.e2e-spec.ts` — List with pagination, filter by status, findById (notification+timeline+recipients), timeline endpoint, 404 for non-existent
- 30 unit tests across 2 new suites (metrics service, metrics controller)
- Total: 482 unit tests across 49 suites (452 Phase 1–5 + 30 Phase 6)

**Changed:**
- `src/app.module.ts` — Added `MetricsModule` import
- `src/consumers/event-processing-pipeline.service.ts` — Injected MetricsService:
  - Wrapped `processEvent()` with `process.hrtime.bigint()` timer for `nes_event_processing_duration_seconds`
  - Added `incrementEventsConsumed()` after event parse
  - Added rule evaluation timing (`nes_rule_evaluation_duration_seconds`) and `incrementRulesMatched()` per matched rule
  - Added `incrementSuppressed()` on suppression
  - Added `incrementNotificationsCreated()` after notification creation
  - Added template render timing + `incrementTemplateRender()` success/failure
  - Added `incrementDispatched()` and `incrementFailed()` for dispatch outcomes
  - Replaced all string-based logger calls with structured objects (`{ msg, correlationId, eventId, eventType, sourceId, cycleId, step, ... }`)
- `src/consumers/critical-event.consumer.ts` — Structured logging with `{ queue, routingKey, retryCount }` context
- `src/consumers/normal-event.consumer.ts` — Same structured logging pattern
- `src/consumers/status-inbound.consumer.ts` — Structured logging with `{ notificationId, fromStatus, toStatus, queue }` context
- `src/consumers/base-event.consumer.ts` — Structured logging in `retryOrDlq` with `{ retryCount, maxRetries, delayMs, routingKey }` context
- `src/rules/rule-cache.service.ts` — Injected MetricsService, added `lastInvalidation` field with `getLastInvalidation()` getter, calls `setRuleCacheSize()` after warmUp/invalidateRule/cache-miss population
- `src/preferences/preference-cache.service.ts` — Injected MetricsService, calls `setPreferenceCacheSize()` in set/evict/clear
- `src/overrides/override-cache.service.ts` — Injected MetricsService, calls `setOverrideCacheSize()` in refresh/invalidate
- `src/notifications/dto/manual-send.dto.ts` — Added `@IsObject() @IsOptional() data?: Record<string, any>` field for template variables
- `src/notifications/notifications.module.ts` — Added `TemplateClientModule` and `AppRabbitMQModule` to imports
- `src/notifications/notifications.service.ts` — Complete rewrite of `manualSend()`:
  - Added 4 new dependencies: NotificationLifecycleService, TemplateClientService, NotificationPublisherService, MetricsService
  - Changed return type from `Notification[]` to `ManualSendResult[]`
  - Full lifecycle per recipient+channel: create (PENDING) → PROCESSING → render template → RENDERING → DELIVERING → dispatch → SENT
  - Error handling: render failure → FAILED with template_render metrics; dispatch failure → FAILED with dispatch metrics
  - Metrics: incrementNotificationsCreated, observeTemplateRender, incrementTemplateRender, incrementDispatched/incrementFailed
- `src/health/health.module.ts` — Removed `TerminusModule` import, added `RulesModule` import for RuleCacheService
- `src/health/health.controller.ts` — Complete rewrite: custom controller (replaces Terminus) with enriched response matching design doc:
  - `database`: timed `SELECT 1` query → `{ status: 'up'|'down', latencyMs }`
  - `rabbitmq`: `amqpConnection.connected` → `{ status: 'up'|'down', latencyMs }`
  - `templateService`: HTTP HEAD with 3s timeout → `{ status: 'up'|'down', latencyMs }`
  - `queues`: queue depths via RabbitMQHealthIndicator → `{ depth, consumers }` per queue
  - `ruleCache`: `{ enabled, ruleCount, lastInvalidation }`
  - Overall status: "healthy" | "degraded" (template down) | "unhealthy" (DB/RabbitMQ down)
- Updated specs: event-processing-pipeline, rule-cache, preference-cache, override-cache, notifications.service, health.controller (all mock MetricsService)
- `test/jest-e2e.json` — Added `moduleNameMapper` for `.js` extension resolution, `testTimeout: 30000`
- `package.json` — Added `prom-client` dependency

### 2026-02-24 — Phase 5: RabbitMQ Integration & Event Processing Pipeline

**Added:**
- `src/rabbitmq/` module:
  - `rabbitmq.module.ts` — `AppRabbitMQModule` wrapping `@golevelup/nestjs-rabbitmq` `RabbitMQModule.forRootAsync()` with 5 exchanges (3 passive: `xch.events.normalized`, `xch.notifications.dlq`, `xch.config.events`; 2 own: `xch.notifications.deliver`, `xch.notifications.status`), prefetch from config, heartbeat 30s, reconnect 5s, enableControllerDiscovery
  - `rabbitmq.constants.ts` — 5 exchange constants, 5 queue constants, 3 routing key utilities (`deliverRoutingKey`, `statusRoutingKey`, `parseNormalizedRoutingKey`)
  - `notification-publisher.service.ts` — 3 methods: `publishToDeliver` (async, throws NES-016), `publishStatus` (fire-and-forget), `publishConfigEvent` (fire-and-forget)
  - `interfaces/normalized-event-message.interface.ts` — Inbound message shape from EIS (eventId, correlationId, sourceId, cycleId, eventType, priority, normalizedPayload, publishedAt)
  - `interfaces/deliver-message.interface.ts` — Outbound message to channel-router (notificationId, eventId, ruleId, channel, priority, recipient, content, media, metadata)
- `src/template-client/` module:
  - `template-client.module.ts` — `HttpModule.registerAsync` with baseURL from config, 5s timeout
  - `template-client.service.ts` — `render()` with 3-attempt retry + exponential backoff (1s/3s/9s), 404→NES-019, 5xx/timeout→NES-018
- `src/consumers/` module:
  - `base-event.consumer.ts` — Abstract base class: `retryOrDlq` (exponential backoff, configurable max retries, `Nack(false)` for DLQ), `isRetryable` (NON_RETRYABLE_CODES: NES-002/003/009/015/019), `calculateDelay`
  - `critical-event.consumer.ts` — `@RabbitSubscribe` on `xch.events.normalized`, routing key `event.critical.#`, queue `q.engine.events.critical`, delegates to EventProcessingPipelineService
  - `normal-event.consumer.ts` — Same pattern for `event.normal.#`, queue `q.engine.events.normal`
  - `rule-cache-invalidation.consumer.ts` — `@RabbitSubscribe` on `xch.config.events`, routing key `config.rule.changed`, delegates to `RuleCacheService.invalidateRule()`
  - `override-cache-invalidation.consumer.ts` — `@RabbitSubscribe` on `xch.config.events`, routing key `config.override.changed`, delegates to `OverrideCacheService.invalidate()`
  - `status-inbound.consumer.ts` — `@RabbitSubscribe` on `xch.notifications.status`, routing keys `notification.status.delivered`/`notification.status.failed`, delegates to `NotificationLifecycleService.transition()`
  - `event-processing-pipeline.service.ts` — 9-step pipeline: parse → rule lookup (cache) → match rules → per-rule per-action: resolve priority → resolve recipients → per-recipient: resolve channels → per-channel: evaluate suppression → create notification (PENDING→PROCESSING) → render template (RENDERING) → dispatch (DELIVERING→SENT). Error isolation at action/recipient/channel levels.
  - `consumers.module.ts` — Imports AppRabbitMQModule, RulesModule, NotificationsModule, RecipientsModule, PreferencesModule, OverridesModule, TemplateClientModule; provides all 5 consumers + pipeline
- `src/rules/rule-cache.service.ts` — In-memory `Map<string, NotificationRule[]>` cache (eventType → rules sorted by priority). `OnModuleInit` eager warm-up. `getRulesByEventType()` cache-through. `invalidateRule(ruleId, timestamp)` with timestamp comparison to skip stale invalidations. `isEnabled()` toggle via `app.ruleCacheEnabled` config.
- `src/health/rabbitmq.health-indicator.ts` — `RabbitMQHealthIndicator` extending `HealthIndicator`: checks `amqpConnection.connected`, fetches queue depths from RabbitMQ Management API with Basic auth
- 4 new error codes: NES-016 (RABBITMQ_PUBLISH_FAILED, 500), NES-017 (CONSUMER_PROCESSING_FAILED, 500), NES-018 (TEMPLATE_RENDER_FAILED, 502), NES-019 (TEMPLATE_NOT_FOUND, 404)
- 119 unit tests across 12 new suites: rabbitmq constants (~20), notification-publisher (~10), template-client (~8), rule-cache (~10), base-event-consumer (~11), critical-event-consumer (~5), normal-event-consumer (~5), rule-cache-invalidation-consumer (~5), override-cache-invalidation-consumer (~4), status-inbound-consumer (~4), event-processing-pipeline (~10), rabbitmq-health-indicator (~6)
- Total: 452 tests across 47 suites (333 Phase 1–4 + 119 Phase 5)

**Changed:**
- `src/app.module.ts` — Added `AppRabbitMQModule`, `TemplateClientModule`, `ConsumersModule` to imports
- `src/config/rabbitmq.config.ts` — Added prefetch, dlqMaxRetries, retryInitialDelayMs, retryBackoffMultiplier, retryMaxDelayMs config values
- `src/config/env.validation.ts` — Added RABBITMQ_PREFETCH, DLQ_MAX_RETRIES, RETRY_INITIAL_DELAY_MS, RETRY_BACKOFF_MULTIPLIER, RETRY_MAX_DELAY_MS env vars (all @IsOptional @IsNumber)
- `src/common/errors.ts` — Added NES-016 through NES-019 error codes
- `src/rules/rules.module.ts` — Added `RuleCacheService` to providers/exports, imported `AppRabbitMQModule`
- `src/rules/notification-rules.service.ts` — Injected `NotificationPublisherService` + `ConfigService`, added `publishRuleChanged()` fire-and-forget on create/update/softDelete (when `app.ruleCacheEnabled` is true)
- `src/rules/rule-engine/rule-matcher.service.ts` — Refactored `matchRules()` to delegate to new `matchFromRules(rules, event)` method (takes pre-fetched rules, applies condition eval + exclusive logic)
- `src/overrides/overrides.module.ts` — Imported `AppRabbitMQModule`
- `src/overrides/critical-channel-overrides.service.ts` — Injected `NotificationPublisherService`, added `publishConfigEvent('config.override.changed', ...)` fire-and-forget on create/update/softDelete
- `src/notifications/notifications.repository.ts` — Added `updateRenderedContent()` and `updateTemplateVersion()` methods
- `src/health/health.module.ts` — Imported `AppRabbitMQModule`, added `RabbitMQHealthIndicator` provider
- `src/health/health.controller.ts` — Injected `RabbitMQHealthIndicator`, added RabbitMQ check to `health.check()` array
- `package.json` — Added `@golevelup/nestjs-rabbitmq`, `@nestjs/axios`, `axios` dependencies; added `@types/amqplib` dev dependency

### 2026-02-24 — Phase 4: Notifications, Lifecycle & Suppression

**Added:**
- `src/notifications/` module:
  - `entities/notification.entity.ts` — TypeORM entity for `notifications` table (BIGSERIAL PK, UUID notification_id unique, event/rule/template refs, status state machine, dedup hash, rendered content, correlation/cycle tracking)
  - `entities/notification-status-log.entity.ts` — TypeORM entity for `notification_status_log` table (BIGSERIAL PK, immutable audit log of status transitions)
  - `entities/notification-recipient.entity.ts` — TypeORM entity for `notification_recipients` table (BIGSERIAL PK, per-notification recipient details)
  - `dto/list-notifications-query.dto.ts` — Pagination + filters (status, channel, eventType, ruleId, recipientEmail, dateFrom, dateTo)
  - `dto/manual-send.dto.ts` — ManualSendDto with `@ValidateNested` recipients array, ManualSendRecipientDto
  - `dto/index.ts` — Barrel export
  - `notifications.repository.ts` — Extends `PgBaseRepository`, methods: findByNotificationId, findWithFilters (date range via QueryBuilder), createNotification, updateStatus, findForSuppressionCheck, countForSuppressionCheck, findMostRecentForSuppression
  - `notification-status-log.repository.ts` — Standalone repo: createLogEntry, findByNotificationId (ordered ASC)
  - `notification-recipients.repository.ts` — Standalone repo: createBatch, findByNotificationId
  - `notification-lifecycle.service.ts` — State machine: PENDING→PROCESSING→SUPPRESSED|RENDERING→FAILED|DELIVERING→SENT→DELIVERED|FAILED. Validates transitions via `VALID_TRANSITIONS` map, updates status synchronously, creates status log asynchronously (fire-and-forget). Exports `VALID_TRANSITIONS` and `TERMINAL_STATUSES` constants.
  - `notifications.service.ts` — CRUD: create (PENDING + initial log), findAll (paginated with filters), findById (notification + timeline + recipients in parallel), getTimeline, manualSend (channel×recipient cross-product, bypasses rules)
  - `notifications.controller.ts` — `@Controller('notifications')`: GET / (list), GET /:id (details), GET /:id/timeline, POST /send (201)
  - `suppression/dedup-key-resolver.service.ts` — Resolves dedup key fields from event payload + recipient (supports `recipient.*`, `eventType`, top-level fields), pipe-concatenates, SHA-256 hashes to 64-char hex
  - `suppression/suppression-evaluator.service.ts` — Evaluates 3 suppression modes in order (dedup, cooldown, maxCount), short-circuits on first match, excludes FAILED notifications, returns `{ suppressed, reason?, mode? }`
  - `notifications.module.ts` — Imports TypeOrmModule (3 entities), exports NotificationsService, NotificationLifecycleService, DedupKeyResolverService, SuppressionEvaluatorService, NotificationsRepository
- 1 new error code: NES-015 (INVALID_STATUS_TRANSITION, 422)
- 3 new DB tables: `notifications`, `notification_status_log`, `notification_recipients` + 5 indexes
- 106 unit tests across 8 new suites: notifications repository (~15), status-log repository (~5), recipients repository (~4), notification-lifecycle service (~18), dedup-key-resolver (~13), suppression-evaluator (~18), notifications service (~13), notifications controller (~5)
- Total: 333 tests across 35 suites (227 Phase 1–3 + 106 Phase 4)

**Changed:**
- `src/app.module.ts` — Added `NotificationsModule` to imports
- `src/common/errors.ts` — Added NES-015 error code
- `dbscripts/notification-engine-service-dbscripts.sql` — Added `notifications`, `notification_status_log`, `notification_recipients` table DDL + indexes

### 2026-02-24 — Phase 3: Recipients, Preferences & Channel Overrides

**Added:**
- `src/recipients/` module:
  - `entities/recipient-group.entity.ts` — TypeORM entity for `recipient_groups` table (UUID PK, name unique, description, isActive, OneToMany→members)
  - `entities/recipient-group-member.entity.ts` — TypeORM entity for `recipient_group_members` table (BIGINT identity PK, ManyToOne→group, email/phone/deviceToken/memberName)
  - `dto/create-recipient-group.dto.ts` — Create DTO with `@ValidateNested` for optional members array
  - `dto/update-recipient-group.dto.ts` — Update DTO with addMembers/removeMemberIds for member management
  - `dto/list-recipient-groups-query.dto.ts` — Pagination + isActive filter
  - `dto/recipient-group-member.dto.ts` — Nested member DTO (email required, phone/deviceToken/memberName optional)
  - `dto/index.ts` — Barrel export
  - `recipient-groups.repository.ts` — Extends `PgBaseRepository`, methods: findWithMembers (filters active members), findAllPaginated, create, addMembers (bulk), deactivateMembers, findActiveMembers, existsByName
  - `recipient-groups.service.ts` — CRUD: create (NES-014 name uniqueness), findAll (paginated), findById (NES-004), update (name/description/add/remove members)
  - `recipient-groups.controller.ts` — `@Controller('recipient-groups')`: POST (201), GET list, PUT :id
  - `recipient-resolver.service.ts` — Resolves recipients by type: customer (extract from event payload), group (query active members), custom (pass-through). Throws NES-004 for missing/inactive groups.
  - `channel-resolver.service.ts` — Resolves effective channels: applies customer opt-out preferences, merges critical channel overrides (overrides bypass preferences), deduplicates. Returns `{ effectiveChannels, filtered, reason? }`.
  - `interfaces/resolved-recipient.interface.ts` — `ResolvedRecipient` type (email?, phone?, deviceToken?, name?, customerId?)
  - `interfaces/channel-resolution-result.interface.ts` — `ChannelResolutionResult` type (effectiveChannels, filtered, reason?)
  - `recipients.module.ts` — Imports TypeOrmModule, PreferencesModule, OverridesModule; exports RecipientResolverService, ChannelResolverService, RecipientGroupsService
- `src/preferences/` module:
  - `entities/customer-channel-preference.entity.ts` — TypeORM entity for `customer_channel_preferences` table (BIGINT identity PK, unique customer_id+channel)
  - `dto/upsert-preference.dto.ts` — Upsert DTO (customerId, channel @IsIn email/sms/whatsapp/push, isOptedIn, optional sourceSystem)
  - `dto/bulk-upsert-preferences.dto.ts` — Bulk DTO with @ArrayMaxSize(1000) @ValidateNested preferences array
  - `dto/index.ts` — Barrel export
  - `customer-preferences.repository.ts` — Upsert-focused repo (no PgBaseRepository): findByCustomerId, upsertPreference (INSERT ON CONFLICT DO UPDATE), bulkUpsert (batched transactions, 100 per batch)
  - `customer-preferences.service.ts` — Upsert + cache eviction, bulk upsert + deduplicated cache eviction, getPreferences (delegates to cache)
  - `customer-preferences.controller.ts` — `@Controller('customer-preferences')`: POST / (upsert, 200, @UseGuards), POST /bulk (200, @UseGuards)
  - `preference-cache.service.ts` — LRU read-through cache with configurable TTL and max size. Map-based with insertion-order tracking for eviction.
  - `guards/preference-webhook.guard.ts` — `@CanActivate` guard: validates X-API-Key header against config, throws NES-013
  - `preferences.module.ts` — Imports TypeOrmModule; exports CustomerPreferencesService, PreferenceCacheService
- `src/overrides/` module:
  - `entities/critical-channel-override.entity.ts` — TypeORM entity for `critical_channel_overrides` table (UUID PK, unique event_type+channel)
  - `dto/create-override.dto.ts` — Create DTO (eventType, channel @IsIn, optional reason/createdBy)
  - `dto/update-override.dto.ts` — Update DTO (optional reason, isActive, updatedBy)
  - `dto/list-overrides-query.dto.ts` — Pagination + eventType/isActive filters
  - `dto/index.ts` — Barrel export
  - `critical-channel-overrides.repository.ts` — Extends `PgBaseRepository`, methods: findActiveByEventType, findAllActive, existsActiveOverride, create, save
  - `critical-channel-overrides.service.ts` — CRUD: create (NES-011 duplicate check), findAll (paginated), findById (NES-005), update + cache invalidation, softDelete + cache invalidation
  - `critical-channel-overrides.controller.ts` — `@Controller('critical-channel-overrides')`: POST (201), GET list, GET :id, PUT :id, DELETE :id (204)
  - `override-cache.service.ts` — Eager in-memory Map-based cache (eventType→channels[]). Loads on module init, O(1) lookup, supports per-eventType invalidation and full refresh.
  - `overrides.module.ts` — Imports TypeOrmModule; exports CriticalChannelOverridesService, OverrideCacheService
- 4 new error codes: NES-011 (DUPLICATE_OVERRIDE, 409), NES-012 (BULK_LIMIT_EXCEEDED, 400), NES-013 (UNAUTHORIZED_WEBHOOK, 401), NES-014 (DUPLICATE_RECIPIENT_GROUP, 409)
- 4 new config values: prefCacheEnabled, prefCacheTtlSeconds, prefCacheMaxSize, overrideCacheEnabled
- 102 unit tests across 14 new suites: recipient-groups controller (~4), service (~9), repository (~7); recipient-resolver (~10), channel-resolver (~8); customer-preferences controller (~2), service (~5), repository (~5); preference-cache (~6); preference-webhook guard (~4); critical-channel-overrides controller (~6), service (~10), repository (~6); override-cache (~6)
- Total: 227 tests across 27 suites (125 Phase 1+2 + 102 Phase 3)

**Changed:**
- `src/app.module.ts` — Added `PreferencesModule`, `OverridesModule`, `RecipientsModule` to imports
- `src/common/errors.ts` — Added NES-011 through NES-014 error codes
- `src/config/app.config.ts` — Added prefCacheEnabled, prefCacheTtlSeconds, prefCacheMaxSize, overrideCacheEnabled config values
- `src/config/env.validation.ts` — Added PREF_CACHE_ENABLED, PREF_CACHE_TTL_SECONDS, PREF_CACHE_MAX_SIZE, OVERRIDE_CACHE_ENABLED env vars
- `dbscripts/notification-engine-service-dbscripts.sql` — Added `recipient_groups`, `recipient_group_members`, `customer_channel_preferences`, `critical_channel_overrides` table DDL + indexes

### 2026-02-24 — Phase 2: Rules CRUD & Rule Engine

**Added:**
- `src/rules/` module:
  - `entities/notification-rule.entity.ts` — TypeORM entity for `notification_rules` table (15 columns, UUID PK, JSONB conditions/actions/suppression)
  - `dto/rule-action.dto.ts` — Nested DTO for rule action validation (templateId, channels, recipientType, optional delayMinutes)
  - `dto/create-rule.dto.ts` — Create rule DTO with `@ValidateNested` for actions array, optional conditions/suppression/deliveryPriority/priority/isExclusive
  - `dto/update-rule.dto.ts` — `PartialType(OmitType(CreateRuleDto, ['createdBy', 'eventType']))` + updatedBy (eventType immutable)
  - `dto/list-rules-query.dto.ts` — Pagination query DTO (page, limit max 200, optional eventType/isActive filters)
  - `dto/index.ts` — Barrel export
  - `notification-rules.repository.ts` — Extends `PgBaseRepository`, methods: `findByEventType`, `findAllActive`, `existsActiveDuplicate` (JSONB `@>`/`<@` containment), `save`, `create`
  - `notification-rules.service.ts` — CRUD: create (NES-006 duplicate check), findAll (paginated with filters), findById (NES-002), update (selective field updates), softDelete (isActive=false)
  - `notification-rules.controller.ts` — `@Controller('rules')`: POST (201), GET list, GET :id, PUT :id, DELETE :id (204)
  - `rules.module.ts` — Imports TypeOrmModule.forFeature([NotificationRule]), provides & exports all services
  - `rule-engine/condition-evaluator.service.ts` — Pure condition evaluation: 10 operators ($eq, $ne, $in, $nin, $gt, $gte, $lt, $lte, $exists, $regex), direct value shorthand, AND logic, null/empty = match all
  - `rule-engine/rule-matcher.service.ts` — Orchestrates rule matching: queries active rules by eventType (priority-sorted), evaluates conditions, handles isExclusive (stops after first exclusive match, keeps prior matches)
  - `rule-engine/priority-resolver.service.ts` — Resolves effective delivery priority: rule overrides event when non-null, inherits when null
- 89 unit tests across 6 new suites: controller (~6), service (~12), repository (~8), condition-evaluator (~30), rule-matcher (~10), priority-resolver (~4)
- Total: 125 tests across 13 suites (36 Phase 1 + 89 Phase 2)

**Changed:**
- `src/app.module.ts` — Added `RulesModule` to imports
- `dbscripts/notification-engine-service-dbscripts.sql` — Added `notification_rules` table DDL + `idx_rules_event_type_active` composite index
- `package.json` — Added `@nestjs/mapped-types` dependency (for PartialType/OmitType in UpdateRuleDto)

### 2026-02-24 — Phase 1: Foundation & Infrastructure

**Added:**
- Project foundation setup mirroring event-ingestion-service patterns
- `src/common/` module (`@Global()`):
  - `errors.ts` — Error registry with 10 NES-prefixed codes (NES-001 through NES-010) + `createErrorResponse()` helper
  - `interfaces/error-response.interface.ts` — Standardized `{ code, details, message, status, stack? }` interface
  - `filters/http-exception.filter.ts` — Global `@Catch(HttpException)` filter mapping all exceptions to standardized JSON
  - `pipes/dto-validation.pipe.ts` — Extends `ValidationPipe` with whitelist, forbidNonWhitelisted, NES-001 error wrapping
  - `interceptors/logging.interceptor.ts` — Structured HTTP logging (Pino) with severity-based levels, correlationId, sourceId extraction
  - `base/pg-base.repository.ts` — Abstract `PgBaseRepository` with `findById()` and `findWithPagination()` (composition pattern)
- `src/config/` module:
  - `config.module.ts` — `ConfigModule.forRoot` with isGlobal, env validation
  - `app.config.ts` — port (3152), nodeEnv, ruleCacheEnabled, preferenceWebhookApiKey, templateServiceUrl
  - `database.config.ts` — PostgreSQL connection params (defaults to `notification_engine_service` schema)
  - `rabbitmq.config.ts` — RabbitMQ connection params (host, port, managementUrl, vhost, user, password)
  - `env.validation.ts` — class-validator env validation (standard + NES-specific: TEMPLATE_SERVICE_URL, RULE_CACHE_ENABLED, PREFERENCE_WEBHOOK_API_KEY)
- `src/health/` module:
  - `health.module.ts` — Terminus module with DB-only health check
  - `health.controller.ts` — `GET /health` endpoint with TypeORM DB ping
- `src/main.ts` — Full bootstrap: Pino logger, DtoValidationPipe, HttpExceptionFilter, LoggingInterceptor, CORS, port 3152
- `src/app.module.ts` — Root module wiring: AppConfigModule, LoggerModule (pino-pretty in dev), TypeOrmModule (postgres, `notification_engine_service` schema, synchronize: false, charset: utf8, autoLoadEntities: true), CommonModule, HealthModule
- `test/jest-e2e.json` and `test/app.e2e-spec.ts` — E2E test setup for GET /health
- 36 unit tests across 7 suites (errors, http-exception filter, dto-validation pipe, logging interceptor, pg-base repository, env validation, health controller)

**Fixed:**
- `.env` DB_USER typo: `event_ingestion_service_user` → `notification_engine_service_user`

**Changed:**
- `eslint.config.mjs` — Added missing `no-unsafe-assignment`, `no-unsafe-member-access`, `no-unsafe-call`, `no-unsafe-return` warn rules and test file override block (relaxes unsafe-* and disables unbound-method/require-await for spec files)
- `package.json` — Added Phase 1 dependencies (@nestjs/config, @nestjs/terminus, @nestjs/typeorm, typeorm, pg, class-validator, class-transformer, nestjs-pino, pino, pino-http, pino-pretty); added `moduleNameMapper` for `.js` imports in Jest config

**Removed:**
- `src/app.controller.ts`, `src/app.service.ts`, `src/app.controller.spec.ts` — Scaffold files replaced by proper module structure
