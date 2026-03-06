# Notification Gateway

BFF / API Gateway — authentication, routing, rate limiting, and request proxying to downstream microservices.

## Service Info

| Attribute | Value |
|---|---|
| **Port** | 3150 |
| **Technology** | NestJS (TypeScript) |
| **DB Schema** | `notification_gateway` |
| **DB Role** | `notification_gateway_user_role` |
| **DB User** | `notification_gateway_user` |

## Database Tables

- Schema and role/user setup only (no application tables — session and API key state managed in-memory or via JWT)

## RabbitMQ

No direct RabbitMQ interaction. Pure HTTP/REST BFF.

## Dependencies

- PostgreSQL (session/API key storage)
- All downstream microservices via HTTP proxy

## Related Services

- Proxies to: notification-engine-service (:3152), template-service (:3153), channel-router-service (:3154), admin-service (:3155), audit-service (:3156), email-ingest-service (:3157), bulk-upload-service (:3158)
- Webhook proxy targets: adapter-mailgun (:3171), adapter-braze (:3172), adapter-whatsapp (:3173), adapter-aws-ses (:3174)
- Frontend consumer: notification-admin-ui (:3159)

## Key References

- Design doc (v2): `docs/13-notification-gateway-v2.md`
- Endpoints: `../../endpoints/endpoints-notification-gateway.md`
- DB schema script: `dbscripts/schema-notification-gateway.sql`
- DB objects script: `dbscripts/notification-gateway-dbscripts.sql` — **must be updated on every database change**

## Coding Conventions

- Follow NestJS module structure (module, controller, service, dto, guard, interceptor)
- Use class-validator for DTO validation
- Use Passport.js for authentication (JWT strategy + SAML strategy)
- All proxy routes must pass through authentication and rate-limiting guards
- Log all requests via a global interceptor

## Coding Standards

1. **camelCase for JSON** — Always use camelCase notation for naming JSON object properties in request payloads and response bodies.

2. **Layered Architecture (Controllers → Services → Repositories)** — Strict separation of concerns:
   - **Controllers** — Thin HTTP handlers that only inject services and delegate. Zero business logic.
   - **Services** — All business orchestration lives here. Coordinate between repositories, helpers, and other services.
   - **Repositories** — Sole data access point, whether PostgreSQL (via TypeORM extending a `PgBaseRepository`) or external APIs.

3. **Standardized Error Responses** — All errors follow a consistent JSON schema:
   - Schema: `{ code: string, details: string, message: string, status: number, stack?: string }`
   - Example: `{ "code": "GW-001", "details": "INVALID_BODY", "message": "grant_type is not valid", "status": 400 }`
   - **Error Registry (`errors.ts`)** — Centralized error code definitions with HTTP status, message, and details. Error codes use domain-specific prefixes (e.g., `GW-` for Gateway). No duplicates.
   - **Global Exception Filter** — A single `@Catch(HttpException)` filter maps every thrown exception to the standardized JSON response `{ code, details, message, status }`.

4. **Global Middleware via NestJS Bootstrap (`main.ts`)** — Cross-cutting concerns applied once at the application level:
   - **DtoValidationPipe** — Automatic request body validation via `class-validator` decorators on DTOs.
   - **HttpExceptionFilter** — The centralized error filter described above.
   - **LoggingInterceptor** — Structured HTTP request/response logging (Pino) with service metadata, timing, and severity-based log levels (`warn` for 4xx, `error` for 5xx).

## Planned Folder Structure

```
notification-gateway/
  src/
    main.ts
    app.module.ts
    auth/                    # Authentication module (JWT, SAML, API keys)
    proxy/                   # Proxy module (route definitions, upstream configs)
    guards/                  # Auth guard, rate-limit guard, role guard
    interceptors/            # Logging, timeout, transform interceptors
    config/                  # Configuration module (env, validation)
    health/                  # Health check module
    common/                  # Shared DTOs, interfaces, constants
  test/
  dbscripts/
  docs/
```
