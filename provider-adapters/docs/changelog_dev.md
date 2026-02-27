# Provider Adapter Services — Development Changelog

> **Info:** This file tracks **code changes only** for the provider adapter services. Design and documentation changes are tracked in `../../docs/06-changelog.md`.

---

## 2026-02-26 — Phase 3: adapter-mailgun Webhook Verification + Normalization + RabbitMQ Publishing (POST /webhooks/inbound)

### webhooks/ — Inbound Webhook Processing
- **WebhooksModule:** Imports `AppRabbitMQModule`, provides `WebhookVerificationService`, `WebhookNormalizerService`, `WebhooksService`, `WebhooksController`
- **WebhookVerificationService:** Verifies Mailgun webhook signatures using HMAC-SHA256:
  - Extracts `timestamp`, `token`, `signature` from the payload's signature object
  - Concatenates `timestamp + token`, computes HMAC-SHA256 using `MAILGUN_WEBHOOK_SIGNING_KEY`
  - Timing-safe comparison via `crypto.timingSafeEqual`
  - Replay protection: rejects timestamps older than 5 minutes
  - Increments `adapter_webhook_verification_failures_total` metric on failure
- **WebhookNormalizerService:** Transforms Mailgun event format to standardized `WebhookEventDto`:
  - Status mapping: `delivered`→delivered, `opened`→opened, `clicked`→clicked, `failed`+permanent→bounced, `failed`+temporary→failed, `complained`→complained, `unsubscribed`→unsubscribed
  - Extracts: `providerMessageId` from `message.headers['message-id']` (keeps angle brackets), `notificationId`/`correlationId`/`cycleId` from `user-variables`, `recipientAddress` from `recipient`
  - Builds `rawStatus` (e.g., `failed.permanent`), converts Unix timestamp to ISO-8601
  - Includes `delivery-status`, `severity`, `reason`, `ip`, `url`, `geolocation` in metadata
  - Gracefully handles missing custom variables (null), unknown event types (pass through with warning)
- **WebhooksService:** Orchestrates the webhook pipeline:
  1. Verify signature → throw MG-004 (401) on failure
  2. Normalize event to `WebhookEventDto`
  3. Publish to RabbitMQ via `RabbitMQPublisherService.publishWebhookEvent()` (fire-and-forget, routing key `adapter.webhook.mailgun`)
  4. Increment `adapter_webhook_received_total` metric with `providerId=mailgun` and `eventType` label
  - RabbitMQ publish failures: logged + metric incremented, but do not throw (fire-and-forget pattern)
- **WebhooksController:** `POST /webhooks/inbound`:
  - Accepts raw Mailgun webhook payload, delegates to `WebhooksService.processWebhook()`
  - Returns `200 { status: 'ok' }` on success — Mailgun expects 200 to stop retrying
  - Verification failure → rethrows 401 HttpException
  - Any other error → returns 200 (fire-and-forget, error logged internally)
- **Interfaces:** `MailgunWebhookPayload`, `MailgunWebhookSignature`, `MailgunWebhookEventData`

### Integration
- Updated `app.module.ts` to import `WebhooksModule`
- Updated `test-utils.ts` to include `WebhooksModule` in E2E test app

### Testing
- 204 unit tests across 28 suites (Phase 2: 149/24 → Phase 3: +55 tests, +4 suites)
  - `webhook-verification.service.spec.ts` — valid HMAC, tampered signature/timestamp/token, expired timestamp, boundary timestamp, missing fields (null, empty, undefined, NaN), timing-safe comparison
  - `webhook-normalizer.service.spec.ts` — all 7 event type mappings, field extraction (custom vars, message ID with angle brackets, recipient), timestamp conversion, rawStatus format, metadata inclusion/absence, missing custom variables, unknown event passthrough
  - `webhooks.service.spec.ts` — happy path pipeline, invalid signature → 401 MG-004, RabbitMQ failure → fire-and-forget resolve, metrics labels, routing key
  - `webhooks.controller.spec.ts` — valid → 200, verification → 401 rethrow, internal error → 200 swallow, HttpException vs Error distinction
- 17 E2E tests across 3 files (Phase 2: 10/2 → Phase 3: +7 tests, +1 file)
  - `webhooks.e2e-spec.ts` — delivered event (full field verification), failed permanent→bounced, opened with custom variables, invalid signature→401, expired timestamp→401, routing key verification, metrics counter verification

---

## 2026-02-26 — Phase 2: adapter-mailgun Send Pipeline (POST /send)

### mailgun-client/ — Shared Mailgun HTTP Client
- **MailgunClientModule:** Imports `HttpModule` with 10s timeout, provides `MailgunClientService`
- **MailgunClientService:** Low-level HTTP client for Mailgun v3 REST API:
  - `sendMessage(formData)` — POST to `{baseUrl}/{domain}/messages` with multipart/form-data and Basic Auth
  - `getDomainInfo()` — GET `{baseUrl}/domains/{domain}` (shared with health checks)
  - `buildFormData(options)` — Builds multipart form data from `MailgunSendOptions` (from, to, subject, html/text, custom headers `h:`, custom variables `v:`, attachments)
  - EU region support via configurable `baseUrl`
- **Interfaces:** `MailgunApiResponse`, `MailgunSendOptions`, `MailgunAttachment`

### send/ — Send Pipeline
- **SendModule:** Imports `MailgunClientModule` + `HttpModule` (5s timeout for attachment downloads), provides `SendService`, `ErrorClassifierService`, `SendController`
- **SendService:** Orchestrates the email send pipeline:
  1. Channel validation (email only, rejects sms/whatsapp/push)
  2. Attachment processing: Base64 decode or URL download (5s timeout), 25 MB limit, graceful degradation on failure
  3. Build `MailgunSendOptions` from `SendRequestDto` (from address override, "Name \<email\>" formatting, HTML detection, custom variables `v:notificationId`, `v:correlationId`, `v:cycleId`, `h:X-Notification-Id`, `h:Reply-To`)
  4. Build form data and call `MailgunClientService.sendMessage()`
  5. Extract `providerMessageId` from response (angle brackets included)
  6. Prometheus metrics: `adapter_send_total`, `adapter_send_duration_seconds`, `adapter_send_errors_total`
- **ErrorClassifierService:** Classifies Mailgun errors by HTTP status and network error codes:
  - Non-retryable: 400→MG-009, 401→MG-005, 402→MG-003, 404→MG-006, 413→MG-008
  - Retryable: 429→MG-007, 500/502/503→MG-002, ECONNREFUSED/ENOTFOUND/ETIMEDOUT→MG-002
  - Unknown: →MG-003
- **SendController:** `POST /send` with `@HttpCode(200)` — always returns 200 with `SendResultDto` body (success/failure + retryable flag in response body, per standardized contract)

### Refactored health/ Module
- Refactored `MailgunHealthService` to use shared `MailgunClientService.getDomainInfo()` instead of direct `HttpService` calls
- Updated `HealthModule` to import `MailgunClientModule` instead of `HttpModule`
- Updated `app.module.ts` to import `SendModule`

### Testing
- 149 unit tests across 24 suites (Phase 1: 93/20 → Phase 2: +56 tests, +4 suites)
  - `mailgun-client.service.spec.ts` — sendMessage URL/auth/response, getDomainInfo, EU region, buildFormData
  - `send.service.spec.ts` — success path, recipient name formatting, HTML detection, custom variables, channel validation, Base64/URL attachments, graceful degradation, all error classifications, metrics
  - `error-classifier.service.spec.ts` — all HTTP statuses (400/401/402/404/413/429/500/502/503), network errors (ECONNREFUSED/ENOTFOUND/ETIMEDOUT/ECONNRESET/ECONNABORTED), timeout, unknown
  - `send.controller.spec.ts` — delegation, error response shape, unexpected error handling
  - Updated `mailgun-health.service.spec.ts` for refactored MailgunClientService dependency
- 10 E2E tests across 2 files (Phase 1: 3 → Phase 2: +7)
  - `send.e2e-spec.ts` — valid email→200 success, missing recipient→400 validation, non-email channel→200 failure, Mailgun 429→retryable, Mailgun 401→non-retryable, Base64 attachment, response shape

---

## 2026-02-26 — Phase 1: Monorepo Foundation + Shared Library + Mailgun Scaffold

### Monorepo Restructuring
- Converted placeholder single-app NestJS project to NestJS monorepo (`apps/` + `libs/`)
- Updated `nest-cli.json` with monorepo config (adapter-mailgun app + common lib)
- Updated `tsconfig.json` with `@app/common` path aliases
- Updated `package.json` with all required dependencies and monorepo scripts
- Deleted placeholder `src/` and `test/` directories
- Added `.gitignore`, `.prettierrc`, `eslint.config.mjs` (matching CRS conventions)
- Created `apps/adapter-mailgun/tsconfig.app.json` and `libs/common/tsconfig.lib.json`

### libs/common/ — Shared Library
- **DTOs:** `SendRequestDto` (with nested `RecipientDto`, `ContentDto`, `MediaDto`, `MetadataDto`), `SendResultDto`, `WebhookEventDto` (with `WebhookEventType` enum), `AdapterHealthResponseDto`, `AdapterCapabilitiesResponseDto`
- **Errors:** `ErrorResponse` interface, `BASE_ERROR_CODES` registry (7 PA-prefixed codes), `createErrorResponse()` helper, `HttpExceptionFilter` (@Catch(HttpException) global filter)
- **Pipes:** `DtoValidationPipe` (extends ValidationPipe, whitelist + forbidNonWhitelisted + transform, PA-001 wrapping)
- **Interceptors:** `LoggingInterceptor` (Pino-based, info/warn/error by status code, correlation ID, timing)
- **Metrics:** `MetricsModule` (@Global), `MetricsService` (7 prom-client metrics: adapter_send_total, adapter_send_duration_seconds, adapter_send_errors_total, adapter_webhook_received_total, adapter_webhook_verification_failures_total, adapter_rabbitmq_publish_total, adapter_health_status), `MetricsController` (GET /metrics)
- **RabbitMQ:** `AppRabbitMQModule` (@golevelup/nestjs-rabbitmq forRootAsync, xch.notifications.status exchange, optional connection with wait:false), `RabbitMQPublisherService` (fire-and-forget publishWebhookEvent with null-safe AmqpConnection), `rabbitmq.constants.ts`
- **Health:** `BaseHealthService` (abstract class with getHealth() assembler, checkProviderConnectivity() abstract)
- **Index:** Barrel re-exports from `libs/common/src/index.ts`

### apps/adapter-mailgun/ — Mailgun Adapter Application
- **main.ts:** Bootstrap with Pino logger, DtoValidationPipe, HttpExceptionFilter, LoggingInterceptor, CORS, port 3171
- **app.module.ts:** MailgunConfigModule, LoggerModule, MetricsModule, HealthModule
- **config/:** `MailgunConfigModule` (ConfigModule.forRoot isGlobal), `mailgun.config.ts` (registerAs 'mailgun': port, apiKey, domain, fromAddress, region, baseUrl, webhookSigningKey; EU region support), `rabbitmq.config.ts` (registerAs 'rabbitmq'), `env.validation.ts` (class-validator validation)
- **errors/:** `MAILGUN_ERROR_CODES` (10 MG-prefixed codes + inherited PA- base codes)
- **health/:** `HealthModule`, `HealthController` (GET /health, GET /capabilities), `MailgunHealthService` (extends BaseHealthService, HTTP GET to Mailgun domains API with Basic Auth)

### Testing
- 93 unit tests across 20 suites (libs/common: 14 suites, apps/adapter-mailgun: 6 suites)
- 3 E2E tests (GET /health, GET /capabilities, GET /metrics) — all passing
- Mocked RabbitMQ connection in tests (not required to run)
- Mocked Mailgun API calls in health service tests
