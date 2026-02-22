# Admin Service

Backoffice administration — aggregates management operations across downstream services; user management, rule management, event mapping CRUD, channel configuration, recipient groups, system settings, SAML IdP management.

## Service Info

| Attribute | Value |
|---|---|
| **Port** | 3155 |
| **Technology** | NestJS (TypeScript) |
| **DB Schema** | `admin_service` |
| **DB Role** | `admin_service_user_role` |
| **DB User** | `admin_service_user` |

## Database Tables

- Defined in the design doc: admin users, system configurations, SAML IdP settings

## RabbitMQ

**Publishes to:**
- `xch.config.events` — configuration change invalidation (config.mapping.changed, config.rule.changed)

**Consumes from:** None (publish-only)

## Dependencies

- PostgreSQL, RabbitMQ
- Downstream services via HTTP: event-ingestion-service (:3151), notification-engine-service (:3152), template-service (:3153), channel-router-service (:3154), audit-service (:3156)

## Related Services

- Proxied through: notification-gateway (:3150)
- Frontend consumer: notification-admin-ui (:3159)
- Publishes config changes consumed by: event-ingestion-service, notification-engine-service

## Key References

- Design doc: `docs/14-admin-service.md` (convenience copy) — authoritative at `../../docs/14-admin-service.md`
- Endpoints: `../../endpoints/endpoints-admin-service.md`
- DB schema script: `dbscripts/schema-admin-service.sql`
- DB objects script: `dbscripts/admin-service-dbscripts.sql` — **must be updated on every database change**

## Coding Conventions

- Follow NestJS module structure
- Cross-service calls use HTTP with circuit breaker
- Validate operations across services before persisting (e.g., validate template exists before creating a rule)
- Publish RabbitMQ config change events after successful writes
- Role-based access: Viewer, Operator, Admin, Super Admin

## Coding Standards

1. **camelCase for JSON** — Always use camelCase notation for naming JSON object properties in request payloads and response bodies.

2. **Layered Architecture (Controllers → Services → Repositories)** — Strict separation of concerns:
   - **Controllers** — Thin HTTP handlers that only inject services and delegate. Zero business logic.
   - **Services** — All business orchestration lives here. Coordinate between repositories, helpers, and other services.
   - **Repositories** — Sole data access point, whether PostgreSQL (via TypeORM extending a `PgBaseRepository`) or external APIs.

3. **Standardized Error Responses** — All errors follow a consistent JSON schema:
   - Schema: `{ code: string, details: string, message: string, status: number, stack?: string }`
   - Example: `{ "code": "ADM-001", "details": "FORBIDDEN", "message": "insufficient permissions for this operation", "status": 403 }`
   - **Error Registry (`errors.ts`)** — Centralized error code definitions with HTTP status, message, and details. Error codes use domain-specific prefixes (e.g., `ADM-` for Admin Service). No duplicates.
   - **Global Exception Filter** — A single `@Catch(HttpException)` filter maps every thrown exception to the standardized JSON response `{ code, details, message, status }`.

4. **Global Middleware via NestJS Bootstrap (`main.ts`)** — Cross-cutting concerns applied once at the application level:
   - **DtoValidationPipe** — Automatic request body validation via `class-validator` decorators on DTOs.
   - **HttpExceptionFilter** — The centralized error filter described above.
   - **LoggingInterceptor** — Structured HTTP request/response logging (Pino) with service metadata, timing, and severity-based log levels (`warn` for 4xx, `error` for 5xx).

## Planned Folder Structure

```
admin-service/
  src/
    main.ts
    app.module.ts
    users/                   # User management module
    rules/                   # Rule management module (proxied to engine)
    event-mappings/          # Event mapping CRUD module
    templates/               # Template management (proxied to template-service)
    channels/                # Channel configuration module
    recipient-groups/        # Recipient group management module
    dashboard/               # Dashboard aggregation module
    system-config/           # System configuration module
    saml/                    # SAML IdP management module
    audit-logs/              # Audit log proxy module
    config/                  # Configuration module
    health/                  # Health check module
    common/                  # Shared DTOs, interfaces, constants
  test/
  dbscripts/
  docs/
```
