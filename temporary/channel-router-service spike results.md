# Channel Router Service — Spike Results

**Question:** Does the current design support adding new notification delivery providers without writing code?

**Date:** 2026-02-26

---

## Answer: No

The current design **does not** support adding new providers without code changes. The strategy pattern enables clean provider swaps and multi-provider routing at runtime, but onboarding an entirely new provider (e.g., Amazon SES, Vonage, Infobip) requires writing a new TypeScript adapter class, new webhook routes, and new verification logic.

---

## What the Design Already Supports Without Code

The design does support these **operations on existing providers** via configuration alone (admin API + database):

| Operation | Mechanism | Code Required? |
|---|---|---|
| Enable/disable an existing provider | `provider_configs.is_active` flag | No |
| Switch which provider is active for a channel | `PUT /providers/:id/config` | No |
| Change routing mode (primary/weighted/failover) | `PUT /channels/:id/config` | No |
| Adjust traffic weights between existing providers | `provider_configs.routing_weight` | No |
| Rotate provider API keys/credentials | `PUT /providers/:id/config` (encrypted JSONB) | No |
| Change rate limit thresholds | Environment variables | No (restart only) |

These are valuable and well-designed. The problem is specifically about adding a **brand-new provider** that doesn't already have a coded adapter.

---

## Why New Providers Require Code Today

Five aspects of the design are hardcoded per provider:

### 1. Provider Adapter Classes (the `send()` method)

Each provider has a dedicated TypeScript class implementing `ProviderStrategy.send()`. This method contains:
- Provider-specific API endpoint URLs
- Provider-specific authentication (Bearer token, HTTP Basic, OAuth2/JWT, etc.)
- Provider-specific payload format translation (JSON, multipart/form-data, x-www-form-urlencoded)
- Provider-specific SDK usage (`@sendgrid/mail`, `mailgun.js`, `twilio`, `firebase-admin`, custom HTTP for Braze)

Example — the same `recipient.email` field maps to completely different structures:

```
SendGrid:   personalizations[0].to[0].email    (JSON)
Mailgun:    to                                  (multipart form field)
Braze:      external_user_ids[0]                (JSON, requires customerId, not email)
```

There is no generic transformation layer — each mapping is hand-written in the adapter.

### 2. Webhook Endpoints and Signature Verification

Each provider has a dedicated route (`POST /webhooks/{provider}`) with provider-specific cryptographic verification:
- SendGrid: ECDSA signature verification
- Mailgun: HMAC-SHA256 with dedicated webhook signing key
- Twilio: Request Validator (auth token + URL + params)
- Braze: API key header verification

A new provider would need a new endpoint and new verification code.

### 3. Webhook Event Status Mapping

Provider webhook event names are mapped to internal statuses in code:

```
"delivered" (SendGrid) → DELIVERED
"delivered" (Mailgun)  → DELIVERED
"delivered" (Twilio)   → DELIVERED
"delivery"  (Braze)    → DELIVERED    ← different event name, same status
```

Each provider uses different event taxonomies that require per-provider mapping logic.

### 4. Rate Limit Configuration

Rate limits are defined as per-provider environment variables (`RL_SENDGRID_TOKENS_PER_SEC`, etc.). Adding a new provider requires new env vars and code to read them.

### 5. Braze-Specific Logic

The Braze adapter has unique requirements (user profile sync via `/users/track`, subscription group IDs, platform-specific push payloads for iOS/Android) that are deeply embedded in the adapter code. This illustrates why a fully generic approach is difficult.

---

## Proposal: Generic HTTP Provider Adapter

To support adding new providers without code, the design could introduce a **Generic HTTP Provider** adapter that is configured entirely via the `provider_configs.config_json` JSONB column. This would work for providers with simple REST APIs but would NOT replace the existing hand-coded adapters for complex providers like Braze.

### Concept

A single `GenericHttpProvider` class implements `ProviderStrategy` and uses a declarative JSON configuration to define how to call any REST API.

### Configuration Schema (stored in `provider_configs.config_json`)

```json
{
  "type": "generic-http",
  "displayName": "Amazon SES v2",
  "baseUrl": "https://email.us-east-1.amazonaws.com",
  "auth": {
    "method": "bearer",
    "tokenKey": "apiKey"
  },
  "send": {
    "method": "POST",
    "path": "/v2/email/outbound-emails",
    "contentType": "application/json",
    "bodyTemplate": {
      "Destination": {
        "ToAddresses": ["{{recipient.email}}"]
      },
      "Content": {
        "Simple": {
          "Subject": { "Data": "{{content.subject}}" },
          "Body": { "Html": { "Data": "{{content.body}}" } }
        }
      },
      "FromEmailAddress": "{{config.fromAddress}}"
    },
    "successCodes": [200, 201, 202],
    "messageIdPath": "MessageId"
  },
  "healthCheck": {
    "method": "GET",
    "path": "/v2/email/account",
    "successCodes": [200]
  },
  "rateLimiting": {
    "tokensPerSecond": 50,
    "maxBurst": 100
  },
  "webhook": {
    "signatureVerification": {
      "method": "hmac-sha256",
      "headerName": "X-Signature",
      "secretKey": "webhookSecret",
      "payload": "rawBody"
    },
    "eventMapping": {
      "Delivery": "DELIVERED",
      "Bounce": "FAILED",
      "Send": "SENT",
      "Complaint": "spam"
    },
    "messageIdPath": "mail.messageId"
  }
}
```

### What This Enables

| Capability | Supported? | Notes |
|---|---|---|
| Add a new email provider (simple REST API) | Yes | Configure `bodyTemplate` with field mapping |
| Add a new SMS provider (simple REST API) | Yes | Same pattern, different body template |
| Provider with OAuth2 bearer token auth | Yes | `auth.method: "bearer"` |
| Provider with HTTP Basic auth | Yes | `auth.method: "basic"` |
| Provider with API key in header | Yes | `auth.method: "header"` |
| Provider with HMAC webhook verification | Yes | `webhook.signatureVerification.method: "hmac-sha256"` |
| Provider with complex multi-step auth (OAuth2 + refresh) | No | Requires code |
| Provider requiring user profile sync (like Braze) | No | Requires code |
| Provider with multipart/form-data uploads | Partial | Binary attachment handling is hard to generalize |
| Provider with non-REST API (SMTP, gRPC, SDK-only) | No | Requires code |

### Implementation Impact

#### New Components

| Component | Purpose |
|---|---|
| `GenericHttpProvider` class | Single adapter implementing `ProviderStrategy`, driven by config JSON |
| `BodyTemplateEngine` | Resolves `{{placeholder}}` expressions in the body template against the dispatch message |
| `GenericWebhookHandler` | Configurable webhook endpoint (`POST /webhooks/generic/:providerId`) with pluggable signature verification |
| Auth strategy factory | Creates auth headers based on `auth.method` config |

#### Database Changes

| Change | Details |
|---|---|
| `provider_configs.config_json` | Already exists as JSONB — the generic config schema goes here |
| `provider_configs.provider_type` | New column: `'native'` or `'generic'` — determines which adapter class handles the provider |

#### Modified Components

| Component | Change |
|---|---|
| `ProviderRegistry` | When loading providers from DB, if `provider_type = 'generic'`, instantiate `GenericHttpProvider` instead of looking up a native adapter |
| `WebhookController` | Add a generic route `POST /webhooks/generic/:providerId` that delegates to `GenericWebhookHandler` |
| Rate limiter factory | Read `rateLimiting` config from JSONB instead of requiring dedicated env vars |

### Template Expression Syntax

The `bodyTemplate` uses simple path expressions to map dispatch message fields:

```
{{recipient.email}}         → dispatch.recipient.email
{{recipient.phone}}         → dispatch.recipient.phone
{{content.subject}}         → dispatch.content.subject
{{content.body}}            → dispatch.content.body
{{metadata.correlationId}}  → dispatch.metadata.correlationId
{{config.fromAddress}}      → provider_configs.config_json.fromAddress
```

This is NOT Handlebars — it is simple dot-path interpolation with no logic, loops, or helpers. It only resolves values from the dispatch message and provider config.

### Webhook Signature Verification Strategies

The generic adapter supports a fixed set of verification algorithms selectable via config:

| Method | Description | Providers Using This Pattern |
|---|---|---|
| `hmac-sha256` | HMAC-SHA256 of request body or specific fields | Mailgun, many generic webhooks |
| `hmac-sha1` | HMAC-SHA1 of request body | Some legacy providers |
| `bearer-token` | Static token in header matches configured secret | Braze, simple webhook APIs |
| `none` | No verification (development/testing only) | — |

ECDSA (SendGrid) and Twilio's request validator would NOT be covered — those providers keep their native adapters.

---

## Recommended Approach

### Keep Both: Native + Generic

```
ProviderRegistry
  │
  ├── Native Adapters (existing, hand-coded)
  │     ├── SendGridProvider        ← keep: complex SDK, ECDSA webhooks
  │     ├── MailgunProvider         ← keep: multipart uploads, custom HMAC
  │     ├── BrazeProvider(s)        ← keep: user profile sync, multi-channel
  │     ├── TwilioProvider(s)       ← keep: custom SDK, request validator
  │     └── FcmProvider             ← keep: Firebase Admin SDK, OAuth2/JWT
  │
  └── Generic HTTP Adapters (new, config-driven)
        ├── Amazon SES              ← config-only onboarding
        ├── Postmark                ← config-only onboarding
        ├── SparkPost               ← config-only onboarding
        ├── Vonage SMS              ← config-only onboarding
        ├── MessageBird             ← config-only onboarding
        └── (any future REST API provider)
```

This hybrid approach:
- Preserves full power for complex providers (Braze, Twilio) via native adapters
- Enables no-code onboarding for simple REST API providers via generic adapter
- Doesn't break or refactor any existing design
- Uses the existing `provider_configs` table and `ProviderStrategy` interface

### Estimated Complexity

| Component | Effort | Risk |
|---|---|---|
| `GenericHttpProvider` (send logic + template engine) | Medium | Low — well-scoped |
| Auth strategy factory (bearer, basic, header) | Low | Low |
| Generic webhook handler + signature verification | Medium | Medium — security-sensitive |
| `ProviderRegistry` changes (native vs generic routing) | Low | Low |
| DB migration (`provider_type` column) | Low | Low |
| Admin UI for configuring generic providers | Medium-High | Medium — UX for JSON config |
| **Total** | ~Medium | — |

---

## Limitations and Risks

| Limitation | Impact | Mitigation |
|---|---|---|
| Cannot handle providers requiring SDKs (Firebase, Twilio) | Those stay as native adapters | Hybrid approach — only simple REST providers go generic |
| Template engine only supports simple path interpolation | Cannot handle conditional/computed fields | Add a small set of transform functions if needed (e.g., `{{phone \| e164}}`) |
| Binary attachment handling (multipart/form-data) | Generic adapter may not support all attachment patterns | Start with JSON-only providers; add multipart support as a second phase |
| Security risk from user-configured webhook verification | Misconfigured verification = accepting forged webhooks | Validate config schema, require HTTPS, log all verification failures |
| Testing generic providers | No automated tests until the provider is actually configured | Add a dry-run / test-send endpoint that validates config against a mock |

---

## Recommendation

**Phase 1 (with channel-router-service implementation):** Build the service as currently designed with native adapters only. The strategy pattern already provides clean abstractions.

**Phase 2 (post-launch, when new provider requests arrive):** Introduce the `GenericHttpProvider` as described above. The hybrid architecture slots in cleanly because `ProviderStrategy` was already designed as a pluggable interface.

This avoids premature abstraction while keeping the door open for no-code provider onboarding when the business need materializes.

---
---

# Spike Part 2 — Decoupled Provider Adapter Microservices

**Question:** Can we decouple the channel-router-service so that adding a new provider only requires coding a small, isolated adapter service — while the core routing/orchestration service remains untouched and only needs configuration to register the new adapter?

**Date:** 2026-02-26

---

## Answer: Yes

The design can be refactored into two layers:

1. **Channel Router Core** — owns all generic orchestration (queue consumption, provider resolution, circuit breaker, rate limiting, retry, fallback, media processing, status publishing). Zero provider-specific code. Never changes when a new provider is added.
2. **Provider Adapter Services** — one small, independently deployable NestJS service per provider. Each adapter only knows how to call its provider's API and verify its provider's webhooks. This is the only code written when adding a new provider.

The core communicates with adapters via a **standardized HTTP contract**. Adding a new provider means: deploy the adapter, register its URL in the database, done.

---

## Architecture Overview

```
                         Notification Engine (:3152)
                                    │
                                    │ RabbitMQ: xch.notifications.deliver
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                    Channel Router Core (:3154)                                   │
│                                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐   │
│  │  Consumers    │  │  Provider    │  │  Circuit      │  │  Rate Limiter    │   │
│  │  (8 queues)   │─▶│  Resolver    │─▶│  Breaker      │─▶│  (Token Bucket)  │   │
│  │              │  │  (DB cache)  │  │  (per adapter)│  │  (per adapter)   │   │
│  └──────────────┘  └──────────────┘  └───────────────┘  └────────┬─────────┘   │
│                                                                   │             │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐           │             │
│  │  Retry       │  │  Fallback    │  │  Media        │◀──────────┘             │
│  │  Engine      │  │  Handler     │  │  Processor    │                         │
│  └──────────────┘  └──────────────┘  └───────┬───────┘                         │
│                                               │                                 │
│              ┌────────────────────────────────┘                                 │
│              │  HTTP POST /send (standardized contract)                         │
└──────────────┼──────────────────────────────────────────────────────────────────┘
               │
       ┌───────┼──────────┬──────────────┬──────────────┬──────────────┐
       │       │          │              │              │              │
       ▼       ▼          ▼              ▼              ▼              ▼
  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
  │SendGrid │ │Mailgun  │ │ Braze    │ │ Twilio   │ │  FCM     │ │ Generic  │
  │ Adapter │ │ Adapter │ │ Adapter  │ │ Adapter  │ │ Adapter  │ │ Adapter  │
  │ :3170   │ │ :3171   │ │ :3172    │ │ :3173    │ │ :3174    │ │ :3175    │
  │         │ │         │ │          │ │          │ │          │ │          │
  │ ~300LOC │ │ ~300LOC │ │ ~500LOC  │ │ ~400LOC  │ │ ~300LOC  │ │config-   │
  │         │ │         │ │(profile  │ │(SMS + WA)│ │          │ │driven    │
  │         │ │         │ │ sync)    │ │          │ │          │ │          │
  └────┬────┘ └────┬────┘ └────┬─────┘ └────┬─────┘ └────┬────┘ └────┬────┘
       │          │           │             │            │           │
       ▼          ▼           ▼             ▼            ▼           ▼
    SendGrid   Mailgun     Braze API     Twilio API    FCM API    Any REST
    API        API         + /users/     (Messages)    (v1 HTTP)  API
                           track
```

### Webhook Path (Separate from Send Path)

```
  External Provider (e.g., Mailgun)
       │
       │  POST https://api.example.com/webhooks/mailgun
       ▼
  Notification Gateway (:3150)
       │  Routes by path → adapter
       ▼
  Mailgun Adapter (:3171)
       │  1. Verify HMAC-SHA256 signature
       │  2. Parse provider event
       │  3. Map to internal status (DELIVERED, FAILED, etc.)
       │  4. Publish standardized event to RabbitMQ
       ▼
  xch.notifications.status (Topic Exchange)
       │
       ├──▶ Audit Service (:3156)
       └──▶ Notification Engine (:3152)
```

---

## What Lives Where

### Channel Router Core — Responsibilities

Everything **generic** stays in the core. The core has **zero provider-specific code** and **zero provider SDK dependencies**.

| Responsibility | Details |
|---|---|
| RabbitMQ consumption | 8 priority-tiered, channel-specific queues |
| Provider resolution | Query `provider_configs` (cached), select adapter by channel + routing mode |
| Circuit breaker | Track success/failure of HTTP calls to adapters, manage CLOSED/OPEN/HALF_OPEN state per adapter |
| Rate limiting | Token bucket per adapter, configured from `provider_configs` |
| Retry with backoff | Re-queue failed deliveries with exponential backoff + jitter (per-channel policy) |
| Fallback channel | Re-publish to alternate channel queue when primary fails after max retries |
| Media processing | Download attachments, validate URLs/sizes, apply channel-specific rules. Pass processed media to adapter |
| Status publishing | Publish delivery status (SENT/FAILED) to `xch.notifications.status` based on adapter response |
| Adapter health monitoring | Periodic `GET /health` to each registered adapter; feed results into circuit breaker |
| Channel/provider config CRUD | REST endpoints for admin management (via Gateway) |

### Provider Adapter Service — Responsibilities

Everything **provider-specific** moves to the adapter. Each adapter is a tiny, focused NestJS service.

| Responsibility | Details |
|---|---|
| Translate dispatch → provider API call | Map the standardized `SendRequest` to the provider's specific API format (JSON, form-data, etc.) |
| Call the provider API | Use the provider's SDK or HTTP client. Handle the HTTP response. |
| Return standardized result | Return `SendResult { success, providerMessageId, retryable, errorMessage }` |
| Webhook signature verification | Verify inbound webhooks using the provider's specific method (ECDSA, HMAC, etc.) |
| Webhook event normalization | Map provider event names to internal statuses (DELIVERED, FAILED, etc.) |
| Publish normalized webhook events | Publish to `xch.notifications.status` via RabbitMQ |
| Health check | Test connectivity to the provider API |
| Provider-specific logic | E.g., Braze user profile sync, Twilio WhatsApp prefix formatting |
| Own its credentials | Credentials stored as adapter env vars or secret store — not passed by the core |

---

## The Adapter Contract

The core and adapters communicate via a **standardized HTTP interface**. Every adapter implements the same three endpoints. This is the formal contract that makes substitution possible.

### `POST /send` — Deliver a Notification

**Request:**

```json
{
  "notificationId": "n-af47ac10-58cc-4372-a567-0e02b2c3d479",
  "channel": "email",
  "priority": "critical",
  "recipient": {
    "email": "jane.doe@example.com",
    "phone": "+1234567890",
    "name": "Jane Doe",
    "customerId": "CUST-00451",
    "deviceToken": "fcm-token-xxx"
  },
  "content": {
    "subject": "Your order ORD-2026-00451 has been shipped!",
    "body": "<html>... pre-rendered ...</html>"
  },
  "media": [
    {
      "type": "document",
      "filename": "invoice.pdf",
      "mimeType": "application/pdf",
      "content": "base64-encoded-bytes...",
      "context": "attachment"
    }
  ],
  "metadata": {
    "correlationId": "corr-8f14e45f-ceea-467f-a8f5-5f1b39e5c7e2",
    "sourceId": "oms",
    "eventType": "order.shipped",
    "cycleId": "CYC-2026-00451",
    "dispatchedAt": "2026-02-20T10:15:31.456Z"
  }
}
```

Note: the core has **already processed media** before calling the adapter. For email, attachments are downloaded and base64-encoded. For WhatsApp/push, media URLs are passed through. For SMS, media is stripped. The adapter receives ready-to-use media data.

**Response:**

```json
{
  "success": true,
  "providerMessageId": "sg-abc123-def456",
  "retryable": false,
  "errorMessage": null,
  "httpStatus": 200,
  "providerResponse": {
    "raw": "..."
  }
}
```

| Field | Type | Description |
|---|---|---|
| `success` | boolean | Whether the provider accepted the message |
| `providerMessageId` | string / null | Provider's message ID for webhook correlation |
| `retryable` | boolean | Whether the core should retry (true for 5xx/timeout, false for 4xx) |
| `errorMessage` | string / null | Human-readable error description on failure |
| `httpStatus` | number | The HTTP status code received from the provider |
| `providerResponse` | object | Raw provider response for audit logging |

The core uses `success` and `retryable` to drive circuit breaker, retry, and fallback logic. The adapter makes the retryable/non-retryable classification since it understands its provider's error semantics.

### `GET /health` — Provider Health Check

**Response:**

```json
{
  "status": "ok",
  "providerId": "sendgrid",
  "providerName": "SendGrid",
  "supportedChannels": ["email"],
  "latencyMs": 45,
  "details": {
    "apiReachable": true,
    "lastSuccessfulSend": "2026-02-26T10:15:00Z"
  }
}
```

The core periodically calls this (configurable interval, e.g., every 30s) and feeds the result into the circuit breaker state machine. If `/health` fails or returns unhealthy, the circuit breaker can preemptively open.

### `GET /capabilities` — Adapter Self-Description

Called once at startup and on cache refresh. Allows the core to discover what the adapter supports without hardcoding.

**Response:**

```json
{
  "providerId": "sendgrid",
  "providerName": "SendGrid",
  "supportedChannels": ["email"],
  "supportsAttachments": true,
  "supportsMediaUrls": false,
  "maxAttachmentSizeMb": 30,
  "maxRecipientsPerRequest": 1,
  "webhookPath": "/webhooks/inbound"
}
```

---

## Webhook Flow (Decoupled)

Webhooks bypass the core entirely. Each adapter owns its provider's webhook verification and event normalization.

### Routing

The notification-gateway routes webhook requests to adapters by path prefix:

| External URL | Gateway Routes To |
|---|---|
| `POST /webhooks/sendgrid` | `http://provider-adapter-sendgrid:3170/webhooks/inbound` |
| `POST /webhooks/mailgun` | `http://provider-adapter-mailgun:3171/webhooks/inbound` |
| `POST /webhooks/twilio` | `http://provider-adapter-twilio:3173/webhooks/inbound` |
| `POST /webhooks/braze` | `http://provider-adapter-braze:3172/webhooks/inbound` |
| `POST /webhooks/{newProvider}` | `http://provider-adapter-{new}:{port}/webhooks/inbound` |

Adding a new webhook route to the gateway is configuration — a new proxy rule, not code.

### Standardized Webhook Event (Published to RabbitMQ by Adapter)

Every adapter normalizes provider-specific webhook payloads into this standard format before publishing:

```json
{
  "providerMessageId": "sg-abc123",
  "providerId": "sendgrid",
  "status": "DELIVERED",
  "channel": "email",
  "timestamp": "2026-02-26T10:20:00Z",
  "rawEvent": { "...provider-specific..." },
  "metadata": {
    "notificationId": "n-af47ac10-xxx",
    "correlationId": "corr-8f14e45f-xxx"
  }
}
```

Published to `xch.notifications.status` with routing key `channel-router.webhook.received`. The core never sees the raw provider webhook format.

---

## How to Add a New Provider (Step by Step)

This is the key value proposition. Here's what happens when the business asks for "add Postmark for email":

### Step 1 — Code the Adapter Service (~2-4 hours for a simple REST provider)

Use the adapter scaffold template (see below). Implement three things:

```
provider-adapter-postmark/
  src/
    main.ts                   ← boilerplate (from scaffold)
    app.module.ts             ← boilerplate
    send/
      send.controller.ts      ← POST /send — ~50 lines
      send.service.ts          ← translate dispatch → Postmark API call — ~80 lines
    webhooks/
      webhook.controller.ts   ← POST /webhooks/inbound — ~30 lines
      webhook.service.ts       ← verify signature + normalize events — ~60 lines
    health/
      health.controller.ts    ← GET /health, GET /capabilities — ~30 lines
    config/
      config.ts               ← env var schema (API key, server token) — ~20 lines
  .env                        ← POSTMARK_API_TOKEN, RABBITMQ_URL
  Dockerfile                  ← boilerplate (from scaffold)
  package.json                ← only deps: nestjs, @postmark/postmark, amqplib
```

**Total custom code: ~250-300 lines.** Everything else is scaffold boilerplate.

### Step 2 — Deploy

```bash
docker build -t provider-adapter-postmark .
docker run -d --name adapter-postmark --network notificationapi \
  -e POSTMARK_API_TOKEN=xxx \
  -e RABBITMQ_URL=amqp://... \
  -p 3176:3176 \
  provider-adapter-postmark
```

### Step 3 — Register in Core (Configuration Only)

```sql
INSERT INTO channel_router_service.provider_configs (
  provider_name, provider_id, channel, adapter_url,
  is_active, routing_weight, rate_limit_tokens_per_sec, rate_limit_max_burst
) VALUES (
  'Postmark', 'postmark', 'email', 'http://provider-adapter-postmark:3176',
  true, 50, 80, 160
);
```

Or via the admin API:

```
PUT /providers/register
{
  "providerName": "Postmark",
  "providerId": "postmark",
  "channel": "email",
  "adapterUrl": "http://provider-adapter-postmark:3176",
  "isActive": true,
  "routingWeight": 50,
  "rateLimiting": { "tokensPerSecond": 80, "maxBurst": 160 }
}
```

### Step 4 — Register Webhook Route in Gateway (Configuration Only)

Add to gateway routing config:

```json
{
  "path": "/webhooks/postmark",
  "target": "http://provider-adapter-postmark:3176/webhooks/inbound"
}
```

### Step 5 — Done

The core automatically:
- Discovers the new adapter via `provider_configs` cache refresh
- Calls `GET /capabilities` to learn what it supports
- Starts routing email traffic to it (based on routing_weight or active/failover config)
- Tracks circuit breaker state for it
- Enforces rate limits for it

**Zero code changes to the core. Zero redeployment of the core.**

---

## Database Changes to `provider_configs`

The existing `provider_configs` table needs these additions:

| New Column | Type | Description |
|---|---|---|
| `adapter_url` | `VARCHAR(255)` | Base URL of the adapter service (e.g., `http://provider-adapter-sendgrid:3170`) |
| `rate_limit_tokens_per_sec` | `INTEGER` | Token bucket refill rate (moves from env vars to DB — configurable per provider at runtime) |
| `rate_limit_max_burst` | `INTEGER` | Token bucket capacity |

The existing `config_json` column is **no longer needed for credentials** (adapters own their own credentials). It can still store adapter-specific metadata or be removed.

```
provider_configs (updated)
  ├── id                       UUID PK
  ├── provider_name            VARCHAR(50)     — "SendGrid"
  ├── provider_id              VARCHAR(50)     — "sendgrid"
  ├── channel                  VARCHAR(20)     — "email"
  ├── adapter_url              VARCHAR(255)    — "http://provider-adapter-sendgrid:3170"   ← NEW
  ├── is_active                BOOLEAN
  ├── routing_weight           INTEGER
  ├── rate_limit_tokens_per_sec INTEGER        ← NEW (moved from env vars)
  ├── rate_limit_max_burst     INTEGER         ← NEW (moved from env vars)
  ├── circuit_breaker_state    VARCHAR(20)
  ├── failure_count            INTEGER
  ├── last_failure_at          TIMESTAMP
  ├── last_health_check        TIMESTAMP
  ├── created_at               TIMESTAMP
  └── updated_at               TIMESTAMP
```

---

## Adapter Service Scaffold / Template

To make adapter creation fast and consistent, the project should provide a scaffold generator. This can be a simple CLI script or a template repository.

### Scaffold Structure

```
provider-adapter-template/
  src/
    main.ts                       ← NestJS bootstrap (fixed)
    app.module.ts                 ← Imports config, send, webhook, health modules (fixed)
    send/
      send.controller.ts          ← POST /send — delegates to service (fixed)
      send.service.ts             ← ABSTRACT: developer implements translateAndSend()
      send-request.dto.ts         ← Standardized input DTO (fixed)
      send-result.dto.ts          ← Standardized output DTO (fixed)
    webhooks/
      webhook.controller.ts       ← POST /webhooks/inbound — delegates to service (fixed)
      webhook.service.ts          ← ABSTRACT: developer implements verify() + normalize()
      webhook-event.dto.ts        ← Standardized output DTO (fixed)
    health/
      health.controller.ts        ← GET /health, GET /capabilities (fixed)
      health.service.ts           ← ABSTRACT: developer implements checkProvider()
      capabilities.dto.ts         ← Response DTO (fixed)
    rabbitmq/
      rabbitmq.module.ts          ← RabbitMQ connection for webhook publishing (fixed)
      webhook-publisher.ts        ← Publishes normalized events to xch.notifications.status (fixed)
    config/
      base-config.ts              ← PORT, RABBITMQ_URL, LOG_LEVEL (fixed)
      provider-config.ts          ← ABSTRACT: developer adds provider-specific env vars
  Dockerfile                      ← Multi-stage build (fixed)
  tsconfig.json                   ← Shared config (fixed)
  package.json                    ← Base dependencies (fixed)
  jest.config.ts                  ← Test config (fixed)
```

Files marked `(fixed)` are provided by the scaffold and never modified. Files marked `ABSTRACT` are the only ones the developer touches. The developer fills in 3 methods:

1. **`sendService.translateAndSend(request: SendRequest): Promise<SendResult>`** — Build the provider API request and call it
2. **`webhookService.verify(headers, body): boolean`** — Verify the provider's webhook signature
3. **`webhookService.normalize(body): WebhookEvent[]`** — Map provider events to standardized format

---

## Comparison of All Three Approaches

| Aspect | Current Design (Monolith) | Proposal 1: In-Process Generic Adapter | Proposal 2: Adapter Microservices |
|---|---|---|---|
| **New simple provider** | Full adapter class + webhook route in core | Config-only (no code at all) | Small adapter service (~250 LOC) |
| **New complex provider** | Full adapter class in core | Still needs code in core | Isolated adapter service, core untouched |
| **Core changes on new provider** | Yes — new class, new routes, new deps | Minimal (if generic covers it) | **None** |
| **Core redeployment** | Yes | Yes (config change requires cache refresh) | **No** |
| **Failure isolation** | Provider SDK bug crashes entire core | Same — still in-process | Provider SDK bug only crashes its adapter |
| **Independent scaling** | All providers scale together | Same | Scale email adapters independently from SMS |
| **Dependency isolation** | Core depends on ALL provider SDKs | Core depends on ALL native SDKs | Each adapter only has its own SDK |
| **Deployment complexity** | 1 service | 1 service | 6+ services (1 core + N adapters) |
| **Network latency** | None (in-process) | None (in-process) | +1-5ms per HTTP call to adapter |
| **Testing** | All providers tested together | Same | Each adapter has its own isolated test suite |
| **Provider credential scope** | All creds in one service | Same | Each adapter holds only its own creds |
| **Webhook handling** | All in core | All in core | Each adapter handles its own webhooks |
| **Operational overhead** | Low | Low | Higher (more containers, more monitoring) |

---

## Trade-offs and Mitigations

### Added Latency (~1-5ms per send)

The HTTP call from core to adapter adds latency to the critical delivery path.

**Mitigation:** The current design already has 2-10ms provider API call latency. The adapter call is on a Docker internal network (~1ms). Total path goes from ~5ms to ~6ms — negligible. The core's async fire-and-forget audit pattern is unchanged.

### More Services to Deploy and Monitor

Going from 1 service to 6+ services increases operational complexity.

**Mitigation:**
- All adapters use the same Dockerfile template — consistent build/deploy
- Same health check contract — uniform monitoring
- Docker Compose / Kubernetes manifests manage them as a group
- The core's `/ready` endpoint already checks per-provider health; it now calls adapter `/health` endpoints instead of provider APIs directly

### Adapter Needs RabbitMQ for Webhooks

Each adapter publishes normalized webhook events to RabbitMQ, requiring its own AMQP connection.

**Mitigation:** This is a lightweight read-only-publish connection. Alternatively, the adapter can call the core via HTTP (`POST /webhook-events`) and let the core publish — trading the RabbitMQ dependency for an HTTP dependency. Both work; the RabbitMQ approach is more aligned with the existing fire-and-forget architecture.

### Credential Management is Distributed

Each adapter manages its own credentials instead of the core holding all credentials in `provider_configs.config_json`.

**Mitigation:** This is actually a **security improvement** — blast radius is reduced. A compromised SendGrid adapter only leaks SendGrid credentials, not Twilio/Braze/etc. Use container-level secrets (Docker secrets, K8s secrets, or a vault) per adapter.

---

## Combining Proposals: The Full Architecture

Proposals 1 and 2 are not mutually exclusive. The **Generic HTTP Adapter** from Proposal 1 can be deployed as one of the adapter microservices from Proposal 2:

```
Channel Router Core (:3154)                         ← NEVER CHANGES for new providers
  │
  ├── HTTP → provider-adapter-sendgrid (:3170)      ← Dedicated adapter (~300 LOC)
  ├── HTTP → provider-adapter-mailgun  (:3171)      ← Dedicated adapter (~300 LOC)
  ├── HTTP → provider-adapter-braze    (:3172)      ← Dedicated adapter (~500 LOC)
  ├── HTTP → provider-adapter-twilio   (:3173)      ← Dedicated adapter (~400 LOC)
  ├── HTTP → provider-adapter-fcm      (:3174)      ← Dedicated adapter (~300 LOC)
  │
  └── HTTP → provider-adapter-generic  (:3175)      ← Config-driven (NO CODE for new providers)
               │
               ├── Postmark      (JSON config in adapter's DB/env)
               ├── Amazon SES    (JSON config)
               ├── Vonage SMS    (JSON config)
               └── MessageBird   (JSON config)
```

This gives three tiers of effort for new providers:

| Provider Complexity | Onboarding Effort | Examples |
|---|---|---|
| Simple REST API with JSON + HMAC webhooks | **Zero code** — register in generic adapter via config | Postmark, SparkPost, Amazon SES |
| REST API with non-standard auth or payload format | **~250 LOC** — new dedicated adapter from scaffold | Vonage, MessageBird, custom internal provider |
| Complex provider with SDK, profile sync, multi-channel | **~500 LOC** — new dedicated adapter with custom logic | Braze, Twilio, any provider requiring pre-send setup |

---

## Recommendation

### Build the adapter microservice architecture from Phase 1

Unlike Proposal 1 (which was recommended as a Phase 2 addition), the decoupled adapter architecture should be the **primary design from the start** because:

1. **The `ProviderStrategy` interface already defines the contract** — the design doc's interface (`send()`, `verifyWebhook()`, `healthCheck()`) maps directly to the HTTP adapter contract. Moving this across a network boundary is a straightforward refactor, not a redesign.

2. **Failure isolation is critical for a delivery service** — a bug in the Twilio SDK should not bring down email delivery via SendGrid. With in-process adapters, a single provider failure can crash the entire core.

3. **Provider SDKs are a dependency burden** — the monolithic design forces the core to depend on `@sendgrid/mail`, `mailgun.js`, `twilio`, `firebase-admin`, and a custom Braze HTTP client. These have conflicting dependencies, large install sizes, and independent security advisory timelines. Isolating them in separate services eliminates dependency hell.

4. **Independent deployment matches how providers change** — when SendGrid updates their API or deprecates an endpoint, only the SendGrid adapter needs updating and redeploying. The core and all other adapters are unaffected.

5. **The operational cost is manageable** — the scaffold template keeps adapter creation fast, the shared HTTP contract keeps monitoring uniform, and Docker Compose / Kubernetes manages the service group.

### Implementation Order

| Phase | What | Core Changes | Adapters |
|---|---|---|---|
| **Phase 1** | Core + first 2 adapters (SendGrid + Mailgun) | Build the full core with HTTP adapter client, circuit breaker, rate limiter, retry engine | Deploy SendGrid and Mailgun adapters from scaffold |
| **Phase 2** | Remaining adapters (Twilio, Braze, FCM) | None | Deploy 3 more adapters |
| **Phase 3** | Generic HTTP adapter | None | Deploy generic adapter for config-only onboarding |
| **Future** | Any new provider | **None — just configuration** | Deploy from scaffold (~250 LOC) or register in generic adapter (0 LOC) |
