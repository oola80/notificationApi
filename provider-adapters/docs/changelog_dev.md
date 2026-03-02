# Provider Adapter Services — Development Changelog

> **Info:** This file tracks **code changes only** for the provider adapter services. Design and documentation changes are tracked in `../../docs/06-changelog.md`.

---

## [Unreleased]

### Bugfix: WHATSAPP_TEST_MODE=false incorrectly evaluated as true (2026-03-02)

#### apps/adapter-whatsapp/
- `src/config/env.validation.ts` — Changed `WHATSAPP_TEST_MODE` from `@IsBoolean()` to `@IsString()` with default `'false'`. Same fix previously applied to `WHATSAPP_TLS_REJECT_UNAUTHORIZED`: `enableImplicitConversion: true` in `plainToInstance` converts the string `'false'` via `Boolean('false')` → `true` (non-empty string is truthy), corrupting the value. Removed unused `IsBoolean` import.

### Enhancement: Log WhatsApp Meta API request payload (2026-03-02)

#### apps/adapter-whatsapp/
- `src/whatsapp-client/whatsapp-client.service.ts` — Added `logger.debug({ payload }, 'WhatsApp request payload to Meta API')` before the HTTP POST call. Uses Pino structured logging (object-first argument) so the full JSON payload is inspectable in debug logs.

### Feature: Support named parameters (parameter_name) for WhatsApp Meta templates (2026-03-02)

#### libs/common/
- `src/dto/send-request.dto.ts` — Added `TemplateParameterDto` class (`name: string`, `value: string`). Changed `MetadataDto.templateParameters` from `@IsString({ each: true }) string[]` to `@ValidateNested({ each: true }) @Type(() => TemplateParameterDto) TemplateParameterDto[]`.
- `src/dto/send-request.dto.spec.ts` — Added `TemplateParameterDto` validation tests (5 tests) and `MetadataDto — templateParameters` tests (3 tests: object array valid, string array rejected, omitted allowed).
- `src/index.ts` — Added `TemplateParameterDto` to barrel exports.

#### apps/adapter-whatsapp/
- `src/whatsapp-client/interfaces/whatsapp.interfaces.ts` — Added optional `parameter_name?: string` to `WhatsAppTemplateParameter` interface.
- `src/send/send.service.ts` — Updated `buildTemplateFromMetadata()` to emit `{ type: 'text', parameter_name: param.name, text: param.value }` per parameter. Comma-separated body fallback remains positional (no `parameter_name`).
- `test/send-order-delay.e2e-spec.ts` — Updated request payloads to `[{ name, value }]` format. Updated Meta API assertions to include `parameter_name`.
- `test/send.e2e-spec.ts` — Updated metadata-based template test payloads and assertions to `[{ name, value }]` format with `parameter_name`. Comma-separated body fallback test unchanged.

### Bugfix: WhatsApp adapter SSL certificate error behind corporate proxy (2026-03-02)

#### apps/adapter-whatsapp/
- `src/config/env.validation.ts` — Added `WHATSAPP_TLS_REJECT_UNAUTHORIZED` as `@IsOptional()` `@IsString()` field with default `'true'`. Uses `@IsString()` instead of `@IsBoolean()` because `enableImplicitConversion: true` in `plainToInstance` converts `'false'` via `Boolean('false')` → `true`, and `@nestjs/config` writes validated values back to `process.env`, corrupting the original string value.
- `src/config/whatsapp.config.ts` — Exposed `tlsRejectUnauthorized: boolean` from `WHATSAPP_TLS_REJECT_UNAUTHORIZED` env var (string `'false'` disables verification, default `true`).
- `src/whatsapp-client/whatsapp-client.module.ts` — Converted `HttpModule.register()` to `HttpModule.registerAsync()` with injected `ConfigService`. Creates `https.Agent` with `rejectUnauthorized` controlled by `whatsapp.tlsRejectUnauthorized` config. All HTTP requests (sendMessage, getPhoneNumberInfo) inherit the agent automatically.
- `.env` — Added `WHATSAPP_TLS_REJECT_UNAUTHORIZED=false` for local development behind corporate proxy.

### Feature: WHATSAPP_TEST_MODE environment variable (2026-03-02)

#### apps/adapter-whatsapp/
- `src/config/env.validation.ts` — Added `WHATSAPP_TEST_MODE` as `@IsOptional()` `@IsBoolean()` field with default `false` (implicit conversion via `class-transformer`).
- `src/config/whatsapp.config.ts` — Exposed `testMode: boolean` from `WHATSAPP_TEST_MODE` env var (string `'true'` → boolean, default `false`).
- `src/send/send.service.ts` — Added `testMode` property read from `whatsapp.testMode` config. When `testMode === true`, `buildMessage()` short-circuits and returns a static `hello_world` template payload (preserves only the `to` phone number). Emits `logger.warn()` on every test-mode send.
- `.env` — Added `WHATSAPP_TEST_MODE=true` for local development.

#### docs/
- `adapter-whatsapp.md` — Added "Test Mode" section documenting the feature, static payload, usage guidance, and production warning. Added `WHATSAPP_TEST_MODE` to the Environment Variables table.

### Added: Technical implementation reference documentation (2026-03-01)

- `tech-provider-adapters-v1.md` — Technical implementation reference documentation

### Feature: Template metadata support for WhatsApp template messages (2026-03-01)

#### libs/common/
- `src/dto/send-request.dto.ts` — Added 3 optional fields to `MetadataDto`: `templateName` (string), `templateLanguage` (string), `templateParameters` (string[]). All fields have `@IsOptional()` + appropriate class-validator decorators. Existing flows (email/Mailgun) are unaffected — fields are purely additive.

#### apps/adapter-whatsapp/
- `src/send/send.service.ts` — Updated `buildMessage()` to check `metadata.templateName` first (Priority 1) before legacy `subject.startsWith('template:')` detection (Priority 2). Added `buildTemplateFromMetadata()` method that builds `WhatsAppTemplateMessage` from explicit metadata fields, with fallback to comma-separated body parsing when `templateParameters` is absent. Legacy flow preserved for backward compatibility.
- `test/send.e2e-spec.ts` — Added 4 E2E tests for metadata-based template flow: explicit parameters, default language, comma-separated body fallback, and metadata priority over subject prefix.

### 2026-03-01 — Phase 1: adapter-whatsapp Send Pipeline + Health (POST /send, GET /health, GET /capabilities)

#### apps/adapter-whatsapp/ — WhatsApp (Meta Cloud API) Adapter Application
- **main.ts:** Bootstrap with Pino logger, DtoValidationPipe, HttpExceptionFilter, LoggingInterceptor, CORS, port 3173
- **app.module.ts:** WhatsAppConfigModule, LoggerModule, MetricsModule, HealthModule, SendModule
- **config/:** `WhatsAppConfigModule` (ConfigModule.forRoot isGlobal), `whatsapp.config.ts` (registerAs 'whatsapp': port, accessToken, phoneNumberId, appSecret, webhookVerifyToken, apiVersion v22.0, defaultTemplateLanguage, baseUrl), `rabbitmq.config.ts` (registerAs 'rabbitmq'), `env.validation.ts` (class-validator for META_* and RABBITMQ_* env vars)
- **errors/:** `WHATSAPP_ERROR_CODES` (10 WA-prefixed codes + inherited PA- base codes): WA-001 invalid request, WA-002 API unavailable, WA-003 send failed, WA-004 invalid token, WA-005 invalid phone, WA-006 template not found, WA-007 rate limit, WA-008 template param mismatch, WA-009 policy violation, WA-010 conversation window expired

#### whatsapp-client/ — Meta Cloud API HTTP Client
- **WhatsAppClientModule:** Imports HttpModule (10s timeout), provides WhatsAppClientService
- **WhatsAppClientService:** Low-level HTTP client for Meta Graph API v22.0:
  - `sendMessage(payload)` — POST to `{baseUrl}/messages` with Bearer token (JSON, not form-data)
  - `getPhoneNumberInfo()` — GET `{baseUrl}?fields=verified_name,quality_rating,platform_type` (for health checks)
- **Interfaces:** `WhatsAppTextMessage`, `WhatsAppTemplateMessage`, `WhatsAppMediaMessage`, `WhatsAppApiResponse`, `WhatsAppApiError`, `WhatsAppApiErrorResponse`

#### send/ — Send Pipeline
- **SendModule:** Imports WhatsAppClientModule, provides SendService, ErrorClassifierService, SendController
- **SendService:** Orchestrates the WhatsApp send pipeline:
  1. Channel validation (whatsapp only, rejects email/sms/push)
  2. Phone number formatting: strips leading `+` (Meta requires E.164 without `+`)
  3. Message type detection via `content.subject`:
     - `template:name` or `template:name:language` → template message
     - Has `content.media` → media message (image/document/video URL passthrough)
     - Default → text message
  4. Template params from comma-separated `content.body`
  5. Call WhatsAppClientService.sendMessage() (JSON payload)
  6. Extract `providerMessageId` from `response.messages[0].id`
  7. Prometheus metrics: adapter_send_total, adapter_send_duration_seconds, adapter_send_errors_total (providerId: `meta-whatsapp`)
- **ErrorClassifierService:** Two-level error classification:
  - Level 1 — Meta error codes: 130429→rate limit/retryable, 131026→not on WhatsApp, 131047→window expired, 131051→unsupported type, 132000→template not found, 132012→param mismatch, 135000→generic/retryable, 368→policy violation
  - Level 2 — HTTP status fallback: 400→WA-005, 401→WA-004, 403→WA-009, 429→WA-007/retryable, 500/502/503→WA-002/retryable
- **SendController:** POST /send with @HttpCode(200) — always returns 200 with SendResultDto body (success/failure + retryable flag)

#### health/ — Health Checks
- **HealthModule:** Imports WhatsAppClientModule, provides WhatsAppHealthService + HealthController
- **HealthController:** GET /health (delegates to WhatsAppHealthService), GET /capabilities (providerId: meta-whatsapp, channels: [whatsapp], supportsMediaUrls: true, maxAttachmentSizeMb: 16, maxRecipientsPerRequest: 1)
- **WhatsAppHealthService:** Extends BaseHealthService, calls `getPhoneNumberInfo()` for connectivity check, includes verifiedName and qualityRating in health details

#### Monorepo Configuration
- Updated `nest-cli.json` with adapter-whatsapp project entry
- Updated `package.json` with build:whatsapp, start:dev:whatsapp, start:debug:whatsapp, start:prod:whatsapp, test:e2e:whatsapp scripts
- Updated `.env` META_API_VERSION from v21.0 to v22.0

#### Testing
- 4 E2E test files: jest-e2e.json, test-utils.ts, app.e2e-spec.ts (health/capabilities/metrics), send.e2e-spec.ts (template/text/language override/non-whatsapp channel/validation/429 rate limit/401 auth/shape)

---

### Bugfix: TypeScript isolatedModules compilation errors (2026-02-27)

- **libs/common/src/index.ts:** Changed `export { ErrorResponse }` to `export type { ErrorResponse }` and separated `ErrorDefinition` into its own `export type` statement (TS1205: re-exporting a type requires `export type` when `isolatedModules` is enabled)
- **apps/adapter-mailgun/src/webhooks/webhooks.controller.ts:** Changed `import { MailgunWebhookPayload }` to `import type { MailgunWebhookPayload }` (TS1272: type in decorated signature must use `import type` when `isolatedModules` and `emitDecoratorMetadata` are enabled)

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
