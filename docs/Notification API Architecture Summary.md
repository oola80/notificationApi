# Notification API — Architecture Summary

> Unified, event-driven notification platform for eCommerce. Decouples notification logic from source systems into purpose-built microservices. Source systems onboard via runtime field mappings — no code changes required.

---

## Services

| Service | Port | Status | Purpose |
|---|---|---|---|
| event-ingestion-service | 3151 | ✅ Done | Receives & normalizes events; assigns priority tier |
| notification-engine-service | 3152 | ✅ Done | Core orchestrator — rules, recipients, template dispatch |
| template-service | 3153 | ✅ Done | Template CRUD, Handlebars rendering, versioning |
| channel-router-service | 3154 | ✅ Done | Routes to provider adapters; circuit breaker, retry, fallback |
| admin-service | 3155 | 🔲 Scaffold | Backoffice configuration management |
| audit-service | 3156 | ✅ Done | Delivery tracking, receipts, analytics |
| email-ingest-service | 3157 | 🔲 Scaffold | SMTP ingest — parses inbound emails into events |
| bulk-upload-service | 3158 | ✅ Done | XLSX async bulk notification upload |
| notification-admin-ui | 3159 | ✅ Done | Next.js admin frontend |
| auth-rbac-service-backend | 3160 | 🔲 Scaffold | Auth, user management, RBAC, JWT (RS256) |
| auth-rbac-service-frontend | 3161 | 🔲 Scaffold | Auth/RBAC admin UI |
| ecommerce-backoffice | 3162 | 🔲 Scaffold | Login portal & application launcher |
| adapter-mailgun | 3171 | ✅ Done | Mailgun email adapter (dumb pipe) |
| adapter-braze | 3172 | 🔲 Scaffold | Braze multi-channel adapter |
| adapter-whatsapp | 3173 | ✅ Done | WhatsApp Meta Cloud API adapter |
| adapter-aws-ses | 3174 | 🔲 Scaffold | AWS SES email adapter |
| ~~notification-gateway~~ | ~~3150~~ | ⛔ Deprecated | BFF/Gateway — responsibilities redistributed |

---

## High-Level Architecture

```
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                           SOURCE SYSTEMS                                    │
  │   OMS │ Magento 2 │ Mirakl │ Chat Commerce │ Legacy ERP │ Manual           │
  └───────────────────────┬─────────────────────────────────────────────────────┘
                          │  AMQP / REST Webhook / SMTP
                          ▼
  ┌──────────────────────────────────┐
  │     event-ingestion-service      │  :3151
  │  Normalize · Validate · Priority │
  └─────────────────┬────────────────┘
                    │ xch.events.normalized
          ┌─────────┴──────────┐
          │                    │
          ▼                    ▼
   [q.engine.events     [q.engine.events
    .critical (4c)]      .normal   (2c)]
          │                    │
          └─────────┬──────────┘
                    ▼
  ┌──────────────────────────────────┐      ┌──────────────────┐
  │   notification-engine-service    │─────▶│  template-service │  :3153
  │  Rules · Recipients · Suppress   │      │  Render (HTTP)    │
  │  Render · Dispatch               │◀─────│                  │
  └─────────────────┬────────────────┘      └──────────────────┘
                    │ xch.notifications.deliver
        ┌───────────┴─────────────────────────────────┐
        │                                             │
   [q.deliver.*.critical]                    [q.deliver.*.normal]
   (email/sms/wa/push)                       (email/sms/wa/push)
        │                                             │
        └───────────────────┬─────────────────────────┘
                            ▼
  ┌──────────────────────────────────┐
  │    channel-router-service        │  :3154
  │  Retry · Circuit Breaker         │
  │  Rate Limit · Fallback           │
  └──────┬───────┬───────┬───────────┘
         │ HTTP  │ HTTP  │ HTTP
         ▼       ▼       ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ Mailgun  │ │WhatsApp  │ │ Braze /  │
   │ :3171    │ │ :3173    │ │ SES ...  │
   └────┬─────┘ └────┬─────┘ └────┬─────┘
        │ API        │ API        │ API
        ▼            ▼            ▼
   Mailgun      Meta Cloud    Braze / SES
   (Email)      (WhatsApp)    (Multi-channel)

  Webhooks: Provider → Adapter → xch.notifications.status → Audit + Engine
```

---

## Event Flow (End-to-End)

```
  Source System
       │
       │ 1. Publish event (AMQP / Webhook / SMTP)
       ▼
  event-ingestion-service
       │ 2. Normalize payload using runtime field mappings
       │ 3. Assign priority (normal / critical)
       │ 4. Publish → xch.events.normalized
       ▼
  notification-engine-service
       │ 5. Evaluate notification rules
       │ 6. Resolve recipients
       │ 7. Apply suppressions / overrides
       │ 8. Request render → template-service (HTTP)
       │ 9. Publish dispatch message → xch.notifications.deliver
       ▼
  channel-router-service
       │ 10. Consume from tiered delivery queues
       │ 11. Resolve adapter URL from provider_configs table
       │ 12. POST /send → adapter service (HTTP)
       ▼
  provider-adapter-service
       │ 13. Translate to provider API format
       │ 14. Call external provider (Mailgun / Meta / Braze / SES)
       │ 15. Return SendResult to channel router
       ▼
  External Provider
       │ 16. Deliver to end customer
       │ 17. Webhook callback → adapter service
       ▼
  adapter-service (webhook)
       │ 18. Verify signature
       │ 19. Normalize status event
       │ 20. Publish → xch.notifications.status (adapter.webhook.{providerId})
       ▼
  audit-service + notification-engine-service
       │ 21. Record delivery receipt
       │ 22. Update notification lifecycle state
```

---

## RabbitMQ Topology

**Vhost:** `vhnotificationapi`

```
EXCHANGES (6)
  xch.events.incoming         topic    Raw events from source systems
  xch.events.normalized       topic    Priority-tagged canonical events
  xch.notifications.deliver   topic    Rendered messages to channel router
  xch.notifications.status    topic    Lifecycle status + adapter webhooks
  xch.config.events           topic    Config cache invalidation
  xch.notifications.dlq       fanout   Dead-letter exchange

QUEUES (23)
  Event Ingestion (4):    q.events.amqp, q.events.webhook, q.events.email-ingest,
                          q.config.mapping-cache
  Notification Engine (5):q.engine.events.critical (4c), q.engine.events.normal (2c),
                          q.config.rule-cache, q.config.override-cache,
                          q.engine.status.inbound
  Channel Router (8):     q.deliver.{email|sms|whatsapp|push}.{critical|normal}
  Audit Service (5):      q.audit.template, q.status.updates, audit.events,
                          audit.deliver, audit.dlq
  DLQ (1):                q.dlq

KEY ROUTING KEYS
  source.{sourceId}.{eventType}            → xch.events.incoming
  event.{critical|normal}.{eventType}      → xch.events.normalized
  notification.deliver.{priority}.{channel}→ xch.notifications.deliver
  notification.status.{state}              → xch.notifications.status
  adapter.webhook.{providerId}             → xch.notifications.status
  config.{mapping|rule|override}.changed   → xch.config.events
```

**Priority Tiers:**
- Critical queues: 2–4x consumer allocation
- Retry backoff: 1s→2s→4s (ingestion), 1s→3s→9s (engine), 5s→30s→2m→10m→30m (router/email)

---

## Provider Adapter Architecture

```
  channel-router-service  (zero provider-specific code)
         │
         │  POST /send      GET /health      GET /capabilities
         ▼
  ┌──────────────────────────────────────────────────┐
  │           provider-adapters/ (NestJS monorepo)   │
  │                                                  │
  │  adapter-mailgun  :3171   Email (Mailgun API)    │
  │  adapter-braze    :3172   Email/SMS/WhatsApp/Push│
  │  adapter-whatsapp :3173   WhatsApp (Meta Cloud)  │
  │  adapter-aws-ses  :3174   Email (AWS SES)        │
  │                                                  │
  │  libs/common/  — shared DTOs, base classes,      │
  │                  error codes, interceptors        │
  └──────────────────────────────────────────────────┘
         │
         │  Publish adapter.webhook.{providerId}
         ▼
  xch.notifications.status
```

Each adapter is a **dumb pipe** — it receives pre-rendered content, translates to the provider's format, and returns. No rendering, no business logic, no database.

---

## Database Architecture

**Pattern:** Schema-per-service, single PostgreSQL cluster.

| Service | Schema | Key Tables |
|---|---|---|
| event-ingestion-service | `event_ingestion_service` | `source_mappings`, `events` |
| notification-engine-service | `notification_engine_service` | `notification_rules`, `notifications`, `recipients` |
| template-service | `template_service` | `templates`, `template_versions` |
| channel-router-service | `channel_router_service` | `provider_configs`, `delivery_attempts` |
| audit-service | `audit_service` | `notification_events`, `delivery_receipts` |
| bulk-upload-service | `bulk_upload_service` | `upload_jobs`, `upload_rows` |
| admin-service | `admin_service` | `mappings`, `rules`, `channel_configs` |
| auth-rbac-service-backend | `auth_rbac_service` | `applications`, `users`, `roles`, `permissions` |
| provider-adapters | _(none)_ | Stateless — no database |

---

## Auth & Security

```
  ecommerce-backoffice :3162  (login portal)
         │
         │  Login / token exchange
         ▼
  auth-rbac-service-backend :3160
         │  RS256 JWT issuance
         │  Platform tokens + app-scoped tokens
         ▼
  Each backend service validates JWT independently
  using auth-rbac-service-backend public key
```

- `notification-gateway` is **deprecated** — no longer a centralized auth proxy
- Each service validates RS256 JWT directly
- `notification-admin-ui` connects directly to `admin-service` (no gateway)

---

## Resilience Patterns (channel-router-service)

| Pattern | Detail |
|---|---|
| **Retry + Exponential Backoff** | Per-channel policy with jitter; email up to 5 retries over ~42 min |
| **Circuit Breaker** | Per-adapter; opens after N consecutive failures, probes via `GET /health` |
| **Rate Limiting** | Per-channel, per-provider |
| **Fallback Channel** | Configurable fallback (e.g., email → SMS) on exhausted retries |
| **Dead Letter Queue** | All failed messages → `xch.notifications.dlq` → `q.dlq` + `audit.dlq` |
| **Fire-and-Forget Audit** | All audit writes via RabbitMQ — never blocks delivery path |

---

## Monitoring

- Every service exposes `GET /health` (liveness + readiness) and `GET /metrics` (Prometheus)
- Structured JSON logging via **Pino** with service metadata, timing, severity levels
- DLQ depth tracked per service in `/health` and Prometheus metrics
- `LoggingInterceptor` on all HTTP handlers: `warn` for 4xx, `error` for 5xx

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | NestJS (TypeScript) |
| Frontend | Next.js |
| Message Broker | RabbitMQ — AMQP, topic exchanges, DLQ |
| Database | PostgreSQL (schema-per-service) |
| ORM | TypeORM |
| Containerization | Docker / Docker Compose |
| Logging | Pino (structured JSON) |
| Metrics | Prometheus |
| Template Engine | Handlebars |
| Providers | Mailgun, Meta Cloud API (WhatsApp), Braze, AWS SES |

---

*Last updated: 2026-03-02*
