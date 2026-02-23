# Event Ingestion Service

Receives and normalizes events from source systems via runtime field mappings; assigns priority tier (normal/critical) per mapping config.

## Service Info

| Attribute | Value |
|---|---|
| **Port** | 3151 |
| **Technology** | NestJS 11 (TypeScript 5.7) |
| **Runtime** | Node.js (ES2023 target) |
| **DB Schema** | `event_ingestion_service` |
| **DB Role** | `event_ingestion_service_user_role` |
| **DB User** | `event_ingestion_service_user` |

## Implementation Status

**Step 3 complete** — RabbitMQ integration with real message broker publishing, consumer handlers, retry/DLQ logic, and health checks.

- **Step 1:** Foundation, configuration, data layer, event-mappings CRUD (5 endpoints), health check
- **Step 2:** Normalization module (13 transforms, mapping engine, event type resolver, JSON Schema validator), webhook pipeline (10-step orchestrator with source auth, deduplication, normalization, persistence), event query endpoints (GET single + paginated list), test mapping endpoint.
- **Step 3:** RabbitMQ integration via `@golevelup/nestjs-rabbitmq`. Shared `EventProcessingService` pipeline (extracted from WebhookService). 3 consumer handlers (AMQP, webhook relay, email-ingest) with republish-with-header retry pattern and exponential backoff. `EventPublisherService` publishes normalized events to `xch.events.normalized`. RabbitMQ health indicator with Management API queue depth monitoring. WebhookService refactored to thin adapter. 200 unit tests passing across 27 suites.

## Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@nestjs/common` | ^11.0.1 | NestJS core framework |
| `@nestjs/core` | ^11.0.1 | NestJS core framework |
| `@nestjs/platform-express` | ^11.0.1 | Express HTTP adapter |
| `@nestjs/config` | ^4.0.3 | Configuration management (registerAs, env validation) |
| `@nestjs/typeorm` | ^11.0.0 | TypeORM integration for NestJS |
| `@nestjs/terminus` | ^11.1.1 | Health checks |
| `@nestjs/mapped-types` | ^2.1.0 | DTO utilities (PartialType, OmitType) |
| `ajv` | ^8.x | JSON Schema validation (draft-07) for payload validation |
| `dayjs` | ^1.x | Lightweight date parsing/formatting for timestamp normalization |
| `jsonpath-plus` | ^10.x | JSONPath expression evaluation for `jsonPath` transform |
| `@golevelup/nestjs-rabbitmq` | ^7.1.2 | NestJS-idiomatic RabbitMQ integration (decorators, DI, exchange assertions, reconnection) |
| `typeorm` | ^0.3.28 | ORM (PostgreSQL, entities, repositories) |
| `pg` | ^8.18.0 | PostgreSQL driver |
| `class-validator` | ^0.14.3 | DTO validation decorators |
| `class-transformer` | ^0.5.1 | Object transformation (implicit conversion) |
| `nestjs-pino` | ^4.6.0 | Pino logger integration for NestJS |
| `pino` / `pino-http` / `pino-pretty` | latest | Structured JSON logging |
| `rxjs` | ^7.8.1 | Reactive extensions |
| `typescript` | ^5.7.3 | TypeScript compiler |
| `jest` | ^30.0.0 | Unit testing |
| `supertest` | ^7.0.0 | HTTP integration testing |
| `eslint` | ^9.18.0 | Linting (flat config + typescript-eslint + prettier) |
| `prettier` | ^3.4.2 | Code formatting |
| `@types/amqplib` | (dev) | TypeScript type definitions for amqplib |

## NPM Scripts

| Script | Command | Description |
|---|---|---|
| `start` | `nest start` | Run app |
| `start:dev` | `nest start --watch` | Run with file watcher |
| `start:debug` | `nest start --debug --watch` | Run with debugger |
| `start:prod` | `node dist/main` | Run compiled output |
| `build` | `nest build` | Compile TypeScript |
| `lint` | `eslint "{src,apps,libs,test}/**/*.ts" --fix` | Lint and auto-fix |
| `format` | `prettier --write "src/**/*.ts" "test/**/*.ts"` | Format code |
| `test` | `jest` | Run unit tests |
| `test:watch` | `jest --watch` | Tests in watch mode |
| `test:cov` | `jest --coverage` | Tests with coverage |
| `test:e2e` | `jest --config ./test/jest-e2e.json` | E2E tests |

## Database Tables

- `event_sources` — registered source system configurations
- `event_mappings` — runtime field mapping configuration (keyed by source_id + event_type, priority column: normal/critical)
- `events` — all ingested events (raw and normalized payloads, cycle_id for business cycle tracking)
- `purge_event_payloads()` — PL/pgSQL function to NULL payloads older than 90 days

## RabbitMQ

**Publishes to:**
- `xch.events.incoming` — routing key `source.webhook.{eventType}` (incoming webhook events)
- `xch.events.normalized` — routing key `event.critical.{eventType}` or `event.normal.{eventType}` (normalized canonical events)

**Consumes from:**
- `q.events.amqp` — bound to `xch.events.incoming` via `source.*.#` (3 consumers, prefetch 10)
- `q.events.webhook` — bound to `xch.events.incoming` via `source.webhook.#` (2 consumers, prefetch 10)
- `q.events.email-ingest` — bound to `xch.events.incoming` via `source.email-ingest.#` (2 consumers, prefetch 10)
- `q.config.mapping-cache` — bound to `xch.config.events` via `config.mapping.changed` (1 consumer, prefetch 1)

## Dependencies

- PostgreSQL, RabbitMQ

## Environment Variables

Configured via `.env` file in the service root (git-ignored). Required for local development:

| Variable | Description | Dev Value |
|---|---|---|
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | HTTP listen port | `3151` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5433` |
| `DB_NAME` | PostgreSQL database name | `postgres` |
| `DB_SCHEMA` | PostgreSQL schema | `event_ingestion_service` |
| `DB_USER` | PostgreSQL user | `event_ingestion_service_user` |
| `DB_PASSWORD` | PostgreSQL password | *(see .env)* |
| `RABBITMQ_HOST` | RabbitMQ host | `localhost` |
| `RABBITMQ_PORT` | RabbitMQ AMQP port | `5672` |
| `RABBITMQ_MANAGEMENT_URL` | RabbitMQ Management UI URL | `http://localhost:15672` |
| `RABBITMQ_VHOST` | RabbitMQ virtual host | `vhnotificationapi` |
| `RABBITMQ_USER` | RabbitMQ user | `notificationapi` |
| `RABBITMQ_PASSWORD` | RabbitMQ password | *(see .env)* |
| `DEDUP_WINDOW_HOURS` | Deduplication time window (hours) | `24` |
| `RABBITMQ_PREFETCH` | RabbitMQ consumer prefetch count | `10` |
| `DLQ_MAX_RETRIES` | Max retry attempts before DLQ | `3` |
| `RETRY_INITIAL_DELAY_MS` | Initial retry delay (ms) | `1000` |
| `RETRY_BACKOFF_MULTIPLIER` | Retry backoff multiplier | `2` |
| `RETRY_MAX_DELAY_MS` | Maximum retry delay (ms) | `30000` |

## Related Services

- Upstream: external source systems, email-ingest-service (:3157), bulk-upload-service (:3158 via HTTP)
- Downstream: notification-engine-service (:3152) consumes normalized events
- Config: admin-service (:3155) manages event mappings

## Key References

- Design doc: `docs/07-event-ingestion-service.md` (convenience copy) — authoritative at `../../docs/07-event-ingestion-service.md`
- Endpoints: `../../endpoints/endpoints-event-ingestion-service.md`
- DB schema script: `dbscripts/schema-event-ingestion-service.sql`
- DB objects script: `dbscripts/event-ingestion-service-dbscripts.sql` — **must be updated on every database change**

## Coding Conventions

- Follow NestJS module structure (module, controller, service, dto)
- Use class-validator for DTO validation
- Normalize events using runtime mapping configuration (no hardcoded field mappings)
- All consumer handlers must be idempotent
- Use transactions for event persistence + RabbitMQ publish

## Coding Standards

1. **camelCase for JSON** — Always use camelCase notation for naming JSON object properties in request payloads and response bodies.

2. **Layered Architecture (Controllers → Services → Repositories)** — Strict separation of concerns:
   - **Controllers** — Thin HTTP handlers that only inject services and delegate. Zero business logic.
   - **Services** — All business orchestration lives here. Coordinate between repositories, helpers, and other services.
   - **Repositories** — Sole data access point, whether PostgreSQL (via TypeORM extending a `PgBaseRepository`) or external APIs.

3. **Standardized Error Responses** — All errors follow a consistent JSON schema:
   - Schema: `{ code: string, details: string, message: string, status: number, stack?: string }`
   - Example: `{ "code": "EIS-001", "details": "INVALID_BODY", "message": "source_id is required", "status": 400 }`
   - **Error Registry (`errors.ts`)** — Centralized error code definitions with HTTP status, message, and details. Error codes use domain-specific prefixes (e.g., `EIS-` for Event Ingestion Service). No duplicates.
   - **Global Exception Filter** — A single `@Catch(HttpException)` filter maps every thrown exception to the standardized JSON response `{ code, details, message, status }`.

4. **Global Middleware via NestJS Bootstrap (`main.ts`)** — Cross-cutting concerns applied once at the application level:
   - **DtoValidationPipe** — Automatic request body validation via `class-validator` decorators on DTOs.
   - **HttpExceptionFilter** — The centralized error filter described above.
   - **LoggingInterceptor** — Structured HTTP request/response logging (Pino) with service metadata, timing, and severity-based log levels (`warn` for 4xx, `error` for 5xx).

## Current Folder Structure

```
event-ingestion-service/
  .env                         # Local environment variables (git-ignored)
  .gitignore                   # Node/NestJS ignores (dist, node_modules, .env, coverage, etc.)
  .prettierrc                  # { singleQuote: true, trailingComma: "all" }
  eslint.config.mjs            # ESLint flat config (typescript-eslint + prettier)
  nest-cli.json                # NestJS CLI config (sourceRoot: src, deleteOutDir)
  package.json                 # Dependencies and npm scripts
  package-lock.json
  tsconfig.json                # ES2023 target, nodenext modules, decorators enabled
  tsconfig.build.json          # Build-specific TS config (excludes test files)
  src/
    main.ts                    # Bootstrap: Pino logger, global pipes/filters/interceptors, CORS, port 3151
    app.module.ts              # Root module: Config, Logger, TypeORM, Common, all feature modules, Health
    common/
      common.module.ts         # @Global() module
      errors.ts                # Error registry (20 EIS-prefixed codes) + createErrorResponse()
      interfaces/
        error-response.interface.ts  # { code, details, message, status, stack? }
      filters/
        http-exception.filter.ts     # Global @Catch(HttpException) → standardized JSON
        http-exception.filter.spec.ts
      pipes/
        dto-validation.pipe.ts       # Extends ValidationPipe, EIS-001 wrapping
        dto-validation.pipe.spec.ts
      interceptors/
        logging.interceptor.ts       # HTTP request/response logging (info/warn/error)
        logging.interceptor.spec.ts
      base/
        pg-base.repository.ts        # Abstract base repository (composition pattern)
      utils/
        dot-path.util.ts             # Dot-path value extraction (extractValue, extractValues)
        dot-path.util.spec.ts
        timestamp.util.ts            # Timestamp normalization (iso8601, epoch_ms, epoch_s, custom)
        timestamp.util.spec.ts
    config/
      config.module.ts         # ConfigModule.forRoot (isGlobal, env validation)
      app.config.ts            # port, nodeEnv, dedupWindowHours
      database.config.ts       # PostgreSQL connection params
      rabbitmq.config.ts       # RabbitMQ connection + retry/prefetch config
      env.validation.ts        # class-validator EnvironmentVariables + validate()
    normalization/
      normalization.module.ts        # Exports MappingEngine, EventTypeResolver, PayloadValidator
      mapping-engine.service.ts      # Core normalizePayload() — per-field extraction, transform, validation
      mapping-engine.service.spec.ts
      event-type-resolver.service.ts # Event type resolution (exact → wildcard → passthrough)
      event-type-resolver.service.spec.ts
      payload-validator.service.ts   # ajv JSON Schema draft-07 validation
      payload-validator.service.spec.ts
      transforms/
        transform-registry.ts        # 13 transforms + TransformFunction interface
        transforms.spec.ts
    event-mappings/
      event-mappings.module.ts       # TypeORM feature + NormalizationModule, exports service + repository
      event-mappings.controller.ts   # 6 REST endpoints (CRUD + POST :id/test)
      event-mappings.service.ts      # findAll, findById, create, update, softDelete, testMapping
      event-mappings.repository.ts   # Extends PgBaseRepository, findBySourceAndType, existsActiveMapping
      event-mappings.controller.spec.ts
      event-mappings.service.spec.ts
      entities/
        event-mapping.entity.ts      # 18 columns, UUID PK, JSONB fields
      dto/
        create-event-mapping.dto.ts  # Required: sourceId, eventType, name, fieldMappings
        update-event-mapping.dto.ts  # PartialType(OmitType(Create)), adds updatedBy
        list-event-mappings-query.dto.ts  # Pagination + filters
        test-mapping.dto.ts          # samplePayload, optional cycleId/eventType
    event-sources/
      event-sources.module.ts        # TypeORM feature, exports repository
      event-sources.repository.ts    # Extends PgBaseRepository, findByName()
      event-sources.repository.spec.ts
      entities/
        event-source.entity.ts       # 10 columns, SERIAL PK
    events/
      events.module.ts               # TypeORM feature, exports service + repository
      events.controller.ts           # GET /events/:eventId, GET /events (paginated)
      events.service.ts              # findByEventId, findAll, createEvent, updateStatus
      events.repository.ts           # Extends PgBaseRepository, createEvent, findByEventId, findDuplicate
      events.controller.spec.ts
      events.service.spec.ts
      entities/
        event.entity.ts              # 12 columns, BIGSERIAL PK (string), UUID eventId
      dto/
        list-events-query.dto.ts     # Pagination + filters (sourceId, eventType, status, date range)
    rabbitmq/
      rabbitmq.module.ts             # AppRabbitMQModule — @golevelup/nestjs-rabbitmq wrapper (4 exchanges, connection config)
      rabbitmq.constants.ts          # Exchange/queue name constants, routing key builders/parsers
      rabbitmq.constants.spec.ts
      event-publisher.service.ts     # Publishes NormalizedEventMessage to xch.events.normalized
      event-publisher.service.spec.ts
      interfaces/
        rabbitmq-event-message.interface.ts  # RabbitMqEventMessage (inbound), NormalizedEventMessage (outbound)
    consumers/
      consumers.module.ts            # ConsumersModule — imports RabbitMQ + domain modules, exports EventProcessingService
      event-processing.service.ts    # Shared 10-step pipeline (source→mapping→validate→dedup→normalize→persist→publish)
      event-processing.service.spec.ts
      base-event.consumer.ts         # Abstract base — handleMessage(), retryOrDlq(), isRetryable(), calculateDelay()
      amqp-event.consumer.ts         # @RabbitSubscribe on q.events.amqp (source.*.#)
      amqp-event.consumer.spec.ts
      webhook-event.consumer.ts      # @RabbitSubscribe on q.events.webhook (source.webhook.#)
      webhook-event.consumer.spec.ts
      email-ingest-event.consumer.ts # @RabbitSubscribe on q.events.email-ingest (source.email-ingest.#)
      email-ingest-event.consumer.spec.ts
    webhook/
      webhook.module.ts              # Imports ConsumersModule, EventSourcesModule
      webhook.controller.ts          # POST /webhooks/events (202 new / 200 duplicate)
      webhook.service.ts             # Thin adapter — delegates to EventProcessingService
      webhook.controller.spec.ts
      webhook.service.spec.ts
      dto/
        webhook-event.dto.ts         # sourceId, cycleId, eventType, sourceEventId?, timestamp?, payload
      guards/
        source-auth.guard.ts         # CanActivate guard — extracts sourceId, calls auth, attaches EventSource
        source-auth.guard.spec.ts
      services/
        source-auth.service.ts       # API key / Bearer / HMAC auth with timing-safe comparison
        source-auth.service.spec.ts
        deduplication.service.ts     # checkDuplicate with configurable time window
        deduplication.service.spec.ts
    health/
      health.module.ts               # Terminus module + AppRabbitMQModule
      health.controller.ts           # GET /health → DB ping + RabbitMQ check
      health.controller.spec.ts
      rabbitmq.health-indicator.ts   # RabbitMQ connection + Management API queue depth check
      rabbitmq.health-indicator.spec.ts
  test/
    app.e2e-spec.ts            # E2E test for GET /health
    jest-e2e.json              # Jest E2E config
  dbscripts/
    schema-event-ingestion-service.sql       # Schema/role/user/grants only
    event-ingestion-service-dbscripts.sql    # All table/index/function DDL
  docs/
    07-event-ingestion-service.md
    changelog_dev.md
```

