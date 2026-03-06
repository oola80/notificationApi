# Notification Engine Service — Test Inventory

> Generated: 2026-03-06
> Stats: ~504 unit tests across ~51 suites, 5 E2E test files

---

## Table of Contents

1. [Unit Tests](#unit-tests)
   - [Common Module](#common-module-5-files)
   - [Config Module](#config-module-1-file)
   - [Rules Module](#rules-module-7-files)
   - [Recipients Module](#recipients-module-5-files)
   - [Preferences Module](#preferences-module-4-files)
   - [Overrides Module](#overrides-module-4-files)
   - [Notifications Module](#notifications-module-9-files)
   - [RabbitMQ Module](#rabbitmq-module-2-files)
   - [Consumers Module](#consumers-module-8-files)
   - [Template Client Module](#template-client-module-2-files)
   - [Metrics Module](#metrics-module-2-files)
   - [Health Module](#health-module-2-files)
2. [E2E Tests](#e2e-tests-5-files)
3. [Recommended Additional Tests](#recommended-additional-tests)

---

## Unit Tests

### Common Module (5 files)

| # | File | Purpose |
|---|------|---------|
| 1 | `src/common/errors.spec.ts` | Validates error registry: `createErrorResponse` helper, message override, unknown error code fallback, unique error codes, NES- prefix convention |
| 2 | `src/common/filters/http-exception.filter.spec.ts` | Global exception filter: ErrorResponse pass-through, class-validator array transformation, string response wrapping, stack trace inclusion per environment |
| 3 | `src/common/pipes/dto-validation.pipe.spec.ts` | DTO validation pipe: valid DTOs pass-through, missing required fields rejection, non-whitelisted property stripping |
| 4 | `src/common/base/pg-base.repository.spec.ts` | Base repository: findById, findWithPagination (defaults, custom page/limit, where clause) |
| 5 | `src/common/interceptors/logging.interceptor.spec.ts` | HTTP logging interceptor: info for 2xx, warn for 4xx, error for 5xx, correlationId/sourceId from headers, skip non-HTTP contexts |

### Config Module (1 file)

| # | File | Purpose |
|---|------|---------|
| 6 | `src/config/env.validation.spec.ts` | Environment variable validation: valid config acceptance, test/production NODE_ENV, rejection of invalid NODE_ENV, empty config failure, NES-specific variables |

### Rules Module (7 files)

| # | File | Purpose |
|---|------|---------|
| 7 | `src/rules/notification-rules.controller.spec.ts` | Rules CRUD controller: thin delegation for create, findAll, findById, update, remove |
| 8 | `src/rules/notification-rules.service.spec.ts` | Rules business logic: create rule, NES-006 on duplicate, default values population, findAll with filters, findById, update, softDelete |
| 9 | `src/rules/notification-rules.repository.spec.ts` | Rules data access: findByEventType, findAllActive, existsActiveDuplicate (JSONB `@>`/`<@`), save, create |
| 10 | `src/rules/rule-cache.service.spec.ts` | In-memory rule cache: onModuleInit warm-up, getRulesByEventType cache hit/miss, invalidateRule, disabled-cache behavior |
| 11 | `src/rules/rule-engine/condition-evaluator.service.spec.ts` | Condition evaluation: null/empty conditions, 10 operators ($eq, $ne, $in, $nin, $gt, $gte, $lt, $lte, $exists, $regex), AND logic, edge cases (null values, booleans) |
| 12 | `src/rules/rule-engine/rule-matcher.service.spec.ts` | Rule matching engine: return matching rules, empty result on no match, stop after exclusive rule, skip exclusive on condition mismatch, priority ordering |
| 13 | `src/rules/rule-engine/priority-resolver.service.spec.ts` | Priority resolution: rule priority overrides event, inherit event priority when rule priority is null/undefined |

### Recipients Module (5 files)

| # | File | Purpose |
|---|------|---------|
| 14 | `src/recipients/recipient-groups.controller.spec.ts` | Recipient groups CRUD controller: thin delegation for create, findAll, update |
| 15 | `src/recipients/recipient-groups.service.spec.ts` | Recipient groups business logic: create group, NES-014 on duplicate name, create with members, findAll, findById, update, add/deactivate members |
| 16 | `src/recipients/recipient-groups.repository.spec.ts` | Recipient groups data access: findWithMembers (filter active), create, addMembers, deactivateMembers, findActiveMembers, existsByName |
| 17 | `src/recipients/recipient-resolver.service.spec.ts` | Recipient type resolution: customer type (extract fields), group type (active members), custom type (map recipients), unknown type error, NES-004 for inactive/missing group |
| 18 | `src/recipients/channel-resolver.service.spec.ts` | Channel resolution with preferences: no customer (unfiltered), no preferences, filter opted-out channels, keep opted-in, force override channels, mixed opt-in/out with overrides |

### Preferences Module (4 files)

| # | File | Purpose |
|---|------|---------|
| 19 | `src/preferences/customer-preferences.controller.spec.ts` | Preferences webhook controller: upsert, bulkUpsert delegation |
| 20 | `src/preferences/customer-preferences.service.spec.ts` | Preferences business logic: upsert with cache eviction, bulkUpsert with deduplication, NES-012 on exceeding 1000 items, getPreferences |
| 21 | `src/preferences/customer-preferences.repository.spec.ts` | Preferences data access: findByCustomerId, upsertPreference (INSERT ON CONFLICT), bulkUpsert with batching |
| 22 | `src/preferences/preference-cache.service.spec.ts` | LRU preference cache: query repository on miss, return cached on hit, re-query after TTL expiry, evict/clear, LRU eviction at maxSize |
| 23 | `src/preferences/guards/preference-webhook.guard.spec.ts` | API key guard: allow valid API key, NES-013 for invalid/missing/empty key |

### Overrides Module (4 files)

| # | File | Purpose |
|---|------|---------|
| 24 | `src/overrides/critical-channel-overrides.controller.spec.ts` | Overrides CRUD controller: thin delegation for create, findAll, findById, update, remove |
| 25 | `src/overrides/critical-channel-overrides.service.spec.ts` | Overrides business logic: create override, NES-011 on duplicate, findAll with filters, findById, update, softDelete |
| 26 | `src/overrides/critical-channel-overrides.repository.spec.ts` | Overrides data access: findActiveByEventType, findAllActive, existsActiveOverride, create, save |
| 27 | `src/overrides/override-cache.service.spec.ts` | Eager override cache: onModuleInit load all active, getOverrides (cached/unknown), refresh, invalidate single event type, disabled cache behavior |

### Notifications Module (9 files)

| # | File | Purpose |
|---|------|---------|
| 28 | `src/notifications/notifications.controller.spec.ts` | Notifications controller: findAll, findById, getTimeline, manualSend delegation |
| 29 | `src/notifications/notifications.service.spec.ts` | Notifications business logic: create with PENDING status, status log entry, findAll with filters, findById, getTimeline, manualSend full lifecycle/error handling/priority |
| 30 | `src/notifications/notifications.repository.spec.ts` | Notifications data access: findByNotificationId, findWithFilters (status, channel, date range), createNotification, updateStatus, findForSuppressionCheck, countForSuppressionCheck, findMostRecentForSuppression |
| 31 | `src/notifications/notification-lifecycle.service.spec.ts` | Notification state machine: VALID_TRANSITIONS map, all valid transition paths, NES-003 when not found, NES-015 for invalid transitions, status log fire-and-forget |
| 32 | `src/notifications/notification-status-log.repository.spec.ts` | Status log data access: createLogEntry (full/minimal fields), findByNotificationId (ordered by createdAt ASC) |
| 33 | `src/notifications/notification-recipients.repository.spec.ts` | Recipient details data access: createBatch, findByNotificationId |
| 34 | `src/notifications/suppression/dedup-key-resolver.service.spec.ts` | Dedup key generation: resolve top-level fields, resolve recipient.* fields, pipe concatenation, SHA-256 hash, handle missing fields, different/same hash verification |
| 35 | `src/notifications/suppression/suppression-evaluator.service.spec.ts` | Suppression rule evaluation: no suppression config, dedup mode, cooldown mode, maxCount mode, combined modes (short-circuit), FAILED exclusion |

### RabbitMQ Module (2 files)

| # | File | Purpose |
|---|------|---------|
| 36 | `src/rabbitmq/rabbitmq.constants.spec.ts` | Queue/exchange/routing key constants validation, parseNormalizedRoutingKey helper |
| 37 | `src/rabbitmq/notification-publisher.service.spec.ts` | Message publishing: publishToDeliver, publishStatus, publishConfigEvent, NES-016 on publish failure, fire-and-forget behavior |

### Consumers Module (8 files)

| # | File | Purpose |
|---|------|---------|
| 38 | `src/consumers/base-event.consumer.spec.ts` | Abstract base consumer: isRetryable (retryable vs non-retryable errors), calculateDelay (exponential backoff), retryOrDlq (increment/send to DLQ), max retries exhausted |
| 39 | `src/consumers/critical-event.consumer.spec.ts` | Critical event consumer: delegate to pipeline, ACK on success, retryOrDlq on error, republish on retryable error |
| 40 | `src/consumers/normal-event.consumer.spec.ts` | Normal event consumer: delegate to pipeline, ACK on success, retryOrDlq on error, republish on retryable error |
| 41 | `src/consumers/status-inbound.consumer.spec.ts` | Status transition consumer: transition to DELIVERED/FAILED, retryOrDlq on error, handle missing metadata |
| 42 | `src/consumers/rule-cache-invalidation.consumer.spec.ts` | Rule cache invalidation: invalidate when enabled, skip when disabled, handle all actions (created/updated/deleted) |
| 43 | `src/consumers/override-cache-invalidation.consumer.spec.ts` | Override cache invalidation: invalidate override cache, handle all actions |
| 44 | `src/consumers/event-processing-pipeline.service.spec.ts` | 9-step pipeline orchestration: parse, rule lookup (cache), match, priority, recipients, channels, suppression, notification creation, render template, dispatch |

### Template Client Module (2 files)

| # | File | Purpose |
|---|------|---------|
| 45 | `src/template-client/template-client.service.spec.ts` | Template rendering with retries: render successfully, NES-019 on 404, retry on 5xx/timeout, NES-018 after retry exhaustion, NES-020 propagation (circuit breaker open), parse channelMetadata |
| 46 | `src/template-client/circuit-breaker.service.spec.ts` | Circuit breaker pattern: CLOSED start state, failure tracking, OPEN at threshold, reject with NES-020 when OPEN, HALF_OPEN after reset timeout, close on successful probe, re-open on failed probe, exclude NES-019 from failure count |

### Metrics Module (2 files)

| # | File | Purpose |
|---|------|---------|
| 47 | `src/metrics/metrics.service.spec.ts` | Prometheus metrics: registry with all custom metrics, increment counters with labels, observe histogram values, set gauge values |
| 48 | `src/metrics/metrics.controller.spec.ts` | Metrics endpoint: return Prometheus format, correct content-type header |

### Health Module (2 files)

| # | File | Purpose |
|---|------|---------|
| 49 | `src/health/health.controller.spec.ts` | Health endpoint: healthy status, all checks (database, rabbitmq, template-service), unhealthy/degraded states, queue depths and rule cache info |
| 50 | `src/health/rabbitmq.health-indicator.spec.ts` | RabbitMQ health checks: healthy when connected, unhealthy when disconnected, fetch queue depths, handle API failures gracefully |

---

## E2E Tests (5 files)

| # | File | Purpose |
|---|------|---------|
| 51 | `test/app.e2e-spec.ts` | Application health and metrics: health endpoint response, database/rabbitmq/template-service checks, queue info, metrics endpoint |
| 52 | `test/rules.e2e-spec.ts` | Rules CRUD lifecycle: POST/GET/GET:id/PUT/DELETE, validation errors, duplicate detection |
| 53 | `test/recipient-groups.e2e-spec.ts` | Recipient groups CRUD + member management: POST/GET/GET:id/PUT/DELETE, member add/deactivate |
| 54 | `test/overrides.e2e-spec.ts` | Critical channel overrides CRUD: POST/GET/GET:id/PUT/DELETE, validation, duplicate detection |
| 55 | `test/notifications.e2e-spec.ts` | Notifications CRUD and filtering: GET with filters, GET:id, GET:id/timeline, POST /notifications/send (manual dispatch) |

---

## Recommended Additional Tests

The existing test suite is comprehensive. The following areas could benefit from additional coverage:

### 1. Missing Unit Tests

| Area | Recommended Test | Rationale |
|------|-----------------|-----------|
| **`app.module.ts`** | Module wiring spec | Verify all 12 modules are imported and the root module compiles correctly. Catches broken imports early. |
| **`main.ts` bootstrap** | Bootstrap integration test | Verify global pipes, filters, interceptors, and CORS are applied. Ensures main.ts configuration changes don't silently break. |
| **DTO validation (Rules)** | `create-rule.dto.spec.ts` | Validate class-validator decorators on CreateRuleDto and nested RuleActionDto. Ensures payload constraints (required fields, types, nested validation) are enforced. |
| **DTO validation (Recipients)** | `create-recipient-group.dto.spec.ts` | Validate nested member array constraints, required fields, and type coercion on recipient group DTOs. |
| **DTO validation (Overrides)** | `create-override.dto.spec.ts` | Validate channel enum, event type constraints, and required fields on override DTOs. |
| **DTO validation (Notifications)** | `manual-send.dto.spec.ts`, `list-notifications-query.dto.spec.ts` | Validate manual send payload structure (recipients, channel, template) and query filter constraints (date format, enum status). |
| **DTO validation (Preferences)** | `upsert-preference.dto.spec.ts`, `bulk-upsert-preferences.dto.spec.ts` | Validate @ArrayMaxSize(1000), channel enum, optIn boolean, and customer ID constraints. |
| **Entity specs** | `notification-rule.entity.spec.ts`, etc. | Verify TypeORM column decorators, default values, and JSONB column types match DB schema. Low priority but useful for schema drift detection. |
| **RabbitMQ module config** | `rabbitmq.module.spec.ts` | Verify exchange declarations, prefetch config, and connection options are wired correctly from ConfigService. |

### 2. Missing Integration / Behavioral Tests

| Area | Recommended Test | Rationale |
|------|-----------------|-----------|
| **Pipeline error isolation** | Pipeline spec: partial failure scenarios | Verify that when one channel/recipient fails in `Promise.allSettled()`, other channels still succeed. The pipeline spec should cover per-recipient error isolation more explicitly. |
| **Pipeline WhatsApp dispatch** | Pipeline spec: WhatsApp metadata mapping | Verify `templateName`, `templateLanguage`, and `metaTemplateParameters` are correctly resolved from event payload for WhatsApp channel dispatch. |
| **Suppression + lifecycle interaction** | Integration test combining suppression check → status transition | Verify that suppressed notifications correctly reach SUPPRESSED terminal state and don't proceed to rendering. |
| **Cache concurrency** | RuleCacheService / PreferenceCacheService under concurrent access | Verify cache behaves correctly when warm-up and invalidation happen simultaneously (race conditions). |
| **Circuit breaker + pipeline** | Pipeline spec with circuit breaker OPEN | Verify the pipeline correctly handles NES-020 (circuit breaker open) — notification should transition to FAILED with appropriate metadata. |

### 3. Missing E2E Tests

| Area | Recommended Test | Rationale |
|------|-----------------|-----------|
| **Customer preferences E2E** | `test/preferences.e2e-spec.ts` | No E2E coverage for `POST /customer-preferences` and `POST /customer-preferences/bulk`. Should test API key guard, upsert behavior, and 1000-item bulk limit. |
| **Manual send E2E (full flow)** | Extended `notifications.e2e-spec.ts` | Test manual send with mocked template-service and RabbitMQ, verifying the full create → render → dispatch lifecycle end-to-end. |
| **Error response E2E** | Cross-cutting error format validation | Verify all endpoints return the standardized `{ code, details, message, status }` error shape for 400/404/409/500 scenarios. |
| **Pagination E2E** | Pagination behavior across list endpoints | Verify `page`, `limit`, `total`, and `totalPages` work correctly for rules, groups, overrides, and notifications list endpoints. |

### 4. Missing Non-Functional Tests

| Area | Recommended Test | Rationale |
|------|-----------------|-----------|
| **Metrics accuracy** | Verify pipeline increments correct counters | Confirm that `notifications_created_total`, `pipeline_duration_seconds`, etc. are incremented with correct labels during pipeline execution. Currently only MetricsService unit-tests counters in isolation. |
| **Idempotency** | Consumer idempotency tests | Verify that processing the same message twice produces the same result (especially for status-inbound and event consumers). Critical for at-least-once delivery guarantees. |
| **Backpressure / prefetch** | Load test with prefetch limits | Verify that per-queue prefetch (5 for critical, 10 for normal) correctly limits concurrent processing. Not a unit test but important for production. |

### Summary of Gaps

| Category | Current Count | Recommended Additions |
|----------|--------------|----------------------|
| Unit test files | 50 | +9 (DTOs, module wiring, bootstrap) |
| E2E test files | 5 | +2 (preferences, error format) |
| Integration/behavioral | Inline in pipeline spec | +5 (error isolation, WhatsApp, circuit breaker, concurrency, suppression) |
| Non-functional | 0 | +3 (metrics accuracy, idempotency, backpressure) |

**Priority order for new tests:**
1. **Customer preferences E2E** — only module with zero E2E coverage
2. **DTO validation specs** — catch constraint regressions without running the full app
3. **Pipeline WhatsApp metadata mapping** — new feature (Phase 7) with complex field resolution
4. **Consumer idempotency** — critical for production reliability
5. **Circuit breaker + pipeline integration** — verify failure propagation through the full chain
