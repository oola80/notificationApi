# Notification API

Unified notification platform for eCommerce — consolidates fragmented notifications from multiple source systems into a single event-driven microservices system. Source systems are onboarded dynamically via runtime mapping configuration (no code changes required).

## Project Status

Auth/RBAC decoupled into standalone services (:3160–3162). `notification-gateway` deprecated. `notification-admin-ui` simplified (no auth, direct microservice communication).

| Service | Status | Tests |
|---|---|---|
| event-ingestion-service | Step 4 complete | 264 unit / 33 suites |
| notification-engine-service | Phase 7 complete | ~504 unit / ~51 suites |
| template-service | Phase 5 complete | 247 unit / 21 suites, 4 E2E files |
| channel-router-service | Phase 4 complete | 432 unit / 46 suites, 5 E2E files |
| provider-adapters/adapter-mailgun | Phase 3 complete | 204 unit / 28 suites, 17 E2E / 3 files |
| bulk-upload-service | Phase 4 complete | 387 unit / 23 suites, 24 E2E / 4 files |
| audit-service | Phase 4 complete | 338 unit / 41 suites, 58 E2E / 8 files |
| admin-service, email-ingest-service, auth-rbac-*, ecommerce-backoffice | Scaffolding only | — |

## Tech Stack (Planned)

- **Backend:** NestJS (TypeScript) microservices
- **Frontend:** Next.js (Admin backoffice)
- **Message Broker:** RabbitMQ (AMQP, topic exchanges, dead-letter queues)
- **Database:** PostgreSQL (schema-per-service pattern, single database with separate schemas)
- **Containerization:** Docker / Docker Compose
- **Notification Providers:** Mailgun (email), Braze (email/SMS/WhatsApp/push — unified multi-channel, dumb pipe pattern), WhatsApp (Meta Cloud API — native WhatsApp), AWS SES (email)

## Microservices

| Service | Port | Purpose |
|---|---|---|
| notification-gateway | 3150 | **Deprecated** — BFF / API Gateway (auth, routing, rate limiting). Responsibilities redistributed: auth → auth-rbac-service-backend, RBAC → per-service JWT validation, rate limiting → infrastructure proxy, proxying → direct frontend-to-backend. |
| event-ingestion-service | 3151 | Receives and normalizes events from source systems via runtime field mappings; assigns priority tier (normal/critical) per mapping config |
| notification-engine-service | 3152 | Core orchestrator — rules, recipients, lifecycle; priority-aware processing via tiered queues |
| template-service | 3153 | Template CRUD, Handlebars rendering, versioning |
| channel-router-service | 3154 | Routes to delivery providers via decoupled provider adapter microservices (Mailgun, Braze, WhatsApp/Meta, AWS SES); core orchestration (circuit breaker, rate limiting, retry, fallback, media processing); all providers are dumb pipes (pre-rendered content); priority-tiered delivery queues per channel; fire-and-forget audit logging. V2 design docs reflect the decoupled adapter architecture. |
| admin-service | 3155 | Backoffice administration — configuration management (rules, mappings, channels, templates, recipients, system config). JWT validation via auth-rbac-service-backend RS256 public key. |
| audit-service | 3156 | Notification tracking, delivery receipts, analytics |
| email-ingest-service | 3157/2525 | SMTP ingest — receives emails, parses, generates events |
| bulk-upload-service | 3158 | XLSX bulk upload — async file processing, result file with per-row status, fire-and-forget audit logging |
| notification-admin-ui | 3159 | Next.js admin frontend — connects directly to admin-service (:3155) |
| auth-rbac-service-backend | 3160 | Multi-application authentication, user management, RBAC, JWT issuance (RS256 platform + app-scoped tokens) |
| auth-rbac-service-frontend | 3161 | Next.js admin UI for auth/RBAC management (applications, users, roles, permissions) |
| ecommerce-backoffice | 3162 | Next.js login portal and application launcher — centralized entry point for all platform applications |

### Service Folders

Each microservice has its own folder at the project root. **See each service's `CLAUDE.md` for detailed folder structure, DB tables, RabbitMQ topology, dependencies, and implementation notes.**

Every service folder contains at minimum: `CLAUDE.md`, `dbscripts/` (backend only), `docs/` (convenience copy of design doc + `changelog_dev.md`). Implemented NestJS services additionally follow this standard layout:

```
{service-name}/
  .env / .gitignore / .prettierrc / eslint.config.mjs
  nest-cli.json / package.json / tsconfig.json / tsconfig.build.json
  src/
    main.ts              # Bootstrap: Pino logger, global pipes/filters/interceptors, CORS
    app.module.ts        # Root module wiring
    common/              # @Global() module: errors, filters, pipes, interceptors, base repo
    config/              # ConfigModule.forRoot: app, database, rabbitmq configs, env validation
    metrics/             # @Global() MetricsModule: custom Prometheus metrics, GET /metrics
    health/              # Health controller (liveness + readiness)
    rabbitmq/            # @golevelup/nestjs-rabbitmq wrapper (exchanges, publisher, constants)
    consumers/           # RabbitMQ consumer handlers
    {feature-modules}/   # Domain-specific modules (CRUD, business logic)
  test/                  # E2E tests + jest-e2e.json
  dbscripts/             # schema-*.sql + *-dbscripts.sql
  docs/                  # Design doc copy + changelog_dev.md
```

**Exceptions:** `notification-admin-ui` is Next.js (no dbscripts). `provider-adapters/` is a NestJS monorepo (4 apps in `apps/` + shared `libs/common/`). `notification-gateway` is deprecated. Scaffolding-only services have only `CLAUDE.md`, `dbscripts/`, and `docs/`.

### Endpoint Reference

The root `endpoints/` folder contains `endpoints-{service}.md` files (one per service) documenting all planned REST API endpoints or frontend routes. Each endpoint row has a **Status** column: `Not Started`, `In Progress`, `Done`, or `Deprecated`.

### Database Scripts

Each backend service contains a `dbscripts/` subfolder with two SQL files:
- **`schema-{service-name}.sql`** — Schema creation script (schema, role, user, grants). Run once per environment.
- **`{service-name}-dbscripts.sql`** — Database object definitions (tables, indexes, functions, triggers, views, etc.). **Must be updated every time a database change is made to the service.** Single source of truth for the service's database structure.

Naming convention (snake_case from folder name): schema `{name}`, role `{name}_user_role`, user `{name}_user`. See each service's `CLAUDE.md` and `dbscripts/` for table details.

### RabbitMQ Definitions

The `rabbitmq/` folder contains `definitions.json` — an importable RabbitMQ topology file (vhost `vhnotificationapi`, 6 exchanges, 23 queues, 24 bindings). Import via RabbitMQ Management UI, `rabbitmqadmin`, or `management.load_definitions` config. The topology is documented in `docs/12-rabbitmq-topology.md`.

## Documentation

All design docs (authoritative versions) live in `docs/` as numbered Markdown files (`NN-kebab-case-name.md`). See `docs/index.md` for the full listing. Each microservice has a convenience copy in its own `docs/` subfolder — see [Per-Service Documentation](#per-service-documentation) below. Docs use ASCII art diagrams and blockquote callout boxes (`> **Info:** ...`).

## Coding Standards

All NestJS backend services follow these standards (documented in each service's `CLAUDE.md`):

1. **camelCase for JSON** — Always use camelCase notation for naming JSON object properties in request payloads and response bodies.

2. **Layered Architecture (Controllers → Services → Repositories)** — Strict separation of concerns:
   - **Controllers** — Thin HTTP handlers that only inject services and delegate. Zero business logic.
   - **Services** — All business orchestration lives here. Coordinate between repositories, helpers, and other services.
   - **Repositories** — Sole data access point, whether PostgreSQL (via TypeORM extending a `PgBaseRepository`) or external APIs.

3. **Standardized Error Responses** — All errors follow a consistent JSON schema:
   - Schema: `{ code: string, details: string, message: string, status: number, stack?: string }`
   - **Error Registry (`errors.ts`)** — Centralized error code definitions with HTTP status, message, and details. Error codes use domain-specific prefixes per service (e.g., `GW-` for Gateway, `EIS-` for Event Ingestion, `NES-` for Notification Engine, `TS-` for Template, `CRS-` for Channel Router, `ADM-` for Admin, `AUD-` for Audit, `EMI-` for Email Ingest, `BUS-` for Bulk Upload, `ARS-` for Auth RBAC Service, `ECB-` for eCommerce Backoffice). No duplicates.
   - **Global Exception Filter** — A single `@Catch(HttpException)` filter maps every thrown exception to the standardized JSON response `{ code, details, message, status }`.

4. **Global Middleware via NestJS Bootstrap (`main.ts`)** — Cross-cutting concerns applied once at the application level:
   - **DtoValidationPipe** — Automatic request body validation via `class-validator` decorators on DTOs.
   - **HttpExceptionFilter** — The centralized error filter described above.
   - **LoggingInterceptor** — Structured HTTP request/response logging (Pino) with service metadata, timing, and severity-based log levels (`warn` for 4xx, `error` for 5xx).

The **notification-admin-ui** (Next.js frontend) follows standard #1 (camelCase for JSON) only.

## Coding Process Conventions

### Per-Service Documentation

- Each microservice folder **must** have its own `docs/` subfolder containing:
  - A **convenience copy** of the service's design doc from root `docs/`. The copy includes a header note: _"This is a convenience copy. The authoritative version is at `../../docs/{filename}`."_ If the authoritative doc is updated, the copy should be refreshed.
  - A `changelog_dev.md` tracking **code changes only** (not design changes).
- Each microservice folder **must** have its own `CLAUDE.md` with service-specific context (port, tech, DB schema/tables, RabbitMQ exchanges/queues, dependencies, folder structure, coding conventions).

### Changelog Separation

- **`docs/06-changelog.md`** (root) — tracks **design and documentation changes only**. Do not add code implementation entries here.
- **`{service}/docs/changelog_dev.md`** — tracks **code changes only** for that specific service. All code commits, bug fixes, refactors, and feature implementations are logged here.
- A change is a "design change" only if it modifies the design docs in root `docs/`. This must be explicitly stated when making the entry.

### Endpoint Reference

- The root `endpoints/` folder contains `endpoints-{service}.md` files documenting all planned REST API endpoints (or pages/routes for the frontend).
- Each endpoint row has a **Status** column: `Not Started`, `In Progress`, `Done`, or `Deprecated`.
- When implementing or modifying an endpoint, **update the corresponding endpoint file** to reflect the current status.

## Conventions

- Documentation filenames: `NN-kebab-case-name.md` (numbered, lowercase)
- Every **design or documentation** change must include a corresponding entry in `docs/06-changelog.md`
- Every **code** change must include a corresponding entry in the service's `docs/changelog_dev.md`
- Endpoint files in `endpoints/` must be kept in sync with implementation status
- Every **database change** must be reflected in the service's `dbscripts/{service-name}-dbscripts.sql` file
