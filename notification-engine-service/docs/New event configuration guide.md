# New Event Configuration Guide

Step-by-step guide to configure the notification-engine-service to process a new event type end-to-end. Uses `order.delay` with **email** and **WhatsApp** channels as the running example.

---

## Prerequisites

Before starting, ensure:

- The **event-ingestion-service** already has an event mapping for the source system that produces `order.delay` events (including the `priority` tier: `normal` or `critical`).
- The **template-service** is running and accessible.
- **RabbitMQ** is running with the correct topology imported (`xch.events.normalized`, `xch.notifications.deliver`, etc.).

---

## Step 1 — Create the Template (template-service)

The notification-engine-service calls the template-service at render time. You need a template that supports **both** target channels.

Create a template (e.g., slug `order-delay-v1`) with channel-specific content for:

| Channel   | Required Fields                        |
|-----------|----------------------------------------|
| `email`   | `subject` (e.g., "Your order is delayed") + `body` (Handlebars HTML) |
| `whatsapp`| `body` (Handlebars plain text / WhatsApp template format)            |

The template body can reference any field from the normalized payload using Handlebars syntax, e.g., `{{orderId}}`, `{{customerName}}`, `{{estimatedDeliveryDate}}`.

> **Note:** If the template for a channel does not exist, the pipeline will fail that channel's notification with error `NES-019` (template not found) — other channels will still proceed independently.

---

## Step 2 — Create a Notification Rule

`POST /notification-rules` on the notification-engine-service (port 3152).

This is the **core configuration** — it tells the engine _what to do_ when an `order.delay` event arrives.

### Minimal Example (match all `order.delay` events)

```json
{
  "name": "Order Delay — Customer Notification",
  "description": "Notify the customer via email and WhatsApp when their order is delayed",
  "eventType": "order.delay",
  "conditions": null,
  "actions": [
    {
      "templateId": "order-delay-v1",
      "channels": ["email", "whatsapp"],
      "recipientType": "customer",
      "recipientGroupId": null,
      "customRecipients": null,
      "delayMinutes": 0
    }
  ],
  "suppression": null,
  "deliveryPriority": null,
  "priority": 100,
  "isExclusive": false,
  "isActive": true,
  "createdBy": "admin"
}
```

### Key Fields Explained

| Field | Purpose |
|---|---|
| `eventType` | Must exactly match the `eventType` value in the normalized event message (`"order.delay"`). |
| `conditions` | Filter criteria applied against the normalized payload. `null` = match **all** events of this type. See [Conditions Reference](#conditions-reference) below. |
| `actions` | Array of actions to execute when the rule matches. Each action = one template + channels + recipient target. |
| `actions[].templateId` | The slug/ID of the template created in Step 1. |
| `actions[].channels` | `["email", "whatsapp"]` — the channels to attempt delivery on. |
| `actions[].recipientType` | `"customer"`, `"group"`, or `"custom"` — determines how recipients are resolved (see Step 3). |
| `suppression` | Optional dedup/cooldown/rate-limit config (see Step 6). |
| `deliveryPriority` | If set to `"critical"`, overrides the event's inherent priority for routing. `null` = use the event's original priority. |
| `priority` | Rule evaluation order (lower number = evaluated first). Default `100`. |
| `isExclusive` | If `true`, no further rules are evaluated after this one matches. |

### Conditions Reference

Conditions is a flat JSON object. Keys are field names from the normalized payload. Values are either a literal (shorthand for `$eq`) or an operator object. All conditions are **ANDed**.

```json
{
  "conditions": {
    "delayDays": { "$gt": 3 },
    "country": { "$in": ["US", "CA", "UK"] },
    "orderStatus": "delayed"
  }
}
```

**Supported operators:** `$eq`, `$ne`, `$in`, `$nin`, `$gt`, `$gte`, `$lt`, `$lte`, `$exists`, `$regex`

Multiple operators on the same field are ANDed:

```json
{ "delayDays": { "$gte": 1, "$lte": 7 } }
```

---

## Step 3 — Ensure Recipients Are Resolvable

The `recipientType` in the action determines where contact information comes from.

### Option A: `"customer"` (most common)

The normalized event payload **must** include the relevant contact fields:

| Payload Field     | Maps To              | Required For   |
|-------------------|----------------------|----------------|
| `customerEmail`   | `recipient.email`    | **email**      |
| `customerPhone`   | `recipient.phone`    | **whatsapp**   |
| `customerName`    | `recipient.name`     | Display name   |
| `customerId`      | `recipient.customerId` | Preference lookup |
| `deviceToken`     | `recipient.deviceToken` | push (not needed here) |

For `order.delay` with email + WhatsApp, the normalized payload **must** contain at minimum:
- `customerEmail` — for the email channel
- `customerPhone` — for the WhatsApp channel

> **Important:** If `customerEmail` is missing, the email notification will still be created but will lack a delivery address. Ensure your event-ingestion-service mapping populates these fields.

### Option B: `"group"` (internal teams, ops alerts)

1. Create a recipient group: `POST /recipient-groups`

```json
{
  "name": "Order Ops Team",
  "description": "Operations team notified on order delays",
  "isActive": true,
  "createdBy": "admin"
}
```

2. Add members to the group: `POST /recipient-groups/:groupId/members`

```json
{
  "memberName": "John Doe",
  "email": "john@company.com",
  "phone": "+1234567890",
  "isActive": true,
  "createdBy": "admin"
}
```

3. Reference the group UUID in the rule action:

```json
{
  "recipientType": "group",
  "recipientGroupId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Option C: `"custom"` (inline recipients)

Hardcode recipients directly in the rule action:

```json
{
  "recipientType": "custom",
  "customRecipients": [
    { "name": "Support", "email": "support@company.com", "phone": "+1234567890" }
  ]
}
```

---

## Step 4 — (Optional) Set Up Customer Channel Preferences

If `recipientType` is `"customer"` and the payload includes a `customerId`, the engine checks `customer_channel_preferences` to respect opt-in/opt-out choices.

### How It Works

- If a customer has **no preference records**, all rule-specified channels are used (default opt-in).
- If a customer has `is_opted_in = false` for `email`, the email channel is **filtered out** for that customer.
- If a customer has `is_opted_in = false` for `whatsapp`, the WhatsApp channel is **filtered out**.
- If **all** channels are filtered out, no notification is sent (suppressed with reason `all-channels-opted-out`).

### Ingesting Preferences

Preferences are ingested via webhook:

**Single:** `POST /customer-preferences`
```json
{
  "customerId": "CUST-001",
  "channel": "whatsapp",
  "isOptedIn": false,
  "sourceSystem": "crm"
}
```

**Bulk (up to 1000):** `POST /customer-preferences/bulk`
```json
{
  "preferences": [
    { "customerId": "CUST-001", "channel": "email", "isOptedIn": true },
    { "customerId": "CUST-001", "channel": "whatsapp", "isOptedIn": false }
  ]
}
```

Both endpoints require the `X-API-Key` header.

> **If you don't need preference-based filtering**, you can skip this step entirely. The engine defaults to delivering on all rule-specified channels.

---

## Step 5 — (Optional) Set Up Critical Channel Overrides

Critical channel overrides **force** a specific channel to always be used for a given event type, **bypassing customer opt-out preferences**.

Use case: Regulatory or safety-critical notifications that must always reach the customer regardless of their preferences.

### Create an Override

`POST /critical-channel-overrides`

```json
{
  "eventType": "order.delay",
  "channel": "email",
  "reason": "Regulatory requirement: order delay must always send email",
  "isActive": true,
  "createdBy": "admin"
}
```

### Behavior

- If a customer has opted out of `email`, but there is an active override for `order.delay` + `email`, the email notification **will still be sent**.
- Override channels are merged into the effective channel set **after** preference filtering.
- You can have multiple overrides per event type (e.g., force both `email` and `whatsapp`).

> **If you don't need forced delivery**, skip this step. The rule's `channels` array combined with customer preferences will determine delivery channels.

---

## Step 6 — (Optional) Configure Suppression

Suppression prevents duplicate or excessive notifications. Configure it in the rule's `suppression` field.

### Suppression Config Structure

```json
{
  "suppression": {
    "dedupKey": ["eventType", "orderId", "recipient.email"],
    "modes": [
      { "type": "dedup", "windowMinutes": 60 },
      { "type": "cooldown", "intervalMinutes": 30 },
      { "type": "maxCount", "windowMinutes": 1440, "limit": 5 }
    ]
  }
}
```

### Dedup Key

An array of field names used to generate a unique hash. Fields are resolved from:

| Prefix/Field      | Source |
|--------------------|--------|
| `recipient.email`  | Resolved recipient's email |
| `recipient.phone`  | Resolved recipient's phone |
| `recipient.name`   | Resolved recipient's name |
| `eventType`        | Event type string |
| Any other field    | Normalized event payload |

The resolved values are concatenated with `|` and SHA-256 hashed. **If `dedupKey` is null or empty, all suppression modes are skipped.**

### Suppression Modes

| Mode | Fields | Behavior |
|---|---|---|
| `dedup` | `windowMinutes` (default 60) | Suppresses if a notification with the same rule + dedup hash exists within the time window. |
| `cooldown` | `intervalMinutes` (default 60) | Suppresses if the most recent matching notification was sent less than `intervalMinutes` ago. |
| `maxCount` | `windowMinutes` (default 60), `limit` (default 1) | Suppresses if the count of matching notifications within the window meets or exceeds the limit. |

Modes are evaluated in order; the first one that triggers suppression short-circuits the rest. Failed notifications (`FAILED` status) are excluded from all suppression counts.

### Example for `order.delay`

Prevent the same customer from receiving more than one `order.delay` notification per order within 24 hours:

```json
{
  "suppression": {
    "dedupKey": ["eventType", "orderId", "recipient.email"],
    "modes": [
      { "type": "dedup", "windowMinutes": 1440 }
    ]
  }
}
```

---

## Step 7 — Verify the Normalized Event Payload

Ensure the event-ingestion-service mapping for the source system produces a `normalizedPayload` with all the fields you need. For the `order.delay` example:

```json
{
  "eventId": "evt-abc-123",
  "correlationId": "corr-xyz",
  "sourceId": "source-erp",
  "cycleId": "cycle-2026-02",
  "eventType": "order.delay",
  "priority": "normal",
  "normalizedPayload": {
    "orderId": "ORD-98765",
    "customerEmail": "jane@example.com",
    "customerPhone": "+1555123456",
    "customerName": "Jane Doe",
    "customerId": "CUST-001",
    "delayDays": 5,
    "estimatedDeliveryDate": "2026-03-05",
    "orderTotal": 129.99,
    "country": "US"
  },
  "publishedAt": "2026-02-25T10:30:00Z"
}
```

**Checklist:**

- [ ] `eventType` matches the rule's `eventType` (`"order.delay"`)
- [ ] `customerEmail` present (required for email channel)
- [ ] `customerPhone` present (required for WhatsApp channel)
- [ ] `customerId` present (required for preference lookup; optional if preferences not used)
- [ ] All fields referenced in rule `conditions` are present
- [ ] All fields referenced in `suppression.dedupKey` are present
- [ ] All Handlebars variables used in the template exist in the payload

---

## Summary — Processing Flow

When an `order.delay` event arrives on `q.engine.events.normal` (or `q.engine.events.critical`):

```
1. Consumer receives NormalizedEventMessage
2. Pipeline looks up rules where eventType = "order.delay" (from cache or DB)
3. For each matching rule:
   a. Resolve delivery priority (rule override or event default)
   b. Resolve recipients (customer from payload / group from DB / custom inline)
   c. For each recipient:
      - Resolve effective channels:
        rule channels (email, whatsapp)
        → minus opted-out channels (from customer preferences)
        → plus forced channels (from critical overrides)
      - For each effective channel:
        i.   Evaluate suppression → skip if suppressed
        ii.  Create notification record (status: PENDING)
        iii. Transition → PROCESSING
        iv.  Render template via template-service HTTP call
        v.   Transition → RENDERING, save rendered content
        vi.  Transition → DELIVERING
        vii. Publish DeliverMessage to xch.notifications.deliver
             routing key: notification.deliver.{priority}.{channel}
        viii.Transition → SENT (optimistic)
4. channel-router-service picks up the message and delivers via provider
5. Status callback (DELIVERED/FAILED) arrives on q.engine.status.inbound
6. Final transition → DELIVERED or FAILED
```

---

## Quick Reference — Required Config per Step

| # | What | Where | Required? |
|---|---|---|---|
| 1 | Template with email + whatsapp channel content | template-service | **Yes** |
| 2 | Notification rule for `order.delay` | `notification_rules` table | **Yes** |
| 3 | Recipient contact info in payload or recipient group | Event payload or `recipient_groups` + `recipient_group_members` | **Yes** |
| 4 | Customer channel preferences | `customer_channel_preferences` table | No (default: all channels) |
| 5 | Critical channel overrides | `critical_channel_overrides` table | No (only for forced delivery) |
| 6 | Suppression config | Rule's `suppression` JSON field | No (default: no suppression) |
| 7 | Normalized payload with all referenced fields | event-ingestion-service mapping | **Yes** |
