> *This is a convenience copy. The authoritative version is at `../../docs/17-provider-adapters.md`.*

# 17 — Provider Adapter Services

**Notification API — Provider Adapter Services Deep-Dive**

| | |
|---|---|
| **Version:** | 1.0 |
| **Date:** | 2026-02-26 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [Architecture & Integration Points](#2-architecture--integration-points)
3. [NestJS Monorepo Structure](#3-nestjs-monorepo-structure)
4. [Adapter Service Table](#4-adapter-service-table)
5. [Standardized HTTP Contract](#5-standardized-http-contract)
6. [Shared Infrastructure (libs/common/)](#6-shared-infrastructure-libscommon)
7. [Mailgun Adapter (adapter-mailgun)](#7-mailgun-adapter-adapter-mailgun)
8. [Braze Adapter (adapter-braze)](#8-braze-adapter-adapter-braze)
9. [WhatsApp Adapter (adapter-whatsapp)](#9-whatsapp-adapter-adapter-whatsapp)
10. [AWS SES Adapter (adapter-aws-ses)](#10-aws-ses-adapter-adapter-aws-ses)
11. [Webhook Architecture](#11-webhook-architecture)
12. [Error Classification](#12-error-classification)
13. [Media Handling per Adapter](#13-media-handling-per-adapter)
14. [Configuration & Environment Variables](#14-configuration--environment-variables)
15. [Registration in Core Services](#15-registration-in-core-services)
16. [WhatsApp Routing Rule](#16-whatsapp-routing-rule)
17. [Adding a New Provider](#17-adding-a-new-provider)
18. [Testing Strategy](#18-testing-strategy)
19. [Monitoring & Health Checks](#19-monitoring--health-checks)

---

## 1. Service Overview

The Provider Adapter Services are four stateless NestJS microservices in a single NestJS monorepo (`provider-adapters/`). Each adapter is a "dumb pipe" — it receives pre-rendered notification content from the Channel Router Service via a standardized HTTP contract, translates the request into the provider's API format, and forwards it. Adapters also receive webhook callbacks from providers (routed through the Notification Gateway), verify signatures, normalize delivery status events, and publish them to RabbitMQ.

| Attribute | Value |
|---|---|
| **Technology** | NestJS (TypeScript) monorepo with `@nestjs/axios`, `@golevelup/nestjs-rabbitmq`, `nestjs-pino` |
| **Ports** | `3171` (Mailgun), `3172` (Braze), `3173` (WhatsApp), `3174` (AWS SES) |
| **Database** | None — all adapters are stateless; no PostgreSQL schema |
| **Dependencies** | RabbitMQ (webhook event publishing), external provider APIs |
| **Source Repo Folder** | `provider-adapters/` |

Port `3170` is reserved and left unassigned for future use.

### Responsibilities

1. **Send Translation:** Receive a `SendRequest` via `POST /send`, translate to the provider API format, call the provider, return a `SendResult`.
2. **Webhook Verification:** Receive inbound webhook callbacks, verify signatures using provider-specific methods, reject invalid payloads.
3. **Webhook Normalization:** Map provider-specific events to standardized delivery statuses (`DELIVERED`, `FAILED`, etc.).
4. **Webhook Publishing:** Publish normalized events to `xch.notifications.status` with routing key `adapter.webhook.{providerId}` (fire-and-forget).
5. **Health Reporting:** Expose `GET /health` for the Channel Router's circuit breaker integration.
6. **Capabilities Declaration:** Expose `GET /capabilities` for the Channel Router to discover supported channels and features.
7. **Credential Ownership:** Each adapter manages its own provider credentials via environment variables — never passed by the Channel Router.

> **Info:** **Dumb Pipe Architecture**
>
> All providers are integrated as dumb pipes. The Channel Router sends pre-rendered content from the Template Service. Provider-side templates (Mailgun Handlebars, Braze Liquid) and WhatsApp template management are deliberately unused. This preserves the Template Service's ownership of rendering, versioning, and provider portability.

---

## 2. Architecture & Integration Points

### Upstream & Downstream Dependencies

| Direction | System | Protocol | Description |
|---|---|---|---|
| **Inbound** | Channel Router Service (:3154) | HTTP/REST (sync) | `POST /send`, `GET /health`, `GET /capabilities` |
| **Inbound** | Notification Gateway (:3150) | HTTP/REST (webhook) | Routes provider callbacks to `POST /webhooks/inbound` |
| **Downstream** | Mailgun API | HTTPS | Email delivery via Mailgun v3 |
| **Downstream** | Braze API | HTTPS | Multi-channel delivery via `/messages/send` |
| **Downstream** | Meta Cloud API | HTTPS | WhatsApp messaging via Cloud API v21.0 |
| **Downstream** | AWS SES | HTTPS / SMTP | Email delivery via SES v2 API or SMTP relay |
| **Downstream** | RabbitMQ | AMQP | Publishes normalized webhook events to `xch.notifications.status` |

### Figure 2.1 — Integration Context

```
+------------------------------+
|  Notification Engine :3152   |
|  (publishes dispatch msgs)   |
+-------------+----------------+
              |  RabbitMQ (xch.notifications.deliver)
              v
+------------------------------+
|  Channel Router Core :3154   |
|  Resolve adapter, CB, rate   |
|  limit, media, POST /send    |
+---+------+------+------+----+
    |      |      |      |
    v      v      v      v
+------+ +------+ +------+ +------+
|mailgn| |braze | | meta | | ses  |
|:3171 | |:3172 | |:3173 | |:3174 |
|(mail)| |(all) | | (WA) | |(mail)|
+------+ +------+ +------+ +------+
    |      |      |      |
    v      v      v      v
 Mailgun  Braze  Meta   AWS SES
 v3 API   REST   Cloud  v2/SMTP
          API    v21.0

+---------------------------------------------------+
|  Webhook Path (bypasses Channel Router)           |
|  Provider -> Gateway :3150 -> Adapter -> verify   |
|  -> normalize -> publish xch.notifications.status |
+---------------------------------------------------+
    |
    +---> Audit Service :3156
    +---> Notification Engine :3152
```

---

## 3. NestJS Monorepo Structure

All four adapters live in a single NestJS monorepo with shared infrastructure in `libs/common/`. Each adapter is independently buildable and deployable.

```
provider-adapters/
  apps/
    adapter-mailgun/             # :3171
      src/
        main.ts
        app.module.ts
        send/                    # POST /send — Mailgun v3 translation
        webhooks/                # POST /webhooks/inbound — HMAC-SHA256
        config/                  # MAILGUN_API_KEY, MAILGUN_DOMAIN, etc.
      test/

    adapter-braze/               # :3172
      src/
        main.ts
        app.module.ts
        send/                    # POST /send — channel-aware message builder
        webhooks/                # POST /webhooks/inbound — postback normalization
        profile-sync/            # /users/track with LRU cache
        config/
      test/

    adapter-whatsapp/            # :3173
      src/
        main.ts
        app.module.ts
        send/                    # POST /send — Meta Cloud API messages
        webhooks/                # GET (challenge) + POST (X-Hub-Signature-256)
        config/
      test/

    adapter-aws-ses/             # :3174
      src/
        main.ts
        app.module.ts
        send/                    # POST /send — dual mode (API or SMTP)
        webhooks/                # POST /webhooks/inbound — SNS notifications
        config/
      test/

  libs/
    common/                      # Shared infrastructure
      src/
        dto/                     # SendRequest, SendResult, WebhookEvent, Health, Capabilities
        rabbitmq/                # AMQP connection + webhook publisher
        health/                  # BaseHealthService, health controller
        errors/                  # Error registry (PA- prefix), exception filter
        metrics/                 # Prometheus metrics module
        logging/                 # nestjs-pino structured logging
        config/                  # Shared env vars (PORT, RABBITMQ_URL, LOG_LEVEL)

  nest-cli.json                  # Monorepo workspaces
  package.json
  tsconfig.json
  eslint.config.mjs
  .prettierrc
```

> **Info:** **Independent Deployment** — Each adapter builds independently via `nest build adapter-mailgun`. A single Dockerfile per adapter produces a minimal image containing only that adapter's code and `libs/common/`.

---

## 4. Adapter Service Table

| Adapter Service | Port | Provider | Channels | SDK / Client | Webhook Verification | Est. LOC |
|---|---|---|---|---|---|---|
| adapter-mailgun | 3171 | Mailgun | Email | `mailgun.js` + `form-data` | HMAC-SHA256 | ~300 |
| adapter-braze | 3172 | Braze | Email, SMS, WhatsApp, Push | `@nestjs/axios` | API key header | ~500 |
| adapter-whatsapp | 3173 | Meta (WhatsApp Business) | WhatsApp | `@nestjs/axios` | X-Hub-Signature-256 | ~350 |
| adapter-aws-ses | 3174 | Amazon SES | Email | `@aws-sdk/client-sesv2` + Nodemailer | SNS X.509 certificate | ~400 |

---

## 5. Standardized HTTP Contract

All adapters implement the same four endpoints. This contract enables provider substitution without code changes to the Channel Router.

### 5.1 `POST /send` — Deliver a Notification

**Request (`SendRequest`):**

```typescript
interface SendRequest {
  notificationId: string;
  channel: string;
  priority: string;
  recipient: {
    email?: string;
    phone?: string;
    name?: string;
    customerId?: string;
    deviceToken?: string;
  };
  content: {
    subject?: string;
    body: string;
  };
  media?: Array<{
    type: string;
    filename?: string;
    mimeType: string;
    content?: string;
    url?: string;
    context: string;
  }>;
  metadata: {
    correlationId?: string;
    sourceId?: string;
    eventType?: string;
    cycleId?: string;
    dispatchedAt?: string;
  };
}
```

**Response (`SendResult`):**

```typescript
interface SendResult {
  success: boolean;
  providerMessageId: string | null;
  retryable: boolean;
  errorMessage: string | null;
  httpStatus: number;
  providerResponse: Record<string, any> | null;
}
```

The Channel Router uses `success` and `retryable` to drive circuit breaker, retry, and fallback logic. The adapter owns the retryable/non-retryable classification because it understands its provider's error semantics.

### 5.2 `GET /health` — Provider Health Check

```typescript
interface AdapterHealthResponse {
  status: string;           // "ok", "degraded", or "down"
  providerId: string;
  providerName: string;
  supportedChannels: string[];
  latencyMs: number;
  details: Record<string, any>;
}
```

The Channel Router polls this every 30 seconds (configurable) and feeds results into the circuit breaker.

### 5.3 `GET /capabilities` — Adapter Self-Description

```typescript
interface AdapterCapabilitiesResponse {
  providerId: string;
  providerName: string;
  supportedChannels: string[];
  supportsAttachments: boolean;
  supportsMediaUrls: boolean;
  maxAttachmentSizeMb: number;
  maxRecipientsPerRequest: number;
  webhookPath: string | null;
}
```

Called at startup and on cache refresh. Allows the core to discover adapter capabilities without hardcoding.

### 5.4 `POST /webhooks/inbound` — Provider Webhook Receiver

Receives provider-specific webhook payloads (routed by the Gateway), verifies signatures, normalizes events, publishes to RabbitMQ, and returns `200 OK`.

---

## 6. Shared Infrastructure (libs/common/)

### 6.1 RabbitMQ Webhook Publisher

Publishes normalized webhook events to `xch.notifications.status` with routing key `adapter.webhook.{providerId}`. Fire-and-forget pattern — no RPC, no response expected.

### 6.2 Error Handling

Error codes use `PA-` prefix: `PA-001` (invalid send request), `PA-002` (webhook signature failed), `PA-003` (provider API failed), `PA-004` (provider unreachable), `PA-005` (provider rate limited). Adapter-specific ranges: `PA-1xx` Mailgun, `PA-2xx` Braze, `PA-3xx` WhatsApp, `PA-4xx` AWS SES.

### 6.3 Prometheus Metrics

| Metric | Type | Labels |
|---|---|---|
| `adapter_send_total` | Counter | `provider`, `channel`, `status` |
| `adapter_send_duration_ms` | Histogram | `provider`, `channel` |
| `adapter_webhook_received_total` | Counter | `provider`, `event_type` |
| `adapter_webhook_verification_failures_total` | Counter | `provider` |
| `adapter_webhook_publish_total` | Counter | `provider`, `status` |
| `adapter_provider_error_total` | Counter | `provider`, `error_class` |
| `adapter_health_check_duration_ms` | Histogram | `provider` |

All adapters expose `GET /metrics` returning Prometheus text format.

### 6.4 Structured Logging

`nestjs-pino` JSON logging with `LoggingInterceptor`: service name, provider ID, request method/path/status/duration, `correlationId` propagation, severity-based levels (`warn` for 4xx, `error` for 5xx).

### 6.5 Base Health Service

Abstract `BaseHealthService` that each adapter extends. Requires implementing `checkProviderConnectivity()` and `getCapabilities()`.

---

## 7. Mailgun Adapter (adapter-mailgun)

Email delivery via the Mailgun v3 REST API. Uses HTTP Basic Auth (`api:{MAILGUN_API_KEY}`) and `multipart/form-data` encoding. Supports EU and US region endpoints.

| Attribute | Value |
|---|---|
| **US Endpoint** | `POST https://api.mailgun.net/v3/{domain}/messages` |
| **EU Endpoint** | `POST https://api.eu.mailgun.net/v3/{domain}/messages` |
| **Webhook Verification** | HMAC-SHA256 with dedicated Webhook Signing Key |

### 7.1 Send Mapping

| SendRequest Field | Mailgun API Field |
|---|---|
| `recipient.email` | `to` (formatted as `"Name <email>"` if name present) |
| `content.subject` | `subject` |
| `content.body` (HTML) | `html` |
| `media[context=attachment]` | `attachment` (binary multipart fields) |
| `metadata.correlationId` | `v:correlationId` (custom variable — echoed in webhooks) |
| `metadata.notificationId` | `v:notificationId` (custom variable) |
| (config) `MAILGUN_FROM_ADDRESS` | `from` |

> **Info:** **Custom Variables (`v:` prefix):** Mailgun echoes custom variables back in webhook payloads, enabling notification-to-webhook correlation without relying solely on the Mailgun message ID.

### 7.2 Webhook Verification (HMAC-SHA256)

Mailgun webhooks include `signature.timestamp`, `signature.token`, and `signature.signature`. The adapter computes `HMAC-SHA256(signingKey, timestamp + token)` and compares using `crypto.timingSafeEqual`.

> **Warning:** **Signing Key vs API Key:** Mailgun uses a separate Webhook Signing Key for webhook verification — not the API key. Configure via `MAILGUN_WEBHOOK_SIGNING_KEY`.

### 7.3 Region Support

| `MAILGUN_REGION` | API Base URL |
|---|---|
| `us` (default) | `https://api.mailgun.net` |
| `eu` | `https://api.eu.mailgun.net` |

---

## 8. Braze Adapter (adapter-braze)

Multi-channel delivery via the Braze `/messages/send` endpoint. The adapter inspects `request.channel` and builds the appropriate message object. Requires user profile synchronization via `/users/track`.

| Attribute | Value |
|---|---|
| **Endpoint** | `POST https://{BRAZE_INSTANCE_URL}/messages/send` |
| **Auth** | Bearer token (`Authorization: Bearer {BRAZE_API_KEY}`) |
| **Rate Limit** | 250,000 requests/hour |

### 8.1 Channel-Specific Message Keys

| Channel | Braze Message Object | Key Fields |
|---|---|---|
| Email | `messages.email` | `subject`, `body` (HTML), `extras.notificationId` |
| SMS | `messages.sms` | `body`, `subscription_group_id` |
| WhatsApp | `messages.whats_app` | `body` |
| Push (iOS) | `messages.apple_push` | `alert.title`, `alert.body`, `extra.notificationId` |
| Push (Android) | `messages.android_push` | `title`, `alert`, `extra.notificationId` |

All channels use `external_user_ids[0]` = `recipient.customerId` for user targeting.

### 8.2 Profile Synchronization

Braze requires a user profile before sending. The adapter calls `POST /users/track` to create or update profiles, using an LRU cache (max 10,000 entries, 24h TTL) to skip syncs for recently-seen users.

```
POST /send --> Check LRU cache for customerId
  |-- Cache hit:  skip sync, send directly
  |-- Cache miss: POST /users/track, cache, then send
```

> **Note:** Profile sync is best-effort. If `/users/track` fails, the adapter still attempts `/messages/send`. An unknown-user rejection is classified as non-retryable.

### 8.3 Webhook Processing

Braze delivers status events via **transactional postbacks** (per-message HTTP callbacks with `dispatch_id`) and **Currents** (streaming delivery/engagement events). The adapter normalizes both formats.

---

## 9. WhatsApp Adapter (adapter-whatsapp)

WhatsApp messaging via Meta Cloud API v21.0. Supports text, template, image, document, and interactive message types. Template messages are required for business-initiated conversations outside the 24-hour window.

| Attribute | Value |
|---|---|
| **Endpoint** | `POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages` |
| **Auth** | System User Token (`Authorization: Bearer {META_ACCESS_TOKEN}`) |
| **Webhook Verification** | GET challenge + X-Hub-Signature-256 (HMAC-SHA256) |

### 9.1 Message Type Selection

| Condition | Message Type |
|---|---|
| Business-initiated (no active conversation) | `template` |
| Reply within 24h conversation window | `text` |
| Content includes image media | `image` |
| Content includes document media | `document` |

### 9.2 Send Mapping (Text Message)

| SendRequest Field | Meta Cloud API Field |
|---|---|
| `recipient.phone` | `to` (E.164 without leading `+`: `1234567890`) |
| `content.body` | `text.body` |
| — | `messaging_product`: `"whatsapp"` |

> **Warning:** **24-Hour Conversation Window:** Sending a free-form text outside the 24-hour window returns Meta error `131047` (non-retryable). Template messages must be used for business-initiated conversations.

### 9.3 Phone Number Formatting

Meta requires E.164 format **without** the leading `+`. The adapter strips it: `"+1234567890"` becomes `"1234567890"`.

### 9.4 Webhook Verification (Two-Phase)

**Phase 1 — Subscription (GET):** Meta sends a GET with `hub.mode=subscribe`, `hub.verify_token`, and `hub.challenge`. The adapter validates the verify token and echoes back the challenge.

**Phase 2 — Events (POST):** Each webhook POST includes `X-Hub-Signature-256` — an HMAC-SHA256 of the raw body using the app secret. The adapter verifies using `crypto.timingSafeEqual`.

### 9.5 Meta Error Codes

| Code | Description | Retryable |
|---|---|---|
| `131047` | Outside 24h window | No |
| `131048` | Spam rate limit | Yes |
| `131053` | Invalid phone number | No |
| `131026` | Number not on WhatsApp | No |
| `130429` | Rate limit exceeded | Yes |
| `131000` | Generic error | Yes |
| `132000` | Template not found | No |
| `133000` | Media error | No |

---

## 10. AWS SES Adapter (adapter-aws-ses)

Email delivery via AWS SES with dual mode support: SES v2 API (`SendEmailCommand` from `@aws-sdk/client-sesv2`) or SMTP relay via Nodemailer. Delivery tracking uses SNS notifications configured via SES Configuration Sets.

| Attribute | Value |
|---|---|
| **API Endpoint** | `https://email.{region}.amazonaws.com` (SES v2) |
| **SMTP Endpoint** | `email-smtp.{region}.amazonaws.com:587` (STARTTLS) |
| **Auth** | IAM credentials (access key + secret) |
| **Webhook** | Via SNS: subscription confirmation + X.509 signature verification |

### 10.1 Dual Send Mode

| Mode (`SES_MODE`) | Implementation | Use Case |
|---|---|---|
| `api` (default) | `@aws-sdk/client-sesv2` `SendEmailCommand` | Recommended — full feature support |
| `smtp` | Nodemailer with SES SMTP credentials | Legacy integration, firewall-restricted |

### 10.2 Send Mapping (API Mode)

| SendRequest Field | SES v2 API Field |
|---|---|
| `recipient.email` | `Destination.ToAddresses[0]` |
| `content.subject` | `Content.Simple.Subject.Data` |
| `content.body` (HTML) | `Content.Simple.Body.Html.Data` |
| (config) `SES_FROM_ADDRESS` | `FromEmailAddress` |
| (config) `SES_CONFIGURATION_SET` | `ConfigurationSetName` |
| `metadata.notificationId` | `EmailTags[{Name:"notificationId"}]` |

When `media[]` attachments are present, the adapter switches to `Content.Raw` with a full MIME message.

### 10.3 SNS Webhook Handling

SES delivery events arrive via SNS HTTP subscriptions. The adapter handles three SNS message types:

1. **SubscriptionConfirmation** — Auto-confirms by following the `SubscribeURL`.
2. **Notification** — Extracts the SES event from `snsMessage.Message` (JSON string).
3. **Signature Verification** — Validates the `Signature` field using the X.509 certificate from `SigningCertURL` (must be `*.amazonaws.com`).

> **Warning:** **Certificate URL Validation:** The adapter must verify that `SigningCertURL` points to `*.amazonaws.com` before downloading. Failure to validate enables signature forgery.

### 10.4 SES Event Types

| SES Event | Internal Status |
|---|---|
| `Send` | SENT |
| `Delivery` | DELIVERED |
| `Bounce` (Permanent) | FAILED (hard bounce) |
| `Bounce` (Transient) | FAILED (soft bounce) |
| `Complaint` | (suppression) spam |
| `Reject` | FAILED |
| `Open` | (analytics) opened |
| `Click` | (analytics) clicked |

### 10.5 Sandbox vs Production

New AWS accounts start in sandbox (1 email/sec, 200/day, verified recipients only). Production requires an AWS Support review. The adapter uses the same API calls in both modes — sandbox rate errors are retryable.

---

## 11. Webhook Architecture

All adapters follow a unified webhook processing flow. Provider callbacks arrive at the Gateway, which routes them to the correct adapter.

### 11.1 Unified Flow

```
Provider (Mailgun / Braze / Meta / SES-SNS)
    |  HTTP POST
    v
+----------------------------------+
|  Gateway :3150                   |
|  /webhooks/{provider}            |
+----------------------------------+
    |  HTTP POST (proxied)
    v
+----------------------------------+
|  Adapter Service                 |
|  1. Verify Signature             |
|  2. Parse Event(s)               |
|  3. Map to Internal Status       |
|  4. Publish to RabbitMQ          |
|     xch.notifications.status     |
|     key: adapter.webhook.{id}    |
|  5. Return 200 OK               |
+----------------------------------+
    |  AMQP (fire-and-forget)
    v
+----------------------------------+
|  Consumers:                      |
|  - Audit Service :3156           |
|  - Notification Engine :3152     |
+----------------------------------+
```

### 11.2 Gateway Routing Table

| External URL | Target | Adapter |
|---|---|---|
| `POST /webhooks/mailgun` | `http://adapter-mailgun:3171/webhooks/inbound` | adapter-mailgun |
| `POST /webhooks/braze` | `http://adapter-braze:3172/webhooks/inbound` | adapter-braze |
| `GET+POST /webhooks/whatsapp` | `http://adapter-whatsapp:3173/webhooks/inbound` | adapter-whatsapp |
| `POST /webhooks/aws-ses` | `http://adapter-aws-ses:3174/webhooks/inbound` | adapter-aws-ses |

### 11.3 Status Mapping — All Providers

| Internal Status | Mailgun | Braze | Meta WA | SES (SNS) |
|---|---|---|---|---|
| SENT | `accepted` | `send` | `sent` | `Send` |
| DELIVERED | `delivered` | `delivery` | `delivered` | `Delivery` |
| FAILED (hard) | `permanent_fail` | `bounce` | `failed` | `Bounce` (Permanent) |
| FAILED (soft) | `temporary_fail` | `soft_bounce` | — | `Bounce` (Transient) |
| (analytics) opened | `opened` | `open` | — | `Open` |
| (analytics) clicked | `clicked` | `click` | — | `Click` |
| (analytics) read | — | — | `read` | — |
| (suppression) spam | `complained` | `spam` | — | `Complaint` |
| (preference) unsub | `unsubscribed` | `unsubscribe` | — | — |
| REJECTED | — | — | — | `Reject` |

### 11.4 Provider Message ID Correlation

| Provider | ID Format | Webhook Location |
|---|---|---|
| Mailgun | `<{id}@{domain}.mailgun.org>` | `event-data.message.headers.message-id` |
| Braze | `dispatch_id` | `dispatch_id` in postback |
| Meta WA | `wamid.{base62}` | `entry[].changes[].value.statuses[].id` |
| AWS SES | `{uuid}@email.amazonses.com` | `mail.messageId` in SNS notification |

---

## 12. Error Classification

Each adapter classifies provider errors as retryable or non-retryable. The Channel Router trusts this classification.

### 12.1 General Rules

| Error Category | Retryable |
|---|---|
| HTTP 5xx from provider | Yes |
| HTTP 429 (rate limited) | Yes |
| Connection timeout / DNS failure | Yes |
| HTTP 400 (bad request) | No |
| HTTP 401/403 (auth) | No |
| Invalid recipient | No |

### 12.2 Per-Provider Summary

| Provider | Retryable | Non-Retryable |
|---|---|---|
| **Mailgun** | 429, 500, 502, 503, 504, timeout | 400, 401, 402, 404, 413 |
| **Braze** | 429, 500, 503, timeout | 400, 401, 404 |
| **Meta WA** | `130429`, `131048`, `131000`, 500, timeout | `131047`, `131031`, `131053`, `131026`, `132000`, `133000` |
| **AWS SES** | `Throttling`, `LimitExceededException`, 500, 503, timeout | `MessageRejected`, `MailFromDomainNotVerified`, `AccessDenied` |

> **Info:** **Adapter Owns Classification** — The adapter, not the Channel Router, decides retryability. Each provider has unique error semantics (e.g., Mailgun 402 = payment required, never retry).

---

## 13. Media Handling per Adapter

The Channel Router pre-processes media before calling adapters. Email attachments arrive Base64-encoded in `media[].content`; WhatsApp/push media URLs arrive in `media[].url`.

| Adapter | Attachments (Base64) | Media URLs | Format | Max Size |
|---|---|---|---|---|
| **Mailgun** | Yes | No | `multipart/form-data` fields | 25 MB/message |
| **Braze** | No | URL only | URL in message payload | Provider-specific |
| **WhatsApp** | No | URL passthrough | `image.link` / `document.link` | 5 MB image, 100 MB doc |
| **AWS SES** | Yes | No | Raw MIME (API) or Nodemailer (SMTP) | 10 MB (API), 40 MB (SMTP) |

**Mailgun:** Decodes Base64 back to `Buffer`, appends as `multipart/form-data` `attachment` fields.

**Braze:** Does not support file attachments via `/messages/send`. Media entries are ignored for email; WhatsApp media URLs may be passed if supported.

**WhatsApp (Meta):** Media URLs passed directly to the Cloud API. Must be publicly accessible HTTPS URLs. Message type set to `image` or `document` based on `media[].type`.

**AWS SES:** Attachments trigger a switch from `Content.Simple` to `Content.Raw` (full MIME message with Base64-encoded parts). In SMTP mode, passed to Nodemailer's `attachments` array.

---

## 14. Configuration & Environment Variables

### 14.1 Shared (All Adapters)

| Variable | Default | Description |
|---|---|---|
| `PORT` | Per adapter | HTTP server port |
| `NODE_ENV` | `development` | Environment |
| `LOG_LEVEL` | `info` | Pino log level |
| `RABBITMQ_URL` | — (required) | AMQP connection string |
| `METRICS_ENABLED` | `true` | Enable Prometheus metrics |

### 14.2 adapter-mailgun (:3171)

| Variable | Required | Description |
|---|---|---|
| `MAILGUN_API_KEY` | Yes | Mailgun API key |
| `MAILGUN_DOMAIN` | Yes | Sending domain |
| `MAILGUN_FROM_ADDRESS` | Yes | Sender address |
| `MAILGUN_REGION` | No (default: `us`) | `us` or `eu` |
| `MAILGUN_WEBHOOK_SIGNING_KEY` | Yes | Webhook HMAC key |

### 14.3 adapter-braze (:3172)

| Variable | Required | Description |
|---|---|---|
| `BRAZE_API_KEY` | Yes | REST API key |
| `BRAZE_INSTANCE_URL` | Yes | Instance URL (e.g., `rest.iad-01.braze.com`) |
| `BRAZE_APP_ID` | Yes | Application identifier |
| `BRAZE_SMS_SUBSCRIPTION_GROUP_ID` | Conditional | Required for SMS |
| `BRAZE_WHATSAPP_SUBSCRIPTION_GROUP_ID` | Conditional | Required for WhatsApp via Braze |
| `BRAZE_PROFILE_SYNC_CACHE_TTL_MS` | No (default: `86400000`) | LRU cache TTL |
| `BRAZE_PROFILE_SYNC_CACHE_MAX` | No (default: `10000`) | LRU cache max entries |

### 14.4 adapter-whatsapp (:3173)

| Variable | Required | Description |
|---|---|---|
| `META_ACCESS_TOKEN` | Yes | System User permanent token |
| `META_PHONE_NUMBER_ID` | Yes | WhatsApp phone number ID |
| `META_APP_SECRET` | Yes | App secret for webhook HMAC |
| `META_WEBHOOK_VERIFY_TOKEN` | Yes | GET challenge verify token |
| `META_API_VERSION` | No (default: `v21.0`) | Graph API version |
| `META_DEFAULT_TEMPLATE_LANGUAGE` | No (default: `en`) | Template language code |

### 14.5 adapter-aws-ses (:3174)

| Variable | Required | Description |
|---|---|---|
| `AWS_ACCESS_KEY_ID` | Yes | IAM access key |
| `AWS_SECRET_ACCESS_KEY` | Yes | IAM secret key |
| `AWS_REGION` | Yes | AWS region |
| `SES_MODE` | No (default: `api`) | `api` or `smtp` |
| `SES_FROM_ADDRESS` | Yes | Verified sender address |
| `SES_CONFIGURATION_SET` | Yes | Configuration Set for tracking |
| `SES_SMTP_USERNAME` | Conditional | Required if `SES_MODE=smtp` |
| `SES_SMTP_PASSWORD` | Conditional | Required if `SES_MODE=smtp` |

---

## 15. Registration in Core Services

Adapters are registered in two places: Channel Router (send routing) and Gateway (webhook routing). No code changes required.

### 15.1 Channel Router Registration Examples

**adapter-mailgun (Email):**

```json
POST /api/v1/providers/register
{
  "providerName": "Mailgun",
  "providerId": "mailgun",
  "channel": "email",
  "adapterUrl": "http://adapter-mailgun:3171",
  "isActive": true,
  "routingWeight": 60,
  "rateLimitTokensPerSec": 50,
  "rateLimitMaxBurst": 100
}
```

**adapter-braze (4 registrations — one per channel):**

```json
{ "providerId": "braze-email",    "channel": "email",    "adapterUrl": "http://adapter-braze:3172", "isActive": true,  "routingWeight": 40  }
{ "providerId": "braze-sms",      "channel": "sms",      "adapterUrl": "http://adapter-braze:3172", "isActive": true,  "routingWeight": 100 }
{ "providerId": "braze-whatsapp", "channel": "whatsapp", "adapterUrl": "http://adapter-braze:3172", "isActive": false, "routingWeight": 0   }
{ "providerId": "braze-push",     "channel": "push",     "adapterUrl": "http://adapter-braze:3172", "isActive": true,  "routingWeight": 100 }
```

**adapter-whatsapp (WhatsApp):**

```json
POST /api/v1/providers/register
{
  "providerName": "Meta WhatsApp",
  "providerId": "meta-whatsapp",
  "channel": "whatsapp",
  "adapterUrl": "http://adapter-whatsapp:3173",
  "isActive": true,
  "routingWeight": 100,
  "rateLimitTokensPerSec": 80,
  "rateLimitMaxBurst": 160
}
```

**adapter-aws-ses (Email):**

```json
POST /api/v1/providers/register
{
  "providerName": "AWS SES",
  "providerId": "aws-ses",
  "channel": "email",
  "adapterUrl": "http://adapter-aws-ses:3174",
  "isActive": true,
  "routingWeight": 0,
  "rateLimitTokensPerSec": 14,
  "rateLimitMaxBurst": 28
}
```

> **Note:** `routingWeight: 0` with `isActive: true` = registered and healthy but receives no traffic under weighted routing. Serves as failover-only.

### 15.2 Gateway Webhook Routes

```json
[
  { "path": "/webhooks/mailgun",   "target": "http://adapter-mailgun:3171/webhooks/inbound",   "methods": ["POST"] },
  { "path": "/webhooks/braze",     "target": "http://adapter-braze:3172/webhooks/inbound",     "methods": ["POST"] },
  { "path": "/webhooks/whatsapp",  "target": "http://adapter-whatsapp:3173/webhooks/inbound",  "methods": ["GET", "POST"] },
  { "path": "/webhooks/aws-ses",   "target": "http://adapter-aws-ses:3174/webhooks/inbound",   "methods": ["POST"] }
]
```

---

## 16. WhatsApp Routing Rule

Both adapter-whatsapp (Meta native) and adapter-braze support WhatsApp. Only **one** can be active at a time, controlled via the `isActive` flag.

### 16.1 Mutual Exclusion

| Scenario | `meta-whatsapp` | `braze-whatsapp` | Result |
|---|---|---|---|
| Meta preferred | `isActive: true` | `isActive: false` | Traffic routes to adapter-whatsapp :3173 |
| Braze preferred | `isActive: false` | `isActive: true` | Traffic routes to adapter-braze :3172 |
| Both active | `true` | `true` | Not recommended — webhook correlation issues |
| Neither active | `false` | `false` | WhatsApp disabled — messages fail |

### 16.2 Switching Providers

```json
PATCH /api/v1/providers/meta-whatsapp     { "isActive": false }
PATCH /api/v1/providers/braze-whatsapp    { "isActive": true }
```

> **Warning:** Perform both steps together. Deactivating the current provider without activating an alternative causes WhatsApp notifications to fail during the gap.

### 16.3 Rationale

- **Webhook correlation:** Different message ID formats (`wamid.*` vs `dispatch_id`) prevent reliable cross-adapter correlation.
- **Conversation windows:** Meta's 24h window is per-phone-number. Splitting traffic creates inconsistent state.
- **Cost:** WhatsApp bills per conversation, not per message. Splitting causes duplicate conversations.

---

## 17. Adding a New Provider

Adding a new provider requires implementing a small NestJS application in the monorepo, deploying it, and registering via admin API. No changes to the Channel Router or any other service.

### 17.1 Steps

1. **Generate app:** `nest generate app adapter-{name}` in the monorepo (~5 min)
2. **Implement 3 methods** (~2-4 hours, ~250 LOC total):
   - `sendService.send(request): Promise<SendResult>` — translate + call provider (~80 lines)
   - `webhookService.verify(headers, body): boolean` — verify signature (~30 lines)
   - `webhookService.normalize(body): WebhookEvent[]` — map events (~40 lines)
   - Plus: config (~20 lines), health (~30 lines), app module (~20 lines), main (~15 lines)
3. **Write tests** (~1-2 hours): unit tests mocking provider API + E2E tests
4. **Build and deploy:** `nest build adapter-{name}`, Docker, run on internal network
5. **Register in Channel Router:** `POST /api/v1/providers/register` (config only)
6. **Add Gateway webhook route:** Config change, no code
7. **Configure provider webhook URL** to point to Gateway

> **Success:** Zero code changes to the Channel Router Core. Zero redeployment of existing services. ~250 lines of custom code.

---

## 18. Testing Strategy

### 18.1 Unit Tests (Per Adapter)

Mock the external provider HTTP client. Validate send translation, error classification, webhook verification (with known test vectors), and webhook normalization.

### 18.2 Shared Contract Tests

All adapters must pass the same contract test suite (implemented in `libs/common/test/`):

| Contract Test | Validates |
|---|---|
| `POST /send` response shape | `success`, `providerMessageId`, `retryable`, `errorMessage`, `httpStatus`, `providerResponse` |
| `GET /health` response shape | `status`, `providerId`, `providerName`, `supportedChannels`, `latencyMs`, `details` |
| `GET /capabilities` response shape | All required fields including `webhookPath` |
| `POST /send` with invalid body | Returns 400 with standardized error |
| `GET /metrics` | Returns Prometheus text format |

### 18.3 E2E Tests (Per Adapter)

Full NestJS application with mocked external providers (via `nock`). Test scenarios: health check, send success, retryable failure, non-retryable failure, webhook verification (valid + invalid), webhook RabbitMQ publish.

---

## 19. Monitoring & Health Checks

### 19.1 Health Check

The Channel Router polls `GET /health` every 30 seconds. Results feed into the per-adapter circuit breaker:

| Health Response | Circuit Breaker Action |
|---|---|
| `status: "ok"` | No action |
| `status: "degraded"` | Log warning |
| `status: "down"` | Count as failure; may trip circuit |
| HTTP error / timeout | Count as failure |

### 19.2 Alerting Thresholds

| Alert | Condition | Severity |
|---|---|---|
| Send error rate | `> 5%` over 5 min | Warning |
| Send error rate critical | `> 20%` over 5 min | Critical |
| Send latency P95 | `> 5000 ms` | Warning |
| Webhook verification failures | `> 0` over 5 min | Warning |
| Adapter unreachable | `/health` failing | Critical |

---

*Notification API Documentation v1.0 -- Architecture Team -- 2026*
