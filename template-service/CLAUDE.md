# Template Service

Template CRUD, Handlebars rendering, versioning, and channel-specific content management.

## Service Info

| Attribute | Value |
|---|---|
| **Port** | 3153 |
| **Technology** | NestJS 11 (TypeScript 5.7) |
| **Runtime** | Node.js (ES2023 target) |
| **DB Schema** | `template_service` |
| **DB Role** | `template_service_user_role` |
| **DB User** | `template_service_user` |

## Implementation Status

**Phase 5 complete** — Phase 1 foundation (config, common, metrics, health, bootstrap) plus Phase 2 Template CRUD & Versioning plus Phase 3 Rendering Engine, Caching & Preview plus Phase 4 RabbitMQ Audit Publishing, E2E Tests & Polish plus Phase 5 Metrics, Channel Filter, Sanitization, Render Timeout. 5 new Prometheus metrics (CRUD total, version created total, audit publish failures, cache evictions, DB pool active). `GET /templates?channel=` query filter via EXISTS subquery. HTML sanitization for email output (strips script/iframe/object/embed, on* handlers, javascript: URIs, CSS expressions). `RENDER_TIMEOUT_MS` config with best-effort timeout checkpoints. `render()` now returns `channelMetadata` (provider-specific JSONB metadata from `template_channels.metadata` column, e.g. WhatsApp `metaTemplateName`/`metaTemplateLanguage`/`metaTemplateParameters`). 250 unit tests across 21 suites.

## Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@golevelup/nestjs-rabbitmq` | ^7.1.2 | RabbitMQ AMQP integration |
| `@nestjs/common` | ^11.0.1 | NestJS core framework |
| `@nestjs/config` | ^4.0.3 | Configuration management |
| `@nestjs/core` | ^11.0.1 | NestJS core framework |
| `@nestjs/mapped-types` | ^2.1.0 | DTO mapping utilities |
| `@nestjs/platform-express` | ^11.0.1 | Express HTTP adapter |
| `@nestjs/terminus` | ^11.1.1 | Health check framework |
| `@nestjs/typeorm` | ^11.0.0 | TypeORM integration |
| `class-transformer` | ^0.5.1 | Object transformation |
| `class-validator` | ^0.14.3 | DTO validation decorators |
| `dayjs` | ^1.11.19 | Date manipulation |
| `handlebars` | ^4.7.8 | Template rendering engine |
| `nestjs-pino` | ^4.6.0 | Pino logger for NestJS |
| `pg` | ^8.18.0 | PostgreSQL driver |
| `pino` | ^10.3.1 | Structured JSON logger |
| `pino-http` | ^11.0.0 | HTTP request logging |
| `pino-pretty` | ^13.1.3 | Pretty-print dev logs |
| `prom-client` | ^15.1.3 | Prometheus metrics |
| `rxjs` | ^7.8.1 | Reactive extensions |
| `typeorm` | ^0.3.28 | ORM for PostgreSQL |
| `typescript` | ^5.7.3 | TypeScript compiler |
| `jest` | ^30.0.0 | Unit testing |
| `supertest` | ^7.0.0 | HTTP integration testing |
| `eslint` | ^9.18.0 | Linting (flat config + typescript-eslint + prettier) |
| `prettier` | ^3.4.2 | Code formatting |

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

- `templates` — master template records (UUID PK, unique slug, current version pointer)
- `template_versions` — immutable version snapshots (FK to templates, unique version number per template)
- `template_channels` — channel-specific content per version (FK to template_versions, unique channel per version, Handlebars body)
- `template_variables` — auto-detected template variables (FK to templates, unique variable name per template, optional defaults and required flag)

## RabbitMQ

**Publishes to:**
- `xch.notifications.status` — template lifecycle and render audit events (template.created, template.updated, template.deleted, template.rolledback, render.completed, render.failed)

**Consumes from:** None (publish-only, fire-and-forget audit logging)

## Environment Variables

Configured via `.env` file in the service root (git-ignored). Required for local development:

| Variable | Description | Dev Value |
|---|---|---|
| `NODE_ENV` | Runtime environment | `development` |
| `PORT` | HTTP listen port | `3153` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5433` |
| `DB_NAME` | PostgreSQL database name | `postgres` |
| `DB_SCHEMA` | PostgreSQL schema | `template_service` |
| `DB_USER` | PostgreSQL user | `template_service_user` |
| `DB_PASSWORD` | PostgreSQL password | *(see .env)* |
| `RABBITMQ_HOST` | RabbitMQ host | `localhost` |
| `RABBITMQ_PORT` | RabbitMQ AMQP port | `5672` |
| `RABBITMQ_MANAGEMENT_URL` | RabbitMQ Management UI URL | `http://localhost:15672` |
| `RABBITMQ_VHOST` | RabbitMQ virtual host | `vhnotificationapi` |
| `RABBITMQ_USER` | RabbitMQ user | `notificationapi` |
| `RABBITMQ_PASSWORD` | RabbitMQ password | *(see .env)* |
| `TEMPLATE_CACHE_MAX_SIZE` | Max compiled template cache entries | `1000` |
| `SMS_WARN_LENGTH` | SMS body warning threshold (chars) | `160` |
| `SMS_MAX_LENGTH` | SMS body max length threshold (chars) | `1600` |
| `WHATSAPP_MAX_LENGTH` | WhatsApp body max length (chars) | `4096` |
| `PUSH_MAX_LENGTH` | Push notification max length (chars) | `256` |
| `RENDER_TIMEOUT_MS` | Max render duration before timeout (ms) | `5000` |

## Dependencies

- PostgreSQL, RabbitMQ

## Related Services

- Called by: notification-engine-service (:3152) for rendering, admin-service (:3155) for template management
- Proxied through: notification-gateway (:3150)

## Key References

- Design doc: `docs/10-template-service.md`
- Endpoints: `../../endpoints/endpoints-template-service.md`
- DB schema script: `dbscripts/schema-template-service.sql`
- DB objects script: `dbscripts/template-service-dbscripts.sql` — **must be updated on every database change**

## Coding Conventions

- Follow NestJS module structure (module, controller, service, dto)
- Use Handlebars for template rendering (no other engines)
- Template versions are immutable — updates create new versions
- Auto-detect variables from Handlebars expressions on save
- Cache compiled templates for performance
- Use class-validator for DTO validation

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

## Folder Structure

```
template-service/
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
    main.ts                    # Bootstrap: Pino logger, global pipes/filters/interceptors, CORS, port 3153
    app.module.ts              # Root module: Config, Logger, TypeORM, Common, Metrics, RabbitMQ, Health, Templates, Rendering
    common/                    # @Global() module: errors, filters, pipes, interceptors, base repo
      common.module.ts         # Global module providing LoggingInterceptor
      errors.ts                # Error code registry (TS-001 through TS-012)
      interfaces/
        error-response.interface.ts  # ErrorResponse type
      filters/
        http-exception.filter.ts     # Global exception filter
      pipes/
        dto-validation.pipe.ts       # DTO validation with TS-001 errors
      interceptors/
        logging.interceptor.ts       # Structured HTTP request/response logging
      base/
        pg-base.repository.ts        # Abstract base repository with pagination
    config/                    # ConfigModule.forRoot: app, database, rabbitmq configs, env validation
      config.module.ts         # AppConfigModule wrapping ConfigModule.forRoot
      app.config.ts            # App config (port, nodeEnv, cacheMaxSize, output limit thresholds)
      database.config.ts       # Database config (host, port, name, schema, user, password)
      rabbitmq.config.ts       # RabbitMQ config (host, port, vhost, user, password)
      env.validation.ts        # Environment variable validation
    metrics/                   # @Global() Prometheus metrics module
      metrics.module.ts        # MetricsModule
      metrics.service.ts       # 10 custom ts_ metrics + helper methods
      metrics.controller.ts    # GET /metrics endpoint
    health/                    # Health check module
      health.module.ts         # HealthModule (imports TerminusModule, RenderingModule)
      health.controller.ts     # GET /health with DB + RabbitMQ + cache status checks
    templates/                 # Template CRUD & Versioning module
      entities/
        template.entity.ts             # Template entity (templates table, OneToMany versions/variables)
        template-version.entity.ts     # TemplateVersion entity (template_versions, ManyToOne template, OneToMany channels)
        template-channel.entity.ts     # TemplateChannel entity (template_channels, ManyToOne version)
        template-variable.entity.ts    # TemplateVariable entity (template_variables, ManyToOne template)
      dto/
        create-template.dto.ts         # slug, name, description, channels[], createdBy
        update-template.dto.ts         # channels[], changeSummary, updatedBy
        rollback-template.dto.ts       # versionNumber, updatedBy
        list-templates-query.dto.ts    # page, limit, search, isActive, sortBy, sortOrder
        channel.dto.ts                 # channel (email/sms/whatsapp/push), subject, body, metadata (WhatsApp: metaTemplateName, metaTemplateLanguage, metaTemplateParameters [{ name: Meta placeholder, field: event payload field }])
        index.ts                       # Barrel export
      repositories/
        templates.repository.ts        # Extends PgBaseRepository: paginated list, slug check, relations load
        template-versions.repository.ts  # Version number increment, find by template
        template-channels.repository.ts  # Batch create, find by version
        template-variables.repository.ts # Upsert for template, find by template
      services/
        templates.service.ts           # CRUD pipeline: create, findAll, findById, update (new version), delete, rollback
        variable-detector.service.ts   # Handlebars AST walker: extracts variables, excludes helpers
      templates.controller.ts          # POST/GET/GET:id/PUT:id/DELETE:id/POST:id/rollback /templates
      templates.module.ts              # TypeOrmModule.forFeature, AppRabbitMQModule, all providers, exports TemplatesService
    rendering/                 # Handlebars rendering module
      rendering.module.ts          # RenderingModule (exports TemplateCacheService)
      rendering.controller.ts      # POST /templates/:id/render, POST /templates/:id/preview
      dto/
        render-template.dto.ts     # channel, data, versionNumber?
        preview-template.dto.ts    # data, versionNumber?
        index.ts                   # Barrel export
      services/
        rendering.service.ts       # Render pipeline, preview, cache warm-up on bootstrap; render() returns channelMetadata (JSONB from template_channels.metadata)
        template-cache.service.ts  # LRU in-memory compiled template cache with metrics; CompiledTemplate interface includes channelMetadata: Record<string, any>
      sanitizers/
        html-sanitizer.ts          # Email HTML sanitization (strips script/iframe/object/embed, on* handlers, javascript: URIs)
      helpers/
        handlebars-helpers.ts      # 8 custom Handlebars helpers (formatCurrency, formatDate, etc.)
    rabbitmq/                  # @golevelup/nestjs-rabbitmq publish-only module
      rabbitmq.module.ts           # AppRabbitMQModule: forRootAsync (1 exchange, publish-only, no consumers)
      rabbitmq.constants.ts        # Exchange constant, routing key builders (template.*, render.*)
      audit-publisher.service.ts   # Fire-and-forget publisher: 6 audit event methods (template lifecycle + render)
  test/
    test-utils.ts              # Shared E2E helper: createTestApp(), cleanupTestData()
    app.e2e-spec.ts            # E2E: health + metrics endpoints
    templates.e2e-spec.ts      # E2E: full CRUD lifecycle (create, duplicate, list, get, update, delete)
    rendering.e2e-spec.ts      # E2E: render, preview, inactive template, version-specific render, SMS warnings
    rollback.e2e-spec.ts       # E2E: rollback lifecycle (v2→v1, bad version, same version, not found)
    jest-e2e.json              # Jest E2E config (moduleNameMapper, 30s timeout)
  dbscripts/
    schema-template-service.sql
    template-service-dbscripts.sql
    seed-order-delay-template.sql
  docs/
    10-template-service.md
    changelog_dev.md
```
