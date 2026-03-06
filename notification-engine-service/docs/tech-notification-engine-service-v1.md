# Notification Engine Service — Technical Reference v1

## 1. Overview

| Attribute | Value |
|---|---|
| **Port** | 3152 |
| **Technology** | NestJS 11, TypeScript 5.7, Node.js (ES2023) |
| **DB Schema** | `notification_engine_service` |
| **Status** | Phase 7 complete |
| **Unit Tests** | ~504 across ~51 suites |
| **E2E Tests** | 5 files |

Core orchestrator of the notification platform. Consumes normalized events from the ingestion service, evaluates rules, resolves recipients and channels, checks suppression, requests template rendering, creates notification records, and dispatches delivery messages to the channel router.

---

## 2. Architecture

### Module Structure (`app.module.ts`)

| Module | Responsibility |
|---|---|
| `AppConfigModule` | `ConfigModule.forRoot` with env validation |
| `LoggerModule` | Pino structured logging |
| `TypeOrmModule` | PostgreSQL (`notification_engine_service` schema) |
| `CommonModule` | `@Global()` — errors, filters, pipes, interceptors, base repo |
| `MetricsModule` | `@Global()` — 14 Prometheus metrics, `GET /metrics` |
| `HealthModule` | Custom enriched health endpoint (no Terminus) |
| `RulesModule` | Notification rules CRUD + rule engine + rule cache |
| `RecipientsModule` | Recipient groups CRUD + resolver + channel resolver |
| `PreferencesModule` | Customer channel preferences webhook + LRU cache |
| `OverridesModule` | Critical channel overrides CRUD + eager cache |
| `NotificationsModule` | Notification lifecycle CRUD + suppression engine |
| `AppRabbitMQModule` | `@golevelup/nestjs-rabbitmq` (5 exchanges) |
| `TemplateClientModule` | HTTP client with circuit breaker + retry |
| `ConsumersModule` | 6 consumer handlers + 9-step pipeline |

### Layered Architecture

```
Controllers (HTTP handlers, zero business logic)
    ↓
Services (all orchestration + business rules)
    ↓
Repositories (sole DB access via TypeORM, extend PgBaseRepository)
```

---

## 3. Features & Functionality

### 3.1 Event Processing Pipeline

**`EventProcessingPipelineService`** (`src/consumers/event-processing-pipeline.service.ts`) — 9-step pipeline:

1. **Parse** — Deserialize `NormalizedEventMessage` from consumer payload
2. **Rule lookup** — `RuleCacheService` (cache-first) → `NotificationRulesRepository` for matching event type
3. **Rule match** — `RuleMatcherService`: priority-sorted matching, exclusive rule support
4. **Priority resolution** — `PriorityResolverService`: rule overrides event priority if configured
5. **Recipient resolution** — `RecipientResolverService`: resolves customer/group/custom recipients
6. **Channel resolution** — `ChannelResolverService`: applies preference filter + critical overrides
7. **Suppression check** — `SuppressionEvaluatorService`: dedup/cooldown/maxCount modes
8. **Notification creation** — `NotificationsRepository`: create record with state machine
9. **Template render + dispatch** — `TemplateClientService.render()` per channel, then `NotificationPublisherService.publishToDeliver()` via `Promise.allSettled()` for parallel channel processing

### 3.2 Rule Engine

**`ConditionEvaluatorService`** — evaluates rule conditions using AND logic:

| Operator | Description |
|---|---|
| `eq` | Equals |
| `neq` | Not equals |
| `gt` | Greater than |
| `gte` | Greater than or equal |
| `lt` | Less than |
| `lte` | Less than or equal |
| `contains` | String contains |
| `not_contains` | String does not contain |
| `in` | Value in array |
| `not_in` | Value not in array |

Null conditions match all events (match-all rule). Exclusive rules short-circuit: first matching exclusive rule prevents further processing.

**`RuleMatcherService`** — returns rules sorted by priority ascending (lower = higher priority).

**`PriorityResolverService`** — rule's `deliveryPriority` overrides event's `priority` field if set.

### 3.3 Template Client with Circuit Breaker

**`TemplateClientService`** (`src/template-client/`) — HTTP client (`@nestjs/axios`) for template rendering:

- Base URL from `TEMPLATE_SERVICE_URL` env var
- **3-attempt retry** with exponential backoff on 5xx errors
- **Circuit breaker** (`CircuitBreakerService`):
  - States: `CLOSED` → `OPEN` → `HALF_OPEN` → `CLOSED`
  - Opens after `TEMPLATE_SERVICE_CB_THRESHOLD` consecutive failures
  - Stays open for `TEMPLATE_SERVICE_CB_RESET_MS` milliseconds
  - Allows 1 test request in `HALF_OPEN` state; success closes it
  - Open circuit throws `NES-020`; Prometheus gauge tracks state (0=closed, 1=open, 2=half-open)

### 3.4 Suppression Engine

**`SuppressionEvaluatorService`** (`src/notifications/suppression/`) — 3 modes (checked in short-circuit order):

| Mode | Behavior |
|---|---|
| `deduplication` | Reject if identical `dedupKeyHash` exists within window (FAILED notifications excluded) |
| `cooldown` | Reject if a notification for same rule+recipient was sent within cooldown period |
| `maxCount` | Reject if notification count for rule+recipient exceeds `maxCount` within window |

**`DedupKeyResolverService`** — builds dedup key from rule-configured fields (dot-path extraction), concatenated with pipe `|`, then SHA-256 hashed.

### 3.5 In-Memory Caches

| Cache | Class | Strategy | Invalidation |
|---|---|---|---|
| Rule cache | `RuleCacheService` | Eager warm-up on init, `Map<eventType, rules[]>` | `config.rule.changed` via RabbitMQ |
| Preference cache | `PreferenceCacheService` | LRU read-through, configurable TTL + max size | `customer_id:channel` key eviction on upsert |
| Override cache | `OverrideCacheService` | Eager `Map<eventType, channels[]>`, full reload on change | `config.override.changed` via RabbitMQ |

### 3.6 Notification Lifecycle (State Machine)

**`NotificationLifecycleService`** — enforces valid status transitions:

```
PENDING → PROCESSING → SUPPRESSED
                    → RENDERING → FAILED
                               → DELIVERING → SENT → DELIVERED
                                           → FAILED
```

Status updates are synchronous; status log entries (`notification_status_log`) are written fire-and-forget.

### 3.7 Customer Channel Preferences

**`CustomerPreferencesController`** (`POST /customer-preferences`, `POST /customer-preferences/bulk`) — authenticated via `X-API-Key` guard (`PREFERENCE_WEBHOOK_API_KEY`):

- Single upsert: `INSERT ON CONFLICT DO UPDATE`
- Bulk: up to 1000 records per request (`@ArrayMaxSize(1000)`)
- Cache eviction on each upsert

### 3.8 Critical Channel Overrides

**`CriticalChannelOverridesController`** — 5 CRUD endpoints. Active overrides are eagerly cached. Mutations publish `config.override.changed` to `xch.config.events`.

---

## 4. Data Model

### Tables (schema: `notification_engine_service`)

#### `notification_rules`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `event_type` | VARCHAR(100) | |
| `name` | VARCHAR(255) | |
| `conditions` | JSONB | Array of condition objects |
| `actions` | JSONB | Array of action objects (channels, templates) |
| `suppression` | JSONB | Suppression config (mode, window, maxCount) |
| `priority` | INTEGER | Evaluation order (lower = higher priority) |
| `delivery_priority` | VARCHAR(20) | `normal`/`critical` override |
| `is_exclusive` | BOOLEAN | If true, stops rule processing after match |
| `is_active` | BOOLEAN | Soft-delete flag |
| `created_by` / `updated_by` | VARCHAR | Actor tracking |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

Index: `idx_rules_event_type_active` on `(event_type, is_active, priority)`.

#### `recipient_groups` / `recipient_group_members`
- `recipient_groups`: UUID PK, unique name, description, `is_active`
- `recipient_group_members`: BIGINT identity PK, FK→groups ON DELETE CASCADE, email/phone/deviceToken, `is_active`
- Index: `idx_group_members_group` on `(group_id, is_active)`

#### `customer_channel_preferences`
- BIGINT identity PK, unique `(customer_id, channel)`, `opted_in` boolean
- FILLFACTOR 90, autovacuum tuned
- Index: `idx_cust_prefs_customer_id` on `customer_id`

#### `critical_channel_overrides`
- UUID PK, unique `(event_type, channel)`, `reason`, `is_active`
- Partial index: `idx_overrides_event_type_active` on `event_type WHERE is_active = true`

#### `notifications`
- BIGSERIAL PK, UUID `notification_id` UNIQUE, references event/rule/template, `status` state machine, `dedup_key_hash`, rendered content, correlation/cycle tracking
- FILLFACTOR 80, autovacuum tuned
- Key indexes: `idx_notifications_suppression` (rule_id, dedup_key_hash, created_at DESC INCLUDE status — partial for dedup), `idx_notifications_status`, `idx_notifications_event_id`, `idx_notifications_recipient`, `idx_notifications_created_at`, `idx_notifications_rule_id`

#### `notification_status_log`
- Immutable log of status transitions (from/to status, channel, metadata JSONB)
- Index: `idx_status_log_notification_id` on `(notification_id, created_at ASC)`

#### `notification_recipients`
- Per-notification recipient details (type, contact info, status)
- FILLFACTOR 85, autovacuum tuned
- Index: `idx_recipients_notification_id` on `notification_id`

#### Maintenance Functions
- **`purge_notification_content()`** — PL/pgSQL: nulls rendered content on notifications older than configured retention period

---

## 5. RabbitMQ Integration

### Exchanges

| Exchange | Type | Purpose |
|---|---|---|
| `xch.events.normalized` | Topic | Inbound normalized events from EIS |
| `xch.notifications.deliver` | Topic | Outbound delivery messages to channel router |
| `xch.notifications.status` | Topic | Status updates (published + consumed) |
| `xch.config.events` | Topic | Config change invalidation |
| `xch.notifications.dlq` | Fanout | Dead letter exchange |

### Queues Consumed

| Queue | Exchange | Routing Key | Consumers | Prefetch |
|---|---|---|---|---|
| `q.engine.events.critical` | `xch.events.normalized` | `event.critical.#` | 4 | 5 |
| `q.engine.events.normal` | `xch.events.normalized` | `event.normal.#` | 2 | 10 |
| `q.engine.status.inbound` | `xch.notifications.status` | `notification.status.delivered` / `notification.status.failed` | 2 | 10 |
| `q.config.rule-cache` | `xch.config.events` | `config.rule.changed` | 1 | 1 |
| `q.config.override-cache` | `xch.config.events` | `config.override.changed` | 1 | 1 |

### Published Messages

**To `xch.notifications.deliver`** — routing key: `notification.deliver.{priority}.{channel}`

```typescript
interface DeliverMessage {
  notificationId: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'push';
  priority: 'normal' | 'critical';
  recipientEmail?: string;
  recipientPhone?: string;
  recipientDeviceToken?: string;
  subject?: string;
  body: string;
  attachments?: MediaEntry[];
  correlationId?: string;
  cycleId?: string;
  providerId?: string;
}
```

**To `xch.notifications.status`** — lifecycle events (processing, rendering, delivering, suppressed)

**To `xch.config.events`** — `config.rule.changed`, `config.override.changed` on mutations

---

## 6. REST API

### Rules

| Method | Path | Description |
|---|---|---|
| `POST` | `/rules` | Create notification rule |
| `GET` | `/rules` | List rules (filters: `eventType`, `isActive`, `page`, `limit`) |
| `GET` | `/rules/:id` | Get rule by UUID |
| `PUT` | `/rules/:id` | Update rule (publishes cache invalidation) |
| `DELETE` | `/rules/:id` | Soft-delete rule |

### Notifications

| Method | Path | Description |
|---|---|---|
| `GET` | `/notifications` | List notifications (filters: `status`, `channel`, `eventType`, `ruleId`, `recipientEmail`, `dateFrom`, `dateTo`, `page`, `limit`) |
| `GET` | `/notifications/:id` | Get notification with status log + recipients |
| `GET` | `/notifications/:id/timeline` | Status transition timeline |
| `POST` | `/notifications/send` | Manual send (bypasses rule engine) |

### Recipient Groups

| Method | Path | Description |
|---|---|---|
| `GET` / `POST` | `/recipient-groups` | List / create |
| `GET` / `PUT` / `DELETE` | `/recipient-groups/:id` | Get / update / soft-delete |
| `GET` / `POST` | `/recipient-groups/:id/members` | List / add member |
| `DELETE` | `/recipient-groups/:id/members/:memberId` | Remove member |

### Customer Preferences

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/customer-preferences` | `X-API-Key` | Upsert single preference |
| `POST` | `/customer-preferences/bulk` | `X-API-Key` | Bulk upsert (max 1000) |

### Critical Channel Overrides

| Method | Path | Description |
|---|---|---|
| `GET` / `POST` | `/critical-channel-overrides` | List / create |
| `GET` / `PUT` / `DELETE` | `/critical-channel-overrides/:id` | Get / update / soft-delete |

### Observability

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Enriched: DB/RabbitMQ/templateService latency, queue depths, rule cache status, overall status (healthy/degraded/unhealthy) |
| `GET` | `/metrics` | Prometheus text format |

---

## 7. Service Integrations

| Direction | Service | Protocol | Purpose |
|---|---|---|---|
| Upstream | `event-ingestion-service` (:3151) | AMQP | Produces normalized events |
| Downstream | `template-service` (:3153) | HTTP POST | Template rendering per channel |
| Downstream | `channel-router-service` (:3154) | AMQP | Receive delivery messages |
| Downstream | `audit-service` (:3156) | AMQP | Consumes status events |

---

## 8. Configuration

| Variable | Type | Default | Description |
|---|---|---|---|
| `NODE_ENV` | string | — | Runtime environment |
| `PORT` | number | `3152` | HTTP listen port |
| `DB_HOST` | string | — | PostgreSQL host |
| `DB_PORT` | number | `5433` | PostgreSQL port |
| `DB_NAME` | string | — | PostgreSQL database |
| `DB_SCHEMA` | string | `notification_engine_service` | PostgreSQL schema |
| `DB_USER` | string | — | PostgreSQL user |
| `DB_PASSWORD` | string | — | PostgreSQL password |
| `RABBITMQ_HOST` | string | — | RabbitMQ host |
| `RABBITMQ_PORT` | number | `5672` | RabbitMQ AMQP port |
| `RABBITMQ_MANAGEMENT_URL` | string | — | Management UI URL |
| `RABBITMQ_VHOST` | string | `vhnotificationapi` | Virtual host |
| `RABBITMQ_USER` | string | — | RabbitMQ username |
| `RABBITMQ_PASSWORD` | string | — | RabbitMQ password |
| `TEMPLATE_SERVICE_URL` | string | — | Template service base URL |
| `RULE_CACHE_ENABLED` | boolean | `false` | Enable in-memory rule cache |
| `PREFERENCE_WEBHOOK_API_KEY` | string | — | API key for preference webhook |
| `PREF_CACHE_ENABLED` | boolean | `true` | Enable preference LRU cache |
| `PREF_CACHE_TTL_SECONDS` | number | `300` | Preference cache TTL |
| `PREF_CACHE_MAX_SIZE` | number | `50000` | Preference cache max entries |
| `OVERRIDE_CACHE_ENABLED` | boolean | `true` | Enable override eager cache |
| `TEMPLATE_SERVICE_CB_THRESHOLD` | number | `5` | CB failure threshold |
| `TEMPLATE_SERVICE_CB_RESET_MS` | number | `60000` | CB reset timeout (ms) |
| `RABBITMQ_PREFETCH_CRITICAL` | number | `5` | Prefetch for critical queue |
| `RABBITMQ_PREFETCH_NORMAL` | number | `10` | Prefetch for normal queue |

---

## 9. Error Codes

| Code | HTTP | Details | Message |
|---|---|---|---|
| `NES-001` | 400 | `INVALID_REQUEST_BODY` | The request body is invalid |
| `NES-002` | 404 | `RULE_NOT_FOUND` | The requested notification rule was not found |
| `NES-003` | 404 | `NOTIFICATION_NOT_FOUND` | The requested notification was not found |
| `NES-004` | 404 | `RECIPIENT_GROUP_NOT_FOUND` | The requested recipient group was not found |
| `NES-005` | 404 | `OVERRIDE_NOT_FOUND` | The requested critical channel override was not found |
| `NES-006` | 409 | `DUPLICATE_RULE` | A rule with the same event type and conditions already exists |
| `NES-007` | 500 | `INTERNAL_SERVER_ERROR` | An unexpected error occurred |
| `NES-008` | 500 | `DATABASE_ERROR` | A database operation failed |
| `NES-009` | 422 | `VALIDATION_FAILED` | Validation failed |
| `NES-010` | 404 | `PREFERENCE_NOT_FOUND` | The requested customer channel preference was not found |
| `NES-011` | 409 | `DUPLICATE_OVERRIDE` | A critical channel override for this event type and channel already exists |
| `NES-012` | 400 | `BULK_LIMIT_EXCEEDED` | Bulk upsert exceeds the maximum of 1000 records |
| `NES-013` | 401 | `UNAUTHORIZED_WEBHOOK` | Invalid or missing API key |
| `NES-014` | 409 | `DUPLICATE_RECIPIENT_GROUP` | A recipient group with this name already exists |
| `NES-015` | 422 | `INVALID_STATUS_TRANSITION` | The requested status transition is not allowed |
| `NES-016` | 500 | `RABBITMQ_PUBLISH_FAILED` | Failed to publish message to RabbitMQ |
| `NES-017` | 500 | `CONSUMER_PROCESSING_FAILED` | Consumer event processing failed |
| `NES-018` | 502 | `TEMPLATE_RENDER_FAILED` | Template service render request failed |
| `NES-019` | 404 | `TEMPLATE_NOT_FOUND` | Template not found in template service |
| `NES-020` | 503 | `TEMPLATE_SERVICE_CIRCUIT_OPEN` | Template service circuit breaker is open |

All error responses follow the schema: `{ code, details, message, status }`.

---

## 10. Observability

### Prometheus Metrics (`GET /metrics`)

| Metric | Type | Labels | Description |
|---|---|---|---|
| `nes_events_consumed_total` | Counter | `priority`, `eventType` | Total events consumed from queues |
| `nes_rules_matched_total` | Counter | `eventType`, `ruleId` | Total rules matched during evaluation |
| `nes_notifications_created_total` | Counter | `channel`, `priority` | Total notifications created |
| `nes_notifications_suppressed_total` | Counter | `mode`, `ruleId` | Total notifications suppressed |
| `nes_notifications_dispatched_total` | Counter | `channel`, `priority` | Total notifications dispatched to delivery |
| `nes_notifications_failed_total` | Counter | `channel`, `reason` | Total notifications that failed |
| `nes_template_render_total` | Counter | `channel`, `status` | Total template render attempts |
| `nes_event_processing_duration_seconds` | Histogram | `priority` | Event processing duration (s) |
| `nes_template_render_duration_seconds` | Histogram | `channel` | Template render duration (s) |
| `nes_rule_evaluation_duration_seconds` | Histogram | — | Rule evaluation duration (s) |
| `nes_rule_cache_size` | Gauge | — | Number of event types in rule cache |
| `nes_preference_cache_size` | Gauge | — | Number of entries in preference cache |
| `nes_override_cache_size` | Gauge | — | Number of event types in override cache |
| `nes_template_service_circuit_state` | Gauge | — | CB state (0=closed, 1=open, 2=half-open) |

Default Node.js process metrics are also collected.
