# Template Service — Technical Reference v1

## 1. Overview

| Attribute | Value |
|---|---|
| **Port** | 3153 |
| **Technology** | NestJS 11, TypeScript 5.7, Node.js (ES2023) |
| **DB Schema** | `template_service` |
| **Status** | Phase 5 complete |
| **Unit Tests** | 247 across 21 suites |
| **E2E Tests** | 4 files |

Manages notification templates with immutable versioning. Provides Handlebars rendering with 8 custom helpers, LRU compiled-template caching, channel-specific content, auto-detected variables, and HTML sanitization for email output. Publish-only integration with RabbitMQ for audit event logging.

---

## 2. Architecture

### Module Structure (`app.module.ts`)

| Module | Responsibility |
|---|---|
| `AppConfigModule` | `ConfigModule.forRoot` with env validation |
| `LoggerModule` | Pino structured logging |
| `TypeOrmModule` | PostgreSQL (`template_service` schema) |
| `CommonModule` | `@Global()` — errors, filters, pipes, interceptors, base repo |
| `MetricsModule` | `@Global()` — 10 Prometheus metrics, `GET /metrics` |
| `AppRabbitMQModule` | Publish-only RabbitMQ connection (1 exchange) |
| `HealthModule` | `GET /health` with DB + RabbitMQ + cache checks |
| `TemplatesModule` | Template CRUD, versioning, rollback |
| `RenderingModule` | Handlebars render engine, cache, preview |

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

### 3.1 Template CRUD & Versioning

**`TemplatesService`** (`src/templates/services/templates.service.ts`):

- **Create** — creates `template` + `template_version` (v1) + `template_channels` entries. `VariableDetectorService` auto-detects Handlebars variables from channel bodies via AST walk. Variables upserted to `template_variables`.
- **Update** — creates a new immutable `template_version` (v2, v3, …); `templates.current_version_id` is updated to point to the new version. Previous versions remain accessible.
- **Rollback** — swaps `templates.current_version_id` to point to a specified older version number. Error `TS-011` if target version equals current or does not exist.
- **Soft-delete** — sets `templates.is_active = false`.
- **List** — paginated with filters: `search` (name/slug), `isActive`, `channel` (EXISTS subquery on `template_channels`), `sortBy`, `sortOrder`.

**`VariableDetectorService`** (`src/templates/services/variable-detector.service.ts`):

- Parses Handlebars AST to extract `{{variableName}}` expressions
- Excludes registered custom helpers from variable list
- Detected variables are persisted to `template_variables` (upsert, preserving defaults/required flags)

### 3.2 Rendering Engine

**`RenderingService`** (`src/rendering/services/rendering.service.ts`) — 7-step render pipeline:

1. **Template lookup** — load template by ID, check `is_active` (throws `TS-004`)
2. **Version resolution** — use `versionNumber` param or `current_version_id`
3. **Channel lookup** — find `template_channel` for requested channel
4. **Variable validation** — check all `required` variables present in `data`; throw `TS-006` if missing
5. **Cache lookup** — `TemplateCacheService`: key `{templateId}:{versionId}:{channel}`; compile if miss
6. **Render** — Handlebars `template(data)` with timeout checkpoint
7. **Post-process** — SMS length warnings (>160 chars logged, >1600 throws), WhatsApp limit check (>4096), Push limit check (>256), email HTML sanitization

**Timeout**: `RENDER_TIMEOUT_MS` (default 5000ms) checked at two checkpoints during compilation and render. Throws `TS-012` on timeout.

**Preview**: `POST /templates/:id/preview` renders all channels simultaneously and returns a map of `channel → renderedOutput`.

### 3.3 Template Cache

**`TemplateCacheService`** (`src/rendering/services/template-cache.service.ts`):

- LRU in-memory cache of compiled Handlebars template functions
- Cache key: `{templateId}:{versionId}:{channel}`
- Max size: `TEMPLATE_CACHE_MAX_SIZE` (default 1000)
- Eviction: LRU (least recently used) when capacity exceeded
- Warm-up on `OnModuleInit` — loads all active templates at startup
- Metrics: cache hit/miss counters, eviction counter, size gauge

### 3.4 Handlebars Helpers

8 custom helpers registered globally (`src/rendering/helpers/handlebars-helpers.ts`):

| Helper | Description |
|---|---|
| `formatCurrency` | Format number as currency string |
| `formatDate` | Format date with Dayjs |
| `formatNumber` | Format number with locale options |
| `truncate` | Truncate string to max length |
| `capitalize` | Capitalize first letter |
| `uppercase` | Convert to uppercase |
| `lowercase` | Convert to lowercase |
| `ifEquals` | Block helper for equality check |

### 3.5 HTML Sanitization

**`HtmlSanitizer`** (`src/rendering/sanitizers/html-sanitizer.ts`) — applied to email channel output only:

- Strips `<script>`, `<iframe>`, `<object>`, `<embed>` tags (and their content)
- Removes `on*` event handler attributes (e.g., `onclick`, `onload`)
- Removes `javascript:` URI schemes from `href`/`src` attributes
- Removes CSS `expression(...)` from `style` attributes

### 3.6 Audit Publishing

**`AuditPublisherService`** (`src/rabbitmq/audit-publisher.service.ts`) — fire-and-forget publish to `xch.notifications.status`:

| Method | Routing Key | Event |
|---|---|---|
| `publishTemplateCreated` | `template.created` | Template creation |
| `publishTemplateUpdated` | `template.updated` | Template update (new version) |
| `publishTemplateDeleted` | `template.deleted` | Template soft-delete |
| `publishTemplateRolledback` | `template.rolledback` | Rollback to version |
| `publishRenderCompleted` | `render.completed` | Successful render |
| `publishRenderFailed` | `render.failed` | Render failure |

All publish calls are fire-and-forget; failures are logged but do not affect the HTTP response.

---

## 4. Data Model

### Tables (schema: `template_service`)

#### `templates`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `slug` | VARCHAR(255) UNIQUE | URL-friendly identifier |
| `name` | VARCHAR(255) | Human-readable name |
| `description` | TEXT | |
| `current_version_id` | UUID FK | → `template_versions` (nullable on create) |
| `is_active` | BOOLEAN | Soft-delete flag |
| `created_by` / `updated_by` | VARCHAR | |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

#### `template_versions`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `template_id` | UUID FK | → `templates` ON DELETE CASCADE |
| `version_number` | INTEGER | Unique per template, auto-incremented |
| `change_summary` | TEXT | Required on updates |
| `created_by` | VARCHAR | |
| `created_at` | TIMESTAMPTZ | |

Unique constraint: `(template_id, version_number)`.

#### `template_channels`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `version_id` | UUID FK | → `template_versions` ON DELETE CASCADE |
| `channel` | VARCHAR(20) | `email`, `sms`, `whatsapp`, `push` |
| `subject` | TEXT | Email subject line (optional) |
| `body` | TEXT | Handlebars template body |
| `metadata` | JSONB | Channel-specific options |
| `created_at` | TIMESTAMPTZ | |

Unique constraint: `(version_id, channel)`.

#### `template_variables`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `template_id` | UUID FK | → `templates` ON DELETE CASCADE |
| `variable_name` | VARCHAR(255) | Auto-detected from Handlebars expressions |
| `default_value` | TEXT | Optional default |
| `is_required` | BOOLEAN | Enforced at render time |
| `created_at` | TIMESTAMPTZ | |

Unique constraint: `(template_id, variable_name)`.

---

## 5. RabbitMQ Integration

**Publish-only service** — no consumers.

### Exchange

| Exchange | Type | Purpose |
|---|---|---|
| `xch.notifications.status` | Topic | Audit event publishing |

### Routing Keys Published

| Routing Key | Event |
|---|---|
| `template.created` | Template created |
| `template.updated` | Template version created |
| `template.deleted` | Template soft-deleted |
| `template.rolledback` | Template rolled back to version |
| `render.completed` | Render request succeeded |
| `render.failed` | Render request failed |

---

## 6. REST API

### Templates

| Method | Path | Description |
|---|---|---|
| `POST` | `/templates` | Create template with channel variants |
| `GET` | `/templates` | List (filters: `channel`, `isActive`, `search`, `sortBy`, `sortOrder`, `page`, `limit`) |
| `GET` | `/templates/:id` | Get full template with versions, channels, variables |
| `PUT` | `/templates/:id` | Update template (creates new version, requires `changeSummary`) |
| `DELETE` | `/templates/:id` | Soft-delete template |
| `POST` | `/templates/:id/render` | Render for specific channel with variable data |
| `POST` | `/templates/:id/preview` | Preview all channels with sample data |
| `POST` | `/templates/:id/rollback` | Rollback to a previous version number |

**`POST /templates/:id/render` request:**
```json
{
  "channel": "email",
  "data": { "customerName": "Alice", "orderId": "12345" },
  "versionNumber": 2
}
```

**`POST /templates/:id/render` response:**
```json
{
  "templateId": "uuid",
  "versionId": "uuid",
  "channel": "email",
  "subject": "Order delay for Alice",
  "body": "<html>...</html>",
  "renderDurationMs": 12
}
```

### Observability

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | DB + RabbitMQ + cache status |
| `GET` | `/metrics` | Prometheus metrics (text/plain) |

---

## 7. Service Integrations

| Direction | Service | Protocol | Purpose |
|---|---|---|---|
| Upstream (caller) | `notification-engine-service` (:3152) | HTTP POST | Template rendering via `/templates/:id/render` |
| Upstream (caller) | `admin-service` (:3155) | HTTP | Template CRUD management |
| Downstream | `audit-service` (:3156) | AMQP | Consumes template lifecycle audit events |

---

## 8. Configuration

| Variable | Type | Default | Description |
|---|---|---|---|
| `NODE_ENV` | string | — | Runtime environment |
| `PORT` | number | `3153` | HTTP listen port |
| `DB_HOST` | string | — | PostgreSQL host |
| `DB_PORT` | number | `5433` | PostgreSQL port |
| `DB_NAME` | string | — | PostgreSQL database |
| `DB_SCHEMA` | string | `template_service` | PostgreSQL schema |
| `DB_USER` | string | — | PostgreSQL user |
| `DB_PASSWORD` | string | — | PostgreSQL password |
| `RABBITMQ_HOST` | string | — | RabbitMQ host |
| `RABBITMQ_PORT` | number | `5672` | RabbitMQ AMQP port |
| `RABBITMQ_MANAGEMENT_URL` | string | — | Management UI URL |
| `RABBITMQ_VHOST` | string | `vhnotificationapi` | Virtual host |
| `RABBITMQ_USER` | string | — | RabbitMQ username |
| `RABBITMQ_PASSWORD` | string | — | RabbitMQ password |
| `TEMPLATE_CACHE_MAX_SIZE` | number | `1000` | Max compiled template cache entries |
| `SMS_WARN_LENGTH` | number | `160` | SMS body warning threshold (chars) |
| `SMS_MAX_LENGTH` | number | `1600` | SMS body max length (chars) |
| `WHATSAPP_MAX_LENGTH` | number | `4096` | WhatsApp body max length (chars) |
| `PUSH_MAX_LENGTH` | number | `256` | Push notification max length (chars) |
| `RENDER_TIMEOUT_MS` | number | `5000` | Max render duration (ms) |

---

## 9. Error Codes

| Code | HTTP | Details | Message |
|---|---|---|---|
| `TS-001` | 400 | `INVALID_REQUEST_BODY` | The request body is invalid |
| `TS-002` | 409 | `DUPLICATE_SLUG` | A template with this slug already exists |
| `TS-003` | 422 | `VALIDATION_FAILED` | Validation failed |
| `TS-004` | 422 | `TEMPLATE_INACTIVE` | The template is inactive |
| `TS-005` | 500 | `RENDER_ERROR` | Template rendering failed |
| `TS-006` | 422 | `VARIABLE_MISSING` | Required template variable is missing |
| `TS-007` | 500 | `INTERNAL_SERVER_ERROR` | An unexpected error occurred |
| `TS-008` | 500 | `DATABASE_ERROR` | A database operation failed |
| `TS-009` | 404 | `TEMPLATE_NOT_FOUND` | The requested template was not found |
| `TS-010` | 404 | `VERSION_NOT_FOUND` | The requested template version was not found |
| `TS-011` | 400 | `INVALID_ROLLBACK_VERSION` | Cannot rollback to the specified version |
| `TS-012` | 504 | `RENDER_TIMEOUT` | Template rendering timed out |

All error responses follow the schema: `{ code, details, message, status }`.

---

## 10. Observability

### Prometheus Metrics (`GET /metrics`)

The service exposes 10 custom `ts_` prefixed metrics plus Node.js default process metrics:

| Metric | Type | Description |
|---|---|---|
| `ts_templates_crud_total` | Counter | Total template CRUD operations |
| `ts_template_versions_created_total` | Counter | Total template versions created |
| `ts_audit_publish_failures_total` | Counter | Total RabbitMQ audit publish failures |
| `ts_cache_evictions_total` | Counter | Total LRU cache evictions |
| `ts_render_requests_total` | Counter | Total render requests |
| `ts_render_errors_total` | Counter | Total render errors |
| `ts_render_duration_seconds` | Histogram | Render duration distribution |
| `ts_cache_hit_ratio` | Gauge | Cache hit ratio (0–1) |
| `ts_cache_size` | Gauge | Current cache entry count |
| `ts_db_pool_active` | Gauge | Active DB pool connections |

Default Node.js process metrics are also collected via `collectDefaultMetrics`.
