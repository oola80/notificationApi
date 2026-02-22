# Template Service

Template CRUD, Handlebars rendering, versioning, and channel-specific content management.

## Service Info

| Attribute | Value |
|---|---|
| **Port** | 3153 |
| **Technology** | NestJS (TypeScript) + Handlebars |
| **DB Schema** | `template_service` |
| **DB Role** | `template_service_user_role` |
| **DB User** | `template_service_user` |

## Database Tables

- `templates` — master template records (UUID PK, unique slug, current version pointer)
- `template_versions` — immutable version snapshots (FK to templates, unique version number per template)
- `template_channels` — channel-specific content per version (FK to template_versions, unique channel per version, Handlebars body)
- `template_variables` — auto-detected template variables (FK to templates, unique variable name per template, optional defaults and required flag)

## RabbitMQ

**Publishes to:**
- `xch.notifications.status` — template lifecycle and render audit events (template.created, template.updated, template.deleted, template.rolledback, render.completed, render.failed)

**Consumes from:** None (publish-only, fire-and-forget audit logging)

## Dependencies

- PostgreSQL, RabbitMQ

## Related Services

- Called by: notification-engine-service (:3152) for rendering, admin-service (:3155) for template management
- Proxied through: notification-gateway (:3150)

## Key References

- Design doc: `docs/10-template-service.md` (convenience copy) — authoritative at `../../docs/10-template-service.md`
- Endpoints: `../../endpoints/endpoints-template-service.md`
- DB schema script: `dbscripts/schema-template-service.sql`
- DB objects script: `dbscripts/template-service-dbscripts.sql` — **must be updated on every database change**

## Coding Conventions

- Follow NestJS module structure
- Use Handlebars for template rendering (no other engines)
- Template versions are immutable — updates create new versions
- Auto-detect variables from Handlebars expressions on save
- Cache compiled templates for performance

## Coding Standards

1. **camelCase for JSON** — Always use camelCase notation for naming JSON object properties in request payloads and response bodies.

2. **Layered Architecture (Controllers → Services → Repositories)** — Strict separation of concerns:
   - **Controllers** — Thin HTTP handlers that only inject services and delegate. Zero business logic.
   - **Services** — All business orchestration lives here. Coordinate between repositories, helpers, and other services.
   - **Repositories** — Sole data access point, whether PostgreSQL (via TypeORM extending a `PgBaseRepository`) or external APIs.

3. **Standardized Error Responses** — All errors follow a consistent JSON schema:
   - Schema: `{ code: string, details: string, message: string, status: number, stack?: string }`
   - Example: `{ "code": "TS-001", "details": "TEMPLATE_NOT_FOUND", "message": "template slug not found", "status": 404 }`
   - **Error Registry (`errors.ts`)** — Centralized error code definitions with HTTP status, message, and details. Error codes use domain-specific prefixes (e.g., `TS-` for Template Service). No duplicates.
   - **Global Exception Filter** — A single `@Catch(HttpException)` filter maps every thrown exception to the standardized JSON response `{ code, details, message, status }`.

4. **Global Middleware via NestJS Bootstrap (`main.ts`)** — Cross-cutting concerns applied once at the application level:
   - **DtoValidationPipe** — Automatic request body validation via `class-validator` decorators on DTOs.
   - **HttpExceptionFilter** — The centralized error filter described above.
   - **LoggingInterceptor** — Structured HTTP request/response logging (Pino) with service metadata, timing, and severity-based log levels (`warn` for 4xx, `error` for 5xx).

## Planned Folder Structure

```
template-service/
  src/
    main.ts
    app.module.ts
    templates/               # Template CRUD module
    versions/                # Version management module
    rendering/               # Handlebars rendering module (compile, render, cache)
    variables/               # Variable detection and management
    config/                  # Configuration module
    health/                  # Health check module
    common/                  # Shared DTOs, interfaces, constants
  test/
  dbscripts/
  docs/
```
