> **Note:** This is a convenience copy. The authoritative version is at `../../docs/11-channel-router-service.md`.

---

# 11 — Channel Router Service

**Notification API — Channel Router Service Deep-Dive**

| | |
|---|---|
| **Version:** | 1.0 |
| **Date:** | 2026-02-21 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [Architecture & Integration Points](#2-architecture--integration-points)
3. [Delivery Pipeline](#3-delivery-pipeline)
4. [Provider Strategy Pattern](#4-provider-strategy-pattern)
5. [Provider Adapters](#5-provider-adapters)
6. [Rate Limiting](#6-rate-limiting)
7. [Circuit Breaker Pattern](#7-circuit-breaker-pattern)
8. [Retry Strategy & Exponential Backoff](#8-retry-strategy--exponential-backoff)
9. [Fallback Channel Logic](#9-fallback-channel-logic)
10. [Media & Attachment Handling](#10-media--attachment-handling)
11. [Webhook Receivers & Delivery Status](#11-webhook-receivers--delivery-status)
12. [Braze User Profile Synchronization](#12-braze-user-profile-synchronization)
13. [RabbitMQ Topology](#13-rabbitmq-topology)
14. [REST API Endpoints](#14-rest-api-endpoints)
15. [Database Design](#15-database-design)
16. [Asynchronous Audit Logging](#16-asynchronous-audit-logging)
17. [Sequence Diagrams](#17-sequence-diagrams)
18. [Error Handling](#18-error-handling)
19. [Security Considerations](#19-security-considerations)
20. [Monitoring & Health Checks](#20-monitoring--health-checks)
21. [Configuration](#21-configuration)

---

## 1. Service Overview

The Channel Router Service is the last-mile delivery component of the Notification API platform. It receives fully rendered notification messages from the Notification Engine (via RabbitMQ), routes them to the appropriate external delivery provider based on the target channel and active provider configuration, manages delivery retries with exponential backoff, implements circuit breaker patterns for provider resilience, tracks delivery statuses, and supports fallback channel logic when a primary channel fails. All audit and delivery log writes are performed asynchronously via RabbitMQ fire-and-forget messaging to avoid blocking the critical delivery path.

| Attribute | Value |
|---|---|
| **Technology** | NestJS (TypeScript) with RabbitMQ consumers (`@golevelup/nestjs-rabbitmq`) |
| **Port** | `3154` |
| **Schema** | PostgreSQL — `channel_router_service` |
| **Dependencies** | RabbitMQ, External providers (SendGrid, Mailgun, Braze, Twilio, Firebase), PostgreSQL |
| **Source Repo Folder** | `channel-router-service/` |

### Responsibilities

1. **Channel Routing Logic:** Receives notifications tagged with a target channel and routes them to the corresponding provider adapter. Each adapter encapsulates the provider-specific API integration behind a common `ProviderStrategy` interface.
2. **Provider Integration:** Maintains dedicated adapter modules for each external provider — SendGrid and Mailgun for email, Twilio for SMS and WhatsApp, Firebase Cloud Messaging (FCM) for push, and Braze as a unified multi-channel provider (email, SMS, WhatsApp, push). All providers operate as "dumb pipes" — they receive pre-rendered content from the Template Service and handle only delivery mechanics.
3. **Retry Logic with Exponential Backoff:** Failed deliveries are retried with configurable exponential backoff delays and jitter. Each channel has its own retry policy (max attempts, base delay, backoff multiplier). After exhausting retries, the notification is moved to the dead letter queue.
4. **Circuit Breaker Pattern:** Implements a circuit breaker for each provider. If a provider exceeds a failure threshold within a time window, the circuit opens and subsequent requests are immediately fast-failed until the provider recovers. This prevents cascading failures and resource exhaustion.
5. **Delivery Status Tracking:** Publishes delivery status updates (sent, delivered, bounced, failed) to the `xch.notifications.status` exchange via fire-and-forget for consumption by the Audit Service and Notification Engine.
6. **Fallback Channel Support:** When a primary channel fails after all retries, the service can optionally trigger a fallback channel (e.g., if SMS delivery fails, attempt email delivery) based on the notification's fallback configuration.
7. **Webhook Receivers:** Exposes webhook endpoints for delivery status callbacks from providers (SendGrid, Mailgun, Twilio, Braze) with signature verification per provider.
8. **Token Bucket Rate Limiting:** Enforces per-provider outbound rate limits using a token bucket algorithm to stay within contractual provider quotas.
9. **Media & Attachment Handling:** Processes the `media` array from dispatch messages with channel-specific rules — downloading attachments for email, passing media URLs for WhatsApp and push.
10. **Braze User Profile Sync:** Maintains a lightweight synchronization module to keep Braze user profiles updated with recipient contact information (`external_user_id`, email, phone, device tokens) before sending via Braze.
11. **Asynchronous Audit Logging:** All delivery attempt records and status transitions are published to RabbitMQ as fire-and-forget messages — no synchronous database writes on the critical delivery path.

> **Info:** **Dumb Pipe Architecture**
>
> All providers — including Braze and Mailgun, both of which offer their own templating systems — are integrated as "dumb pipes." The Channel Router sends pre-rendered content produced by the Template Service. Provider-side templates, Liquid engines, and Mailgun's Handlebars rendering are deliberately unused to preserve our Template Service's ownership of rendering, custom helpers, immutable versioning, multi-channel consistency, and provider portability.

---

## 2. Architecture & Integration Points

The Channel Router sits at the end of the notification pipeline — downstream from the Notification Engine and upstream of external delivery providers. It is a pure consumer: it receives fully rendered messages from RabbitMQ, delivers them to providers via HTTP, and publishes status events back to RabbitMQ.

### Upstream & Downstream Dependencies

| Direction | System | Protocol | Description |
|---|---|---|---|
| **Upstream** | Notification Engine | RabbitMQ (AMQP) | Consumes rendered notification dispatch messages from `xch.notifications.deliver` exchange via priority-tiered, channel-specific queues |
| **Downstream** | SendGrid | HTTP/REST (sync) | Email delivery via `POST /v3/mail/send` with pre-rendered HTML |
| **Downstream** | Mailgun | HTTP/REST (sync) | Email delivery via `POST /v3/{domain}/messages` with pre-rendered HTML (multipart/form-data) |
| **Downstream** | Braze | HTTP/REST (sync) | Multi-channel delivery via `POST /messages/send` with inline pre-rendered content |
| **Downstream** | Twilio | HTTP/REST (sync) | SMS delivery via Messages API; WhatsApp delivery via WhatsApp Business API |
| **Downstream** | Firebase Cloud Messaging | HTTP/REST (sync) | Push notification delivery via FCM v1 HTTP API |
| **Downstream** | Audit Service | RabbitMQ (AMQP) | Publishes delivery status transitions and delivery attempt records (fire-and-forget) to `xch.notifications.status` exchange |
| **Upstream** | Notification Engine | RabbitMQ (AMQP) | Publishes final delivery status (SENT, DELIVERED, FAILED) back to `xch.notifications.status` for lifecycle updates |
| **Inbound** | Provider Webhooks | HTTP (async callbacks) | Receives delivery receipts from SendGrid, Mailgun, Twilio, and Braze |
| **Inbound** | Admin Service (via Gateway) | HTTP/REST (sync) | Channel and provider configuration management proxied through the Notification Gateway |

### Figure 2.1 — Integration Context

```
                                                 ┌───────────────────────┐
                                                 │   Admin Service       │
                                                 │   :3155 (via Gateway) │
                                                 │   Channel & Provider  │
                                                 │   Configuration CRUD  │
                                                 └──────────┬────────────┘
                                                            │ HTTP (config mgmt)
                                                            ▼
┌──────────────────────────┐      ┌────────────────────────────────────────────────────────────┐
│ xch.notifications.deliver│      │              Channel Router Service                        │
│ (Topic Exchange)         │─────▶│              :3154                                         │
│                          │      │                                                            │
│ q.deliver.{channel}.     │      │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│   {priority}             │      │  │  Dispatch     │  │  Provider    │  │  Circuit Breaker │ │
│                          │      │  │  Router       │──▶│  Strategy    │──▶│  + Rate Limiter │ │
└──────────────────────────┘      │  │  (Channel)    │  │  (Interface) │  │  (Token Bucket)  │ │
                                  │  └──────────────┘  └──────────────┘  └────────┬─────────┘ │
                                  │                                                │           │
                                  │  ┌───────────────────────────────────────────────────────┐ │
                                  │  │  Provider Adapters                                    │ │
                                  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │ │
                                  │  │  │ SendGrid │ │ Mailgun  │ │  Braze   │ │  Twilio  │ │ │
                                  │  │  │ (Email)  │ │ (Email)  │ │ (Multi)  │ │(SMS/WA)  │ │ │
                                  │  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │ │
                                  │  │  ┌──────────┐                                        │ │
                                  │  │  │   FCM    │                                        │ │
                                  │  │  │  (Push)  │                                        │ │
                                  │  │  └──────────┘                                        │ │
                                  │  └───────────────────────────────────────────────────────┘ │
                                  │                                                            │
                                  │  PostgreSQL: channel_router_service                        │
                                  └─────────────────────────┬──────────────────────────────────┘
                                                            │ Status transitions (fire-and-forget)
                                                            ▼
                                  ┌───────────────────────────┐
                                  │ xch.notifications.status  │
                                  │ (Topic Exchange)          │
                                  │                           │──────────────────────▶ Audit Service :3156
                                  └───────────────────────────┘                       Notification Engine :3152

                                  ┌───────────────────────────────────────────────────────┐
                                  │  Provider Webhooks (Inbound)                          │
                                  │  POST /webhooks/sendgrid   — SendGrid events          │
                                  │  POST /webhooks/mailgun    — Mailgun events           │
                                  │  POST /webhooks/twilio     — Twilio status callbacks  │
                                  │  POST /webhooks/braze      — Braze transactional      │
                                  └───────────────────────────────────────────────────────┘
```

---

## 3. Delivery Pipeline

Every message consumed from the `xch.notifications.deliver` exchange passes through a 7-step delivery pipeline. This pipeline is the critical path — it is optimized for speed and resilience with no synchronous database writes.

### 3.1 Pipeline Steps

1. **Consume Message:** Receive the dispatch message from the priority-tiered, channel-specific RabbitMQ queue (e.g., `q.deliver.email.critical`).
2. **Resolve Provider:** Look up the active provider for the target channel from the `provider_configs` table (cached in memory with event-driven invalidation).
3. **Check Circuit Breaker:** Verify the resolved provider's circuit breaker is in `CLOSED` or `HALF_OPEN` state. If `OPEN`, fast-fail and proceed to retry/fallback logic.
4. **Rate Limit Check:** Acquire a token from the provider's token bucket rate limiter. If no token is available, delay (back-pressure) until a token becomes available or a configurable timeout is reached.
5. **Process Media:** If the dispatch message includes a `media` array, process entries according to channel-specific rules (download attachments for email, pass URLs for WhatsApp/push, skip for SMS).
6. **Send to Provider:** Call the provider adapter's `send()` method with the pre-rendered content. The adapter translates the generic dispatch message into the provider-specific API format.
7. **Publish Status & ACK:** Publish the delivery status (SENT or FAILED) to `xch.notifications.status` as a fire-and-forget message. Publish a `delivery_attempt` record asynchronously. ACK the RabbitMQ message.

### Figure 3.1 — Delivery Pipeline Flowchart

```
    ┌───────────────────────────────┐
    │  1. Consume Dispatch Message   │  ◄── RabbitMQ: q.deliver.{channel}.{priority}
    └──────────────┬────────────────┘
                   ▼
    ┌───────────────────────────────┐
    │  2. Resolve Active Provider    │  ◄── provider_configs (in-memory cache)
    └──────────────┬────────────────┘
                   ▼
     ◆ 3. Circuit Breaker Check  ◆
                   │
          ┌────────┴────────┐
          │                 │
       CLOSED/           OPEN
       HALF_OPEN            │
          │                 ▼
          │        ┌─────────────────┐
          │        │  Fast-fail      │
          │        │  → Retry queue  │
          │        │  or Fallback    │
          │        └─────────────────┘
          ▼
    ┌───────────────────────────────┐
    │  4. Rate Limit (Token Bucket)  │  ◄── Acquire token; back-pressure if depleted
    └──────────────┬────────────────┘
                   ▼
    ┌───────────────────────────────┐
    │  5. Process Media (if any)     │  ◄── Download attachments (email), pass URLs (WA/push)
    └──────────────┬────────────────┘
                   ▼
    ┌───────────────────────────────┐
    │  6. Send to Provider           │  ◄── ProviderAdapter.send(dispatchMessage)
    └──────────────┬────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
       Success           Failure
       (2xx)             (4xx/5xx/timeout)
          │                 │
          ▼                 ▼
    ┌──────────┐    ┌──────────────────┐
    │  Record  │    │  Update circuit   │
    │  SENT    │    │  breaker state    │
    │  status  │    │  Evaluate retry   │
    └──────────┘    │  or fallback      │
                    └──────────────────┘
                   │
                   ▼
    ┌───────────────────────────────┐
    │  7. Publish Status & ACK       │  ◄── Fire-and-forget to xch.notifications.status
    └───────────────────────────────┘      ACK the RabbitMQ message
```

### 3.2 Dispatch Message Schema (Inbound)

The Channel Router consumes messages from the Notification Engine with the following schema (defined in [08 — Notification Engine Service §8.1](08-notification-engine-service.md#81-dispatch-message-schema)):

```json
{
  "notificationId": "n-af47ac10-58cc-4372-a567-0e02b2c3d479",
  "eventId": "af47ac10b-58cc-4372-a567-0e02b2c3d479",
  "ruleId": "r-550e8400-e29b-41d4-a716-446655440000",
  "channel": "email",
  "priority": "critical",
  "recipient": {
    "email": "jane.doe@example.com",
    "phone": "+1234567890",
    "name": "Jane Doe",
    "customerId": "CUST-00451"
  },
  "content": {
    "subject": "Your order ORD-2026-00451 has been shipped!",
    "body": "<html>...</html>",
    "templateId": "tpl-order-shipped",
    "templateVersion": 3
  },
  "media": [
    {
      "type": "image",
      "url": "https://cdn.store.com/products/headphones-200x200.jpg",
      "alt": "Wireless Headphones",
      "context": "inline"
    },
    {
      "type": "document",
      "url": "https://docs.store.com/invoices/INV-2026-00451.pdf",
      "filename": "invoice-ORD-2026-00451.pdf",
      "mimeType": "application/pdf",
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

> **Info:** **Pre-Rendered Content:** The `content.body` field contains fully rendered output from the Template Service. For email, this is complete HTML. For SMS, this is plain text. For WhatsApp, this is message text. For push, this is the notification body. The Channel Router never interprets or transforms this content — it passes it directly to the provider API.

---

## 4. Provider Strategy Pattern

The Channel Router uses the **Strategy Pattern** to abstract provider-specific delivery logic behind a common interface. This enables provider portability (swap providers by changing configuration), multi-provider support (multiple providers active per channel), and gradual migration between providers.

### 4.1 ProviderStrategy Interface

Every provider adapter implements the `ProviderStrategy` interface:

```typescript
interface ProviderStrategy {
  /** Unique provider identifier (e.g., "sendgrid", "mailgun", "braze") */
  readonly providerId: string;

  /** Channels this provider supports */
  readonly supportedChannels: Channel[];

  /** Send a pre-rendered notification to the provider */
  send(message: DispatchMessage): Promise<SendResult>;

  /** Verify a webhook signature from this provider */
  verifyWebhook(request: WebhookRequest): boolean;

  /** Health check for the provider */
  healthCheck(): Promise<ProviderHealth>;
}

interface SendResult {
  success: boolean;
  providerMessageId: string | null;
  providerResponse: Record<string, unknown>;
  retryable: boolean;
  errorMessage?: string;
}
```

### 4.2 Provider Resolution

When a dispatch message arrives, the router resolves the active provider for the target channel:

```
Dispatch message (channel: "email")
    │
    ▼
┌──────────────────────────────────────────┐
│  Provider Resolution                      │
│                                          │
│  1. Query provider_configs (cached)       │
│     WHERE channel = "email"               │
│     AND is_active = true                  │
│                                          │
│  2. If multiple active providers:         │
│     Select by routing_weight (weighted    │
│     random) or routing_mode (primary/     │
│     failover)                             │
│                                          │
│  3. Return ProviderStrategy instance      │
└──────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────┐
│  Resolved: MailgunEmailProvider           │
│  or: BrazeEmailProvider                  │
│  or: SendGridProvider                    │
└──────────────────────────────────────────┘
```

### 4.3 Routing Modes

| Mode | Description | Use Case |
|---|---|---|
| `primary` | All traffic goes to the primary provider. Failover provider used only when circuit breaker opens. | Default — simple, predictable routing |
| `weighted` | Traffic distributed across providers by `routing_weight` percentage (e.g., 80% Mailgun, 20% SendGrid). | A/B testing, gradual migration, load distribution |
| `failover` | Ordered provider list. If provider N fails and circuit opens, traffic moves to provider N+1. | High availability — automatic provider failover |

### 4.4 Provider Registry

```
Channel Router
  │
  ├── ProviderRegistry (in-memory, cached from provider_configs)
  │     │
  │     ├── Email Providers
  │     │     ├── SendGridProvider      (implements ProviderStrategy)
  │     │     ├── MailgunProvider       (implements ProviderStrategy)
  │     │     └── BrazeEmailProvider    (implements ProviderStrategy)
  │     │
  │     ├── SMS Providers
  │     │     ├── TwilioSmsProvider     (implements ProviderStrategy)
  │     │     └── BrazeSmsProvider      (implements ProviderStrategy)
  │     │
  │     ├── WhatsApp Providers
  │     │     ├── TwilioWhatsAppProvider (implements ProviderStrategy)
  │     │     └── BrazeWhatsAppProvider  (implements ProviderStrategy)
  │     │
  │     └── Push Providers
  │           ├── FcmProvider           (implements ProviderStrategy)
  │           └── BrazePushProvider     (implements ProviderStrategy)
  │
  └── ProviderResolver (selects active provider per channel + routing mode)
```

---

## 5. Provider Adapters

Each provider adapter translates the generic `DispatchMessage` into the provider-specific API format. All adapters send **pre-rendered content** — no provider-side templating is used.

### 5.1 SendGrid (Email)

| Attribute | Value |
|---|---|
| **SDK** | `@sendgrid/mail` |
| **Auth** | API key in `Authorization: Bearer {key}` header |
| **Endpoint** | `POST https://api.sendgrid.com/v3/mail/send` |
| **Content Format** | JSON with `personalizations`, `from`, `subject`, `content` (HTML) |
| **Rate Limit** | 100 emails/sec (Pro plan) |
| **Webhook Events** | `processed`, `delivered`, `bounce`, `deferred`, `open`, `click`, `spamreport`, `unsubscribe` |
| **Webhook Verification** | Event Webhook Verification Key (ECDSA signature) |

**Mapping:**

| Dispatch Field | SendGrid API Field |
|---|---|
| `recipient.email` | `personalizations[0].to[0].email` |
| `recipient.name` | `personalizations[0].to[0].name` |
| `content.subject` | `subject` |
| `content.body` (HTML) | `content[0].value` (type: `text/html`) |
| `media[context=attachment]` | `attachments[]` (Base64-encoded after download) |

### 5.2 Mailgun (Email)

Mailgun is integrated as a **dumb pipe** — pre-rendered HTML from the Template Service is sent directly. Mailgun's server-side Handlebars template system is deliberately unused to preserve our Template Service's ownership of rendering, custom helpers (`formatCurrency`, `formatDate`, etc.), unlimited template/version capacity, multi-channel consistency, and provider portability.

| Attribute | Value |
|---|---|
| **SDK** | `mailgun.js` + `form-data` |
| **Auth** | HTTP Basic Auth (`api:{API_KEY}`) |
| **Endpoint** | `POST https://api.mailgun.net/v3/{domain}/messages` (US) or `https://api.eu.mailgun.net/v3/{domain}/messages` (EU) |
| **Content Format** | `multipart/form-data` with `from`, `to`, `subject`, `html`, `attachment` fields |
| **Rate Limit** | Plan-dependent; auto-throttled by Mailgun (ESP warm-up built in) |
| **Webhook Events** | `accepted`, `delivered`, `temporary_fail`, `permanent_fail`, `opened`, `clicked`, `unsubscribed`, `complained` |
| **Webhook Verification** | HMAC-SHA256 with dedicated Webhook Signing Key (separate from API key) |

**Mapping:**

| Dispatch Field | Mailgun API Field |
|---|---|
| `recipient.email` | `to` |
| `content.subject` | `subject` |
| `content.body` (HTML) | `html` |
| `media[context=attachment]` | `attachment` (binary multipart field after download) |
| `metadata.correlationId` | `v:correlationId` (custom variable for webhook correlation) |
| `metadata.notificationId` | `v:notificationId` (custom variable for webhook correlation) |

> **Info:** **Why Not Use Mailgun Templates?**
>
> Mailgun offers a server-side Handlebars template engine, but it is deliberately unused because: (1) it does not support custom helpers (`formatCurrency`, `formatDate`, etc.) — our templates using these would break; (2) it is limited to 100 templates and 40 versions per template; (3) it only supports email — SMS, WhatsApp, and push templates would remain in our system, creating split ownership; (4) it creates provider lock-in — switching email providers would require migrating all templates; (5) it would fracture the uniform rendering pipeline where all channels are rendered by the same engine. See [temporary/mailgun analysis.md] for the full analysis.

**Mailgun Auto-Throttling Advantage:**

Unlike SendGrid's fixed rate limits (100/sec), Mailgun handles ESP-level throttling and warm-up automatically. The Channel Router's token bucket rate limiter for Mailgun can use a more relaxed configuration since Mailgun manages delivery pacing internally. The rate limiter primarily guards against API-level overload, not ESP-level throttling.

**Mailgun Built-In Retry for Soft Bounces:**

Mailgun automatically retries `temporary_fail` events (soft bounces) internally before surfacing them. The Channel Router's retry logic for Mailgun focuses only on API-level failures (network errors, timeouts, 5xx responses), not delivery-level transient errors. This simplifies the email retry strategy compared to providers that surface every transient failure.

### 5.3 Braze (Multi-Channel — Email, SMS, WhatsApp, Push)

Braze is integrated using **Pattern A: "Braze as Dumb Pipe"** — the Channel Router sends pre-rendered content via the `/messages/send` endpoint with inline message objects. Braze acts as a unified delivery abstraction layer, routing to its own downstream providers (e.g., SparkPost for email, Twilio for SMS) without rendering or templating.

| Attribute | Value |
|---|---|
| **SDK** | Custom HTTP client (Braze REST API) |
| **Auth** | API key in `Authorization: Bearer {key}` header |
| **Endpoint** | `POST https://rest.iad-01.braze.com/messages/send` (instance-specific URL) |
| **Content Format** | JSON with `external_user_ids`, `messages` object containing channel-specific payloads |
| **Rate Limit** | 250,000 req/hour (shared across all `/messages/send` and `/campaigns/trigger/send`) |
| **Max Recipients** | 50 per request |
| **Webhook Events** | Transactional HTTP postbacks (email only); Braze Currents (all channels, ~5 min batch delay) |

**Braze API Request Mapping (per channel):**

**Email via Braze:**

| Dispatch Field | Braze API Field |
|---|---|
| `recipient.customerId` | `external_user_ids[0]` |
| `content.subject` | `messages.email.subject` |
| `content.body` (HTML) | `messages.email.body` |
| `metadata.notificationId` | `messages.email.extras.notificationId` |

**SMS via Braze:**

| Dispatch Field | Braze API Field |
|---|---|
| `recipient.customerId` | `external_user_ids[0]` |
| `content.body` (text) | `messages.sms.body` |
| Provider config `subscriptionGroupId` | `messages.sms.subscription_group_id` |

**WhatsApp via Braze:**

| Dispatch Field | Braze API Field |
|---|---|
| `recipient.customerId` | `external_user_ids[0]` |
| `content.body` (text) | `messages.whats_app.body` |

**Push via Braze:**

| Dispatch Field | Braze API Field |
|---|---|
| `recipient.customerId` | `external_user_ids[0]` |
| `content.subject` (title) | `messages.apple_push.alert.title` / `messages.android_push.title` |
| `content.body` | `messages.apple_push.alert.body` / `messages.android_push.alert` |

> **Info:** **Why Pattern A (Dumb Pipe)?**
>
> Pattern A preserves our Template Service's Handlebars rendering, immutable versioning, custom helpers, and multi-channel consistency. Braze's value is in multi-channel delivery infrastructure (deliverability optimization, engagement analytics, subscription management) — not in replacing our orchestration or templating layers. Pattern B (Braze as template owner) was rejected because it would: require rewriting all templates in Liquid, create split template management (Braze for email, ours for others), lose custom helpers, and introduce vendor lock-in on template logic. See [temporary/braze analysis.md] for the full analysis.

### 5.4 Twilio (SMS)

| Attribute | Value |
|---|---|
| **SDK** | `twilio` (Node.js helper library) |
| **Auth** | Account SID + Auth Token (HTTP Basic Auth) |
| **Endpoint** | `POST https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json` |
| **Content Format** | `application/x-www-form-urlencoded` with `From`, `To`, `Body` |
| **Rate Limit** | ~30 SMS/sec per number (varies by destination country) |
| **Webhook Events** | Status callback URL per message (`StatusCallback` parameter) |

**Mapping:**

| Dispatch Field | Twilio API Field |
|---|---|
| `recipient.phone` | `To` (E.164 format) |
| `content.body` (plain text) | `Body` |
| Provider config `fromNumber` | `From` |
| Provider config `messagingServiceSid` | `MessagingServiceSid` (alternative to `From`) |
| Webhook callback URL | `StatusCallback` |

### 5.5 Twilio / WhatsApp Business API

| Attribute | Value |
|---|---|
| **SDK** | `twilio` (Node.js helper library) |
| **Auth** | Account SID + Auth Token |
| **Endpoint** | `POST https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json` |
| **Content Format** | `application/x-www-form-urlencoded` with `From` (whatsapp:+number), `To` (whatsapp:+number), `Body` |
| **Rate Limit** | 80 messages/sec |
| **Media Support** | `MediaUrl` parameter for images and documents (Twilio fetches from URL) |

**Mapping:**

| Dispatch Field | Twilio WhatsApp API Field |
|---|---|
| `recipient.phone` | `To` (`whatsapp:+{phone}`) |
| `content.body` (text) | `Body` |
| Provider config `businessNumber` | `From` (`whatsapp:+{number}`) |
| `media[].url` | `MediaUrl` (one per media entry) |

### 5.6 Firebase Cloud Messaging (Push)

| Attribute | Value |
|---|---|
| **SDK** | `firebase-admin` |
| **Auth** | Service account key (JWT-based OAuth2) |
| **Endpoint** | `POST https://fcm.googleapis.com/v1/projects/{projectId}/messages:send` |
| **Content Format** | JSON with `message.notification`, `message.token`, `message.data` |
| **Rate Limit** | 500 messages/sec per project |

**Mapping:**

| Dispatch Field | FCM API Field |
|---|---|
| `recipient.deviceToken` | `message.token` |
| `content.subject` (title) | `message.notification.title` |
| `content.body` | `message.notification.body` |
| `media[type=image, context=inline]` (first) | `message.notification.image` |
| `metadata.notificationId` | `message.data.notificationId` |

### 5.7 Provider Summary Table

| Channel | Provider | Provider ID | Status | Integration Pattern |
|---|---|---|---|---|
| **Email** | SendGrid | `sendgrid` | Active | Dumb pipe — pre-rendered HTML via JSON API |
| **Email** | Mailgun | `mailgun` | Active | Dumb pipe — pre-rendered HTML via multipart API |
| **Email** | Braze | `braze-email` | Active | Dumb pipe — pre-rendered HTML via `/messages/send` inline |
| **SMS** | Twilio | `twilio-sms` | Active | Dumb pipe — pre-rendered text via Messages API |
| **SMS** | Braze | `braze-sms` | Active | Dumb pipe — pre-rendered text via `/messages/send` inline |
| **WhatsApp** | Twilio | `twilio-whatsapp` | Active | Dumb pipe — pre-rendered text + media URLs via WhatsApp API |
| **WhatsApp** | Braze | `braze-whatsapp` | Active | Dumb pipe — pre-rendered text via `/messages/send` inline |
| **Push** | FCM | `fcm` | Active | Dumb pipe — pre-rendered title+body via FCM v1 API |
| **Push** | Braze | `braze-push` | Active | Dumb pipe — pre-rendered title+body via `/messages/send` inline |

---

## 6. Rate Limiting

The Channel Router enforces outbound rate limits per provider using a **token bucket** algorithm. This ensures outbound request rates stay within contractual provider quotas and prevents throttling, temporary bans, or financial penalties.

### 6.1 Token Bucket Algorithm

Each provider has its own token bucket:

```
Token Bucket (per provider)
┌────────────────────────────────────┐
│  Bucket Capacity: maxTokens        │  ◄── Max burst size
│  Refill Rate: tokensPerSecond      │  ◄── Sustained rate limit
│  Current Tokens: available         │  ◄── Tokens currently available
└────────────────────────────────────┘

Before each send:
  1. Refill tokens based on elapsed time
  2. If available >= 1: consume 1 token, proceed
  3. If available < 1: wait until next refill or timeout
```

### 6.2 Rate Limit Configuration

| Provider | Tokens/Second | Max Burst | Source |
|---|---|---|---|
| **SendGrid** | 100 | 200 | SendGrid Pro plan: 100 emails/sec |
| **Mailgun** | 50 | 100 | Conservative default; Mailgun auto-throttles internally |
| **Braze** | 69 | 140 | 250,000 req/hour ≈ 69/sec; burst allows short peaks |
| **Twilio SMS** | 30 | 60 | ~30 SMS/sec per number |
| **Twilio WhatsApp** | 80 | 160 | 80 messages/sec (Meta Business tier) |
| **FCM** | 500 | 1000 | 500 messages/sec per project |

> **Warning:** **Rate Limit Planning:** Exceeding provider rate limits results in HTTP 429 throttling, temporary bans, or financial penalties. Monitor the `channel_router_rate_limit_wait_ms` metric and provider `X-RateLimit-*` headers for early warning signs. When sustained throughput approaches 70% of a provider's rate limit, consider upgrading the provider plan or enabling multi-provider weighted routing to distribute load.

---

## 7. Circuit Breaker Pattern

Each provider has an independent circuit breaker that prevents cascading failures when a provider is unhealthy. The circuit breaker uses a state machine with three states.

### 7.1 Circuit Breaker State Machine

```
                     ┌─────────────┐
                     │   CLOSED    │  ◄── Normal operation: all requests pass through
                     │             │
                     │  Track      │
                     │  failures   │
                     └──────┬──────┘
                            │
                   Failure threshold
                   exceeded (e.g., 5
                   failures in 60s)
                            │
                            ▼
                     ┌─────────────┐
                     │    OPEN     │  ◄── All requests fast-fail immediately
                     │             │      (no provider calls)
                     │  Wait for   │
                     │  cooldown   │
                     └──────┬──────┘
                            │
                   Cooldown period
                   elapsed (e.g., 30s)
                            │
                            ▼
                     ┌─────────────┐
                     │  HALF_OPEN  │  ◄── Allow 1 test request through
                     │             │
                     │  Test one   │
                     │  request    │
                     └──────┬──────┘
                            │
                   ┌────────┴────────┐
                   │                 │
                Success           Failure
                   │                 │
                   ▼                 ▼
            ┌─────────────┐   ┌─────────────┐
            │   CLOSED    │   │    OPEN     │
            │  (reset     │   │  (restart   │
            │   counters) │   │   cooldown) │
            └─────────────┘   └─────────────┘
```

### 7.2 Circuit Breaker Configuration

| Parameter | Default | Description |
|---|---|---|
| `failureThreshold` | 5 | Failures within the window to trip the circuit |
| `failureWindowMs` | 60000 (60s) | Time window for counting failures |
| `cooldownMs` | 30000 (30s) | How long the circuit stays open before testing |
| `halfOpenMaxAttempts` | 1 | Test requests allowed in half-open state |
| `successThreshold` | 2 | Consecutive successes in half-open to close |

### 7.3 What Counts as a Failure

| Event | Counts as Failure | Rationale |
|---|---|---|
| HTTP 5xx response | Yes | Provider server error |
| Network timeout | Yes | Provider unreachable |
| Connection refused | Yes | Provider down |
| HTTP 429 (rate limited) | Yes | Provider overloaded |
| HTTP 400 (bad request) | No | Our payload is invalid — not a provider issue |
| HTTP 401/403 (auth error) | No | Configuration issue — not a transient provider failure |
| HTTP 404 | No | Invalid endpoint — configuration issue |

### 7.4 Circuit Breaker + Fallback Integration

When a provider's circuit breaker opens, the behavior depends on the channel's routing mode:

| Routing Mode | Behavior When Circuit Opens |
|---|---|
| `primary` | If a failover provider is configured, route to it. Otherwise, messages queue in the retry backlog. |
| `weighted` | Redistribute weight to healthy providers. If all providers are open, messages queue. |
| `failover` | Automatically move to the next provider in the ordered list. |

---

## 8. Retry Strategy & Exponential Backoff

Failed deliveries are retried with configurable exponential backoff and jitter. Each channel has its own retry policy based on the characteristics of the channel and its cost.

### 8.1 Retry Policy by Channel

| Channel | Max Retries | Delays | Cumulative Wait | Rationale |
|---|---|---|---|---|
| **Email** | 5 | 5s, 30s, 2m, 10m, 30m | ~42.5 min | Email delivery delays are tolerable; high retry count maximizes delivery |
| **SMS** | 3 | 5s, 30s, 2m | ~2.5 min | Higher per-message cost; time-sensitive content degrades value quickly |
| **WhatsApp** | 4 | 5s, 30s, 2m, 10m | ~12.5 min | Moderate cost; 24-hour messaging window constraint |
| **Push** | 4 | 5s, 30s, 2m, 10m | ~12.5 min | Free delivery; device tokens may become stale |

### 8.2 Retry Flow

```
    Delivery attempt fails
         │
         ▼
    ┌───────────────────────────────┐
    │  Retryable error?             │
    │                               │
    │  Yes: 5xx, timeout, network   │────── No (4xx permanent) ──▶ Mark FAILED immediately
    │  No:  400, 401, 403           │
    └──────────────┬────────────────┘
                   │ Yes
                   ▼
    ┌───────────────────────────────┐
    │  Max retries exceeded?        │
    │                               │
    │  Compare attempt_number       │────── Yes ──▶ Mark FAILED, move to DLQ
    │  against channel max          │               Trigger fallback if configured
    └──────────────┬────────────────┘
                   │ No
                   ▼
    ┌───────────────────────────────┐
    │  Calculate delay with jitter   │
    │                               │
    │  delay = baseDelay *           │
    │    (backoffMultiplier ^        │
    │     attemptNumber)             │
    │  jitter = random(0, delay*0.2) │
    │  effectiveDelay = delay +      │
    │    jitter                      │
    └──────────────┬────────────────┘
                   │
                   ▼
    ┌───────────────────────────────┐
    │  Re-queue with delay           │  ◄── RabbitMQ message TTL + DLX for delayed redelivery
    │  (via delayed message exchange │
    │   or per-retry-delay queues)   │
    └───────────────────────────────┘
```

### 8.3 Jitter

All retry delays include **random jitter** of up to 20% of the calculated delay. This prevents thundering herd effects when many notifications fail simultaneously (e.g., during a provider outage) and all retry at the same moment.

```
effectiveDelay = baseDelay * (multiplier ^ attemptNumber) + random(0, delay * 0.2)
```

---

## 9. Fallback Channel Logic

When a primary channel fails after all retries, the Channel Router can trigger delivery via an alternative fallback channel. Fallback configuration is defined per notification rule in the Notification Engine and passed through in the dispatch message metadata.

### 9.1 Fallback Flow

```
    Primary channel FAILED (all retries exhausted)
         │
         ▼
    ┌───────────────────────────────┐
    │  Fallback configured?          │
    │                               │
    │  Check metadata.fallback       │────── No ──▶ Mark FAILED (terminal)
    │                               │               Move to DLQ
    └──────────────┬────────────────┘
                   │ Yes
                   ▼
    ┌───────────────────────────────┐
    │  Publish new dispatch message  │
    │  to xch.notifications.deliver  │
    │  with fallback channel         │
    │                               │
    │  Routing key:                  │
    │  notification.deliver.         │
    │  {priority}.{fallbackChannel}  │
    └───────────────────────────────┘
```

### 9.2 Fallback Rules

| Scenario | Behavior |
|---|---|
| SMS fails, fallback = email | Re-publish with `channel: "email"`. Notification Engine has already rendered the email variant. Content is included in the fallback message. |
| Email fails, fallback = sms | Re-publish with `channel: "sms"`. If SMS content was not pre-rendered, the fallback message triggers a render request via the Notification Engine. |
| Fallback channel also fails | No further fallback. Mark FAILED (terminal). Prevent infinite fallback chains. |
| No fallback configured | Mark FAILED immediately after primary retries exhausted. |

> **Warning:** **Single Fallback Level:** The Channel Router supports exactly one fallback level to prevent infinite fallback chains. If the fallback channel also fails, the notification is marked as permanently FAILED and moved to the DLQ for manual review.

---

## 10. Media & Attachment Handling

When the dispatch message includes a `media` array, the Channel Router processes entries according to channel-specific rules. Media assets are URL-referenced — source systems host files on their own CDNs.

### 10.1 Channel-Specific Processing

| Channel | `context: "inline"` | `context: "attachment"` | Implementation |
|---|---|---|---|
| **Email** | No action (inline images already rendered as `<img>` tags by Template Service) | Download file from URL, encode for provider API (Base64 for SendGrid, binary multipart for Mailgun, inline for Braze) | Enforce 10 MB per file, 30 MB total |
| **WhatsApp** | Send as Twilio media message using `MediaUrl` parameter (Twilio fetches from URL) | Send as Twilio document message using `MediaUrl` parameter | Enforce 16 MB per message |
| **SMS** | Ignored (text only) | Ignored (text only) | `media` array skipped entirely |
| **Push** | Map first `type: "image"` entry to FCM `notification.image` field | Ignored (push does not support attachments) | Enforce 1 MB image size |

### 10.2 Media Processing Rules

1. **URL validation:** Before downloading or referencing, verify the URL is HTTPS and responds with the expected `Content-Type` header.
2. **Size enforcement:** Reject media assets exceeding the per-channel size limits. Log the rejection and proceed without the attachment.
3. **Download timeout:** Media downloads for email attachments are subject to a 10-second timeout. On timeout, the notification is sent without the attachment.
4. **Graceful degradation:** If any media asset fails (download error, size exceeded, invalid URL, timeout), the notification is sent **without that attachment** rather than failing the entire delivery. The failure is logged in the `delivery_attempts` metadata published asynchronously.

### 10.3 Media Processing Flowchart

```
    Dispatch message has media[] ?
         │
    ┌────┴────┐
    No        Yes
    │         │
    │         ▼
    │    ┌─────────────────────────┐
    │    │  Channel = SMS?          │── Yes ──▶ Skip media entirely
    │    └────────────┬────────────┘
    │                 │ No
    │                 ▼
    │    ┌─────────────────────────┐
    │    │  For each media entry:  │
    │    │                         │
    │    │  1. Validate HTTPS URL  │
    │    │  2. Check Content-Type  │
    │    │  3. Check size limits   │
    │    │  4. Download (email) or │
    │    │     pass URL (WA/push)  │
    │    └────────────┬────────────┘
    │                 │
    │         ┌───────┴───────┐
    │      Success         Failure
    │         │               │
    │         ▼               ▼
    │    Include in        Log warning,
    │    provider call     proceed without
    │                      this attachment
    │         │               │
    └─────────┴───────────────┘
              │
              ▼
         Send to provider
```

---

## 11. Webhook Receivers & Delivery Status

The Channel Router exposes webhook endpoints for delivery status callbacks from each provider. Webhooks update notification delivery status asynchronously and are forwarded to the Audit Service via RabbitMQ fire-and-forget messaging.

### 11.1 Webhook Endpoints

| Endpoint | Provider | Verification Method |
|---|---|---|
| `POST /webhooks/sendgrid` | SendGrid | Event Webhook Verification Key (ECDSA signature) |
| `POST /webhooks/mailgun` | Mailgun | HMAC-SHA256 with dedicated Webhook Signing Key |
| `POST /webhooks/twilio` | Twilio | Twilio Request Validator (auth token + URL + params) |
| `POST /webhooks/braze` | Braze (transactional postbacks) | API key verification header |

### 11.2 Webhook Processing Flow

```
    Provider webhook arrives
         │
         ▼
    ┌───────────────────────────────┐
    │  1. Verify Signature           │  ◄── Provider-specific verification
    └──────────────┬────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
        Valid            Invalid
          │                 │
          │                 ▼
          │         Return 401 Unauthorized
          ▼
    ┌───────────────────────────────┐
    │  2. Parse Event                │  ◄── Extract provider_message_id, event_type, timestamp
    └──────────────┬────────────────┘
                   ▼
    ┌───────────────────────────────┐
    │  3. Map to Internal Status     │  ◄── Provider event → our status (see mapping table)
    └──────────────┬────────────────┘
                   ▼
    ┌───────────────────────────────┐
    │  4. Publish to RabbitMQ        │  ◄── Fire-and-forget to xch.notifications.status
    │     (async — no DB write)      │      routing key: status.{notificationId}
    └──────────────┬────────────────┘
                   ▼
    ┌───────────────────────────────┐
    │  5. Return 200 OK              │  ◄── Acknowledge receipt to provider
    └───────────────────────────────┘
```

### 11.3 Event Status Mapping

| Our Status | SendGrid Event | Mailgun Event | Twilio Status | Braze Event |
|---|---|---|---|---|
| SENT | `processed` | `accepted` | `sent` / `queued` | `send` |
| DELIVERED | `delivered` | `delivered` | `delivered` | `delivery` |
| FAILED (hard bounce) | `bounce` | `permanent_fail` | `failed` / `undelivered` | `bounce` |
| FAILED (soft bounce) | `deferred` | `temporary_fail` | — | `soft_bounce` |
| (analytics) opened | `open` | `opened` | — | `open` |
| (analytics) clicked | `click` | `clicked` | — | `click` |
| (suppression) spam | `spamreport` | `complained` | — | `spam` |
| (preference) unsub | `unsubscribe` | `unsubscribed` | — | `unsubscribe` |

### 11.4 Provider Message ID Correlation

Each successful delivery attempt stores the `provider_message_id` returned by the provider API:

| Provider | Message ID Format | Where Found in Webhook |
|---|---|---|
| SendGrid | `sg-{uuid}` | `sg_message_id` field in webhook payload |
| Mailgun | `<{id}@{domain}.mailgun.org>` | `event-data.message.headers.message-id` |
| Twilio | `SM{32hex}` | `MessageSid` in status callback |
| Braze | `dispatch_id` | `dispatch_id` in transactional postback |
| FCM | `projects/{id}/messages/{id}` | N/A (FCM does not send webhooks; status is synchronous) |

This ID is stored in the `delivery_attempts.provider_message_id` column and enables reliable webhook-to-notification correlation.

### 11.5 Mailgun Webhook Signature Verification

Mailgun signs webhook requests using HMAC-SHA256 with a dedicated Webhook Signing Key (separate from the API key):

```typescript
import * as crypto from 'crypto';

function verifyMailgunWebhook(
  signingKey: string,
  timestamp: string,
  token: string,
  signature: string
): boolean {
  const digest = crypto
    .createHmac('sha256', signingKey)
    .update(timestamp + token)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(digest),
    Buffer.from(signature)
  );
}
```

### 11.6 Braze Delivery Tracking

Braze offers two delivery tracking mechanisms:

| Mechanism | Channels | Latency | Format |
|---|---|---|---|
| **Transactional HTTP postbacks** | Email only (transactional) | Real-time | Webhook to configured URL |
| **Braze Currents** | All channels | ~5 min batch delay | Avro files streamed to S3/Snowflake |

For transactional email, the Channel Router configures the HTTP postback URL when sending. For all other channels sent via Braze, delivery status is consumed from Braze Currents by the Audit Service (see [Section 16 — Asynchronous Audit Logging](#16-asynchronous-audit-logging)).

> **Info:** **Braze Currents Latency:** Braze Currents batches events every ~5 minutes before streaming. This means SMS, WhatsApp, and push delivery statuses sent via Braze have a ~5 minute delay compared to real-time webhooks from Twilio or Mailgun. For email sent via Braze, transactional postbacks provide real-time status.

---

## 12. Braze User Profile Synchronization

Braze requires recipients to exist as user profiles with contact information before messages can be delivered. The Channel Router maintains a lightweight synchronization module that ensures Braze profiles are up-to-date.

### 12.1 Sync Strategy

The sync module uses an **inline-on-send** approach: before each Braze API call, it checks whether the recipient's profile needs updating and sends a `/users/track` call if necessary.

```
    Before Braze send()
         │
         ▼
    ┌───────────────────────────────┐
    │  Recipient in Braze profile    │
    │  cache? (LRU, TTL-based)       │
    └──────────────┬────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
        Cached            Not cached
        (recent sync)     or expired
          │                 │
          │                 ▼
          │    ┌───────────────────────────────┐
          │    │  POST /users/track             │
          │    │  {                             │
          │    │    "attributes": [{            │
          │    │      "external_id": customerId,│
          │    │      "email": recipient.email, │
          │    │      "phone": recipient.phone, │
          │    │      ...                       │
          │    │    }]                          │
          │    │  }                             │
          │    └──────────────┬────────────────┘
          │                   │
          │              Update cache
          │                   │
          └─────────┬─────────┘
                    │
                    ▼
              Proceed with
              Braze send()
```

### 12.2 Profile Mapping

| Our Field | Braze Attribute |
|---|---|
| `recipient.customerId` | `external_id` |
| `recipient.email` | `email` |
| `recipient.phone` | `phone` |
| `recipient.name` | `first_name` (parsed) |
| `recipient.deviceToken` | Push token (via `push_token_import`) |

### 12.3 Rate Limits for User Tracking

The Braze `/users/track` endpoint has its own rate limit: **3,000 requests per 3 seconds**. The sync module uses a separate token bucket for profile sync calls to avoid conflicting with the delivery rate limiter.

### 12.4 Cache Configuration

| Parameter | Default | Description |
|---|---|---|
| `BRAZE_PROFILE_CACHE_ENABLED` | `true` | Enable profile sync cache |
| `BRAZE_PROFILE_CACHE_TTL_SECONDS` | `3600` | TTL for cached profile sync status (1 hour) |
| `BRAZE_PROFILE_CACHE_MAX_SIZE` | `50000` | Max entries in the LRU cache |

> **Warning:** **Profile Sync Failure:** If the `/users/track` call fails, the delivery attempt proceeds anyway with `send_to_existing_only: false` in the Braze send payload. This creates the user profile inline but with potentially incomplete attributes. The failure is logged for monitoring.

---

## 13. RabbitMQ Topology

The Channel Router consumes from priority-tiered, channel-specific delivery queues and publishes status updates back to the notifications status exchange.

### 13.1 Consumed Queues

| Queue | Bound Exchange | Routing Key | Consumers | DLQ |
|---|---|---|---|---|
| `q.deliver.email.critical` | `xch.notifications.deliver` | `notification.deliver.critical.email` | 3 | Yes |
| `q.deliver.email.normal` | `xch.notifications.deliver` | `notification.deliver.normal.email` | 2 | Yes |
| `q.deliver.sms.critical` | `xch.notifications.deliver` | `notification.deliver.critical.sms` | 2 | Yes |
| `q.deliver.sms.normal` | `xch.notifications.deliver` | `notification.deliver.normal.sms` | 1 | Yes |
| `q.deliver.whatsapp.critical` | `xch.notifications.deliver` | `notification.deliver.critical.whatsapp` | 2 | Yes |
| `q.deliver.whatsapp.normal` | `xch.notifications.deliver` | `notification.deliver.normal.whatsapp` | 1 | Yes |
| `q.deliver.push.critical` | `xch.notifications.deliver` | `notification.deliver.critical.push` | 2 | Yes |
| `q.deliver.push.normal` | `xch.notifications.deliver` | `notification.deliver.normal.push` | 1 | Yes |

### 13.2 Published Exchanges

| Exchange | Routing Key Pattern | Message Type |
|---|---|---|
| `xch.notifications.status` | `notification.status.{outcome}` | Delivery status (SENT, DELIVERED, FAILED) |
| `xch.notifications.status` | `channel-router.delivery-attempt.*` | Delivery attempt records (fire-and-forget audit) |
| `xch.notifications.status` | `channel-router.webhook.*` | Webhook receipt records (fire-and-forget audit) |
| `xch.notifications.dlq` | N/A (fanout) | Dead-lettered messages after max retries |

### 13.3 Consumer Configuration

| Queue | Prefetch | Rationale |
|---|---|---|
| Critical queues (all channels) | 5 | Lower prefetch for critical — ensures fast pickup, limits in-flight |
| Normal queues (all channels) | 10 | Higher prefetch for normal — batch efficiency at lower priority |

### 13.4 RabbitMQ Topology Diagram

```
                    xch.notifications.deliver (Topic Exchange)
                    │
    ┌───────────────┼──────────────────────────────────────────────────────────┐
    │               │                                                          │
    ▼               ▼                                                          ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ q.deliver│  │ q.deliver│  │ q.deliver│  │ q.deliver│  │ q.deliver│  │ q.deliver│ ...
│ .email.  │  │ .email.  │  │ .sms.    │  │ .sms.    │  │ .whatsapp│  │ .push.   │
│ critical │  │ normal   │  │ critical │  │ normal   │  │ .critical│  │ critical │
│ (3 cons) │  │ (2 cons) │  │ (2 cons) │  │ (1 cons) │  │ (2 cons) │  │ (2 cons) │
└────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘
     │              │              │              │              │              │
     └──────────────┴──────────────┴──────┬───────┴──────────────┴──────────────┘
                                          │
                                Channel Router Service
                                          │
                                          ▼
                    xch.notifications.status (Topic Exchange)
                    │
                    ├──▶ Audit Service (q.status.updates)
                    └──▶ Notification Engine (q.engine.status)

                    xch.notifications.dlq (Fanout Exchange)
                    │
                    └──▶ q.dlq (Manual review / reprocessing)
```

> **Info:** **Dead-Letter Queue Configuration:** All delivery queues are configured with `x-dead-letter-exchange: xch.notifications.dlq`. Messages are dead-lettered after the channel's max retry attempts are exhausted. The DLQ is monitored via the Admin UI dashboard and messages can be manually reprocessed.

---

## 14. REST API Endpoints

The Channel Router exposes REST endpoints for webhook receivers, health checks, and channel/provider configuration management (proxied through the Gateway for admin operations).

### 14.1 Webhook Endpoints

**POST** `/webhooks/sendgrid` — Receives SendGrid delivery event webhooks. Verifies ECDSA signature. Parses event batch (SendGrid sends arrays of events). Maps events to internal statuses and publishes to RabbitMQ.

**POST** `/webhooks/mailgun` — Receives Mailgun delivery event webhooks. Verifies HMAC-SHA256 signature using the Webhook Signing Key. Parses single-event payload. Maps to internal status and publishes to RabbitMQ.

**POST** `/webhooks/twilio` — Receives Twilio SMS/WhatsApp status callbacks. Validates using Twilio Request Validator. Parses status parameters. Maps to internal status and publishes to RabbitMQ.

**POST** `/webhooks/braze` — Receives Braze transactional email postbacks. Verifies API key header. Parses delivery status. Maps to internal status and publishes to RabbitMQ.

### 14.2 Channel Configuration Endpoints (via Gateway)

**GET** `/channels` — List all channel configurations with their current status, active provider, routing mode, and health indicators.

Response:
```json
{
  "data": [
    {
      "id": "ch-001",
      "name": "Email",
      "type": "email",
      "isActive": true,
      "activeProvider": "mailgun",
      "routingMode": "primary",
      "fallbackProvider": "sendgrid",
      "health": {
        "circuitBreakerState": "CLOSED",
        "lastSuccessAt": "2026-02-21T10:15:00Z",
        "successRate24h": 99.7
      }
    }
  ]
}
```

**PUT** `/channels/:id/config` — Update channel configuration (active provider, routing mode, routing weights, fallback provider). Validates provider connectivity before saving (optional dry-run mode).

**GET** `/providers` — List all configured providers with their status, supported channels, and circuit breaker state.

**PUT** `/providers/:id/config` — Update provider credentials and settings. Sensitive values (API keys, auth tokens) are encrypted at rest.

### 14.3 Health & Readiness

**GET** `/health` — Liveness probe. Returns 200 if the service process is running.

**GET** `/ready` — Readiness probe. Checks PostgreSQL connectivity, RabbitMQ connection, and at least one provider per active channel is healthy.

Response:
```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "rabbitmq": "ok",
    "providers": {
      "sendgrid": "ok",
      "mailgun": "ok",
      "braze": "ok",
      "twilio-sms": "ok",
      "twilio-whatsapp": "ok",
      "fcm": "ok"
    }
  }
}
```

---

## 15. Database Design

The Channel Router owns the `channel_router_service` PostgreSQL schema with four tables for channel definitions, configuration, delivery tracking, and provider management.

### 15.1 Entity Relationship Diagram

```
  channel_router_service — Entity Relationships

  +---------------------------+        1:N        +---------------------------+
  | channels                  | ────────────────▶ | channel_configs           |
  |---------------------------|                   |---------------------------|
  | PK  id UUID               |                   | PK  id UUID               |
  |     name VARCHAR(50)      |                   | FK  channel_id UUID       |
  |     type VARCHAR(20)      |                   |     config_key VARCHAR    |
  |     is_active BOOLEAN     |                   |     config_value TEXT     |
  |     routing_mode          |                   |     is_encrypted BOOLEAN  |
  |       VARCHAR(20)         |                   |     created_at TIMESTAMP  |
  |     fallback_channel_id   |                   |     updated_at TIMESTAMP  |
  |       UUID (nullable, FK) |                   +---------------------------+
  |     created_at TIMESTAMP  |
  |     updated_at TIMESTAMP  |
  +---------------------------+
           │
           │ 1:N (channel → delivery_attempts)
           ▼
  +-------------------------------+
  | delivery_attempts             |
  |-------------------------------|
  | PK  id UUID                   |
  |     notification_id UUID      |          +---------------------------+
  |     correlation_id UUID       |          | provider_configs          |
  |     channel VARCHAR(20)       |          |---------------------------|
  | FK  provider_id UUID          |───────▶  | PK  id UUID               |
  |     attempt_number INTEGER    |          |     provider_name         |
  |     status VARCHAR(20)        |          |       VARCHAR(50)         |
  |     provider_response JSONB   |          |     provider_id           |
  |     provider_message_id       |          |       VARCHAR(50)         |
  |       VARCHAR(255)            |          |     channel VARCHAR(20)   |
  |     error_message TEXT        |          |     config_json JSONB     |
  |     metadata JSONB            |          |     is_active BOOLEAN     |
  |     attempted_at TIMESTAMP    |          |     routing_weight        |
  |     duration_ms INTEGER       |          |       INTEGER             |
  +-------------------------------+          |     circuit_breaker_state |
                                             |       VARCHAR(20)         |
                                             |     failure_count INTEGER |
                                             |     last_failure_at       |
                                             |       TIMESTAMP           |
                                             |     last_health_check     |
                                             |       TIMESTAMP           |
                                             |     created_at TIMESTAMP  |
                                             |     updated_at TIMESTAMP  |
                                             +---------------------------+
```

### 15.2 Table Specifications

#### `channels`

Channel definitions for the four supported notification channels.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `name` | `VARCHAR(50)` | No | | Display name (e.g., "Email", "SMS") |
| `type` | `VARCHAR(20)` | No | | Channel type: `email`, `sms`, `whatsapp`, `push` |
| `is_active` | `BOOLEAN` | No | `true` | Whether the channel is enabled for delivery |
| `routing_mode` | `VARCHAR(20)` | No | `'primary'` | Provider routing mode: `primary`, `weighted`, `failover` |
| `fallback_channel_id` | `UUID` | Yes | `NULL` | FK to another channel for fallback delivery |
| `created_at` | `TIMESTAMP` | No | `NOW()` | Record creation time |
| `updated_at` | `TIMESTAMP` | No | `NOW()` | Last update time |

#### `channel_configs`

Channel-level settings (sender identity, limits, provider-agnostic settings).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `channel_id` | `UUID` | No | | FK to `channels.id` |
| `config_key` | `VARCHAR(100)` | No | | Configuration key (e.g., `fromAddress`, `senderName`) |
| `config_value` | `TEXT` | No | | Configuration value (encrypted if `is_encrypted = true`) |
| `is_encrypted` | `BOOLEAN` | No | `false` | Whether the value is encrypted at rest |
| `created_at` | `TIMESTAMP` | No | `NOW()` | Record creation time |
| `updated_at` | `TIMESTAMP` | No | `NOW()` | Last update time |

#### `delivery_attempts`

Record of each delivery attempt per notification per channel. This is the highest-volume table in the schema.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `notification_id` | `UUID` | No | | Notification ID from the dispatch message |
| `correlation_id` | `UUID` | Yes | | End-to-end correlation ID for tracing |
| `channel` | `VARCHAR(20)` | No | | Target channel: `email`, `sms`, `whatsapp`, `push` |
| `provider_id` | `UUID` | No | | FK to `provider_configs.id` |
| `attempt_number` | `INTEGER` | No | `1` | Retry attempt number (1-based) |
| `status` | `VARCHAR(20)` | No | | Attempt outcome: `SENT`, `DELIVERED`, `FAILED`, `RETRYING` |
| `provider_response` | `JSONB` | Yes | | Raw response from provider API |
| `provider_message_id` | `VARCHAR(255)` | Yes | | Provider's message ID for webhook correlation |
| `error_message` | `TEXT` | Yes | | Error details on failure |
| `metadata` | `JSONB` | Yes | | Additional context (media failures, rate limit waits, etc.) |
| `attempted_at` | `TIMESTAMP` | No | `NOW()` | When the attempt was made |
| `duration_ms` | `INTEGER` | Yes | | Round-trip time of the provider API call |

#### `provider_configs`

External provider credentials, settings, and circuit breaker state.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `provider_name` | `VARCHAR(50)` | No | | Display name (e.g., "SendGrid", "Mailgun", "Braze") |
| `provider_id` | `VARCHAR(50)` | No | | Unique identifier (e.g., `sendgrid`, `mailgun`, `braze`) |
| `channel` | `VARCHAR(20)` | No | | Channel this provider serves: `email`, `sms`, `whatsapp`, `push` |
| `config_json` | `JSONB` | No | | Provider credentials and settings (encrypted at rest) |
| `is_active` | `BOOLEAN` | No | `true` | Whether this provider is active for its channel |
| `routing_weight` | `INTEGER` | Yes | `100` | Weight for weighted routing mode (0-100) |
| `circuit_breaker_state` | `VARCHAR(20)` | No | `'CLOSED'` | Current state: `CLOSED`, `OPEN`, `HALF_OPEN` |
| `failure_count` | `INTEGER` | No | `0` | Current failure count in the circuit breaker window |
| `last_failure_at` | `TIMESTAMP` | Yes | | Timestamp of last failure |
| `last_health_check` | `TIMESTAMP` | Yes | | Last provider health check timestamp |
| `created_at` | `TIMESTAMP` | No | `NOW()` | Record creation time |
| `updated_at` | `TIMESTAMP` | No | `NOW()` | Last update time |

### 15.3 Indexes

| Index | Table | Columns | Type | Purpose |
|---|---|---|---|---|
| `idx_delivery_attempts_notification` | `delivery_attempts` | `notification_id` | B-tree | Lookup all attempts for a notification |
| `idx_delivery_attempts_provider_msg` | `delivery_attempts` | `provider_message_id` | B-tree (partial: `WHERE provider_message_id IS NOT NULL`) | Webhook correlation |
| `idx_delivery_attempts_channel_status` | `delivery_attempts` | `channel, status, attempted_at` | B-tree | Channel analytics queries |
| `idx_delivery_attempts_attempted_at` | `delivery_attempts` | `attempted_at` | B-tree | Time-range queries and retention |
| `idx_delivery_attempts_correlation` | `delivery_attempts` | `correlation_id` | B-tree (partial: `WHERE correlation_id IS NOT NULL`) | End-to-end tracing |
| `idx_provider_configs_channel_active` | `provider_configs` | `channel, is_active` | B-tree | Provider resolution per channel |
| `idx_channel_configs_channel` | `channel_configs` | `channel_id` | B-tree | Config lookup per channel |

### 15.4 Data Retention

| Table | Retention Policy | Mechanism |
|---|---|---|
| `delivery_attempts` | 6 months full data, then aggregated into analytics | Scheduled job (pg_cron or application) |
| `provider_configs` | Indefinite | Configuration data |
| `channels` | Indefinite | Configuration data |
| `channel_configs` | Indefinite | Configuration data |

### 15.5 Growth Estimates

| Table | Rows/Month | Row Size | Monthly Growth | Year 1 Total |
|---|---|---|---|---|
| `delivery_attempts` | ~250K-500K | ~1-2 KB | ~500 MB - 1 GB | ~6-12 GB |
| `provider_configs` | ~10-20 (static) | ~2 KB | Negligible | Negligible |
| `channels` | 4 (static) | ~500 B | Negligible | Negligible |
| `channel_configs` | ~20-40 (static) | ~500 B | Negligible | Negligible |
| **Total** | | | **~6 GB/month** | **~60 GB** |

> **Info:** **Delivery Attempts Dominance:** The `delivery_attempts` table accounts for >99% of the schema's storage. After 6 months, delivery attempt data is aggregated into the Audit Service's `notification_analytics` table and the raw `delivery_attempts` rows can be archived or purged.

---

## 16. Asynchronous Audit Logging

All delivery-related log writes are performed **asynchronously** via RabbitMQ fire-and-forget messaging. The Channel Router never writes to its own database synchronously on the delivery critical path — all persistence is handled by a dedicated consumer that reads from RabbitMQ and writes to PostgreSQL.

### 16.1 Fire-and-Forget Pattern

```
    Channel Router (Delivery Path)                  RabbitMQ                   Audit Consumer
         │                                            │                            │
         │  Delivery attempt completed                │                            │
         │                                            │                            │
         │  Publish delivery_attempt record            │                            │
         │  to xch.notifications.status               │                            │
         │  key: channel-router.delivery-attempt.sent  │                            │
         │  (fire-and-forget — no wait for ACK)        │                            │
         │────────────────────────────────────────────▶│                            │
         │                                            │  Deliver to                │
         │  Delivery path continues immediately        │  q.status.updates          │
         │  (no blocking on DB write)                  │───────────────────────────▶│
         │                                            │                            │
         │                                            │           ┌────────────────┴────────────┐
         │                                            │           │ INSERT INTO delivery_attempts│
         │                                            │           │ (async, non-blocking)        │
         │                                            │           └─────────────────────────────┘
```

### 16.2 Published Audit Messages

| Routing Key | Payload | Trigger |
|---|---|---|
| `channel-router.delivery-attempt.sent` | Full `delivery_attempt` record | Successful provider API call (2xx) |
| `channel-router.delivery-attempt.failed` | Full `delivery_attempt` record with error details | Failed provider API call |
| `channel-router.delivery-attempt.retrying` | Attempt record with retry metadata (next delay, attempt number) | Retryable failure queued for retry |
| `channel-router.webhook.received` | Parsed webhook event with mapped status | Provider webhook received and validated |
| `notification.status.sent` | Notification ID + status + timestamp | Notification status transition to SENT |
| `notification.status.delivered` | Notification ID + status + timestamp | Delivery confirmation via webhook |
| `notification.status.failed` | Notification ID + status + error + timestamp | Terminal failure after max retries |

### 16.3 Why Fire-and-Forget?

The delivery path is the most latency-sensitive part of the notification pipeline. Synchronous database writes would add 2-10ms per delivery attempt and create a database bottleneck under peak load. By publishing to RabbitMQ (sub-millisecond, fire-and-forget) and letting a dedicated consumer persist asynchronously, the delivery path stays fast and the database is written to in batches by the consumer.

| Metric | Synchronous DB Write | Fire-and-Forget (RabbitMQ) |
|---|---|---|
| Latency added to delivery path | 2-10 ms | <1 ms |
| Database connection pressure | 1 connection per consumer | 1 connection for audit consumer only |
| Failure impact on delivery | DB outage blocks delivery | DB outage only delays audit logging |
| Throughput ceiling | Limited by DB write IOPS | Limited by RabbitMQ throughput (10K+ msg/sec) |

> **Warning:** **Eventual Consistency:** Because audit logging is asynchronous, there is a brief window (typically <1 second) where a delivery attempt has completed but the `delivery_attempts` row has not yet been written. The `provider_message_id` is available in the RabbitMQ message immediately, so webhook correlation is not affected. Dashboard queries may show a brief lag for the most recent delivery attempts.

---

## 17. Sequence Diagrams

### 17.1 Standard Email Delivery Flow (Mailgun)

```
    Notification Engine          RabbitMQ                Channel Router               Mailgun
         │                         │                         │                          │
         │  Publish dispatch       │                         │                          │
         │  to xch.notifications.  │                         │                          │
         │  deliver                │                         │                          │
         │  key: notification.     │                         │                          │
         │  deliver.normal.email   │                         │                          │
         │────────────────────────▶│                         │                          │
         │                         │  Deliver to             │                          │
         │                         │  q.deliver.email.normal │                          │
         │                         │────────────────────────▶│                          │
         │                         │                         │                          │
         │                         │                         │  1. Resolve provider     │
         │                         │                         │     (Mailgun active)     │
         │                         │                         │                          │
         │                         │                         │  2. Check circuit breaker│
         │                         │                         │     (CLOSED — OK)        │
         │                         │                         │                          │
         │                         │                         │  3. Acquire rate limit   │
         │                         │                         │     token (OK)           │
         │                         │                         │                          │
         │                         │                         │  4. Download attachment  │
         │                         │                         │     (media[context=      │
         │                         │                         │      attachment])        │
         │                         │                         │                          │
         │                         │                         │  5. POST /v3/{domain}/   │
         │                         │                         │     messages             │
         │                         │                         │     from=...             │
         │                         │                         │     to=jane@example.com  │
         │                         │                         │     subject=Your order...│
         │                         │                         │     html=<rendered>      │
         │                         │                         │     attachment=<binary>  │
         │                         │                         │────────────────────────▶ │
         │                         │                         │                          │
         │                         │                         │  200 { id: <msg-id>,     │
         │                         │                         │    message: "Queued." }  │
         │                         │                         │◀────────────────────────│
         │                         │                         │                          │
         │                         │  Publish SENT status    │                          │
         │                         │  (fire-and-forget)      │                          │
         │                         │◀────────────────────────│                          │
         │                         │                         │                          │
         │                         │  Publish delivery_      │                          │
         │                         │  attempt record         │                          │
         │                         │  (fire-and-forget)      │                          │
         │                         │◀────────────────────────│                          │
         │                         │                         │                          │
         │                         │                         │  ACK RabbitMQ message    │
         │                         │                         │                          │
         │                         │                         │                          │
         ═══════════ Later (webhook) ═══════════════════════════════════════════════════
         │                         │                         │                          │
         │                         │                         │  POST /webhooks/mailgun  │
         │                         │                         │  { event: "delivered",   │
         │                         │                         │    message-id: <msg-id>} │
         │                         │                         │◀─────────────────────────│
         │                         │                         │                          │
         │                         │                         │  Verify HMAC-SHA256      │
         │                         │                         │  Correlate provider_     │
         │                         │                         │  message_id              │
         │                         │                         │                          │
         │                         │  Publish DELIVERED      │                          │
         │                         │  status (fire-and-      │                          │
         │                         │  forget)                │                          │
         │                         │◀────────────────────────│                          │
         │                         │                         │                          │
         │                         │                         │  Return 200 OK           │
         │                         │                         │─────────────────────────▶│
```

### 17.2 Multi-Channel Delivery via Braze (Email + Push)

```
    Notification Engine          RabbitMQ                Channel Router               Braze
         │                         │                         │                          │
         │  Publish email dispatch │                         │                          │
         │  key: notification.     │                         │                          │
         │  deliver.critical.email │                         │                          │
         │────────────────────────▶│                         │                          │
         │                         │                         │                          │
         │  Publish push dispatch  │                         │                          │
         │  key: notification.     │                         │                          │
         │  deliver.critical.push  │                         │                          │
         │────────────────────────▶│                         │                          │
         │                         │                         │                          │
         │                         │  q.deliver.email.       │                          │
         │                         │  critical ──────────────│                          │
         │                         │                         │  Resolve: BrazeEmail     │
         │                         │                         │                          │
         │                         │                         │  Sync user profile       │
         │                         │                         │  POST /users/track       │
         │                         │                         │  { external_id:          │
         │                         │                         │    "CUST-00451",         │
         │                         │                         │    email: "jane@..." }   │
         │                         │                         │────────────────────────▶ │
         │                         │                         │  201 OK                  │
         │                         │                         │◀────────────────────────│
         │                         │                         │                          │
         │                         │                         │  POST /messages/send     │
         │                         │                         │  { external_user_ids:    │
         │                         │                         │    ["CUST-00451"],       │
         │                         │                         │    messages: { email: {  │
         │                         │                         │      subject: "...",     │
         │                         │                         │      body: "<html>..."   │
         │                         │                         │    }}}                   │
         │                         │                         │────────────────────────▶ │
         │                         │                         │  201 { dispatch_id }     │
         │                         │                         │◀────────────────────────│
         │                         │                         │                          │
         │                         │  Publish SENT (email)   │                          │
         │                         │◀────────────────────────│                          │
         │                         │                         │                          │
         ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
         │                         │                         │                          │
         │                         │  q.deliver.push.        │                          │
         │                         │  critical ──────────────│                          │
         │                         │                         │  Resolve: BrazePush      │
         │                         │                         │                          │
         │                         │                         │  POST /messages/send     │
         │                         │                         │  { external_user_ids:    │
         │                         │                         │    ["CUST-00451"],       │
         │                         │                         │    messages: {           │
         │                         │                         │      apple_push: {       │
         │                         │                         │        alert: {          │
         │                         │                         │          title: "...",   │
         │                         │                         │          body: "..." }}}}│
         │                         │                         │────────────────────────▶ │
         │                         │                         │  201 { dispatch_id }     │
         │                         │                         │◀────────────────────────│
         │                         │                         │                          │
         │                         │  Publish SENT (push)    │                          │
         │                         │◀────────────────────────│                          │
```

### 17.3 Retry Flow with Circuit Breaker Trip

```
    Channel Router               SendGrid               RabbitMQ
         │                          │                       │
         │  Attempt 1               │                       │
         │  POST /v3/mail/send     │                       │
         │─────────────────────────▶│                       │
         │  500 Internal Error      │                       │
         │◀─────────────────────────│                       │
         │                          │                       │
         │  Record failure          │                       │
         │  (failure_count: 1)      │                       │
         │                          │                       │
         │  Publish RETRYING status │                       │
         │──────────────────────────────────────────────────▶│
         │                          │                       │
         │  Re-queue with 5s delay  │                       │
         │  (attempt 2)             │                       │
         │                          │                       │
    ═══════════ 5 seconds later ════════════════════════════
         │                          │                       │
         │  Attempt 2               │                       │
         │  POST /v3/mail/send     │                       │
         │─────────────────────────▶│                       │
         │  500 Internal Error      │                       │
         │◀─────────────────────────│                       │
         │                          │                       │
         │  Record failure          │                       │
         │  (failure_count: 2)      │                       │
         │  ...                     │                       │
         │                          │                       │
    ═══════════ After 5 failures ═══════════════════════════
         │                          │                       │
         │  Circuit breaker OPENS   │                       │
         │  (failure_count >= 5     │                       │
         │   within 60s window)     │                       │
         │                          │                       │
         │  Subsequent requests     │                       │
         │  → FAST-FAIL             │                       │
         │  → Route to fallback     │                       │
         │    provider (if any)     │                       │
         │                          │                       │
    ═══════════ 30s cooldown ═══════════════════════════════
         │                          │                       │
         │  Circuit breaker →       │                       │
         │  HALF_OPEN               │                       │
         │                          │                       │
         │  Test request            │                       │
         │  POST /v3/mail/send     │                       │
         │─────────────────────────▶│                       │
         │  200 OK                  │                       │
         │◀─────────────────────────│                       │
         │                          │                       │
         │  Circuit breaker →       │                       │
         │  CLOSED                  │                       │
         │  (counters reset)        │                       │
```

### 17.4 Fallback Channel Flow

```
    Channel Router               Twilio (SMS)            RabbitMQ
         │                          │                       │
         │  Consume SMS dispatch    │                       │
         │  (with fallback: email)  │                       │
         │                          │                       │
         │  Attempt 1 - POST SMS   │                       │
         │─────────────────────────▶│                       │
         │  500 Error               │                       │
         │◀─────────────────────────│                       │
         │                          │                       │
         │  Retry attempt 2 (30s)  │                       │
         │─────────────────────────▶│                       │
         │  500 Error               │                       │
         │◀─────────────────────────│                       │
         │                          │                       │
         │  Retry attempt 3 (2m)   │                       │
         │─────────────────────────▶│                       │
         │  500 Error               │                       │
         │◀─────────────────────────│                       │
         │                          │                       │
         │  Max retries (3)         │                       │
         │  exceeded for SMS        │                       │
         │                          │                       │
         │  Fallback configured:    │                       │
         │  email                   │                       │
         │                          │                       │
         │  Publish fallback        │                       │
         │  dispatch to xch.        │                       │
         │  notifications.deliver   │                       │
         │  key: notification.      │                       │
         │  deliver.{priority}.     │                       │
         │  email                   │                       │
         │──────────────────────────────────────────────────▶│
         │                          │                       │
         │  Publish SMS FAILED      │                       │
         │  status (fire-and-forget)│                       │
         │──────────────────────────────────────────────────▶│
```

---

## 18. Error Handling

### 18.1 Error Classification

| Error Type | HTTP Code | Retryable | Action |
|---|---|---|---|
| **Provider server error** | 5xx | Yes | Retry with exponential backoff |
| **Network timeout** | — | Yes | Retry with exponential backoff |
| **Rate limited** | 429 | Yes | Wait for rate limit window, then retry |
| **Invalid payload** | 400 | No | Mark FAILED immediately (our payload is bad) |
| **Authentication error** | 401/403 | No | Mark FAILED; alert ops (credentials may be expired) |
| **Recipient not found** | 404 (Braze) | No | Mark FAILED; log for investigation |
| **Media download failure** | — | Partial | Send without attachment; log warning |
| **RabbitMQ publish failure** | — | Yes | Retry publish; if persistent, log locally |
| **Database unavailable** | — | N/A | Delivery continues (async writes); audit logging delayed |

### 18.2 Dead Letter Queue

Messages that exhaust all retries are published to the `xch.notifications.dlq` fanout exchange. DLQ messages include:

```json
{
  "originalMessage": { "...dispatch message..." },
  "failureHistory": [
    { "attempt": 1, "error": "HTTP 500", "at": "2026-02-20T10:15:31Z" },
    { "attempt": 2, "error": "HTTP 500", "at": "2026-02-20T10:15:36Z" },
    { "attempt": 3, "error": "HTTP 500", "at": "2026-02-20T10:16:06Z" }
  ],
  "deadLetteredAt": "2026-02-20T10:18:06Z",
  "reason": "MAX_RETRIES_EXCEEDED",
  "channel": "sms",
  "provider": "twilio-sms"
}
```

DLQ messages can be reprocessed manually through the Admin UI or automatically by a scheduled reprocessing job.

---

## 19. Security Considerations

### 19.1 Credential Management

| Credential | Storage | Encryption | Rotation |
|---|---|---|---|
| SendGrid API key | `provider_configs.config_json` | AES-256-GCM at rest | Rotate via admin API; no downtime |
| Mailgun API key | `provider_configs.config_json` | AES-256-GCM at rest | Rotate via admin API |
| Mailgun Webhook Signing Key | `provider_configs.config_json` | AES-256-GCM at rest | Rotate; update webhook config in Mailgun dashboard |
| Braze API key | `provider_configs.config_json` | AES-256-GCM at rest | Rotate via admin API |
| Twilio Account SID + Auth Token | `provider_configs.config_json` | AES-256-GCM at rest | Rotate via admin API |
| FCM Service Account Key | `provider_configs.config_json` | AES-256-GCM at rest | Rotate via admin API |

### 19.2 Webhook Security

- All webhook endpoints verify provider signatures before processing.
- Webhook endpoints are rate-limited to prevent abuse.
- Webhook payloads are validated against expected schemas; malformed payloads are rejected.
- Webhook signing keys are stored encrypted and separate from API keys.

### 19.3 Data Protection

- **PII in transit:** All provider API calls use TLS 1.2+.
- **PII in logs:** Recipient email addresses and phone numbers are masked in structured log output (e.g., `j***@example.com`, `+1***4567890`).
- **PII in delivery_attempts:** The `provider_response` JSONB column may contain PII from provider responses. Access to this column is restricted via RBAC.

### 19.4 Network Security

- Provider API calls are made from the Channel Router's egress only — no inbound connections from providers except webhook endpoints.
- Webhook endpoints are exposed via the Notification Gateway with authentication and rate limiting.
- Internal service communication uses Docker network isolation; mTLS available for production.

---

## 20. Monitoring & Health Checks

### 20.1 Key Metrics

| Metric | Type | Description |
|---|---|---|
| `channel_router_delivery_total` | Counter | Total delivery attempts (labels: channel, provider, status) |
| `channel_router_delivery_duration_ms` | Histogram | Provider API call round-trip time (labels: channel, provider) |
| `channel_router_retry_total` | Counter | Total retries triggered (labels: channel, provider, attempt_number) |
| `channel_router_circuit_breaker_state` | Gauge | Circuit breaker state per provider (0=closed, 1=half_open, 2=open) |
| `channel_router_circuit_breaker_trips_total` | Counter | Circuit breaker trip count (labels: provider) |
| `channel_router_rate_limit_wait_ms` | Histogram | Time spent waiting for rate limit tokens (labels: provider) |
| `channel_router_fallback_triggered_total` | Counter | Fallback channel activations (labels: primary_channel, fallback_channel) |
| `channel_router_media_download_duration_ms` | Histogram | Media asset download time (labels: channel) |
| `channel_router_media_failure_total` | Counter | Media download/validation failures (labels: channel, reason) |
| `channel_router_dlq_total` | Counter | Messages sent to dead letter queue (labels: channel, provider) |
| `channel_router_webhook_received_total` | Counter | Webhook events received (labels: provider, event_type) |
| `channel_router_webhook_verification_failure_total` | Counter | Webhook signature verification failures (labels: provider) |
| `channel_router_braze_profile_sync_total` | Counter | Braze user profile sync calls (labels: status) |
| `channel_router_braze_profile_sync_duration_ms` | Histogram | Braze `/users/track` call duration |
| `channel_router_queue_depth` | Gauge | Current message count in delivery queues (labels: queue) |

### 20.2 Health Check Endpoints

**GET `/health`** — Liveness probe. Returns 200 if the NestJS process is running.

**GET `/ready`** — Readiness probe. Checks:
- PostgreSQL connection (query `SELECT 1`)
- RabbitMQ connection (channel is open)
- At least one active provider per enabled channel has circuit breaker in CLOSED state

### 20.3 Alerting Thresholds

| Alert | Condition | Severity |
|---|---|---|
| Circuit breaker opened | Any provider transitions to OPEN state | High |
| DLQ accumulation | `q.dlq` depth > 100 messages | High |
| Delivery failure rate | >5% failure rate on any channel over 15 minutes | High |
| Rate limit saturation | Rate limit wait time p95 > 500ms | Medium |
| Webhook verification failures | >10 failures in 5 minutes (potential attack) | Medium |
| Media download failures | >10% media failures in 15 minutes | Low |
| Braze profile sync failures | >5% sync failures in 15 minutes | Medium |

---

## 21. Configuration

### 21.1 Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3154` | HTTP server port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `RABBITMQ_URL` | — | RabbitMQ connection string (AMQP) |
| **Provider Config Cache** | | |
| `PROVIDER_CACHE_ENABLED` | `true` | Cache provider configs in memory |
| `PROVIDER_CACHE_TTL_SECONDS` | `300` | TTL for provider config cache |
| **Circuit Breaker** | | |
| `CB_FAILURE_THRESHOLD` | `5` | Failures to trip the circuit |
| `CB_FAILURE_WINDOW_MS` | `60000` | Failure counting window (ms) |
| `CB_COOLDOWN_MS` | `30000` | Open state duration before half-open |
| `CB_HALF_OPEN_MAX_ATTEMPTS` | `1` | Test requests in half-open |
| `CB_SUCCESS_THRESHOLD` | `2` | Successes to close from half-open |
| **Rate Limiting** | | |
| `RL_SENDGRID_TOKENS_PER_SEC` | `100` | SendGrid rate limit |
| `RL_MAILGUN_TOKENS_PER_SEC` | `50` | Mailgun rate limit |
| `RL_BRAZE_TOKENS_PER_SEC` | `69` | Braze rate limit |
| `RL_TWILIO_SMS_TOKENS_PER_SEC` | `30` | Twilio SMS rate limit |
| `RL_TWILIO_WA_TOKENS_PER_SEC` | `80` | Twilio WhatsApp rate limit |
| `RL_FCM_TOKENS_PER_SEC` | `500` | FCM rate limit |
| **Retry** | | |
| `RETRY_EMAIL_MAX` | `5` | Max retries for email |
| `RETRY_SMS_MAX` | `3` | Max retries for SMS |
| `RETRY_WHATSAPP_MAX` | `4` | Max retries for WhatsApp |
| `RETRY_PUSH_MAX` | `4` | Max retries for push |
| `RETRY_BACKOFF_MULTIPLIER` | `2` | Exponential backoff multiplier |
| `RETRY_JITTER_FACTOR` | `0.2` | Max jitter as fraction of delay |
| **Media** | | |
| `MEDIA_DOWNLOAD_TIMEOUT_MS` | `10000` | Timeout for downloading media assets |
| `MEDIA_MAX_FILE_SIZE_MB` | `10` | Max file size per attachment |
| `MEDIA_MAX_TOTAL_SIZE_MB` | `30` | Max total attachment size per notification |
| **Braze Profile Sync** | | |
| `BRAZE_PROFILE_CACHE_ENABLED` | `true` | Enable Braze profile sync cache |
| `BRAZE_PROFILE_CACHE_TTL_SECONDS` | `3600` | Profile sync cache TTL |
| `BRAZE_PROFILE_CACHE_MAX_SIZE` | `50000` | Max profile cache entries |
| **RabbitMQ Consumer** | | |
| `CONSUMER_PREFETCH_CRITICAL` | `5` | Prefetch count for critical queues |
| `CONSUMER_PREFETCH_NORMAL` | `10` | Prefetch count for normal queues |

---

*Notification API Documentation v1.0 -- Architecture Team -- 2026*
