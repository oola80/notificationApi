# Notification Engine Service

Core orchestrator — rules evaluation, recipient resolution, template rendering dispatch, notification lifecycle management; priority-aware processing via tiered queues.

## Service Info

| Attribute | Value |
|---|---|
| **Port** | 3152 |
| **Technology** | NestJS (TypeScript) |
| **DB Schema** | `notification_engine_service` |
| **DB Role** | `notification_engine_service_user_role` |
| **DB User** | `notification_engine_service_user` |

## Database Tables

- `customer_channel_preferences` — per-customer per-channel opt-in/opt-out preferences (FILLFACTOR 90, autovacuum tuning)
- `critical_channel_overrides` — forced-channel rules per event type (UUID PK, partial index on active overrides)
- Additional tables defined in the design doc: notification rules, notifications, notification_status_log, recipient_groups, etc.

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

- Follow NestJS module structure
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
   - Example: `{ "code": "NES-001", "details": "RULE_NOT_FOUND", "message": "notification rule not found", "status": 404 }`
   - **Error Registry (`errors.ts`)** — Centralized error code definitions with HTTP status, message, and details. Error codes use domain-specific prefixes (e.g., `NES-` for Notification Engine Service). No duplicates.
   - **Global Exception Filter** — A single `@Catch(HttpException)` filter maps every thrown exception to the standardized JSON response `{ code, details, message, status }`.

4. **Global Middleware via NestJS Bootstrap (`main.ts`)** — Cross-cutting concerns applied once at the application level:
   - **DtoValidationPipe** — Automatic request body validation via `class-validator` decorators on DTOs.
   - **HttpExceptionFilter** — The centralized error filter described above.
   - **LoggingInterceptor** — Structured HTTP request/response logging (Pino) with service metadata, timing, and severity-based log levels (`warn` for 4xx, `error` for 5xx).

## Planned Folder Structure

```
notification-engine-service/
  src/
    main.ts
    app.module.ts
    rules/                   # Rule evaluation module (CRUD, engine, cache)
    notifications/           # Notification lifecycle module (create, status, query)
    recipients/              # Recipient resolution module (groups, preferences)
    consumers/               # RabbitMQ consumer handlers
    overrides/               # Critical channel overrides module
    config/                  # Configuration module
    health/                  # Health check module
    common/                  # Shared DTOs, interfaces, constants
  test/
  dbscripts/
  docs/
```
