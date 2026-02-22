# Notification API

Unified notification platform for eCommerce — consolidates fragmented notifications from multiple source systems into a single event-driven microservices system. Source systems are onboarded dynamically via runtime mapping configuration (no code changes required).

## Project Status

Design documentation phase. Service folders and database scripts scaffolded — no application code yet.

## Tech Stack (Planned)

- **Backend:** NestJS (TypeScript) microservices
- **Frontend:** Next.js (Admin backoffice)
- **Message Broker:** RabbitMQ (AMQP, topic exchanges, dead-letter queues)
- **Database:** PostgreSQL (schema-per-service pattern, single database with separate schemas)
- **Containerization:** Docker / Docker Compose
- **Notification Providers:** SendGrid (email), Mailgun (email), Braze (email/SMS/WhatsApp/push — unified multi-channel, dumb pipe pattern), Twilio (SMS/WhatsApp), Firebase Cloud Messaging (push)

## Microservices

| Service | Port | Purpose |
|---|---|---|
| notification-gateway | 3150 | BFF / API Gateway (auth, routing, rate limiting) |
| event-ingestion-service | 3151 | Receives and normalizes events from source systems via runtime field mappings; assigns priority tier (normal/critical) per mapping config |
| notification-engine-service | 3152 | Core orchestrator — rules, recipients, lifecycle; priority-aware processing via tiered queues |
| template-service | 3153 | Template CRUD, Handlebars rendering, versioning |
| channel-router-service | 3154 | Routes to delivery providers (SendGrid, Mailgun, Braze, Twilio, FCM) via provider strategy pattern; all providers are dumb pipes (pre-rendered content); retry/circuit breaker; priority-tiered delivery queues per channel; fire-and-forget audit logging |
| admin-service | 3155 | Backoffice administration |
| audit-service | 3156 | Notification tracking, delivery receipts, analytics |
| email-ingest-service | 3157/2525 | SMTP ingest — receives emails, parses, generates events |
| bulk-upload-service | 3158 | XLSX bulk upload — async file processing, result file with per-row status, fire-and-forget audit logging |
| notification-admin-ui | 3159 | Next.js admin frontend |

### Service Folders

Each microservice has its own folder at the project root. Each folder contains a `CLAUDE.md` with service-specific context, a `dbscripts/` subfolder (backend services only), and a `docs/` subfolder with a convenience copy of the design doc and a development changelog.

```
notification-gateway/           # NestJS — port 3150
  CLAUDE.md                     # Service-specific context for AI assistants
  dbscripts/                    # PostgreSQL database scripts
    schema-notification-gateway.sql       # Schema/role/user creation (run once)
    notification-gateway-dbscripts.sql    # Database objects (tables, indexes, functions, etc.)
  docs/                         # Service-level documentation
    13-notification-gateway.md  # Convenience copy of design doc
    changelog_dev.md            # Code-only development changelog

event-ingestion-service/        # NestJS — port 3151
  CLAUDE.md
  dbscripts/
  docs/
    07-event-ingestion-service.md
    changelog_dev.md

notification-engine-service/    # NestJS — port 3152
  CLAUDE.md
  dbscripts/
  docs/
    08-notification-engine-service.md
    changelog_dev.md

template-service/               # NestJS — port 3153
  CLAUDE.md
  dbscripts/
  docs/
    10-template-service.md
    changelog_dev.md

channel-router-service/         # NestJS — port 3154
  CLAUDE.md
  dbscripts/
  docs/
    11-channel-router-service.md
    changelog_dev.md

admin-service/                  # NestJS — port 3155
  CLAUDE.md
  dbscripts/
  docs/
    14-admin-service.md
    changelog_dev.md

audit-service/                  # NestJS — port 3156
  CLAUDE.md
  dbscripts/
  docs/
    16-audit-service.md
    changelog_dev.md

email-ingest-service/           # NestJS — port 3157/2525
  CLAUDE.md
  dbscripts/
  docs/
    email-ingest-service-spec.md
    changelog_dev.md

bulk-upload-service/            # NestJS — port 3158
  CLAUDE.md
  dbscripts/
  docs/
    09-bulk-upload-service.md
    changelog_dev.md

notification-admin-ui/          # Next.js — port 3159
  CLAUDE.md
  docs/
    15-notification-admin-ui.md
    changelog_dev.md
```

### Endpoint Reference

The root `endpoints/` folder contains one file per service documenting all planned REST API endpoints (or pages/routes for the frontend). Each endpoint has a status column tracking implementation progress.

```
endpoints/
  endpoints-notification-gateway.md
  endpoints-event-ingestion-service.md
  endpoints-notification-engine-service.md
  endpoints-template-service.md
  endpoints-channel-router-service.md
  endpoints-admin-service.md
  endpoints-audit-service.md
  endpoints-email-ingest-service.md
  endpoints-bulk-upload-service.md
  endpoints-notification-admin-ui.md
```

### Database Scripts

Each backend service (all except `notification-admin-ui`) contains a `dbscripts/` subfolder with two SQL files:
- **`schema-{service-name}.sql`** — Schema creation script (schema, role, user, grants). Run once per environment.
- **`{service-name}-dbscripts.sql`** — Database object definitions (tables, indexes, functions, triggers, views, etc.). **Must be updated every time a database change is made to the service.** This is the single source of truth for the service's database structure.

The schema creation script follows the naming convention `schema-{service-name}.sql`. Each script creates the schema, role, user, and grants all necessary privileges (schema-per-service pattern). Schema/role/user names use snake_case derived from the folder name. The `event-ingestion-service` script also creates the `event_mappings` table for runtime field mapping configuration (keyed by `source_id` + `event_type`) with a `priority` column (`normal`/`critical`, default `normal`), the `event_sources` table for registered source system configurations, and the `events` table for storing all ingested events (raw and normalized) with a required `cycle_id` column for business cycle tracking. A `purge_event_payloads()` PL/pgSQL function NULLs out `raw_payload` and `normalized_payload` on rows older than a configurable threshold (default 90 days) for scheduled retention. The `notification-engine-service` script also creates the `customer_channel_preferences` table for per-customer per-channel opt-in/opt-out preferences (keyed by `customer_id`, FILLFACTOR 90, with autovacuum tuning) and the `critical_channel_overrides` table for configurable forced-channel rules per event type (UUID PK, partial index on active overrides). The `bulk-upload-service` script also creates the `uploads` table for tracking XLSX file uploads (UUID PK, status state machine, aggregate row counters, `total_events` for group mode event count, result file path), the `upload_rows` table for per-row processing tracking (FK to uploads with ON DELETE CASCADE, raw data, mapped payload, event ID, status, `group_key` for multi-item row grouping with partial index), and a `purge_old_uploads()` PL/pgSQL function that deletes terminal-state uploads and cascading rows older than a configurable threshold (default 90 days). The `audit-service` script also creates the `audit_events` table for immutable notification lifecycle event logging (UUID PK, notification_id, correlation_id, cycle_id, event type taxonomy, actor, metadata JSONB, payload snapshot JSONB, tsvector search vector), the `delivery_receipts` table for provider-reported delivery outcomes correlated via provider_message_id, the `notification_analytics` table for pre-aggregated hourly/daily rollups with idempotent upsert, the `dlq_entries` table for dead-letter queue monitoring with status tracking (pending/investigated/reprocessed/discarded), and a `purge_audit_payloads()` PL/pgSQL function that NULLs payload data older than a configurable threshold (default 90 days). The `template-service` script also creates the `templates` table for master template records (UUID PK, unique slug, current version pointer), the `template_versions` table for immutable version snapshots (FK to templates, unique version number per template), the `template_channels` table for channel-specific content per version (FK to template_versions, unique channel per version, Handlebars body), and the `template_variables` table for auto-detected template variables (FK to templates, unique variable name per template, optional defaults and required flag).

| Service Folder | Schema | Role | User |
|---|---|---|---|
| notification-gateway | `notification_gateway` | `notification_gateway_user_role` | `notification_gateway_user` |
| event-ingestion-service | `event_ingestion_service` | `event_ingestion_service_user_role` | `event_ingestion_service_user` |
| notification-engine-service | `notification_engine_service` | `notification_engine_service_user_role` | `notification_engine_service_user` |
| template-service | `template_service` | `template_service_user_role` | `template_service_user` |
| channel-router-service | `channel_router_service` | `channel_router_service_user_role` | `channel_router_service_user` |
| admin-service | `admin_service` | `admin_service_user_role` | `admin_service_user` |
| audit-service | `audit_service` | `audit_service_user_role` | `audit_service_user` |
| email-ingest-service | `email_ingest_service` | `email_ingest_service_user_role` | `email_ingest_service_user` |
| bulk-upload-service | `bulk_upload_service` | `bulk_upload_service_user_role` | `bulk_upload_service_user` |

### RabbitMQ Definitions

The `rabbitmq/` folder contains `definitions.json` — an importable RabbitMQ topology file (vhost `vhnotificationapi`, 6 exchanges, 23 queues, 24 bindings). Import via RabbitMQ Management UI, `rabbitmqadmin`, or `management.load_definitions` config. The topology is documented in `docs/12-rabbitmq-topology.md`.

## Documentation

All design docs (authoritative versions) live in `docs/` as Markdown files. Each microservice also has a convenience copy in its own `docs/` subfolder — see [Coding Process Conventions](#coding-process-conventions) below.

```
docs/
  css/styles.css                    # Legacy shared stylesheet (unused — HTML docs removed)
  index.md                          # Documentation hub page
  01-executive-summary.md           # Project overview, problem, solution, scope
  02-detailed-microservices.md      # Service specs, APIs, schemas, RabbitMQ config
  03-system-architecture.md         # Architecture diagrams, layers, flows, security
  04-authentication-identity.md     # Auth flows, SAML SSO, JWT sessions, account linking
  05-testing-strategy.md            # Jest, Playwright, Allure reporting, CI/CD gates
  06-changelog.md                   # Documentation & feature change log
  07-event-ingestion-service.md     # Event Ingestion Service detailed spec
  08-notification-engine-service.md # Notification Engine Service detailed spec
  09-bulk-upload-service.md         # Bulk Upload Service detailed spec
  10-template-service.md            # Template Service detailed spec
  11-channel-router-service.md      # Channel Router Service detailed spec
  12-rabbitmq-topology.md           # RabbitMQ topology — exchanges, queues, bindings reference
  13-notification-gateway.md        # Notification Gateway (BFF) detailed spec
  14-admin-service.md               # Admin Service (Backoffice Administration) detailed spec
  15-notification-admin-ui.md       # Notification Admin UI (Next.js Frontend) detailed spec
  16-audit-service.md               # Audit Service detailed spec
```

### Markdown docs

- ASCII art diagrams
- Callout boxes use blockquote syntax (`> **Info:** ...`)

## Coding Standards

All NestJS backend services follow these standards (documented in each service's `CLAUDE.md`):

1. **camelCase for JSON** — Always use camelCase notation for naming JSON object properties in request payloads and response bodies.

2. **Layered Architecture (Controllers → Services → Repositories)** — Strict separation of concerns:
   - **Controllers** — Thin HTTP handlers that only inject services and delegate. Zero business logic.
   - **Services** — All business orchestration lives here. Coordinate between repositories, helpers, and other services.
   - **Repositories** — Sole data access point, whether PostgreSQL (via TypeORM extending a `PgBaseRepository`) or external APIs.

3. **Standardized Error Responses** — All errors follow a consistent JSON schema:
   - Schema: `{ code: string, details: string, message: string, status: number, stack?: string }`
   - **Error Registry (`errors.ts`)** — Centralized error code definitions with HTTP status, message, and details. Error codes use domain-specific prefixes per service (e.g., `GW-` for Gateway, `EIS-` for Event Ingestion, `NES-` for Notification Engine, `TS-` for Template, `CRS-` for Channel Router, `ADM-` for Admin, `AUD-` for Audit, `EMI-` for Email Ingest, `BUS-` for Bulk Upload). No duplicates.
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
