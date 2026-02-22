# Event Ingestion Service

Receives and normalizes events from source systems via runtime field mappings; assigns priority tier (normal/critical) per mapping config.

## Service Info

| Attribute | Value |
|---|---|
| **Port** | 3151 |
| **Technology** | NestJS (TypeScript) |
| **DB Schema** | `event_ingestion_service` |
| **DB Role** | `event_ingestion_service_user_role` |
| **DB User** | `event_ingestion_service_user` |

## Database Tables

- `event_sources` — registered source system configurations
- `event_mappings` — runtime field mapping configuration (keyed by source_id + event_type, priority column: normal/critical)
- `events` — all ingested events (raw and normalized payloads, cycle_id for business cycle tracking)
- `purge_event_payloads()` — PL/pgSQL function to NULL payloads older than 90 days

## RabbitMQ

**Publishes to:**
- `xch.events.incoming` — routing key `source.webhook.{eventType}` (incoming webhook events)
- `xch.events.normalized` — routing key `event.critical.{eventType}` or `event.normal.{eventType}` (normalized canonical events)

**Consumes from:**
- `q.events.amqp` — bound to `xch.events.incoming` via `source.*.#` (3 consumers, prefetch 10)
- `q.events.webhook` — bound to `xch.events.incoming` via `source.webhook.#` (2 consumers, prefetch 10)
- `q.events.email-ingest` — bound to `xch.events.incoming` via `source.email-ingest.#` (2 consumers, prefetch 10)
- `q.config.mapping-cache` — bound to `xch.config.events` via `config.mapping.changed` (1 consumer, prefetch 1)

## Dependencies

- PostgreSQL, RabbitMQ

## Related Services

- Upstream: external source systems, email-ingest-service (:3157), bulk-upload-service (:3158 via HTTP)
- Downstream: notification-engine-service (:3152) consumes normalized events
- Config: admin-service (:3155) manages event mappings

## Key References

- Design doc: `docs/07-event-ingestion-service.md` (convenience copy) — authoritative at `../../docs/07-event-ingestion-service.md`
- Endpoints: `../../endpoints/endpoints-event-ingestion-service.md`
- DB schema script: `dbscripts/schema-event-ingestion-service.sql`
- DB objects script: `dbscripts/event-ingestion-service-dbscripts.sql` — **must be updated on every database change**

## Coding Conventions

- Follow NestJS module structure (module, controller, service, dto)
- Use class-validator for DTO validation
- Normalize events using runtime mapping configuration (no hardcoded field mappings)
- All consumer handlers must be idempotent
- Use transactions for event persistence + RabbitMQ publish

## Coding Standards

1. **camelCase for JSON** — Always use camelCase notation for naming JSON object properties in request payloads and response bodies.

2. **Layered Architecture (Controllers → Services → Repositories)** — Strict separation of concerns:
   - **Controllers** — Thin HTTP handlers that only inject services and delegate. Zero business logic.
   - **Services** — All business orchestration lives here. Coordinate between repositories, helpers, and other services.
   - **Repositories** — Sole data access point, whether PostgreSQL (via TypeORM extending a `PgBaseRepository`) or external APIs.

3. **Standardized Error Responses** — All errors follow a consistent JSON schema:
   - Schema: `{ code: string, details: string, message: string, status: number, stack?: string }`
   - Example: `{ "code": "EIS-001", "details": "INVALID_BODY", "message": "source_id is required", "status": 400 }`
   - **Error Registry (`errors.ts`)** — Centralized error code definitions with HTTP status, message, and details. Error codes use domain-specific prefixes (e.g., `EIS-` for Event Ingestion Service). No duplicates.
   - **Global Exception Filter** — A single `@Catch(HttpException)` filter maps every thrown exception to the standardized JSON response `{ code, details, message, status }`.

4. **Global Middleware via NestJS Bootstrap (`main.ts`)** — Cross-cutting concerns applied once at the application level:
   - **DtoValidationPipe** — Automatic request body validation via `class-validator` decorators on DTOs.
   - **HttpExceptionFilter** — The centralized error filter described above.
   - **LoggingInterceptor** — Structured HTTP request/response logging (Pino) with service metadata, timing, and severity-based log levels (`warn` for 4xx, `error` for 5xx).

## Planned Folder Structure

```
event-ingestion-service/
  src/
    main.ts
    app.module.ts
    webhook/                 # Webhook ingestion module (controller, validation)
    normalization/           # Event normalization module (mapping engine)
    events/                  # Event persistence and query module
    consumers/               # RabbitMQ consumer handlers
    config/                  # Configuration module
    health/                  # Health check module
    common/                  # Shared DTOs, interfaces, constants
  test/
  dbscripts/
  docs/
```
