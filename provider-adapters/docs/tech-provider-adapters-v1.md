# Provider Adapter Services — Technical Reference v1

> This is a convenience copy. The authoritative version is at `../../docs/17-provider-adapters.md`.

## 1. Overview

| Attribute | Value |
|---|---|
| **Structure** | NestJS monorepo (`apps/` + `libs/common/`) |
| **Technology** | NestJS 11, TypeScript 5.7, Node.js (ES2023) |
| **Database** | None (stateless — no DB) |
| **Status** | adapter-mailgun Phase 3 complete; adapter-whatsapp Phase 1 complete; adapter-braze and adapter-aws-ses scaffolding only |
| **Unit Tests** | 204+ across 28 suites (mailgun) + additional for whatsapp |
| **E2E Tests** | 17 (mailgun, 3 files) + 4 (whatsapp, separate files) |

NestJS monorepo containing 4 stateless provider adapter microservices. Each adapter is a **dumb pipe**: it receives pre-rendered notification content from the channel-router-service via a standardized HTTP contract, translates it to the provider's native API format, and returns a structured result. Adapters also handle inbound provider webhooks (verify signature, normalize event, publish to RabbitMQ).

### Adapters

| Adapter | Port | Provider | Channels | Status |
|---|---|---|---|---|
| `adapter-mailgun` | 3171 | Mailgun | Email | Phase 3 complete |
| `adapter-braze` | 3172 | Braze | Email, SMS, WhatsApp, Push | Scaffolding only |
| `adapter-whatsapp` | 3173 | WhatsApp (Meta Cloud API) | WhatsApp | Phase 1 complete |
| `adapter-aws-ses` | 3174 | AWS SES | Email | Scaffolding only |

> **WhatsApp routing conflict:** Both `adapter-whatsapp` and `adapter-braze` support WhatsApp. Only one can be active at a time — controlled via the `isActive` flag on the provider registration in channel-router-service.

---

## 2. Architecture

### Monorepo Structure

```
provider-adapters/
  apps/
    adapter-mailgun/     # Port 3171
    adapter-whatsapp/    # Port 3173
    adapter-braze/       # Port 3172 (scaffolding)
    adapter-aws-ses/     # Port 3174 (scaffolding)
  libs/
    common/              # Shared library: DTOs, errors, metrics, RabbitMQ, health base
```

### Standardized HTTP Contract

All adapters implement the same 4 endpoints:

| Endpoint | Purpose |
|---|---|
| `POST /send` | Accept pre-rendered content, deliver via provider API, return `SendResultDto` |
| `GET /health` | Liveness + provider connectivity check, return `AdapterHealthResponseDto` |
| `GET /capabilities` | Return adapter capabilities (channels, attachment support, limits) |
| `POST /webhooks/inbound` | Receive provider callbacks, verify signature, normalize, publish to RabbitMQ |

### Layered Architecture (Simplified — no repositories)

```
Controllers (implement standardized contract)
    ↓
Services (provider-specific translation + API calls)
```

### Shared Library (`libs/common/src/`)

| Component | Description |
|---|---|
| `SendRequestDto` | Standardized inbound payload from channel-router |
| `SendResultDto` | Standardized outbound result |
| `WebhookEventDto` + `WebhookEventType` | Normalized webhook event shape |
| `AdapterHealthResponseDto` | Health check response shape |
| `AdapterCapabilitiesResponseDto` | Capabilities response shape |
| `BASE_ERROR_CODES` | 7 `PA-` prefixed base error codes |
| `HttpExceptionFilter` | `@Catch(HttpException)` global filter |
| `DtoValidationPipe` | `PA-001` wrapped validation pipe |
| `LoggingInterceptor` | Structured HTTP logging (Pino) |
| `MetricsModule` | `@Global()` — 7 prom-client metrics + `GET /metrics` |
| `AppRabbitMQModule` | Optional RabbitMQ connection (fire-and-forget publisher) |
| `RabbitMQPublisherService` | `publishWebhookEvent()` — null-safe, publish-only |
| `BaseHealthService` | Abstract health assembler |

---

## 3. Features & Functionality

### 3.1 adapter-mailgun (Port 3171) — Phase 3 Complete

#### Send Pipeline (`SendService`)

1. Validate `channel === 'email'` (throws `MG-001`)
2. Build attachment array: download Base64 or use URL, graceful degradation on failure
3. Build Mailgun `multipart/form-data` via `MailgunClientService.buildFormData()`:
   - Custom variables: `v:notificationId`, `v:correlationId`, `v:cycleId`
   - Custom headers: `h:X-Notification-Id`
   - Recipient format: `"Name <email>"` if name provided
   - HTML detection: sets `html` or `text` field appropriately
   - `fromAddress` override if provided in request
   - `Reply-To` header if provided
4. `MailgunClientService.sendMessage()` → Mailgun v3 REST API
5. `ErrorClassifierService.classify()` → HTTP status → `{ retryable, errorCode }`
6. Return `SendResultDto` with `success`, `providerMessageId`, `retryable`, `errorCode`

#### Webhook Pipeline (`WebhooksService`)

1. `WebhookVerificationService.verify()` — HMAC-SHA256 using `MAILGUN_WEBHOOK_SIGNING_KEY`:
   - Signs `timestamp + token` with SHA256-HMAC
   - Timing-safe comparison via `crypto.timingSafeEqual()`
   - 5-minute replay protection: rejects if `|now - timestamp| > 300s`
2. `WebhookNormalizerService.normalize()` — maps 7 Mailgun event types → `WebhookEventType`
3. `RabbitMQPublisherService.publishWebhookEvent()` — fire-and-forget to `xch.notifications.status`
4. Update metrics

#### Mailgun Event Type Mapping

| Mailgun Event | `WebhookEventType` |
|---|---|
| `delivered` | `DELIVERED` |
| `failed` | `FAILED` |
| `bounced` | `BOUNCED` |
| `opened` | `OPENED` |
| `clicked` | `CLICKED` |
| `unsubscribed` | `UNSUBSCRIBED` |
| `complained` | `COMPLAINED` |

#### HTTP Client (`MailgunClientService`)

- Mailgun v3 REST API (`https://api.mailgun.net/v3/` or EU endpoint `https://api.eu.mailgun.net/v3/`)
- Region controlled by `MAILGUN_REGION` env var (`us`/`eu`)
- `sendMessage()` — POST to `/{domain}/messages` with `multipart/form-data`
- `getDomainInfo()` — GET to `/{domain}` for health check
- 10s HTTP timeout

### 3.2 adapter-whatsapp (Port 3173) — Phase 1 Complete

#### Send Pipeline (`SendService`)

1. Validate `channel === 'whatsapp'` (throws `WA-001`)
2. Strip leading `+` from recipient phone number
3. Detect message type via `content.subject` prefix:
   - Prefix `template:` → WhatsApp template message (comma-separated `body` as params)
   - Media content → WhatsApp media message (image/audio/video/document)
   - Otherwise → WhatsApp text message
4. `WhatsAppClientService.sendMessage()` → Meta Graph API `/{phoneNumberId}/messages`
5. `ErrorClassifierService.classify()` — two-level:
   - Level 1: Meta error codes (130429, 131026, 131047, 132000, 132012, 135000, 368)
   - Level 2: HTTP status fallback
6. Return `SendResultDto`

#### HTTP Client (`WhatsAppClientService`)

- Meta Cloud API Graph API v22.0 (`https://graph.facebook.com/v22.0`)
- Bearer token auth (`META_ACCESS_TOKEN`)
- `sendMessage()` — POST to `/{phoneNumberId}/messages`
- `getPhoneNumberInfo()` — GET to `/{phoneNumberId}` for health check

### 3.3 adapter-braze (Port 3172) — Scaffolding Only

Module structure exists; `POST /send`, `GET /health`, `GET /capabilities` are not implemented.

### 3.4 adapter-aws-ses (Port 3174) — Scaffolding Only

Module structure exists; `POST /send`, `GET /health`, `GET /capabilities` are not implemented.

---

## 4. Data Model

No database. All adapters are stateless.

---

## 5. RabbitMQ Integration

**Publish-only** — no consumers.

### Exchange

| Exchange | Type | Purpose |
|---|---|---|
| `xch.notifications.status` | Topic | Webhook event publishing |

### Routing Key Published

- `adapter.webhook.{providerId}` — e.g., `adapter.webhook.mailgun`, `adapter.webhook.meta-whatsapp`

### Message Shape

Adapters publish a normalized `WebhookEventDto`:

```typescript
interface WebhookEventDto {
  providerId: string;
  providerMessageId: string;
  eventType: WebhookEventType;  // DELIVERED, FAILED, BOUNCED, OPENED, CLICKED, UNSUBSCRIBED, COMPLAINED
  timestamp: string;            // ISO 8601
  notificationId?: string;      // extracted from provider custom variables
  correlationId?: string;
  cycleId?: string;
  metadata?: Record<string, unknown>;
}
```

> **Note:** RabbitMQ connection is optional. Adapters start and serve `POST /send`, `GET /health`, `GET /capabilities` normally if RabbitMQ is unavailable. Publish failures are logged and `pa_rabbitmq_publish_failures_total` metric is incremented.

---

## 6. REST API

### Standardized Endpoints (all adapters)

#### `POST /send`

Always returns HTTP `200` (success or failure indicated in body).

**Request (`SendRequestDto`):**
```json
{
  "notificationId": "uuid",
  "correlationId": "uuid",
  "cycleId": "order-123",
  "channel": "email",
  "recipient": {
    "email": "alice@example.com",
    "name": "Alice",
    "phone": "+1234567890"
  },
  "content": {
    "subject": "Order delayed",
    "body": "<html>...</html>",
    "textBody": "Order delayed"
  },
  "media": [
    { "url": "https://...", "filename": "invoice.pdf", "contentType": "application/pdf" }
  ],
  "metadata": {
    "fromAddress": "orders@example.com",
    "replyTo": "support@example.com",
    "templateName": "order-delay"
  }
}
```

**Response (`SendResultDto`):**
```json
{
  "success": true,
  "providerMessageId": "msg-abc123",
  "retryable": false,
  "errorCode": null,
  "errorMessage": null
}
```

#### `GET /health`

```json
{
  "status": "healthy",
  "providerId": "mailgun",
  "providerConnected": true,
  "latencyMs": 45
}
```

#### `GET /capabilities`

```json
{
  "providerId": "mailgun",
  "channels": ["email"],
  "supportsAttachments": true,
  "maxAttachmentSizeMb": 25,
  "maxRecipientsPerRequest": 1
}
```

#### `POST /webhooks/inbound`

- Returns `200 OK` on successful verification and processing
- Returns `401 Unauthorized` (`PA-004`) on signature verification failure

### Observability

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Liveness + provider connectivity |
| `GET` | `/capabilities` | Adapter capabilities |
| `GET` | `/metrics` | Prometheus metrics (text/plain) |

---

## 7. Service Integrations

| Direction | Service | Protocol | Purpose |
|---|---|---|---|
| Upstream | `channel-router-service` (:3154) | HTTP POST | Sends `POST /send` requests |
| Upstream | `notification-gateway` (:3150) | HTTP | Routes provider webhooks to `POST /webhooks/inbound` |
| Downstream | `audit-service` (:3156) | AMQP | Consumes webhook status events |
| Downstream | `notification-engine-service` (:3152) | AMQP | Consumes delivery confirmations |

---

## 8. Configuration

### Shared (all adapters)

| Variable | Type | Default | Description |
|---|---|---|---|
| `NODE_ENV` | string | — | Runtime environment |
| `RABBITMQ_HOST` | string | — | RabbitMQ host |
| `RABBITMQ_PORT` | number | `5672` | RabbitMQ AMQP port |
| `RABBITMQ_VHOST` | string | `vhnotificationapi` | Virtual host |
| `RABBITMQ_USER` | string | — | RabbitMQ username |
| `RABBITMQ_PASSWORD` | string | — | RabbitMQ password |

### adapter-mailgun

| Variable | Type | Default | Description |
|---|---|---|---|
| `MAILGUN_PORT` | number | `3171` | HTTP listen port |
| `MAILGUN_API_KEY` | string | — | Mailgun API key |
| `MAILGUN_DOMAIN` | string | `distelsa.info` | Mailgun sending domain |
| `MAILGUN_FROM_ADDRESS` | string | `notifications@distelsa.info` | Default from address |
| `MAILGUN_REGION` | string | `us` | Mailgun region (`us`/`eu`) |
| `MAILGUN_WEBHOOK_SIGNING_KEY` | string | — | Webhook signing key for HMAC-SHA256 |

### adapter-whatsapp

| Variable | Type | Default | Description |
|---|---|---|---|
| `WHATSAPP_PORT` | number | `3173` | HTTP listen port |
| `META_ACCESS_TOKEN` | string | — | Meta system user access token |
| `META_PHONE_NUMBER_ID` | string | — | WhatsApp Business phone number ID |
| `META_APP_SECRET` | string | — | Meta app secret for webhook verification |
| `META_WEBHOOK_VERIFY_TOKEN` | string | — | Token for webhook URL verification challenge |
| `META_API_VERSION` | string | `v22.0` | Graph API version |
| `META_DEFAULT_TEMPLATE_LANGUAGE` | string | `en` | Default template language |

---

## 9. Error Codes

### Shared Base Codes (`PA-` prefix)

| Code | HTTP | Details | Message |
|---|---|---|---|
| `PA-001` | 400 | `INVALID_REQUEST_BODY` | The request body is invalid |
| `PA-002` | 503 | `PROVIDER_UNAVAILABLE` | The provider API is unavailable |
| `PA-003` | 502 | `SEND_FAILED` | Failed to send notification via provider |
| `PA-004` | 401 | `WEBHOOK_VERIFICATION_FAILED` | Webhook signature verification failed |
| `PA-005` | 500 | `RABBITMQ_PUBLISH_FAILED` | Failed to publish event to RabbitMQ |
| `PA-006` | 500 | `MEDIA_PROCESSING_FAILED` | Failed to process media attachment |
| `PA-007` | 500 | `CONFIGURATION_ERROR` | Adapter configuration is invalid or missing |

### adapter-mailgun (`MG-` prefix)

| Code | HTTP | Details | Message |
|---|---|---|---|
| `MG-001` | 400 | `INVALID_REQUEST_BODY` | The request body is invalid |
| `MG-002` | 503 | `MAILGUN_API_UNAVAILABLE` | The Mailgun API is unavailable |
| `MG-003` | 502 | `SEND_FAILED` | Failed to send email via Mailgun |
| `MG-004` | 401 | `WEBHOOK_VERIFICATION_FAILED` | Mailgun webhook signature verification failed |
| `MG-005` | 401 | `INVALID_API_KEY` | The Mailgun API key is invalid |
| `MG-006` | 404 | `DOMAIN_NOT_FOUND` | The Mailgun sending domain was not found |
| `MG-007` | 429 | `RATE_LIMIT_EXCEEDED` | Mailgun rate limit exceeded |
| `MG-008` | 413 | `ATTACHMENT_TOO_LARGE` | Attachment exceeds maximum size (25 MB) |
| `MG-009` | 400 | `INVALID_RECIPIENT` | The recipient email address is invalid |
| `MG-010` | 500 | `RABBITMQ_PUBLISH_FAILED` | Failed to publish webhook event to RabbitMQ |

### adapter-whatsapp (`WA-` prefix)

| Code | HTTP | Details | Message |
|---|---|---|---|
| `WA-001` | 400 | `INVALID_REQUEST_BODY` | The request body is invalid |
| `WA-002` | 503 | `WHATSAPP_API_UNAVAILABLE` | The WhatsApp Cloud API is unavailable |
| `WA-003` | 502 | `SEND_FAILED` | Failed to send message via WhatsApp |
| `WA-004` | 401 | `INVALID_ACCESS_TOKEN` | The Meta access token is invalid or expired |
| `WA-005` | 400 | `INVALID_PHONE_NUMBER` | The recipient phone number is invalid or not on WhatsApp |
| `WA-006` | 404 | `TEMPLATE_NOT_FOUND` | The WhatsApp message template was not found or not approved |
| `WA-007` | 429 | `RATE_LIMIT_EXCEEDED` | WhatsApp Cloud API rate limit exceeded |
| `WA-008` | 400 | `TEMPLATE_PARAMETER_MISMATCH` | Template parameter count does not match the template definition |
| `WA-009` | 403 | `POLICY_VIOLATION` | Account temporarily blocked for policy violations |
| `WA-010` | 400 | `CONVERSATION_WINDOW_EXPIRED` | The 24-hour conversation window has expired; use a template message |

All error responses follow the schema: `{ code, details, message, status }`.

---

## 10. Observability

### Prometheus Metrics (`GET /metrics`) — Shared (7 metrics)

| Metric | Type | Labels | Description |
|---|---|---|---|
| `pa_send_requests_total` | Counter | `providerId`, `status` | Total send requests |
| `pa_send_errors_total` | Counter | `providerId`, `errorCode` | Total send errors by code |
| `pa_webhook_events_total` | Counter | `providerId`, `eventType` | Total inbound webhook events |
| `pa_webhook_verification_failures_total` | Counter | `providerId` | Total webhook verification failures |
| `pa_rabbitmq_publish_failures_total` | Counter | `providerId` | Total RabbitMQ publish failures |
| `pa_send_duration_seconds` | Histogram | `providerId` | Provider API call duration |
| `pa_webhook_processing_duration_seconds` | Histogram | `providerId` | Webhook processing duration |

Default Node.js process metrics are also collected via `collectDefaultMetrics`.
