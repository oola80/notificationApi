# Audit Service

Notification tracking, delivery receipts, analytics, DLQ monitoring — immutable event sourcing model for complete notification lifecycle audit trail.

## Service Info

| Attribute | Value |
|---|---|
| **Port** | 3156 |
| **Technology** | NestJS (TypeScript) |
| **DB Schema** | `audit_service` |
| **DB Role** | `audit_service_user_role` |
| **DB User** | `audit_service_user` |

## Database Tables

- `audit_events` — immutable notification lifecycle event logging (UUID PK, notification_id, correlation_id, cycle_id, event type taxonomy, actor, metadata JSONB, payload snapshot JSONB, tsvector search vector)
- `delivery_receipts` — provider-reported delivery outcomes correlated via provider_message_id
- `notification_analytics` — pre-aggregated hourly/daily rollups with idempotent upsert
- `dlq_entries` — dead-letter queue monitoring with status tracking (pending/investigated/reprocessed/discarded)
- `purge_audit_payloads()` — PL/pgSQL function to NULL payload data older than 90 days

## RabbitMQ

**Publishes to:** None (pure consumer/sink)

**Consumes from:**
- `audit.events` — bound to `xch.events.normalized` via `event.#` (all normalized events)
- `audit.deliver` — bound to `xch.notifications.deliver` via `notification.deliver.#` (all dispatch messages)
- `q.status.updates` — bound to `xch.notifications.status` via `notification.status.#` (all delivery status updates)
- `q.audit.template` — bound to `xch.notifications.status` via `template.#` (template lifecycle events)
- `audit.dlq` — bound to `xch.notifications.dlq` (fanout — dead-lettered messages)

## Dependencies

- PostgreSQL, RabbitMQ

## Related Services

- Upstream: all services publish events that audit-service consumes
- Queried by: admin-service (:3155), notification-gateway (:3150) for audit logs and traces

## Key References

- Design doc (v2): `docs/16-audit-service-v2.md` (convenience copy) — authoritative at `../../docs/16-audit-service-v2.md`
- Design doc (v1): `../../docs/16-audit-service.md` (original design)
- Endpoints: `../../endpoints/endpoints-audit-service.md`
- DB schema script: `dbscripts/schema-audit-service.sql`
- DB objects script: `dbscripts/audit-service-dbscripts.sql` — **must be updated on every database change**

## Coding Conventions

- Follow NestJS module structure
- All audit events are append-only / immutable — never update or delete
- Consumer handlers must be idempotent (use notification_id + event_type for deduplication)
- Analytics aggregation uses idempotent upsert pattern
- Full-text search via PostgreSQL tsvector/tsquery

## Coding Standards

1. **camelCase for JSON** — Always use camelCase notation for naming JSON object properties in request payloads and response bodies.

2. **Layered Architecture (Controllers → Services → Repositories)** — Strict separation of concerns:
   - **Controllers** — Thin HTTP handlers that only inject services and delegate. Zero business logic.
   - **Services** — All business orchestration lives here. Coordinate between repositories, helpers, and other services.
   - **Repositories** — Sole data access point, whether PostgreSQL (via TypeORM extending a `PgBaseRepository`) or external APIs.

3. **Standardized Error Responses** — All errors follow a consistent JSON schema:
   - Schema: `{ code: string, details: string, message: string, status: number, stack?: string }`
   - Example: `{ "code": "AUD-001", "details": "INVALID_QUERY", "message": "date range exceeds maximum of 90 days", "status": 400 }`
   - **Error Registry (`errors.ts`)** — Centralized error code definitions with HTTP status, message, and details. Error codes use domain-specific prefixes (e.g., `AUD-` for Audit Service). No duplicates.
   - **Global Exception Filter** — A single `@Catch(HttpException)` filter maps every thrown exception to the standardized JSON response `{ code, details, message, status }`.

4. **Global Middleware via NestJS Bootstrap (`main.ts`)** — Cross-cutting concerns applied once at the application level:
   - **DtoValidationPipe** — Automatic request body validation via `class-validator` decorators on DTOs.
   - **HttpExceptionFilter** — The centralized error filter described above.
   - **LoggingInterceptor** — Structured HTTP request/response logging (Pino) with service metadata, timing, and severity-based log levels (`warn` for 4xx, `error` for 5xx).

## Planned Folder Structure

```
audit-service/
  src/
    main.ts
    app.module.ts
    events/                  # Audit event ingestion and query module
    trace/                   # Notification trace reconstruction module
    receipts/                # Delivery receipt module
    analytics/               # Analytics aggregation and query module
    dlq/                     # DLQ monitoring and reprocessing module
    consumers/               # RabbitMQ consumer handlers (5 queues)
    search/                  # Full-text search module
    config/                  # Configuration module
    health/                  # Health check module
    common/                  # Shared DTOs, interfaces, constants
  test/
  dbscripts/
  docs/
```
