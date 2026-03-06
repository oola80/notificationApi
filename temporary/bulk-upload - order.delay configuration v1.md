# bulk-upload / order.delay — Configuration Reference v1

> **Date:** 2026-03-06
> **Purpose:** Documents the current detailed configuration of the event `order.delay` for the source `bulk-upload` across all services (mappings, templates, rules, channels), and provides the database scripts to recreate it.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Data Flow](#2-data-flow)
3. [Event Mapping (event-ingestion-service)](#3-event-mapping-event-ingestion-service)
4. [Template (template-service)](#4-template-template-service)
5. [Notification Rule (notification-engine-service)](#5-notification-rule-notification-engine-service)
6. [Channels & Provider Adapters (channel-router-service)](#6-channels--provider-adapters-channel-router-service)
7. [Bulk Upload Service — Event Submission](#7-bulk-upload-service--event-submission)
8. [Sample Event Payload](#8-sample-event-payload)
9. [Database Recreation Scripts](#9-database-recreation-scripts)

---

## 1. Overview

| Attribute | Value |
|---|---|
| **Event Type** | `order.delay` |
| **Source ID** | `bulk-upload` |
| **Priority** | `normal` |
| **Channels** | `email`, `whatsapp` |
| **Template Slug** | `order-delay` |
| **Rule Name** | `Order Delay — Email + WhatsApp` |
| **WhatsApp Meta Template** | `order_delay` (language: `es_MX`) |
| **Email Provider** | Mailgun (`mailgun-primary`, domain: `distelsa.info`) |
| **WhatsApp Provider** | Meta Cloud API (`meta-whatsapp`) |

---

## 2. Data Flow

```
XLSX file (test-order-delay.xlsx)
  |
  v
bulk-upload-service (:3158)
  Parses XLSX, groups rows by orderId
  Sends sourceId="bulk-upload", eventType="order.delay"
  |
  v  HTTP POST /webhooks/events
event-ingestion-service (:3151)
  Looks up mapping for (source_id="bulk-upload", event_type="order.delay")
  Normalizes payload via field_mappings (identity/direct transforms)
  Publishes to xch.events.normalized [event.normal.order.delay]
  |
  v  RabbitMQ (q.engine.events.normal)
notification-engine-service (:3152)
  Matches rule: eventType="order.delay" -> actions: [email, whatsapp]
  Resolves recipients (recipientType="customer")
  Calls template-service to render template "order-delay"
  Dispatches to channel-router-service
  |
  v  RabbitMQ (xch.notifications.deliver)
channel-router-service (:3154)
  Routes email   -> adapter-mailgun  (:3171)
  Routes whatsapp -> adapter-whatsapp (:3173)
  |
  v
adapter-mailgun: Sends rendered HTML email via Mailgun API
adapter-whatsapp: Sends Meta template message (type="template", template="order_delay", lang="es_MX")
```

---

## 3. Event Mapping (event-ingestion-service)

**Database:** `event_ingestion_service.event_mappings`

The event mapping defines how the raw payload from `bulk-upload` is normalized. Since the bulk-upload service already sends the payload in the canonical format (flat key-value pairs matching the template variables), the field mappings use **direct (identity) transforms** — each source field maps to itself.

| Attribute | Value |
|---|---|
| **source_id** | `bulk-upload` |
| **event_type** | `order.delay` |
| **name** | `Bulk Upload — Order Delay` |
| **priority** | `normal` |
| **is_active** | `true` |

### Field Mappings (JSONB)

The `field_mappings` column contains a JSON object where each key is the normalized field name, with `source` pointing to the incoming payload field path and `transform` set to `direct` (default):

```json
{
  "customerEmail": {
    "source": "customerEmail",
    "target": "customerEmail",
    "required": true
  },
  "customerName": {
    "source": "customerName",
    "target": "customerName",
    "required": true
  },
  "orderId": {
    "source": "orderId",
    "target": "orderId",
    "required": true
  },
  "phone": {
    "source": "phone",
    "target": "phone",
    "required": false
  },
  "message": {
    "source": "message",
    "target": "message",
    "required": false
  },
  "items": {
    "source": "items",
    "target": "items",
    "required": false
  },
  "promiseDate": {
    "source": "promiseDate",
    "target": "promiseDate",
    "required": false
  },
  "trackingURL": {
    "source": "trackingURL",
    "target": "trackingURL",
    "required": false
  },
  "trackingNumber": {
    "source": "trackingNumber",
    "target": "trackingNumber",
    "required": false
  },
  "customerId": {
    "source": "customerId",
    "target": "customerId",
    "required": false
  },
  "images": {
    "source": "images",
    "target": "images",
    "required": false
  },
  "carrierId": {
    "source": "carrierId",
    "target": "carrierId",
    "required": false
  }
}
```

> **Note:** The mapping was created via the admin UI or the `POST /event-mappings` API endpoint at runtime. There is no SQL seed script for this mapping in the repository — it exists only in the database.

---

## 4. Template (template-service)

**Database:** `template_service.templates`, `template_service.template_versions`, `template_service.template_channels`, `template_service.template_variables`

**Seed Script:** `template-service/dbscripts/seed-order-delay-template.sql`

| Attribute | Value |
|---|---|
| **Slug** | `order-delay` |
| **Name** | `Order Delay Notification` |
| **Description** | Template for notifying customers about order delays. Channels: email, whatsapp. |
| **Status** | Active (`is_active = true`) |
| **Version** | 1 |
| **Created By** | `seed-script` |

### 4.1 WhatsApp Channel

| Attribute | Value |
|---|---|
| **Channel** | `whatsapp` |
| **Subject** | `NULL` |
| **Body** | `Hola {{customerName}}, lamentamos informarle que su orden {{orderId}} se encuentra retrasada.` |

**Metadata (JSONB):** Contains Meta Cloud API template configuration used by adapter-whatsapp:

```json
{
  "metaTemplateName": "order_delay",
  "metaTemplateLanguage": "es_MX",
  "metaTemplateParameters": [
    { "name": "customer_name", "field": "customerName" },
    { "name": "order_id", "field": "orderId" }
  ]
}
```

- `metaTemplateName` — The template name registered in Meta Business Manager (NOT the internal template UUID).
- `metaTemplateLanguage` — Language code for the Meta template (`es_MX` = Spanish Mexico).
- `metaTemplateParameters` — Maps Meta placeholder names to event payload fields. The notification-engine-service resolves `field` values from the event payload to produce `{ name, value }` pairs for the Meta API.

### 4.2 Email Channel

| Attribute | Value |
|---|---|
| **Channel** | `email` |
| **Subject** | `Aviso de retraso en su orden {{orderId}}` |

**Body:** Full HTML email template (Spanish) with:
- Red header banner: "Aviso de retraso en su orden"
- Customer greeting: `Hola {{customerName}}`
- Delay message: `{{message}}`
- Items table (Handlebars `{{#each items}}`): Producto, Cantidad columns
- Estimated delivery date: `{{promiseDate}}`
- Conditional tracking link: `{{#if trackingURL}}` with `{{trackingNumber}}`
- Footer: "Este es un mensaje automatico, por favor no responda a este correo."

### 4.3 Template Variables

| Variable | Required | Description |
|---|---|---|
| `customerName` | Yes | Customer full name |
| `orderId` | Yes | Order identifier |
| `message` | No | Delay reason or additional message |
| `items` | No | Array of order items (`name`, `quantity`) |
| `promiseDate` | No | Estimated delivery date |
| `trackingURL` | No | Tracking URL for the shipment |
| `trackingNumber` | No | Carrier tracking number |

---

## 5. Notification Rule (notification-engine-service)

**Database:** `notification_engine_service.notification_rules`

**Seed Script:** `notification-engine-service/dbscripts/seed-order-delay-data.sh` (creates template via API, then creates the rule)

| Attribute | Value |
|---|---|
| **Name** | `Order Delay — Email + WhatsApp` |
| **Event Type** | `order.delay` |
| **Delivery Priority** | `normal` |
| **Priority** | `100` |
| **Is Exclusive** | `false` |
| **Is Active** | `true` |
| **Created By** | `seed-script` |

### Actions (JSONB array)

```json
[
  {
    "templateId": "<UUID of order-delay template>",
    "channels": ["email", "whatsapp"],
    "recipientType": "customer"
  }
]
```

- **templateId** — Dynamic reference to the `order-delay` template (UUID assigned at creation time).
- **channels** — Both `email` and `whatsapp` channels are triggered for every `order.delay` event.
- **recipientType** — `customer` means the notification-engine resolves the recipient from the event payload fields (`customerEmail`, `phone`).

---

## 6. Channels & Provider Adapters (channel-router-service)

**Database:** `channel_router_service.provider_configs`

The channel-router-service routes delivery requests to registered provider adapters. For `order.delay`, two providers are registered:

### 6.1 Email — Mailgun Adapter

| Attribute | Value |
|---|---|
| **Provider Name** | `Mailgun` |
| **Provider ID** | `mailgun-primary` |
| **Channel** | `email` |
| **Adapter URL** | `http://localhost:3171` |
| **Routing Weight** | `100` |
| **Is Active** | `true` |

The adapter-mailgun sends pre-rendered HTML email (from template-service) via the Mailgun API. Domain: `distelsa.info`, region: `us`.

### 6.2 WhatsApp — Meta Cloud API Adapter

| Attribute | Value |
|---|---|
| **Provider Name** | `Meta WhatsApp` |
| **Provider ID** | `meta-whatsapp` |
| **Channel** | `whatsapp` |
| **Adapter URL** | `http://localhost:3173` |
| **Routing Weight** | `100` |
| **Is Active** | `true` |

The adapter-whatsapp receives the delivery request with `channelMetadata` from the notification-engine dispatch step. It builds a Meta Graph API `type: "template"` message (NOT `type: "text"`):

```json
{
  "messaging_product": "whatsapp",
  "to": "<phone>",
  "type": "template",
  "template": {
    "name": "order_delay",
    "language": { "code": "es_MX" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "<customerName value>" },
          { "type": "text", "text": "<orderId value>" }
        ]
      }
    ]
  }
}
```

---

## 7. Bulk Upload Service — Event Submission

The bulk-upload-service (:3158) parses XLSX files and submits events to the event-ingestion-service:

- **Source ID:** Hardcoded as `"bulk-upload"` in `processing.service.ts`
- **Control Columns:** `eventType`, `cycleId` (extracted from XLSX rows)
- **Event Type:** Taken from the `eventType` column of each row (must be `"order.delay"`)
- **Grouping:** Rows can be grouped by `orderId` (group mode), combining multiple item rows into a single event with an `items` array
- **Source Event ID:** `{uploadId}-group-{eventType}-{groupKeyValue}` (group mode) or `{uploadId}-row-{rowNumber}` (single row mode)

Submitted payload to `POST /webhooks/events`:

```json
{
  "sourceId": "bulk-upload",
  "cycleId": "<from XLSX>",
  "eventType": "order.delay",
  "sourceEventId": "<generated>",
  "timestamp": "<ISO 8601>",
  "payload": {
    "customerEmail": "...",
    "customerName": "...",
    "orderId": "...",
    "phone": "...",
    "message": "...",
    "items": [...],
    "trackingNumber": "...",
    "carrierId": "...",
    "trackingURL": "...",
    "promiseDate": "..."
  }
}
```

---

## 8. Sample Event Payload

From `scripts/test-payload.json`:

```json
{
  "cycleId": "123132",
  "eventType": "order.delay",
  "sourceId": "bulk-upload",
  "payload": {
    "customerId": "omar-ola@hotmail7.com",
    "customerEmail": "omar-ola@hotmail.com",
    "customerName": "Omar Ola",
    "orderId": "611214544-A",
    "phone": "50240009954",
    "message": "Lamentamos informarle que su pedido ha sufrido un retraso. Se estara entregando el dia de manana",
    "items": [
      {
        "sku": "RUSH",
        "name": "Ventilador de piso y pared Taurus de 20 pulgadas",
        "quantity": 1,
        "price": 79.99
      }
    ],
    "images": [
      {
        "url": "https://backoffice.max.com.gt/media/catalog/product/cache/94dd7777337ccc7ac42c8ee85d48fab6/r/u/rush.jpg"
      }
    ],
    "trackingNumber": "FD15454",
    "carrierId": "FORZA_GT",
    "trackingURL": "https://www.forzadelivery.com/gt/",
    "promiseDate": "2026-02-25T06:10:00Z"
  }
}
```

---

## 9. Database Recreation Scripts

The following SQL scripts can be run sequentially to recreate the full `order.delay` / `bulk-upload` configuration from scratch. All scripts are idempotent (will fail on duplicate constraints if data already exists).

### 9.1 Event Mapping — event_ingestion_service

```sql
-- =============================================================================
-- Seed: Event Mapping for bulk-upload / order.delay
-- Schema: event_ingestion_service
-- =============================================================================
-- Creates the runtime field mapping that allows the event-ingestion-service
-- to accept and normalize order.delay events from the bulk-upload source.
--
-- Run:
--   psql -U event_ingestion_service_user -d postgres -f seed-mapping-bulk-upload-order-delay.sql
-- =============================================================================

SET search_path TO event_ingestion_service;

INSERT INTO event_mappings (
    source_id,
    event_type,
    name,
    description,
    field_mappings,
    priority,
    is_active,
    created_by,
    updated_by
)
VALUES (
    'bulk-upload',
    'order.delay',
    'Bulk Upload — Order Delay',
    'Identity mapping for order.delay events from the bulk-upload service. All fields pass through with direct transforms.',
    '{
        "customerEmail": {
            "source": "customerEmail",
            "target": "customerEmail",
            "required": true
        },
        "customerName": {
            "source": "customerName",
            "target": "customerName",
            "required": true
        },
        "orderId": {
            "source": "orderId",
            "target": "orderId",
            "required": true
        },
        "phone": {
            "source": "phone",
            "target": "phone",
            "required": false
        },
        "message": {
            "source": "message",
            "target": "message",
            "required": false
        },
        "items": {
            "source": "items",
            "target": "items",
            "required": false
        },
        "promiseDate": {
            "source": "promiseDate",
            "target": "promiseDate",
            "required": false
        },
        "trackingURL": {
            "source": "trackingURL",
            "target": "trackingURL",
            "required": false
        },
        "trackingNumber": {
            "source": "trackingNumber",
            "target": "trackingNumber",
            "required": false
        },
        "customerId": {
            "source": "customerId",
            "target": "customerId",
            "required": false
        },
        "images": {
            "source": "images",
            "target": "images",
            "required": false
        },
        "carrierId": {
            "source": "carrierId",
            "target": "carrierId",
            "required": false
        }
    }'::jsonb,
    'normal',
    true,
    'seed-script',
    'seed-script'
);
```

### 9.2 Template — template_service

```sql
-- =============================================================================
-- Seed: Order Delay Notification Template
-- Schema: template_service
-- =============================================================================
-- Inserts the "order-delay" template with WhatsApp and Email channels.
-- Uses CTEs for deterministic UUID referencing within a single transaction.
--
-- Run:
--   psql -U template_service_user -d postgres -f seed-order-delay-template.sql
--
-- Idempotent: will fail on duplicate slug constraint if already seeded.
-- =============================================================================

SET search_path TO template_service;

BEGIN;

-- Step 1: Insert master template record
WITH ins_template AS (
    INSERT INTO templates (slug, name, description, is_active, created_by, updated_by)
    VALUES (
        'order-delay',
        'Order Delay Notification',
        'Template for notifying customers about order delays. Channels: email, whatsapp.',
        true,
        'seed-script',
        'seed-script'
    )
    RETURNING id
),

-- Step 2: Insert version 1
ins_version AS (
    INSERT INTO template_versions (template_id, version_number, change_summary, created_by)
    SELECT id, 1, 'Initial version', 'seed-script'
    FROM ins_template
    RETURNING id, template_id
),

-- Step 3a: Insert WhatsApp channel (with Meta template metadata)
ins_whatsapp AS (
    INSERT INTO template_channels (template_version_id, channel, subject, body, metadata)
    SELECT id, 'whatsapp', NULL,
        'Hola {{customerName}}, lamentamos informarle que su orden {{orderId}} se encuentra retrasada.',
        '{"metaTemplateName": "order_delay", "metaTemplateLanguage": "es_MX", "metaTemplateParameters": [{"name": "customer_name", "field": "customerName"}, {"name": "order_id", "field": "orderId"}]}'::jsonb
    FROM ins_version
    RETURNING id
),

-- Step 3b: Insert Email channel
ins_email AS (
    INSERT INTO template_channels (template_version_id, channel, subject, body)
    SELECT id, 'email',
        'Aviso de retraso en su orden {{orderId}}',
        '<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aviso de retraso en su orden</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f4; font-family:Arial, Helvetica, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
    <tr>
      <td align="center" style="padding:20px 0;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:8px; overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color:#d9534f; padding:24px 32px; text-align:center;">
              <h1 style="margin:0; color:#ffffff; font-size:22px;">Aviso de retraso en su orden</h1>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px; font-size:16px; color:#333333;">
                Hola <strong>{{customerName}}</strong>,
              </p>
              <p style="margin:0 0 16px; font-size:15px; color:#555555;">
                Lamentamos informarle que su orden <strong>{{orderId}}</strong> se encuentra retrasada.
              </p>
              <p style="margin:0 0 24px; font-size:15px; color:#555555;">
                {{message}}
              </p>

              <!-- Items table -->
              {{#each items}}
              {{#if @first}}
              <table role="presentation" width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse; margin-bottom:24px;">
                <tr style="background-color:#f0f0f0;">
                  <th style="text-align:left; font-size:14px; color:#333333; border-bottom:2px solid #dddddd;">Producto</th>
                  <th style="text-align:center; font-size:14px; color:#333333; border-bottom:2px solid #dddddd;">Cantidad</th>
                </tr>
              {{/if}}
                <tr>
                  <td style="font-size:14px; color:#555555; border-bottom:1px solid #eeeeee;">{{this.name}}</td>
                  <td style="font-size:14px; color:#555555; border-bottom:1px solid #eeeeee; text-align:center;">{{this.quantity}}</td>
                </tr>
              {{#if @last}}
              </table>
              {{/if}}
              {{/each}}

              <p style="margin:0 0 8px; font-size:15px; color:#555555;">
                <strong>Fecha estimada de entrega:</strong> {{promiseDate}}
              </p>

              {{#if trackingURL}}
              <p style="margin:0 0 24px; font-size:15px; color:#555555;">
                <strong>Rastreo:</strong>
                <a href="{{trackingURL}}" style="color:#337ab7; text-decoration:none;">{{trackingNumber}}</a>
              </p>
              {{/if}}

              <p style="margin:0; font-size:14px; color:#999999;">
                Agradecemos su paciencia y comprension.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f9f9f9; padding:16px 32px; text-align:center; font-size:12px; color:#999999;">
              Este es un mensaje automatico, por favor no responda a este correo.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>'
    FROM ins_version
    RETURNING id
),

-- Step 4: Insert template variables
ins_variables AS (
    INSERT INTO template_variables (template_id, variable_name, description, is_required)
    SELECT t.id, v.variable_name, v.description, v.is_required
    FROM ins_template t
    CROSS JOIN (VALUES
        ('customerName',   'Customer full name',                          true),
        ('orderId',        'Order identifier',                            true),
        ('message',        'Delay reason or additional message',          false),
        ('items',          'Array of order items (name, quantity)',        false),
        ('promiseDate',    'Estimated delivery date',                     false),
        ('trackingURL',    'Tracking URL for the shipment',               false),
        ('trackingNumber', 'Carrier tracking number',                     false)
    ) AS v(variable_name, description, is_required)
    RETURNING id
)

-- Step 5: Update current_version_id on the template
UPDATE templates
SET current_version_id = ins_version.id,
    updated_at = NOW()
FROM ins_version
WHERE templates.id = ins_version.template_id;

COMMIT;
```

### 9.3 Notification Rule — notification_engine_service

> **Important:** The rule references the template by UUID. You must first create the template (section 9.2), then retrieve its UUID to insert the rule. Alternatively, use the seed shell script (`notification-engine-service/dbscripts/seed-order-delay-data.sh`) which creates both via the service APIs and wires the template ID automatically.

```sql
-- =============================================================================
-- Seed: Notification Rule for order.delay
-- Schema: notification_engine_service
-- =============================================================================
-- Creates the notification rule that matches order.delay events and dispatches
-- to email + whatsapp channels using the order-delay template.
--
-- PREREQUISITE: Replace <TEMPLATE_UUID> with the actual UUID of the
-- "order-delay" template from template_service.templates.id
--
-- Run:
--   psql -U notification_engine_service_user -d postgres -f seed-rule-order-delay.sql
-- =============================================================================

SET search_path TO notification_engine_service;

INSERT INTO notification_rules (
    name,
    event_type,
    conditions,
    actions,
    suppression,
    delivery_priority,
    priority,
    is_exclusive,
    is_active,
    created_by,
    updated_by
)
VALUES (
    'Order Delay — Email + WhatsApp',
    'order.delay',
    NULL,  -- No additional conditions; matches all order.delay events
    '[{
        "templateId": "<TEMPLATE_UUID>",
        "channels": ["email", "whatsapp"],
        "recipientType": "customer"
    }]'::jsonb,
    NULL,  -- No suppression rules
    'normal',
    100,
    false,
    true,
    'seed-script',
    'seed-script'
);
```

### 9.4 Provider Registrations — channel_router_service

```sql
-- =============================================================================
-- Seed: Provider adapter registrations for order.delay channels
-- Schema: channel_router_service
-- =============================================================================
-- Registers the WhatsApp and Mailgun adapters with the channel-router-service.
-- These are required for the channel-router to know where to forward delivery
-- requests for email and whatsapp channels.
--
-- Alternative: Use the REST API (POST /providers/register) as shown in
-- scripts/run-e2e-whatsapp-pipeline.sh (Steps 3c and 3d).
-- =============================================================================

SET search_path TO channel_router_service;

-- WhatsApp adapter (Meta Cloud API)
INSERT INTO provider_configs (
    provider_name,
    provider_id,
    channel,
    adapter_url,
    is_active,
    routing_weight
)
VALUES (
    'Meta WhatsApp',
    'meta-whatsapp',
    'whatsapp',
    'http://localhost:3173',
    true,
    100
);

-- Email adapter (Mailgun)
INSERT INTO provider_configs (
    provider_name,
    provider_id,
    channel,
    adapter_url,
    is_active,
    routing_weight
)
VALUES (
    'Mailgun',
    'mailgun-primary',
    'email',
    'http://localhost:3171',
    true,
    100
);
```

### 9.5 Shell Script Alternative (API-based seeding)

For environments where the services are already running, use the existing seed script which creates the template and rule via HTTP APIs (automatically wires the template UUID into the rule):

```bash
# Creates template via template-service API, then creates matching rule
bash notification-engine-service/dbscripts/seed-order-delay-data.sh

# Or with custom hosts:
bash notification-engine-service/dbscripts/seed-order-delay-data.sh \
  --template-host localhost:3153 \
  --engine-host localhost:3152
```

For the full pipeline (build, start services, seed all data including provider registrations, upload XLSX):

```bash
bash scripts/run-e2e-whatsapp-pipeline.sh
bash scripts/run-e2e-whatsapp-pipeline.sh --skip-build      # services already built
bash scripts/run-e2e-whatsapp-pipeline.sh --skip-build --skip-seed  # data already seeded
```

---

## Source Files Reference

| Component | File |
|---|---|
| Template SQL seed | `template-service/dbscripts/seed-order-delay-template.sql` |
| Rule + Template API seed | `notification-engine-service/dbscripts/seed-order-delay-data.sh` |
| Template JSON reference | `temporary/seed-template.json` |
| Rule JSON reference | `temporary/seed-rule.json` |
| E2E pipeline script | `scripts/run-e2e-whatsapp-pipeline.sh` |
| Sample payload 1 | `scripts/test-payload.json` |
| Sample payload 2 | `scripts/test-payload2.json` |
| WhatsApp adapter E2E test | `provider-adapters/apps/adapter-whatsapp/test/send-order-delay.e2e-spec.ts` |
| Bulk upload processing | `bulk-upload-service/src/processing/processing.service.ts` |
| EIS mapping engine | `event-ingestion-service/src/normalization/mapping-engine.service.ts` |
| EIS dbscripts (schema) | `event-ingestion-service/dbscripts/event-ingestion-service-dbscripts.sql` |
| NES dbscripts (schema) | `notification-engine-service/dbscripts/notification-engine-service-dbscripts.sql` |
| CRS dbscripts (schema) | `channel-router-service/dbscripts/channel-router-service-dbscripts.sql` |
