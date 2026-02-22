# Coding Plan — Notification Engine Service

**Service:** `notification-engine-service` (port 3152)
**Technology:** NestJS (TypeScript) + PostgreSQL + RabbitMQ + HTTP (Template Service)
**Date:** 2026-02-21

---

## Overview

This plan breaks the Notification Engine Service implementation into **6 iterations**, each delivering fully functional, testable features. Iterations build on each other sequentially — each one produces a working service with progressively richer capabilities.

The Notification Engine is the central orchestrator of the platform — it consumes normalized events from RabbitMQ, evaluates them against a configurable rule engine, resolves recipients, coordinates template rendering, and dispatches rendered notifications to the Channel Router for delivery.

| Iteration | Focus | Key Deliverables |
|---|---|---|
| 1 | Project Scaffolding, Database & Health | NestJS app, TypeORM entities, config module, health endpoint |
| 2 | Rule Engine — CRUD, Condition Evaluator & Caching | Rule REST API, condition expression evaluator (all operators), priority/exclusivity, optional eager cache with invalidation |
| 3 | Event Processing Pipeline — Consume, Match, Resolve, Dispatch | RabbitMQ consumers (priority-tiered), recipient resolution (customer/group/custom), channel preference & override resolution, template rendering coordination (HTTP), notification dispatch, lifecycle state machine |
| 4 | Suppression & Deduplication, Status Log Consumer | Dedup key hashing (SHA-256), suppression modes (dedup/cooldown/maxCount), async status log consumer, inbound delivery status updates from Channel Router |
| 5 | Customer Preferences Webhooks, Critical Overrides API & Notification Query APIs | Preference webhook endpoints (single + bulk), critical override CRUD, notification listing/detail/timeline endpoints, manual send endpoint, recipient group CRUD |
| 6 | Caching Layer, Metrics, Production Hardening & E2E Tests | Preference cache (TTL/LRU), override cache (eager), rule cache, circuit breaker for Template Service, Prometheus metrics, structured logging, data retention purge functions, E2E tests |

---

## Iteration 1 — Project Scaffolding, Database & Health Check

### Goal
Stand up a fully runnable NestJS application with database connectivity, TypeORM entities matching the existing schema DDL and the full doc-specified table designs, a configuration module for all environment variables, and a working health check endpoint.

### Features
- NestJS project initialized with required dependencies
- TypeORM entities for ALL tables: `notification_rules`, `notifications`, `notification_status_log`, `notification_recipients`, `recipient_groups`, `recipient_group_members`, `customer_channel_preferences`, `critical_channel_overrides` (matching doc Section 12 exactly)
- Configuration module using `@nestjs/config` with validation (all env vars from Section 18)
- Database module with TypeORM connecting to PostgreSQL (`notification_engine_service` schema)
- `GET /health` endpoint returning service status, database connectivity, and uptime
- Structured logging foundation (JSON format with `nestjs-pino`)
- Basic project structure: modules, controllers, services, DTOs, entities folders
- `.env.example` file with all environment variables documented
- Unit tests for config validation

### Prompt

```
Implement Iteration 1 of the Notification Engine Service — Project Scaffolding, Database & Health Check.

Working directory: notification-engine-service/

IMPORTANT: The database schema script already exists at notification-engine-service/dbscripts/schema-notification-engine-service.sql — read it first. Note that this script currently only has the `customer_channel_preferences` and `critical_channel_overrides` tables. The remaining tables are defined in the design doc (Section 12). Create TypeORM entities for ALL tables defined in the doc and ensure they match the specified column types, constraints, indexes, and FILLFACTOR settings exactly.

IMPORTANT: Read the full service specification at docs/08-notification-engine-service.md before starting. All implementation must follow this spec precisely.

Tasks:

1. **Initialize NestJS project** inside the existing `notification-engine-service/` folder:
   - Use `@nestjs/cli` to scaffold: `nest new . --package-manager npm --skip-git`
   - Install dependencies:
     - `@nestjs/config`, `joi` (config validation)
     - `@nestjs/typeorm`, `typeorm`, `pg` (PostgreSQL)
     - `nestjs-pino`, `pino-http`, `pino-pretty` (structured logging)
     - `@nestjs/terminus` (health checks)
     - `uuid`, `class-validator`, `class-transformer` (validation & transformation)
   - Install dev dependencies: `@types/uuid`

2. **Configuration module** (`src/config/`):
   - Create `configuration.ts` exporting a typed config factory reading ALL env vars from Section 18:
     PORT (3152), DATABASE_URL, RABBITMQ_URL, RABBITMQ_PREFETCH_CRITICAL (5), RABBITMQ_PREFETCH_NORMAL (10), CRITICAL_CONSUMERS (4), NORMAL_CONSUMERS (2), RULE_CACHE_ENABLED (false), TEMPLATE_SERVICE_URL (http://template-service:3153), TEMPLATE_SERVICE_TIMEOUT_MS (5000), TEMPLATE_SERVICE_CB_THRESHOLD (5), TEMPLATE_SERVICE_CB_RESET_MS (60000), DB_POOL_SIZE (10), DLQ_MAX_RETRIES (3), RETRY_INITIAL_DELAY_MS (1000), RETRY_BACKOFF_MULTIPLIER (3), RETRY_MAX_DELAY_MS (30000), LOG_LEVEL (info), HEALTH_CHECK_INTERVAL_MS (30000), CONTENT_PURGE_DAYS (90), STATUS_LOG_RETENTION_DAYS (180), PREF_CACHE_ENABLED (true), PREF_CACHE_TTL_SECONDS (300), PREF_CACHE_MAX_SIZE (50000), OVERRIDE_CACHE_ENABLED (true), PREFERENCE_WEBHOOK_API_KEY
   - Create `config.validation.ts` using Joi schema to validate all env vars at startup (required: DATABASE_URL, RABBITMQ_URL; others have defaults per spec)
   - Register as global module in AppModule

3. **Database module** (`src/database/`):
   - Configure TypeORM with the `notification_engine_service` schema
   - Parse DATABASE_URL connection string
   - Connection pool size from DB_POOL_SIZE config
   - Enable logging in development, disable in production

4. **TypeORM entities** (`src/entities/`):
   - `notification-rule.entity.ts` — matches `notification_rules` table (Section 12): UUID id (gen_random_uuid), name VARCHAR(255), description TEXT, event_type VARCHAR(100), conditions JSONB, actions JSONB, suppression JSONB, delivery_priority VARCHAR(10), priority INTEGER (default 100), is_exclusive BOOLEAN (default false), is_active BOOLEAN (default true), created_by VARCHAR(100), updated_by VARCHAR(100), created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
   - `notification.entity.ts` — matches `notifications` table (Section 12): BIGSERIAL id, notification_id UUID (unique, gen_random_uuid), event_id UUID, rule_id UUID (FK to notification_rules), template_id VARCHAR(100), template_version INTEGER, channel VARCHAR(20), status VARCHAR(20) (default 'PENDING'), priority VARCHAR(10) (default 'normal'), recipient_email VARCHAR(255), recipient_phone VARCHAR(50), recipient_name VARCHAR(255), customer_id VARCHAR(100), dedup_key_hash CHAR(64), dedup_key_values JSONB, rendered_content JSONB, correlation_id UUID, cycle_id VARCHAR(255), source_id VARCHAR(50), event_type VARCHAR(100), error_message TEXT, created_at, updated_at. FILLFACTOR = 80.
   - `notification-status-log.entity.ts` — matches `notification_status_log` table: BIGSERIAL id, notification_id UUID, from_status VARCHAR(20) nullable, to_status VARCHAR(20), channel VARCHAR(20), metadata JSONB, created_at TIMESTAMPTZ
   - `notification-recipient.entity.ts` — matches `notification_recipients` table: BIGSERIAL id, notification_id UUID, recipient_type VARCHAR(20), email VARCHAR(255), phone VARCHAR(50), device_token TEXT, member_name VARCHAR(255), status VARCHAR(20) (default 'PENDING'), created_at. FILLFACTOR = 85.
   - `recipient-group.entity.ts` — matches `recipient_groups` table: UUID id (gen_random_uuid), name VARCHAR(255) (unique), description TEXT, is_active BOOLEAN (default true), created_at, updated_at
   - `recipient-group-member.entity.ts` — matches `recipient_group_members` table: BIGSERIAL id, group_id UUID (FK to recipient_groups), email VARCHAR(255), phone VARCHAR(50), device_token TEXT, member_name VARCHAR(255), is_active BOOLEAN (default true), created_at
   - `customer-channel-preference.entity.ts` — matches existing DDL in schema SQL: BIGSERIAL id, customer_id VARCHAR(100), channel VARCHAR(20), is_opted_in BOOLEAN (default true), source_system VARCHAR(50), created_at, updated_at. FILLFACTOR = 90. Unique (customer_id, channel).
   - `critical-channel-override.entity.ts` — matches existing DDL in schema SQL: UUID id (gen_random_uuid), event_type VARCHAR(100), channel VARCHAR(20), reason TEXT, is_active BOOLEAN (default true), created_by VARCHAR(100), updated_by VARCHAR(100), created_at, updated_at. Unique (event_type, channel).
   - ALL entities must use `{ schema: 'notification_engine_service' }` in their @Entity decorator
   - Define all indexes from Section 12 using TypeORM decorators (@Index)

5. **Health module** (`src/health/`):
   - `GET /health` endpoint using `@nestjs/terminus`
   - TypeOrm health indicator (database connectivity with latency)
   - Return JSON matching spec Section 17: `{ status, uptime, checks: { database: { status, latencyMs } } }`
   - RabbitMQ and template service health checks will be added in later iterations

6. **Structured logging**:
   - Configure `nestjs-pino` with JSON output format
   - Standard fields: timestamp, level, service ("notification-engine-service"), correlationId
   - Pretty printing in development via pino-pretty

7. **Project structure**:
   ```
   notification-engine-service/
     src/
       config/
         configuration.ts
         config.validation.ts
       database/
         database.module.ts
       entities/
         notification-rule.entity.ts
         notification.entity.ts
         notification-status-log.entity.ts
         notification-recipient.entity.ts
         recipient-group.entity.ts
         recipient-group-member.entity.ts
         customer-channel-preference.entity.ts
         critical-channel-override.entity.ts
       health/
         health.module.ts
         health.controller.ts
       app.module.ts
       main.ts
     .env.example
     test/
   ```

8. **Update database schema script**:
   - Update `notification-engine-service/dbscripts/schema-notification-engine-service.sql` to add the tables that are in the design doc (Section 12) but missing from the current script: `notification_rules`, `notifications`, `notification_status_log`, `notification_recipients`, `recipient_groups`, `recipient_group_members`
   - Include all indexes, FILLFACTOR settings, autovacuum tuning, and the `purge_notification_content()` PL/pgSQL function as specified in the doc
   - Keep the existing `customer_channel_preferences` and `critical_channel_overrides` table definitions unchanged

9. **Tests**:
   - Unit tests for config validation (valid config, missing required vars, invalid types)
   - Unit tests for entity field definitions (spot-check column names, types, defaults)

Do NOT create any RabbitMQ consumers, rule processing logic, or REST endpoints beyond `/health` — those come in later iterations.
```

---

## Iteration 2 — Rule Engine: CRUD API, Condition Evaluator & Optional Cache

### Goal
Implement the full notification rule engine — CRUD REST API for rule management, the condition expression evaluator supporting all operators, priority-based rule matching with exclusivity logic, and the optional eager rule cache with event-driven invalidation.

### Features
- Rule CRUD endpoints: `POST /rules`, `GET /rules`, `GET /rules/:id`, `PUT /rules/:id`, `DELETE /rules/:id` (soft-delete)
- Rule DTO validation (eventType dot-notation, actions array non-empty, valid channels, suppression config validation, priority positive integer)
- Condition expression evaluator supporting ALL operators: `$eq`, `$ne`, `$in`, `$nin`, `$gt`, `$gte`, `$lt`, `$lte`, `$exists`, `$regex`, and direct value shorthand
- All conditions combined with logical AND
- Rule priority ordering (lower number = higher priority, default: 100)
- Exclusivity logic — if a matched rule is `is_exclusive = true`, skip all subsequent rules for that event
- Optional eager rule cache (`RULE_CACHE_ENABLED` env var): warm-up on startup with `Map<eventType, Rule[]>`, event-driven invalidation via `xch.config.events` exchange / `q.config.rule-cache` queue
- When rules are created/updated/deleted, publish invalidation events to `xch.config.events` if cache is enabled
- Unit tests for condition evaluator (every operator), rule matching logic (priority ordering, exclusivity), and CRUD operations

### Prompt

```
Implement Iteration 2 of the Notification Engine Service — Rule Engine: CRUD API, Condition Evaluator & Optional Cache.

Working directory: notification-engine-service/

IMPORTANT: Read the full service specification at docs/08-notification-engine-service.md — specifically Sections 4 (Rule Engine), 11 (REST API — rules endpoints), and 12 (Database — notification_rules table). All implementation must follow the spec precisely.

Prerequisites: Iteration 1 is complete — NestJS project, TypeORM entities, config module, and health endpoint are in place.

Tasks:

1. **Rules module** (`src/rules/`):
   - `rules.module.ts` — module with controller, service, condition evaluator
   - `rules.controller.ts` — REST endpoints for rule CRUD
   - `rules.service.ts` — business logic, database operations, cache management
   - `condition-evaluator.ts` — the core expression evaluator

2. **Rule CRUD endpoints** (matching spec Section 11):
   - `POST /rules` — Create a new notification rule
     - Validate request body: `name` required, `eventType` must be valid dot-notation string, `actions` array must have at least one entry, each action must have `templateId`, `channels` (valid types: email, sms, whatsapp, push), `recipientType` (customer, group, custom)
     - If `recipientType` is `group`, `recipientGroupId` is required; if `custom`, `customRecipients` is required
     - If `suppression` is provided: at least one mode must be specified, all window/interval values > 0, all `dedupKey` entries must be valid dot-notation strings
     - `priority` must be a positive integer
     - Return 201 with ruleId, name, eventType, isActive, createdAt
   - `GET /rules` — List rules with pagination and filtering
     - Query params: `eventType` (filter), `isActive` (filter), `page` (default 1), `limit` (default 50, max 200)
     - Return paginated list with total count
   - `GET /rules/:id` — Retrieve full rule details including conditions, actions, suppression config
   - `PUT /rules/:id` — Update an existing rule (supports partial updates). Setting `suppression: null` removes suppression. Publishes invalidation event if `RULE_CACHE_ENABLED=true`.
   - `DELETE /rules/:id` — Soft-delete (sets `is_active = false`). Publishes invalidation event if `RULE_CACHE_ENABLED=true`.

3. **DTOs** (`src/rules/dto/`):
   - `create-rule.dto.ts` — full validation with class-validator decorators
   - `update-rule.dto.ts` — partial update DTO (all fields optional)
   - `query-rules.dto.ts` — pagination and filter params
   - `rule-response.dto.ts` — response transformation

4. **Condition expression evaluator** (`src/rules/condition-evaluator.ts`):
   - Implements ALL operators from Section 4.1:
     - `$eq` — exact equality
     - `$ne` — not equal
     - `$in` — value in list
     - `$nin` — value not in list
     - `$gt` — greater than
     - `$gte` — greater than or equal
     - `$lt` — less than
     - `$lte` — less than or equal
     - `$exists` — field exists and is non-null (true) or does not exist/is null (false)
     - `$regex` — regex pattern match
     - Direct value (no operator) — shorthand for `$eq`
   - ALL conditions within a rule are combined with logical AND — every condition must pass
   - If `conditions` is null/empty, the rule matches all events of the configured eventType
   - Evaluates conditions against top-level event fields only

5. **Rule matching logic** (`src/rules/rules.service.ts`):
   - `matchRules(event)` method: given an event, find all matching rules
   - Phase 1: Query active rules by `event_type` (indexed lookup), ordered by `priority ASC`
   - Phase 2: Evaluate conditions for each rule using the condition evaluator
   - Exclusivity logic: if a matched rule has `is_exclusive = true`, it runs but all subsequent rules (both exclusive and non-exclusive) are skipped
   - Non-exclusive rules: all matching rules execute
   - Return matched rules in priority order

6. **Optional eager rule cache** (`src/rules/rule-cache.service.ts`):
   - Controlled by `RULE_CACHE_ENABLED` env var (default: false)
   - When enabled:
     - Phase 1 — Eager warm-up: On startup, before RabbitMQ consumers bind, load all active rules into an in-memory `Map<eventType, Rule[]>` grouped by event type
     - Phase 2 — Event-driven invalidation: Subscribe to `xch.config.events` exchange via `q.config.rule-cache` queue (routing key: `config.rule.changed`). On receiving an invalidation event, fetch the updated rule from DB, compare `updated_at` timestamps, and replace in cache if newer (or remove if `is_active = false`). Discard out-of-order events.
   - When disabled: every rule lookup queries PostgreSQL directly
   - The rules service should transparently use cache or DB based on the config flag
   - Install `@golevelup/nestjs-rabbitmq` for RabbitMQ integration (will be used extensively in Iteration 3)

7. **Cache invalidation publishing**:
   - When a rule is created, updated, or soft-deleted via the REST API, publish an invalidation event to `xch.config.events` exchange with routing key `config.rule.changed`
   - Event payload: `{ ruleId, updatedAt }`
   - Only publish when `RULE_CACHE_ENABLED=true`

8. **Tests**:
   - Unit tests for condition evaluator — test EVERY operator with multiple scenarios:
     - `$eq`: string match, number match, mismatch
     - `$ne`: mismatch passes, match fails
     - `$in`: value in list, value not in list
     - `$nin`: value not in list passes, value in list fails
     - `$gt`, `$gte`, `$lt`, `$lte`: numeric comparisons
     - `$exists`: field present, field absent, field null
     - `$regex`: pattern match, no match
     - Direct value shorthand
     - Empty/null conditions (match all)
     - Multiple conditions (AND logic)
   - Unit tests for rule matching: priority ordering, exclusivity behavior, multiple matches
   - Integration tests for rule CRUD endpoints (create, read, update, soft-delete)
   - Unit tests for rule cache warm-up and invalidation logic

Project structure additions:
```
src/
  rules/
    rules.module.ts
    rules.controller.ts
    rules.service.ts
    condition-evaluator.ts
    rule-cache.service.ts
    dto/
      create-rule.dto.ts
      update-rule.dto.ts
      query-rules.dto.ts
      rule-response.dto.ts
```
```

---

## Iteration 3 — Event Processing Pipeline: Consume, Match, Resolve, Render & Dispatch

### Goal
Implement the full 9-step event processing pipeline — RabbitMQ consumers with priority-tiered queues, rule matching integration, recipient resolution (all three types), customer channel preference lookup, critical channel override lookup, effective channel computation, template rendering coordination via HTTP, notification creation with lifecycle state management, and dispatch to the Channel Router via RabbitMQ.

### Features
- RabbitMQ consumer setup: priority-tiered queues (`q.engine.events.critical` with 4 consumers, `q.engine.events.normal` with 2 consumers) bound to `xch.events.normalized` exchange
- Full 9-step pipeline execution per event (Section 3)
- Recipient resolution for all three types: customer (extract from event fields), group (query `recipient_groups`/`recipient_group_members`), custom (inline list from rule config)
- Channel preference lookup by `customer_id` (direct DB query — caching added in Iteration 6)
- Critical channel override lookup by `event_type` (direct DB query — caching added in Iteration 6)
- Effective channel resolution algorithm: `preferredChannels UNION overrideChannels`
- Template rendering via HTTP `POST /templates/:id/render` to Template Service (parallel per-channel calls with `Promise.all`)
- Retry with exponential backoff for Template Service failures (3 attempts, 1s/3s/9s)
- Notification record creation in `notifications` table with all fields
- Priority resolution: `rule.deliveryPriority ?? event.priority`
- Dispatch rendered notifications to `xch.notifications.deliver` exchange with routing key `notification.deliver.{priority}.{channel}`
- Asynchronous fire-and-forget status transition publishing to `xch.notifications.status` exchange
- Notification lifecycle state management: PENDING → PROCESSING → RENDERING → DELIVERING (with SUPPRESSED and FAILED as terminal states)
- Media pass-through from event to dispatch message
- RabbitMQ topology: declare all exchanges and queues on startup
- Dead-letter queue configuration (`xch.notifications.dlq`)
- Message ACK/NACK handling
- Unit tests for recipient resolution, channel preference resolution, priority resolution, dispatch message construction
- Integration tests for full pipeline (mocked Template Service and RabbitMQ)

### Prompt

```
Implement Iteration 3 of the Notification Engine Service — Event Processing Pipeline: Consume, Match, Resolve, Render & Dispatch.

Working directory: notification-engine-service/

IMPORTANT: Read the full service specification at docs/08-notification-engine-service.md — specifically Sections 2 (Architecture), 3 (Event Processing Pipeline), 5 (Recipient Resolution), 7 (Template Rendering Coordination), 8 (Notification Dispatch), 9 (Priority Management), 10 (RabbitMQ Topology), and 13 (Notification Lifecycle State Machine). All implementation must follow the spec precisely.

Prerequisites: Iterations 1-2 are complete — NestJS project, entities, config, health, rule CRUD, condition evaluator, and rule cache are in place.

Tasks:

1. **RabbitMQ module** (`src/rabbitmq/`):
   - Configure `@golevelup/nestjs-rabbitmq` with connection from `RABBITMQ_URL`
   - Declare ALL exchanges on startup:
     - `xch.events.normalized` (topic, durable) — consumed
     - `xch.notifications.deliver` (topic, durable) — published to
     - `xch.notifications.status` (topic, durable) — published to
     - `xch.notifications.dlq` (fanout, durable) — dead-letter
     - `xch.config.events` (topic, durable) — for cache invalidation
   - Declare ALL queues:
     - `q.engine.events.critical` bound to `xch.events.normalized` with key `event.critical.#`, 4 consumers, prefetch 5, DLQ enabled
     - `q.engine.events.normal` bound to `xch.events.normalized` with key `event.normal.#`, 2 consumers, prefetch 10, DLQ enabled
     - `q.config.rule-cache` bound to `xch.config.events` with key `config.rule.changed`, 1 consumer, prefetch 1 (for rule cache — from Iteration 2)
     - `q.config.override-cache` bound to `xch.config.events` with key `config.override.changed`, 1 consumer, prefetch 1 (for override cache — Iteration 6)
     - `q.engine.status.inbound` bound to `xch.notifications.status` with keys `notification.status.delivered` and `notification.status.failed`, 2 consumers, prefetch 10, DLQ enabled
   - Consumer and prefetch counts configurable via env vars

2. **Event processing pipeline** (`src/pipeline/`):
   - `pipeline.module.ts` — orchestration module
   - `event-consumer.service.ts` — RabbitMQ message handlers for `q.engine.events.critical` and `q.engine.events.normal`
   - `pipeline-orchestrator.service.ts` — implements the full 9-step pipeline:
     1. Receive normalized event from queue
     2. Rule lookup (use rules.service.matchRules — respects cache/DB toggle)
     3. Evaluate conditions (already in condition evaluator)
     4. Priority resolution: `rule.deliveryPriority ?? event.priority`
     5. Execute actions (iterate through matched rules' actions)
     6. Resolve recipients + channel preferences + critical overrides → effective channels
     7. Evaluate suppression (placeholder in this iteration — full impl in Iteration 4)
     8. Render template (HTTP call to Template Service)
     9. Dispatch to Channel Router + publish status + ACK

3. **Recipient resolution** (`src/pipeline/recipient-resolver.service.ts`):
   - `customer` type: extract `customerEmail`, `customerPhone`, `deviceToken`, `customerId` from event top-level fields. Always resolves to single recipient.
   - `group` type: query `recipient_group_members` joined with `recipient_groups` where `group_id` matches and both group and member are active. Returns array of members.
   - `custom` type: use the `customRecipients` array directly from the rule action config.
   - Return a normalized `Recipient[]` array with consistent shape: `{ email?, phone?, deviceToken?, name?, customerId? }`

4. **Channel preference & override resolution** (`src/pipeline/channel-resolver.service.ts`):
   - `resolveEffectiveChannels(ruleChannels, customerId, eventType)`:
     1. Query `customer_channel_preferences` by `customer_id` (direct DB for now — cache in Iteration 6)
     2. Query `critical_channel_overrides` by `event_type` where `is_active = true` (direct DB for now)
     3. Compute effective channels per the algorithm in Section 5.2:
        - No preferences found → effectiveChannels = ruleChannels UNION overrideChannels
        - Preferences found → preferredChannels = [ch for ch in ruleChannels WHERE opted_in], effectiveChannels = preferredChannels UNION overrideChannels
        - If effectiveChannels is empty → skip recipient (log as preference-filtered)
     4. Handle edge cases: customer_id is NULL (fall back to rule channels + overrides), non-customer recipients (skip preference check, overrides still apply)

5. **Template rendering coordination** (`src/pipeline/template-renderer.service.ts`):
   - For each action, call `POST http://{TEMPLATE_SERVICE_URL}/templates/:templateId/render` for each target channel
   - Use `Promise.all` for parallel multi-channel rendering
   - Pass full event payload (including structured fields like arrays, nested objects) as `data`
   - Retry with exponential backoff: 3 attempts, delays 1s → 3s → 9s (configured by RETRY_* env vars)
   - Handle failures per Section 7.3:
     - 404: Mark notification FAILED
     - 5xx: Retry with backoff, FAILED after max retries
     - Timeout (>TEMPLATE_SERVICE_TIMEOUT_MS): Treat as unavailable, retry
     - Partial channel failure: succeeded channels proceed, failed channels logged individually
   - Use an HTTP client with persistent connection pooling (keep-alive)
   - Install `@nestjs/axios` and `axios` for HTTP client

6. **Notification dispatch** (`src/pipeline/notification-dispatcher.service.ts`):
   - Create `notifications` table row for each recipient × channel combination
   - Publish to `xch.notifications.deliver` exchange with routing key `notification.deliver.{priority}.{channel}`
   - Dispatch message schema matches Section 8.1 exactly: notificationId, eventId, ruleId, channel, priority, recipient, content (subject, body, templateId, templateVersion), media (pass-through from event), metadata (correlationId, sourceId, eventType, cycleId, dispatchedAt)
   - Media array: pass through from event payload without modification; omit if event has no media

7. **Status transition publisher** (`src/pipeline/status-publisher.service.ts`):
   - Publish status transitions to `xch.notifications.status` exchange as fire-and-forget
   - Routing key: `notification.status.{outcome}` (e.g., `notification.status.processing`, `notification.status.rendering`, `notification.status.delivering`)
   - Message: `{ notificationId, fromStatus, toStatus, channel, metadata, timestamp }`
   - Also update `status` column on `notifications` row synchronously (lightweight single-column UPDATE)

8. **Notification lifecycle** (`src/pipeline/lifecycle.service.ts`):
   - Manage state transitions per Section 13: PENDING → PROCESSING → RENDERING → DELIVERING
   - SUPPRESSED and FAILED as terminal states
   - Validate transitions (no invalid state jumps)

9. **Tests**:
   - Unit tests for recipient resolver: customer (extract from event), group (mock DB query), custom (inline list)
   - Unit tests for channel resolver: all edge cases from Section 5.2 table (no prefs, opted-out of all, override forces channel, null customer_id, non-customer recipient)
   - Unit tests for priority resolution: all 4 combinations from Section 9.1 table
   - Unit tests for dispatch message construction (verify schema matches Section 8.1)
   - Unit tests for lifecycle state transitions (valid transitions, invalid transition rejection)
   - Integration tests for full pipeline with mocked Template Service (use nock or similar) and mocked RabbitMQ

Project structure additions:
```
src/
  rabbitmq/
    rabbitmq.module.ts
    rabbitmq.constants.ts    (exchange names, queue names, routing keys)
  pipeline/
    pipeline.module.ts
    event-consumer.service.ts
    pipeline-orchestrator.service.ts
    recipient-resolver.service.ts
    channel-resolver.service.ts
    template-renderer.service.ts
    notification-dispatcher.service.ts
    status-publisher.service.ts
    lifecycle.service.ts
```
```

---

## Iteration 4 — Suppression & Deduplication, Status Log Consumer & Inbound Status Updates

### Goal
Implement the full suppression and deduplication system — SHA-256 dedup key hashing, all three suppression modes (dedup, cooldown, maxCount), the partial composite index optimized suppression query, the asynchronous status log consumer, and the inbound delivery status update consumer (SENT/DELIVERED/FAILED from Channel Router).

### Features
- Dedup key resolution: resolve `dedupKey` array fields against event top-level fields + `recipient.*`, concatenate with pipe delimiter, SHA-256 hash to 64-char hex string
- Store both `dedup_key_hash` and `dedup_key_values` (JSONB, human-readable) on notification records
- Suppression evaluation in order: dedup → cooldown → maxCount (first trigger suppresses, all must pass = logical AND)
- Suppression query against `notifications` table using the partial composite index (`idx_notifications_suppression`)
- Failed notifications excluded from suppression queries (`WHERE status NOT IN ('FAILED')`)
- Fail-open suppression: if query fails, allow notification to proceed (log + alert)
- Suppressed notifications: publish SUPPRESSED status asynchronously via RabbitMQ, do NOT persist as `notifications` rows
- Asynchronous status log consumer: subscribe to `xch.notifications.status` exchange, persist transitions to `notification_status_log` table
- Inbound delivery status consumer: subscribe to `q.engine.status.inbound` queue for `notification.status.delivered` and `notification.status.failed` routing keys. Update `notifications.status` and `notifications.error_message` on delivery outcome.
- Unit tests for dedup key resolution (hashing, field extraction, recipient.* prefix), each suppression mode, fail-open behavior, status log consumer

### Prompt

```
Implement Iteration 4 of the Notification Engine Service — Suppression & Deduplication, Status Log Consumer & Inbound Status Updates.

Working directory: notification-engine-service/

IMPORTANT: Read the full service specification at docs/08-notification-engine-service.md — specifically Sections 6 (Suppression & Deduplication), 12 (notification_status_log table), 13 (Notification Lifecycle State Machine), and 16 (Error Handling — fail-open suppression). All implementation must follow the spec precisely.

Prerequisites: Iterations 1-3 are complete — full pipeline is in place with a suppression placeholder.

Tasks:

1. **Suppression module** (`src/suppression/`):
   - `suppression.module.ts`
   - `suppression.service.ts` — main suppression evaluation logic
   - `dedup-key.service.ts` — dedup key resolution and hashing

2. **Dedup key resolution** (`src/suppression/dedup-key.service.ts`):
   - Takes `dedupKey` string array from rule suppression config, the event payload, and the current recipient
   - Resolves each field name:
     - Fields starting with `recipient.` resolve against the current recipient object (e.g., `recipient.email` → recipient's email)
     - All other fields resolve against the event's top-level fields (e.g., `eventType`, `orderId`)
   - Concatenates resolved values with pipe `|` delimiter
   - Hashes the concatenated string using SHA-256 to produce a 64-character hex string
   - Also returns the resolved values as a JSONB-friendly object for human-readable storage in `dedup_key_values`
   - Example: `["eventType", "orderId", "recipient.email"]` with event `{ eventType: "order.shipped", orderId: "ORD-001" }` and recipient `{ email: "jane@example.com" }` → resolves to `"order.shipped|ORD-001|jane@example.com"` → SHA-256 hash
   - Install `crypto` (Node.js built-in) for SHA-256

3. **Suppression evaluation** (`src/suppression/suppression.service.ts`):
   - `evaluate(ruleId, suppressionConfig, dedupKeyHash, recipient)` method
   - Evaluates all configured modes in order: **dedup → cooldown → maxCount**
   - First mode that triggers causes suppression (all must pass = logical AND)
   - **Dedup mode**: Query if ANY notification with same `rule_id` + `dedup_key_hash` exists within `windowMinutes`. If found → suppress.
   - **Cooldown mode**: Query the MOST RECENT notification with same `rule_id` + `dedup_key_hash`. If it was sent less than `intervalMinutes` ago → suppress.
   - **MaxCount mode**: COUNT notifications with same `rule_id` + `dedup_key_hash` within `windowMinutes`. If count >= `limit` → suppress.
   - All queries use the optimized suppression query from Section 6.4:
     ```sql
     SELECT id, status, created_at
     FROM notifications
     WHERE rule_id = :ruleId
       AND dedup_key_hash = :hash
       AND status NOT IN ('FAILED')
       AND created_at >= NOW() - INTERVAL ':windowMinutes minutes'
     ORDER BY created_at DESC;
     ```
   - **Fail-open**: If the suppression query throws an error (DB timeout, connection error), allow the notification to proceed (log warning + metric increment). Never suppress due to infrastructure failure.

4. **Suppressed notification handling**:
   - When a notification is suppressed:
     - Do NOT create a row in the `notifications` table
     - Publish a SUPPRESSED status transition to `xch.notifications.status` exchange (fire-and-forget) with metadata including suppression reason and mode that triggered it
     - Log at info level with the suppression mode and dedup key values

5. **Integrate suppression into the pipeline**:
   - Replace the suppression placeholder from Iteration 3 in `pipeline-orchestrator.service.ts`
   - After recipient resolution + channel resolution, before template rendering:
     - If rule has no `suppression` config → skip suppression entirely
     - If rule has `suppression` config → resolve dedup key, evaluate suppression for each recipient
     - Store `dedup_key_hash` and `dedup_key_values` on notification records that pass suppression

6. **Asynchronous status log consumer** (`src/status-log/`):
   - `status-log.module.ts`
   - `status-log-consumer.service.ts` — subscribes to `xch.notifications.status` exchange
   - On receiving a status transition message, INSERT into `notification_status_log` table
   - This is the asynchronous write path described in Section 12 — never blocks the notification pipeline
   - Handle duplicates gracefully (idempotent inserts)

7. **Inbound delivery status consumer** (`src/pipeline/inbound-status-consumer.service.ts`):
   - Subscribe to `q.engine.status.inbound` queue (bound to `xch.notifications.status` with keys `notification.status.delivered` and `notification.status.failed`)
   - On receiving a DELIVERED status: update `notifications.status` to 'DELIVERED', update `updated_at`
   - On receiving a FAILED status: update `notifications.status` to 'FAILED', set `error_message` from message metadata, update `updated_at`
   - On receiving a SENT status: update `notifications.status` to 'SENT', update `updated_at`
   - Verify valid state transitions (e.g., can't go from DELIVERED back to DELIVERING)

8. **Tests**:
   - Unit tests for dedup key resolution:
     - Simple field resolution from event
     - `recipient.*` prefix resolution
     - Concatenation with pipe delimiter
     - SHA-256 hash output is 64 chars hex
     - Missing fields resolve to empty string
   - Unit tests for each suppression mode:
     - Dedup: suppress when recent notification exists, allow when no recent notification
     - Cooldown: suppress when last send is within interval, allow when outside interval
     - MaxCount: suppress when count >= limit, allow when count < limit
     - Combined modes: all must pass (AND logic)
     - No suppression config: always allow
   - Unit test for fail-open behavior: mock DB error → notification proceeds
   - Unit tests for status log consumer: verify INSERT into notification_status_log
   - Unit tests for inbound status consumer: verify status UPDATE on notifications table, invalid transition rejection

Project structure additions:
```
src/
  suppression/
    suppression.module.ts
    suppression.service.ts
    dedup-key.service.ts
  status-log/
    status-log.module.ts
    status-log-consumer.service.ts
```
```

---

## Iteration 5 — Customer Preferences Webhooks, Critical Overrides API, Notification Queries & Recipient Groups

### Goal
Implement all remaining REST API endpoints — customer preference webhook endpoints (single + bulk), critical channel override CRUD, notification listing/detail/timeline endpoints, the manual send endpoint, and recipient group CRUD. These are the Admin-facing APIs proxied through the Gateway.

### Features
- `POST /customer-preferences` — webhook upsert (API key auth via `X-API-Key` header)
- `POST /customer-preferences/bulk` — bulk webhook upsert (max 1000 per request, single transaction)
- `GET /critical-channel-overrides`, `POST /critical-channel-overrides`, `GET /critical-channel-overrides/:id`, `PUT /critical-channel-overrides/:id`, `DELETE /critical-channel-overrides/:id` (soft-delete)
- Override invalidation events published to `xch.config.events` with routing key `config.override.changed`
- `GET /notifications` — paginated listing with filters (status, channel, eventType, ruleId, recipientEmail, from, to)
- `GET /notifications/:id` — full notification details with lifecycle status log
- `GET /notifications/:id/timeline` — status transition timeline from `notification_status_log`
- `POST /notifications/send` — manual send (bypasses rule engine)
- `GET /recipient-groups`, `POST /recipient-groups`, `PUT /recipient-groups/:id` — recipient group CRUD
- API key guard for preference webhook endpoints
- Full DTO validation for all endpoints
- Unit and integration tests

### Prompt

```
Implement Iteration 5 of the Notification Engine Service — Customer Preferences Webhooks, Critical Overrides API, Notification Queries & Recipient Groups.

Working directory: notification-engine-service/

IMPORTANT: Read the full service specification at docs/08-notification-engine-service.md — specifically Section 11 (REST API Endpoints) for all endpoint specs. All implementation must follow the spec precisely.

Prerequisites: Iterations 1-4 are complete — full pipeline with suppression is in place.

Tasks:

1. **Customer preferences module** (`src/customer-preferences/`):
   - `customer-preferences.module.ts`
   - `customer-preferences.controller.ts`
   - `customer-preferences.service.ts`
   - `api-key.guard.ts` — guard that validates `X-API-Key` header against `PREFERENCE_WEBHOOK_API_KEY` env var

2. **Customer preference endpoints** (matching spec Section 11):
   - `POST /customer-preferences` — single customer upsert
     - Auth: `X-API-Key` header validated against `PREFERENCE_WEBHOOK_API_KEY` env var. Return 401 if missing/invalid.
     - Validate: `customerId` non-empty (max 100 chars), `channels` object has at least one key, valid keys: email/sms/whatsapp/push, each value is boolean
     - For each channel: `INSERT ... ON CONFLICT (customer_id, channel) DO UPDATE SET is_opted_in = :value, source_system = :source, updated_at = NOW()`
     - Return `{ customerId, updated: <count>, sourceSystem, timestamp }`
   - `POST /customer-preferences/bulk` — bulk upsert
     - Auth: same `X-API-Key` validation
     - Validate: `preferences` array has 1–1000 entries, each entry has valid `customerId` and `channels`
     - Process ALL preferences in a single database transaction (batched INSERT ... ON CONFLICT DO UPDATE)
     - Return `{ processed: <count>, sourceSystem, timestamp }`

3. **Critical channel overrides module** (`src/critical-overrides/`):
   - `critical-overrides.module.ts`
   - `critical-overrides.controller.ts`
   - `critical-overrides.service.ts`

4. **Critical override endpoints** (matching spec Section 11):
   - `GET /critical-channel-overrides` — list with pagination. Query params: eventType (filter), isActive (filter), page (default 1), limit (default 50, max 200)
   - `POST /critical-channel-overrides` — create. Validate: eventType non-empty (max 100), channel is valid type. Return 409 Conflict if unique constraint violated (event_type + channel). After creation, publish invalidation event to `xch.config.events` with routing key `config.override.changed`.
   - `GET /critical-channel-overrides/:id` — get by ID
   - `PUT /critical-channel-overrides/:id` — partial update. Publish invalidation event.
   - `DELETE /critical-channel-overrides/:id` — soft-delete (set is_active = false). Publish invalidation event.

5. **Notifications module** (`src/notifications/`):
   - `notifications.module.ts`
   - `notifications.controller.ts`
   - `notifications.service.ts`

6. **Notification query endpoints**:
   - `GET /notifications` — paginated listing
     - Query params: status, channel, eventType, ruleId, recipientEmail, from (ISO-8601), to (ISO-8601), page (default 1), limit (default 50, max 200)
     - Return paginated results with total count
   - `GET /notifications/:id` — full notification details including lifecycle status log and recipient info
   - `GET /notifications/:id/timeline` — complete status transition timeline from `notification_status_log`, ordered by `created_at ASC`
   - `POST /notifications/send` — manual notification send
     - Bypasses rule engine entirely
     - Request body: `{ templateId, channels, recipients, data (template variables), priority? }`
     - Creates notification records, calls Template Service for rendering, dispatches to Channel Router
     - Uses the same template renderer and dispatcher from the pipeline module

7. **Recipient groups module** (`src/recipient-groups/`):
   - `recipient-groups.module.ts`
   - `recipient-groups.controller.ts`
   - `recipient-groups.service.ts`

8. **Recipient group endpoints**:
   - `GET /recipient-groups` — list with pagination
   - `POST /recipient-groups` — create group with optional initial members
   - `PUT /recipient-groups/:id` — update group (name, description, members — add/remove)

9. **DTOs for all new endpoints** — full validation with class-validator decorators for every endpoint

10. **Tests**:
    - Unit tests for customer preference upsert logic (single + bulk)
    - Unit tests for API key guard (valid key, invalid key, missing key)
    - Integration tests for preference endpoints (201/200/401 responses)
    - Unit tests for critical override CRUD with invalidation event publishing
    - Integration tests for critical override endpoints (201/200/409 conflict)
    - Unit tests for notification queries (filter combinations, pagination)
    - Integration tests for notification endpoints
    - Unit tests for manual send (verify pipeline bypass, template rendering, dispatch)
    - Unit tests for recipient group CRUD

Project structure additions:
```
src/
  customer-preferences/
    customer-preferences.module.ts
    customer-preferences.controller.ts
    customer-preferences.service.ts
    api-key.guard.ts
    dto/
  critical-overrides/
    critical-overrides.module.ts
    critical-overrides.controller.ts
    critical-overrides.service.ts
    dto/
  notifications/
    notifications.module.ts
    notifications.controller.ts
    notifications.service.ts
    dto/
  recipient-groups/
    recipient-groups.module.ts
    recipient-groups.controller.ts
    recipient-groups.service.ts
    dto/
```
```

---

## Iteration 6 — Caching Layer, Circuit Breaker, Prometheus Metrics, Production Hardening & E2E Tests

### Goal
Add all caching layers (preference TTL/LRU cache, override eager cache, integration with rule cache from Iteration 2), circuit breaker for Template Service, Prometheus metrics for all key indicators, data retention purge functions, comprehensive structured logging, and end-to-end tests validating the full notification flow from event consumption to dispatch.

### Features
- **Customer preference cache**: TTL-based read-through cache with LRU eviction (`PREF_CACHE_ENABLED`, `PREF_CACHE_TTL_SECONDS=300`, `PREF_CACHE_MAX_SIZE=50000`). Cache miss → DB query → populate. Webhook upserts evict affected `customer_id` entries. TTL expiry handles updates from non-webhook sources.
- **Critical override cache**: Eager in-memory `Map<eventType, channel[]>` loaded on startup. Event-driven invalidation via `q.config.override-cache` queue (routing key `config.override.changed`). On invalidation, reload full override set from DB.
- **Circuit breaker for Template Service**: opens after `TEMPLATE_SERVICE_CB_THRESHOLD` (5) consecutive failures, resets after `TEMPLATE_SERVICE_CB_RESET_MS` (60000ms). Half-open state allows single test request.
- **Prometheus metrics** (`/metrics` endpoint): all 20 metrics from Section 17 — events consumed, rules matched, notifications created/suppressed/failed, template render duration, suppression query duration, rule evaluation duration, pipeline duration, queue depths, consumer lag, DLQ depth, DB pool, cache hit rates, circuit breaker state, preference metrics, override metrics
- **Data retention**: `purge_notification_content()` PL/pgSQL function matching Section 12 — NULLs `rendered_content` on rows older than `CONTENT_PURGE_DAYS` (90) in configurable batches
- **Status log retention**: purge entries older than `STATUS_LOG_RETENTION_DAYS` (180)
- **Structured logging**: all log entries use JSON format with standard fields (timestamp, level, service, correlationId, notificationId, eventId, ruleId, eventType, channel, message, durationMs)
- **Health check enrichment**: expand `GET /health` to include RabbitMQ status, Template Service status, queue depths, rule cache stats, preference/override cache stats (matching Section 17 response schema)
- **E2E tests**: full flow from publishing a normalized event to RabbitMQ → engine processes → notification dispatched to deliver exchange. Cover: happy path, suppression, multi-rule multi-channel, preference filtering, critical override, manual send
- **Error handling hardening**: all error categories from Section 16 properly handled with correct retry/DLQ behavior

### Prompt

```
Implement Iteration 6 of the Notification Engine Service — Caching Layer, Circuit Breaker, Prometheus Metrics, Production Hardening & E2E Tests.

Working directory: notification-engine-service/

IMPORTANT: Read the full service specification at docs/08-notification-engine-service.md — specifically Sections 15 (Performance & Scalability — cache strategies), 16 (Error Handling & Dead Letters), 17 (Monitoring & Health Checks), and 18 (Configuration). All implementation must follow the spec precisely.

Prerequisites: Iterations 1-5 are complete — full pipeline with suppression, all REST endpoints, all CRUD modules in place.

Tasks:

1. **Customer preference cache** (`src/cache/preference-cache.service.ts`):
   - TTL-based read-through cache with LRU eviction
   - Config: `PREF_CACHE_ENABLED` (default true), `PREF_CACHE_TTL_SECONDS` (default 300), `PREF_CACHE_MAX_SIZE` (default 50000)
   - On cache miss: query `customer_channel_preferences` by `customer_id`, populate cache entry, return result
   - On webhook upsert (POST /customer-preferences, POST /customer-preferences/bulk): evict affected `customer_id` entries from local cache immediately
   - TTL expiry handles updates from non-webhook sources (direct DB modifications, admin tools)
   - LRU eviction when cache exceeds `PREF_CACHE_MAX_SIZE`
   - Expose cache metrics: hit count, miss count, current size
   - Use a library like `lru-cache` (npm) or implement a simple Map-based LRU
   - Install `lru-cache` package
   - Integrate into `channel-resolver.service.ts` — use cache instead of direct DB query when enabled

2. **Critical override cache** (`src/cache/override-cache.service.ts`):
   - Eager in-memory `Map<eventType, channel[]>` loaded on startup
   - Config: `OVERRIDE_CACHE_ENABLED` (default true)
   - On startup: query all active overrides from `critical_channel_overrides WHERE is_active = true`, build map
   - Event-driven invalidation: subscribe to `q.config.override-cache` queue (routing key `config.override.changed`). On event, reload the FULL override set from DB (not incremental — the override set is tiny, <100 rows).
   - O(1) lookup by eventType — returns array of forced channels or empty array
   - Expose cache metrics: entry count, last invalidation timestamp
   - Integrate into `channel-resolver.service.ts` — use cache instead of direct DB query when enabled

3. **Circuit breaker for Template Service** (`src/pipeline/template-circuit-breaker.ts`):
   - Wraps the HTTP calls in `template-renderer.service.ts`
   - Three states: CLOSED (normal), OPEN (all calls fail-fast), HALF-OPEN (allow single test request)
   - Opens after `TEMPLATE_SERVICE_CB_THRESHOLD` (default 5) consecutive failures
   - Resets after `TEMPLATE_SERVICE_CB_RESET_MS` (default 60000ms)
   - When open: immediately mark notifications as FAILED without making HTTP call
   - When half-open: allow one request; if it succeeds, close the breaker; if it fails, reopen
   - Expose state as a metric
   - Use a library like `opossum` or implement a lightweight circuit breaker

4. **Prometheus metrics** (`src/metrics/`):
   - `metrics.module.ts`
   - `metrics.service.ts` — metric definitions and collection
   - `GET /metrics` endpoint in Prometheus exposition format
   - Install `prom-client` package
   - Define ALL metrics from Section 17:
     - Counters: `engine_events_consumed_total` (labels: priority), `engine_rules_matched_total` (labels: eventType, ruleId), `engine_notifications_created_total` (labels: channel, priority), `engine_notifications_suppressed_total` (labels: ruleId, mode), `engine_notifications_failed_total` (labels: channel, reason), `engine_pref_cache_hit_total` (labels: result=hit|miss), `engine_channels_overridden_total`, `engine_channels_filtered_total`
     - Histograms: `engine_template_render_duration_ms`, `engine_suppression_query_duration_ms`, `engine_rule_evaluation_duration_ms`, `engine_pipeline_duration_ms`, `engine_preference_lookup_duration_ms`
     - Gauges: `engine_queue_depth` (labels: queue), `engine_consumer_lag`, `engine_dlq_depth`, `engine_db_pool_active`, `engine_rule_cache_hit_rate`, `engine_template_service_circuit_state`, `engine_pref_cache_size`, `engine_override_cache_size`
   - Instrument the pipeline, template renderer, suppression service, channel resolver, and cache services with metric collection calls

5. **Data retention** — update schema script + add scheduled logic:
   - Ensure `purge_notification_content()` PL/pgSQL function exists in the DB schema script (Section 12):
     - Parameters: `p_older_than_days` (default 90), `p_batch_size` (default 10000)
     - NULLs out `rendered_content` on notifications older than threshold, processes in batches
     - Returns JSONB summary: `{ purged_rows, cutoff, executed_at }`
   - Add status log retention purge: DELETE from `notification_status_log` WHERE `created_at` < NOW() - INTERVAL `STATUS_LOG_RETENTION_DAYS` days (batched deletes)
   - Create a NestJS scheduled task (using `@nestjs/schedule`) that runs the purge daily (configurable)

6. **Health check enrichment** — expand `GET /health` to match full spec Section 17:
   - Database: status + latencyMs
   - RabbitMQ: status + latencyMs (ping connection)
   - Template Service: status + latencyMs (HEAD or GET to health endpoint)
   - Queue depths: `q.engine.events.critical` (depth + consumers), `q.engine.events.normal` (depth + consumers)
   - Rule cache: enabled flag, ruleCount, lastInvalidation timestamp
   - Preference cache: entry count
   - Override cache: entry count

7. **Structured logging hardening**:
   - Ensure ALL log entries include standard fields per Section 17: timestamp, level, service, correlationId, notificationId, eventId, ruleId, eventType, channel, message, durationMs (where applicable)
   - Add correlation ID propagation through the entire pipeline (from event to dispatch)
   - Add performance logging: log pipeline duration at info level for every event processed

8. **Error handling hardening** — verify all error categories from Section 16 are properly handled:
   - No matching rules: ACK, debug log
   - Condition evaluation error: warn log, skip rule, continue
   - Recipient resolution failure: FAILED status
   - Suppression query failure: fail-open, warn log
   - Template rendering failures: per Section 7.3
   - RabbitMQ publish failure: retry with backoff, NACK if persistent
   - Database transient error: retry with backoff
   - Database persistent error: NACK, dead-letter
   - DLQ: messages dead-lettered after `DLQ_MAX_RETRIES` (3) failed delivery attempts

9. **E2E tests** (`test/e2e/`):
   - **Happy path**: Publish a normalized event to `xch.events.normalized` → verify engine processes → notification row created → dispatch message published to `xch.notifications.deliver` → status transitions published
   - **Suppression**: Publish same event twice → second notification suppressed → verify SUPPRESSED status published, no notification row created
   - **Multi-rule multi-channel**: Event matches 2 rules → 1st rule sends email+sms, 2nd rule sends email to group → verify correct number of notifications and dispatch messages
   - **Exclusivity**: Event matches exclusive rule + non-exclusive rule → only exclusive rule executes
   - **Preference filtering**: Customer opted out of SMS → event triggers email+sms rule → only email dispatched
   - **Critical override**: Override forces SMS for event type → customer opted out of SMS → SMS still sent (override wins)
   - **Manual send**: POST /notifications/send → template rendered → notification dispatched (no rule engine)
   - **Template Service failure**: Template Service returns 500 → notification marked FAILED after retries
   - **Dead letter**: Simulate persistent failure → message goes to DLQ
   - Use testcontainers (PostgreSQL + RabbitMQ) or docker-compose for test infrastructure

Project structure additions:
```
src/
  cache/
    cache.module.ts
    preference-cache.service.ts
    override-cache.service.ts
  metrics/
    metrics.module.ts
    metrics.service.ts
    metrics.controller.ts
  scheduled/
    scheduled.module.ts
    retention.service.ts
  pipeline/
    template-circuit-breaker.ts   (new)
test/
  e2e/
    notification-flow.e2e-spec.ts
    suppression.e2e-spec.ts
    preferences.e2e-spec.ts
    manual-send.e2e-spec.ts
```
```

---

## Summary — Final Project Structure

After all 6 iterations, the complete `notification-engine-service/` folder structure:

```
notification-engine-service/
  dbscripts/
    schema-notification-engine-service.sql       (complete with all tables, indexes, functions)
  src/
    config/
      configuration.ts
      config.validation.ts
    database/
      database.module.ts
    entities/
      notification-rule.entity.ts
      notification.entity.ts
      notification-status-log.entity.ts
      notification-recipient.entity.ts
      recipient-group.entity.ts
      recipient-group-member.entity.ts
      customer-channel-preference.entity.ts
      critical-channel-override.entity.ts
    health/
      health.module.ts
      health.controller.ts
    rules/
      rules.module.ts
      rules.controller.ts
      rules.service.ts
      condition-evaluator.ts
      rule-cache.service.ts
      dto/
    rabbitmq/
      rabbitmq.module.ts
      rabbitmq.constants.ts
    pipeline/
      pipeline.module.ts
      event-consumer.service.ts
      pipeline-orchestrator.service.ts
      recipient-resolver.service.ts
      channel-resolver.service.ts
      template-renderer.service.ts
      notification-dispatcher.service.ts
      status-publisher.service.ts
      lifecycle.service.ts
      inbound-status-consumer.service.ts
      template-circuit-breaker.ts
    suppression/
      suppression.module.ts
      suppression.service.ts
      dedup-key.service.ts
    customer-preferences/
      customer-preferences.module.ts
      customer-preferences.controller.ts
      customer-preferences.service.ts
      api-key.guard.ts
      dto/
    critical-overrides/
      critical-overrides.module.ts
      critical-overrides.controller.ts
      critical-overrides.service.ts
      dto/
    notifications/
      notifications.module.ts
      notifications.controller.ts
      notifications.service.ts
      dto/
    recipient-groups/
      recipient-groups.module.ts
      recipient-groups.controller.ts
      recipient-groups.service.ts
      dto/
    cache/
      cache.module.ts
      preference-cache.service.ts
      override-cache.service.ts
    metrics/
      metrics.module.ts
      metrics.service.ts
      metrics.controller.ts
    status-log/
      status-log.module.ts
      status-log-consumer.service.ts
    scheduled/
      scheduled.module.ts
      retention.service.ts
    app.module.ts
    main.ts
  test/
    unit/
    e2e/
  .env.example
  package.json
  tsconfig.json
  nest-cli.json
```
