# Provider Adapter Services

NestJS monorepo containing 4 provider adapter microservices. Each adapter is a stateless "dumb pipe" that translates the standardized HTTP contract from the Channel Router Service into provider-specific API calls, and handles inbound webhook verification/normalization.

## Service Info

| Attribute | Value |
|---|---|
| **Monorepo** | NestJS monorepo (`nest-cli.json` workspaces) |
| **Technology** | NestJS 11 (TypeScript 5.7) |
| **Runtime** | Node.js (ES2023 target) |
| **DB Schema** | None (stateless — no database) |

## Adapter Services

| Adapter | Port | Provider | Channels | SDK/Client |
|---|---|---|---|---|
| adapter-mailgun | 3171 | Mailgun | Email | HTTP REST (axios, v3 API) |
| adapter-braze | 3172 | Braze | Email, SMS, WhatsApp, Push | HTTP REST (axios, Braze REST API) |
| adapter-whatsapp | 3173 | WhatsApp (Meta Cloud API) | WhatsApp | HTTP REST (axios, Graph API v21.0) |
| adapter-aws-ses | 3174 | AWS SES | Email | `@aws-sdk/client-sesv2` (API) or Nodemailer (SMTP) |

> **Note:** Port 3170 is unassigned and reserved for future use.

> **Warning:** **WhatsApp Routing Rule:** Both adapter-whatsapp and adapter-braze support WhatsApp. Only one can be active for the WhatsApp channel at a time — controlled via the `isActive` flag on the provider registration in channel-router-service.

## Implementation Status

**adapter-mailgun Phase 3 complete** — Webhook verification, normalization, and RabbitMQ publishing (POST /webhooks/inbound). All other adapters not started.

- **Phase 3:** Webhook processing pipeline (`WebhooksModule`: `WebhookVerificationService` with HMAC-SHA256 + timing-safe comparison + 5-min replay protection, `WebhookNormalizerService` with 7 event type mappings + field extraction + metadata, `WebhooksService` pipeline orchestrator with fire-and-forget pattern, `WebhooksController` POST /webhooks/inbound with 200/401 responses). Interfaces: `MailgunWebhookPayload`, `MailgunWebhookSignature`, `MailgunWebhookEventData`. 204 unit tests across 28 suites, 17 E2E tests across 3 files.

- **Phase 2:** Mailgun HTTP client module (`MailgunClientService`: sendMessage, getDomainInfo, buildFormData, EU region support). Send pipeline (`SendService`: channel validation, attachment processing with Base64/URL support and graceful degradation, Mailgun form data mapping with custom variables `v:notificationId`/`v:correlationId`/`v:cycleId` and headers `h:X-Notification-Id`, "Name \<email\>" recipient formatting, HTML detection, fromAddress override, Reply-To). Error classifier (`ErrorClassifierService`: HTTP status→retryable/errorCode mapping for all Mailgun responses). Send controller (`POST /send` with `@HttpCode(200)` — always returns 200 with success/failure in body). Refactored `MailgunHealthService` to use shared `MailgunClientService`. 149 unit tests across 24 suites, 10 E2E tests across 2 files.

- **Phase 1:** NestJS monorepo restructuring (nest-cli.json, tsconfig paths, package.json with all dependencies). libs/common/ shared library (DTOs: SendRequest/SendResult/WebhookEvent/Health/Capabilities, errors: PA-prefixed base codes + HttpExceptionFilter, pipes: DtoValidationPipe, interceptors: LoggingInterceptor, metrics: 7 prom-client metrics + GET /metrics, RabbitMQ: optional connection + fire-and-forget publisher, health: abstract BaseHealthService). apps/adapter-mailgun/ application (bootstrap with Pino/validation/filter/interceptor/CORS, config with registerAs + env validation, MG-prefixed error codes, MailgunHealthService with domains API connectivity check, HealthController with GET /health + GET /capabilities). 93 unit tests across 20 suites, 3 E2E tests. Mailgun domain: distelsa.info, region: us.

## Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@nestjs/common` | ^11.0.1 | NestJS core framework |
| `@nestjs/core` | ^11.0.1 | NestJS core framework |
| `@nestjs/platform-express` | ^11.0.1 | Express HTTP adapter |
| `@nestjs/config` | ^4.0.3 | Configuration management (registerAs, env validation) |
| `@nestjs/axios` | ^4.0.0 | HTTP client module for provider API calls |
| `@nestjs/mapped-types` | ^2.1.0 | DTO utilities (PartialType, OmitType) |
| `@nestjs/terminus` | ^11.1.1 | Health checks |
| `@golevelup/nestjs-rabbitmq` | ^7.1.2 | NestJS-idiomatic RabbitMQ integration |
| `prom-client` | ^15.1.3 | Prometheus metrics (Registry, Counter, Histogram, Gauge) |
| `class-validator` | ^0.14.3 | DTO validation decorators |
| `class-transformer` | ^0.5.1 | Object transformation (implicit conversion) |
| `nestjs-pino` | ^4.6.0 | Pino logger integration for NestJS |
| `pino` / `pino-http` / `pino-pretty` | latest | Structured JSON logging |
| `axios` | ^1.8.4 | HTTP client for provider API calls |
| `form-data` | ^4.0.2 | Multipart form-data (Mailgun attachments) |
| `rxjs` | ^7.8.1 | Reactive extensions |
| `typescript` | ^5.7.3 | TypeScript compiler |
| `jest` | ^30.0.0 | Unit testing |
| `supertest` | ^7.0.0 | HTTP integration testing |
| `eslint` | ^9.18.0 | Linting (flat config + typescript-eslint + prettier) |
| `prettier` | ^3.4.2 | Code formatting |

## NPM Scripts

| Script | Command | Description |
|---|---|---|
| `build` | `nest build` | Build default app (adapter-mailgun) |
| `build:mailgun` | `nest build adapter-mailgun` | Build Mailgun adapter |
| `start` | `nest start` | Run default app |
| `start:dev` | `nest start --watch` | Dev mode (default app) |
| `start:dev:mailgun` | `nest start adapter-mailgun --watch` | Dev mode (Mailgun) |
| `start:debug:mailgun` | `nest start adapter-mailgun --debug --watch` | Debug mode (Mailgun) |
| `start:prod:mailgun` | `node dist/apps/adapter-mailgun/main` | Production (Mailgun) |
| `lint` | `eslint "{apps,libs,test}/**/*.ts" --fix` | Lint and auto-fix |
| `format` | `prettier --write "apps/**/*.ts" "libs/**/*.ts" "test/**/*.ts"` | Format code |
| `test` | `jest` | Run all unit tests |
| `test:watch` | `jest --watch` | Tests in watch mode |
| `test:cov` | `jest --coverage` | Tests with coverage |
| `test:e2e:mailgun` | `jest --config ./apps/adapter-mailgun/test/jest-e2e.json` | E2E tests (Mailgun) |

## RabbitMQ

**Publishes to:**
- `xch.notifications.status` — webhook-originated delivery status events (routing key: `adapter.webhook.{providerId}`)

**Consumes from:**
- None (publish-only)

> **Note:** RabbitMQ connection is optional. If unavailable, adapters start and serve /send, /health, /capabilities normally. Publish failures are logged and metrics incremented with status=failed.

## Environment Variables

Configured via `.env` file in the monorepo root (git-ignored). Required for local development:

| Variable | Description | Dev Value |
|---|---|---|
| `NODE_ENV` | Runtime environment | `development` |
| `MAILGUN_PORT` | Mailgun adapter HTTP port | `3171` |
| `MAILGUN_API_KEY` | Mailgun API key | *(see .env)* |
| `MAILGUN_DOMAIN` | Mailgun sending domain | `distelsa.info` |
| `MAILGUN_FROM_ADDRESS` | Default from address | `notifications@distelsa.info` |
| `MAILGUN_REGION` | Mailgun region (us/eu) | `us` |
| `MAILGUN_WEBHOOK_SIGNING_KEY` | Mailgun webhook signing key | *(see .env)* |
| `RABBITMQ_HOST` | RabbitMQ host | `localhost` |
| `RABBITMQ_PORT` | RabbitMQ AMQP port | `5672` |
| `RABBITMQ_VHOST` | RabbitMQ virtual host | `vhnotificationapi` |
| `RABBITMQ_USER` | RabbitMQ user | `notificationapi` |
| `RABBITMQ_PASSWORD` | RabbitMQ password | *(see .env)* |

## Dependencies

- RabbitMQ (publish-only connection, optional)
- External provider APIs (Mailgun, Braze, Meta Cloud API, AWS SES)

## Related Services

- Upstream: channel-router-service (:3154) sends `POST /send` requests
- Upstream: notification-gateway (:3150) routes provider webhooks to adapter `POST /webhooks/inbound`
- Downstream: audit-service (:3156) consumes webhook status events from RabbitMQ
- Downstream: notification-engine-service (:3152) consumes webhook delivery confirmations from RabbitMQ

## Key References

- Design doc: `docs/17-provider-adapters.md` (convenience copy) — authoritative at `../../docs/17-provider-adapters.md`
- Per-adapter reference docs: `docs/adapter-mailgun.md`, `docs/adapter-braze.md`, `docs/adapter-whatsapp.md`, `docs/adapter-aws-ses.md`
- Endpoints: `../../endpoints/endpoints-provider-adapters.md`

## Coding Conventions

- Follow NestJS monorepo structure (`apps/` per adapter + `libs/common/` shared)
- All adapters implement the same HTTP contract (`POST /send`, `GET /health`, `GET /capabilities`, `POST /webhooks/inbound`)
- All adapters are stateless — no database, no local state beyond optional LRU caches
- Provider credentials stored in environment variables (per-adapter `.env`)
- Webhook verification is the adapter's responsibility, not the gateway's
- Use shared `libs/common/` for base controllers, DTOs, RabbitMQ publisher, error handling, metrics, logging

## Coding Standards

1. **camelCase for JSON** — Always use camelCase notation for naming JSON object properties in request payloads and response bodies.

2. **Layered Architecture (Controllers → Services)** — Simplified layering (no repositories — stateless services):
   - **Controllers** — Thin HTTP handlers implementing the standardized contract. Delegate to services.
   - **Services** — Provider-specific API translation. Each adapter has a `send()`, `health()`, `capabilities()`, and `handleWebhook()` method.

3. **Standardized Error Responses** — All errors follow a consistent JSON schema:
   - Schema: `{ code: string, details: string, message: string, status: number, stack?: string }`
   - Shared error codes use `PA-` prefix (provider adapter base). Adapter-specific codes: `MG-` (Mailgun), `BZ-` (Braze), `WA-` (WhatsApp), `SES-` (AWS SES)
   - **Global Exception Filter** — Shared from `libs/common/`.

4. **Global Middleware via NestJS Bootstrap (`main.ts`)** — Cross-cutting concerns applied once per adapter:
   - **DtoValidationPipe** — Automatic request body validation via `class-validator`.
   - **HttpExceptionFilter** — Shared from `libs/common/`.
   - **LoggingInterceptor** — Structured HTTP request/response logging (Pino).

## Current Folder Structure

```
provider-adapters/
  .env                           # Local environment variables (git-ignored)
  .gitignore                     # Node/NestJS ignores
  .prettierrc                    # { singleQuote: true, trailingComma: "all" }
  eslint.config.mjs              # ESLint flat config (typescript-eslint + prettier)
  jest.setup.ts                  # Jest setup (reflect-metadata)
  nest-cli.json                  # NestJS monorepo config (adapter-mailgun + common)
  package.json                   # Dependencies and npm scripts (monorepo)
  package-lock.json
  tsconfig.json                  # ES2023 target, nodenext modules, @app/common paths
  tsconfig.build.json            # Build-specific TS config
  apps/
    adapter-mailgun/
      tsconfig.app.json          # App-specific TS config extending root
      src/
        main.ts                  # Bootstrap: Pino logger, global pipes/filters/interceptors, CORS, port 3171
        app.module.ts            # Root module: MailgunConfigModule, LoggerModule, MetricsModule, HealthModule, SendModule
        config/
          config.module.ts       # ConfigModule.forRoot (isGlobal, env validation, mailgun + rabbitmq configs)
          mailgun.config.ts      # registerAs 'mailgun': port, apiKey, domain, fromAddress, region, baseUrl, webhookSigningKey
          mailgun.config.spec.ts
          rabbitmq.config.ts     # registerAs 'rabbitmq': host, port, vhost, user, password
          rabbitmq.config.spec.ts
          env.validation.ts      # class-validator EnvironmentVariables + validate()
          env.validation.spec.ts
        errors/
          mailgun-errors.ts      # MAILGUN_ERROR_CODES (10 MG-prefixed + inherited PA- base)
          mailgun-errors.spec.ts
        mailgun-client/
          mailgun-client.module.ts       # Imports HttpModule (10s timeout), provides MailgunClientService
          mailgun-client.service.ts      # Mailgun v3 HTTP client (sendMessage, getDomainInfo, buildFormData)
          mailgun-client.service.spec.ts
          interfaces/
            mailgun.interfaces.ts        # MailgunApiResponse, MailgunSendOptions, MailgunAttachment
        send/
          send.module.ts         # Imports MailgunClientModule + HttpModule, provides SendService, ErrorClassifierService, SendController
          send.service.ts        # Send pipeline orchestrator (validate, attachments, build form, send, classify errors, metrics)
          send.service.spec.ts
          send.controller.ts     # POST /send (@HttpCode(200), delegates to SendService, catches unexpected errors)
          send.controller.spec.ts
          error-classifier.service.ts   # Classifies Mailgun errors (HTTP status → retryable/errorCode)
          error-classifier.service.spec.ts
        health/
          health.module.ts       # Imports MailgunClientModule, provides MailgunHealthService + HealthController
          health.controller.ts   # GET /health, GET /capabilities
          health.controller.spec.ts
          mailgun-health.service.ts  # Extends BaseHealthService, uses MailgunClientService.getDomainInfo()
          mailgun-health.service.spec.ts
        webhooks/
          webhooks.module.ts     # Imports AppRabbitMQModule, provides verification/normalizer/service/controller
          webhooks.controller.ts # POST /webhooks/inbound (200 ok / 401 verification failed)
          webhooks.controller.spec.ts
          webhooks.service.ts    # Pipeline orchestrator: verify → normalize → publish → metrics
          webhooks.service.spec.ts
          webhook-verification.service.ts    # HMAC-SHA256 signature verification + replay protection
          webhook-verification.service.spec.ts
          webhook-normalizer.service.ts      # Mailgun event → WebhookEventDto normalization
          webhook-normalizer.service.spec.ts
          interfaces/
            mailgun-webhook.interfaces.ts    # MailgunWebhookPayload, MailgunWebhookSignature, MailgunWebhookEventData
      test/
        test-utils.ts            # E2E test helper (createTestApp with HealthModule + SendModule + WebhooksModule)
        app.e2e-spec.ts          # E2E: health, capabilities, metrics
        send.e2e-spec.ts         # E2E: POST /send (valid email, validation, non-email, 429/401, attachments, shape)
        webhooks.e2e-spec.ts     # E2E: POST /webhooks/inbound (delivered, bounced, opened, invalid sig, expired, routing, metrics)
        jest-e2e.json            # Jest E2E config
  libs/
    common/
      tsconfig.lib.json          # Lib-specific TS config extending root
      src/
        index.ts                 # Barrel re-exports
        dto/
          send-request.dto.ts    # SendRequestDto (RecipientDto, ContentDto, MediaDto, MetadataDto, ChannelType)
          send-request.dto.spec.ts
          send-result.dto.ts     # SendResultDto
          send-result.dto.spec.ts
          webhook-event.dto.ts   # WebhookEventDto, WebhookEventType enum
          webhook-event.dto.spec.ts
          health-response.dto.ts # AdapterHealthResponseDto
          health-response.dto.spec.ts
          capabilities-response.dto.ts  # AdapterCapabilitiesResponseDto
          capabilities-response.dto.spec.ts
        errors/
          error-response.interface.ts  # ErrorResponse interface
          base-errors.ts         # BASE_ERROR_CODES (7 PA-prefixed), ErrorDefinition, createErrorResponse()
          base-errors.spec.ts
          http-exception.filter.ts     # @Catch(HttpException) global filter → standardized JSON
          http-exception.filter.spec.ts
        pipes/
          dto-validation.pipe.ts       # Extends ValidationPipe, PA-001 wrapping
          dto-validation.pipe.spec.ts
        interceptors/
          logging.interceptor.ts       # HTTP request/response logging (info/warn/error by status)
          logging.interceptor.spec.ts
        metrics/
          metrics.module.ts      # @Global() module
          metrics.service.ts     # 7 prom-client metrics + convenience methods
          metrics.service.spec.ts
          metrics.controller.ts  # GET /metrics — Prometheus text format
          metrics.controller.spec.ts
        rabbitmq/
          rabbitmq.module.ts     # AppRabbitMQModule (forRootAsync, optional connection)
          rabbitmq.constants.ts  # Exchange name, webhookRoutingKey()
          rabbitmq.constants.spec.ts
          rabbitmq-publisher.service.ts  # Fire-and-forget publishWebhookEvent (null-safe AmqpConnection)
          rabbitmq-publisher.service.spec.ts
        health/
          base-health.service.ts       # Abstract BaseHealthService (getHealth assembler)
          base-health.service.spec.ts
  docs/
    17-provider-adapters.md      # Convenience copy of design doc
    adapter-mailgun.md           # Mailgun-specific reference
    adapter-braze.md             # Braze multi-channel reference
    adapter-whatsapp.md          # WhatsApp Meta Cloud API reference
    adapter-aws-ses.md           # AWS SES reference
    changelog_dev.md             # Code-only development changelog
```
