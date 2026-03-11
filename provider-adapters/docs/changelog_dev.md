# Provider Adapter Services — Development Changelog

> **Info:** This file tracks **code changes only** for the provider adapter services. Design and documentation changes are tracked in `../../docs/06-changelog.md`.

---

## [Unreleased]

### Feature: Include Meta API payload in adapter-whatsapp providerResponse (2026-03-10)

- `apps/adapter-whatsapp/src/send/send.service.ts` — `providerResponse` now returns `{ sentPayload: WhatsAppMessage, apiResponse: MetaApiResponse }` on success, and `{ sentPayload: WhatsAppMessage }` on error (if the message was built before the error). Exposes the actual Meta Cloud API request payload (template name, parameters, phone number, message type) for debugging in the admin UI.

### Feature: adapter-aws-ses Phase 3 — API Mode Send, Dual-Mode Support, Final Integration (2026-03-10)

#### apps/adapter-aws-ses/ — Phase 3 API Mode & Dual-Mode

##### ses-client/ — Dual-Mode Client Architecture
- **SesApiClientService** (`ses-api-client.service.ts`): New API mode client using `@aws-sdk/client-sesv2` `SESv2Client`:
  - `sendEmail()`: Simple email via `SendEmailCommand` (HTML/text, subject, replyTo, EmailTags from X-headers, ConfigurationSetName)
  - Raw MIME email with attachments via `Content.Raw` (multipart/mixed boundary construction, Base64-encoded attachment parts, custom headers)
  - `getAccountInfo()`: Calls `GetAccountCommand` returning sending quota (MaxSendRate, Max24HourSend, SentLast24Hours, SendingEnabled)
  - `checkConnectivity()`: Health check via GetAccount with quota details in response
  - Initialized with region, IAM credentials (optional — supports instance roles), timeout config
- **SesClientInterface** (`interfaces/ses.interfaces.ts`): Abstract interface (`sendEmail`, `checkConnectivity`) implemented by both SMTP and API clients
  - New types: `SesApiResponse`, `SesAccountInfo`, `SesSendResult`, `SES_CLIENT` injection token
- **SesSmtpClientService**: Updated to implement `SesClientInterface` with new `checkConnectivity()` method
- **SesClientFactoryService** (`ses-client-factory.service.ts`): Factory reads `SES_MODE` config, returns SMTP or API client. Throws on invalid mode.
- **SesClientModule**: Updated to provide `SES_CLIENT` token via factory pattern, exports both client services

##### send/ — Dual-Mode Send Pipeline
- **SendService**: Refactored to inject `SES_CLIENT` token (interface-based) instead of direct `SesSmtpClientService` reference
  - Dynamic attachment size limit: 40 MB (SMTP) / 10 MB (API) based on `SES_MODE`
- **ErrorClassifierService**: Added AWS SDK error type classification (checked before message-based patterns):
  - `ThrottlingException` / `TooManyRequestsException` → retryable SES-006 (429)
  - `MessageRejected` → non-retryable SES-007 (400)
  - `AccountSendingPausedException` → non-retryable SES-008 (403)
  - `MailFromDomainNotVerifiedException` → non-retryable SES-005 (400)
  - `NotFoundException` / `BadRequestException` → non-retryable SES-007 (400)
  - Generic `$metadata.httpStatusCode >= 500` → retryable SES-002 (503)

##### health/ — Dual-Mode Health Check
- **SesHealthService**: Refactored to inject `SES_CLIENT` token; delegates to `checkConnectivity()` (SMTP: verifyConnection, API: GetAccount with quota details)
- **HealthController**: `GET /capabilities` now returns dynamic `maxAttachmentSizeMb` (10 for API, 40 for SMTP) based on `SES_MODE`

##### Dependencies
- Added `@aws-sdk/client-sesv2` to `package.json`

##### Tests
- **New unit tests** (2 new suites):
  - `ses-api-client.service.spec.ts`: 18 tests — simple send, raw MIME attachments, configuration set, EmailTags, getAccountInfo, checkConnectivity, error propagation
  - `ses-client-factory.service.spec.ts`: 4 tests — SMTP/API client selection, invalid mode, default mode
- **Updated unit tests** (3 suites):
  - `send.service.spec.ts`: Updated mock to use `SesClientInterface` shape
  - `error-classifier.service.spec.ts`: Added 9 tests for AWS SDK error types (ThrottlingException, TooManyRequestsException, MessageRejected, AccountSendingPausedException, MailFromDomainNotVerifiedException, NotFoundException, BadRequestException, 5xx server errors)
  - `ses-health.service.spec.ts`: Rewritten with `checkConnectivity` mock — SMTP mode, API mode with quota details, error handling
  - `health.controller.spec.ts`: Added API mode `maxAttachmentSizeMb=10` test
- **Updated E2E tests**:
  - `test-utils.ts`: Refactored with `createMockSesClient()`, `createMockNodemailerTransporter()`, `createMockSESv2Client()` shared factories; `SES_CLIENT` override
  - `send.e2e-spec.ts`: Added ThrottlingException and MessageRejected E2E scenarios
  - `app.e2e-spec.ts`: Updated to use new test-utils pattern
- **Total: 170 unit tests / 13 suites, 20 E2E tests / 3 suites**

### Feature: adapter-braze Phase 4 — Webhooks (Postbacks + Currents), Final Polish & Full E2E (2026-03-09)

#### libs/common/
- `src/dto/webhook-event.dto.ts` — Extended `WebhookEventType` enum with 5 new values: `SENT`, `READ`, `RECEIVED`, `TEMP_FAIL`, `SPAM_COMPLAINT`. Required for Braze multi-channel webhook normalization (WhatsApp read receipts, push send confirmations, SMS inbound, email soft bounces, spam reports).

#### apps/adapter-braze/ — Phase 4 Webhook Processing

##### webhooks/interfaces/ — Braze Webhook Interfaces
- `BrazePostbackPayload` — Individual transactional postback event (event_type, dispatch_id, message_id, external_user_id, email_address, phone_number, device_id, timestamp, key_value_pairs, message_extras)
- `BrazeCurrentsPayload` — Batched Currents events wrapper (events array)
- `BrazeCurrentsEvent` — Individual Currents event (epoch timestamp, properties for custom data)
- `BrazeWebhookPayload` — Union type (postback | currents)

##### webhooks/ — Webhook Processing Pipeline
- **WebhooksModule:** Imports `AppRabbitMQModule`, provides verification/normalizer/service/controller
- **WebhookVerificationService:** Verifies Braze webhooks via shared secret:
  - Compares `X-Braze-Webhook-Key` header against `BRAZE_WEBHOOK_KEY` env var
  - Constant-time comparison using `crypto.timingSafeEqual`
  - Length pre-check to prevent `timingSafeEqual` crash on mismatched lengths
  - Increments `adapter_webhook_verification_failures_total` metric on failure
- **WebhookNormalizerService:** Maps 16 Braze event types to `WebhookEventDto`:
  - Email (7): Delivery→DELIVERED, Bounce→BOUNCED, SoftBounce→TEMP_FAIL, Open→OPENED, Click→CLICKED, SpamReport→SPAM_COMPLAINT, Unsubscribe→UNSUBSCRIBED
  - SMS (3): Delivery→DELIVERED, Rejection→BOUNCED, InboundReceive→RECEIVED
  - WhatsApp (4): Send→SENT, Delivery→DELIVERED, Read→READ, Failure→FAILED
  - Push (2): pushnotification.Send→SENT, pushnotification.Open→OPENED
  - Extracts `providerMessageId` from `dispatch_id` (fallback: `message_id`)
  - Extracts `recipientAddress` from `email_address` / `phone_number` / `device_id`
  - Extracts `notificationId` from `key_value_pairs` or `message_extras` (postbacks) / `properties` (Currents)
  - Sets `providerId: 'braze'`
  - Returns `null` for unknown event types (logged as warning, skipped)
  - Currents epoch timestamps (seconds) converted to ISO-8601
- **WebhooksService:** Pipeline orchestrator:
  1. Verify shared secret → on failure: log warning, return (no throw)
  2. Detect payload type: postback (single event) vs Currents (events array)
  3. Normalize → publish to RabbitMQ (fire-and-forget via `RabbitMQPublisherService`, routing key `adapter.webhook.braze`)
  4. Record metrics per event (`adapter_webhook_received_total`)
  - Currents batch: iterates all events, skips unknown types, continues on publish failure
  - RabbitMQ failures: logged + metric incremented, do not throw
- **WebhooksController:** `POST /webhooks/inbound`:
  - Always returns `200 { status: 'ok' }` — never throws (stops Braze retries)
  - Extracts `X-Braze-Webhook-Key` header for verification
  - Verification failure: logged but still returns 200

##### Integration
- Updated `app.module.ts` to import `WebhooksModule`
- Updated `test/test-utils.ts` to include `WebhooksModule` in E2E test app

#### Testing
- 55 unit tests across 3 suites:
  - `webhook-verification.service.spec.ts` — valid key, invalid key (wrong/empty/single-char diff), missing header (undefined/null), timing-safe comparison (last/first char, length mismatch), unconfigured webhook key
  - `webhook-normalizer.service.spec.ts` — all 16 event type mappings (7 email, 3 SMS, 4 WhatsApp, 2 push), unknown event type handling, field extraction (dispatch_id/message_id fallback, email/phone/device recipient, timestamp, notificationId from key_value_pairs/message_extras/properties, metadata), Currents epoch conversion, missing fields graceful handling
  - `webhooks.service.spec.ts` — happy path postback, verification failure (no publish), batch Currents (3 events), skip unknown in batch, RabbitMQ failure (fire-and-forget resolve), batch with individual publish failure, unknown postback event, empty batch, metrics labels
- 11 E2E tests in `test/webhooks.e2e-spec.ts`:
  - Valid postback (full field verification), invalid key (200 but no publish), missing key header (200 but no publish), Currents batch (3 events, multi-channel), event normalization (email.Bounce→bounced, whatsapp.Send→sent, pushnotification.Open→opened), unknown event type, metrics counter verification

#### Endpoints Updated
- `endpoints/endpoints-provider-adapters.md` — Braze `POST /webhooks/inbound` status updated to Done. All Braze endpoints now Done.

### Feature: adapter-braze Phase 3 — WhatsApp + Push Channels (2026-03-09)

#### apps/adapter-braze/ — WhatsApp & Push Channel Support

##### braze-client/interfaces/ — New Interfaces
- `BrazeWhatsAppMessage`, `BrazeWhatsAppMessageBody`, `BrazeWhatsAppVariable`, `BrazeWhatsAppHeader` — WhatsApp template message types
- `BrazeApplePushMessage`, `BrazeAndroidPushMessage` — iOS and Android push message types
- `BrazeSendPayload.messages` — Extended with `whatsapp?`, `apple_push?`, `android_push?` fields

##### send/ — Extended Send Pipeline
- **SendService:** Extended to support all 4 channels (email, sms, whatsapp, push):
  - `SUPPORTED_CHANNELS` updated from `[email, sms]` to `[email, sms, whatsapp, push]`
  - `buildWhatsAppMessage()` — Builds `messages.whatsapp` with `subscription_group_id` from `BRAZE_WHATSAPP_SUBSCRIPTION_GROUP`, `message_type: 'template_message'`, maps `metadata.templateName` → `template_name`, `metadata.templateLanguage` → `template_language_code`, `metadata.templateParameters` → Braze `variables` array (`{ key, value }`). IMAGE media headers included when first media item is image type. Throws `isMissingConfig` error (→ BZ-010) if subscription group missing.
  - `buildApplePushMessage()` — Builds `messages.apple_push` with `alert: { title, body }`, `mutable_content` + `media_url` when media present.
  - `buildAndroidPushMessage()` — Builds `messages.android_push` with `title`, `alert`, `image_url` when media present.
  - Push sends both `apple_push` and `android_push` simultaneously (Braze delivers to whichever platform the user has).

#### Testing
- 24 unit tests across 1 suite (Phase 2: 16 → Phase 3: +8 tests):
  - WhatsApp template send (with parameters, with IMAGE media, without media, non-image media ignored)
  - WhatsApp missing subscription group → failure
  - Push send (both platforms, with media, without media)
- 18 E2E tests across 2 files (Phase 2: 13 → Phase 3: +5 tests):
  - WhatsApp template send, payload structure, IMAGE header with media
  - WhatsApp missing subscription group → failure
  - Push send, dual platform payload, push with media

### Feature: adapter-braze Phase 2 — Braze HTTP Client, Email Hashing & Send Pipeline (Email + SMS) (2026-03-09)

#### libs/common/
- `src/dto/send-request.dto.ts` — Added optional `customerId?: string` field to `RecipientDto` (decorated with `@IsOptional()`, `@IsString()`). Carries Braze `external_id` (hashed email). Other adapters (Mailgun, WhatsApp) unaffected — field is purely additive.

#### apps/adapter-braze/ — Phase 2 Modules

##### braze-client/ — Braze REST API HTTP Client
- **BrazeClientModule:** Imports `HttpModule.registerAsync` with configurable timeout from `braze.timeoutMs`, provides `BrazeClientService`
- **BrazeClientService:** Low-level HTTP client for Braze REST API:
  - `sendMessage(payload)` — POST to `{BRAZE_REST_ENDPOINT}/messages/send` with Bearer auth. Checks response `errors` array even on 201 (throws with `isBrazePartialError` flag for 201-with-errors).
  - `trackUser(payload)` — POST to `{BRAZE_REST_ENDPOINT}/users/track` for profile upsert.
- **Interfaces:** `BrazeEmailMessage`, `BrazeSmsMessage`, `BrazeSendPayload`, `BrazeSendResponse`, `BrazeError`, `BrazeUserAttribute`, `BrazeTrackPayload`, `BrazeTrackResponse`, `BrazeAttachment`, `BrazeSmsMediaItem`

##### hashing/ — Email Hashing Service
- **HashingModule:** Provides `HashingService`, `HashingController`
- **HashingService:** SHA-256 email hashing with pepper:
  - `normalizeEmail(email)` — Trim, NFKC normalization, lowercase
  - `hashEmail(email)` — `sha256(pepper + normalize(email))` → 64-char hex digest
  - Pepper cached in-memory with configurable TTL from `PEPPER_CACHE_TTL`
- **HashingController:** `POST /v1/customers/hash-email` — Accepts `{ email }`, returns `{ emailHash, algo, algoVersion, normalizedEmail }`
- **DTOs:** `HashEmailRequestDto` (with `@IsEmail()`), `HashEmailResponseDto`

##### profile-sync/ — Just-in-Time Profile Sync with LRU Cache
- **ProfileSyncModule:** Imports `BrazeClientModule`, `HashingModule`, provides `ProfileSyncService`
- **ProfileSyncService:** `ensureProfile(recipient, channel)` → returns `external_id`:
  - **Sync enabled** (`BRAZE_PROFILE_SYNC_ENABLED=true`): Hash email → check LRU cache → on miss, call `/users/track` (set email for email channel, phone for SMS/WhatsApp) → cache with TTL. Throws BZ-006 on sync failure.
  - **Sync disabled** (pre-provisioned): Use `recipient.customerId` directly. Throws BZ-007 if missing.
  - LRU cache: `lru-cache` npm package, max 10,000 entries, TTL from `BRAZE_PROFILE_CACHE_TTL_SECONDS`

##### send/ — Send Pipeline (Email + SMS)
- **SendModule:** Imports `BrazeClientModule`, `ProfileSyncModule`, provides `SendService`, `ErrorClassifierService`, `SendController`
- **SendService:** Orchestrates Braze send pipeline:
  1. Channel validation (email, sms — WhatsApp/push not yet implemented)
  2. Profile sync via `ProfileSyncService.ensureProfile()`
  3. Build channel-specific Braze payload (email: subject, body, from, attachments, extras; SMS: body, subscription_group_id, media_items)
  4. Call `BrazeClientService.sendMessage()`
  5. Extract `dispatch_id` as `providerMessageId`
  6. Prometheus metrics: `adapter_send_total`, `adapter_send_duration_seconds`, `adapter_send_errors_total` (providerId: `braze`)
  - Email `from` format: `"${BRAZE_FROM_NAME} <${BRAZE_FROM_EMAIL}>"`
  - Email attachments mapped from `content.media[]` → `{ file_name, url }`
  - Email extras: `notificationId`, `correlationId` from metadata
  - SMS requires `BRAZE_SMS_SUBSCRIPTION_GROUP` (throws if missing)
- **ErrorClassifierService:** Classifies Braze errors:
  - 201-with-errors → BZ-007 non-retryable (detected via `isBrazePartialError` flag)
  - 400 → BZ-001 non-retryable, 401 → BZ-003 non-retryable, 429 → BZ-004 retryable, 500/503 → BZ-002 retryable
  - Network errors (ECONNREFUSED/ENOTFOUND/ETIMEDOUT/ECONNRESET/ECONNABORTED) → BZ-002 retryable
  - Unknown → PA-003
- **SendController:** `POST /send` with `@HttpCode(200)` — always returns 200 with `SendResultDto` body

#### app.module.ts
- Added imports: `HashingModule`, `SendModule`

#### Dependencies
- Added `lru-cache` npm package for profile sync LRU cache

#### Testing
- 63 unit tests across 7 suites:
  - `hashing.service.spec.ts` — normalization (trim, lowercase, NFKC), deterministic output, different peppers produce different hashes, pepper caching
  - `hashing.controller.spec.ts` — hash-email endpoint response fields
  - `braze-client.service.spec.ts` — sendMessage auth/URL/response, 201-with-errors detection, error propagation, timeout handling, trackUser
  - `profile-sync.service.spec.ts` — cache hit, cache miss with sync, disabled mode, sync failure, no-cache-on-failure
  - `send.service.spec.ts` — email success, SMS success, payload building, attachments, extras, unsupported channel, profile sync failure, Braze API errors (retryable/non-retryable), metrics, missing SMS subscription group
  - `send.controller.spec.ts` — delegation, unexpected error handling
  - `error-classifier.service.spec.ts` — all HTTP status mappings, 201-with-errors, network errors, axios errors without response
- 13 E2E tests across 2 files:
  - `app.e2e-spec.ts` — health, capabilities, metrics (Phase 1)
  - `send.e2e-spec.ts` — email send, SMS send, validation errors (missing recipient, missing body, invalid channel), unsupported channel (whatsapp, push), response shape, Braze 429 retryable, Braze 401 non-retryable

### Feature: adapter-braze Phase 1 scaffold — Health, Capabilities, Metrics (2026-03-09)

#### Monorepo Registration
- `nest-cli.json` — Added adapter-braze project entry (type: application, entryFile: main, sourceRoot: apps/adapter-braze/src)
- `package.json` — Added npm scripts: build:braze, start:dev:braze, start:debug:braze, start:prod:braze, test:e2e:braze

#### apps/adapter-braze/ — Braze Multi-Channel Adapter Application
- **main.ts:** Bootstrap with Pino logger, DtoValidationPipe, HttpExceptionFilter, LoggingInterceptor, CORS, port 3172
- **app.module.ts:** BrazeConfigModule, LoggerModule, MetricsModule, HealthModule
- **config/:** `BrazeConfigModule` (ConfigModule.forRoot isGlobal), `braze.config.ts` (registerAs 'braze': port, nodeEnv, apiKey, restEndpoint, appId, webhookKey, fromEmail, fromName, smsSubscriptionGroup, whatsappSubscriptionGroup, profileSyncEnabled, profileCacheTtlSeconds, timeoutMs, emailHashPepper, pepperCacheTtl), `rabbitmq.config.ts` (registerAs 'rabbitmq'), `env.validation.ts` (class-validator: required — BRAZE_API_KEY, BRAZE_REST_ENDPOINT, BRAZE_APP_ID, BRAZE_WEBHOOK_KEY, BRAZE_FROM_EMAIL, EMAIL_HASH_PEPPER; optional with defaults — the rest)
- **errors/:** `BRAZE_ERROR_CODES` (10 BZ-prefixed codes + inherited PA- base codes): BZ-001 invalid request, BZ-002 API unavailable, BZ-003 authentication failed, BZ-004 rate limited, BZ-005 unsupported channel, BZ-006 profile sync failed, BZ-007 user not found, BZ-008 webhook verification failed, BZ-009 invalid webhook payload, BZ-010 missing subscription group
- **health/:** `HealthModule` (imports HttpModule), `HealthController` (GET /health, GET /capabilities), `BrazeHealthService` (extends BaseHealthService, calls GET `{BRAZE_REST_ENDPOINT}/email/hard_bounces?limit=0` with Bearer API key for connectivity check)
- **GET /capabilities** returns: providerId 'braze', channels ['email', 'sms', 'whatsapp', 'push'], supportsMediaUrls true, supportsAttachments false, maxRecipientsPerRequest 50, webhookPath '/webhooks/inbound'
- **.env.example:** All 14 Braze env vars + 5 RabbitMQ env vars documented

#### Testing
- E2E test setup: jest-e2e.json, test-utils.ts (createTestApp with HealthModule), app.e2e-spec.ts (GET /health shape, GET /capabilities returns correct channels/features, GET /metrics returns Prometheus format)

### Documentation: Improve Braze adapter design document (2026-03-06)

#### docs/
- `adapter-braze.md` — Major rewrite with three new sections and corrected API mappings:
  - **Braze External ID — Deep Dive:** Explains what `external_id` is, how it differs from `braze_id`/`user_alias`, mapping to our `customerId`, user existence prerequisite, and the DTO gap (planned `customerId` addition to `RecipientDto`).
  - **Braze Particularities & Strategy:** Documents user existence prerequisite (vs fire-and-forget providers), `app_id` requirement for all channels, subscription group management, WhatsApp differences (Braze structured `message_type`+`message` vs Meta native API), media limitations (IMAGE only for WhatsApp templates via API), multi-channel from single adapter, email `from` field format.
  - **Profile Sync Module:** Expanded with strategy comparison table (just-in-time vs pre-provisioned), trade-offs, and detailed flows for both strategies.
  - **Corrected Send Mappings:** Fixed all four channel mappings — `external_user_ids` (not `external_ids`), `app_id` added to all channels, WhatsApp uses `message_type`+`message` structure, email includes `from` format, SMS includes `media_items` for MMS. Added example JSON payloads for email, SMS, WhatsApp template, and WhatsApp text.
  - **Corrected Rate Limits:** Updated `/users/track` from 50,000/min to 3,000/3s per current Braze docs.
  - Added warning about Braze 201 responses with errors array (silent failures).
  - Added `BRAZE_FROM_EMAIL` and `BRAZE_FROM_NAME` to environment variables table.

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
