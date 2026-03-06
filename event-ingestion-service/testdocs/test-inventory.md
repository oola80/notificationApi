# Event Ingestion Service - Test Inventory

> **264 unit tests / 33 suites + 1 E2E file**
> Generated: 2026-03-06

---

## Table of Contents

1. [Unit Tests by Module](#unit-tests-by-module)
   - [Common](#common)
   - [Normalization](#normalization)
   - [Event Mappings](#event-mappings)
   - [Events](#events)
   - [Event Sources](#event-sources)
   - [Consumers](#consumers)
   - [RabbitMQ](#rabbitmq)
   - [Webhook](#webhook)
   - [Mapping Cache](#mapping-cache)
   - [Rate Limiter](#rate-limiter)
   - [Metrics](#metrics)
   - [Health](#health)
2. [E2E Tests](#e2e-tests)
3. [Suggested Additional Tests](#suggested-additional-tests)

---

## Unit Tests by Module

### Common

#### `common/filters/http-exception.filter.spec.ts` (5 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should pass through ErrorResponse with code property | Verifies standard error responses are forwarded without transformation |
| 2 | should transform class-validator error array to EIS-001 | Ensures validation errors get wrapped into the standard error format |
| 3 | should wrap string response with EIS-007 | Handles unexpected string-type error responses |
| 4 | should include stack trace in non-production environment | Stack traces shown in dev for debugging |
| 5 | should not include stack trace in production | Stack traces hidden in production for security |

#### `common/interceptors/logging.interceptor.spec.ts` (9 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should log info for successful requests | 2xx responses logged at info level |
| 2 | should log warn for 4xx responses | Client errors logged at warn level |
| 3 | should log error for 5xx responses | Server errors logged at error level |
| 4 | should log warn for error responses with 4xx status | Thrown 4xx errors also log as warn |
| 5 | should log error for error responses with 5xx status | Thrown 5xx errors also log as error |
| 6 | should include correlationId from x-request-id header | Correlation ID extraction from request header |
| 7 | should include sourceId from request body | Source identification in log context |
| 8 | should pass through without logging for non-HTTP contexts | RabbitMQ/non-HTTP contexts are skipped |
| 9 | should include method, URL, statusCode, and durationMs in log context | Verifies all expected fields in log output |

#### `common/pipes/dto-validation.pipe.spec.ts` (3 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should pass valid DTOs through | Valid payloads pass without error |
| 2 | should throw HttpException with EIS-001 for missing required fields | Missing fields produce the correct error code |
| 3 | should reject non-whitelisted properties with EIS-001 error | Extra properties are stripped/rejected |

#### `common/utils/dot-path.util.spec.ts` (10 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | extractValue: should extract a top-level property | Basic property access |
| 2 | extractValue: should extract a nested property | Dot-notation nested access |
| 3 | extractValue: should extract a deeply nested property | Multi-level deep access |
| 4 | extractValue: should support array index in paths | Array bracket notation |
| 5 | extractValue: should return undefined for missing segments | Graceful handling of bad paths |
| 6 | extractValue: should return undefined for null payload | Null input safety |
| 7 | extractValue: should return undefined for empty path | Empty path safety |
| 8 | extractValue: should return undefined for undefined payload | Undefined input safety |
| 9 | extractValues: should extract multiple values | Batch extraction of multiple paths |
| 10 | extractValues: should return undefined for missing paths | Batch extraction with missing paths |

#### `common/utils/timestamp.util.spec.ts` (9 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should return current UTC timestamp when value is null | Default timestamp for null input |
| 2 | should return current UTC timestamp when value is undefined | Default timestamp for undefined input |
| 3 | should passthrough and validate iso8601 format | ISO-8601 strings pass validation |
| 4 | should throw on invalid iso8601 | Invalid ISO strings are rejected |
| 5 | should convert epoch_ms to ISO-8601 | Millisecond epoch conversion |
| 6 | should convert epoch_s to ISO-8601 | Second epoch conversion |
| 7 | should parse custom dayjs format string | Custom date format parsing |
| 8 | should throw on invalid custom format | Bad custom format rejected |
| 9 | should default to iso8601 when format is not specified | Missing format defaults to ISO |

---

### Normalization

#### `normalization/mapping-engine.service.spec.ts` (11 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Service instantiation |
| 2 | should normalize a simple direct mapping | Basic field extraction and mapping |
| 3 | should apply default value when source is missing | Default values fill missing fields |
| 4 | should handle concatenate transform with multiple sources | Multi-source field concatenation |
| 5 | should handle static transform ignoring source | Static values bypass source extraction |
| 6 | should report missing required fields | Required field validation produces warnings |
| 7 | should add warning for unknown transforms | Graceful handling of invalid transform names |
| 8 | should add warning on transform error | Transform execution errors reported as warnings |
| 9 | should handle multiple field mappings | Multiple fields processed in one pass |
| 10 | should report required field as missing when transform throws | Failed transform on required field flagged |
| 11 | should use field name as target when target is missing | Target defaults to field name |

#### `normalization/event-type-resolver.service.spec.ts` (5 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Service instantiation |
| 2 | should return raw type when no mapping provided | Passthrough when no mapping exists |
| 3 | should return exact match from mapping | Exact event type match resolution |
| 4 | should return wildcard match when no exact match | Wildcard fallback resolution |
| 5 | should return raw type when no exact or wildcard match | Final fallback to raw type |

#### `normalization/payload-validator.service.spec.ts` (6 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Service instantiation |
| 2 | should validate a correct payload against schema | Valid payloads pass JSON Schema validation |
| 3 | should return errors for invalid payload | Invalid payloads produce error messages |
| 4 | should report type mismatches | Wrong types detected by schema validation |
| 5 | should return all errors when multiple validations fail | Multiple errors collected in a single pass |
| 6 | should validate a payload with no required fields | Optional-only schemas handled correctly |

#### `normalization/transforms/transforms.spec.ts` (24 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | direct: should return value as-is | Identity transform |
| 2 | direct: should return objects as-is | Object passthrough |
| 3 | concatenate: should join values with separator | String concatenation with custom separator |
| 4 | concatenate: should join without separator by default | Default (no separator) concatenation |
| 5 | map: should map value using mappings object | Value lookup/translation |
| 6 | map: should return original value when no mapping found | Unmapped values pass through |
| 7 | prefix: should prepend prefix to value | Prefix string transform |
| 8 | suffix: should append suffix to value | Suffix string transform |
| 9 | template: should replace template placeholders with payload values | Handlebars-style template interpolation |
| 10 | template: should replace missing values with empty string | Missing template vars default to empty |
| 11 | dateFormat: should parse and format a date | Date reformatting |
| 12 | dateFormat: should parse with custom input format | Custom input date format |
| 13 | dateFormat: should throw on invalid date | Invalid date rejection |
| 14 | epochToIso: should convert epoch ms to ISO-8601 | Epoch milliseconds conversion |
| 15 | epochToIso: should convert epoch seconds to ISO-8601 | Epoch seconds conversion |
| 16 | toNumber: should convert string to number | String-to-number cast |
| 17 | toNumber: should throw on NaN | Non-numeric string rejection |
| 18 | toString: should convert number to string | Number-to-string cast |
| 19 | toString: should convert boolean to string | Boolean-to-string cast |
| 20 | arrayMap: should rename keys in array items | Array item key renaming |
| 21 | arrayMap: should preserve fields not in rename map | Non-renamed array fields kept |
| 22 | jsonPath: should extract values using JSONPath expression | JSONPath query extraction |
| 23 | static: should return the static value ignoring source | Static value injection |
| 24 | static: should return null static value | Null static value injection |

---

### Event Mappings

#### `event-mappings/event-mappings.controller.spec.ts` (7 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Controller instantiation |
| 2 | findAll: should delegate to service.findAll with query params | Pagination/filter params forwarded to service |
| 3 | findById: should delegate to service.findById | Single mapping lookup delegation |
| 4 | create: should delegate to service.create | Creation delegation |
| 5 | update: should delegate to service.update | Update delegation |
| 6 | remove: should delegate to service.softDelete | Soft delete delegation |
| 7 | testMapping: should delegate to service.testMapping | Test endpoint delegation |

#### `event-mappings/event-mappings.service.spec.ts` (19 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Service instantiation |
| 2 | findAll: should return paginated results | Pagination works correctly |
| 3 | findAll: should apply filters when provided | Query filters applied to DB lookup |
| 4 | findById: should return the mapping when found | Successful single lookup |
| 5 | findById: should throw EIS-002 when not found | 404 for missing mapping |
| 6 | create: should create a new mapping when no conflict exists | Successful creation |
| 7 | create: should throw EIS-009 when active mapping conflict exists | Duplicate active mapping prevention |
| 8 | create: should publish config.mapping.changed after create | Cache invalidation message published |
| 9 | update: should update the mapping and increment version | Optimistic concurrency via version |
| 10 | update: should throw EIS-002 when mapping not found | 404 on update of missing mapping |
| 11 | update: should publish config.mapping.changed after update | Cache invalidation on update |
| 12 | softDelete: should set isActive to false | Logical deletion |
| 13 | softDelete: should throw EIS-002 when mapping not found | 404 on delete of missing mapping |
| 14 | softDelete: should publish config.mapping.changed after soft delete | Cache invalidation on delete |
| 15 | testMapping: should return canonical event for valid payload | End-to-end mapping test with sample payload |
| 16 | testMapping: should throw EIS-002 when mapping not found | 404 for test on missing mapping |
| 17 | testMapping: should include validation errors as warnings | Validation issues shown as warnings in test result |
| 18 | testMapping: should report missing required fields | Required field gaps reported |
| 19 | publish failure handling: should not throw when publish fails after create | RabbitMQ publish failure doesn't break create |

---

### Events

#### `events/events.controller.spec.ts` (3 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Controller instantiation |
| 2 | findAll: should delegate to service.findAll | Paginated event list delegation |
| 3 | findByEventId: should delegate to service.findByEventId | Single event lookup delegation |

#### `events/events.service.spec.ts` (7 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Service instantiation |
| 2 | findByEventId: should return the event when found | Successful event lookup |
| 3 | findByEventId: should throw EIS-015 when not found | 404 for missing event |
| 4 | findAll: should return paginated results with filters | Pagination + filtering on events |
| 5 | createEvent: should delegate to repository and return CreateEventResult | Event persistence delegation |
| 6 | updateStatus: should update event status | Status transition (e.g., published/failed) |
| 7 | updateStatus: should throw EIS-015 when event not found | 404 on status update of missing event |

---

### Event Sources

#### `event-sources/event-sources.repository.spec.ts` (3 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Repository instantiation |
| 2 | findByName: should find a source by name | Lookup source by name |
| 3 | findByName: should return null when source not found | Null result for missing source |

---

### Consumers

#### `consumers/event-processing.service.spec.ts` (23 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Service instantiation |
| 2 | should process a valid event end-to-end and return published status | Full happy-path pipeline |
| 3 | should call EventPublisherService.publishNormalized | Verifies RabbitMQ publish is invoked |
| 4 | should throw EIS-003 when source not found | Missing source system rejection |
| 5 | should throw EIS-008 when source is inactive | Inactive source rejection |
| 6 | should throw EIS-014 when no mapping found | Missing mapping rejection |
| 7 | should increment mappingNotFound metric when no mapping found | Metrics tracking for missing mappings |
| 8 | should throw EIS-005 when validation fails | Schema validation failure |
| 9 | should increment validationError metric when validation fails | Metrics tracking for validation errors |
| 10 | should return duplicate result when dedup finds existing event | Duplicate detection via sourceEventId |
| 11 | should increment duplicate metric when dedup detects duplicate | Metrics tracking for duplicates |
| 12 | should throw EIS-016 when normalization fails with missing required fields | Required field normalization failure |
| 13 | should persist event then update to published on success | Two-phase persistence (create then update status) |
| 14 | should update status to failed and rethrow on publish failure | Failed publish updates event status to failed |
| 15 | should use MappingCacheService.getMapping for mapping lookup | Cache-first mapping resolution |
| 16 | should increment received metric at entry | Entry metric counter |
| 17 | should increment published metric and observe duration on success | Success metric + histogram |
| 18 | should include sourceEventId, receivedAt, and normalizedAt in metadata | Metadata fields populated correctly |
| 19 | should set sourceEventId to null in metadata when not provided | Optional sourceEventId handled |
| 20 | should use metadata key instead of _meta | Correct metadata key naming |
| 21 | should return duplicate when ON CONFLICT detects duplicate at persistence | DB-level duplicate detection |
| 22 | should throw EIS-017 when source rate limit is exceeded | Per-source rate limit enforcement |
| 23 | should not check source rate limit when rateLimit is null | Rate limit skipped when not configured |
| 24 | should allow event when source rate limit is not exceeded | Rate limit within threshold passes |

#### `consumers/amqp-event.consumer.spec.ts` (9 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Consumer instantiation |
| 2 | should ACK on successful processing | Successful message acknowledged |
| 3 | should retry on retryable error and republish with incremented count | Retry with exponential backoff |
| 4 | should Nack to DLQ after max retries exceeded | Dead-letter after retry exhaustion |
| 5 | should Nack immediately on non-retryable error (EIS-003) | Source-not-found goes straight to DLQ |
| 6 | should Nack immediately on non-retryable error (EIS-005) | Validation-failure goes straight to DLQ |
| 7 | should Nack immediately on non-retryable error (EIS-014) | No-mapping goes straight to DLQ |
| 8 | should retry on unknown errors | Unexpected errors treated as retryable |
| 9 | should Nack on invalid routing key | Malformed routing key rejected |

#### `consumers/webhook-event.consumer.spec.ts` (6 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Consumer instantiation |
| 2 | should ACK on successful processing | Successful message acknowledged |
| 3 | should retry on retryable error | Retryable errors trigger republish |
| 4 | should Nack on non-retryable error | Non-retryable errors go to DLQ |
| 5 | should Nack after max retries | Retry exhaustion goes to DLQ |
| 6 | should use correct exchange for republish | Republish targets the correct exchange |

#### `consumers/email-ingest-event.consumer.spec.ts` (6 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Consumer instantiation |
| 2 | should ACK on successful processing | Successful message acknowledged |
| 3 | should retry on retryable error | Retryable errors trigger republish |
| 4 | should Nack on non-retryable error | Non-retryable errors go to DLQ |
| 5 | should Nack after max retries | Retry exhaustion goes to DLQ |
| 6 | should use correct exchange for republish | Republish targets the correct exchange |

---

### RabbitMQ

#### `rabbitmq/event-publisher.service.spec.ts` (7 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Service instantiation |
| 2 | should publish to the correct exchange with correct routing key | Exchange + routing key correctness |
| 3 | should include custom headers | Custom AMQP headers passed through |
| 4 | should use critical priority routing key | Priority-based routing key for critical events |
| 5 | should include publishedAt timestamp in message | Publish timestamp injected |
| 6 | should throw EIS-018 on publish failure | Publish error wrapped in domain error |
| 7 | should set persistent delivery mode | Message persistence for durability |

#### `rabbitmq/rabbitmq.constants.spec.ts` (12 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should have correct exchange names | Exchange name constants verified |
| 2 | should have correct queue names | Queue name constants verified |
| 3 | incomingRoutingKey: should build routing key with sourceId and eventType | Routing key construction |
| 4 | incomingRoutingKey: should handle simple event types | Simple event type routing |
| 5 | normalizedRoutingKey: should build routing key with priority and eventType | Priority-aware routing key |
| 6 | normalizedRoutingKey: should handle normal priority | Normal priority routing |
| 7 | parseIncomingRoutingKey: should parse a valid routing key | Routing key decomposition |
| 8 | parseIncomingRoutingKey: should handle multi-segment event types | Dotted event types parsed correctly |
| 9 | parseIncomingRoutingKey: should handle simple event types | Simple key parsing |
| 10 | parseIncomingRoutingKey: should throw on invalid format - missing source prefix | Validation of source prefix |
| 11 | parseIncomingRoutingKey: should throw on invalid format - too few segments | Minimum segment validation |
| 12 | parseIncomingRoutingKey: should throw on empty string | Empty string rejection |

---

### Webhook

#### `webhook/webhook.controller.spec.ts` (5 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Controller instantiation |
| 2 | should return 202 for new events | New events return Accepted status |
| 3 | should return 200 for duplicate events | Duplicate events return OK (idempotent) |
| 4 | should generate correlationId when x-request-id not provided | Auto-generated correlation ID |
| 5 | should use x-request-id as correlationId when provided | External correlation ID forwarded |

#### `webhook/webhook.service.spec.ts` (4 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Service instantiation |
| 2 | should delegate to EventProcessingService.processEvent | Thin adapter pattern verified |
| 3 | should construct EventProcessingInput correctly from dto | DTO-to-internal-model transformation |
| 4 | should propagate errors from EventProcessingService | Error propagation from processing pipeline |

#### `webhook/guards/source-auth.guard.spec.ts` (4 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Guard instantiation |
| 2 | should return true and attach eventSource when auth succeeds | Successful auth attaches source to request |
| 3 | should return false when sourceId is missing from body | Missing source ID blocks request |
| 4 | should propagate auth errors from SourceAuthService | Auth errors forwarded correctly |

#### `webhook/services/source-auth.service.spec.ts` (7 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Service instantiation |
| 2 | should authenticate via API key | API key auth mechanism |
| 3 | should authenticate via Bearer token | Bearer token auth mechanism |
| 4 | should authenticate via HMAC signature | HMAC signature auth mechanism |
| 5 | should throw EIS-003 when source not found | Unknown source rejection |
| 6 | should throw EIS-008 when source is inactive | Inactive source rejection |
| 7 | should throw EIS-013 when credentials are invalid | Bad credentials rejection |

#### `webhook/services/deduplication.service.spec.ts` (5 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Service instantiation |
| 2 | should skip check when sourceEventId is null | Null sourceEventId skips dedup |
| 3 | should skip check when sourceEventId is empty string | Empty sourceEventId skips dedup |
| 4 | should return isDuplicate true when existing event found | Duplicate detected |
| 5 | should return isDuplicate false when no existing event found | Non-duplicate confirmed |

---

### Mapping Cache

#### `mapping-cache/mapping-cache.service.spec.ts` (18 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Service instantiation |
| 2 | (disabled) should set ready=true immediately on init | Disabled cache is immediately ready |
| 3 | (disabled) should not call findAllActive on init | No DB warm-up when disabled |
| 4 | (disabled) should fall through to direct DB lookup on getMapping | Disabled mode queries DB directly |
| 5 | (disabled) should try wildcard when exact match not found | Wildcard fallback in disabled mode |
| 6 | (disabled) should return null when no mapping found | Null result in disabled mode |
| 7 | (enabled) should warm up cache on init | Cache populated from DB on startup |
| 8 | (enabled) should throw EIS-021 when cache is not ready | Requests rejected before warm-up completes |
| 9 | (enabled) should return cached mapping on exact key hit | Cache hit for exact source+type match |
| 10 | (enabled) should return cached wildcard mapping on wildcard key hit | Cache hit for wildcard mapping |
| 11 | (enabled) should fetch from DB on cache miss and populate cache | Cache miss triggers DB fetch + cache population |
| 12 | (enabled) should return null on cache miss when DB has no mapping | Null result when DB has nothing |
| 13 | (enabled) should deduplicate concurrent fetches for the same key | Single-flight pattern prevents thundering herd |
| 14 | invalidateMapping: should update cache entry when newer version is available | Version-based cache invalidation (newer wins) |
| 15 | invalidateMapping: should discard invalidation when cached version is newer or equal | Stale invalidation messages ignored |
| 16 | invalidateMapping: should remove mapping from cache when fetched mapping is inactive | Inactive mappings evicted from cache |
| 17 | invalidateMapping: should remove mapping from cache when not found in DB | Deleted mappings evicted from cache |
| 18 | getCacheStats: should return correct stats | Cache statistics (size, hits, misses) |

#### `mapping-cache/mapping-cache.consumer.spec.ts` (4 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Consumer instantiation |
| 2 | should delegate to MappingCacheService.invalidateMapping | Message forwarded to cache service |
| 3 | should increment cache invalidation metric on success | Metrics tracking for invalidations |
| 4 | should not throw when invalidateMapping fails | Consumer resilience on cache errors |

---

### Rate Limiter

#### `rate-limiter/rate-limiter.service.spec.ts` (10 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Service instantiation |
| 2 | checkGlobalWebhookLimit: should allow requests within the limit | Under-limit requests pass |
| 3 | checkGlobalWebhookLimit: should reject request when limit is exceeded | Over-limit requests blocked |
| 4 | checkGlobalWebhookLimit: should allow requests again after the window slides | Window reset allows new requests |
| 5 | checkSourceLimit: should allow requests within the per-source limit | Per-source under-limit passes |
| 6 | checkSourceLimit: should reject when per-source limit is exceeded | Per-source over-limit blocked |
| 7 | checkSourceLimit: should maintain independent counters per source | Source isolation verified |
| 8 | checkSourceLimit: should not interfere with global webhook limit | Source limits independent of global limit |
| 9 | (high limit) should allow many requests with high limit | High-throughput configuration works |
| 10 | (boundary) should reject at exactly limit + 1 | Exact boundary behavior |

#### `rate-limiter/guards/webhook-rate-limit.guard.spec.ts` (4 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Guard instantiation |
| 2 | should allow request when rate limit is not exceeded | Under-limit passes guard |
| 3 | should throw EIS-017 when rate limit is exceeded | Over-limit produces correct error |
| 4 | should set Retry-After header when rate limit is exceeded | Retry-After header set for rate-limited responses |

---

### Metrics

#### `metrics/metrics.service.spec.ts` (11 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Service instantiation |
| 2 | should have a registry with all metrics registered | All 13 metrics present in registry |
| 3 | should increment receivedTotal counter with sourceId label | Per-source received count |
| 4 | should increment publishedTotal counter | Published event count |
| 5 | should increment failedTotal counter | Failed event count |
| 6 | should increment duplicateTotal counter | Duplicate event count |
| 7 | should increment validationErrorsTotal with sourceId label | Per-source validation error count |
| 8 | should increment mappingNotFoundTotal counter | Missing mapping count |
| 9 | should increment cacheInvalidation counter | Cache invalidation count |
| 10 | should observe processing duration in histogram | Processing time histogram |
| 11 | should register default metrics on module init | Default Node.js metrics registered |

#### `metrics/metrics.controller.spec.ts` (3 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Controller instantiation |
| 2 | should return metrics in Prometheus text format with correct content-type | Prometheus scrape endpoint format |
| 3 | should return 200 status | Metrics endpoint returns OK |

---

### Health

#### `health/health.controller.spec.ts` (4 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Controller instantiation |
| 2 | should return healthy status when all services are up | Happy-path health check |
| 3 | should report unhealthy when database is down | DB failure detected |
| 4 | should include both database and rabbitmq in health check | Both dependencies checked |

#### `health/rabbitmq.health-indicator.spec.ts` (5 tests)

| # | Test | Purpose |
|---|------|---------|
| 1 | should be defined | Indicator instantiation |
| 2 | should report healthy when connected | Connected status reported |
| 3 | should include queue depths when available | Queue depth monitoring via Management API |
| 4 | should report unhealthy when disconnected | Disconnected status reported |
| 5 | should still report connected status when Management API fails | Graceful degradation when Management API is down |

---

## E2E Tests

#### `test/app.e2e-spec.ts` (1 test)

| # | Test | Purpose |
|---|------|---------|
| 1 | /health (GET) | Verifies the health endpoint returns expected response via HTTP |

---

## Suggested Additional Tests

### High Priority

#### 1. E2E Tests - Webhook Pipeline
**File:** `test/webhook-pipeline.e2e-spec.ts`
- POST /webhooks/events with valid payload (full pipeline: auth -> dedup -> normalize -> persist -> publish)
- POST /webhooks/events with duplicate sourceEventId returns 200
- POST /webhooks/events with invalid auth returns 401/403
- POST /webhooks/events with unknown sourceId returns 404
- POST /webhooks/events with malformed payload returns 400
- POST /webhooks/events when rate-limited returns 429 with Retry-After header

> **Why:** The webhook pipeline is the primary entry point. Currently only unit tests cover individual steps; no E2E test validates the full HTTP-to-RabbitMQ flow.

#### 2. E2E Tests - Event Mappings CRUD
**File:** `test/event-mappings.e2e-spec.ts`
- POST /event-mappings creates a mapping
- GET /event-mappings returns paginated list
- GET /event-mappings/:id returns single mapping
- PATCH /event-mappings/:id updates mapping
- DELETE /event-mappings/:id soft-deletes mapping
- POST /event-mappings/:id/test with sample payload returns normalized result
- POST /event-mappings with duplicate sourceId+eventType returns conflict error

> **Why:** CRUD endpoints have only controller-level delegation tests. No E2E test verifies HTTP request -> DB persistence -> response.

#### 3. E2E Tests - Events Query
**File:** `test/events.e2e-spec.ts`
- GET /events returns paginated list with filters
- GET /events/:eventId returns single event
- GET /events/:eventId with non-existent ID returns 404

> **Why:** Event query endpoints lack E2E coverage.

#### 4. Event Mappings Repository Tests
**File:** `src/event-mappings/event-mappings.repository.spec.ts`
- findBySourceAndType returns matching active mapping
- findBySourceAndType returns null when no match
- existsActiveMapping returns true when conflict exists
- existsActiveMapping returns false when no conflict
- Soft-deleted mappings excluded from active queries

> **Why:** The repository has custom methods (`findBySourceAndType`, `existsActiveMapping`) with no dedicated unit tests. They're indirectly tested through the service but should be tested in isolation.

#### 5. Events Repository Tests
**File:** `src/events/events.repository.spec.ts`
- createEvent persists event and returns result
- createEvent returns duplicate flag on ON CONFLICT
- findByEventId returns event with all fields
- findByEventId returns null for missing event
- findDuplicate returns existing event within dedup window
- findDuplicate returns null outside dedup window

> **Why:** The events repository has custom queries (especially the ON CONFLICT dedup logic) with no dedicated unit tests.

### Medium Priority

#### 6. Config/Environment Validation Tests
**File:** `src/config/env.validation.spec.ts`
- Valid environment passes validation
- Missing required variables throws error
- Invalid PORT (non-numeric) throws error
- Invalid DB_PORT (non-numeric) throws error
- Invalid RABBITMQ_PORT (non-numeric) throws error
- Default values applied when optional vars missing

> **Why:** Environment validation is a critical bootstrap step. Bad config should fail fast with clear errors.

#### 7. DTO Validation Tests
**File:** `src/event-mappings/dto/create-event-mapping.dto.spec.ts`
- Valid DTO passes validation
- Missing sourceId rejected
- Missing eventType rejected
- Missing name rejected
- Missing fieldMappings rejected
- Invalid fieldMappings structure rejected
- Extra properties stripped

**File:** `src/webhook/dto/webhook-event.dto.spec.ts`
- Valid DTO passes validation
- Missing sourceId rejected
- Missing payload rejected
- Optional fields (sourceEventId, timestamp, cycleId) accepted when missing

> **Why:** DTOs are the system boundary where external input enters. Explicit DTO validation tests document the contract and catch regressions in validation rules.

#### 8. Consumer Retry/Backoff Calculation Tests
**File:** `src/consumers/base-event.consumer.spec.ts`
- calculateDelay returns initial delay for retry 1
- calculateDelay applies backoff multiplier for retry 2
- calculateDelay caps at max delay
- isRetryable returns true for retryable error codes
- isRetryable returns false for non-retryable error codes (EIS-003, EIS-005, EIS-014)
- isRetryable returns true for unknown errors

> **Why:** The base consumer has retry logic (backoff calculation, retryable classification) that's only indirectly tested through subclass tests.

### Lower Priority

#### 9. AppModule Integration Test
**File:** `src/app.module.spec.ts`
- Module compiles successfully with all dependencies
- All expected modules are imported

> **Why:** Catches wiring errors (missing imports, circular dependencies) early.

#### 10. Concurrent Request Handling
**File:** `src/rate-limiter/rate-limiter.service.spec.ts` (additions)
- Concurrent requests near limit boundary handled correctly
- Multiple sources rate-limited independently under concurrent load

> **Why:** Sliding-window rate limiters can have race conditions. Concurrent tests validate thread safety.

#### 11. Mapping Cache Warm-up Failure
**File:** `src/mapping-cache/mapping-cache.service.spec.ts` (additions)
- Cache warm-up handles DB connection failure gracefully
- Cache warm-up with empty DB (no mappings) sets ready=true
- Cache warm-up with large dataset completes within timeout

> **Why:** Cache warm-up failure at startup could leave the service in a broken state.

#### 12. Source Auth HMAC Edge Cases
**File:** `src/webhook/services/source-auth.service.spec.ts` (additions)
- HMAC with different algorithms (sha256, sha512)
- HMAC with empty payload
- Timing-safe comparison prevents timing attacks (behavioral verification)
- Multiple auth methods configured on same source (priority order)

> **Why:** HMAC auth has subtle edge cases. Timing-safe comparison is security-critical.

---

### Summary

| Category | Existing | Suggested |
|----------|----------|-----------|
| Unit tests | 264 (33 suites) | ~40-50 additional |
| E2E tests | 1 file (health only) | 3 new files (webhook, mappings, events) |
| **Main gaps** | Repository layer, DTOs, E2E pipeline, config validation | |
