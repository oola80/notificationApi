# Auth RBAC Service Backend

Multi-application authentication, user management, RBAC, and JWT issuance — centralized auth platform for all eCommerce applications.

## Service Info

| Attribute | Value |
|---|---|
| **Port** | 3160 |
| **Technology** | NestJS (TypeScript) |
| **DB Schema** | `auth_rbac_service_backend` |
| **DB Role** | `auth_rbac_service_backend_user_role` |
| **DB User** | `auth_rbac_service_backend_user` |

## Database Tables

- `applications` — registered applications (UUID PK, name UNIQUE, code UNIQUE, frontend_url, is_active)
- `users` — user accounts (UUID PK, email UNIQUE, password_hash bcrypt, full_name, status, failed_login_attempts, locked_until)
- `roles` — roles per application (UUID PK, application_id FK, name, level, is_system, UNIQUE(app_id, name))
- `permissions` — permissions per application (UUID PK, application_id FK, resource, action, UNIQUE(app_id, resource, action))
- `role_permissions` — role-to-permission mapping (PK(role_id, permission_id))
- `user_applications` — user access to applications (UUID PK, user_id FK, application_id FK, UNIQUE(user_id, app_id))
- `user_application_roles` — role assignments within user-app access (UUID PK, user_application_id FK, role_id FK)
- `refresh_tokens` — token tracking with rotation and replay detection (UUID PK, user_id FK, token_hash, expires_at, is_revoked, replaced_by_id)
- `password_history` — password reuse prevention (UUID PK, user_id FK, password_hash)
- `purge_expired_refresh_tokens()` — PL/pgSQL function to remove expired/revoked tokens older than 30 days

## RabbitMQ

**No RabbitMQ dependency** — pure HTTP REST service.

## Dependencies

- PostgreSQL

## Related Services

- Frontend consumers: auth-rbac-service-frontend (:3161), ecommerce-backoffice (:3162)
- Downstream services validate JWTs using `GET /auth/public-key` (JWKS): admin-service (:3155)

## Key References

- Design doc: `docs/19-auth-rbac-service-backend.md` (convenience copy) — authoritative at `../../docs/19-auth-rbac-service-backend.md`
- Endpoints: `../../endpoints/endpoints-auth-rbac-service-backend.md`
- DB schema script: `dbscripts/schema-auth-rbac-service-backend.sql`
- DB objects script: `dbscripts/auth-rbac-service-backend-dbscripts.sql` — **must be updated on every database change**

## Coding Conventions

- Follow NestJS module structure (module, controller, service, dto)
- Use class-validator for DTO validation
- Password hashing with bcrypt (cost 12)
- JWT signing with RS256 (asymmetric key pair)
- Refresh token rotation with replay detection
- Timing-safe comparison for all token/password checks

## Coding Standards

1. **camelCase for JSON** — Always use camelCase notation for naming JSON object properties in request payloads and response bodies.

2. **Layered Architecture (Controllers → Services → Repositories)** — Strict separation of concerns:
   - **Controllers** — Thin HTTP handlers that only inject services and delegate. Zero business logic.
   - **Services** — All business orchestration lives here. Coordinate between repositories, helpers, and other services.
   - **Repositories** — Sole data access point, whether PostgreSQL (via TypeORM extending a `PgBaseRepository`) or external APIs.

3. **Standardized Error Responses** — All errors follow a consistent JSON schema:
   - Schema: `{ code: string, details: string, message: string, status: number, stack?: string }`
   - Example: `{ "code": "ARS-001", "details": "INVALID_CREDENTIALS", "message": "email or password is incorrect", "status": 401 }`
   - **Error Registry (`errors.ts`)** — Centralized error code definitions with HTTP status, message, and details. Error codes use domain-specific prefixes (e.g., `ARS-` for Auth RBAC Service). No duplicates.
   - **Global Exception Filter** — A single `@Catch(HttpException)` filter maps every thrown exception to the standardized JSON response `{ code, details, message, status }`.

4. **Global Middleware via NestJS Bootstrap (`main.ts`)** — Cross-cutting concerns applied once at the application level:
   - **DtoValidationPipe** — Automatic request body validation via `class-validator` decorators on DTOs.
   - **HttpExceptionFilter** — The centralized error filter described above.
   - **LoggingInterceptor** — Structured HTTP request/response logging (Pino) with service metadata, timing, and severity-based log levels (`warn` for 4xx, `error` for 5xx).

## Planned Folder Structure

```
auth-rbac-service-backend/
  src/
    main.ts
    app.module.ts
    auth/                    # Authentication module (login, refresh, logout, password reset/change, /me, app-token, public-key)
    applications/            # Application CRUD module
    users/                   # User management module
    roles/                   # Role CRUD module (per application)
    permissions/             # Permission CRUD module (per application)
    user-access/             # User-application assignment and role assignment module
    crypto/                  # RS256 key management, JWT signing/verification
    config/                  # Configuration module
    health/                  # Health check module
    metrics/                 # Prometheus metrics module
    common/                  # Shared DTOs, interfaces, constants
  test/
  dbscripts/
  docs/
```
