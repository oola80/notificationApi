# Notification API

Unified notification platform for eCommerce — consolidates fragmented notifications from multiple source systems into a single event-driven microservices system. Source systems are onboarded dynamically via runtime mapping configuration (no code changes required).

## Project Status

Design documentation phase. Service folders and database scripts scaffolded. **Auth/RBAC decoupled** — authentication, user management, and RBAC extracted into standalone `auth-rbac-service-backend` (:3160) with `auth-rbac-service-frontend` (:3161) and `ecommerce-backoffice` (:3162) login portal; `notification-gateway` (:3150) deprecated and removed; `admin-service` simplified (user/SAML management removed, JWT validation guard added); `notification-admin-ui` connects directly to `admin-service`. **event-ingestion-service** Step 4 complete (foundation, data layer, event-mappings CRUD, normalization module, webhook pipeline, RabbitMQ integration with consumers, publisher, retry/DLQ, health checks, mapping cache, rate limiting, Prometheus metrics, structured logging; 264 unit tests across 33 suites). **notification-engine-service** Phase 7 complete (rules engine, recipient groups, customer preferences, critical overrides, notification lifecycle, suppression engine, RabbitMQ consumers/publishers, template client with circuit breaker, Prometheus metrics, structured logging, performance optimizations, DB maintenance; ~504 unit tests across ~51 suites). **template-service** Phase 5 complete (foundation, template CRUD & versioning, rendering engine with caching & preview, RabbitMQ audit publishing, rollback endpoint, enhanced health checks, E2E tests, Prometheus metrics, channel query filter, HTML sanitization, render timeout; 247 unit tests across 21 suites, 4 E2E test files). **channel-router-service** Phase 4 complete (foundation, data layer, health checks, Prometheus metrics, structured logging, channel & provider CRUD, adapter HTTP client, provider cache, circuit breaker per provider, token bucket rate limiter, retry engine with exponential backoff, media processor per channel, RabbitMQ integration with 3 exchanges and 8 priority-tiered queues, 8 consumers with abstract base class, 7-step delivery pipeline orchestrator, fire-and-forget audit publishing, single-level fallback, adapter health monitoring with CB integration; 432 unit tests across 46 suites, 5 E2E test files). **provider-adapters/adapter-mailgun** Phase 3 complete (monorepo foundation, shared library with DTOs/errors/metrics/RabbitMQ/health, Mailgun HTTP client, send pipeline with attachments and error classification, webhook verification with HMAC-SHA256 and replay protection, event normalization, fire-and-forget RabbitMQ publishing; 204 unit tests across 28 suites, 17 E2E tests across 3 files). **bulk-upload-service** Phase 4 complete (foundation, data layer, TypeORM entities, upload CRUD with 8-step XLSX validation pipeline, XLSX parsing with type coercion, event ingestion HTTP client, background processing worker with 9-step pipeline and configurable batch/concurrency, result XLSX generation with _notification_status column and cell styling, result download endpoint, group mode processing with composite key grouping and conflict detection, in-memory circuit breaker with CLOSED/OPEN/HALF_OPEN state machine, token bucket rate limiter, retry endpoint for failed/partial uploads, RabbitMQ fire-and-forget audit publishing with 6 lifecycle events, enhanced health checks with liveness/readiness split and 3 custom indicators, Prometheus metrics, E2E tests; 387 unit tests across 23 suites, 24 E2E tests across 4 files). All other services have folder structure only (CLAUDE.md, dbscripts/, docs/) with no application code.

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

Each microservice has its own folder at the project root. Each folder contains a `CLAUDE.md` with service-specific context, a `dbscripts/` subfolder (backend services only), and a `docs/` subfolder with a convenience copy of the design doc and a development changelog.

```
notification-gateway/           # NestJS — port 3150
  CLAUDE.md                     # Service-specific context for AI assistants
  dbscripts/                    # PostgreSQL database scripts
    schema-notification-gateway.sql       # Schema/role/user creation (run once)
    notification-gateway-dbscripts.sql    # Database objects (tables, indexes, functions, etc.)
  docs/                         # Service-level documentation
    13-notification-gateway-v2.md  # Convenience copy of design doc (v2)
    changelog_dev.md            # Code-only development changelog

event-ingestion-service/        # NestJS — port 3151 (Step 4 complete)
  CLAUDE.md
  .env                          # Local environment variables (git-ignored)
  .gitignore                    # Node/NestJS ignores (dist, node_modules, .env, coverage, etc.)
  .prettierrc                   # Prettier config (singleQuote, trailingComma: all)
  eslint.config.mjs             # ESLint flat config (typescript-eslint + prettier)
  nest-cli.json                 # NestJS CLI config (sourceRoot: src, deleteOutDir)
  package.json                  # NestJS 11, TypeScript 5.7, Jest 30
  package-lock.json
  tsconfig.json                 # ES2023 target, nodenext modules, decorators enabled
  tsconfig.build.json
  src/
    main.ts                     # Bootstrap: Pino logger, global pipes/filters/interceptors, CORS, port 3151
    app.module.ts               # Root module: Config, Logger, TypeORM, Common, all feature modules, Health
    common/                     # @Global() module: errors, filters, pipes, interceptors, base repo, utils
    config/                     # ConfigModule.forRoot: app, database, rabbitmq configs, env validation
    normalization/               # MappingEngine, EventTypeResolver, PayloadValidator, 13 transforms
    event-mappings/             # CRUD + test-mapping endpoint (controller, service, repository, DTOs, entity)
    event-sources/              # Source system config (repository, entity)
    events/                     # Event persistence + query (controller, service, repository, DTOs, entity)
    rabbitmq/                   # @golevelup/nestjs-rabbitmq wrapper (exchanges, publisher, constants)
    consumers/                  # 3 consumer handlers (AMQP, webhook, email-ingest) + shared processing pipeline
    webhook/                    # Webhook endpoint (controller, service, DTOs, guards, auth, deduplication)
    health/                     # Terminus health checks (DB + RabbitMQ Management API)
  test/
    app.e2e-spec.ts             # E2E test for GET /health
    jest-e2e.json               # Jest E2E config
  dbscripts/
    schema-event-ingestion-service.sql
    event-ingestion-service-dbscripts.sql
  docs/
    07-event-ingestion-service.md
    changelog_dev.md

notification-engine-service/    # NestJS — port 3152 (Phase 7 complete)
  CLAUDE.md
  .env                          # Local environment variables (git-ignored)
  .gitignore                    # Node/NestJS ignores (dist, node_modules, .env, coverage, etc.)
  .prettierrc                   # Prettier config (singleQuote, trailingComma: all)
  eslint.config.mjs             # ESLint flat config (typescript-eslint + prettier)
  nest-cli.json                 # NestJS CLI config (sourceRoot: src, deleteOutDir)
  package.json                  # NestJS 11, TypeScript 5.7, Jest 30
  package-lock.json
  tsconfig.json                 # ES2023 target, nodenext modules, decorators enabled
  tsconfig.build.json
  src/
    main.ts                     # Bootstrap: Pino logger, global pipes/filters/interceptors, CORS, port 3152
    app.module.ts               # Root module: Config, Logger, TypeORM, Common, Metrics, Health, all feature modules, RabbitMQ, TemplateClient, Consumers
    common/                     # @Global() module: errors, filters, pipes, interceptors, base repo
    config/                     # ConfigModule.forRoot: app, database, rabbitmq configs, env validation
    metrics/                    # @Global() MetricsModule: 14 custom metrics, GET /metrics
    health/                     # Custom health controller (DB, RabbitMQ, template service, queue depths)
    rules/                      # Rules CRUD, rule engine (conditions, matching, priority), rule cache
    recipients/                 # Recipient groups CRUD, member management, resolver, channel resolver
    preferences/                # Customer channel preferences webhook, LRU cache
    overrides/                  # Critical channel overrides CRUD, eager cache
    notifications/              # Notification CRUD, lifecycle, suppression engine, manual send
    rabbitmq/                   # @golevelup/nestjs-rabbitmq wrapper (5 exchanges, publisher, constants)
    consumers/                  # 6 consumers (critical/normal events, status inbound, rule/override cache invalidation) + pipeline
    template-client/            # HTTP client for template-service with circuit breaker + retry
  test/
    test-utils.ts               # Shared E2E helper
    app.e2e-spec.ts             # E2E: health + metrics
    rules.e2e-spec.ts           # E2E: rules CRUD lifecycle
    recipient-groups.e2e-spec.ts  # E2E: recipient groups + members
    overrides.e2e-spec.ts       # E2E: critical channel overrides
    notifications.e2e-spec.ts   # E2E: notifications list/filter/timeline
    jest-e2e.json               # Jest E2E config
  dbscripts/
    schema-notification-engine-service.sql
    notification-engine-service-dbscripts.sql
    seed-order-delay-data.sh
  docs/
    08-notification-engine-service.md
    changelog_dev.md

template-service/               # NestJS — port 3153 (Phase 5 complete)
  CLAUDE.md
  .env                          # Local environment variables (git-ignored)
  .gitignore                    # Node/NestJS ignores (dist, node_modules, .env, coverage, etc.)
  .prettierrc                   # Prettier config (singleQuote, trailingComma: all)
  eslint.config.mjs             # ESLint flat config (typescript-eslint + prettier)
  nest-cli.json                 # NestJS CLI config (sourceRoot: src, deleteOutDir)
  package.json                  # NestJS 11, TypeScript 5.7, Jest 30
  package-lock.json
  tsconfig.json                 # ES2023 target, nodenext modules, decorators enabled
  tsconfig.build.json
  src/
    main.ts                     # Bootstrap: Pino logger, global pipes/filters/interceptors, CORS, port 3153
    app.module.ts               # Root module: Config, Logger, TypeORM, Common, Metrics, RabbitMQ, Health, Templates, Rendering
    common/                     # @Global() module: errors, filters, pipes, interceptors, base repo
    config/                     # ConfigModule.forRoot: app, database, rabbitmq configs, env validation
    metrics/                    # @Global() MetricsModule: 10 custom metrics, GET /metrics
    health/                     # Custom health controller (DB, RabbitMQ, cache status)
    templates/                  # CRUD + versioning (controller, service, repositories, DTOs, entities, variable detector)
    rendering/                  # Handlebars rendering, LRU cache, preview, HTML sanitizer, custom helpers
    rabbitmq/                   # @golevelup/nestjs-rabbitmq wrapper (1 exchange, audit publisher, publish-only)
  test/
    test-utils.ts               # Shared E2E helper
    app.e2e-spec.ts             # E2E: health + metrics
    templates.e2e-spec.ts       # E2E: full CRUD lifecycle
    rendering.e2e-spec.ts       # E2E: render, preview, warnings, sanitization
    rollback.e2e-spec.ts        # E2E: rollback lifecycle
    jest-e2e.json               # Jest E2E config
  dbscripts/
    schema-template-service.sql
    template-service-dbscripts.sql
    seed-order-delay-template.sql
  docs/
    10-template-service.md
    changelog_dev.md

channel-router-service/         # NestJS — port 3154 (Phase 4 complete)
  CLAUDE.md
  .env                          # Local environment variables (git-ignored)
  .gitignore                    # Node/NestJS ignores (dist, node_modules, .env, coverage, etc.)
  .prettierrc                   # Prettier config (singleQuote, trailingComma: all)
  eslint.config.mjs             # ESLint flat config (typescript-eslint + prettier)
  nest-cli.json                 # NestJS CLI config (sourceRoot: src, deleteOutDir)
  package.json                  # NestJS 11, TypeScript 5.7, Jest 30
  package-lock.json
  tsconfig.json                 # ES2023 target, nodenext modules, decorators enabled
  tsconfig.build.json
  src/
    main.ts                     # Bootstrap: Pino logger, global pipes/filters/interceptors, CORS, port 3154
    app.module.ts               # Root module: Config, Logger, TypeORM, Common, Metrics, Channels, Providers, Delivery, CircuitBreaker, RateLimiter, Retry, Media, Fallback, RabbitMQ, HealthMonitor, Consumers, Health
    common/                     # @Global() module: errors, filters, pipes, interceptors, base repo
    config/                     # ConfigModule.forRoot: app, database, rabbitmq configs, env validation
    channels/                   # Channel CRUD (controller, service, repository, DTOs, entities), auto-seed 4 defaults
    providers/                  # Provider CRUD (controller, service, repository, DTOs, entities), cache service
    delivery/                   # DeliveryAttempt entity/repo, DeliveryPipelineService (7-step orchestrator), dispatch interfaces
    adapter-client/             # HTTP client for adapter services (send, health, capabilities) via @nestjs/axios
    circuit-breaker/            # Per-provider circuit breaker (CLOSED/OPEN/HALF_OPEN), DB persistence
    rate-limiter/               # Token bucket rate limiter per provider
    retry/                      # Per-channel exponential backoff with jitter
    media/                      # Channel-specific media processing (email/SMS/WhatsApp/push)
    rabbitmq/                   # @golevelup/nestjs-rabbitmq (3 exchanges, named channels, fire-and-forget publisher)
    fallback/                   # Single-level fallback chain (no cascading)
    consumers/                  # 8 priority-tiered consumers (4 channels × 2 priorities) + abstract base
    health-monitor/             # Periodic adapter health checks with CB integration
    metrics/                    # @Global() MetricsModule: 13 custom metrics, GET /metrics
    health/                     # Health controller (GET /health liveness, GET /ready readiness + adapter health)
  test/
    test-utils.ts               # Shared E2E helper
    app.e2e-spec.ts             # E2E: health, ready, metrics
    channels.e2e-spec.ts        # E2E: channel list, update config, validation
    providers.e2e-spec.ts       # E2E: register, deregister, list, update, capabilities, health
    delivery.e2e-spec.ts        # E2E: delivery pipeline (happy path, retry, fallback) with mocked adapter
    jest-e2e.json               # Jest E2E config
  dbscripts/
    schema-channel-router-service.sql
    channel-router-service-dbscripts.sql
  docs/
    11-channel-router-service-v2.md  # Convenience copy of design doc (v2)
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
    16-audit-service-v2.md  # Convenience copy of design doc (v2)
    changelog_dev.md

email-ingest-service/           # NestJS — port 3157/2525
  CLAUDE.md
  dbscripts/
  docs/
    email-ingest-service-spec.md
    changelog_dev.md

bulk-upload-service/            # NestJS — port 3158 (Phase 4 complete)
  CLAUDE.md
  .env                          # Local environment variables (git-ignored)
  .gitignore                    # Node/NestJS ignores (dist, node_modules, .env, coverage, etc.)
  .prettierrc                   # Prettier config (singleQuote, trailingComma: all)
  eslint.config.mjs             # ESLint flat config (typescript-eslint + prettier)
  nest-cli.json                 # NestJS CLI config (sourceRoot: src, deleteOutDir)
  package.json                  # NestJS 11, TypeScript 5.7, Jest 30
  package-lock.json
  tsconfig.json                 # ES2023 target, nodenext modules, decorators enabled
  tsconfig.build.json
  src/
    main.ts                     # Bootstrap: Pino logger, global pipes/filters/interceptors, CORS, port 3158
    app.module.ts               # Root module: Config, Logger, TypeORM, Common, Metrics, Uploads, CircuitBreaker, RateLimiter, RabbitMQ, Health
    common/                     # @Global() module: errors, filters, pipes, interceptors, base repo
    config/                     # ConfigModule.forRoot: app, database, rabbitmq configs, env validation
    uploads/                    # Upload CRUD (controller, service, repositories, DTOs, entities), 8-step XLSX validation
    parsing/                    # XLSX parsing (parseHeaders, parseRows, detectMode, group extraction, type coercion)
    event-ingestion/            # HTTP client for event-ingestion-service POST /webhooks/events
    circuit-breaker/            # @Global() in-memory circuit breaker (CLOSED/OPEN/HALF_OPEN state machine)
    rate-limiter/               # @Global() token bucket rate limiter
    processing/                 # Background worker (polling, standard + group mode pipeline, CB/RL integration)
    results/                    # Result XLSX generation (_notification_status column, cell styling)
    metrics/                    # @Global() MetricsModule: 18 custom metrics, GET /metrics
    rabbitmq/                   # @golevelup/nestjs-rabbitmq (fire-and-forget audit publishing, 6 routing keys)
    health/                     # Health controller (GET /health liveness, GET /ready readiness with 3 custom indicators)
  test/
    test-utils.ts               # Shared E2E helper (createTestApp, mock factories)
    app.e2e-spec.ts             # E2E: health, ready, metrics
    processing.e2e-spec.ts      # E2E: standard mode, results, audit publishing
    group-mode.e2e-spec.ts      # E2E: group mode auto-detection, grouping, conflicts
    retry.e2e-spec.ts           # E2E: uploads CRUD + retry lifecycle
    jest-e2e.json               # Jest E2E config
  dbscripts/
    schema-bulk-upload-service.sql       # Schema/role/user/grants only
    bulk-upload-service-dbscripts.sql    # uploads, upload_rows tables, indexes, purge function, trigger
  docs/
    09-bulk-upload-service.md            # Convenience copy of design doc
    template-order-delay.md              # order.delay XLSX template reference
    changelog_dev.md

notification-admin-ui/          # Next.js — port 3159
  CLAUDE.md
  docs/
    15-notification-admin-ui.md
    changelog_dev.md

auth-rbac-service-backend/      # NestJS — port 3160
  CLAUDE.md
  dbscripts/
    schema-auth-rbac-service-backend.sql
    auth-rbac-service-backend-dbscripts.sql
  docs/
    19-auth-rbac-service-backend.md   # Convenience copy of design doc
    changelog_dev.md

auth-rbac-service-frontend/     # Next.js — port 3161
  CLAUDE.md
  docs/
    20-auth-rbac-service-frontend.md  # Convenience copy of design doc
    changelog_dev.md

ecommerce-backoffice/           # Next.js — port 3162
  CLAUDE.md
  docs/
    21-ecommerce-backoffice.md        # Convenience copy of design doc
    changelog_dev.md

provider-adapters/              # NestJS monorepo — ports 3171-3174 (adapter-mailgun, adapter-braze, adapter-whatsapp, adapter-aws-ses)
  CLAUDE.md
  nest-cli.json                 # Monorepo config (4 apps + 1 shared lib)
  package.json
  apps/                         # One app per adapter service
    adapter-mailgun/            # :3171 — Email via Mailgun v3 REST API
    adapter-braze/              # :3172 — Multi-channel (Email, SMS, WhatsApp, Push) via Braze
    adapter-whatsapp/           # :3173 — WhatsApp via Meta Cloud API v21.0
    adapter-aws-ses/            # :3174 — Email via AWS SES v2 API or SMTP relay
  libs/
    common/                     # Shared: base controller, DTOs, RabbitMQ publisher, error handling, metrics
  docs/
    17-provider-adapters.md     # Convenience copy of design doc
    adapter-mailgun.md          # Mailgun-specific reference
    adapter-braze.md            # Braze multi-channel reference
    adapter-whatsapp.md         # WhatsApp Meta Cloud API reference
    adapter-aws-ses.md          # AWS SES reference
    changelog_dev.md
```

### Endpoint Reference

The root `endpoints/` folder contains one file per service documenting all planned REST API endpoints (or pages/routes for the frontend). Each endpoint has a status column tracking implementation progress.

```
endpoints/
  endpoints-notification-gateway.md          # Deprecated — all endpoints marked as Deprecated
  endpoints-event-ingestion-service.md
  endpoints-notification-engine-service.md
  endpoints-template-service.md
  endpoints-channel-router-service.md       # V1 — monolithic provider design
  endpoints-channel-router-service-v2.md   # V2 — decoupled adapter architecture (webhooks removed, adapter mgmt added)
  endpoints-admin-service.md
  endpoints-audit-service.md
  endpoints-email-ingest-service.md
  endpoints-bulk-upload-service.md
  endpoints-notification-admin-ui.md
  endpoints-provider-adapters.md   # Standardized contract (4 adapters × 5 endpoints)
  endpoints-auth-rbac-service-backend.md   # Auth, applications, users, roles, permissions, health (35+ endpoints)
  endpoints-auth-rbac-service-frontend.md  # Route reference (7 pages)
  endpoints-ecommerce-backoffice.md        # Route reference (4 pages)
```

### Database Scripts

Each backend service (all except `notification-admin-ui`) contains a `dbscripts/` subfolder with two SQL files:
- **`schema-{service-name}.sql`** — Schema creation script (schema, role, user, grants). Run once per environment.
- **`{service-name}-dbscripts.sql`** — Database object definitions (tables, indexes, functions, triggers, views, etc.). **Must be updated every time a database change is made to the service.** This is the single source of truth for the service's database structure.

The schema creation script follows the naming convention `schema-{service-name}.sql`. Each script creates the schema, role, user, and grants all necessary privileges (schema-per-service pattern). Schema/role/user names use snake_case derived from the folder name. The `event-ingestion-service` script also creates the `event_mappings` table for runtime field mapping configuration (keyed by `source_id` + `event_type`) with a `priority` column (`normal`/`critical`, default `normal`), the `event_sources` table for registered source system configurations, and the `events` table for storing all ingested events (raw and normalized) with a required `cycle_id` column for business cycle tracking. A `purge_event_payloads()` PL/pgSQL function NULLs out `raw_payload` and `normalized_payload` on rows older than a configurable threshold (default 90 days) for scheduled retention. The `notification-engine-service` script also creates the `notification_rules` table for rule definitions (UUID PK, JSONB conditions/actions/suppression, priority ordering, exclusive flag), the `recipient_groups` and `recipient_group_members` tables for group-based recipient management, the `customer_channel_preferences` table for per-customer per-channel opt-in/opt-out preferences (keyed by `customer_id`, FILLFACTOR 90, with autovacuum tuning), the `critical_channel_overrides` table for configurable forced-channel rules per event type (UUID PK, partial index on active overrides), the `notifications` table for core notification records (BIGSERIAL PK, UUID notification_id, status state machine, dedup hash, FILLFACTOR 80), the `notification_status_log` table for immutable status transition audit log, the `notification_recipients` table for per-notification recipient details, and a `purge_notification_content()` PL/pgSQL function for batch content retention. The `bulk-upload-service` script also creates the `uploads` table for tracking XLSX file uploads (UUID PK, status state machine, aggregate row counters, `total_events` for group mode event count, result file path), the `upload_rows` table for per-row processing tracking (FK to uploads with ON DELETE CASCADE, raw data, mapped payload, event ID, status, `group_key` for multi-item row grouping with partial index), and a `purge_old_uploads()` PL/pgSQL function that deletes terminal-state uploads and cascading rows older than a configurable threshold (default 90 days). The `audit-service` script also creates the `audit_events` table for immutable notification lifecycle event logging (UUID PK, notification_id, correlation_id, cycle_id, event type taxonomy, actor, metadata JSONB, payload snapshot JSONB, tsvector search vector), the `delivery_receipts` table for provider-reported delivery outcomes correlated via provider_message_id, the `notification_analytics` table for pre-aggregated hourly/daily rollups with idempotent upsert, the `dlq_entries` table for dead-letter queue monitoring with status tracking (pending/investigated/reprocessed/discarded), and a `purge_audit_payloads()` PL/pgSQL function that NULLs payload data older than a configurable threshold (default 90 days). The `template-service` script also creates the `templates` table for master template records (UUID PK, unique slug, current version pointer), the `template_versions` table for immutable version snapshots (FK to templates, unique version number per template), the `template_channels` table for channel-specific content per version (FK to template_versions, unique channel per version, Handlebars body), and the `template_variables` table for auto-detected template variables (FK to templates, unique variable name per template, optional defaults and required flag). The `auth-rbac-service-backend` script creates the `applications` table for registered applications (UUID PK, name UNIQUE, code UNIQUE, frontend_url), the `users` table for user accounts (UUID PK, email UNIQUE, password_hash bcrypt, status CHECK ACTIVE/LOCKED/DEACTIVATED, failed_login_attempts, locked_until), the `roles` table for per-application roles with hierarchy levels (UUID PK, application_id FK, UNIQUE(app_id, name), is_system flag), the `permissions` table for per-application resource+action pairs (UUID PK, application_id FK, UNIQUE(app_id, resource, action)), the `role_permissions` join table (composite PK, CASCADE deletes), the `user_applications` table for user-to-application access grants (UUID PK, UNIQUE(user_id, app_id)), the `user_application_roles` table for role assignments within user-app access (UUID PK, UNIQUE(user_application_id, role_id)), the `refresh_tokens` table for token rotation with replay detection (UUID PK, user_id FK, token_hash, is_revoked, replaced_by_id self-reference), the `password_history` table for reuse prevention (UUID PK, user_id FK, password_hash), and a `purge_expired_refresh_tokens()` PL/pgSQL function that removes expired/revoked tokens older than a configurable threshold (default 30 days).

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
| auth-rbac-service-backend | `auth_rbac_service_backend` | `auth_rbac_service_backend_user_role` | `auth_rbac_service_backend_user` |

### RabbitMQ Definitions

The `rabbitmq/` folder contains `definitions.json` — an importable RabbitMQ topology file (vhost `vhnotificationapi`, 6 exchanges, 23 queues, 24 bindings). Import via RabbitMQ Management UI, `rabbitmqadmin`, or `management.load_definitions` config. The topology is documented in `docs/12-rabbitmq-topology.md`.

## Documentation

All design docs (authoritative versions) live in `docs/` as Markdown files. Each microservice also has a convenience copy in its own `docs/` subfolder — see [Coding Process Conventions](#coding-process-conventions) below.

```
docs/
  css/styles.css                    # Legacy shared stylesheet (unused — HTML docs removed)
  index.md                          # Documentation hub page
  01-executive-summary.md           # Project overview, problem, solution, scope (v1)
  01-executive-summary-v2.md        # Executive summary (v2 — decoupled adapter architecture references)
  02-detailed-microservices.md      # Service specs, APIs, schemas, RabbitMQ config
  03-system-architecture.md         # Architecture diagrams, layers, flows, security
  04-authentication-identity.md     # Auth flows, SAML SSO, JWT sessions, account linking
  05-testing-strategy.md            # Jest, Playwright, Allure reporting, CI/CD gates
  06-changelog.md                   # Documentation & feature change log
  07-event-ingestion-service.md     # Event Ingestion Service detailed spec
  08-notification-engine-service.md # Notification Engine Service detailed spec
  09-bulk-upload-service.md         # Bulk Upload Service detailed spec
  10-template-service.md            # Template Service detailed spec
  11-channel-router-service.md      # Channel Router Service detailed spec (v1 — monolithic)
  11-channel-router-service-v2.md   # Channel Router Service detailed spec (v2 — decoupled adapter architecture)
  12-rabbitmq-topology.md           # RabbitMQ topology — exchanges, queues, bindings reference (v1)
  12-rabbitmq-topology-v2.md        # RabbitMQ topology (v2 — adapter services as additional publishers)
  13-notification-gateway.md        # Notification Gateway (BFF) detailed spec (v1)
  13-notification-gateway-v2.md     # Notification Gateway (v2 — webhook routing to adapter services)
  14-admin-service.md               # Admin Service (Backoffice Administration) detailed spec
  15-notification-admin-ui.md       # Notification Admin UI (Next.js Frontend) detailed spec
  16-audit-service.md               # Audit Service detailed spec (v1)
  16-audit-service-v2.md            # Audit Service (v2 — adapter actor references, webhook correlation)
  17-provider-adapters.md           # Provider Adapter Services detailed spec (Mailgun, Braze, WhatsApp/Meta, AWS SES)
  18-auth-rbac-architecture-addendum.md  # Auth/RBAC decoupling addendum (architectural changes, token flow, impact)
  19-auth-rbac-service-backend.md   # Auth RBAC Service Backend detailed spec (auth, users, roles, permissions, JWT)
  20-auth-rbac-service-frontend.md  # Auth RBAC Service Frontend detailed spec (Next.js admin UI)
  21-ecommerce-backoffice.md        # eCommerce Backoffice detailed spec (login portal, app launcher)
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
