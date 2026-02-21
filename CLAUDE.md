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
- **Notification Providers:** SendGrid (email), Twilio (SMS/WhatsApp), Firebase Cloud Messaging (push)

## Microservices

| Service | Port | Purpose |
|---|---|---|
| notification-gateway | 3150 | BFF / API Gateway (auth, routing, rate limiting) |
| event-ingestion-service | 3151 | Receives and normalizes events from source systems via runtime field mappings; assigns priority tier (normal/critical) per mapping config |
| notification-engine-service | 3152 | Core orchestrator — rules, recipients, lifecycle; priority-aware processing via tiered queues |
| template-service | 3153 | Template CRUD, Handlebars rendering, versioning |
| channel-router-service | 3154 | Routes to delivery providers, retry/circuit breaker; priority-tiered delivery queues per channel |
| admin-service | 3155 | Backoffice administration |
| audit-service | 3156 | Notification tracking, delivery receipts, analytics |
| email-ingest-service | 3157/2525 | SMTP ingest — receives emails, parses, generates events |
| bulk-upload-service | 3158 | XLSX bulk upload — parses spreadsheets, submits events |
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

Each backend service (all except `notification-admin-ui`) contains a `dbscripts/` subfolder with a PostgreSQL schema creation script following the naming convention `schema-{service-name}.sql`. Each script creates the schema, role, user, and grants all necessary privileges (schema-per-service pattern). Schema/role/user names use snake_case derived from the folder name. The `event-ingestion-service` script also creates the `event_mappings` table for runtime field mapping configuration (keyed by `source_id` + `event_type`) with a `priority` column (`normal`/`critical`, default `normal`), the `event_sources` table for registered source system configurations, and the `events` table for storing all ingested events (raw and normalized) with a required `cycle_id` column for business cycle tracking. A `purge_event_payloads()` PL/pgSQL function NULLs out `raw_payload` and `normalized_payload` on rows older than a configurable threshold (default 90 days) for scheduled retention. The `notification-engine-service` script also creates the `customer_channel_preferences` table for per-customer per-channel opt-in/opt-out preferences (keyed by `customer_id`, FILLFACTOR 90, with autovacuum tuning) and the `critical_channel_overrides` table for configurable forced-channel rules per event type (UUID PK, partial index on active overrides).

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

All design docs live in `docs/`. Each document exists in both HTML (styled, with SVG diagrams) and Markdown formats.

```
docs/
  css/styles.css                    # Shared stylesheet (521 lines, all design tokens)
  index.html / index.md             # Documentation hub page
  01-executive-summary.html / .md   # Project overview, problem, solution, scope
  02-detailed-microservices.html / .md  # Service specs, APIs, schemas, RabbitMQ config
  03-system-architecture.html / .md # Architecture diagrams, layers, flows, security
  04-authentication-identity.html / .md  # Auth flows, SAML SSO, JWT sessions, account linking
  05-testing-strategy.html / .md    # Jest, Playwright, Allure reporting, CI/CD gates
  06-changelog.html / .md           # Documentation & feature change log
  07-event-ingestion-service.html / .md  # Event Ingestion Service detailed spec
  08-notification-engine-service.md      # Notification Engine Service detailed spec
```

### HTML docs

- Standalone — no JS, no build step, open directly in browser
- Single shared `css/styles.css` with Confluence-like styling
- Inline SVG diagrams (high-level architecture, layer diagram, event flow, ER diagram, state machine)
- Components: callout boxes, API endpoint blocks, status badges, feature cards, tables

### Markdown docs

- Equivalent content to HTML counterparts
- SVG diagrams replaced with ASCII art
- Callout boxes use blockquote syntax (`> **Info:** ...`)

## Conventions

- Documentation filenames: `NN-kebab-case-name.html` / `.md` (numbered, lowercase)
- CSS color palette primary: #0052CC, text: #172B4D, success: #00875A, warning: #FF991F, error: #FF5630
- All HTML docs include nav bar with active page highlighted; index.html has no nav
- Tables use blue headers (#0052CC bg, white text)
- Every documentation or feature change must include a corresponding entry in `docs/06-changelog.md` (and `docs/06-changelog.html` only when HTML updates are explicitly requested)
- **Only modify `.md` files** when making documentation changes. Do NOT modify `.html` files unless explicitly asked to do so.
