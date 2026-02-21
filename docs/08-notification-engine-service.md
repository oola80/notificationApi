# 08 — Notification Engine Service

**Notification API — Notification Engine Deep-Dive**

| | |
|---|---|
| **Version:** | 1.0 |
| **Date:** | 2026-02-20 |
| **Author:** | Architecture Team |
| **Status:** | **[In Review]** |

---

## Table of Contents

1. [Service Overview](#1-service-overview)
2. [Architecture & Integration Points](#2-architecture--integration-points)
3. [Event Processing Pipeline](#3-event-processing-pipeline)
4. [Rule Engine](#4-rule-engine)
5. [Recipient Resolution](#5-recipient-resolution)
6. [Suppression & Deduplication](#6-suppression--deduplication)
7. [Template Rendering Coordination](#7-template-rendering-coordination)
8. [Notification Dispatch](#8-notification-dispatch)
9. [Priority Management](#9-priority-management)
10. [RabbitMQ Topology](#10-rabbitmq-topology)
11. [REST API Endpoints](#11-rest-api-endpoints)
12. [Database Design](#12-database-design)
13. [Notification Lifecycle State Machine](#13-notification-lifecycle-state-machine)
14. [Sequence Diagrams](#14-sequence-diagrams)
15. [Performance & Scalability](#15-performance--scalability)
16. [Error Handling & Dead Letters](#16-error-handling--dead-letters)
17. [Monitoring & Health Checks](#17-monitoring--health-checks)
18. [Configuration](#18-configuration)

---

## 1. Service Overview

The Notification Engine Service is the central orchestrator of the platform — the "brain" that determines what notifications to send, to whom, using which templates, and through which channels. It consumes normalized events from the Event Ingestion Service via RabbitMQ, evaluates them against a configurable rule engine, resolves recipient lists, coordinates template rendering with the Template Service, and dispatches rendered notifications to the Channel Router for delivery. It also owns the notification lifecycle, tracking each notification from creation through delivery or failure.

| Attribute | Value |
|---|---|
| **Technology** | NestJS (TypeScript) with RabbitMQ consumers (`@golevelup/nestjs-rabbitmq`) |
| **Port** | `3152` |
| **Schema** | PostgreSQL — `notification_engine_service` |
| **Dependencies** | Event Ingestion (via RabbitMQ), Template Service (HTTP), Channel Router (via RabbitMQ), Audit Service (via RabbitMQ), PostgreSQL |
| **Source Repo Folder** | `notification-engine-service/` |

### Responsibilities

1. **Event Consumption:** Subscribes to the `events.normalized` exchange via priority-tiered queues (`q.engine.events.critical` and `q.engine.events.normal`) and processes each normalized event through the rule evaluation pipeline.
2. **Rule Matching:** Evaluates each event against all active notification rules using a declarative condition-based system. Supports equality, range, list, and existence operators against flat event fields.
3. **Recipient Resolution:** Determines notification recipients based on the rule's `recipientType` — customer (from event fields), group (from `recipient_groups` table), or custom (explicit list in rule config).
4. **Suppression & Deduplication:** Evaluates optional per-rule suppression policies (dedup windows, cooldown periods, max send counts) after recipient resolution to prevent duplicate or excessive notifications.
5. **Template Rendering Coordination:** Calls the Template Service (HTTP) to render the appropriate template for each channel, passing the flat event payload as variable data.
6. **Dispatch to Channel Router:** Publishes rendered notifications to the `notifications.deliver` exchange with priority-tiered, channel-specific routing keys.
7. **Lifecycle Management:** Tracks each notification through its lifecycle states: **PENDING** → **PROCESSING** → **RENDERING** → **DELIVERING** → **SENT** → **DELIVERED** or **FAILED** (with **SUPPRESSED** as an early terminal state).
8. **Customer Channel Preferences & Critical Overrides:** Resolves per-customer channel opt-in/opt-out preferences (keyed by `customer_id`) and evaluates configurable critical channel override rules (keyed by `event_type`). Customer preferences are managed via webhook endpoints for external system integration; critical overrides force specific channels regardless of preferences. Both are cached for performance — preferences use TTL-based read-through cache (LRU), overrides use eager in-memory cache with event-driven invalidation.
9. **Priority Management:** Inherits priority tier from the originating event; rules may override with `deliveryPriority`. The effective priority determines queue routing for downstream processing.
10. **Asynchronous Status Logging:** All notification status transitions are published to RabbitMQ as fire-and-forget messages — the status log consumer persists them asynchronously to avoid blocking the critical notification processing path.

> **Info:** **Decoupled Rule-Based Architecture**
>
> The rule-based approach completely decouples event producers from notification logic. Source systems publish events without any knowledge of what notifications will be triggered. The operative team can create, modify, enable, or disable notification rules at any time through the Admin UI without requiring code changes or deployments.

---

## 2. Architecture & Integration Points

The Notification Engine sits at the center of the notification pipeline — between the Event Ingestion Service (upstream) and the Channel Router (downstream). It is the only service that coordinates synchronous HTTP calls to the Template Service while simultaneously participating in the asynchronous RabbitMQ messaging backbone.

### Upstream & Downstream Dependencies

| Direction | System | Protocol | Description |
|---|---|---|---|
| **Upstream** | Event Ingestion Service | RabbitMQ (AMQP) | Consumes normalized events from `events.normalized` exchange via priority-tiered queues |
| **Downstream** | Template Service | HTTP/REST (sync) | Calls `POST /templates/:id/render` to render template per channel with event payload as variable data |
| **Downstream** | Channel Router | RabbitMQ (AMQP) | Publishes rendered notifications to `notifications.deliver` exchange with routing key `notification.deliver.{priority}.{channel}` |
| **Downstream** | Audit Service | RabbitMQ (AMQP) | Publishes notification status transitions to `notifications.status` exchange (fire-and-forget) |
| **Inbound** | Admin Service | HTTP/REST (sync) | Receives rule CRUD operations, notification queries, and dashboard data requests proxied through the Gateway |
| **Inbound** | Channel Router | RabbitMQ (AMQP) | Receives delivery status updates (SENT, DELIVERED, FAILED) from `notifications.status` exchange to update notification records |

### Figure 2.1 — Integration Context

```
                                                    ┌──────────────────────┐
                                                    │   Template Service   │
                                                    │   :3153              │
                                                    │   Render templates   │
                                                    └──────────┬───────────┘
                                                               ▲
                                                               │ HTTP POST
                                                               │ /templates/:id/render
                                                               │
┌──────────────────────┐      ┌─────────────────────────────────────────────────────┐      ┌───────────────────────┐
│ events.normalized    │      │            Notification Engine Service               │      │ notifications.deliver │
│ (Topic Exchange)     │─────▶│            :3152                                    │─────▶│ (Topic Exchange)      │
│                      │      │                                                     │      │                       │
│ q.engine.events.     │      │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │      │ q.deliver.{channel}.  │
│   critical (4 cons)  │      │  │  Rule    │  │Recipient │  │  Suppression    │  │      │   {priority}          │
│ q.engine.events.     │      │  │  Engine  │→│Resolution│→│  Check          │  │      │                       │
│   normal (2 cons)    │      │  └──────────┘  └──────────┘  └──────────────────┘  │      └───────────┬───────────┘
└──────────────────────┘      │                                                     │                  │
                              │  PostgreSQL: notification_engine_service             │                  ▼
                              └─────────────────────────────────────────────────────┘      ┌───────────────────────┐
                                           │                                              │   Channel Router      │
                                           │ Status transitions                           │   :3154               │
                                           ▼                                              │   Route & Deliver     │
                              ┌─────────────────────────┐                                 └───────────────────────┘
                              │ notifications.status     │
                              │ (Topic Exchange)         │
                              │                          │──────────────────────────▶ Audit Service :3156
                              └─────────────────────────┘

                              ┌─────────────────────────┐
                              │ Admin Service :3155      │──── HTTP/REST ────▶ Notification Engine :3152
                              │ (via Gateway :3150)      │                    (Rule CRUD, notification queries)
                              └─────────────────────────┘
```

---

## 3. Event Processing Pipeline

Every normalized event consumed from the `events.normalized` exchange passes through a 9-step processing pipeline. This pipeline is executed per-event and may produce zero, one, or many notifications depending on how many rules match and how many recipients each rule resolves.

1. **Consume Event:** Receive normalized event from the priority-tiered RabbitMQ queue (`q.engine.events.critical` or `q.engine.events.normal`).
2. **Rule Lookup:** Query all active notification rules whose `eventType` matches the incoming event type. By default, rules are fetched directly from PostgreSQL. When `RULE_CACHE_ENABLED=true`, rules are resolved from an in-memory cache with event-driven invalidation (see [Section 4.3 — Rule Cache Strategy](#43-rule-cache-strategy)).
3. **Evaluate Conditions:** For each matching rule, evaluate the `conditions` object against the flat event fields using the expression evaluator. Rules that pass all conditions proceed; others are skipped.
4. **Priority Resolution:** Determine the effective priority for each rule's notifications — use the rule's `deliveryPriority` if set, otherwise inherit the event's `priority` field.
5. **Execute Actions:** For each matched rule, iterate through its `actions` array. Each action specifies a template, channels, and recipient type.
6. **Resolve Recipients & Channel Preferences:** For each action, resolve the recipient list based on `recipientType` (customer, group, or custom). Then perform 3-part channel resolution: (1) lookup customer channel preferences by `customer_id` from cache or DB, (2) check critical channel overrides by `event_type` from cache, (3) compute effective channels — combining rule-defined channels filtered by preferences with any override-forced channels.
7. **Evaluate Suppression:** For each recipient, evaluate the rule's `suppression` configuration (if any). Suppressed notifications are logged with a SUPPRESSED terminal status via RabbitMQ (fire-and-forget) — they are not persisted as full `notifications` rows.
8. **Render Template:** Call the Template Service (HTTP `POST /templates/:id/render`) for each channel variant. Pass the flat event payload as template variable data. On failure, mark the notification as FAILED.
9. **Dispatch & ACK:** Publish rendered notifications to `notifications.deliver` exchange with routing key `notification.deliver.{priority}.{channel}`. Publish status transitions to `notifications.status` exchange asynchronously. ACK the RabbitMQ message.

### Figure 3.1 — Event Processing Pipeline

```
    ┌──────────────────────────┐
    │  1. Consume Event         │  ◄── RabbitMQ: q.engine.events.{priority}
    └────────────┬─────────────┘
                 ▼
    ┌──────────────────────────┐
    │  2. Rule Lookup           │  ◄── Query active rules by eventType
    └────────────┬─────────────┘      (direct DB or in-memory cache)
                 ▼
     ◆ 3. Evaluate Conditions  ◆────── No match ──▶ [ACK, skip]
                 │
              Match(es)
                 ▼
    ┌──────────────────────────┐
    │  4. Priority Resolution   │  ◄── deliveryPriority ?? event.priority
    └────────────┬─────────────┘
                 ▼
    ┌──────────────────────────┐
    │  5. Execute Actions       │  ◄── For each action in matched rule(s)
    └────────────┬─────────────┘
                 ▼
    ┌──────────────────────────┐
    │  6. Resolve Recipients    │  ◄── customer | group | custom
    └────────────┬─────────────┘      + channel preferences (customer_id)
                 ▼                    + critical overrides (event_type)
    ┌──────────────────────────┐      = effective channels
    │  6b. Channel Resolution  │  ◄── preferences ∩ rules ∪ overrides
    └────────────┬─────────────┘
                 ▼
     ◆ 7. Evaluate Suppression ◆────── Suppressed ──▶ [Log SUPPRESSED async, skip]
                 │
                Pass
                 ▼
    ┌──────────────────────────┐
    │  8. Render Template       │  ◄── HTTP POST to Template Service
    └────────────┬─────────────┘      per channel variant
                 │
          ┌──────┴──────┐
          │  Render OK? │
          └──┬──────┬───┘
            Yes     No ──▶ [Mark FAILED, log async]
             │
             ▼
    ┌──────────────────────────┐
    │  9. Dispatch & ACK        │  ◄── Publish to notifications.deliver
    └──────────────────────────┘      Publish status async, ACK message
```

---

## 4. Rule Engine

The rule engine is the core decision-making component. It determines which events trigger notifications, under what conditions, and with what configuration. Rules are created and managed by the operative team through the Admin UI — no code changes or deployments are required.

### 4.1 Rule Matching System

When a normalized event arrives, the engine evaluates it against rules in two phases:

**Phase 1 — Event Type Filter:** Query all active rules whose `event_type` matches the event's `eventType`. This is the primary filter and uses an indexed lookup.

**Phase 2 — Condition Evaluation:** For each event-type-matched rule, evaluate the `conditions` JSONB object against the flat event fields using a simple expression evaluator.

#### Supported Condition Operators

| Operator | Description | Example |
|---|---|---|
| `$eq` | Exact equality | `"sourceId": { "$eq": "oms" }` |
| `$ne` | Not equal | `"status": { "$ne": "cancelled" }` |
| `$in` | Value in list | `"sourceId": { "$in": ["oms", "magento"] }` |
| `$nin` | Value not in list | `"channel": { "$nin": ["sms"] }` |
| `$gt` | Greater than | `"totalAmount": { "$gt": 100 }` |
| `$gte` | Greater than or equal | `"totalAmount": { "$gte": 0 }` |
| `$lt` | Less than | `"totalAmount": { "$lt": 1000 }` |
| `$lte` | Less than or equal | `"quantity": { "$lte": 50 }` |
| `$exists` | Field exists (and is non-null) | `"customerEmail": { "$exists": true }` |
| `$regex` | Regex pattern match | `"orderId": { "$regex": "^ORD-2026" }` |
| *(direct value)* | Shorthand for `$eq` | `"sourceId": "oms"` |

All conditions within a rule are combined with logical AND — every condition must pass for the rule to match. If the `conditions` object is empty or null, the rule matches all events of the configured `eventType`.

#### Rule Priority & Exclusivity

- Rules are prioritized by a `priority` field (lower number = higher priority, default: 100).
- If multiple rules match a single event, **all matching rules are executed** — each produces its own set of notifications.
- If a rule is marked `is_exclusive = true`, only the highest-priority exclusive rule runs and subsequent matches (both exclusive and non-exclusive) are skipped for that event.

```
Event arrives (eventType: "order.shipped")
    │
    ▼
┌─────────────────────────────────────────────────┐
│  Active rules for "order.shipped" (by priority) │
│                                                 │
│  1. Rule A  priority=10  exclusive=false         │  ──▶ MATCH ──▶ Execute actions
│  2. Rule B  priority=20  exclusive=true          │  ──▶ MATCH ──▶ Execute actions, STOP (exclusive)
│  3. Rule C  priority=30  exclusive=false         │  ──▶ SKIPPED (Rule B was exclusive)
│  4. Rule D  priority=40  exclusive=false         │  ──▶ SKIPPED (Rule B was exclusive)
└─────────────────────────────────────────────────┘

Without Rule B (exclusive), Rules A, C, and D would all execute.
```

### 4.2 Rule Configuration Schema

```json
{
  "ruleId": "r-550e8400-e29b-41d4-a716-446655440000",
  "name": "Order Shipped Notification",
  "description": "Send shipping confirmation to customer and ops team when order is shipped",
  "eventType": "order.shipped",
  "conditions": {
    "sourceId": { "$in": ["oms", "magento"] },
    "totalAmount": { "$gte": 0 },
    "customerEmail": { "$exists": true }
  },
  "actions": [
    {
      "actionId": "act-001",
      "templateId": "tpl-order-shipped",
      "channels": ["email", "sms", "push"],
      "recipientType": "customer",
      "delayMinutes": 0
    },
    {
      "actionId": "act-002",
      "templateId": "tpl-order-shipped-internal",
      "channels": ["email"],
      "recipientType": "group",
      "recipientGroupId": "grp-ops-team",
      "delayMinutes": 5
    }
  ],
  "suppression": {
    "dedupKey": ["eventType", "orderId", "recipient.email"],
    "modes": {
      "cooldown": { "intervalMinutes": 1440 }
    }
  },
  "deliveryPriority": null,
  "priority": 10,
  "isExclusive": false,
  "isActive": true,
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-02-10T08:30:00.000Z"
}
```

#### Field Descriptions

| Field | Type | Required | Description |
|---|---|---|---|
| `ruleId` | UUID | Auto | Unique rule identifier |
| `name` | string | Yes | Human-readable rule name |
| `description` | string | No | Detailed description of the rule's purpose |
| `eventType` | string | Yes | Dot-notation event type to match (e.g., `order.shipped`) |
| `conditions` | object | No | JSONB condition expressions evaluated against flat event fields. If null/empty, matches all events of this type. |
| `actions` | array | Yes | Ordered array of actions to execute when the rule matches |
| `actions[].templateId` | string | Yes | Template ID to render for this action |
| `actions[].channels` | string[] | Yes | Target channels (`email`, `sms`, `whatsapp`, `push`) |
| `actions[].recipientType` | string | Yes | `customer`, `group`, or `custom` |
| `actions[].recipientGroupId` | string | Conditional | Required when `recipientType` is `group` |
| `actions[].customRecipients` | array | Conditional | Required when `recipientType` is `custom` — explicit recipient list |
| `actions[].delayMinutes` | number | No | Delay before processing this action (default: 0) |
| `suppression` | object | No | Optional suppression/dedup configuration. `null` = no suppression. |
| `deliveryPriority` | string | No | Override event priority: `normal`, `critical`, or `null` (inherit from event) |
| `priority` | number | No | Rule matching order (lower = higher priority, default: 100) |
| `isExclusive` | boolean | No | If true, prevents lower-priority rules from executing (default: false) |
| `isActive` | boolean | Yes | Only active rules are evaluated |

### 4.3 Rule Cache Strategy

By default (`RULE_CACHE_ENABLED=false`), every rule lookup queries PostgreSQL directly — no caching layer is involved. This is the simplest mode and suitable for development, low-throughput environments, and simple deployments.

When `RULE_CACHE_ENABLED=true`, the service uses an **eager cache** with **event-driven invalidation** to keep the database off the hot path entirely:

**Phase 1 — Eager Warm-Up**

On startup, before the service begins consuming events, it executes:

```sql
SELECT * FROM notification_rules WHERE is_active = true;
```

All rows are loaded into an in-memory `Map<eventType, Rule[]>` grouped by event type. The service does not bind its RabbitMQ consumers until the cache is fully populated.

**Phase 2 — Event-Driven Invalidation**

Whenever a rule is created, updated, or deactivated via the Admin Service, the Admin Service publishes an invalidation event to the `config.events` exchange with routing key `config.rule.changed`. The event payload contains the rule `id` and the `updated_at` timestamp.

The Notification Engine subscribes via the `q.config.rule-cache` queue. On receiving an invalidation event, it:

1. Fetches the updated `notification_rules` row from PostgreSQL by `id`.
2. Compares the fetched `updated_at` with the cached timestamp.
3. If the fetched timestamp is newer, replaces the entry in the cache (or removes it if `is_active = false`).
4. If the fetched timestamp is equal or older (out-of-order delivery), the event is discarded.

```
  Admin Service                    RabbitMQ                    Notification Engine
       │                              │                                │
       │  Rule updated                │                                │
       │  (via Admin UI)              │                                │
       │                              │                                │
       │  Publish to config.events    │                                │
       │  key: config.rule.changed    │                                │
       │─────────────────────────────▶│                                │
       │                              │  Deliver to                    │
       │                              │  q.config.rule-cache           │
       │                              │───────────────────────────────▶│
       │                              │                                │
       │                              │                    ┌───────────┴───────────┐
       │                              │                    │ 1. Fetch updated row  │
       │                              │                    │    from PostgreSQL    │
       │                              │                    │ 2. Compare updated_at │
       │                              │                    │ 3. Replace in cache   │
       │                              │                    │    (if newer)         │
       │                              │                    └───────────┬───────────┘
       │                              │                                │
       │                              │                    Cache updated (~100ms)
```

> **Info:** **When to Enable Rule Caching**
>
> Enable `RULE_CACHE_ENABLED=true` in **production** and **high-throughput** environments where rule lookups would otherwise add unnecessary latency and database pressure on every event. Leave it disabled (`false`) in **development** and **simple deployments** where the operational simplicity of direct database queries is preferred and event volumes are low. The number of active rules is typically small (tens to low hundreds), making the in-memory footprint negligible.

---

## 5. Recipient Resolution

For each matched rule action, the engine resolves recipients based on the `recipientType` configuration. Recipient resolution happens before suppression evaluation — suppression is evaluated per-recipient.

### 5.1 Recipient Types

#### Customer

Extracts contact details directly from the flat event fields:

| Event Field | Contact Type | Usage |
|---|---|---|
| `customerEmail` | Email address | Email and WhatsApp channels |
| `customerPhone` | Phone number (E.164) | SMS channel |
| `deviceToken` | FCM device token | Push notification channel |
| `customerId` | Customer identifier | Preference lookup key |

The `customer` type always resolves to a single recipient — the customer referenced in the event.

#### Group

Resolves all active members of the specified `recipientGroupId` from the `recipient_groups` and `recipient_group_members` tables:

```sql
SELECT m.email, m.phone, m.device_token, m.member_name
FROM recipient_group_members m
JOIN recipient_groups g ON g.id = m.group_id
WHERE g.id = :recipientGroupId
  AND g.is_active = true
  AND m.is_active = true;
```

Group recipients are typically internal users (operations team, customer service managers) who receive notifications about business events.

#### Custom

Uses an explicit recipient list defined inline in the rule action configuration:

```json
{
  "recipientType": "custom",
  "customRecipients": [
    { "email": "alerts@company.com", "name": "Alerts Inbox" },
    { "email": "manager@company.com", "phone": "+1987654321", "name": "Regional Manager" }
  ]
}
```

### 5.2 Customer Channel Preferences & Critical Override Resolution

After resolving the recipient list, the engine performs a 3-part channel resolution for each recipient to determine the effective set of channels. This replaces the simple opt-out check with a more comprehensive system that supports `customer_id`-based lookups, critical channel overrides, and external preference management via webhooks.

#### Preference Lookup

Customer channel preferences are looked up by `customer_id` (not email). The `customer_id` is extracted from the event payload — the same identifier used for `recipientType: customer`.

```sql
SELECT channel, is_opted_in
FROM customer_channel_preferences
WHERE customer_id = :customerId;
```

Preferences are cached using a TTL-based read-through cache (see [Section 15.5 — Preference & Override Cache Strategy](#155-preference--override-cache-strategy)). On cache miss, the DB is queried and the result is populated into cache.

#### Critical Override Lookup

Critical channel overrides are configurable rules that force specific channels for specific event types, regardless of customer preferences. They are cached eagerly in memory as a `Map<eventType, channel[]>`.

```sql
SELECT channel
FROM critical_channel_overrides
WHERE event_type = :eventType AND is_active = true;
```

#### Effective Channel Resolution Algorithm

```
Input: ruleChannels[], customerId, eventType

1. Load customer preferences (from cache or DB by customer_id)
2. Load critical overrides (from cache by event_type)
3. Compute effective channels:
   - If no preferences found → effectiveChannels = ruleChannels UNION overrideChannels
   - If preferences found → preferredChannels = [ch for ch in ruleChannels WHERE opted_in]
                            effectiveChannels = preferredChannels UNION overrideChannels
4. If effectiveChannels is empty → skip recipient (log as preference-filtered)
```

#### Edge Cases

| Scenario | Behavior |
|---|---|
| No preference record for customer | Use rule-defined channels + overrides (opt-in to all) |
| Customer opted out of ALL channels, no overrides | Skip notification for this recipient |
| Customer opted out of ALL channels, override forces SMS | Send SMS only (override wins) |
| Multiple overrides for same event_type | All override channels included |
| Non-customer recipient type (group/custom) | Preferences not checked; overrides still apply |
| `customer_id` is NULL on event | Fall back to rule-defined channels + overrides |

### Figure 5.1 — Recipient Resolution Flow

```
    ┌──────────────────────────┐
    │  Action: recipientType   │
    └────────────┬─────────────┘
                 │
       ┌─────────┼──────────┐
       ▼         ▼          ▼
  ┌─────────┐ ┌──────┐ ┌──────┐
  │customer │ │group │ │custom│
  └────┬────┘ └──┬───┘ └──┬───┘
       │         │        │
       │  Extract│  Query │  Use inline
       │  from   │  group │  recipient
       │  event  │  members│  list
       │  fields │        │
       └─────────┼────────┘
                 ▼
    ┌──────────────────────────┐
    │  Lookup customer channel │
    │  preferences by          │
    │  customer_id (cache/DB)  │
    └────────────┬─────────────┘
                 ▼
    ┌──────────────────────────┐
    │  Lookup critical channel │
    │  overrides by event_type │
    │  (in-memory cache)       │
    └────────────┬─────────────┘
                 ▼
    ┌──────────────────────────┐
    │  Compute effective       │
    │  channels:               │
    │  preferred ∪ overrides   │
    └────────────┬─────────────┘
                 │
       ┌─────────┼──────────┐
       ▼                    ▼
  ┌──────────┐      ┌───────────┐
  │ Channels │      │ No        │
  │ resolved │      │ channels  │
  │ Proceed  │      │ Skip      │
  │ to       │      │ recipient │
  │ suppress.│      │ (log)     │
  └──────────┘      └───────────┘
```

---

## 6. Suppression & Deduplication

Each notification rule may include an optional `suppression` configuration (JSONB) that prevents duplicate or excessive notifications. Suppression is evaluated **per-recipient**, after recipient resolution and before template rendering. If a notification is suppressed, it is logged with a `SUPPRESSED` terminal status asynchronously via RabbitMQ but **not** persisted as a full `notifications` row — keeping send counts accurate.

### 6.1 Suppression Configuration Structure

| Field | Type | Description |
|---|---|---|
| `dedupKey` | `string[]` | Array of field names resolved against the flat event context and recipient (e.g., `["eventType", "orderId", "recipient.email"]`). Values are concatenated and SHA-256 hashed into a fixed-length lookup key. |
| `modes.dedup` | `{ windowMinutes: number }` | Suppress if any notification with the same dedup key hash was sent within the specified window. |
| `modes.maxCount` | `{ limit: number, windowMinutes: number }` | Suppress if `limit` or more notifications with the same dedup key hash were sent within the specified window. |
| `modes.cooldown` | `{ intervalMinutes: number }` | Suppress if the last notification with the same dedup key hash was sent less than `intervalMinutes` ago. |

### 6.2 Dedup Key Resolution

At evaluation time, each field name in the `dedupKey` array is resolved against the flat event context (event type, sourceId, top-level fields) and the current recipient. The resolved values are concatenated with a pipe delimiter and hashed using SHA-256 to produce a fixed 64-character hex string stored in the `dedup_key_hash` column. The original resolved values are also stored in `dedup_key_values` (JSONB) for human-readable display in the Admin UI.

**Example:** For `dedupKey: ["eventType", "orderId", "recipient.email"]` with an event `{ eventType: "order.shipped", orderId: "ORD-001" }` and recipient `jane@example.com`:

```
Resolved: "order.shipped|ORD-001|jane@example.com"
SHA-256:  "a3f2b8c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1"
```

### 6.3 Suppression Evaluation Logic

When a rule has a `suppression` configuration, the engine evaluates all configured modes in order: **dedup → cooldown → maxCount**. The first mode that triggers causes the notification to be suppressed — all modes must pass for the notification to proceed (logical AND). The suppression reason is recorded in the status log metadata published asynchronously.

### 6.4 Suppression Query

The suppression check queries the `notifications` table to find recent notifications with the same dedup key hash:

```sql
SELECT id, status, created_at
FROM notifications
WHERE rule_id = :ruleId
  AND dedup_key_hash = :hash
  AND status NOT IN ('FAILED')
  AND created_at >= NOW() - INTERVAL ':windowMinutes minutes'
ORDER BY created_at DESC;
```

This query leverages a **partial composite index** optimized for suppression lookups:

```sql
CREATE INDEX idx_notifications_suppression
ON notifications (rule_id, dedup_key_hash, created_at DESC)
INCLUDE (status)
WHERE dedup_key_hash IS NOT NULL AND status != 'FAILED';
```

**Performance optimizations for the suppression query** — see [Section 15.3 — Suppression Query Optimization](#153-suppression-query-optimization) for details on index-only scans, the partial index strategy, and the lightweight `suppression_log` approach for very high-throughput deployments.

#### Failed Notification Exclusion

Notifications with `FAILED` status are excluded from suppression queries (`WHERE status NOT IN ('FAILED')`) so that failed delivery attempts do not block legitimate retries or re-sends.

### 6.5 Example Suppression Configurations

**Late Delivery — no repeat within 24h:**
```json
"suppression": {
  "dedupKey": ["eventType", "orderId", "recipient.email"],
  "modes": { "dedup": { "windowMinutes": 1440 } }
}
```

**Order Status — max 5 per order per week:**
```json
"suppression": {
  "dedupKey": ["orderId", "recipient.email"],
  "modes": { "maxCount": { "limit": 5, "windowMinutes": 10080 } }
}
```

**Promo Reminder — cooldown 3 days per customer:**
```json
"suppression": {
  "dedupKey": ["recipient.email"],
  "modes": { "cooldown": { "intervalMinutes": 4320 } }
}
```

**Payment Failure — combined dedup + max 3/week + 4h cooldown:**
```json
"suppression": {
  "dedupKey": ["eventType", "orderId", "paymentAttemptId", "recipient.email"],
  "modes": {
    "dedup": { "windowMinutes": 10080 },
    "maxCount": { "limit": 3, "windowMinutes": 10080 },
    "cooldown": { "intervalMinutes": 240 }
  }
}
```

> **Info:** **Optional Per-Rule Configuration**
> Suppression is entirely optional. When the `suppression` field is `NULL` (the default), the rule operates without any deduplication or rate limiting — every matched event produces a notification.

---

## 7. Template Rendering Coordination

The Notification Engine coordinates template rendering by calling the Template Service synchronously via HTTP. This is the only synchronous inter-service call in the notification pipeline — it is required because the engine needs the rendered content before it can dispatch to the Channel Router.

### 7.1 Rendering Flow

For each notification action, the engine calls the Template Service once per target channel:

```
POST http://template-service:3153/templates/:templateId/render
Content-Type: application/json

{
  "channel": "email",
  "data": {
    "customerName": "Jane Doe",
    "orderNumber": "ORD-2026-00451",
    "trackingUrl": "https://track.carrier.com/ABC123",
    "items": [
      { "name": "Wireless Headphones", "quantity": 1, "price": 79.99 }
    ],
    "totalAmount": 79.99,
    "currency": "USD"
  }
}
```

**Response (200 OK):**

```json
{
  "channel": "email",
  "subject": "Your order ORD-2026-00451 has been shipped!",
  "body": "<html><body><h1>Hi Jane Doe,</h1><p>Great news!...</p></body></html>",
  "templateVersion": 3
}
```

### 7.2 Multi-Channel Rendering

When an action targets multiple channels (e.g., `["email", "sms", "push"]`), the engine makes parallel render requests — one per channel. Each channel receives its own content variant from the Template Service:

```
┌───────────────────────┐
│  Action: channels =   │
│  [email, sms, push]   │
└───────────┬───────────┘
            │
   ┌────────┼────────┐
   ▼        ▼        ▼
┌──────┐ ┌──────┐ ┌──────┐     Template Service
│email │ │ sms  │ │ push │     POST /templates/:id/render
│render│ │render│ │render│     (parallel HTTP calls)
└──┬───┘ └──┬───┘ └──┬───┘
   │        │        │
   ▼        ▼        ▼
┌──────┐ ┌──────┐ ┌──────┐     Rendered content
│HTML  │ │Plain │ │Title │     per channel
│email │ │text  │ │+body │
└──────┘ └──────┘ └──────┘
```

### 7.3 Rendering Failure Handling

| Scenario | Handling |
|---|---|
| Template not found (404) | Notification marked as FAILED; error logged with template ID |
| Template Service unavailable | Retry with exponential backoff (3 attempts, 1s/3s/9s). After max retries, notification marked as FAILED. |
| Rendering error (500) | Notification marked as FAILED; raw error from Template Service logged in metadata |
| Partial channel failure | Succeeded channels proceed to dispatch; failed channels logged individually |
| Timeout (>5s) | Treated as unavailable — retry with backoff |

---

## 8. Notification Dispatch

After template rendering, the engine publishes each rendered notification to the `notifications.deliver` RabbitMQ exchange for the Channel Router to consume and deliver to external providers.

### 8.1 Dispatch Message Schema

Each message published to `notifications.deliver` contains the full context needed for delivery:

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
  "metadata": {
    "correlationId": "corr-8f14e45f-ceea-467f-a8f5-5f1b39e5c7e2",
    "sourceId": "oms",
    "eventType": "order.shipped",
    "cycleId": "CYC-2026-00451",
    "dispatchedAt": "2026-02-20T10:15:31.456Z"
  }
}
```

### 8.2 Routing Key Strategy

The routing key format `notification.deliver.{priority}.{channel}` ensures:

- **Priority isolation:** Critical and normal notifications are routed to separate queues, with more consumers allocated to critical queues.
- **Channel isolation:** Each channel has its own queue, enabling independent scaling per channel.

| Routing Key | Target Queue | Consumers |
|---|---|---|
| `notification.deliver.critical.email` | `q.deliver.email.critical` | 3 |
| `notification.deliver.normal.email` | `q.deliver.email.normal` | 2 |
| `notification.deliver.critical.sms` | `q.deliver.sms.critical` | 2 |
| `notification.deliver.normal.sms` | `q.deliver.sms.normal` | 1 |
| `notification.deliver.critical.whatsapp` | `q.deliver.whatsapp.critical` | 2 |
| `notification.deliver.normal.whatsapp` | `q.deliver.whatsapp.normal` | 1 |
| `notification.deliver.critical.push` | `q.deliver.push.critical` | 2 |
| `notification.deliver.normal.push` | `q.deliver.push.normal` | 1 |

---

## 9. Priority Management

Priority tiering ensures that time-sensitive notifications (delivery delays, payment failures) are processed before lower-priority traffic (promotions, order confirmations) during backpressure.

### 9.1 Priority Resolution

```
Event arrives with priority = "normal"
    │
    ▼
Rule matched with deliveryPriority = ?
    │
    ├── deliveryPriority = "critical"  ──▶ Effective priority: CRITICAL
    ├── deliveryPriority = "normal"    ──▶ Effective priority: NORMAL
    └── deliveryPriority = null        ──▶ Effective priority: NORMAL (inherited from event)
```

| Event Priority | Rule `deliveryPriority` | Effective Priority | Rationale |
|---|---|---|---|
| `normal` | `null` | `normal` | Inherit from event (default) |
| `normal` | `critical` | `critical` | Rule escalates priority |
| `critical` | `null` | `critical` | Inherit from event |
| `critical` | `normal` | `normal` | Rule overrides — unusual but permitted |

> **Info:** **Priority Fields — Two Distinct Purposes**
>
> `deliveryPriority` (on the rule) controls **notification urgency** — which queue tier the notification enters for processing and delivery. `priority` (also on the rule) controls **rule matching order** — which rule evaluates first when multiple rules match the same event. These are independent concerns with different semantics.

### 9.2 Queue Allocation

| Queue | Priority | Consumers | Rationale |
|---|---|---|---|
| `q.engine.events.critical` | Critical | 4 | Double allocation for time-sensitive events |
| `q.engine.events.normal` | Normal | 2 | Baseline allocation for standard events |

During backpressure, the 2:1 consumer ratio ensures critical events are consumed approximately twice as fast as normal events. Additional instances of the Notification Engine further multiply this ratio linearly.

---

## 10. RabbitMQ Topology

### Exchanges

| Exchange | Type | Purpose | Durable |
|---|---|---|---|
| `events.normalized` | Topic | Receives normalized events from Event Ingestion (consumed by Engine) | Yes |
| `notifications.deliver` | Topic | Dispatches rendered notifications to Channel Router | Yes |
| `notifications.status` | Topic | Publishes notification lifecycle status transitions | Yes |
| `notifications.dlq` | Fanout | Dead-letter exchange for failed messages | Yes |
| `config.events` | Topic | Receives rule configuration change events (used when `RULE_CACHE_ENABLED=true`) | Yes |

### Queues

| Queue | Bound To | Routing Key | Concurrency | Prefetch | DLQ |
|---|---|---|---|---|---|
| `q.engine.events.critical` | `events.normalized` | `event.critical.#` | 4 | 5 | Yes |
| `q.engine.events.normal` | `events.normalized` | `event.normal.#` | 2 | 10 | Yes |
| `q.config.rule-cache` | `config.events` | `config.rule.changed` | 1 | 1 | No |
| `q.config.override-cache` | `config.events` | `config.override.changed` | 1 | 1 | No |
| `q.engine.status.inbound` | `notifications.status` | `notification.status.delivered`, `notification.status.failed` | 2 | 10 | Yes |

### Routing Key Formats

| Direction | Pattern | Example |
|---|---|---|
| **Consumes** (events) | `event.{priority}.{eventType}` | `event.critical.order.delayed` |
| **Publishes** (deliver) | `notification.deliver.{priority}.{channel}` | `notification.deliver.critical.email` |
| **Publishes** (status) | `notification.status.{outcome}` | `notification.status.processing` |
| **Consumes** (config — rules) | `config.rule.changed` | `config.rule.changed` |
| **Consumes** (config — overrides) | `config.override.changed` | `config.override.changed` |

### Figure 10.1 — RabbitMQ Topology

```
                              ┌─────────────────────┐
                              │  events.normalized   │
                              │  (Topic Exchange)    │
                              └──┬────────────────┬──┘
                                 │                │
              event.critical.#   │                │   event.normal.#
                                 ▼                ▼
              ┌───────────────────┐  ┌───────────────────┐
              │q.engine.events.   │  │q.engine.events.   │
              │  critical         │  │  normal            │
              │  (4 consumers)    │  │  (2 consumers)     │
              └────────┬──────────┘  └────────┬──────────┘
                       └───────────┬──────────┘
                                   ▼
                    ┌──────────────────────────────┐
                    │    Notification Engine        │
                    │    Rule Match → Resolve →     │
                    │    Suppress → Render →        │
                    │    Dispatch                   │
                    └──────┬────────────┬──────────┘
                           │            │
                           ▼            ▼
            ┌──────────────────┐  ┌──────────────────────┐
            │notifications.    │  │notifications.status   │
            │  deliver         │  │  (Topic Exchange)     │
            │(Topic Exchange)  │  │                       │
            │                  │  │  Fire-and-forget      │
            │  Per-channel,    │  │  status transitions   │
            │  per-priority    │  └───────────┬───────────┘
            │  queues          │              │
            └──────────────────┘              ▼
                                  ┌──────────────────────┐
                                  │  Audit Service       │
                                  │  + Engine status     │
                                  │    consumer          │
                                  └──────────────────────┘
```

---

## 11. REST API Endpoints

The Notification Engine exposes REST endpoints for the Admin Service (proxied through the Gateway) for rule management, notification queries, and operational purposes. These endpoints are **not** directly accessed by external clients.

### POST /rules

Create a new notification rule.

**Request Body:**

```json
{
  "name": "Order Shipped Notification",
  "description": "Notify customer when order ships",
  "eventType": "order.shipped",
  "conditions": {
    "customerEmail": { "$exists": true }
  },
  "actions": [
    {
      "templateId": "tpl-order-shipped",
      "channels": ["email", "sms"],
      "recipientType": "customer",
      "delayMinutes": 0
    }
  ],
  "suppression": null,
  "deliveryPriority": null,
  "priority": 100,
  "isExclusive": false,
  "isActive": true
}
```

**Validation:**
- `eventType` is a valid dot-notation string
- `actions` array has at least one entry
- Each `templateId` exists in the Template Service (verified via HTTP call)
- Each channel in `actions[].channels` is a valid channel type
- If `suppression` is provided: at least one mode specified, all window/interval values > 0, all `dedupKey` entries are valid dot-notation strings
- `priority` is a positive integer

**Response (201 Created):**

```json
{
  "ruleId": "r-550e8400-e29b-41d4-a716-446655440000",
  "name": "Order Shipped Notification",
  "eventType": "order.shipped",
  "isActive": true,
  "createdAt": "2026-02-20T10:00:00.000Z"
}
```

### GET /rules

List notification rules with pagination and filtering.

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `eventType` | string | — | Filter by event type |
| `isActive` | boolean | — | Filter by active status |
| `page` | integer | 1 | Page number |
| `limit` | integer | 50 | Items per page (max 200) |

### GET /rules/:id

Retrieve full rule details including conditions, actions, suppression config, and recent trigger count.

### PUT /rules/:id

Update an existing rule. Supports partial updates. Setting `suppression: null` removes suppression. Changes are audit-logged. If `RULE_CACHE_ENABLED=true`, publishes an invalidation event to `config.events` exchange.

### DELETE /rules/:id

Soft-delete a rule (sets `is_active = false`). If `RULE_CACHE_ENABLED=true`, publishes an invalidation event.

### GET /notifications

List notifications with pagination and filtering.

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `status` | string | — | Filter by status (PENDING, PROCESSING, SENT, DELIVERED, FAILED, SUPPRESSED) |
| `channel` | string | — | Filter by channel |
| `eventType` | string | — | Filter by originating event type |
| `ruleId` | UUID | — | Filter by rule |
| `recipientEmail` | string | — | Filter by recipient email |
| `from` | ISO-8601 | — | Start of date range |
| `to` | ISO-8601 | — | End of date range |
| `page` | integer | 1 | Page number |
| `limit` | integer | 50 | Items per page (max 200) |

### GET /notifications/:id

Retrieve full notification details including lifecycle status log, delivery attempts, rendered content, and recipient information.

### GET /notifications/:id/timeline

Retrieve the complete status transition timeline for a notification — all entries from `notification_status_log` ordered chronologically.

### POST /notifications/send

Manually trigger a notification (used by the Admin UI "Send Notification" feature). Bypasses the rule engine — directly creates a notification with the provided template, channels, and recipients.

### GET /recipient-groups

List recipient groups with pagination.

### POST /recipient-groups

Create a new recipient group.

### PUT /recipient-groups/:id

Update a recipient group (name, description, members).

### POST /customer-preferences

Webhook endpoint for external systems (CRM, CDP, consent management platforms) to upsert customer channel preferences. Authenticated via `X-API-Key` header (validated against `PREFERENCE_WEBHOOK_API_KEY` env var).

**Request Body:**

```json
{
  "customerId": "CUST-00451",
  "channels": { "email": true, "sms": false, "whatsapp": false, "push": true },
  "sourceSystem": "crm"
}
```

**Behavior:**

- For each channel in the `channels` object, performs `INSERT ... ON CONFLICT (customer_id, channel) DO UPDATE` to upsert the preference.
- After upsert, evicts the affected `customer_id` from the preference cache.
- `sourceSystem` is stored for audit trail (which external system sent this preference update).

**Validation:**
- `customerId` is a non-empty string (max 100 characters)
- `channels` object must contain at least one key; valid keys: `email`, `sms`, `whatsapp`, `push`
- Each channel value must be a boolean

**Response (200 OK):**

```json
{
  "customerId": "CUST-00451",
  "updated": 4,
  "sourceSystem": "crm",
  "timestamp": "2026-02-20T10:00:00.000Z"
}
```

### POST /customer-preferences/bulk

Bulk webhook endpoint for upserting multiple customer preferences in a single request. Max 1000 customers per request. Authenticated via `X-API-Key` header.

**Request Body:**

```json
{
  "preferences": [
    { "customerId": "CUST-00451", "channels": { "email": true, "sms": false } },
    { "customerId": "CUST-00452", "channels": { "email": true, "sms": true } }
  ],
  "sourceSystem": "crm-migration"
}
```

**Behavior:**

- Processes all preferences in a single database transaction using batched `INSERT ... ON CONFLICT DO UPDATE`.
- Evicts all affected `customer_id` entries from the preference cache.

**Validation:**
- `preferences` array must contain 1–1000 entries
- Each entry must have a valid `customerId` and `channels` object (same rules as single endpoint)

**Response (200 OK):**

```json
{
  "processed": 2,
  "sourceSystem": "crm-migration",
  "timestamp": "2026-02-20T10:00:00.000Z"
}
```

### GET /critical-channel-overrides

List all critical channel overrides with pagination.

**Query Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `eventType` | string | — | Filter by event type |
| `isActive` | boolean | — | Filter by active status |
| `page` | integer | 1 | Page number |
| `limit` | integer | 50 | Items per page (max 200) |

### POST /critical-channel-overrides

Create a new critical channel override.

**Request Body:**

```json
{
  "eventType": "delayed-order",
  "channel": "sms",
  "reason": "SLA: customer must receive SMS for delays"
}
```

**Validation:**
- `eventType` is a non-empty string (max 100 characters)
- `channel` is a valid channel type (`email`, `sms`, `whatsapp`, `push`)
- Unique constraint on `(eventType, channel)` — returns 409 Conflict if duplicate

**Response (201 Created):**

```json
{
  "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
  "eventType": "delayed-order",
  "channel": "sms",
  "reason": "SLA: customer must receive SMS for delays",
  "isActive": true,
  "createdAt": "2026-02-20T10:00:00.000Z"
}
```

After creation, publishes an invalidation event to `config.events` exchange with routing key `config.override.changed` to refresh the in-memory cache across all engine instances.

### GET /critical-channel-overrides/:id

Retrieve a specific critical channel override by ID.

### PUT /critical-channel-overrides/:id

Update an existing critical channel override. Supports partial updates. Changes are audit-logged. Publishes an invalidation event to `config.events` exchange with routing key `config.override.changed`.

### DELETE /critical-channel-overrides/:id

Soft-delete a critical channel override (sets `is_active = false`). Publishes an invalidation event to `config.events` exchange with routing key `config.override.changed`.

### GET /health

Health check endpoint.

**Response (200 OK):**

```json
{
  "status": "healthy",
  "uptime": 86400,
  "checks": {
    "database": { "status": "up", "latencyMs": 2 },
    "rabbitmq": { "status": "up", "latencyMs": 5 },
    "templateService": { "status": "up", "latencyMs": 15 },
    "queues": {
      "q.engine.events.critical": { "depth": 3, "consumers": 4 },
      "q.engine.events.normal": { "depth": 28, "consumers": 2 }
    },
    "ruleCache": { "enabled": true, "ruleCount": 47, "lastInvalidation": "2026-02-20T09:45:00Z" }
  }
}
```

---

## 12. Database Design

- **Schema:** `notification_engine_service`
- **User:** `notification_engine_service_user`
- **DB Script:** `notification-engine-service/dbscripts/schema-notification-engine-service.sql`

### notification_rules Table

Stores notification rule definitions. This table is small (tens to low hundreds of rows) and accessed on every event for rule matching.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Rule identifier |
| `name` | `VARCHAR(255)` | `NOT NULL` | Human-readable rule name |
| `description` | `TEXT` | | Detailed description |
| `event_type` | `VARCHAR(100)` | `NOT NULL` | Dot-notation event type to match |
| `conditions` | `JSONB` | | Condition expressions (null = match all) |
| `actions` | `JSONB` | `NOT NULL` | Action array with templates, channels, recipients |
| `suppression` | `JSONB` | | Optional suppression/dedup configuration |
| `delivery_priority` | `VARCHAR(10)` | | Override: `normal`, `critical`, or `NULL` (inherit) |
| `priority` | `INTEGER` | `NOT NULL DEFAULT 100` | Rule matching order (lower = higher priority) |
| `is_exclusive` | `BOOLEAN` | `NOT NULL DEFAULT false` | Prevents lower-priority rules from executing |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT true` | Only active rules are evaluated |
| `created_by` | `VARCHAR(100)` | | Admin user who created the rule |
| `updated_by` | `VARCHAR(100)` | | Admin user who last updated the rule |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

#### Indexes

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_rules_event_type_active` | `event_type, is_active, priority` | B-Tree | Rule lookup by event type (hot path) |

### notifications Table

Core notification records. **This is the dominant growth table** in the schema (~6 GB/month, ~72 GB/year). Each notification dispatched by the engine creates one row per recipient per channel.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `BIGSERIAL` | `PRIMARY KEY` | Auto-increment surrogate key |
| `notification_id` | `UUID` | `NOT NULL UNIQUE DEFAULT gen_random_uuid()` | Canonical notification identifier |
| `event_id` | `UUID` | `NOT NULL` | Reference to originating event (cross-service) |
| `rule_id` | `UUID` | `NOT NULL REFERENCES notification_rules(id)` | Rule that produced this notification |
| `template_id` | `VARCHAR(100)` | `NOT NULL` | Template used for rendering (cross-service) |
| `template_version` | `INTEGER` | | Template version at render time |
| `channel` | `VARCHAR(20)` | `NOT NULL` | Target channel (email, sms, whatsapp, push) |
| `status` | `VARCHAR(20)` | `NOT NULL DEFAULT 'PENDING'` | Current lifecycle status |
| `priority` | `VARCHAR(10)` | `NOT NULL DEFAULT 'normal'` | Effective priority (normal/critical) |
| `recipient_email` | `VARCHAR(255)` | | Recipient email address |
| `recipient_phone` | `VARCHAR(50)` | | Recipient phone number |
| `recipient_name` | `VARCHAR(255)` | | Recipient display name |
| `customer_id` | `VARCHAR(100)` | | Customer identifier from event |
| `dedup_key_hash` | `CHAR(64)` | | SHA-256 hash of resolved dedup key values |
| `dedup_key_values` | `JSONB` | | Original resolved dedup key values (human-readable) |
| `rendered_content` | `JSONB` | | Rendered template output (subject, body) |
| `correlation_id` | `UUID` | | Correlation ID for distributed tracing |
| `cycle_id` | `VARCHAR(255)` | | Business cycle identifier from event |
| `source_id` | `VARCHAR(50)` | | Source system identifier from event |
| `event_type` | `VARCHAR(100)` | | Event type that triggered this notification |
| `error_message` | `TEXT` | | Error details if status is FAILED |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

**Table storage option:** `FILLFACTOR = 80`

#### Indexes

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_notifications_id` | `notification_id` | UNIQUE | Fast lookup by canonical ID |
| `idx_notifications_event_id` | `event_id` | B-Tree | Find all notifications for an event |
| `idx_notifications_suppression` | `rule_id, dedup_key_hash, created_at DESC` INCLUDE `(status)` WHERE `dedup_key_hash IS NOT NULL AND status != 'FAILED'` | Partial B-Tree | Suppression query (index-only scan) |
| `idx_notifications_status` | `status, created_at DESC` | B-Tree | Filter by status + time range |
| `idx_notifications_recipient` | `recipient_email, created_at DESC` | B-Tree | Recipient lookup |
| `idx_notifications_created_at` | `created_at` | B-Tree | Time-range queries, retention purge |
| `idx_notifications_rule_id` | `rule_id, created_at DESC` | B-Tree | Rule-based analytics |

### notification_status_log Table

Append-only log of all notification status transitions. **This is the second-largest growth table** (~1.5 GB/month) because each notification generates 3-6 status transitions (PENDING → PROCESSING → RENDERING → DELIVERING → SENT → DELIVERED).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `BIGSERIAL` | `PRIMARY KEY` | Auto-increment surrogate key |
| `notification_id` | `UUID` | `NOT NULL` | Reference to notification |
| `from_status` | `VARCHAR(20)` | | Previous status (null for initial PENDING) |
| `to_status` | `VARCHAR(20)` | `NOT NULL` | New status |
| `channel` | `VARCHAR(20)` | | Channel associated with this transition |
| `metadata` | `JSONB` | | Transition context (error details, suppression reason, provider response) |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Transition timestamp |

#### Indexes

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_status_log_notification` | `notification_id, created_at` | B-Tree | Timeline query for a notification |
| `idx_status_log_created_at` | `created_at` | B-Tree | Time-range queries, retention purge |

> **Info:** **Asynchronous Status Log Writes**
>
> Status transitions are **not** written to the `notification_status_log` table synchronously during the notification processing pipeline. Instead, the engine publishes each status transition as a message to the `notifications.status` RabbitMQ exchange (fire-and-forget). A dedicated lightweight consumer within the engine service (or the Audit Service) persists these log entries asynchronously. This ensures that logging never blocks the critical notification path — even if the database experiences momentary latency spikes, notification processing continues unimpeded. The trade-off is that the status log is eventually consistent (typically within milliseconds).

### notification_recipients Table

Resolved recipients for group and custom recipient types. For `customer` type, recipient details are stored directly on the `notifications` row and this table is not used.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `BIGSERIAL` | `PRIMARY KEY` | Auto-increment surrogate key |
| `notification_id` | `UUID` | `NOT NULL` | Reference to notification |
| `recipient_type` | `VARCHAR(20)` | `NOT NULL` | `customer`, `group`, or `custom` |
| `email` | `VARCHAR(255)` | | Recipient email |
| `phone` | `VARCHAR(50)` | | Recipient phone (E.164) |
| `device_token` | `TEXT` | | FCM device token for push |
| `member_name` | `VARCHAR(255)` | | Recipient display name |
| `status` | `VARCHAR(20)` | `NOT NULL DEFAULT 'PENDING'` | Per-recipient delivery status |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |

**Table storage option:** `FILLFACTOR = 85`

#### Indexes

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_recipients_notification` | `notification_id` | B-Tree | Find recipients for a notification |

### recipient_groups Table

Named groups of recipients used for bulk internal notifications.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Group identifier |
| `name` | `VARCHAR(255)` | `NOT NULL UNIQUE` | Group name |
| `description` | `TEXT` | | Group description |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT true` | Active/inactive toggle |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

### recipient_group_members Table

Individual members within a recipient group.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `BIGSERIAL` | `PRIMARY KEY` | Auto-increment surrogate key |
| `group_id` | `UUID` | `NOT NULL REFERENCES recipient_groups(id)` | Parent group |
| `email` | `VARCHAR(255)` | `NOT NULL` | Member email |
| `phone` | `VARCHAR(50)` | | Member phone (E.164) |
| `device_token` | `TEXT` | | FCM device token |
| `member_name` | `VARCHAR(255)` | | Member display name |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT true` | Active/inactive toggle |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |

#### Indexes

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_group_members_group` | `group_id, is_active` | B-Tree | Group member lookup |

### customer_channel_preferences Table

Per-customer per-channel opt-in/opt-out preferences, keyed by `customer_id` (the identifier carried on every event). Managed via webhook endpoints for external system integration (CRM, CDP, consent management platforms).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `BIGSERIAL` | `PRIMARY KEY` | Auto-increment surrogate key |
| `customer_id` | `VARCHAR(100)` | `NOT NULL` | Customer identifier (lookup key) |
| `channel` | `VARCHAR(20)` | `NOT NULL` | Channel type (email, sms, whatsapp, push) |
| `is_opted_in` | `BOOLEAN` | `NOT NULL DEFAULT true` | Whether the customer has opted in for this channel |
| `source_system` | `VARCHAR(50)` | | Which external system last updated this preference |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last preference update |

**Table storage option:** `FILLFACTOR = 90`

**Unique constraint:** `(customer_id, channel)` — enables `INSERT ... ON CONFLICT DO UPDATE` for upserts

#### Indexes

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_cust_prefs_customer_id` | `customer_id` | B-Tree | Preference lookup by customer ID |

#### Autovacuum Tuning

```sql
ALTER TABLE customer_channel_preferences SET (
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_analyze_scale_factor = 0.02
);
```

### critical_channel_overrides Table

Configurable rules that force specific channels for specific event types, regardless of customer preferences. Admin-managed via REST API, cached eagerly in memory with event-driven invalidation.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Override identifier |
| `event_type` | `VARCHAR(100)` | `NOT NULL` | Exact event type to match |
| `channel` | `VARCHAR(20)` | `NOT NULL` | Channel forced by this override |
| `reason` | `TEXT` | | Human-readable justification for the override |
| `is_active` | `BOOLEAN` | `NOT NULL DEFAULT true` | Active/inactive toggle (soft-delete) |
| `created_by` | `VARCHAR(100)` | | User who created the override |
| `updated_by` | `VARCHAR(100)` | | User who last updated the override |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Last update timestamp |

**Unique constraint:** `(event_type, channel)` — prevents duplicate overrides

#### Indexes

| Index | Columns | Type | Purpose |
|---|---|---|---|
| `idx_overrides_event_type_active` | `event_type` (partial: `WHERE is_active = true`) | B-Tree | Active override lookup by event type |

**Example data:** `(delayed-order, sms, "SLA: customer must receive SMS for delays")`

### Figure 12.1 — Entity Relationship Diagram

```
┌──────────────────────────────────┐
│        notification_rules        │
├──────────────────────────────────┤
│ PK  id              UUID         │
│     name            VARCHAR(255) │
│     event_type      VARCHAR(100) │
│     conditions      JSONB        │
│     actions         JSONB        │
│     suppression     JSONB        │
│     delivery_priority VARCHAR(10)│
│     priority        INTEGER      │
│     is_exclusive    BOOLEAN      │
│     is_active       BOOLEAN      │
│     created_at      TIMESTAMPTZ  │
│     updated_at      TIMESTAMPTZ  │
└──────────────┬───────────────────┘
               │
               │ 1:N (rule_id)
               ▼
┌────────────────────────────────────────────────────────────────────┐
│                          notifications                             │
│                          FILLFACTOR = 80                           │
├────────────────────────────────────────────────────────────────────┤
│ PK  id                BIGSERIAL                                    │
│ UK  notification_id   UUID                                         │
│ FK  rule_id           UUID            ◄── notification_rules.id    │
│     event_id          UUID            ◄── cross-service (events)   │
│     template_id       VARCHAR(100)    ◄── cross-service (templates)│
│     channel           VARCHAR(20)                                  │
│     status            VARCHAR(20)                                  │
│     priority          VARCHAR(10)                                  │
│     recipient_email   VARCHAR(255)                                 │
│     recipient_phone   VARCHAR(50)                                  │
│     dedup_key_hash    CHAR(64)                                     │
│     dedup_key_values  JSONB                                        │
│     rendered_content  JSONB                                        │
│     correlation_id    UUID                                         │
│     cycle_id          VARCHAR(255)                                 │
│     source_id         VARCHAR(50)                                  │
│     event_type        VARCHAR(100)                                 │
│     created_at        TIMESTAMPTZ                                  │
│     updated_at        TIMESTAMPTZ                                  │
├────────────────────────────────────────────────────────────────────┤
│ Partial index: (rule_id, dedup_key_hash, created_at DESC)          │
│   INCLUDE (status) WHERE dedup_key_hash IS NOT NULL                │
│   AND status != 'FAILED'                                           │
└──────────────┬──────────────────┬──────────────────────────────────┘
               │                  │
               │ 1:N              │ 1:N
               ▼                  ▼
┌──────────────────────────┐  ┌───────────────────────────────┐
│  notification_recipients │  │  notification_status_log      │
│  FILLFACTOR = 85         │  │  (append-only, async writes)  │
├──────────────────────────┤  ├───────────────────────────────┤
│ PK  id       BIGSERIAL   │  │ PK  id          BIGSERIAL     │
│ FK  notification_id UUID │  │     notification_id UUID      │
│     recipient_type       │  │     from_status  VARCHAR(20)  │
│     email    VARCHAR(255)│  │     to_status    VARCHAR(20)  │
│     phone    VARCHAR(50) │  │     channel      VARCHAR(20)  │
│     device_token TEXT    │  │     metadata     JSONB        │
│     member_name          │  │     created_at   TIMESTAMPTZ  │
│     status   VARCHAR(20) │  └───────────────────────────────┘
│     created_at TIMESTAMPTZ│
└──────────────────────────┘


┌──────────────────────────┐      ┌───────────────────────────────────┐
│    recipient_groups      │      │  customer_channel_preferences     │
├──────────────────────────┤      │  FILLFACTOR = 90                  │
│ PK  id       UUID        │      ├───────────────────────────────────┤
│     name     VARCHAR(255)│      │ PK  id            BIGSERIAL       │
│     description TEXT     │      │     customer_id   VARCHAR(100)    │
│     is_active  BOOLEAN   │      │     channel       VARCHAR(20)     │
│     created_at TIMESTAMPTZ│     │     is_opted_in   BOOLEAN         │
│     updated_at TIMESTAMPTZ│     │     source_system VARCHAR(50)     │
└──────────────┬───────────┘      │     created_at    TIMESTAMPTZ     │
               │                  │     updated_at    TIMESTAMPTZ     │
               │ 1:N              ├───────────────────────────────────┤
               ▼                  │ UK  (customer_id, channel)        │
┌──────────────────────────┐      └───────────────────────────────────┘
│ recipient_group_members  │
├──────────────────────────┤      ┌───────────────────────────────────┐
│ PK  id       BIGSERIAL   │      │  critical_channel_overrides       │
│ FK  group_id UUID        │      ├───────────────────────────────────┤
│     email    VARCHAR(255)│      │ PK  id            UUID            │
│     phone    VARCHAR(50) │      │     event_type    VARCHAR(100)    │
│     device_token TEXT    │      │     channel       VARCHAR(20)     │
│     member_name          │      │     reason        TEXT             │
│     is_active  BOOLEAN   │      │     is_active     BOOLEAN         │
│     created_at TIMESTAMPTZ│     │     created_by    VARCHAR(100)    │
└──────────────────────────┘      │     updated_by    VARCHAR(100)    │
                                  │     created_at    TIMESTAMPTZ     │
                                  │     updated_at    TIMESTAMPTZ     │
                                  ├───────────────────────────────────┤
                                  │ UK  (event_type, channel)         │
                                  └───────────────────────────────────┘
```

### Data Retention

The `notifications` table is the dominant growth table (~6 GB/month, ~72 GB/year). A scheduled payload purge reclaims storage from large JSONB columns while preserving notification metadata for audit and debugging.

#### Rendered Content Purge

After 90 days (configurable), the `rendered_content` column is set to `NULL`. The notification row itself — including `notification_id`, `event_id`, `rule_id`, `status`, `channel`, `recipient_email`, `dedup_key_hash`, and timestamps — is retained for 1 year for audit and suppression queries. After 1 year, rows are archived to cold storage and eventually deleted after 3 years.

#### Purge Function

`notification_engine_service.purge_notification_content()` is a PL/pgSQL function that performs the purge:

| Parameter | Default | Description |
|---|---|---|
| `p_older_than_days` | 90 | NULL out `rendered_content` on rows older than this |
| `p_batch_size` | 10000 | Process rows in batches to avoid long-running transactions |

**Usage:**

```sql
-- Run with defaults (90 days, 10000 batch)
SELECT notification_engine_service.purge_notification_content();

-- Custom retention period
SELECT notification_engine_service.purge_notification_content(60, 5000);
```

**Returns** a JSONB summary:

```json
{
  "purged_rows": 285714,
  "cutoff": "2025-11-22T02:00:00.000Z",
  "executed_at": "2026-02-20T02:00:00.000Z"
}
```

**Scheduling:** The function is designed to be called by `pg_cron` (e.g., daily at 03:00 UTC), an application-level scheduler, or manually during maintenance windows.

#### Status Log Retention

The `notification_status_log` table grows at ~1.5 GB/month. Rows older than 6 months are eligible for deletion (notification metadata on the `notifications` table is sufficient for long-term audit).

```sql
-- Purge status log entries older than 180 days
DELETE FROM notification_status_log
WHERE created_at < NOW() - INTERVAL '180 days';
```

> **Warning:** **Purge Scheduling**
> Both purge operations should run during off-peak hours to minimize lock contention. The content purge uses batched UPDATE statements to avoid holding long transactions. The status log purge uses batched DELETE with `LIMIT` clauses.

---

## 13. Notification Lifecycle State Machine

Each notification passes through a well-defined set of states from creation to final delivery (or failure). The state machine ensures clear tracking and enables retry logic at each transition point.

### State Diagram

```
  Event       Rules        Recipients     Suppression    Template      Channel       Provider      Delivery
  received    matched      resolved       check          rendered      Router        response      confirmed

                                                                                     ┌──────────┐
                                                                                     │          │
  ┌─────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌────────▼──┐  ┌────┴────┐
  │ PENDING │─▶│PROCESSING │─▶│PROCESSING │─▶│RENDERING  │─▶│DELIVERING │─▶│   SENT    │─▶│DELIVERED│
  └─────────┘  └─────┬─────┘  └───────────┘  └─────┬─────┘  └─────┬─────┘  └───────────┘  └─────────┘
                     │                              │              │
                     │ Suppression                  │ Render       │ Delivery
                     │ triggered                    │ failure      │ failure
                     ▼                              ▼              ▼
               ┌────────────┐               ┌──────────┐   ┌──────────┐
               │ SUPPRESSED │               │  FAILED  │   │  FAILED  │
               │ (terminal)  │               │(terminal)│   │(terminal)│
               └────────────┘               └──────────┘   └─────┬────┘
                                                                  │
                                                                  │ Retry (max 3-5)
                                                                  └─ ─ ─ ─▶ DELIVERING
```

### State Descriptions

| State | Description | Trigger | Terminal |
|---|---|---|---|
| **PENDING** | Notification created by the engine after rule matching. Awaiting processing. | Normalized event consumed, rule matched | No |
| **PROCESSING** | Engine is resolving recipients, checking preferences, evaluating suppression. | Processing begins | No |
| **SUPPRESSED** | Notification suppressed by rule-level dedup, max count, or cooldown policy. | Suppression check triggered | Yes |
| **RENDERING** | Template Service is rendering the message for the target channel. | Recipients resolved, suppression passed | No |
| **DELIVERING** | Channel Router has received the rendered message and is dispatching to provider. | Template rendered, delivery message published | No |
| **SENT** | Provider has accepted the message. Awaiting delivery confirmation. | Provider returns 2xx response | No |
| **DELIVERED** | Provider confirmed delivery to recipient. | Delivery receipt / webhook callback | Yes |
| **FAILED** | Delivery failed after all retry attempts exhausted, or rendering failed. | Max retries exceeded, permanent error, or render failure | Yes |

### Status Update Flow (Asynchronous)

All status transitions are published to the `notifications.status` RabbitMQ exchange as fire-and-forget messages:

```json
{
  "notificationId": "n-af47ac10-58cc-4372-a567-0e02b2c3d479",
  "fromStatus": "PROCESSING",
  "toStatus": "RENDERING",
  "channel": "email",
  "metadata": {},
  "timestamp": "2026-02-20T10:15:31.100Z"
}
```

The engine also updates the `status` column on the `notifications` row synchronously (this is a lightweight single-column UPDATE on the primary key, not a bottleneck). The detailed status log write is the asynchronous part.

---

## 14. Sequence Diagrams

### 14.1 Standard Notification Flow (Happy Path)

```
Event Ingestion      RabbitMQ         Notification Engine       Template Service     Channel Router     Audit Service
     │                  │                     │                        │                    │                  │
     │  Publish to      │                     │                        │                    │                  │
     │  events.         │                     │                        │                    │                  │
     │  normalized      │                     │                        │                    │                  │
     │─────────────────▶│                     │                        │                    │                  │
     │                  │  Deliver to          │                        │                    │                  │
     │                  │  q.engine.events.*   │                        │                    │                  │
     │                  │────────────────────▶│                        │                    │                  │
     │                  │                     │  Query active rules     │                    │                  │
     │                  │                     │  for eventType          │                    │                  │
     │                  │                     │──────┐                  │                    │                  │
     │                  │                     │      │ PostgreSQL       │                    │                  │
     │                  │                     │◄─────┘ (or cache)      │                    │                  │
     │                  │                     │                        │                    │                  │
     │                  │                     │  Evaluate conditions    │                    │                  │
     │                  │                     │  Resolve recipients     │                    │                  │
     │                  │                     │                        │                    │                  │
     │                  │                     │  Lookup customer prefs  │                    │                  │
     │                  │                     │  by customer_id         │                    │                  │
     │                  │                     │  (cache or DB)          │                    │                  │
     │                  │                     │──────┐                  │                    │                  │
     │                  │                     │      │ Pref cache/DB    │                    │                  │
     │                  │                     │◄─────┘                  │                    │                  │
     │                  │                     │                        │                    │                  │
     │                  │                     │  Lookup critical        │                    │                  │
     │                  │                     │  overrides by           │                    │                  │
     │                  │                     │  event_type (cache)     │                    │                  │
     │                  │                     │                        │                    │                  │
     │                  │                     │  Compute effective      │                    │                  │
     │                  │                     │  channels (prefs ∪      │                    │                  │
     │                  │                     │  overrides)             │                    │                  │
     │                  │                     │                        │                    │                  │
     │                  │                     │  Evaluate suppression   │                    │                  │
     │                  │                     │                        │                    │                  │
     │                  │                     │  POST /templates/      │                    │                  │
     │                  │                     │  :id/render             │                    │                  │
     │                  │                     │───────────────────────▶│                    │                  │
     │                  │                     │  200 OK (rendered)      │                    │                  │
     │                  │                     │◄───────────────────────│                    │                  │
     │                  │                     │                        │                    │                  │
     │                  │                     │  INSERT notification    │                    │                  │
     │                  │                     │──────┐                  │                    │                  │
     │                  │                     │      │ PostgreSQL       │                    │                  │
     │                  │                     │◄─────┘                  │                    │                  │
     │                  │                     │                        │                    │                  │
     │                  │  Publish to          │                        │                    │                  │
     │                  │  notifications.      │                        │                    │                  │
     │                  │  deliver             │                        │                    │                  │
     │                  │◄────────────────────│                        │                    │                  │
     │                  │                     │                        │                    │                  │
     │                  │  Publish status      │                        │                    │                  │
     │                  │  (fire-and-forget)   │                        │                    │                  │
     │                  │◄────────────────────│                        │                    │                  │
     │                  │                     │                        │                    │                  │
     │                  │  ACK event message   │                        │                    │                  │
     │                  │◄────────────────────│                        │                    │                  │
     │                  │                     │                        │                    │                  │
     │                  │  Deliver to          │                        │                    │                  │
     │                  │  q.deliver.*.* ──────┼────────────────────────┼───────────────────▶│                  │
     │                  │                     │                        │                    │                  │
     │                  │  Deliver status to   │                        │                    │                  │
     │                  │  audit.status ───────┼────────────────────────┼────────────────────┼─────────────────▶│
     │                  │                     │                        │                    │                  │
```

### 14.2 Suppression Flow

```
RabbitMQ         Notification Engine                                    PostgreSQL
   │                     │                                                  │
   │  Event message      │                                                  │
   │────────────────────▶│                                                  │
   │                     │  Query rules for eventType                       │
   │                     │─────────────────────────────────────────────────▶│
   │                     │  Rules returned                                  │
   │                     │◄─────────────────────────────────────────────────│
   │                     │                                                  │
   │                     │  Rule has suppression config                     │
   │                     │  Resolve dedup key: SHA-256 hash                 │
   │                     │                                                  │
   │                     │  Suppression query:                              │
   │                     │  SELECT ... FROM notifications                   │
   │                     │  WHERE rule_id = :ruleId                         │
   │                     │    AND dedup_key_hash = :hash                    │
   │                     │    AND status != 'FAILED'                        │
   │                     │    AND created_at >= NOW() - INTERVAL '...'      │
   │                     │─────────────────────────────────────────────────▶│
   │                     │  Matching rows returned                          │
   │                     │◄─────────────────────────────────────────────────│
   │                     │                                                  │
   │                     │  ┌─────────────────────────────────────────┐     │
   │                     │  │ Evaluate modes:                         │     │
   │                     │  │  dedup: row exists within window? YES   │     │
   │                     │  │  → SUPPRESS                             │     │
   │                     │  └─────────────────────────────────────────┘     │
   │                     │                                                  │
   │  Publish status:    │                                                  │
   │  SUPPRESSED         │                                                  │
   │  (fire-and-forget)  │                                                  │
   │◄────────────────────│                                                  │
   │                     │                                                  │
   │  ACK event message  │                                                  │
   │◄────────────────────│  (no notification row created)                   │
```

### 14.3 Multi-Rule, Multi-Channel Flow

```
Event: order.shipped
    │
    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Rule A (priority=10): "Customer Shipping Notification"                     │
│  Conditions: customerEmail exists, sourceId in [oms, magento]               │
│  Actions:                                                                   │
│    [1] template=tpl-shipped, channels=[email,sms,push], recipient=customer  │
│    [2] template=tpl-shipped-ops, channels=[email], recipient=group:ops-team │
├─────────────────────────────────────────────────────────────────────────────┤
│  Rule B (priority=20): "VIP Order Alert" (exclusive=false)                  │
│  Conditions: totalAmount >= 500                                             │
│  Actions:                                                                   │
│    [1] template=tpl-vip-alert, channels=[email], recipient=group:vip-team   │
└─────────────────────────────────────────────────────────────────────────────┘

Results for order.shipped event (totalAmount=750):
  Both Rule A and Rule B match (neither is exclusive)

  Rule A, Action 1:
    → Render tpl-shipped for [email, sms, push]     (3 parallel render calls)
    → Dispatch 3 messages to notifications.deliver:
        notification.deliver.normal.email
        notification.deliver.normal.sms
        notification.deliver.normal.push

  Rule A, Action 2 (delayMinutes=5):
    → Scheduled for 5 minutes later
    → Resolve ops-team group (4 members)
    → Render tpl-shipped-ops for [email]             (1 render call)
    → Dispatch 4 messages to notifications.deliver:
        notification.deliver.normal.email (x4, one per group member)

  Rule B, Action 1:
    → Resolve vip-team group (2 members)
    → Render tpl-vip-alert for [email]               (1 render call)
    → Dispatch 2 messages to notifications.deliver:
        notification.deliver.normal.email (x2, one per group member)

  Total: 9 notification messages dispatched
```

---

## 15. Performance & Scalability

### 15.1 Horizontal Scalability

The Notification Engine is designed as a stateless service that can be horizontally scaled by running multiple instances behind a load balancer. Each instance consumes from the same RabbitMQ queues using the **competing consumers** pattern — RabbitMQ distributes messages in round-robin across connected consumers.

```
                    ┌─────────────────────┐
                    │  events.normalized  │
                    │  (Topic Exchange)   │
                    └──┬──────────────────┘
                       │
              ┌────────┴────────┐
              ▼                 ▼
  ┌──────────────────┐  ┌──────────────────┐
  │ q.engine.events. │  │ q.engine.events. │
  │   critical       │  │   normal         │
  └──┬───┬───┬───┬───┘  └──┬───┬──────────┘
     │   │   │   │         │   │
     ▼   ▼   ▼   ▼         ▼   ▼
   ┌───┐┌───┐┌───┐┌───┐ ┌───┐┌───┐
   │C1 ││C2 ││C3 ││C4 │ │C5 ││C6 │    Instance 1 (4 crit + 2 norm)
   └───┘└───┘└───┘└───┘ └───┘└───┘
   ┌───┐┌───┐┌───┐┌───┐ ┌───┐┌───┐
   │C7 ││C8 ││C9 ││C10│ │C11││C12│    Instance 2 (4 crit + 2 norm)
   └───┘└───┘└───┘└───┘ └───┘└───┘

   Total: 8 critical consumers, 4 normal consumers
   Throughput roughly doubles with 2 instances
```

**Scaling considerations:**

| Concern | Approach |
|---|---|
| **Stateless processing** | No shared in-memory state between instances (rule cache is per-instance, warmed independently) |
| **Database connection pooling** | Each instance maintains its own connection pool (default: 10 connections). Scale instances but monitor total pool usage against PostgreSQL `max_connections`. |
| **Template Service load** | Horizontal scaling increases HTTP load on Template Service. Template Service caches compiled templates in-memory, so it handles increased load efficiently. |
| **RabbitMQ consumer balance** | RabbitMQ's round-robin distribution ensures even load across consumers. Set `prefetch` appropriately to prevent one slow consumer from starving others. |

### 15.2 High-Growth Tables & Free Space Strategy

The `notifications` and `notification_recipients` tables experience frequent `status` UPDATE operations as notifications progress through their lifecycle. Without proper free space management, these updates cause **table bloat** through dead tuples and degrade query performance over time.

#### FILLFACTOR Configuration

PostgreSQL's `FILLFACTOR` setting reserves free space within each data page for in-page (HOT) updates, avoiding the need to create new heap tuples in different pages and the associated index entry overhead.

| Table | FILLFACTOR | Rationale |
|---|---|---|
| `notifications` | **80** | Each row receives 3-5 status UPDATEs (PENDING→PROCESSING→RENDERING→DELIVERING→SENT→DELIVERED). 20% free space per page allows most updates as HOT updates (no new index entries). |
| `notification_recipients` | **85** | Each row receives 1-2 status UPDATEs. 15% free space is sufficient. |
| `notification_status_log` | 100 (default) | Append-only — no UPDATEs. Full page utilization is optimal. |
| `notification_rules` | 100 (default) | Very small table, rarely updated. Default is fine. |
| `recipient_groups` | 100 (default) | Very small table, rarely updated. |
| `recipient_group_members` | 100 (default) | Small table, minimal updates. |
| `customer_channel_preferences` | **90** | Moderate update frequency (webhook-driven upserts). 10% free space. |
| `critical_channel_overrides` | 100 (default) | Tiny table (<100 rows), rarely updated. |

#### VACUUM Tuning

Aggressive autovacuum settings for high-growth tables prevent dead tuple accumulation:

```sql
-- notifications table: vacuum aggressively
ALTER TABLE notifications SET (
  autovacuum_vacuum_scale_factor = 0.02,    -- vacuum when 2% of rows are dead (default 20%)
  autovacuum_analyze_scale_factor = 0.01,   -- analyze when 1% of rows change (default 10%)
  autovacuum_vacuum_cost_delay = 2          -- faster vacuum execution (default 20ms)
);

-- notification_status_log: append-only but very fast growth
ALTER TABLE notification_status_log SET (
  autovacuum_vacuum_scale_factor = 0.05,    -- vacuum when 5% of rows are dead
  autovacuum_analyze_scale_factor = 0.02    -- analyze when 2% of rows change
);

-- notification_recipients: moderate update pattern
ALTER TABLE notification_recipients SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);
```

#### Growth Estimates

| Table | Rows/Month | Size/Month | Size/Year | Primary Driver |
|---|---|---|---|---|
| `notifications` | ~10M | ~6 GB | ~72 GB | 1 row per recipient per channel per event |
| `notification_status_log` | ~40M | ~1.5 GB | ~18 GB | 3-6 transitions per notification |
| `notification_recipients` | ~3M | ~500 MB | ~6 GB | Group/custom recipients (customer recipients stored on notifications row) |
| `customer_channel_preferences` | ~100K | ~10 MB | ~120 MB | Customer opt-in/opt-out changes (webhook-driven) |
| `critical_channel_overrides` | <100 | <1 MB | <1 MB | Admin-managed forced-channel rules |
| `notification_rules` | ~100 | <1 MB | <1 MB | Admin-managed rules |
| `recipient_groups` | ~50 | <1 MB | <1 MB | Admin-managed groups |

### 15.3 Suppression Query Optimization

The suppression query is on the critical path for every notification with a `suppression` configuration. It must execute in <5ms to avoid impacting throughput. The primary challenge is that it queries the `notifications` table, which is the largest and fastest-growing table.

#### Index-Only Scan Strategy

The partial composite index includes `status` as an INCLUDE column:

```sql
CREATE INDEX idx_notifications_suppression
ON notifications (rule_id, dedup_key_hash, created_at DESC)
INCLUDE (status)
WHERE dedup_key_hash IS NOT NULL AND status != 'FAILED';
```

This enables **index-only scans** — PostgreSQL can answer the suppression query entirely from the index without touching the heap (table data pages). The `WHERE dedup_key_hash IS NOT NULL AND status != 'FAILED'` partial condition keeps the index small by excluding:
- Notifications without suppression (no dedup key) — the majority
- Failed notifications — excluded from suppression logic

**Expected index size:** ~15% of the full `notifications` table size (only rows with dedup keys and non-FAILED status).

#### Lightweight Suppression Log (High-Throughput Option)

For very high-throughput deployments (>1M notifications/day) where even the partial index becomes large, a dedicated lightweight `suppression_log` table can replace the suppression query against `notifications`:

```sql
CREATE TABLE suppression_log (
  id            BIGSERIAL PRIMARY KEY,
  rule_id       UUID NOT NULL,
  dedup_key_hash CHAR(64) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suppression_log_lookup
ON suppression_log (rule_id, dedup_key_hash, created_at DESC);
```

This table contains only the three columns needed for suppression lookups — no JSONB, no VARCHAR recipient fields, no rendered content. Each row is ~100 bytes compared to ~600+ bytes in the `notifications` table. The suppression query runs against this minimal table instead of the full `notifications` table.

**Trade-off:** An additional INSERT per non-suppressed notification. The INSERT is lightweight (3 columns, indexed) and can be batched or made asynchronous.

> **Info:** **Choosing the Right Strategy**
>
> Use the **partial index on `notifications`** (default) for most deployments. It provides excellent performance with no additional write overhead. Switch to the **dedicated `suppression_log` table** only if monitoring shows suppression query latency exceeding 5ms at sustained high throughput, or if the `notifications` table exceeds 100M rows and the partial index becomes too large for the available memory.

### 15.4 Template Service Call Optimization

The synchronous HTTP call to the Template Service is the most latency-sensitive operation in the pipeline. Optimizations:

| Optimization | Description |
|---|---|
| **Connection pooling** | Use a persistent HTTP connection pool (keep-alive) to the Template Service. Eliminates TCP/TLS handshake overhead per request. |
| **Parallel rendering** | When an action targets multiple channels, render all channels in parallel (`Promise.all`). |
| **Timeout + circuit breaker** | 5-second timeout per render call. Circuit breaker opens after 5 consecutive failures (60-second reset). |
| **Template Service caching** | The Template Service caches compiled Handlebars templates in memory — rendering is CPU-bound, not I/O-bound. Template lookups are O(1). |

### 15.5 Preference & Override Cache Strategy

The channel resolution step (Section 5.2) requires two lookups per recipient: customer preferences and critical overrides. Both are cached to avoid database queries on the critical path.

#### Customer Preferences Cache (TTL-based, read-through)

Customer preferences use a TTL-based read-through cache with LRU eviction. The dataset is too large (~100K customers) for full eager loading, but the top ~50% of active customers drive 90%+ of notifications — making LRU caching highly effective.

| Config Variable | Default | Description |
|---|---|---|
| `PREF_CACHE_ENABLED` | `true` | Enable preference caching |
| `PREF_CACHE_TTL_SECONDS` | `300` | TTL per entry (5 min) |
| `PREF_CACHE_MAX_SIZE` | `50000` | Max entries (LRU eviction) |

**Cache behavior:**

- **Read-through:** On cache miss, query `customer_channel_preferences` by `customer_id`, populate cache, return result.
- **Webhook invalidation:** When a preference upsert is received via `POST /customer-preferences` or `POST /customer-preferences/bulk`, the affected `customer_id` entries are evicted from the local cache immediately.
- **TTL expiry:** Entries expire after `PREF_CACHE_TTL_SECONDS` to handle updates from sources that don't go through the webhook (e.g., direct DB modifications, admin tools).

**Why TTL instead of eager:** The dataset is too large for full eager load. TTL + LRU provides high hit rates for the most frequently notified customers while keeping memory usage bounded.

#### Critical Overrides Cache (eager, event-driven invalidation)

Critical overrides use an eager in-memory cache loaded at startup. The dataset is tiny (<100 rows) and always fits in memory.

| Config Variable | Default | Description |
|---|---|---|
| `OVERRIDE_CACHE_ENABLED` | `true` | Enable override caching |

**Cache behavior:**

- **Eager load:** On startup, query all rows from `critical_channel_overrides WHERE is_active = true` and build an in-memory `Map<eventType, channel[]>`.
- **Event-driven invalidation:** When overrides are created, updated, or deleted via the REST API, the engine publishes an invalidation event to `config.events` exchange with routing key `config.override.changed`. All engine instances consume this event via `q.config.override-cache` queue and reload the full override set from the database.
- **Lookup:** O(1) map lookup by `eventType` — returns an array of forced channels or empty array if no overrides exist.

---

## 16. Error Handling & Dead Letters

### Error Categories

| Category | Handling | Retry | Status |
|---|---|---|---|
| **No matching rules** | ACK message, log at debug level | No | — (no notification created) |
| **Condition evaluation error** | Log warning, skip rule, continue with other rules | No | — |
| **Recipient resolution failure** | Log error, mark notification FAILED | No | FAILED |
| **Suppression query failure** | Allow notification to proceed (fail-open for suppression) | No | — (continues) |
| **Template rendering failure (4xx)** | Mark notification FAILED, log error with template ID | No | FAILED |
| **Template rendering failure (5xx)** | Retry with exponential backoff | Yes (3x) | FAILED after max retries |
| **Template Service unavailable** | NACK + requeue, retry with backoff | Yes (3x) | FAILED after max retries |
| **RabbitMQ publish failure** | Retry publish with backoff; NACK if persistent | Yes (3x) | FAILED after max retries |
| **Database error (transient)** | Retry with exponential backoff | Yes (3x) | — |
| **Database error (persistent)** | NACK message, dead-letter after max retries | Yes (DLQ) | — |

### Dead-Letter Queue Strategy

- **DLQ Exchange:** `notifications.dlq` (fanout)
- **Configuration:** Both engine queues declare `x-dead-letter-exchange: notifications.dlq`
- **Trigger:** Messages are dead-lettered after 3 failed delivery attempts (tracked via `x-death` headers)
- **Monitoring:** DLQ depth is exposed in the `/health` endpoint and as a Prometheus metric

### Retry Configuration

| Parameter | Value | Description |
|---|---|---|
| `maxRetries` | 3 | Maximum retry attempts before dead-lettering |
| `initialDelay` | 1000 ms | First retry delay |
| `backoffMultiplier` | 3x | Exponential backoff multiplier |
| `maxDelay` | 30,000 ms | Maximum delay between retries |

> **Warning:** **Fail-Open Suppression**
> If the suppression query fails (database timeout, connection error), the notification is **allowed to proceed** rather than being suppressed. This fail-open strategy prioritizes notification delivery over suppression accuracy — it is better to occasionally send a duplicate notification than to silently drop a legitimate one. Suppression query failures are logged and alerted.

---

## 17. Monitoring & Health Checks

### Key Metrics

| Metric | Description | Alert Threshold |
|---|---|---|
| `engine_events_consumed_total` | Total events consumed (by priority) | — |
| `engine_rules_matched_total` | Total rule matches (by eventType, ruleId) | — |
| `engine_notifications_created_total` | Total notifications created (by channel, priority) | — |
| `engine_notifications_suppressed_total` | Total notifications suppressed (by ruleId, mode) | — |
| `engine_notifications_failed_total` | Total notifications failed (by channel, reason) | > 10/min |
| `engine_template_render_duration_ms` | Template rendering latency (p50, p95, p99) | p99 > 500ms |
| `engine_suppression_query_duration_ms` | Suppression query latency (p50, p95, p99) | p99 > 5ms |
| `engine_rule_evaluation_duration_ms` | Rule evaluation latency per event (p50, p95, p99) | p99 > 50ms |
| `engine_pipeline_duration_ms` | Full pipeline processing latency per event (p50, p95, p99) | p99 > 2000ms |
| `engine_queue_depth` | Current queue depth per queue | > 1000 (critical), > 5000 (normal) |
| `engine_consumer_lag` | Consumer lag (messages behind) | > 5000 |
| `engine_dlq_depth` | Dead-letter queue depth | > 0 |
| `engine_db_pool_active` | Active database connections | > 80% of pool |
| `engine_rule_cache_hit_rate` | Rule cache hit ratio (when `RULE_CACHE_ENABLED=true`) | < 90% |
| `engine_template_service_circuit_state` | Circuit breaker state (closed/open/half-open) | open |
| `engine_pref_cache_hit_total` | Preference cache hits (by result: hit/miss) | — |
| `engine_pref_cache_size` | Current preference cache entry count | — |
| `engine_override_cache_size` | Current override cache entry count | — |
| `engine_preference_lookup_duration_ms` | Preference lookup latency (p50, p95, p99) | p99 > 10ms |
| `engine_channels_overridden_total` | Notifications where critical override added channels | — |
| `engine_channels_filtered_total` | Channels removed due to customer opt-out | — |

### Structured Logging

All log entries use structured JSON format with standard fields:

```json
{
  "timestamp": "2026-02-20T10:15:31.100Z",
  "level": "info",
  "service": "notification-engine-service",
  "correlationId": "corr-8f14e45f-ceea-467f-a8f5-5f1b39e5c7e2",
  "notificationId": "n-af47ac10-58cc-4372-a567-0e02b2c3d479",
  "eventId": "af47ac10b-58cc-4372-a567-0e02b2c3d479",
  "ruleId": "r-550e8400-e29b-41d4-a716-446655440000",
  "eventType": "order.shipped",
  "channel": "email",
  "message": "Notification rendered and dispatched successfully",
  "durationMs": 125
}
```

> **Info:** **Prometheus + Grafana:** All metrics are exposed via a `/metrics` endpoint in Prometheus format. A pre-configured Grafana dashboard provides real-time visibility into event throughput, rule matching rates, suppression rates, template rendering latency, notification dispatch rates, queue depths, and consumer health. Alerts are configured in Grafana for critical thresholds.

---

## 18. Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3152` | HTTP server port |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `RABBITMQ_URL` | — | RabbitMQ connection string (AMQP) |
| `RABBITMQ_PREFETCH_CRITICAL` | `5` | Per-consumer prefetch for critical queue |
| `RABBITMQ_PREFETCH_NORMAL` | `10` | Per-consumer prefetch for normal queue |
| `CRITICAL_CONSUMERS` | `4` | Number of consumers for critical queue |
| `NORMAL_CONSUMERS` | `2` | Number of consumers for normal queue |
| `RULE_CACHE_ENABLED` | `false` | Enable eager rule cache with event-driven invalidation via RabbitMQ. When `false`, every rule lookup queries PostgreSQL directly. |
| `TEMPLATE_SERVICE_URL` | `http://template-service:3153` | Template Service base URL |
| `TEMPLATE_SERVICE_TIMEOUT_MS` | `5000` | Template rendering HTTP timeout |
| `TEMPLATE_SERVICE_CB_THRESHOLD` | `5` | Circuit breaker failure threshold for Template Service |
| `TEMPLATE_SERVICE_CB_RESET_MS` | `60000` | Circuit breaker reset timeout |
| `DB_POOL_SIZE` | `10` | PostgreSQL connection pool size per instance |
| `DLQ_MAX_RETRIES` | `3` | Maximum retries before dead-lettering |
| `RETRY_INITIAL_DELAY_MS` | `1000` | Initial retry delay in milliseconds |
| `RETRY_BACKOFF_MULTIPLIER` | `3` | Exponential backoff multiplier |
| `RETRY_MAX_DELAY_MS` | `30000` | Maximum retry delay in milliseconds |
| `LOG_LEVEL` | `info` | Logging level (`debug`, `info`, `warn`, `error`) |
| `HEALTH_CHECK_INTERVAL_MS` | `30000` | Health check polling interval |
| `CONTENT_PURGE_DAYS` | `90` | Days before rendered content is purged from notifications table |
| `STATUS_LOG_RETENTION_DAYS` | `180` | Days before status log entries are eligible for deletion |
| `PREF_CACHE_ENABLED` | `true` | Enable customer preference caching (TTL-based, read-through with LRU eviction) |
| `PREF_CACHE_TTL_SECONDS` | `300` | Cache TTL for preference entries (5 minutes) |
| `PREF_CACHE_MAX_SIZE` | `50000` | Max cached preference entries (LRU eviction when exceeded) |
| `OVERRIDE_CACHE_ENABLED` | `true` | Enable critical override cache (eager load with event-driven invalidation) |
| `PREFERENCE_WEBHOOK_API_KEY` | — | API key for authenticating `POST /customer-preferences` webhook requests (validated via `X-API-Key` header) |

---

*Notification API Documentation v1.0 -- Architecture Team -- 2026*
