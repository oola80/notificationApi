# Coding Plan — Event Ingestion Service

**Service:** `event-ingestion-service` (port 3151)
**Technology:** NestJS (TypeScript) + PostgreSQL + RabbitMQ
**Date:** 2026-02-21

---

## Overview

This plan breaks the Event Ingestion Service implementation into **5 iterations**, each delivering fully functional, testable features. Iterations build on each other sequentially — each one produces a working service with progressively richer capabilities.

| Iteration | Focus | Key Deliverables |
|---|---|---|
| 1 | Project Scaffolding, Database & Health | NestJS app, TypeORM entities, config module, health endpoint |
| 2 | Mapping Engine & Event Normalization | All 13 transforms, dot-path extraction, validation, dedup logic |
| 3 | REST Webhook Endpoint & Processing Pipeline | POST /webhooks/events, auth, rate limit, persist, publish, query APIs |
| 4 | RabbitMQ Consumers, DLQ & Retry | AMQP consumers, exchange/queue topology, DLQ, exponential backoff |
| 5 | Mapping Cache, Metrics & Production Hardening | Eager cache, invalidation, Prometheus metrics, structured logging, E2E tests |

---

## Iteration 1 — Project Scaffolding, Database & Health Check

### Goal
Stand up a fully runnable NestJS application with database connectivity, TypeORM entities matching the existing schema DDL, a configuration module for all environment variables, and a working health check endpoint.

### Features
- NestJS project initialized with required dependencies
- TypeORM entities for `events`, `event_sources`, and `event_mappings` tables (matching `schema-event-ingestion-service.sql` exactly)
- Configuration module using `@nestjs/config` with validation (all env vars from Section 14)
- Database module with TypeORM connecting to PostgreSQL (`event_ingestion_service` schema)
- `GET /health` endpoint returning service status, database connectivity, and uptime
- Structured logging foundation (JSON format with `nestjs-pino` or `winston`)
- Basic project structure: modules, controllers, services, DTOs, entities folders
- `.env.example` file with all environment variables documented
- Unit tests for config validation

### Prompt

```
Implement Iteration 1 of the Event Ingestion Service — Project Scaffolding, Database & Health Check.

Working directory: event-ingestion-service/

IMPORTANT: The database schema script already exists at event-ingestion-service/dbscripts/schema-event-ingestion-service.sql — read it first and ensure all TypeORM entities match its DDL exactly. Do NOT modify the SQL file.

IMPORTANT: Read the full service specification at docs/07-event-ingestion-service.md before starting. All implementation must follow this spec precisely.

Tasks:

1. **Initialize NestJS project** inside the existing `event-ingestion-service/` folder:
   - Use `@nestjs/cli` to scaffold: `nest new . --package-manager npm --skip-git`
   - Install dependencies:
     - `@nestjs/config`, `joi` (config validation)
     - `@nestjs/typeorm`, `typeorm`, `pg` (PostgreSQL)
     - `nestjs-pino`, `pino-http`, `pino-pretty` (structured logging)
     - `@nestjs/terminus` (health checks)
     - `uuid` (UUID generation)
   - Install dev dependencies: `@types/uuid`

2. **Configuration module** (`src/config/`):
   - Create `configuration.ts` exporting a typed config factory reading all env vars from the spec (Section 14): PORT, DATABASE_URL, RABBITMQ_URL, RABBITMQ_PREFETCH, DEDUP_WINDOW_HOURS, WEBHOOK_RATE_LIMIT, LOG_LEVEL, MAPPING_CACHE_ENABLED, DLQ_MAX_RETRIES, RETRY_INITIAL_DELAY_MS, RETRY_BACKOFF_MULTIPLIER, RETRY_MAX_DELAY_MS, HEALTH_CHECK_INTERVAL_MS
   - Create `config.validation.ts` using Joi schema to validate all env vars at startup (required: DATABASE_URL, RABBITMQ_URL; others have defaults per spec)
   - Register as global module in AppModule

3. **Database module** (`src/database/`):
   - Configure TypeORM with the `event_ingestion_service` schema
   - Parse DATABASE_URL connection string
   - Enable logging in development, disable in production

4. **TypeORM entities** (`src/entities/`):
   - `event.entity.ts` — matches `events` table exactly (BIGSERIAL id, UUID event_id, source_id, cycle_id, event_type, source_event_id, raw_payload JSONB, normalized_payload JSONB, status, error_message, correlation_id, created_at, updated_at)
   - `event-source.entity.ts` — matches `event_sources` table exactly (SERIAL id, name, display_name, type, connection_config JSONB, api_key_hash, signing_secret_hash, is_active, rate_limit, created_at, updated_at)
   - `event-mapping.entity.ts` — matches `event_mappings` table exactly (UUID id, source_id, event_type, name, description, field_mappings JSONB, event_type_mapping JSONB, timestamp_field, timestamp_format, source_event_id_field, validation_schema JSONB, priority, is_active, version, created_by, updated_by, created_at, updated_at)
   - All entities must use `{ schema: 'event_ingestion_service' }` in their @Entity decorator

5. **Health module** (`src/health/`):
   - `GET /health` endpoint using `@nestjs/terminus`
   - TypeOrm health indicator (database connectivity with latency)
   - Return JSON matching spec Section 13: `{ status, uptime, checks: { database: { status, latencyMs } } }`
   - RabbitMQ health check will be added in Iteration 4

6. **Structured logging**:
   - Configure `nestjs-pino` with JSON output format
   - Standard fields: timestamp, level, service ("event-ingestion-service"), correlationId
   - Pretty printing in development via pino-pretty

7. **Project structure**:
   ```
   event-ingestion-service/
     src/
       config/
         configuration.ts
         config.validation.ts
       database/
         database.module.ts
       entities/
         event.entity.ts
         event-source.entity.ts
         event-mapping.entity.ts
       health/
         health.module.ts
         health.controller.ts
       app.module.ts
       main.ts
     .env.example
     dbscripts/   (existing — do not modify)
   ```

8. **Create `.env.example`** with all environment variables and their defaults documented.

9. **Write unit tests** for:
   - Config validation (valid config passes, missing required vars fails)
   - Health controller (returns expected structure)

Do NOT implement RabbitMQ consumers, webhook endpoints, or the mapping engine in this iteration — those come in later iterations. Focus on a solid, runnable foundation.
```

---

## Iteration 2 — Runtime Mapping Engine & Event Normalization

### Goal
Build the core mapping engine that transforms source-specific payloads into canonical events using admin-configured runtime field mappings. This is the heart of the service — all 13 transform functions, dot-path field extraction, default values, required field validation, event type resolution, timestamp normalization, AJV payload validation, mapping lookup with wildcard fallback, source authentication logic, and deduplication checking.

### Features
- Mapping engine with all 13 transforms: `direct`, `concatenate`, `map`, `prefix`, `suffix`, `template`, `dateFormat`, `epochToIso`, `toNumber`, `toString`, `arrayMap`, `jsonPath`, `static`
- Dot-path field extraction from nested payloads (e.g., `"customer.id"`)
- Default value substitution (applied before transform)
- Required field validation (missing required field → rejection)
- Event type mapping/resolution (source-native → canonical dot-notation)
- Timestamp normalization to ISO-8601 UTC (`iso8601`, `epoch_ms`, `epoch_s`, custom formats)
- AJV payload validation against optional `validationSchema` in mapping config
- Mapping lookup service: direct DB query for `(sourceId, eventType)`, wildcard fallback `(sourceId, '*')`
- Source lookup & authentication logic (API key hash comparison, HMAC signature verification, bearer token validation)
- Deduplication service: composite key `(source_id, source_event_id)` check with configurable window
- Comprehensive unit test suite (50+ tests) covering all transforms, edge cases, validation scenarios

### Prompt

```
Implement Iteration 2 of the Event Ingestion Service — Runtime Mapping Engine & Event Normalization.

Working directory: event-ingestion-service/

IMPORTANT: Read docs/07-event-ingestion-service.md first — Sections 3.2 (Runtime Mapping Configuration), 4 (Event Processing Pipeline), 7 (Canonical Event Schema), 9 (Event Validation), and 10 (Idempotency & Deduplication). All implementation must match the spec precisely.

This iteration builds on Iteration 1 (NestJS project with entities, config, health check). Do NOT modify existing entity files or configuration unless necessary.

Tasks:

1. **Mapping Engine** (`src/mapping/`):
   - Create `mapping-engine.service.ts` — the core normalization engine
   - Implement dot-path field extraction: given a source path like `"customer.id"`, extract the value from a nested object. Support array source paths for multi-field transforms like `concatenate`.
   - Implement all 13 transform functions (create `src/mapping/transforms/` with individual transform files or a single transforms registry):
     - `direct` — copy value as-is
     - `concatenate` — join multiple source values with separator
     - `map` — lookup value in a mappings object (source → target)
     - `prefix` — prepend a string
     - `suffix` — append a string
     - `template` — Handlebars-style string interpolation (use `handlebars` package)
     - `dateFormat` — parse and reformat date string (use `date-fns` or `dayjs`)
     - `epochToIso` — convert epoch timestamp (ms or s) to ISO-8601 string
     - `toNumber` — cast to number
     - `toString` — cast to string
     - `arrayMap` — transform array elements with field renames
     - `jsonPath` — extract via JSONPath expression (use `jsonpath-plus` package)
     - `static` — use a fixed value from `options.value` (ignores source path)
   - Implement default value logic: if source path resolves to null/undefined/missing AND a `default` is configured, substitute the default BEFORE applying the transform
   - Implement required field validation: after applying defaults and transforms, if a field marked `required: true` is still null/undefined, reject the event
   - `applyMapping(rawPayload, mappingConfig)` → returns `{ canonicalEvent, warnings, missingRequiredFields }`

2. **Event Type Resolution** (`src/mapping/event-type-resolver.service.ts`):
   - Given a source event type string and an `eventTypeMapping` config, resolve to canonical dot-notation
   - If no mapping found, use the raw event type as-is (it may already be canonical)

3. **Timestamp Normalization** (`src/mapping/timestamp-normalizer.service.ts`):
   - Extract timestamp from source payload using `timestampField` dot-path
   - Normalize based on `timestampFormat`: `iso8601` (parse ISO string), `epoch_ms` (milliseconds), `epoch_s` (seconds), custom format string
   - Output: ISO-8601 UTC string
   - Fallback: if no timestamp found, use current time

4. **Payload Validation** (`src/validation/`):
   - Create `payload-validator.service.ts` using `ajv` (install `ajv` and `ajv-formats`)
   - If the mapping config has a `validationSchema`, validate the raw payload against it
   - Return structured validation errors on failure
   - Compile and cache AJV validators per mapping ID for performance

5. **Mapping Lookup Service** (`src/mapping/mapping-lookup.service.ts`):
   - `findMapping(sourceId, eventType)` → looks up active mapping from DB
   - First try exact match: `WHERE source_id = $1 AND event_type = $2 AND is_active = true`
   - Fallback to wildcard: `WHERE source_id = $1 AND event_type = '*' AND is_active = true`
   - Throw `MappingNotFoundException` if neither found (results in 422 response)
   - Use the EventMapping entity/repository from Iteration 1

6. **Source Lookup & Authentication** (`src/auth/`):
   - Create `source-auth.service.ts`
   - `validateSource(sourceId)` — look up source in `event_sources`, verify `is_active = true`
   - `authenticateWebhook(sourceId, headers)` — based on source config:
     - API key: compare SHA-256 hash of `X-API-Key` header against `api_key_hash`
     - HMAC: compute HMAC-SHA256 of request body using `signing_secret_hash`, compare with `X-Signature` header
     - Bearer token: validate `Authorization: Bearer <token>` header
   - Use `crypto` module for hashing — NOT storing plaintext secrets

7. **Deduplication Service** (`src/dedup/`):
   - Create `dedup.service.ts`
   - `checkDuplicate(sourceId, sourceEventId)` → checks `events` table using composite key `(source_id, source_event_id)` within the configurable dedup window (`DEDUP_WINDOW_HOURS`)
   - Returns `{ isDuplicate: boolean, existingEventId?: string }`
   - When no `sourceEventId` is present, skip dedup check entirely (event is always treated as new)

8. **Install additional dependencies**:
   - `ajv`, `ajv-formats` (JSON Schema validation)
   - `handlebars` (template transform)
   - `dayjs` (date parsing/formatting)
   - `jsonpath-plus` (JSONPath extraction)

9. **Unit tests** (`src/mapping/__tests__/`, `src/validation/__tests__/`, `src/auth/__tests__/`, `src/dedup/__tests__/`):
   - Mapping engine: test each of the 13 transforms individually with various inputs
   - Dot-path extraction: nested paths, array paths, missing paths
   - Default values: applied before transform, satisfies required check
   - Required fields: missing required → rejection, default satisfies required
   - Event type resolution: mapping found, mapping not found (passthrough), empty mapping config
   - Timestamp normalization: ISO-8601, epoch_ms, epoch_s, missing timestamp (fallback to now)
   - Payload validation: valid payload passes, invalid payload returns errors, no schema → skip
   - Mapping lookup: exact match, wildcard fallback, not found
   - Source auth: API key match, HMAC verification, bearer token, inactive source rejected
   - Deduplication: new event, duplicate within window, duplicate outside window, missing sourceEventId
   - Aim for 50+ test cases covering edge cases

Do NOT implement the REST webhook controller, RabbitMQ consumers, or the full pipeline orchestration in this iteration. Focus on building and thoroughly testing the individual components that will be composed in Iteration 3.
```

---

## Iteration 3 — REST Webhook Endpoint & Full Processing Pipeline

### Goal
Wire together all components from Iteration 2 into the complete 10-step event processing pipeline, expose the REST webhook endpoint (`POST /webhooks/events`), the event query APIs (`GET /events`, `GET /events/:eventId`), and implement RabbitMQ publishing to the normalized exchange.

### Features
- `POST /webhooks/events` — full webhook endpoint with authentication, validation, normalization, persistence, and publishing
- 10-step processing pipeline orchestration service
- Event persistence: insert raw + normalized payloads, update status through lifecycle
- RabbitMQ publisher: publish to `xch.events.normalized` with routing key `event.{priority}.{eventType}`
- Per-source rate limiting using `@nestjs/throttler` or custom rate limiter
- `GET /events/:eventId` — retrieve single event by canonical ID
- `GET /events` — paginated list with filters (sourceId, eventType, status, date range)
- Full request/response DTOs with class-validator decorators
- Error handling: 202/200/400/401/422/429/500 response codes per spec
- Integration tests using test database

### Prompt

```
Implement Iteration 3 of the Event Ingestion Service — REST Webhook Endpoint & Full Processing Pipeline.

Working directory: event-ingestion-service/

IMPORTANT: Read docs/07-event-ingestion-service.md first — Sections 4 (Event Processing Pipeline), 6 (REST API Endpoints), 7 (Canonical Event Schema), and 12 (Error Handling). All implementation must match the spec precisely.

This iteration builds on Iterations 1 and 2. All entities, config, mapping engine, auth, validation, and dedup services are already implemented. Wire them together.

Tasks:

1. **Event Processing Pipeline** (`src/pipeline/`):
   - Create `event-pipeline.service.ts` — the orchestrator that executes the 10-step pipeline:
     1. Receive event (raw payload + metadata)
     2. Extract source ID (from body field `sourceId`)
     3. Source lookup — call `sourceAuthService.validateSource(sourceId)` to verify registered & active
     4. Mapping lookup — call `mappingLookupService.findMapping(sourceId, eventType)` with wildcard fallback
     5. Validate (optional) — if mapping has `validationSchema`, call `payloadValidatorService.validate()`
     6. Dedup check — call `dedupService.checkDuplicate(sourceId, sourceEventId)`. If duplicate, return `{ eventId, status: 'duplicate' }`
     7. Normalize — call `mappingEngineService.applyMapping()`, then `eventTypeResolverService.resolve()`, then `timestampNormalizerService.normalize()`
     8. Enrich metadata — generate `eventId` (UUID v4), `correlationId` (from `X-Request-ID` header or generated), `receivedAt`, `normalizedAt`, `schemaVersion` ("2.0"), `mappingConfigId`
     9. Persist — insert into `events` table with status `received`, update to `published` after publish
     10. Publish — publish normalized event to `xch.events.normalized` with routing key `event.{priority}.{eventType}`
   - The pipeline service should be reusable by both webhook controller and RabbitMQ consumers (Iteration 4)
   - Return `{ eventId, status }` on success

2. **RabbitMQ Publisher** (`src/rabbitmq/`):
   - Create `event-publisher.service.ts`
   - Install `amqplib` and `@golevelup/nestjs-rabbitmq`
   - Configure connection using `RABBITMQ_URL` from config
   - Assert exchange `xch.events.normalized` (topic, durable)
   - `publishNormalizedEvent(canonicalEvent)` — publish to exchange with routing key `event.{priority}.{eventType}` (e.g., `event.critical.order.delayed` or `event.normal.order.shipped`)
   - Handle publish confirms and connection failures gracefully
   - NOTE: Only configure the publisher in this iteration. Consumer setup comes in Iteration 4.

3. **Webhook Controller** (`src/webhooks/`):
   - Create `webhooks.controller.ts` with `POST /webhooks/events`
   - Request body DTO (`create-event.dto.ts`) with class-validator:
     - `sourceId` (required, string)
     - `cycleId` (required, string)
     - `eventType` (required, string)
     - `sourceEventId` (optional, string)
     - `timestamp` (optional, ISO-8601 string)
     - `payload` (required, object)
   - Authentication guard/interceptor: extract auth headers, call `sourceAuthService.authenticateWebhook()`
   - Extract `X-Request-ID` header for correlation (generate UUID if absent)
   - Call `eventPipelineService.process()` with the validated request
   - Response codes per spec:
     - `202 Accepted` → `{ eventId, status: "accepted" }`
     - `200 OK` → `{ eventId, status: "duplicate" }` (dedup hit)
     - `400 Bad Request` → `{ error, details }` (malformed JSON, missing fields)
     - `401 Unauthorized` → `{ error: "Authentication failed" }`
     - `422 Unprocessable Entity` → `{ error, details }` (mapping not found, validation failed)
     - `429 Too Many Requests` → `{ error: "Rate limit exceeded", retryAfter }`
     - `500 Internal Server Error` → `{ error: "Internal server error" }`

4. **Rate Limiting** (`src/rate-limit/`):
   - Create per-source rate limiter using `@nestjs/throttler` or a custom in-memory rate limiter
   - Rate limit value from `event_sources.rate_limit` (per source, events/second)
   - Global default from `WEBHOOK_RATE_LIMIT` env var (default 100/sec)
   - Return 429 with `retryAfter` header when exceeded

5. **Event Query Endpoints** (`src/events/`):
   - Create `events.controller.ts` and `events.service.ts`
   - `GET /events/:eventId` — find event by canonical `event_id` (UUID). Return full record including raw_payload, normalized_payload, status, metadata. Return 404 if not found.
   - `GET /events` — paginated list with query parameter filters:
     - `sourceId` (string, optional)
     - `eventType` (string, optional)
     - `status` (string, optional: received, published, failed, duplicate)
     - `from` (ISO-8601, optional) — start of date range
     - `to` (ISO-8601, optional) — end of date range
     - `page` (integer, default 1)
     - `limit` (integer, default 50, max 200)
   - Return paginated response: `{ data: [...], total, page, limit, totalPages }`

6. **DTOs and validation** (`src/common/dto/`):
   - Create request/response DTOs with `class-validator` and `class-transformer`
   - Install `class-validator`, `class-transformer`
   - Enable global validation pipe in `main.ts`

7. **Error handling**:
   - Create global exception filter (`src/common/filters/http-exception.filter.ts`)
   - Map domain exceptions (MappingNotFoundException, ValidationFailedException, AuthenticationFailedException, DuplicateEventException) to appropriate HTTP status codes
   - Structured error responses matching spec format

8. **Integration tests** (`test/`):
   - Test webhook endpoint with mocked DB and RabbitMQ
   - Test full pipeline: valid event → 202, duplicate → 200, missing mapping → 422, auth failure → 401, validation failure → 422
   - Test event query endpoints with seeded test data
   - Test rate limiting behavior

Do NOT implement RabbitMQ consumers (AMQP message consumption) in this iteration — that comes in Iteration 4. Only implement the RabbitMQ publisher for outbound messages.
```

---

## Iteration 4 — RabbitMQ Consumers, DLQ & Retry

### Goal
Implement the RabbitMQ consumer infrastructure — declare all exchanges and queues, create consumers for the three source queues (`q.events.amqp`, `q.events.webhook`, `q.events.email-ingest`), implement DLQ routing, and add exponential backoff retry logic. After this iteration, the service can receive events from both HTTP webhooks and RabbitMQ.

### Features
- Full RabbitMQ topology: exchanges (`xch.events.incoming`, `xch.events.normalized`, `xch.notifications.dlq`) and queues with bindings
- `q.events.amqp` consumer — routing key `source.*.#`, concurrency 3, prefetch 10
- `q.events.webhook` consumer — routing key `source.webhook.#`, concurrency 2, prefetch 10
- `q.events.email-ingest` consumer — routing key `source.email-ingest.#`, concurrency 2, prefetch 10
- Routing key parser: extract `sourceId` and `eventType` from `source.{sourceId}.{eventType}`
- DLQ configuration: all queues declare `x-dead-letter-exchange: xch.notifications.dlq`
- Retry with exponential backoff (3 retries, 1s→2s→4s, max 30s)
- ACK on success, NACK on transient failure, reject on permanent failure
- x-death header tracking for retry count
- Update health check to include RabbitMQ connectivity and queue depths

### Prompt

```
Implement Iteration 4 of the Event Ingestion Service — RabbitMQ Consumers, DLQ & Retry.

Working directory: event-ingestion-service/

IMPORTANT: Read docs/07-event-ingestion-service.md first — Sections 2 (Architecture), 3.1 (Integration Patterns), 5 (RabbitMQ Topology), 11 (Sequence Diagrams), and 12 (Error Handling & Dead Letters). All implementation must match the spec precisely.

This iteration builds on Iterations 1–3. The pipeline service, publisher, webhook endpoint, and all core services are already implemented. Now add the RabbitMQ consumer side.

Tasks:

1. **RabbitMQ Module** (`src/rabbitmq/`):
   - Configure `@golevelup/nestjs-rabbitmq` with full topology declaration
   - Use `RABBITMQ_URL` and `RABBITMQ_PREFETCH` from config
   - **Exchanges to assert:**
     - `xch.events.incoming` — type: topic, durable: true
     - `xch.events.normalized` — type: topic, durable: true (already used by publisher from Iteration 3)
     - `xch.notifications.dlq` — type: fanout, durable: true
   - **Queues to assert with bindings:**
     - `q.events.amqp` → bound to `xch.events.incoming` with routing key `source.*.#`, DLQ: `xch.notifications.dlq`
     - `q.events.webhook` → bound to `xch.events.incoming` with routing key `source.webhook.#`, DLQ: `xch.notifications.dlq`
     - `q.events.email-ingest` → bound to `xch.events.incoming` with routing key `source.email-ingest.#`, DLQ: `xch.notifications.dlq`
   - All queues: durable, with `x-dead-letter-exchange: xch.notifications.dlq`

2. **Routing Key Parser** (`src/rabbitmq/routing-key-parser.ts`):
   - Parse routing key format `source.{sourceId}.{eventType}` where eventType may contain dots (e.g., `source.erp-system-1.order.shipped` → sourceId: `erp-system-1`, eventType: `order.shipped`)
   - The second segment is always the sourceId, everything after is the eventType

3. **AMQP Event Consumer** (`src/rabbitmq/consumers/amqp-event.consumer.ts`):
   - Subscribe to `q.events.amqp` using `@RabbitSubscribe` decorator
   - Concurrency: 3 consumers (configurable)
   - On message received:
     1. Parse routing key to extract `sourceId` and `eventType`
     2. Parse message body as JSON
     3. Build a pipeline input (equivalent to webhook body structure): `{ sourceId, eventType, cycleId, sourceEventId, timestamp, payload }` — extract `cycleId` from the message body
     4. Call `eventPipelineService.process()` (the same pipeline used by the webhook)
     5. On success: ACK the message
     6. On transient failure: check retry count via `x-death` headers. If under `DLQ_MAX_RETRIES` (default 3), NACK with requeue=false (will go to DLQ, or use delayed retry). If over max retries, NACK without requeue (dead-letter).
     7. On permanent failure (validation error, mapping not found): NACK without requeue (dead-letter immediately)

4. **Webhook Queue Consumer** (`src/rabbitmq/consumers/webhook-event.consumer.ts`):
   - Subscribe to `q.events.webhook` with routing key `source.webhook.#`
   - Concurrency: 2
   - Same processing logic as AMQP consumer, reusing the pipeline service

5. **Email Ingest Consumer** (`src/rabbitmq/consumers/email-ingest-event.consumer.ts`):
   - Subscribe to `q.events.email-ingest` with routing key `source.email-ingest.#`
   - Concurrency: 2
   - Same processing logic, reusing the pipeline service

6. **Retry with Exponential Backoff** (`src/rabbitmq/retry.service.ts`):
   - Implement retry logic using `x-death` header inspection
   - Configuration from env vars: `DLQ_MAX_RETRIES` (3), `RETRY_INITIAL_DELAY_MS` (1000), `RETRY_BACKOFF_MULTIPLIER` (2), `RETRY_MAX_DELAY_MS` (30000)
   - Calculate delay: `min(INITIAL_DELAY * MULTIPLIER^attempt, MAX_DELAY)`
   - Options for delayed retry:
     - Option A: Use RabbitMQ delayed message plugin (`x-delayed-message` exchange) if available
     - Option B: Use per-retry-level delay queues with TTL (e.g., `q.events.retry.1`, `q.events.retry.2`, `q.events.retry.3`)
     - Choose the simpler option (B — TTL queues) for compatibility
   - After max retries exhausted, message goes to DLQ (`xch.notifications.dlq`)

7. **Update Health Check**:
   - Add RabbitMQ connection health indicator to the existing `/health` endpoint
   - Add queue depth information for `q.events.amqp`, `q.events.webhook`, `q.events.email-ingest`
   - Use RabbitMQ management API or `amqplib` channel methods for queue stats
   - Updated response matches spec Section 13:
     ```json
     {
       "status": "healthy",
       "uptime": 86400,
       "checks": {
         "database": { "status": "up", "latencyMs": 2 },
         "rabbitmq": { "status": "up", "latencyMs": 5 },
         "queues": {
           "q.events.amqp": { "depth": 14, "consumers": 3 },
           "q.events.webhook": { "depth": 5, "consumers": 2 },
           "q.events.email-ingest": { "depth": 0, "consumers": 2 }
         }
       }
     }
     ```

8. **Consumer error handling**:
   - Transient errors (DB timeouts, RabbitMQ publish failures): retry with backoff
   - Permanent errors (validation, mapping not found, auth failure): dead-letter immediately
   - Log all failures with structured context (correlationId, sourceId, eventType, error)
   - Persist failed events with status `failed` and `error_message` in the events table

9. **Unit & integration tests**:
   - Routing key parser tests: various formats, edge cases
   - Consumer tests: mock RabbitMQ messages, verify pipeline is called correctly
   - Retry logic tests: verify backoff calculation, max retries enforcement
   - DLQ behavior: verify messages are dead-lettered after max retries
   - Health check: verify RabbitMQ health reporting
```

---

## Iteration 5 — Mapping Cache, Prometheus Metrics & Production Hardening

### Goal
Add the optional eager mapping cache with event-driven invalidation, Prometheus metrics for all key observability indicators, finalize structured logging, and create end-to-end tests with Docker Compose.

### Features
- Eager mapping cache: load all active mappings on startup before accepting events
- Event-driven invalidation via `q.config.mapping-cache` consumer
- Single-flight pattern: only one DB query per cache key on cache miss
- `MAPPING_CACHE_ENABLED` toggle (default: false)
- Prometheus metrics: all 12+ metrics from spec Section 13
- `/metrics` endpoint in Prometheus exposition format
- Finalized structured JSON logging with all standard fields
- Docker Compose file for local development (PostgreSQL + RabbitMQ + service)
- Dockerfile for the service
- End-to-end test: submit event via webhook → verify normalized event published to RabbitMQ
- End-to-end test: publish event to xch.events.incoming → verify full pipeline execution

### Prompt

```
Implement Iteration 5 of the Event Ingestion Service — Mapping Cache, Prometheus Metrics & Production Hardening.

Working directory: event-ingestion-service/

IMPORTANT: Read docs/07-event-ingestion-service.md first — Sections 3.2 (Mapping Cache Strategy), 13 (Monitoring & Health Checks), and 14 (Configuration). All implementation must match the spec precisely.

This iteration builds on Iterations 1–4. The full service is functional with webhook endpoint, RabbitMQ consumers, pipeline, mapping engine, auth, dedup, and retry. Now add caching, observability, and production readiness.

Tasks:

1. **Mapping Cache** (`src/mapping/mapping-cache.service.ts`):
   - Implement the eager cache with event-driven invalidation as described in Section 3.2
   - **Toggle:** Only active when `MAPPING_CACHE_ENABLED=true`. When `false`, the `MappingLookupService` queries PostgreSQL directly on every call (existing behavior from Iteration 2).
   - **Phase 1 — Eager Warm-Up:**
     - On application bootstrap (use `OnApplicationBootstrap` lifecycle hook), before the service starts accepting events:
       - Execute `SELECT * FROM event_mappings WHERE is_active = true`
       - Load all rows into an in-memory `Map<string, MappingConfig>` keyed by `${sourceId}:${eventType}`
       - Do NOT bind RabbitMQ consumers or open webhook endpoint until cache is fully populated
       - Log the number of mappings loaded at startup
   - **Phase 2 — Event-Driven Invalidation:**
     - Assert exchange `xch.config.events` (topic, durable)
     - Assert queue `q.config.mapping-cache` bound with routing key `config.mapping.changed`, concurrency 1, prefetch 1, NO DLQ
     - On receiving invalidation event `{ id: UUID, version: number }`:
       1. Fetch the updated `event_mappings` row from PostgreSQL by `id`
       2. Compare fetched `version` with cached version
       3. If newer: replace entry in cache (or remove if `is_active = false`)
       4. If equal or older: discard (out-of-order delivery)
     - Log each invalidation event processed
   - **Single-Flight Pattern:**
     - On cache miss (key not in Map), only issue ONE database query for that key
     - Use a `Map<string, Promise<MappingConfig>>` of in-flight queries
     - Concurrent requests for the same key await the same Promise
     - After the query resolves, populate the cache and clean up the in-flight entry
   - **Integration with MappingLookupService:**
     - Modify `MappingLookupService` to check `MAPPING_CACHE_ENABLED`:
       - If `true`: resolve from cache, single-flight on miss, then wildcard fallback
       - If `false`: direct DB query (existing behavior)

2. **Prometheus Metrics** (`src/metrics/`):
   - Install `@willsoto/nestjs-prometheus` (or `prom-client` directly)
   - Create `metrics.module.ts` and register all metrics from spec Section 13:
     - `event_ingestion_received_total` — Counter, labels: `sourceId`
     - `event_ingestion_published_total` — Counter
     - `event_ingestion_failed_total` — Counter
     - `event_ingestion_duplicate_total` — Counter
     - `event_ingestion_validation_errors_total` — Counter, labels: `sourceId`
     - `event_ingestion_mapping_not_found_total` — Counter
     - `event_ingestion_processing_duration_ms` — Histogram (buckets: 10, 25, 50, 100, 250, 500, 1000, 2500)
     - `event_ingestion_queue_depth` — Gauge, labels: `queue`
     - `event_ingestion_consumer_lag` — Gauge
     - `event_ingestion_dlq_depth` — Gauge
     - `event_ingestion_service_pool_active` — Gauge
     - `event_ingestion_mapping_cache_hit_rate` — Gauge (only when cache enabled)
     - `event_ingestion_mapping_cache_invalidations_total` — Counter (only when cache enabled)
   - Expose `GET /metrics` endpoint in Prometheus exposition format
   - Instrument the pipeline service: increment counters, observe histograms at each pipeline step

3. **Structured Logging Finalization**:
   - Ensure ALL log entries follow the JSON format from Section 13:
     ```json
     {
       "timestamp": "ISO-8601",
       "level": "info|warn|error|debug",
       "service": "event-ingestion-service",
       "correlationId": "...",
       "eventId": "...",
       "sourceId": "...",
       "eventType": "...",
       "message": "...",
       "durationMs": 45
     }
     ```
   - Add correlationId propagation throughout the request lifecycle (use `nestjs-cls` or AsyncLocalStorage)
   - Log at appropriate levels: info for normal processing, warn for validation failures and duplicates, error for failures
   - Log pipeline start, each major step completion, and final outcome

4. **Docker Compose** (`docker-compose.yml` in `event-ingestion-service/`):
   - PostgreSQL 16 with `event_ingestion_service` schema initialized (mount `dbscripts/` for init)
   - RabbitMQ 3.13 with management plugin (ports 5672 + 15672)
   - The Event Ingestion Service itself (build from Dockerfile)
   - Network configuration, health checks, dependency ordering

5. **Dockerfile** (`event-ingestion-service/Dockerfile`):
   - Multi-stage build: build stage (npm ci, npm run build) → production stage (node dist/main.js)
   - Non-root user, minimal image size
   - Health check instruction

6. **End-to-end tests** (`test/e2e/`):
   - Test 1 — Webhook E2E: Start service with Docker Compose, submit event via `POST /webhooks/events`, verify:
     - 202 response with eventId
     - Event persisted in PostgreSQL with status `published`
     - Normalized event published to `xch.events.normalized` with correct routing key
   - Test 2 — AMQP E2E: Publish raw event to `xch.events.incoming` with routing key `source.test-source.order.shipped`, verify:
     - Event consumed and processed through pipeline
     - Event persisted with status `published`
     - Normalized event published to `xch.events.normalized`
   - Test 3 — Deduplication E2E: Submit same event twice via webhook, verify first returns 202, second returns 200 with same eventId
   - Test 4 — Cache E2E (when enabled): Start with `MAPPING_CACHE_ENABLED=true`, verify mappings loaded on startup, publish cache invalidation event, verify cache updated

7. **Unit tests for new features**:
   - Mapping cache: warm-up, cache hit, cache miss + single-flight, invalidation (newer version replaces, older version discarded)
   - Metrics: verify counters increment correctly
   - Toggle behavior: `MAPPING_CACHE_ENABLED=false` → direct DB, `true` → cache
```

---

## Dependency Graph

```
Iteration 1 ──► Iteration 2 ──► Iteration 3 ──► Iteration 4 ──► Iteration 5
  Scaffolding      Mapping         Pipeline        RabbitMQ         Cache
  Database         Engine          REST API        Consumers        Metrics
  Config           Auth/Dedup      Publisher        DLQ/Retry       Docker
  Health           Validation      Query APIs       Health++         E2E Tests
```

Each iteration produces a **buildable, testable** service. After Iteration 3, the service is fully functional for webhook-based event ingestion. After Iteration 4, it handles both HTTP and AMQP event sources. Iteration 5 adds production-grade observability and deployment.

---

## Key Dependencies (npm packages)

| Package | Iteration | Purpose |
|---|---|---|
| `@nestjs/config`, `joi` | 1 | Configuration with validation |
| `@nestjs/typeorm`, `typeorm`, `pg` | 1 | PostgreSQL ORM |
| `nestjs-pino`, `pino-http`, `pino-pretty` | 1 | Structured logging |
| `@nestjs/terminus` | 1 | Health checks |
| `uuid` | 1 | UUID generation |
| `ajv`, `ajv-formats` | 2 | JSON Schema validation |
| `handlebars` | 2 | Template transform |
| `dayjs` | 2 | Date parsing/formatting |
| `jsonpath-plus` | 2 | JSONPath extraction |
| `class-validator`, `class-transformer` | 3 | DTO validation |
| `@nestjs/throttler` | 3 | Rate limiting |
| `@golevelup/nestjs-rabbitmq` | 3/4 | RabbitMQ integration |
| `amqplib` | 3/4 | AMQP protocol |
| `@willsoto/nestjs-prometheus` or `prom-client` | 5 | Prometheus metrics |
| `nestjs-cls` | 5 | Correlation ID propagation |

---

*Generated: 2026-02-21 — Notification API Architecture Team*
