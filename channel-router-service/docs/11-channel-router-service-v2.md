> *This is a convenience copy. The authoritative version is at `../../docs/11-channel-router-service-v2.md`.*

# 11 — Channel Router Service (v2 — Decoupled Provider Adapter Architecture)

**Notification API — Channel Router Service Deep-Dive**

| | |
|---|---|
| **Version:** | 2.0 |
| **Date:** | 2026-02-26 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

> **Info:** This is v2 of the Channel Router Service design, updated to reflect the decoupled provider adapter microservice architecture. The authoritative v1 is at `11-channel-router-service.md`.

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [Architecture & Integration Points](#2-architecture--integration-points)
3. [Delivery Pipeline](#3-delivery-pipeline)
4. [Adapter Service Contract](#4-adapter-service-contract)
5. [Provider Adapter Services](#5-provider-adapter-services)
6. [Rate Limiting](#6-rate-limiting)
7. [Circuit Breaker Pattern](#7-circuit-breaker-pattern)
8. [Retry Strategy & Exponential Backoff](#8-retry-strategy--exponential-backoff)
9. [Fallback Channel Logic](#9-fallback-channel-logic)
10. [Media & Attachment Handling](#10-media--attachment-handling)
11. [Webhook Receivers & Delivery Status](#11-webhook-receivers--delivery-status)
12. [Braze Adapter Internal: Profile Synchronization](#12-braze-adapter-internal-profile-synchronization)
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

The Channel Router Service is the last-mile delivery component of the Notification API platform. It receives fully rendered notification messages from the Notification Engine (via RabbitMQ), routes them to the appropriate external delivery provider via independent **provider adapter microservices**, manages delivery retries with exponential backoff, implements circuit breaker patterns for adapter resilience, tracks delivery statuses, and supports fallback channel logic when a primary channel fails. All audit and delivery log writes are performed asynchronously via RabbitMQ fire-and-forget messaging to avoid blocking the critical delivery path.

The core service contains **zero provider-specific code** and **zero provider SDK dependencies**. All provider-specific logic (API translation, webhook verification, credential management) is encapsulated in independently deployable adapter services that communicate with the core via a standardized HTTP contract.

| Attribute | Value |
|---|---|
| **Technology** | NestJS (TypeScript) with RabbitMQ consumers (`@golevelup/nestjs-rabbitmq`), HTTP adapter client for external provider adapter services |
| **Port** | `3154` |
| **Schema** | PostgreSQL — `channel_router_service` |
| **Dependencies** | RabbitMQ, PostgreSQL, Provider adapter services (adapter-mailgun :3171, adapter-braze :3172, adapter-whatsapp :3173, adapter-aws-ses :3174) |
| **Source Repo Folder** | `channel-router-service/` |

### Responsibilities

1. **Channel Routing Logic:** Receives notifications tagged with a target channel and routes them to the corresponding provider adapter service. The core resolves the adapter URL from the `provider_configs` table and dispatches via HTTP.
2. **Provider Adapter Communication:** Calls registered adapter services via a standardized HTTP contract (`POST /send`, `GET /health`, `GET /capabilities`). The core does NOT maintain provider-specific adapter modules — all provider integration is delegated to external adapter services.
3. **Retry Logic with Exponential Backoff:** Failed deliveries are retried with configurable exponential backoff delays and jitter. Each channel has its own retry policy (max attempts, base delay, backoff multiplier). After exhausting retries, the notification is moved to the dead letter queue.
4. **Circuit Breaker Pattern:** Implements a circuit breaker for each adapter service. If an adapter exceeds a failure threshold within a time window, the circuit opens and subsequent requests are immediately fast-failed until the adapter recovers. This prevents cascading failures and resource exhaustion.
5. **Delivery Status Tracking:** Publishes delivery status updates (sent, failed) to the `xch.notifications.status` exchange via fire-and-forget for consumption by the Audit Service and Notification Engine. Webhook-originated statuses (delivered, bounced) are published by adapter services directly.
6. **Fallback Channel Support:** When a primary channel fails after all retries, the service can optionally trigger a fallback channel (e.g., if SMS delivery fails, attempt email delivery) based on the notification's fallback configuration.
7. **Token Bucket Rate Limiting:** Enforces per-adapter outbound rate limits using a token bucket algorithm to stay within contractual provider quotas. Rate limit configuration is stored in the `provider_configs` database table.
8. **Media & Attachment Handling:** Processes the `media` array from dispatch messages with channel-specific rules — downloading attachments for email, passing media URLs for WhatsApp and push. Processed media is passed to the adapter in the `POST /send` request.
9. **Adapter Health Monitoring:** Periodically calls `GET /health` on each registered adapter service and feeds results into the circuit breaker state machine. If an adapter reports unhealthy, the circuit breaker can preemptively open.
10. **Asynchronous Audit Logging:** All delivery attempt records and status transitions are published to RabbitMQ as fire-and-forget messages — no synchronous database writes on the critical delivery path.

> **Info:** **Dumb Pipe Architecture**
>
> All providers — including Braze and Mailgun, both of which offer their own templating systems — are integrated as "dumb pipes." The Channel Router sends pre-rendered content produced by the Template Service. Provider-side templates, Liquid engines, and Mailgun's Handlebars rendering are deliberately unused to preserve our Template Service's ownership of rendering, custom helpers, immutable versioning, multi-channel consistency, and provider portability.

> **Info:** **Adapter Services Own Webhooks**
>
> Provider webhook endpoints (delivery status callbacks from Mailgun, Braze, WhatsApp/Meta, AWS SES/SNS) are handled by each adapter service, not by the core. Adapters verify signatures, normalize events to a standard format, and publish to RabbitMQ. The Notification Gateway routes webhook requests to the appropriate adapter service.

---

## 2. Architecture & Integration Points

The Channel Router Core sits at the end of the notification pipeline — downstream from the Notification Engine and upstream of provider adapter services. It is a pure consumer: it receives fully rendered messages from RabbitMQ, dispatches them to adapter services via HTTP, and publishes status events back to RabbitMQ.

### Upstream & Downstream Dependencies

| Direction | System | Protocol | Description |
|---|---|---|---|
| **Upstream** | Notification Engine | RabbitMQ (AMQP) | Consumes rendered notification dispatch messages from `xch.notifications.deliver` exchange via priority-tiered, channel-specific queues |
| **Downstream** | adapter-mailgun (:3171) | HTTP/REST (sync) | Email delivery via standardized `POST /send` contract |
| **Downstream** | adapter-braze (:3172) | HTTP/REST (sync) | Multi-channel delivery (email, SMS, WhatsApp, push) via standardized `POST /send` contract |
| **Downstream** | adapter-whatsapp (:3173) | HTTP/REST (sync) | WhatsApp delivery via standardized `POST /send` contract |
| **Downstream** | adapter-aws-ses (:3174) | HTTP/REST (sync) | Email delivery via standardized `POST /send` contract |
| **Downstream** | Audit Service | RabbitMQ (AMQP) | Publishes delivery status transitions and delivery attempt records (fire-and-forget) to `xch.notifications.status` exchange |
| **Upstream** | Notification Engine | RabbitMQ (AMQP) | Publishes final delivery status (SENT, FAILED) back to `xch.notifications.status` for lifecycle updates |
| **Inbound** | Provider Webhooks | HTTP (async callbacks) | Routed by Notification Gateway to adapter services (adapter-mailgun, adapter-braze, adapter-whatsapp, adapter-aws-ses). Adapters verify, normalize, and publish to RabbitMQ. |
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
│ xch.notifications.deliver│      │           Channel Router Core Service                      │
│ (Topic Exchange)         │─────▶│           :3154                                            │
│                          │      │                                                            │
│ q.deliver.{channel}.     │      │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│   {priority}             │      │  │  Dispatch     │  │  Adapter     │  │  Circuit Breaker │ │
│                          │      │  │  Router       │──▶│  Resolver    │──▶│  + Rate Limiter │ │
└──────────────────────────┘      │  │  (Channel)    │  │  (DB cache)  │  │  (Token Bucket)  │ │
                                  │  └──────────────┘  └──────────────┘  └────────┬─────────┘ │
                                  │                                                │           │
                                  │  ┌──────────────┐  ┌──────────────┐  ┌────────▼─────────┐ │
                                  │  │  Retry       │  │  Fallback    │  │  Media           │ │
                                  │  │  Engine      │  │  Handler     │  │  Processor       │ │
                                  │  └──────────────┘  └──────────────┘  └────────┬─────────┘ │
                                  │                                                │           │
                                  │               HTTP POST /send (adapter contract)│           │
                                  └────────────────────────────────────────────────┼───────────┘
                                                                                   │
                                       ┌───────────────┬───────────────┬───────────┼───────────┐
                                       │               │               │           │
                                       ▼               ▼               ▼           ▼
                                  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
                                  │ adapter- │  │ adapter- │  │ adapter- │  │ adapter- │
                                  │ mailgun  │  │  braze   │  │ whatsapp │  │ aws-ses  │
                                  │  :3171   │  │  :3172   │  │  :3173   │  │  :3174   │
                                  │ (Email)  │  │ (Multi)  │  │  (WA)    │  │ (Email)  │
                                  └──────────┘  └──────────┘  └──────────┘  └──────────┘
                                       │               │               │           │
                                       ▼               ▼               ▼           ▼
                                    Mailgun        Braze API    Meta Cloud   AWS SES
                                    API            + /users/    API v21.0    API v2
                                                   track

                                  ┌──────────────────────────────────────────────────────────────┐
                                  │  Core publishes status to xch.notifications.status           │
                                  │  Adapters publish webhook events to xch.notifications.status │
                                  └──────────────┬───────────────────────────────────────────────┘
                                                 │
                                                 ├──▶ Audit Service :3156
                                                 └──▶ Notification Engine :3152

                                  ┌───────────────────────────────────────────────────────────┐
                                  │  Webhook Path (bypasses core entirely)                    │
                                  │                                                           │
                                  │  Provider → Gateway :3150 → Adapter → verify + normalize  │
                                  │    → publish to xch.notifications.status                  │
                                  └───────────────────────────────────────────────────────────┘
```

---

## 3. Delivery Pipeline

Every message consumed from the `xch.notifications.deliver` exchange passes through a 7-step delivery pipeline. This pipeline is the critical path — it is optimized for speed and resilience with no synchronous database writes.

### 3.1 Pipeline Steps

1. **Consume Message:** Receive the dispatch message from the priority-tiered, channel-specific RabbitMQ queue (e.g., `q.deliver.email.critical`).
2. **Resolve Adapter:** Look up the active adapter service for the target channel from the `provider_configs` table (cached in memory with event-driven invalidation). Resolve the adapter URL.
3. **Check Circuit Breaker:** Verify the resolved adapter's circuit breaker is in `CLOSED` or `HALF_OPEN` state. If `OPEN`, fast-fail and proceed to retry/fallback logic.
4. **Rate Limit Check:** Acquire a token from the adapter's token bucket rate limiter. If no token is available, delay (back-pressure) until a token becomes available or a configurable timeout is reached.
5. **Process Media:** If the dispatch message includes a `media` array, process entries according to channel-specific rules (download attachments for email, pass URLs for WhatsApp/push, skip for SMS).
6. **Send to Adapter Service:** HTTP POST to the resolved adapter service's `/send` endpoint with the pre-rendered content and processed media. The adapter translates the standardized request into the provider-specific API format and returns a `SendResult`.
7. **Publish Status & ACK:** Based on the adapter's `SendResult` (`success`, `retryable`), publish the delivery status (SENT or FAILED) to `xch.notifications.status` as a fire-and-forget message. Publish a `delivery_attempt` record asynchronously. ACK the RabbitMQ message.

### Figure 3.1 — Delivery Pipeline Flowchart

```
    ┌───────────────────────────────┐
    │  1. Consume Dispatch Message   │  ◄── RabbitMQ: q.deliver.{channel}.{priority}
    └──────────────┬────────────────┘
                   ▼
    ┌───────────────────────────────┐
    │  2. Resolve Active Adapter     │  ◄── provider_configs (in-memory cache)
    │     Service URL               │      adapter_url from DB
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
    │  6. HTTP POST /send to         │  ◄── Adapter service translates to provider API
    │     Adapter Service            │
    └──────────────┬────────────────┘
                   │
          ┌────────┴────────┐
          │                 │
    SendResult:          SendResult:
    success=true         success=false
          │                 │
          │         ┌───────┴───────┐
          │         │               │
          │      retryable       not retryable
          │      =true           =false
          │         │               │
          ▼         ▼               ▼
    ┌──────────┐ ┌──────────────┐ ┌──────────────┐
    │  Record  │ │  Update CB   │ │  Mark FAILED │
    │  SENT    │ │  state       │ │  immediately │
    │  status  │ │  Evaluate    │ │              │
    └──────────┘ │  retry or    │ └──────────────┘
                 │  fallback    │
                 └──────────────┘
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

> **Info:** **Pre-Rendered Content:** The `content.body` field contains fully rendered output from the Template Service. For email, this is complete HTML. For SMS, this is plain text. For WhatsApp, this is message text. For push, this is the notification body. The Channel Router never interprets or transforms this content — it passes it directly to the adapter service.
---

## 4. Adapter Service Contract

The Channel Router Core communicates with all provider adapter services through a **standardized HTTP contract**. Every adapter implements the same three endpoints. This is the formal contract that makes provider substitution possible — adding a new provider requires deploying a new adapter that implements this contract and registering its URL.

### 4.1 `POST /send` — Deliver a Notification

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

> **Info:** The core has **already processed media** before calling the adapter. For email, attachments are downloaded and base64-encoded. For WhatsApp/push, media URLs are passed through. For SMS, media is stripped. The adapter receives ready-to-use media data.

**Response (`SendResult`):**

```json
{
  "success": true,
  "providerMessageId": "0102018abc-456def-789ghi",
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

### 4.2 `GET /health` — Provider Health Check

**Response:**

```json
{
  "status": "ok",
  "providerId": "aws-ses",
  "providerName": "AWS SES",
  "supportedChannels": ["email"],
  "latencyMs": 45,
  "details": {
    "apiReachable": true,
    "lastSuccessfulSend": "2026-02-26T10:15:00Z"
  }
}
```

The core periodically calls this (configurable interval, default every 30s) and feeds the result into the circuit breaker state machine. If `/health` fails or returns unhealthy, the circuit breaker can preemptively open.

### 4.3 `GET /capabilities` — Adapter Self-Description

Called once at startup and on cache refresh. Allows the core to discover what the adapter supports without hardcoding.

**Response:**

```json
{
  "providerId": "aws-ses",
  "providerName": "AWS SES",
  "supportedChannels": ["email"],
  "supportsAttachments": true,
  "supportsMediaUrls": false,
  "maxAttachmentSizeMb": 10,
  "maxRecipientsPerRequest": 50,
  "webhookPath": "/webhooks/inbound"
}
```

### 4.4 Adapter Resolution

When a dispatch message arrives, the core resolves the active adapter service for the target channel:

```
Dispatch message (channel: "email")
    │
    ▼
┌──────────────────────────────────────────┐
│  Adapter Resolution                       │
│                                          │
│  1. Query provider_configs (cached)       │
│     WHERE channel = "email"               │
│     AND is_active = true                  │
│                                          │
│  2. If multiple active adapters:          │
│     Select by routing_weight (weighted    │
│     random) or routing_mode (primary/     │
│     failover)                             │
│                                          │
│  3. Return adapter_url from DB            │
└──────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────┐
│  Resolved: http://adapter-mailgun:3171   │
│  or: http://adapter-aws-ses:3174         │
│  or: http://adapter-braze:3172           │
└──────────────────────────────────────────┘
```

### 4.5 Routing Modes

| Mode | Description | Use Case |
|---|---|---|
| `primary` | All traffic goes to the primary adapter. Failover adapter used only when circuit breaker opens. | Default — simple, predictable routing |
| `weighted` | Traffic distributed across adapters by `routing_weight` percentage (e.g., 80% Mailgun, 20% AWS SES). | A/B testing, gradual migration, load distribution |
| `failover` | Ordered adapter list. If adapter N fails and circuit opens, traffic moves to adapter N+1. | High availability — automatic adapter failover |

### 4.6 Adapter Registry

```
Channel Router Core
  │
  ├── AdapterRegistry (in-memory, cached from provider_configs)
  │     │
  │     ├── Email Adapters
  │     │     ├── adapter-mailgun:3171    (adapter_url, routing_weight, rate limits)
  │     │     └── adapter-aws-ses:3174    (adapter_url, routing_weight, rate limits)
  │     │
  │     ├── SMS Adapters
  │     │     └── adapter-braze:3172      (adapter_url, routing_weight, rate limits)
  │     │
  │     ├── WhatsApp Adapters
  │     │     ├── adapter-whatsapp:3173   (adapter_url, routing_weight, rate limits)
  │     │     └── adapter-braze:3172      (adapter_url, routing_weight, rate limits)
  │     │
  │     └── Push Adapters
  │           └── adapter-braze:3172      (adapter_url, routing_weight, rate limits)
  │
  └── AdapterResolver (selects active adapter per channel + routing mode)
```

---

## 5. Provider Adapter Services

Each provider adapter is a small, independently deployable NestJS microservice that owns all provider-specific logic. The core never changes when a new provider is added.

### 5.1 Adapter Service Architecture

Each adapter service is responsible for:

| Responsibility | Details |
|---|---|
| Translate dispatch → provider API call | Map the standardized `SendRequest` to the provider's specific API format (JSON, form-data, etc.) |
| Call the provider API | Use the provider's SDK or HTTP client. Handle the HTTP response. |
| Return standardized result | Return `SendResult { success, providerMessageId, retryable, errorMessage, httpStatus, providerResponse }` |
| Webhook signature verification | Verify inbound webhooks using the provider's specific method (ECDSA, HMAC, etc.) |
| Webhook event normalization | Map provider event names to internal statuses (DELIVERED, FAILED, etc.) |
| Publish normalized webhook events | Publish to `xch.notifications.status` via RabbitMQ with routing key `adapter.webhook.{providerId}` |
| Health check | Test connectivity to the provider API via `GET /health` |
| Provider-specific logic | E.g., Braze user profile sync, WhatsApp/Meta phone number formatting |
| Own its credentials | Credentials stored as adapter env vars or secret store — not passed by the core |

### 5.2 How to Add a New Provider (Step by Step)

This is the key value proposition. Here's what happens when the business asks for "add Postmark for email":

**Step 1 — Code the Adapter Service (~2-4 hours for a simple REST provider)**

Use the adapter scaffold template. Implement three things:

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

**Step 2 — Deploy**

```bash
docker build -t provider-adapter-postmark .
docker run -d --name adapter-postmark --network notificationapi \
  -e POSTMARK_API_TOKEN=xxx \
  -e RABBITMQ_URL=amqp://... \
  -p 3176:3176 \
  provider-adapter-postmark
```

**Step 3 — Register in Core (Configuration Only)**

Via the admin API:

```
POST /providers/register
{
  "providerName": "Postmark",
  "providerId": "postmark",
  "channel": "email",
  "adapterUrl": "http://provider-adapter-postmark:3176",
  "isActive": true,
  "routingWeight": 50,
  "rateLimitTokensPerSec": 80,
  "rateLimitMaxBurst": 160
}
```

**Step 4 — Register Webhook Route in Gateway (Configuration Only)**

Add to gateway routing config:

```json
{
  "path": "/webhooks/postmark",
  "target": "http://provider-adapter-postmark:3176/webhooks/inbound"
}
```

**Step 5 — Done**

The core automatically discovers the new adapter via `provider_configs` cache refresh, calls `GET /capabilities` to learn what it supports, starts routing email traffic to it (based on routing_weight or active/failover config), tracks circuit breaker state for it, and enforces rate limits for it.

**Zero code changes to the core. Zero redeployment of the core.**

### 5.3 Adapter Scaffold Template

To make adapter creation fast and consistent, the project provides a scaffold template:

```
provider-adapter-template/
  src/
    main.ts                       ← NestJS bootstrap (fixed)
    app.module.ts                 ← Imports config, send, webhook, health modules (fixed)
    send/
      send.controller.ts          ← POST /send — delegates to service (fixed)
      send.service.ts             ← IMPLEMENT: translateAndSend()
      send-request.dto.ts         ← Standardized input DTO (fixed)
      send-result.dto.ts          ← Standardized output DTO (fixed)
    webhooks/
      webhook.controller.ts       ← POST /webhooks/inbound — delegates to service (fixed)
      webhook.service.ts          ← IMPLEMENT: verify() + normalize()
      webhook-event.dto.ts        ← Standardized output DTO (fixed)
    health/
      health.controller.ts        ← GET /health, GET /capabilities (fixed)
      health.service.ts           ← IMPLEMENT: checkProvider()
      capabilities.dto.ts         ← Response DTO (fixed)
    rabbitmq/
      rabbitmq.module.ts          ← RabbitMQ connection for webhook publishing (fixed)
      webhook-publisher.ts        ← Publishes normalized events to xch.notifications.status (fixed)
    config/
      base-config.ts              ← PORT, RABBITMQ_URL, LOG_LEVEL (fixed)
      provider-config.ts          ← IMPLEMENT: provider-specific env vars
  Dockerfile                      ← Multi-stage build (fixed)
  tsconfig.json                   ← Shared config (fixed)
  package.json                    ← Base dependencies (fixed)
  jest.config.ts                  ← Test config (fixed)
```

Files marked `(fixed)` are provided by the scaffold and never modified. The developer fills in 3 methods:

1. **`sendService.translateAndSend(request: SendRequest): Promise<SendResult>`** — Build the provider API request and call it
2. **`webhookService.verify(headers, body): boolean`** — Verify the provider's webhook signature
3. **`webhookService.normalize(body): WebhookEvent[]`** — Map provider events to standardized format

### 5.4 Provider Adapter Reference Table

| Adapter Service | Port | Channels | SDK / Client | Special Logic | LOC Estimate |
|---|---|---|---|---|---|
| adapter-mailgun | 3171 | Email | HTTP REST (axios) | HMAC-SHA256 webhook verification | ~350 |
| adapter-braze | 3172 | Email, SMS, WhatsApp, Push | HTTP REST (axios) | Shared secret header + Currents connector | ~500 |
| adapter-whatsapp | 3173 | WhatsApp | HTTP REST (axios, Meta Cloud API v21.0) | GET challenge + X-Hub-Signature-256 | ~400 |
| adapter-aws-ses | 3174 | Email | `@aws-sdk/client-sesv2` | SNS X.509 certificate signature verification | ~400 |

### 5.5 Provider-Specific Mapping Details (Adapter-Internal Reference)

The following mapping tables document how each adapter translates the standardized `SendRequest` into provider-specific API calls. This logic is implemented **inside each adapter service**, not in the core.

#### Mailgun Adapter (Email)

| Attribute | Value |
|---|---|
| **SDK** | `mailgun.js` + `form-data` |
| **Auth** | HTTP Basic Auth (`api:{API_KEY}`) |
| **Endpoint** | `POST https://api.mailgun.net/v3/{domain}/messages` (US) or `https://api.eu.mailgun.net/v3/{domain}/messages` (EU) |
| **Content Format** | `multipart/form-data` with `from`, `to`, `subject`, `html`, `attachment` fields |
| **Webhook Events** | `accepted`, `delivered`, `temporary_fail`, `permanent_fail`, `opened`, `clicked`, `unsubscribed`, `complained` |
| **Webhook Verification** | HMAC-SHA256 with dedicated Webhook Signing Key |

**Mapping:**

| SendRequest Field | Mailgun API Field |
|---|---|
| `recipient.email` | `to` |
| `content.subject` | `subject` |
| `content.body` (HTML) | `html` |
| `media[context=attachment]` | `attachment` (binary multipart field) |
| `metadata.correlationId` | `v:correlationId` (custom variable) |
| `metadata.notificationId` | `v:notificationId` (custom variable) |

> **Info:** **Mailgun Auto-Throttling:** Mailgun handles ESP-level throttling and warm-up automatically. The core's token bucket rate limiter for Mailgun uses a relaxed configuration since Mailgun manages delivery pacing internally.

#### Braze Adapter (Multi-Channel — Email, SMS, WhatsApp, Push)

| Attribute | Value |
|---|---|
| **SDK** | Custom HTTP client (Braze REST API) |
| **Auth** | API key in `Authorization: Bearer {key}` header |
| **Endpoint** | `POST https://rest.iad-01.braze.com/messages/send` (instance-specific URL) |
| **Content Format** | JSON with `external_user_ids`, `messages` object containing channel-specific payloads |
| **Rate Limit** | 250,000 req/hour (shared across all `/messages/send` and `/campaigns/trigger/send`) |
| **Max Recipients** | 50 per request |

**Email via Braze:**

| SendRequest Field | Braze API Field |
|---|---|
| `recipient.customerId` | `external_user_ids[0]` |
| `content.subject` | `messages.email.subject` |
| `content.body` (HTML) | `messages.email.body` |
| `metadata.notificationId` | `messages.email.extras.notificationId` |

**SMS via Braze:**

| SendRequest Field | Braze API Field |
|---|---|
| `recipient.customerId` | `external_user_ids[0]` |
| `content.body` (text) | `messages.sms.body` |
| Adapter config `subscriptionGroupId` | `messages.sms.subscription_group_id` |

**WhatsApp via Braze:**

| SendRequest Field | Braze API Field |
|---|---|
| `recipient.customerId` | `external_user_ids[0]` |
| `content.body` (text) | `messages.whats_app.body` |

**Push via Braze:**

| SendRequest Field | Braze API Field |
|---|---|
| `recipient.customerId` | `external_user_ids[0]` |
| `content.subject` (title) | `messages.apple_push.alert.title` / `messages.android_push.title` |
| `content.body` | `messages.apple_push.alert.body` / `messages.android_push.alert` |

#### WhatsApp Adapter (adapter-whatsapp)

| Attribute | Value |
|---|---|
| **SDK** | HTTP REST (axios, Meta Cloud API v21.0) |
| **Auth** | System user token in `Authorization: Bearer {token}` header |
| **Endpoint** | `POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages` |
| **Content Format** | JSON with `messaging_product: "whatsapp"`, `to`, `type`, and channel-specific payload (`text`, `template`, `image`, `document`) |
| **Rate Limit** | 80 messages/sec (Meta Business tier) |
| **Webhook Events** | `sent`, `delivered`, `read`, `failed` (via Webhooks API status updates) |
| **Webhook Verification** | GET challenge verification + X-Hub-Signature-256 (HMAC-SHA256 of body with app secret) |

**Mapping:**

| SendRequest Field | Meta Cloud API Field |
|---|---|
| `recipient.phone` | `to` (E.164 format without `+` prefix) |
| `content.body` (text) | `text.body` (for text messages) or `template` structure (for template messages) |
| `media[type=image]` | `image.link` |
| `media[type=document]` | `document.link` + `document.filename` |
| `metadata.notificationId` | `biz_opaque_callback_data` (for webhook correlation) |

**Supported Message Types:**

| Type | Description |
|---|---|
| `text` | Plain text message via `text.body` |
| `template` | Pre-approved WhatsApp template with parameters |
| `image` | Image message with URL link |
| `document` | Document attachment with URL link and filename |

> **Warning:** **WhatsApp Routing Rule:** Both adapter-whatsapp (Meta native) and adapter-braze support WhatsApp. Only one can be active for the WhatsApp channel at a time — controlled via the `isActive` flag on the provider registration. When registering both providers for WhatsApp, set `isActive: true` on only one.

#### AWS SES Adapter (adapter-aws-ses)

| Attribute | Value |
|---|---|
| **SDK** | `@aws-sdk/client-sesv2` (`SendEmailCommand`) |
| **Auth** | IAM credentials (access key + secret key) or IAM role (preferred for ECS/EKS) |
| **Endpoint** | AWS SES v2 API (region-specific, e.g., `email.us-east-1.amazonaws.com`) |
| **Content Format** | `SendEmailCommand` with `Destination.ToAddresses`, `Content.Simple.Subject`, `Content.Simple.Body.Html` |
| **Rate Limit** | 14 emails/sec (default sandbox); request production increase for higher throughput |
| **Webhook Events** | `Send`, `Delivery`, `Bounce`, `Complaint`, `Reject`, `Open`, `Click` (via SNS notifications from Configuration Sets) |
| **Webhook Verification** | SNS X.509 certificate-based signature verification + subscription confirmation auto-confirm |

**Mapping:**

| SendRequest Field | AWS SES v2 API Field |
|---|---|
| `recipient.email` | `Destination.ToAddresses[0]` |
| `recipient.name` | Combined as `"Name" <email>` in `ToAddresses` |
| `content.subject` | `Content.Simple.Subject.Data` |
| `content.body` (HTML) | `Content.Simple.Body.Html.Data` |
| `media[context=attachment]` | Raw MIME message via `Content.Raw` (switches to raw mode for attachments) |
| `metadata.notificationId` | `EmailTags[].Name: "notificationId"` |
| `metadata.correlationId` | `EmailTags[].Name: "correlationId"` |

**Configuration Sets:** AWS SES uses Configuration Sets to route event notifications to SNS topics. The adapter creates/uses a Configuration Set that publishes delivery events (Send, Delivery, Bounce, Complaint, Open, Click) to an SNS topic, which delivers to the adapter's webhook endpoint.

**Dual Mode:** The adapter supports both API mode (`SendEmailCommand`) and SMTP relay mode. API mode is preferred for programmatic sending with tracking; SMTP relay is available as a fallback.

### 5.6 Provider Summary Table

| Channel | Provider | Provider ID | Adapter Service | Port | Status | Integration Pattern |
|---|---|---|---|---|---|---|
| **Email** | Mailgun | `mailgun` | adapter-mailgun | 3171 | Active | Dumb pipe — pre-rendered HTML via multipart/form-data API |
| **Email** | AWS SES | `aws-ses` | adapter-aws-ses | 3174 | Active | Dumb pipe — pre-rendered HTML via SES v2 API or SMTP relay |
| **Email** | Braze | `braze-email` | adapter-braze | 3172 | Standby | Dumb pipe — pre-rendered HTML via /messages/send |
| **SMS** | Braze | `braze-sms` | adapter-braze | 3172 | Active | Dumb pipe — pre-rendered text via /messages/send |
| **WhatsApp** | Braze | `braze-whatsapp` | adapter-braze | 3172 | Standby | Dumb pipe — pre-rendered text + media via /messages/send |
| **WhatsApp** | WhatsApp (Meta) | `whatsapp-meta` | adapter-whatsapp | 3173 | Active | Dumb pipe — pre-rendered text + media via Cloud API v21.0 |
| **Push** | Braze | `braze-push` | adapter-braze | 3172 | Active | Dumb pipe — pre-rendered title+body via /messages/send |
---

## 6. Rate Limiting

The Channel Router Core enforces outbound rate limits per adapter service using a **token bucket** algorithm. This ensures outbound request rates stay within contractual provider quotas and prevents throttling, temporary bans, or financial penalties. Rate limits are enforced BEFORE calling the adapter service.

### 6.1 Token Bucket Algorithm

Each adapter has its own token bucket:

```
Token Bucket (per adapter)
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

Rate limit values are stored in the `provider_configs` database table (`rate_limit_tokens_per_sec`, `rate_limit_max_burst` columns), not in per-provider environment variables. This enables runtime configuration changes via the admin API without restarting the service.

| Adapter | Tokens/Second | Max Burst | Source |
|---|---|---|---|
| **adapter-mailgun** | 100 | 200 | Mailgun auto-throttling; relaxed config |
| **adapter-braze** | 250 | 500 | 250k req/hr (~69/sec) |
| **adapter-whatsapp** | 80 | 160 | 80 messages/sec (Meta Business tier) |
| **adapter-aws-ses** | 50 | 100 | SES default: 14/sec (request production increase) |

> **Warning:** **Rate Limit Planning:** Exceeding provider rate limits results in HTTP 429 throttling, temporary bans, or financial penalties. Monitor the `channel_router_rate_limit_wait_ms` metric and adapter response codes for early warning signs. When sustained throughput approaches 70% of an adapter's rate limit, consider upgrading the provider plan or enabling multi-adapter weighted routing to distribute load.

---

## 7. Circuit Breaker Pattern

Each adapter service has an independent circuit breaker that prevents cascading failures when an adapter or its underlying provider is unhealthy. The circuit breaker uses a state machine with three states.

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
                     │             │      (no adapter calls)
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

The core circuit breaker tracks success/failure of HTTP calls TO adapter services. There is a distinction between the adapter service itself being down versus the provider being down (reported via `SendResult`).

| Event | Counts as Failure | Rationale |
|---|---|---|
| Adapter returns `SendResult` with `success=false, retryable=true` | Yes | Provider server error (5xx) reported by adapter |
| Adapter service unavailable (connection refused) | Yes | Adapter is down |
| Adapter service timeout (no response within `ADAPTER_HTTP_TIMEOUT_MS`) | Yes | Adapter or provider is unresponsive |
| HTTP 5xx from adapter service itself | Yes | Adapter internal error |
| Adapter returns `SendResult` with `httpStatus=429` | Yes | Provider overloaded |
| Adapter returns `SendResult` with `success=false, retryable=false` | No | Permanent error (bad payload, auth issue) — not a transient provider failure |
| Adapter `GET /health` returns unhealthy | Yes (preemptive) | Provider connectivity issue detected proactively |

### 7.4 Circuit Breaker + Fallback Integration

When an adapter's circuit breaker opens, the behavior depends on the channel's routing mode:

| Routing Mode | Behavior When Circuit Opens |
|---|---|
| `primary` | If a failover adapter is configured, route to it. Otherwise, messages queue in the retry backlog. |
| `weighted` | Redistribute weight to healthy adapters. If all adapters are open, messages queue. |
| `failover` | Automatically move to the next adapter in the ordered list. |

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
    Delivery attempt fails (adapter returns success=false)
         │
         ▼
    ┌───────────────────────────────┐
    │  Retryable?                   │
    │                               │
    │  Yes: retryable=true          │────── No (retryable=false) ──▶ Mark FAILED immediately
    │  (5xx, timeout, adapter down) │
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

All retry delays include **random jitter** of up to 20% of the calculated delay. This prevents thundering herd effects when many notifications fail simultaneously (e.g., during an adapter outage) and all retry at the same moment.

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

When the dispatch message includes a `media` array, the Channel Router Core processes entries according to channel-specific rules before passing processed media to the adapter service in the `POST /send` request. Media assets are URL-referenced — source systems host files on their own CDNs.

### 10.1 Channel-Specific Processing

| Channel | `context: "inline"` | `context: "attachment"` | Implementation |
|---|---|---|---|
| **Email** | No action (inline images already rendered as `<img>` tags by Template Service) | Download file from URL, Base64-encode for adapter (adapter handles provider-specific format) | Enforce 10 MB per file, 30 MB total |
| **WhatsApp** | Pass media URL in `media[]` for adapter to use as `MediaUrl` | Pass media URL in `media[]` for adapter to use as document `MediaUrl` | Enforce 16 MB per message |
| **SMS** | Ignored (text only) | Ignored (text only) | `media` array skipped entirely |
| **Push** | Map first `type: "image"` entry URL for adapter to use as notification image | Ignored (push does not support attachments) | Enforce 1 MB image size |

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
    │    POST /send        proceed without
    │    to adapter        this attachment
    │         │               │
    └─────────┴───────────────┘
              │
              ▼
         HTTP POST /send
         to adapter service
```
---

## 11. Webhook Receivers & Delivery Status

In the decoupled architecture, **webhook endpoints are handled by each adapter service**, not by the Channel Router Core. Each adapter owns its provider's webhook verification, event parsing, status mapping, and normalization. The Notification Gateway routes incoming webhook requests to the appropriate adapter service.

### 11.1 Webhook Routing (via Notification Gateway)

| External URL | Gateway Routes To | Adapter Service |
|---|---|---|
| `POST /webhooks/mailgun` | `http://provider-adapter-mailgun:3171/webhooks/inbound` | adapter-mailgun |
| `POST /webhooks/braze` | `http://provider-adapter-braze:3172/webhooks/inbound` | adapter-braze |
| `POST /webhooks/whatsapp` | `http://provider-adapter-whatsapp:3173/webhooks/inbound` | adapter-whatsapp |
| `POST /webhooks/aws-ses` | `http://provider-adapter-aws-ses:3174/webhooks/inbound` | adapter-aws-ses |

Adding a new webhook route for a new provider adapter is configuration only — a new proxy rule in the gateway, not code.

### 11.2 Webhook Processing Flow (Inside Adapter)

```
    Provider webhook arrives at Gateway
         │
         ▼
    ┌───────────────────────────────┐
    │  Gateway routes by path        │  ◄── /webhooks/{provider} → adapter service
    │  to adapter service            │
    └──────────────┬────────────────┘
                   ▼
    ┌───────────────────────────────┐
    │  1. Verify Signature           │  ◄── Provider-specific verification (inside adapter)
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
    │  4. Publish Standardized Event │  ◄── To xch.notifications.status
    │     to RabbitMQ                │      routing key: adapter.webhook.{providerId}
    │     (fire-and-forget)          │
    └──────────────┬────────────────┘
                   ▼
    ┌───────────────────────────────┐
    │  5. Return 200 OK              │  ◄── Acknowledge receipt to provider
    └───────────────────────────────┘
```

### 11.3 Standardized Webhook Event (Published by Adapter)

Every adapter normalizes provider-specific webhook payloads into this standard format before publishing:

```json
{
  "providerMessageId": "mailgun-abc123",
  "providerId": "mailgun",
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

Published to `xch.notifications.status` with routing key `adapter.webhook.{providerId}`. The core never sees the raw provider webhook format.

### 11.4 Event Status Mapping (Adapter-Internal Reference)

This mapping is implemented **inside each adapter service**:

| Our Status | Mailgun Event | Braze Event | WhatsApp (Meta) Status | AWS SES Event |
|---|---|---|---|---|
| `SENT` | `accepted` | — | `sent` | `Send` |
| `DELIVERED` | `delivered` | `*.Delivery` | `delivered` | `Delivery` |
| `OPENED` | `opened` | `*.Open` | — | `Open` |
| `CLICKED` | `clicked` | `*.Click` | — | `Click` |
| `BOUNCED` | `failed` (permanent) | `*.Bounce` | `failed` | `Bounce` (Permanent) |
| `TEMP_FAIL` | `failed` (temporary) | `*.SoftBounce` | — | `Bounce` (Transient) |
| `SPAM_COMPLAINT` | `complained` | `*.SpamReport` | — | `Complaint` |
| `UNSUBSCRIBED` | `unsubscribed` | `*.Unsubscribe` | — | — |
| `READ` | — | — | `read` | — |
| `REJECTED` | — | — | — | `Reject` |

### 11.5 Provider Message ID Correlation

Each successful delivery returns a `providerMessageId` in the adapter's `SendResult`. This ID enables webhook-to-notification correlation:

| Provider | Message ID Format | Where Found in Webhook |
|---|---|---|
| Mailgun | `<timestamp.hash@domain>` | `Message-Id` field in webhook payload |
| Braze | `dispatch-id-xxx` | `dispatch_id` in postback/Currents payload |
| WhatsApp (Meta) | `wamid.xxx` | `messages[0].id` in webhook status update |
| AWS SES | `0102018abc-456def-...` | `MessageId` in SNS notification payload |

The `providerMessageId` is published in the core's `delivery_attempt` message to `xch.notifications.status`. The Audit Service stores it and uses it to correlate incoming webhook events from adapter services.

### 11.6 Webhook Signature Verification (Adapter-Internal Reference)

Each adapter implements its own provider-specific verification:

- **Mailgun adapter:** HMAC-SHA256 (Mailgun signing key + timestamp + token)
- **Braze adapter:** Shared secret header (`X-Braze-Webhook-Key`) + Currents IP allowlisting
- **WhatsApp adapter:** GET challenge verification + X-Hub-Signature-256 (HMAC-SHA256 of body with app secret)
- **AWS SES adapter:** SNS X.509 certificate-based signature verification + subscription confirmation auto-confirm

**Mailgun HMAC-SHA256 example (inside adapter-mailgun):**

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

### 11.7 Braze Delivery Tracking (Adapter-Internal Reference)

Braze offers two delivery tracking mechanisms, both handled by the Braze adapter:

| Mechanism | Channels | Latency | Format |
|---|---|---|---|
| **Transactional HTTP postbacks** | Email only (transactional) | Real-time | Webhook to configured URL |
| **Braze Currents** | All channels | ~5 min batch delay | Avro files streamed to S3/Snowflake |

For transactional email, the Braze adapter configures the HTTP postback URL when sending. For all other channels sent via Braze, delivery status is consumed from Braze Currents by the Audit Service.

> **Info:** **Braze Currents Latency:** Braze Currents batches events every ~5 minutes before streaming. This means SMS, WhatsApp, and push delivery statuses sent via Braze have a ~5 minute delay compared to real-time webhooks from Mailgun or Meta.

---

## 12. Braze Adapter Internal: Profile Synchronization

> **Info:** This section describes functionality that is **internal to the Braze adapter service** (adapter-braze :3172), not the Channel Router Core. The core is unaware of Braze profile sync — the adapter handles it transparently before calling the Braze API.

Braze requires recipients to exist as user profiles with contact information before messages can be delivered. The Braze adapter maintains a lightweight synchronization module that ensures Braze profiles are up-to-date.

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

The Braze `/users/track` endpoint has its own rate limit: **3,000 requests per 3 seconds**. The Braze adapter uses a separate token bucket for profile sync calls to avoid conflicting with the delivery rate limiter.

### 12.4 Cache Configuration

| Parameter | Default | Description |
|---|---|---|
| `BRAZE_PROFILE_CACHE_ENABLED` | `true` | Enable profile sync cache |
| `BRAZE_PROFILE_CACHE_TTL_SECONDS` | `3600` | TTL for cached profile sync status (1 hour) |
| `BRAZE_PROFILE_CACHE_MAX_SIZE` | `50000` | Max entries in the LRU cache |

> **Warning:** **Profile Sync Failure:** If the `/users/track` call fails, the delivery attempt proceeds anyway with `send_to_existing_only: false` in the Braze send payload. This creates the user profile inline but with potentially incomplete attributes. The failure is logged for monitoring.

---

## 13. RabbitMQ Topology

The Channel Router Core consumes from priority-tiered, channel-specific delivery queues and publishes status updates back to the notifications status exchange. Adapter services also publish webhook events to the same exchange.

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

| Exchange | Routing Key Pattern | Message Type | Publisher |
|---|---|---|---|
| `xch.notifications.status` | `notification.status.{outcome}` | Delivery status (SENT, FAILED) | Channel Router Core |
| `xch.notifications.status` | `channel-router.delivery-attempt.*` | Delivery attempt records (fire-and-forget audit) | Channel Router Core |
| `xch.notifications.status` | `adapter.webhook.{providerId}` | Webhook receipt events (DELIVERED, FAILED, etc.) | Provider Adapter Services |
| `xch.notifications.dlq` | N/A (fanout) | Dead-lettered messages after max retries | Channel Router Core |

> **Info:** Adapter services publish normalized webhook events to `xch.notifications.status` with routing key `adapter.webhook.{providerId}` (e.g., `adapter.webhook.mailgun`). The core's `channel-router.delivery-attempt.*` keys are published by the Channel Router Core for delivery-path events. The core no longer publishes `channel-router.webhook.*` keys — webhook events are published directly by adapters.

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
                                Channel Router Core
                                    │           │
                      HTTP POST /send           │ Publish status
                                    │           │
                                    ▼           ▼
                        Provider Adapter    xch.notifications.status
                        Services            (Topic Exchange)
                        (:3171-:3174)           │
                              │                 │
                              │ Publish          ├──▶ Audit Service (q.status.updates)
                              │ webhook events   └──▶ Notification Engine (q.engine.status)
                              │
                              └──────────▶ xch.notifications.status
                                           (adapter.webhook.{providerId})

                    xch.notifications.dlq (Fanout Exchange)
                    │
                    └──▶ q.dlq (Manual review / reprocessing)
```

> **Info:** **Dead-Letter Queue Configuration:** All delivery queues are configured with `x-dead-letter-exchange: xch.notifications.dlq`. Messages are dead-lettered after the channel's max retry attempts are exhausted. The DLQ is monitored via the Admin UI dashboard and messages can be manually reprocessed.
---

## 14. REST API Endpoints

The Channel Router Core exposes REST endpoints for health checks, adapter management, and channel/provider configuration management (proxied through the Gateway for admin operations). Webhook endpoints are handled by adapter services, not the core.

### 14.1 Adapter Management Endpoints

**POST** `/providers/register` — Register a new provider adapter service. Accepts adapter URL, provider ID, channel, rate limit configuration. Triggers capability discovery via `GET /capabilities` on the adapter.

**DELETE** `/providers/:id` — Deregister a provider adapter service. Removes from routing.

**GET** `/providers/:id/capabilities` — Proxy to adapter service's `GET /capabilities` endpoint. Returns supported channels, attachment support, limits.

**GET** `/providers/:id/health` — Proxy to adapter service's `GET /health` endpoint. Returns provider connectivity status and latency.

### 14.2 Channel Configuration Endpoints (via Gateway)

**GET** `/channels` — List all channel configurations with their current status, active adapter, routing mode, and health indicators.

Response:
```json
{
  "data": [
    {
      "id": "ch-001",
      "name": "Email",
      "type": "email",
      "isActive": true,
      "activeAdapter": "adapter-mailgun",
      "routingMode": "primary",
      "fallbackAdapter": "adapter-aws-ses",
      "health": {
        "circuitBreakerState": "CLOSED",
        "lastSuccessAt": "2026-02-21T10:15:00Z",
        "successRate24h": 99.7
      }
    }
  ]
}
```

**PUT** `/channels/:id/config` — Update channel configuration (active adapter, routing mode, routing weights, fallback adapter). Validates adapter connectivity before saving (optional dry-run mode).

**GET** `/providers` — List all registered provider adapter services with status, supported channels, adapter URL, circuit breaker state, and rate limit config.

**PUT** `/providers/:id/config` — Update provider adapter service configuration (adapter URL, routing weight, rate limits). Note: provider credentials are managed by each adapter service independently, not by the core.

### 14.3 Health & Readiness

**GET** `/health` — Liveness probe. Returns 200 if the service process is running.

**GET** `/ready` — Readiness probe. Checks PostgreSQL connectivity, RabbitMQ connection, and at least one adapter service per active channel is healthy (via adapter `GET /health` calls).

Response:
```json
{
  "status": "ok",
  "checks": {
    "database": "ok",
    "rabbitmq": "ok",
    "adapters": {
      "adapter-mailgun": "ok",
      "adapter-braze": "ok",
      "adapter-whatsapp": "ok",
      "adapter-aws-ses": "ok"
    }
  }
}
```

---

## 15. Database Design

The Channel Router Core owns the `channel_router_service` PostgreSQL schema with four tables for channel definitions, configuration, delivery tracking, and adapter management.

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
  |-------------------------------|                +---------------------------+
  | PK  id UUID                   |                | provider_configs          |
  |     notification_id UUID      |                |---------------------------|
  |     correlation_id UUID       |                | PK  id UUID               |
  |     channel VARCHAR(20)       |                |     provider_name         |
  | FK  provider_id UUID          |───────▶        |       VARCHAR(50)         |
  |     attempt_number INTEGER    |                |     provider_id           |
  |     status VARCHAR(20)        |                |       VARCHAR(50)         |
  |     provider_response JSONB   |                |     channel VARCHAR(20)   |
  |     provider_message_id       |                |     adapter_url           |
  |       VARCHAR(255)            |                |       VARCHAR(255)        |
  |     error_message TEXT        |                |     config_json JSONB     |
  |     metadata JSONB            |                |     is_active BOOLEAN     |
  |     attempted_at TIMESTAMP    |                |     routing_weight        |
  |     duration_ms INTEGER       |                |       INTEGER             |
  +-------------------------------+                |     rate_limit_tokens_    |
                                                   |       per_sec INTEGER     |
  NOTE: delivery_attempts rows are                 |     rate_limit_max_burst  |
  written asynchronously by an                     |       INTEGER             |
  audit consumer (from RabbitMQ                    |     circuit_breaker_state |
  messages published by the core),                 |       VARCHAR(20)         |
  NOT by the core directly.                        |     failure_count INTEGER |
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

Record of each delivery attempt per notification per channel. This is the highest-volume table in the schema. Rows are written asynchronously by a dedicated audit consumer that reads delivery attempt messages from RabbitMQ — the core and adapter services do NOT write to this table directly.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `notification_id` | `UUID` | No | | Notification ID from the dispatch message |
| `correlation_id` | `UUID` | Yes | | End-to-end correlation ID for tracing |
| `channel` | `VARCHAR(20)` | No | | Target channel: `email`, `sms`, `whatsapp`, `push` |
| `provider_id` | `UUID` | No | | FK to `provider_configs.id` |
| `attempt_number` | `INTEGER` | No | `1` | Retry attempt number (1-based) |
| `status` | `VARCHAR(20)` | No | | Attempt outcome: `SENT`, `DELIVERED`, `FAILED`, `RETRYING` |
| `provider_response` | `JSONB` | Yes | | Raw response from adapter (includes provider response) |
| `provider_message_id` | `VARCHAR(255)` | Yes | | Provider's message ID for webhook correlation |
| `error_message` | `TEXT` | Yes | | Error details on failure |
| `metadata` | `JSONB` | Yes | | Additional context (media failures, rate limit waits, etc.) |
| `attempted_at` | `TIMESTAMP` | No | `NOW()` | When the attempt was made |
| `duration_ms` | `INTEGER` | Yes | | Round-trip time of the adapter HTTP call |

#### `provider_configs`

Provider adapter service registration, configuration, and circuit breaker state.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | No | `gen_random_uuid()` | Primary key |
| `provider_name` | `VARCHAR(50)` | No | | Display name (e.g., "AWS SES", "Mailgun", "Braze") |
| `provider_id` | `VARCHAR(50)` | No | | Unique identifier (e.g., `aws-ses`, `mailgun`, `braze`) |
| `channel` | `VARCHAR(20)` | No | | Channel this provider serves: `email`, `sms`, `whatsapp`, `push` |
| `adapter_url` | `VARCHAR(255)` | No | | Base URL of the adapter service (e.g., `http://provider-adapter-aws-ses:3174`) |
| `config_json` | `JSONB` | Yes | | Adapter-specific metadata (no longer holds provider credentials — adapters own their own) |
| `is_active` | `BOOLEAN` | No | `true` | Whether this adapter is active for its channel |
| `routing_weight` | `INTEGER` | Yes | `100` | Weight for weighted routing mode (0-100) |
| `rate_limit_tokens_per_sec` | `INTEGER` | Yes | | Token bucket refill rate (configurable per adapter at runtime) |
| `rate_limit_max_burst` | `INTEGER` | Yes | | Token bucket capacity |
| `circuit_breaker_state` | `VARCHAR(20)` | No | `'CLOSED'` | Current state: `CLOSED`, `OPEN`, `HALF_OPEN` |
| `failure_count` | `INTEGER` | No | `0` | Current failure count in the circuit breaker window |
| `last_failure_at` | `TIMESTAMP` | Yes | | Timestamp of last failure |
| `last_health_check` | `TIMESTAMP` | Yes | | Last adapter health check timestamp |
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
| `idx_provider_configs_channel_active` | `provider_configs` | `channel, is_active` | B-tree | Adapter resolution per channel |
| `idx_provider_configs_adapter_url` | `provider_configs` | `adapter_url` | B-tree (unique) | Unique adapter URL enforcement |
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

All delivery-related log writes are performed **asynchronously** via RabbitMQ fire-and-forget messaging. The Channel Router Core never writes to its own database synchronously on the delivery critical path — all persistence is handled by a dedicated consumer that reads from RabbitMQ and writes to PostgreSQL.

### 16.1 Fire-and-Forget Pattern

```
    Channel Router Core (Delivery Path)             RabbitMQ                   Audit Consumer
         │                                            │                            │
         │  Delivery attempt completed                │                            │
         │  (adapter returned SendResult)             │                            │
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

| Routing Key | Payload | Trigger | Publisher |
|---|---|---|---|
| `channel-router.delivery-attempt.sent` | Full `delivery_attempt` record | Successful adapter call (SendResult.success=true) | Channel Router Core |
| `channel-router.delivery-attempt.failed` | Full `delivery_attempt` record with error details | Failed adapter call | Channel Router Core |
| `channel-router.delivery-attempt.retrying` | Attempt record with retry metadata (next delay, attempt number) | Retryable failure queued for retry | Channel Router Core |
| `adapter.webhook.{providerId}` | Standardized webhook event with mapped status | Provider webhook received and verified by adapter | Provider Adapter Service |
| `notification.status.sent` | Notification ID + status + timestamp | Notification status transition to SENT | Channel Router Core |
| `notification.status.delivered` | Notification ID + status + timestamp | Delivery confirmation via adapter webhook event | Provider Adapter Service |
| `notification.status.failed` | Notification ID + status + error + timestamp | Terminal failure after max retries | Channel Router Core |

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

### 17.1 Standard Email Delivery Flow (Mailgun via Adapter)

```
    Notification Engine          RabbitMQ                Channel Router Core      Mailgun Adapter        Mailgun
         │                         │                         │                      :3171               │
         │  Publish dispatch       │                         │                         │                │
         │  to xch.notifications.  │                         │                         │                │
         │  deliver                │                         │                         │                │
         │  key: notification.     │                         │                         │                │
         │  deliver.normal.email   │                         │                         │                │
         │────────────────────────▶│                         │                         │                │
         │                         │  Deliver to             │                         │                │
         │                         │  q.deliver.email.normal │                         │                │
         │                         │────────────────────────▶│                         │                │
         │                         │                         │                         │                │
         │                         │                         │  1. Resolve adapter     │                │
         │                         │                         │     (Mailgun active)    │                │
         │                         │                         │                         │                │
         │                         │                         │  2. Check circuit       │                │
         │                         │                         │     breaker (CLOSED)    │                │
         │                         │                         │                         │                │
         │                         │                         │  3. Acquire rate limit  │                │
         │                         │                         │     token (OK)          │                │
         │                         │                         │                         │                │
         │                         │                         │  4. Download attachment │                │
         │                         │                         │     (media processing)  │                │
         │                         │                         │                         │                │
         │                         │                         │  5. POST /send          │                │
         │                         │                         │────────────────────────▶│                │
         │                         │                         │                         │                │
         │                         │                         │                         │  POST /v3/     │
         │                         │                         │                         │  {domain}/     │
         │                         │                         │                         │  messages      │
         │                         │                         │                         │───────────────▶│
         │                         │                         │                         │  200 OK        │
         │                         │                         │                         │◀───────────────│
         │                         │                         │                         │                │
         │                         │                         │  SendResult:            │                │
         │                         │                         │  { success: true,       │                │
         │                         │                         │    providerMessageId:   │                │
         │                         │                         │    "<msg-id>" }         │                │
         │                         │                         │◀────────────────────────│                │
         │                         │                         │                         │                │
         │                         │  Publish SENT status    │                         │                │
         │                         │  (fire-and-forget)      │                         │                │
         │                         │◀────────────────────────│                         │                │
         │                         │                         │                         │                │
         │                         │  Publish delivery_      │                         │                │
         │                         │  attempt record         │                         │                │
         │                         │  (fire-and-forget)      │                         │                │
         │                         │◀────────────────────────│                         │                │
         │                         │                         │                         │                │
         │                         │                         │  ACK RabbitMQ message   │                │
```

### 17.2 Multi-Channel Delivery via Braze (Email + Push)

```
    Notification Engine          RabbitMQ                Channel Router Core      Braze Adapter         Braze
         │                         │                         │                      :3172               │
         │  Publish email dispatch │                         │                         │                │
         │  key: notification.     │                         │                         │                │
         │  deliver.critical.email │                         │                         │                │
         │────────────────────────▶│                         │                         │                │
         │                         │  q.deliver.email.       │                         │                │
         │                         │  critical ──────────────│                         │                │
         │                         │                         │  Resolve: Braze adapter │                │
         │                         │                         │                         │                │
         │                         │                         │  POST /send (email)     │                │
         │                         │                         │────────────────────────▶│                │
         │                         │                         │                         │                │
         │                         │                         │                         │  Sync user     │
         │                         │                         │                         │  POST /users/  │
         │                         │                         │                         │  track         │
         │                         │                         │                         │───────────────▶│
         │                         │                         │                         │  201 OK        │
         │                         │                         │                         │◀───────────────│
         │                         │                         │                         │                │
         │                         │                         │                         │  POST          │
         │                         │                         │                         │  /messages/send│
         │                         │                         │                         │───────────────▶│
         │                         │                         │                         │  201 OK        │
         │                         │                         │                         │◀───────────────│
         │                         │                         │                         │                │
         │                         │                         │  SendResult: success    │                │
         │                         │                         │◀────────────────────────│                │
         │                         │                         │                         │                │
         │                         │  Publish SENT (email)   │                         │                │
         │                         │◀────────────────────────│                         │                │
         │                         │                         │                         │                │
         ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
         │                         │                         │                         │                │
         │  Publish push dispatch  │                         │                         │                │
         │  key: notification.     │                         │                         │                │
         │  deliver.critical.push  │                         │                         │                │
         │────────────────────────▶│                         │                         │                │
         │                         │  q.deliver.push.        │                         │                │
         │                         │  critical ──────────────│                         │                │
         │                         │                         │  Resolve: Braze adapter │                │
         │                         │                         │                         │                │
         │                         │                         │  POST /send (push)      │                │
         │                         │                         │────────────────────────▶│                │
         │                         │                         │                         │  POST          │
         │                         │                         │                         │  /messages/send│
         │                         │                         │                         │───────────────▶│
         │                         │                         │                         │  201 OK        │
         │                         │                         │                         │◀───────────────│
         │                         │                         │  SendResult: success    │                │
         │                         │                         │◀────────────────────────│                │
         │                         │  Publish SENT (push)    │                         │                │
         │                         │◀────────────────────────│                         │                │
```

> **Info:** The Braze adapter handles user profile synchronization internally (via `/users/track`) before calling `/messages/send`. The core is completely unaware of this step — it only sees the `POST /send` request and the `SendResult` response.

### 17.3 Retry Flow with Circuit Breaker Trip

```
    Channel Router Core          Mailgun Adapter           RabbitMQ
         │                          :3171                    │
         │  Attempt 1               │                       │
         │  POST /send              │                       │
         │─────────────────────────▶│  → calls Mailgun API  │
         │                          │  → 500 Internal Error │
         │  SendResult:             │                       │
         │  success=false,          │                       │
         │  retryable=true          │                       │
         │◀─────────────────────────│                       │
         │                          │                       │
         │  Record failure          │                       │
         │  (failure_count: 1)      │                       │
         │                          │                       │
         │  Publish RETRYING status │                       │
         │──────────────────────────────────────────────────▶│
         │                          │                       │
         │  Re-queue with 5s delay  │                       │
         │                          │                       │
    ═══════════ 5 seconds later ════════════════════════════
         │                          │                       │
         │  Attempt 2               │                       │
         │  POST /send              │                       │
         │─────────────────────────▶│  → 500 again          │
         │  SendResult: retryable   │                       │
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
         │    adapter (if any)      │                       │
         │                          │                       │
    ═══════════ 30s cooldown ═══════════════════════════════
         │                          │                       │
         │  Circuit breaker →       │                       │
         │  HALF_OPEN               │                       │
         │                          │                       │
         │  Test request            │                       │
         │  POST /send              │                       │
         │─────────────────────────▶│  → 200 OK             │
         │  SendResult: success     │                       │
         │◀─────────────────────────│                       │
         │                          │                       │
         │  Circuit breaker →       │                       │
         │  CLOSED (reset)          │                       │
```

### 17.4 Fallback Channel Flow

```
    Channel Router Core          WhatsApp Adapter            RabbitMQ
         │                          :3173                    │
         │  Consume SMS dispatch    │                       │
         │  (with fallback: email)  │                       │
         │                          │                       │
         │  Attempt 1 - POST /send │                       │
         │─────────────────────────▶│  → Meta API 500       │
         │  SendResult: retryable   │                       │
         │◀─────────────────────────│                       │
         │                          │                       │
         │  Retry attempt 2 (30s)  │                       │
         │─────────────────────────▶│  → 500                │
         │◀─────────────────────────│                       │
         │                          │                       │
         │  Retry attempt 3 (2m)   │                       │
         │─────────────────────────▶│  → 500                │
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

### 17.5 Webhook Flow (Decoupled)

```
    Mailgun              Gateway             Mailgun Adapter         RabbitMQ           Audit Service
    (Provider)           :3150               :3171                      │                 :3156
         │                  │                     │                     │                    │
         │  POST /webhooks/ │                     │                     │                    │
         │  mailgun         │                     │                     │                    │
         │  { event:        │                     │                     │                    │
         │   "delivered",   │                     │                     │                    │
         │   signature... } │                     │                     │                    │
         │─────────────────▶│                     │                     │                    │
         │                  │                     │                     │                    │
         │                  │  Proxy to adapter   │                     │                    │
         │                  │  POST /webhooks/    │                     │                    │
         │                  │  inbound            │                     │                    │
         │                  │────────────────────▶│                     │                    │
         │                  │                     │                     │                    │
         │                  │                     │  1. Verify HMAC-    │                    │
         │                  │                     │     SHA256          │                    │
         │                  │                     │                     │                    │
         │                  │                     │  2. Parse event     │                    │
         │                  │                     │     Extract msg ID  │                    │
         │                  │                     │                     │                    │
         │                  │                     │  3. Map "delivered" │                    │
         │                  │                     │     → DELIVERED     │                    │
         │                  │                     │                     │                    │
         │                  │                     │  4. Publish to      │                    │
         │                  │                     │     xch.notif.status│                    │
         │                  │                     │     key: adapter.   │                    │
         │                  │                     │     webhook.mailgun │                    │
         │                  │                     │────────────────────▶│                    │
         │                  │                     │                     │  Deliver to        │
         │                  │                     │                     │  q.status.updates  │
         │                  │                     │                     │───────────────────▶│
         │                  │                     │                     │                    │
         │                  │  200 OK             │                     │                    │  Correlate via
         │                  │◀────────────────────│                     │                    │  providerMessageId
         │  200 OK          │                     │                     │                    │  Update notification
         │◀─────────────────│                     │                     │                    │  status → DELIVERED
```

### 17.6 Adapter Registration Flow

```
    Admin (via Gateway)          Channel Router Core         New Adapter Service
         │                            │                          (e.g., :3176)
         │                            │                              │
         │  POST /providers/register  │                              │
         │  { providerId: "postmark", │                              │
         │    channel: "email",       │                              │
         │    adapterUrl: "http://    │                              │
         │    adapter-postmark:3176", │                              │
         │    rateLimitTokensPerSec:  │                              │
         │    80 }                    │                              │
         │───────────────────────────▶│                              │
         │                            │                              │
         │                            │  GET /capabilities           │
         │                            │─────────────────────────────▶│
         │                            │                              │
         │                            │  { providerId: "postmark",   │
         │                            │    supportedChannels:        │
         │                            │    ["email"],                │
         │                            │    supportsAttachments: true }│
         │                            │◀─────────────────────────────│
         │                            │                              │
         │                            │  GET /health                 │
         │                            │─────────────────────────────▶│
         │                            │  { status: "ok" }            │
         │                            │◀─────────────────────────────│
         │                            │                              │
         │                            │  INSERT INTO provider_configs│
         │                            │  (adapter_url, channel,      │
         │                            │   rate_limit_*, etc.)        │
         │                            │                              │
         │                            │  Refresh adapter cache       │
         │                            │                              │
         │  201 Created               │                              │
         │  { id: "...",              │                              │
         │    status: "registered" }  │                              │
         │◀───────────────────────────│                              │
```

---

## 18. Error Handling

### 18.1 Error Classification

| Error Type | HTTP Code | Retryable | Action |
|---|---|---|---|
| **Adapter returns retryable error** | (via SendResult) | Yes | Retry with exponential backoff |
| **Adapter service unavailable** | — | Yes | Retry or failover to alternate adapter |
| **Adapter service timeout** | — | Yes | Retry with backoff |
| **Network timeout to adapter** | — | Yes | Retry with exponential backoff |
| **Rate limited** (provider 429 via SendResult) | 429 | Yes | Wait for rate limit window, then retry |
| **Invalid payload** (provider 400 via SendResult) | 400 | No | Mark FAILED immediately (our payload is bad) |
| **Authentication error** (provider 401/403 via SendResult) | 401/403 | No | Mark FAILED; alert ops (adapter credentials may be expired) |
| **Recipient not found** (provider 404 via SendResult) | 404 | No | Mark FAILED; log for investigation |
| **Media download failure** | — | Partial | Send without attachment; log warning |
| **RabbitMQ publish failure** | — | Yes | Retry publish; if persistent, log locally |
| **Database unavailable** | — | N/A | Delivery continues (async writes); audit logging delayed |

### 18.2 Dead Letter Queue

Messages that exhaust all retries are published to the `xch.notifications.dlq` fanout exchange. DLQ messages include:

```json
{
  "originalMessage": { "...dispatch message..." },
  "failureHistory": [
    { "attempt": 1, "error": "Adapter returned retryable error: HTTP 500", "at": "2026-02-20T10:15:31Z" },
    { "attempt": 2, "error": "Adapter returned retryable error: HTTP 500", "at": "2026-02-20T10:15:36Z" },
    { "attempt": 3, "error": "Adapter service timeout", "at": "2026-02-20T10:16:06Z" }
  ],
  "deadLetteredAt": "2026-02-20T10:18:06Z",
  "reason": "MAX_RETRIES_EXCEEDED",
  "channel": "sms",
  "adapter": "adapter-whatsapp"
}
```

DLQ messages can be reprocessed manually through the Admin UI or automatically by a scheduled reprocessing job.

---

## 19. Security Considerations

### 19.1 Credential Management

In the decoupled architecture, **each adapter service owns its own provider credentials**. The core does NOT hold or manage provider API keys, auth tokens, or webhook signing keys.

| Credential | Storage Location | Encryption | Rotation |
|---|---|---|---|
| Mailgun API key + signing key | adapter-mailgun env vars / secret store | Container-level | Rotate in adapter; no core impact |
| Braze API key + webhook key | adapter-braze env vars / secret store | Container-level | Rotate in adapter; no core impact |
| WhatsApp access token + app secret | adapter-whatsapp env vars / secret store | Container-level | Rotate in adapter; no core impact |
| AWS IAM credentials | adapter-aws-ses env vars / IAM role | Container-level (IAM role preferred) | Rotate in adapter; no core impact |

> **Info:** **Security Improvement:** The decoupled architecture reduces the blast radius of credential compromise. A compromised Mailgun adapter only leaks Mailgun credentials, not Braze/WhatsApp/SES credentials. In the monolithic design, all credentials were stored in a single service.

### 19.2 Core-to-Adapter Authentication

Internal service-to-service communication between the core and adapter services uses Docker network isolation. For production environments:

| Method | Description | Use Case |
|---|---|---|
| Docker network isolation | Adapters only accessible within the Docker network | Default — sufficient for single-host deployments |
| Shared secret (header) | Core includes a shared secret in `X-Internal-Auth` header | Multi-host Docker deployments |
| mTLS | Mutual TLS between core and adapters | Production Kubernetes deployments |

### 19.3 Webhook Security

Webhook signature verification is the responsibility of each adapter service:

- All adapter webhook endpoints verify provider signatures before processing.
- The Notification Gateway rate-limits webhook endpoints to prevent abuse.
- Webhook payloads are validated against expected schemas; malformed payloads are rejected.
- Webhook signing keys are stored in adapter-level secrets, separate from API keys.

### 19.4 Data Protection

- **PII in transit:** All provider API calls (from adapters) and core-to-adapter calls use TLS 1.2+.
- **PII in logs:** Recipient email addresses and phone numbers are masked in structured log output (e.g., `j***@example.com`, `+1***4567890`) in both core and adapter logs.
- **PII in delivery_attempts:** The `provider_response` JSONB column may contain PII from provider responses. Access to this column is restricted via RBAC.

### 19.5 Network Security

- Provider API calls are made from adapter services' egress only — the core has no direct connection to external providers.
- Webhook endpoints are exposed via the Notification Gateway with rate limiting; the gateway proxies to adapters on the internal network.
- Internal service communication (core ↔ adapters) uses Docker network isolation; mTLS available for production.

---

## 20. Monitoring & Health Checks

### 20.1 Key Metrics

| Metric | Type | Description |
|---|---|---|
| `channel_router_delivery_total` | Counter | Total delivery attempts (labels: channel, adapter, status) |
| `channel_router_delivery_duration_ms` | Histogram | Total delivery time including adapter call (labels: channel, adapter) |
| `channel_router_adapter_call_duration_ms` | Histogram | HTTP call round-trip time to adapter service (labels: adapter) |
| `channel_router_adapter_unavailable_total` | Counter | Adapter service unavailable/timeout events (labels: adapter) |
| `channel_router_retry_total` | Counter | Total retries triggered (labels: channel, adapter, attempt_number) |
| `channel_router_circuit_breaker_state` | Gauge | Circuit breaker state per adapter (0=closed, 1=half_open, 2=open) |
| `channel_router_circuit_breaker_trips_total` | Counter | Circuit breaker trip count (labels: adapter) |
| `channel_router_rate_limit_wait_ms` | Histogram | Time spent waiting for rate limit tokens (labels: adapter) |
| `channel_router_fallback_triggered_total` | Counter | Fallback channel activations (labels: primary_channel, fallback_channel) |
| `channel_router_media_download_duration_ms` | Histogram | Media asset download time (labels: channel) |
| `channel_router_media_failure_total` | Counter | Media download/validation failures (labels: channel, reason) |
| `channel_router_dlq_total` | Counter | Messages sent to dead letter queue (labels: channel, adapter) |
| `channel_router_queue_depth` | Gauge | Current message count in delivery queues (labels: queue) |

> **Info:** Braze-specific metrics (profile sync calls, profile sync duration) are now internal to the Braze adapter service and are not tracked by the core.

### 20.2 Health Check Endpoints

**GET `/health`** — Liveness probe. Returns 200 if the NestJS process is running.

**GET `/ready`** — Readiness probe. Checks:
- PostgreSQL connection (query `SELECT 1`)
- RabbitMQ connection (channel is open)
- At least one active adapter per enabled channel has circuit breaker in CLOSED state and responds to `GET /health`

### 20.3 Alerting Thresholds

| Alert | Condition | Severity |
|---|---|---|
| Circuit breaker opened | Any adapter transitions to OPEN state | High |
| Adapter service down | Adapter `GET /health` fails or returns unhealthy | High |
| DLQ accumulation | `q.dlq` depth > 100 messages | High |
| Delivery failure rate | >5% failure rate on any channel over 15 minutes | High |
| Rate limit saturation | Rate limit wait time p95 > 500ms | Medium |
| Media download failures | >10% media failures in 15 minutes | Low |

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
| **Adapter Communication** | | |
| `ADAPTER_HTTP_TIMEOUT_MS` | `10000` | HTTP timeout for adapter service calls (ms) |
| `ADAPTER_HEALTH_CHECK_INTERVAL_MS` | `30000` | Interval for periodic adapter health checks (ms) |
| **Circuit Breaker** | | |
| `CB_FAILURE_THRESHOLD` | `5` | Failures to trip the circuit |
| `CB_FAILURE_WINDOW_MS` | `60000` | Failure counting window (ms) |
| `CB_COOLDOWN_MS` | `30000` | Open state duration before half-open |
| `CB_HALF_OPEN_MAX_ATTEMPTS` | `1` | Test requests in half-open |
| `CB_SUCCESS_THRESHOLD` | `2` | Successes to close from half-open |
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
| **RabbitMQ Consumer** | | |
| `CONSUMER_PREFETCH_CRITICAL` | `5` | Prefetch count for critical queues |
| `CONSUMER_PREFETCH_NORMAL` | `10` | Prefetch count for normal queues |

> **Info:** **Rate limits are now in the database**, not in environment variables. Per-adapter rate limit values (`rate_limit_tokens_per_sec`, `rate_limit_max_burst`) are stored in the `provider_configs` table and can be changed at runtime via the admin API without restarting the service.

> **Info:** **Braze profile sync configuration** is now internal to the Braze adapter service (adapter-braze :3172). The core does not have Braze-specific env vars.

---

*Notification API Documentation v2.0 -- Architecture Team -- 2026*
