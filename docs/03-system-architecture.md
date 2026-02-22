# 03 — System Architecture

**Notification API — Architecture & Diagrams**

| | |
|---|---|
| **Version:** | 1.0 |
| **Date:** | 2026-02-19 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [High-Level Architecture Diagram](#2-high-level-architecture-diagram)
3. [Layer Architecture](#3-layer-architecture)
4. [Event Flow Architecture](#4-event-flow-architecture)
5. [RabbitMQ Message Architecture](#5-rabbitmq-message-architecture)
6. [Database Architecture](#6-database-architecture)
7. [Notification Lifecycle Flowchart](#7-notification-lifecycle-flowchart)
8. [Authentication & Security Architecture](#8-authentication--security-architecture)
9. [Scalability & Resilience Patterns](#9-scalability--resilience-patterns)
10. [Deployment Architecture](#10-deployment-architecture)
11. [Monitoring & Observability](#11-monitoring--observability)
12. [Integration Patterns](#12-integration-patterns)
13. [Capacity Planning](#13-capacity-planning)

---

## 1. Architecture Overview

The Notification API platform is built on an **event-driven microservices architecture** that decouples notification logic from source systems and centralizes it into a purpose-built set of services. The architecture is designed for resilience, horizontal scalability, and operational flexibility — enabling the business to evolve its notification strategy without engineering effort.

### 1.1 Architectural Principles

| Principle | Description |
|---|---|
| **Loose Coupling** | Services communicate through well-defined APIs and asynchronous messages. No service directly accesses another service's database or internal state. |
| **Single Responsibility** | Each microservice owns one bounded context: event ingestion, orchestration, template rendering, channel routing, administration, or auditing. |
| **Event-Driven** | Business events flow through RabbitMQ, decoupling producers from consumers and enabling asynchronous, resilient processing with guaranteed delivery. |
| **Database-per-Service** | Each service owns its own PostgreSQL database. Data isolation ensures independent deployability and eliminates cross-service schema coupling. |
| **API-First Design** | All service interfaces are designed API-first with clear contracts. The BFF/Gateway exposes a unified REST API for the frontend, abstracting internal service topology. |
| **Resilience by Default** | Circuit breakers, retry policies, dead-letter queues, and health checks are built into every service. The system degrades gracefully under failure. |

> **Info:** **Key Architectural Decision:** RabbitMQ was chosen over Kafka because the notification domain requires reliable per-message delivery, flexible routing via exchanges, and dead-letter queue support for retry workflows — all strengths of RabbitMQ's AMQP model. The system does not require Kafka's log-based stream processing or replay capabilities.

---

## 2. High-Level Architecture Diagram

The following diagram illustrates the complete system topology, showing how source systems, microservices, message broker, databases, and external providers interconnect.

```
+---------------------------------------------------------------------+
|           Notification API — High-Level Architecture                 |
+---------------------------------------------------------------------+

 +-----------------+       +----------------+       +--------------+       +------------------+       +--------------+
 | Source Systems  |       | Event          |       |              |       | Notification     |       | Channel      |
 |                 | ----> | Ingestion      | ----> |  RabbitMQ    | ----> | Engine           | ----> | Router       |
 | - Source A      |       | Normalize &    |       |  Exchanges   |       | Rules &          |       | Route &      |
 |   (AMQP)       |       | Validate       |       |  & Queues    |       | Orchestration    |       | Deliver      |
 | - Source B      |       | REST + RabbitMQ|       |  Message     |       | Recipient        |       | Retry &      |
 |   (Webhook)    |       |                |       |  Broker      |       | Resolution       |       | Circuit      |
 | - Source N      |       | [event_        |       |              |       |                  |       | Breaker      |
 |   (...)         |       |  ingestion_    |       |              |       | [notification_   |       |              |
 | - Manual        |       |  service]      |       |              |       |  engine_         |       | [channel_    |
 |   (Admin UI)    |       +----------------+       +--------------+       |  service]        |       |  router_     |
 +-----------------+                                      ^                +------------------+       |  service]    |
                                                          |                                           +--------------+
        |                                                 |
        | (SMTP)       +----------------+                 |
        +- - - - - - > | Email Ingest   | - - - - - - - - +
                       | SMTP :2525     |  (publishes to xch.events.incoming)
                       | REST :3157     |
                       | [email_        |
                       |  ingest_       |
                       |  service]      |
                       +----------------+

                       +----------------+
                       | Bulk Upload    |-----(HTTP POST)----> Event Ingestion
                       | XLSX Parse     |                      POST /webhooks/events
                       | Port 3158      |
                       | [bulk_         |
                       |  upload_       |
                       |  service]      |
                       +----------------+
                                                          |                        ^                  +--------------+
                                                          |                        |                        |
                                                          |                 +-------------+                 |
                                                          |                 | Template    |           +-----+------+
                                                          |                 | Service     |           |  External  |
                                                          |                 | Render &    |           |  Providers |
                                                          |                 | Manage      |           | - SendGrid |
                                                          |                 +-------------+           | - Mailgun  |
                                                          |                                           | - Braze    |
                                                    Status Events                                     | - Twilio   |
                                                    (dashed/async)                                    | - FCM Push |
                                                                                                     +------------+
                                                          |
                                                          v
 +-----------------+       +----------------+       +----------------+
 | Admin UI        | ----> | Gateway (BFF)  | ----> | Admin Service  |
 | (Next.js)       |       | Auth, Routing  |       | Rules, Config  |
 | Port 3159       |       | Port 3150      |       | Port 3155      |
 +-----------------+       +----------------+       +----------------+
                                                                           +----------------+
                                                                           | Audit Service  |
                                                                           | Tracking       |
                                                                           | Port 3156      |
                                                                           +----------------+

 Legend:
  [Blue]   Core Services (NestJS)          [Green]  External Providers
  [Purple] Message Broker / Sources        [Teal]   Databases (PostgreSQL)
  [Orange] Routing / Delivery

  ------>  Synchronous (REST)
  - - ->   Asynchronous (RabbitMQ)
```

*Figure 2.1 — High-Level System Architecture showing all microservices, external integrations, and communication patterns.*

---

## 3. Layer Architecture

The system is organized into five distinct layers, each with a specific responsibility. This layered approach enforces separation of concerns and allows each layer to scale, evolve, and be maintained independently.

```
+========================================================================================+
|  EDGE LAYER                                                                            |
|  +---------------------+  +----------------------------+  +---------------------+      |
|  | Admin UI             |  | Notification Gateway       |  | External Webhooks   |      |
|  | (Next.js :3159)      |  | (BFF :3150)                |  |                     |      |
|  +---------------------+  +----------------------------+  +---------------------+      |
+========================================================================================+
|  COMPUTE LAYER                                                                         |
|  +---------------+ +------------------+ +---------------+ +---------------+             |
|  | Event         | | Notification     | | Template      | | Channel       |             |
|  | Ingestion     | | Engine           | | Service       | | Router        |             |
|  | :3151         | | :3152            | | :3153         | | :3154         |             |
|  +---------------+ +------------------+ +---------------+ +---------------+             |
|  +---------------+ +---------------+ +--------------------+ +---------------+          |
|  | Admin Service | | Audit Service | | Email Ingest       | | Bulk Upload   |          |
|  | :3155         | | :3156         | | :3157/2525         | | :3158         |          |
|  +---------------+ +---------------+ +--------------------+ +---------------+          |
+========================================================================================+
|  MESSAGE LAYER                                                                         |
|  +--------------------------------------------------------------------------------+   |
|  | RabbitMQ — Exchanges: xch.events.incoming, xch.events.normalized,              |   |
|  | xch.notifications.render, xch.notifications.deliver,                           |   |
|  | xch.notifications.status, xch.notifications.dlq                                |   |
|  +--------------------------------------------------------------------------------+   |
+========================================================================================+
|  DATA LAYER                                                                            |
|  +---------------------+ +---------------------+ +-----------------+ +-----------------+  |
|  | event_ingestion_    | | notification_       | | template_       | | channel_router_ |  |
|  | service             | | engine_service      | | service         | | service         |  |
|  +---------------------+ +---------------------+ +-----------------+ +-----------------+  |
|  +---------------------+ +-----------------+ +-----------------+ +-------------------+    |
|  | notification_       | | admin_          | | audit_          | | email_ingest_     |    |
|  | gateway             | | service         | | service         | | service           |    |
|  +---------------------+ +-----------------+ +-----------------+ +-------------------+    |
|  +------------------+                                                                     |
|  | bulk_upload_     |                                                                     |
|  | service          |                                                                     |
|  +------------------+                                                                     |
+========================================================================================+
|  EXTERNAL INTEGRATION LAYER                                                            |
|  SendGrid · Mailgun · Braze (Email)   Twilio (SMS/WA)   Firebase (Push)   Sources (AMQP/HTTP) |
+========================================================================================+
```

*Figure 3.1 — Layered architecture showing Edge, Compute, Message, Data, and External Integration layers.*

| Layer | Responsibility | Components | Scalability |
|---|---|---|---|
| **[Edge]** | Client-facing API surface. Authentication, authorization, rate limiting, request validation, and routing. See [15 — Notification Admin UI](15-notification-admin-ui.md) and [13 — Notification Gateway](13-notification-gateway.md) for deep-dives. | notification-admin-ui, notification-gateway | Horizontal — stateless, load-balanced |
| **[Compute]** | Core business logic. Event normalization, rule evaluation, template rendering, channel routing, administration, and audit recording. See [16 — Audit Service](16-audit-service.md) for the audit deep-dive. | event-ingestion, notification-engine, template-service, channel-router, admin-service, audit-service, email-ingest-service, bulk-upload-service | Horizontal — independent per service |
| **[Message]** | Asynchronous inter-service communication. Event fan-out, delivery queue management, dead-letter handling. | RabbitMQ (6 exchanges, multiple queues) | Clustered — mirrored queues |
| **[Data]** | Persistent storage. Each service owns its database with full schema control. | 9 PostgreSQL schemas | Vertical + read replicas |
| **[External]** | Third-party provider integrations and source system connections. | SendGrid, Mailgun, Braze, Twilio, FCM, registered source systems | Provider-managed |

---

## 4. Event Flow Architecture

The notification lifecycle follows a sequential event-driven flow from source system event to customer delivery. Each step is asynchronous and decoupled, enabling independent scaling and fault isolation.

```
  (1) Source System         (2) RabbitMQ / Webhook       (3) Event Ingestion
      Emits Event               Received                     Normalizes
  +-------------------+    +----------------------+    +----------------------+
  | e.g. order.shipped| -> | xch.events.incoming  | -> | Mapping lookup,      |
  | from any source   |    | exchange              |    | normalize via        |
  +-------------------+    +----------------------+    | mapping engine       |
                                                       +----------------------+
                                                                  |
                                                                  v
  (6) Resolve              (5) Engine Matches           (4) Publish to Normalized
      Recipients               Rules                       Exchange
  +-------------------+    +----------------------+    +-----------------------+
  | Customer, groups, | <- | Event type ->        | <- | xch.events.normalized |
  | preferences       |    | notification rules   |    | topic                 |
  +-------------------+    +----------------------+    +-----------------------+
          |
          v
  (7) Template Service     (8) Channel Router           (9) Provider Delivers
      Renders                  Dispatches                   to Customer
  +-------------------+    +----------------------+    +----------------------+
  | Handlebars,       | -> | Route to provider    | -> | SendGrid, Twilio,    |
  | per-channel       |    | per channel          |    | FCM                  |
  +-------------------+    +----------------------+    +----------------------+
                                                                  |
                                                                  v
                                                       (10) Audit Service Records
                                                       +----------------------+
                                                       | Status, receipt,     |
                                                       | analytics            |
                                                       +----------------------+

  Step Summary:
  1. Source system publishes business event
  2. Event arrives via RabbitMQ or webhook
  3. Ingestion service looks up runtime mapping and normalizes via mapping engine
  4. Normalized event published to internal exchange
  5. Engine evaluates notification rules
  6. Recipients resolved from rules and preferences
  7. Template service renders per-channel message variants
  8. Channel router dispatches to delivery provider
  9. Provider delivers to customer
  10. Audit service records delivery status, receipt, and analytics data

  All steps are asynchronous via RabbitMQ except Template rendering (synchronous
  REST) and Provider delivery (synchronous HTTP).
```

*Figure 4.1 — End-to-end event flow from source system event emission through customer delivery and audit recording.*

---

## 5. RabbitMQ Message Architecture

RabbitMQ is the backbone of the asynchronous communication layer. The exchange and queue topology is designed for flexible routing, reliable delivery, and graceful failure handling via dead-letter queues.

### 5.1 Exchange Topology

| Exchange | Type | Purpose | Routing Key Pattern |
|---|---|---|---|
| `xch.events.incoming` | Topic | Raw events from source systems | `source.{system}.{eventType}` |
| `xch.events.normalized` | Topic | Normalized canonical events with priority tier | `event.{priority}.{eventType}` |
| `xch.notifications.render` | Topic | Template render requests | `render.{channel}` |
| `xch.notifications.deliver` | Topic | Delivery requests per channel with priority tier | `notification.deliver.{priority}.{channel}` |
| `xch.notifications.status` | Topic | Delivery status updates | `status.{notificationId}` |
| `xch.notifications.dlq` | Fanout | Dead-letter queue for failed messages | N/A (fanout) |

### 5.2 Queue Configuration

| Queue | Bound Exchange | Routing Key | Consumer Service | DLQ |
|---|---|---|---|---|
| `q.events.amqp` | xch.events.incoming | `source.*.#` | event-ingestion-service | Yes |
| `q.events.webhook` | xch.events.incoming | `source.webhook.#` | event-ingestion-service | Yes |
| `q.events.email-ingest` | xch.events.incoming | `source.email-ingest.#` | event-ingestion-service | Yes |
| `q.engine.events.critical` | xch.events.normalized | `event.critical.#` | notification-engine-service (4 consumers) | Yes |
| `q.engine.events.normal` | xch.events.normalized | `event.normal.#` | notification-engine-service (2 consumers) | Yes |
| `q.deliver.email.critical` | xch.notifications.deliver | `notification.deliver.critical.email` | channel-router-service (3 consumers) | Yes |
| `q.deliver.email.normal` | xch.notifications.deliver | `notification.deliver.normal.email` | channel-router-service (2 consumers) | Yes |
| `q.deliver.sms.critical` | xch.notifications.deliver | `notification.deliver.critical.sms` | channel-router-service (2 consumers) | Yes |
| `q.deliver.sms.normal` | xch.notifications.deliver | `notification.deliver.normal.sms` | channel-router-service (1 consumer) | Yes |
| `q.deliver.whatsapp.critical` | xch.notifications.deliver | `notification.deliver.critical.whatsapp` | channel-router-service (2 consumers) | Yes |
| `q.deliver.whatsapp.normal` | xch.notifications.deliver | `notification.deliver.normal.whatsapp` | channel-router-service (1 consumer) | Yes |
| `q.deliver.push.critical` | xch.notifications.deliver | `notification.deliver.critical.push` | channel-router-service (2 consumers) | Yes |
| `q.deliver.push.normal` | xch.notifications.deliver | `notification.deliver.normal.push` | channel-router-service (1 consumer) | Yes |
| `q.status.updates` | xch.notifications.status | `status.#` | audit-service | Yes |
| `q.dlq` | xch.notifications.dlq | N/A | Manual review / reprocessing | No |

> **Note:** **Dead-Letter Queue Strategy:** All queues are configured with a dead-letter exchange (`xch.notifications.dlq`). Messages are dead-lettered after 3 failed processing attempts. The DLQ is monitored and messages can be manually reprocessed through the Admin UI or automatically retried with exponential backoff via a scheduled reprocessing job.

---

## 6. Database Architecture

The platform follows the **database-per-service** pattern. Each microservice owns and manages its own PostgreSQL database, ensuring data isolation, independent schema evolution, and no cross-service data coupling.

| Schema | Owner Service | Key Tables | Est. Size (Year 1) |
|---|---|---|---|
| `notification_gateway` | notification-gateway | api_keys, rate_limits, sessions | ~1 GB |
| `event_ingestion_service` | event-ingestion-service | events, event_sources, event_mappings | ~50 GB |
| `notification_engine_service` | notification-engine-service | notification_rules, notifications, notification_recipients, notification_status_log, recipient_groups, recipient_preferences | ~80 GB |
| `template_service` | template-service | templates, template_versions, template_variables, template_channels | ~500 MB |
| `channel_router_service` | channel-router-service | channels, channel_configs, delivery_attempts, provider_configs | ~60 GB |
| `admin_service` | admin-service | admin_users, admin_roles, admin_permissions, system_configs | ~500 MB |
| `audit_service` | audit-service | audit_events, delivery_receipts, notification_analytics | ~120 GB |
| `email_ingest_service` | email-ingest-service | email_parsing_rules, processed_emails, email_sources | ~20 GB |
| `bulk_upload_service` | bulk-upload-service | uploads, upload_rows | ~5 GB |

### 6.1 Core Entity Relationships (notification_engine_service)

```
  notification_engine_service — Entity Relationships

  +-------------------------+        1:N        +---------------------------+        1:N        +---------------------------+
  | notification_rules      | ----------------> | notifications             | ----------------> | notification_recipients   |
  |-------------------------|                   |---------------------------|                   |---------------------------|
  | PK  rule_id UUID        |                   | PK  notification_id UUID  |                   | PK  recipient_id UUID     |
  |     name VARCHAR(255)   |                   | FK  rule_id UUID          |                   | FK  notification_id UUID  |
  |     event_type          |                   | FK  event_id UUID         |                   |     customer_id VARCHAR   |
  |       VARCHAR(100)      |                   |     status VARCHAR(20)    |                   |     contact_value VARCHAR |
  |     conditions JSONB    |                   |     channel VARCHAR(20)   |                   |     delivery_status       |
  |     actions JSONB       |                   |     template_id UUID      |                   |       VARCHAR             |
  |     is_active BOOLEAN   |                   |     created_at TIMESTAMP  |                   |     delivered_at          |
  +-------------------------+                   +---------------------------+                   |       TIMESTAMP           |
                                                            |                                   +---------------------------+
                                                            | 1:N
                                                            v
                                                +---------------------------+
                                                | notification_status_log   |       +---------------------------+
                                                |---------------------------|       | recipient_groups          |
                                                | PK  log_id UUID          |       |---------------------------|
                                                | FK  notification_id UUID |       | PK  group_id UUID         |
                                                |     status VARCHAR(20)   |       |     name VARCHAR(255)     |
                                                |     timestamp TIMESTAMP  |       |     criteria JSONB        |
                                                +---------------------------+       |     is_active BOOLEAN     |
                                                                                    +---------------------------+
```

*Figure 6.1 — Core entity relationships in the notification_engine_service showing rules, notifications, recipients, and status tracking.*

> **Info:** **Data Isolation:** Services never query another service's database directly. If the Admin Service needs notification delivery data, it queries the Audit Service via REST API. This ensures each service can independently evolve its schema, apply migrations, and optimize queries without affecting others.

> **Deep-Dive Available:** For the complete notification_engine_service database design — including full column specifications, FILLFACTOR configuration, VACUUM tuning, index strategies (partial suppression index, covering indexes), growth estimates, and data retention policies — see [08 — Notification Engine Service Deep-Dive §12](08-notification-engine-service.md#12-database-design).

> **Deep-Dive Available:** For the complete template_service database design — including 4 tables (templates, template_versions, template_channels, template_variables), immutable versioning model, compiled template caching, rendering pipeline, and growth estimates — see [10 — Template Service Deep-Dive §10](10-template-service.md#10-database-design).

> **Deep-Dive Available:** For the complete channel_router_service design — including provider strategy pattern with multi-provider support (SendGrid, Mailgun, Braze, Twilio, FCM), dumb-pipe architecture, delivery pipeline, circuit breaker state machine, retry strategy, fallback channels, webhook receivers, Braze profile sync, asynchronous audit logging, database design with 4 tables, and sequence diagrams — see [11 — Channel Router Service Deep-Dive](11-channel-router-service.md).

> **Deep-Dive Available:** For the complete notification_gateway design — including the 7-step request processing pipeline, JWT and API key authentication, RBAC, sliding window rate limiting, service proxy layer with per-service circuit breakers, response envelope transformation, database design with 4 tables (api_keys, sessions, rate_limits, token_blacklist), sequence diagrams, and configuration — see [13 — Notification Gateway Deep-Dive](13-notification-gateway.md).

> **Deep-Dive Available:** For the complete admin_service design — including user management lifecycle, RBAC permission matrix (4 roles with granular resource-action permissions), cross-service rule validation, event mapping management with RabbitMQ cache invalidation, template delegation, channel configuration with credential masking, dashboard data aggregation with graceful degradation, config invalidation topology (xch.config.events exchange), SAML IdP management, database design with 7 tables (admin_users, admin_roles, admin_permissions, system_configs, saml_identity_providers, user_identity_links, saml_sessions), sequence diagrams, and configuration — see [14 — Admin Service Deep-Dive](14-admin-service.md).

---

## 7. Notification Lifecycle Flowchart

Each notification passes through a well-defined set of states from creation to final delivery (or failure). The state machine ensures clear tracking and enables retry logic at each transition point.

```
  Notification State Machine

  Event       Rules        Template      Dispatched
  received    matched      rendered

  +--------+  +----------+  +----------+  +----------+  +------+
  |PENDING | ->|PROCESSING| ->|RENDERING | ->|DELIVERING| ->| SENT |
  +--------+  +----------+  +----------+  +----------+  +------+
                   |                                         |
                   | Suppression                    +--------+--------+
                   | check                          |                 |
                   v                                v                 v
              +------------+                  +-----------+     +--------+
              | SUPPRESSED |                  | DELIVERED |     | FAILED |
              +------------+                  +-----------+     +--------+
                                                                    |
                                                                    | Retry (max 3)
                                                                    +--- - - - -> DELIVERING
```

*Figure 7.1 — Notification state machine showing lifecycle from PENDING through DELIVERED or FAILED, with retry loop.*

| State | Description | Trigger |
|---|---|---|
| **[PENDING]** | Notification created by the engine after rule matching. Awaiting processing. | Normalized event consumed, rule matched |
| **[PROCESSING]** | Engine is resolving recipients and preparing the notification. | Processing begins |
| **[SUPPRESSED]** | Notification suppressed by rule-level dedup, max count, or cooldown policy. Terminal state — not delivered. | Suppression check triggered during processing |
| **[RENDERING]** | Template Service is rendering the message for each target channel. | Recipients resolved, template requested |
| **[DELIVERING]** | Channel Router has received the rendered message and is dispatching to provider. | Template rendered, delivery queued |
| **[SENT]** | Provider has accepted the message. Awaiting delivery confirmation. | Provider returns 2xx response |
| **[DELIVERED]** | Provider confirmed delivery to recipient. Terminal success state. | Delivery receipt / webhook callback |
| **[FAILED]** | Delivery failed after all retry attempts exhausted. Terminal failure state. | Max retries exceeded or permanent error |

---

## 8. Authentication & Security Architecture

Security is implemented at multiple layers: API gateway authentication, role-based access control, service-to-service trust, data encryption, and PII protection.

### 8.1 Authentication Layers

| Layer | Mechanism | Description |
|---|---|---|
| **Admin UI → Gateway (Local Auth)** | JWT (Bearer Token) | Users authenticate via email/password login. The platform issues JWT tokens (RS256) with role and permission claims, validated on every request by the gateway. |
| **Admin UI → Gateway (SAML 2.0 SSO)** | SAML 2.0 + JWT | Enterprise users authenticate via SP-initiated SAML SSO with Azure AD. After assertion validation, the platform issues its own JWT tokens (identical to local auth). See [04 — Auth & Identity](04-authentication-identity.md). |
| **External Webhooks → Ingestion** | API Key + HMAC Signature | Source systems authenticate via API keys. Webhook payloads are signed with HMAC-SHA256 to ensure integrity. |
| **Service-to-Service** | Internal Network Trust | Internal services communicate within a Docker network. For production, mTLS can be added for zero-trust service mesh. |
| **Gateway → Services** | Internal API Key | Gateway includes an internal API key header when forwarding requests to backend services for verification. |

### 8.2 Role-Based Access Control (RBAC)

| Role | Permissions |
|---|---|
| **[Super Admin]** | Full access: user management, system configuration, all CRUD operations, audit logs |
| **[Admin]** | Manage rules, templates, channels, and recipient groups. View audit logs. Cannot manage users or system config. |
| **[Operator]** | View and edit templates and rules. View notification logs. Cannot modify channel configs or manage users. |
| **[Viewer]** | Read-only access to dashboards, notification logs, and delivery analytics. |

### 8.3 Data Protection

| Control | Scope | Implementation |
|---|---|---|
| **Encryption in Transit** | All network communication | TLS 1.2+ for external connections. Internal Docker network encryption optional. |
| **Encryption at Rest** | PostgreSQL databases | Database-level encryption via PostgreSQL TDE or volume-level encryption. |
| **PII Masking** | Audit logs, error logs | Email addresses, phone numbers, and customer names are masked in log output. |
| **Data Retention** | All databases | Configurable retention policies per table. Event data: 90 days. Audit data: 1 year. Templates: indefinite. |

---

## 9. Scalability & Resilience Patterns

| Pattern | Where Applied | Description |
|---|---|---|
| **Horizontal Scaling** | All stateless services | Services can be scaled out by running additional container instances behind a load balancer. No shared state between instances. |
| **Competing Consumers** | RabbitMQ queues | Multiple instances of a service consume from the same queue. RabbitMQ distributes messages in round-robin, enabling parallel processing. |
| **Circuit Breaker** | Channel Router → Providers | If a provider (SendGrid, Twilio) fails repeatedly, the circuit opens to prevent cascading failures. Requests are routed to fallback channels or queued for retry. |
| **Exponential Backoff** | Channel Router retries | Failed deliveries are retried with increasing delays: 1s, 5s, 30s, 2m, 10m. Prevents provider overload during outages. |
| **Dead-Letter Queue** | All RabbitMQ queues | Messages that cannot be processed after max attempts are routed to the DLQ for manual inspection and reprocessing. |
| **Health Checks** | All services | Each service exposes `/health` and `/ready` endpoints for liveness and readiness probes. |
| **Rate Limiting** | Gateway (inbound) | Configurable rate limits per API key / user to prevent abuse and protect backend services from traffic spikes. |
| **Idempotency** | Event Ingestion | Duplicate events are detected via `eventId` deduplication, ensuring each event is processed exactly once. |
| **Priority-Based Processing** | Event Ingestion → Engine → Channel Router | Events are classified as `normal` or `critical` at ingestion time (per mapping configuration). Separate RabbitMQ queues per priority tier ensure critical notifications (e.g., delivery delays, payment failures) are processed before normal notifications (e.g., promotions) during backpressure. More consumers are allocated to critical-tier queues. |

> **Success:** **Scalability Benefits:** During peak events like flash sales, only the Channel Router and Notification Engine need to scale out. The Template Service, Admin Service, and Audit Service can remain at baseline capacity — optimizing infrastructure costs while handling traffic spikes reliably.

---

## 10. Deployment Architecture

All services are containerized with Docker and orchestrated locally via Docker Compose. Each service has its own Dockerfile and is independently deployable.

| Container | Image | Port | Depends On |
|---|---|---|---|
| notification-admin-ui | notification-admin-ui:latest | 3159 | notification-gateway |
| notification-gateway | notification-gateway:latest | 3150 | rabbitmq, all backend services |
| event-ingestion-service | event-ingestion:latest | 3151 | rabbitmq, postgresql |
| notification-engine-service | notification-engine:latest | 3152 | rabbitmq, postgresql, template-service |
| template-service | template-service:latest | 3153 | postgresql |
| channel-router-service | channel-router:latest | 3154 | rabbitmq, postgresql |
| admin-service | admin-service:latest | 3155 | postgresql |
| audit-service | audit-service:latest | 3156 | rabbitmq, postgresql |
| email-ingest-service | email-ingest:latest | 3157 / 2525 | rabbitmq, postgresql |
| bulk-upload-service | bulk-upload:latest | 3158 | postgresql, event-ingestion-service |
| rabbitmq | rabbitmq:3-management | 5672 / 15672 | — |
| postgresql | postgres:16-alpine | 5432 | — |

> **Note:** **Local Development:** A single `docker-compose.yml` file orchestrates all 11 containers with proper dependency ordering, shared networking, and volume mounts for persistent database storage. The RabbitMQ management UI is available at `http://localhost:15672` for queue monitoring during development.

---

## 11. Monitoring & Observability

| Aspect | Strategy | Tools |
|---|---|---|
| **Structured Logging** | All services emit JSON-formatted logs with correlation IDs, service name, timestamp, and log level. | NestJS Logger, Winston |
| **Health Checks** | Each service exposes `/health` (liveness) and `/ready` (readiness) endpoints checking database and RabbitMQ connectivity. | NestJS Terminus |
| **Delivery Metrics** | Track notification throughput, delivery success/failure rates, average delivery latency, and channel utilization. | Audit Service dashboards |
| **Queue Monitoring** | Monitor queue depth, message rates, consumer counts, and DLQ size via RabbitMQ management plugin. | RabbitMQ Management UI |
| **Error Alerting** | Alert on DLQ message accumulation, circuit breaker state changes, service health failures, and delivery failure rate thresholds. | Custom alerts via Admin Service |
| **Correlation Tracing** | Every event carries a `correlationId` from ingestion through delivery, enabling end-to-end trace of a notification across all services. The `correlationId` and `cycle_id` are propagated to `delivery_attempts`, `audit_events`, and `delivery_receipts` tables for unified querying. | Custom middleware |
| **Unified Trace API** | The Audit Service exposes `GET /audit/trace/:notificationId` — a single endpoint that aggregates the complete notification lifecycle timeline from all services (ingestion, rule matching, rendering, delivery, provider confirmation). | Audit Service |
| **Provider Webhook Correlation** | Each successful delivery attempt stores the `provider_message_id` from SendGrid/Twilio/FCM. When provider webhooks arrive with delivery status updates, they are correlated back to the notification via this ID. | Channel Router |

---

## 12. Integration Patterns

Each source system integrates with the Notification API through the most appropriate pattern based on its capabilities and infrastructure.

| Source System | Integration Method | Event Types | Data Format |
|---|---|---|---|
| **Any Source (AMQP)** | Direct RabbitMQ publish to `xch.events.incoming` exchange | Any event type (defined by source mapping configuration) | JSON (source-specific schema, normalized by mapping engine) |
| **Any Source (Webhook)** | HTTP POST to `POST /webhooks/events` | Any event type (defined by source mapping configuration) | JSON (source-specific payload, normalized by mapping engine) |
| **Manual (Admin UI)** | REST API via Gateway: `POST /api/v1/notifications/send` | manual.notification (custom event type and payload) | JSON (admin-defined payload) |
| **Email Ingest** | SMTP email to Email Ingest Service (`:2525`) | Configurable via parsing rules (e.g., order.confirmed, inventory.updated) | Email (HTML/text body, parsed via regex extraction rules) |
| **Bulk Upload (Admin UI)** | XLSX file upload via Admin UI → Gateway → Bulk Upload Service → HTTP POST to Event Ingestion (`POST /webhooks/events`) | Any event type (defined per row via `eventType` column) | XLSX (column headers map to payload fields, parsed by `exceljs`). See [09 — Bulk Upload Service](09-bulk-upload-service.md) for the full async processing pipeline, result file generation, and fire-and-forget audit logging design. |

> **Info:** **Runtime Mapping Engine:** The Event Ingestion Service uses a runtime mapping engine to normalize events from any source system. Mapping configurations are stored in the database and define how each source's event format maps to the canonical event schema. Adding a new source system requires only creating a new mapping configuration — no code changes or redeployment needed.

> **Warning:** **Webhook Security:** All webhook endpoints require API key authentication and HMAC-SHA256 payload signing. Source systems must register their API key and signing secret through the Admin Service before sending events. Unsigned or improperly authenticated webhook requests are rejected with a `401 Unauthorized` response.

---

## 13. Capacity Planning

This section documents the transactional model, throughput targets, and provider rate limits that inform the platform's database growth estimates and infrastructure sizing.

### 13.1 Baseline Transactional Model

The database growth estimates in Section 6 and in [02 — Detailed Microservices §12](02-detailed-microservices.md#12-schema-overview) are derived from the following transactional assumptions:

| Parameter | Assumed Value | Notes |
|---|---|---|
| **Daily business events** | ~5,000-10,000 events/day | Across all registered source systems (orders, shipments, returns, payments, etc.) |
| **Events per business cycle** | ~3 events/cycle | e.g., order.created, order.shipped, order.delivered |
| **Notification multiplier** | ~1.5 notifications/event | One event may produce notifications across multiple channels (email + SMS) |
| **Average event payload size** | ~2-5 KB | Raw + normalized JSONB combined |
| **Average notification row size** | ~1-2 KB | Including rendered content, metadata, and dedup key values |
| **Status log entries per notification** | ~3-6 transitions | PENDING -> PROCESSING -> RENDERING -> DELIVERING -> SENT -> DELIVERED |

**Derived monthly volumes:**

| Metric | Estimated Value |
|---|---|
| Events ingested | ~150K-300K/month |
| Notifications created | ~225K-450K/month |
| Delivery attempts | ~250K-500K/month |
| Audit events | ~750K-1.5M/month |

### 13.2 Peak Burst Profile

During peak events (flash sales, promotional campaigns, end-of-day batch runs), the platform must handle burst traffic significantly above baseline:

| Scenario | Expected Peak | Duration | Scaling Response |
|---|---|---|---|
| **Flash sale** | 10x baseline (~1,500 events/min) | 1-4 hours | Scale Channel Router and Notification Engine horizontally |
| **Bulk upload** | Up to 5,000 events in rapid succession | 5-15 minutes | Rate-limited at 50 events/second by Bulk Upload Service |
| **End-of-day batch** | 3-5x baseline | 30-60 minutes | Normal priority queues absorb the load |
| **Holiday season** | 2-3x sustained baseline | Days to weeks | Pre-scale all compute-layer services |

> **Info:** **Scaling Asymmetry:** During peak events, only the Channel Router and Notification Engine need to scale out. The Template Service, Admin Service, and Audit Service can remain at baseline capacity — optimizing infrastructure costs while handling traffic spikes reliably.

### 13.3 Throughput Targets by Tier

| Tier | Component | Sustained Target | Burst Target | Scaling Lever |
|---|---|---|---|---|
| **Ingestion** | Event Ingestion Service | ~50 events/sec | ~200 events/sec | Add AMQP/webhook consumer instances |
| **Processing** | Notification Engine | ~75 notifications/sec | ~300 notifications/sec | Add engine instances (competing consumers on `q.engine.events.*`) |
| **Delivery** | Channel Router | Per-channel (see §13.4) | Per-channel (see §13.4) | Add per-channel consumer instances |
| **Audit** | Audit Service | ~200 events/sec | ~500 events/sec | Fire-and-forget writes; scale consumers on `q.status.updates` |

**Notification Engine throughput reference** (see [08 — Notification Engine §15](08-notification-engine-service.md#15-performance--scalability)):

- Single instance with 6 consumers (4 critical at prefetch=5 + 2 normal at prefetch=10) provides significant concurrent processing capacity
- Throughput roughly doubles with each additional instance (competing consumers on shared queues)
- The `>1M notifications/day` threshold (~12 notifications/sec sustained) is the point at which the dedicated `suppression_log` table should be considered

### 13.4 Provider Rate Limits (True Throughput Ceiling)

The platform's maximum delivery throughput is ultimately constrained by external provider API rate limits. The Channel Router's token bucket rate limiter ensures outbound request rates stay within these limits.

| Channel | Provider | Rate Limit | Effective Capacity | Notes |
|---|---|---|---|---|
| **Email** | SendGrid | 100 emails/sec (Pro plan) | ~360K emails/hour | Free tier limited to 100 emails/day; ensure production provisioning |
| **SMS** | Twilio | ~30 SMS/sec per number | ~108K SMS/hour | Varies by destination country; short codes support higher rates |
| **WhatsApp** | Twilio / Meta Business | 80 messages/sec | ~288K messages/hour | Subject to Meta's messaging tier and 24-hour window rules |
| **Push** | Firebase Cloud Messaging | 500 messages/sec per project | ~1.8M pushes/hour | Batch API supports up to 500 tokens per request |

> **Warning:** **Rate Limit Planning:** Exceeding provider rate limits results in throttling (HTTP 429), temporary bans, or financial penalties. Monitor the `provider_configs.circuit_breaker_state` field and delivery metrics dashboards. When sustained throughput approaches 70% of a provider's rate limit, consider upgrading the provider plan or implementing request batching (e.g., SendGrid batch API for email).

### 13.5 Database Growth Projections

The following table summarizes the Year 1 growth projections derived from the transactional model above. These estimates are documented in detail in [02 — Detailed Microservices §12](02-detailed-microservices.md#12-schema-overview).

| Schema | Monthly Growth | Year 1 Total | Dominant Table | Retention Strategy |
|---|---|---|---|---|
| `event_ingestion_service` | ~5 GB/month | ~50 GB | `events` | Payload purge after 90 days (`purge_event_payloads()`) |
| `notification_engine_service` | ~8 GB/month | ~80 GB | `notifications` | Content purge after 90 days (`purge_notification_content()`) |
| `channel_router_service` | ~6 GB/month | ~60 GB | `delivery_attempts` | Aggregated into analytics after 6 months |
| `audit_service` | ~12 GB/month | ~120 GB | `audit_events` | Archived to cold storage after 2 years |
| `email_ingest_service` | ~2 GB/month | ~20 GB | `processed_emails` | Purged after retention period |
| `bulk_upload_service` | ~500 MB/month | ~5 GB | `upload_rows` | Terminal uploads purged after 90 days (`purge_old_uploads()`) |
| **Total** | **~34 GB/month** | **~337 GB** | | |

> **Info:** **Adjusting Estimates:** These projections should be revised once production telemetry is available. After the first month of operation, compare actual event volumes, notification multipliers, and payload sizes against these assumptions and adjust infrastructure sizing accordingly.

---

*Notification API Documentation v1.0 -- Architecture Team -- 2026*
