# Bulk Upload Service

XLSX bulk upload — async file processing, per-row event submission to Event Ingestion Service, result file with per-row status, fire-and-forget audit logging.

## Service Info

| Attribute | Value |
|---|---|
| **Port** | 3158 |
| **Technology** | NestJS (TypeScript) + exceljs |
| **DB Schema** | `bulk_upload_service` |
| **DB Role** | `bulk_upload_service_user_role` |
| **DB User** | `bulk_upload_service_user` |

## Database Tables

- `uploads` — tracking XLSX file uploads (UUID PK, status state machine, aggregate row counters, total_events for group mode, result file path)
- `upload_rows` — per-row processing tracking (FK to uploads with ON DELETE CASCADE, raw data, mapped payload, event ID, status, group_key with partial index)
- `purge_old_uploads()` — PL/pgSQL function to delete terminal-state uploads older than 90 days

## RabbitMQ

No direct RabbitMQ interaction. Submits events to Event Ingestion Service via HTTP.

## Dependencies

- PostgreSQL
- event-ingestion-service (:3151) via HTTP for event submission

## Related Services

- Downstream: event-ingestion-service (:3151) receives events via HTTP POST
- Proxied through: notification-gateway (:3150)
- Managed by: admin-service (:3155) via gateway

## Key References

- Design doc: `docs/09-bulk-upload-service.md` (convenience copy) — authoritative at `../../docs/09-bulk-upload-service.md`
- Endpoints: `../../endpoints/endpoints-bulk-upload-service.md`
- DB schema script: `dbscripts/schema-bulk-upload-service.sql`
- DB objects script: `dbscripts/bulk-upload-service-dbscripts.sql` — **must be updated on every database change**

## Coding Conventions

- Follow NestJS module structure
- Use exceljs for XLSX parsing and result file generation
- File size limit: 10 MB, row limit: 5,000 rows
- Processing is asynchronous — upload endpoint returns immediately, background worker processes rows
- Each row is submitted individually to Event Ingestion Service via HTTP
- Result file contains all original columns plus `_notification_status` column

## Coding Standards

1. **camelCase for JSON** — Always use camelCase notation for naming JSON object properties in request payloads and response bodies.

2. **Layered Architecture (Controllers → Services → Repositories)** — Strict separation of concerns:
   - **Controllers** — Thin HTTP handlers that only inject services and delegate. Zero business logic.
   - **Services** — All business orchestration lives here. Coordinate between repositories, helpers, and other services.
   - **Repositories** — Sole data access point, whether PostgreSQL (via TypeORM extending a `PgBaseRepository`) or external APIs.

3. **Standardized Error Responses** — All errors follow a consistent JSON schema:
   - Schema: `{ code: string, details: string, message: string, status: number, stack?: string }`
   - Example: `{ "code": "BUS-001", "details": "FILE_TOO_LARGE", "message": "file exceeds 10 MB limit", "status": 400 }`
   - **Error Registry (`errors.ts`)** — Centralized error code definitions with HTTP status, message, and details. Error codes use domain-specific prefixes (e.g., `BUS-` for Bulk Upload Service). No duplicates.
   - **Global Exception Filter** — A single `@Catch(HttpException)` filter maps every thrown exception to the standardized JSON response `{ code, details, message, status }`.

4. **Global Middleware via NestJS Bootstrap (`main.ts`)** — Cross-cutting concerns applied once at the application level:
   - **DtoValidationPipe** — Automatic request body validation via `class-validator` decorators on DTOs.
   - **HttpExceptionFilter** — The centralized error filter described above.
   - **LoggingInterceptor** — Structured HTTP request/response logging (Pino) with service metadata, timing, and severity-based log levels (`warn` for 4xx, `error` for 5xx).

## Planned Folder Structure

```
bulk-upload-service/
  src/
    main.ts
    app.module.ts
    uploads/                 # Upload CRUD and status module
    processing/              # Background processing worker module
    parsing/                 # XLSX parsing module (exceljs)
    results/                 # Result file generation module
    config/                  # Configuration module
    health/                  # Health check module
    common/                  # Shared DTOs, interfaces, constants
  test/
  dbscripts/
  docs/
```
