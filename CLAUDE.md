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

Each microservice has its own folder at the project root.

```
notification-gateway/           # NestJS — port 3150
event-ingestion-service/        # NestJS — port 3151
notification-engine-service/    # NestJS — port 3152
template-service/               # NestJS — port 3153
channel-router-service/         # NestJS — port 3154
admin-service/                  # NestJS — port 3155
audit-service/                  # NestJS — port 3156
email-ingest-service/           # NestJS — port 3157/2525
bulk-upload-service/            # NestJS — port 3158
notification-admin-ui/          # Next.js — port 3159
```

### Database Scripts

Each backend service (all except `notification-admin-ui`) contains a `dbscripts/` subfolder with a PostgreSQL schema creation script following the naming convention `schema-{service-name}.sql`. Each script creates the schema, role, user, and grants all necessary privileges (schema-per-service pattern). Schema/role/user names use snake_case derived from the folder name. The `event-ingestion-service` script also creates the `event_mappings` table for runtime field mapping configuration (keyed by `source_id` + `event_type`) with a `priority` column (`normal`/`critical`, default `normal`), the `event_sources` table for registered source system configurations, and the `events` table for storing all ingested events (raw and normalized) with a required `cycle_id` column for business cycle tracking. A `purge_event_payloads()` PL/pgSQL function NULLs out `raw_payload` and `normalized_payload` on rows older than a configurable threshold (default 90 days) for scheduled retention. The `notification-engine-service` script also creates the `customer_channel_preferences` table for per-customer per-channel opt-in/opt-out preferences (keyed by `customer_id`, FILLFACTOR 90, with autovacuum tuning) and the `critical_channel_overrides` table for configurable forced-channel rules per event type (UUID PK, partial index on active overrides). The `bulk-upload-service` script also creates the `uploads` table for tracking XLSX file uploads (UUID PK, status state machine, aggregate row counters, `total_events` for group mode event count, result file path), the `upload_rows` table for per-row processing tracking (FK to uploads with ON DELETE CASCADE, raw data, mapped payload, event ID, status, `group_key` for multi-item row grouping with partial index), and a `purge_old_uploads()` PL/pgSQL function that deletes terminal-state uploads and cascading rows older than a configurable threshold (default 90 days). The `template-service` script also creates the `templates` table for master template records (UUID PK, unique slug, current version pointer), the `template_versions` table for immutable version snapshots (FK to templates, unique version number per template), the `template_channels` table for channel-specific content per version (FK to template_versions, unique channel per version, Handlebars body), and the `template_variables` table for auto-detected template variables (FK to templates, unique variable name per template, optional defaults and required flag).

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

## Documentation

All design docs live in `docs/` as Markdown files.

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
```

### Markdown docs

- ASCII art diagrams
- Callout boxes use blockquote syntax (`> **Info:** ...`)

## Conventions

- Documentation filenames: `NN-kebab-case-name.md` (numbered, lowercase)
- Every documentation or feature change must include a corresponding entry in `docs/06-changelog.md`
