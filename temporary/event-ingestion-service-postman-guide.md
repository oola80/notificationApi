# Event Ingestion Service — Postman Guide

Base URL: `http://localhost:3151`

## Prerequisites

1. The **event-ingestion-service** is running on port 3151
2. PostgreSQL is running with the `event_ingestion_service` schema created
3. RabbitMQ is running (required for publishing events)
4. Import the file `event-ingestion-service.postman_collection.json` into Postman

## Collection Variables

The collection uses these variables (set automatically by test scripts):

| Variable | Purpose | Auto-set by |
|---|---|---|
| `baseUrl` | Service URL (default: `http://localhost:3151`) | Manual (pre-set) |
| `mappingId` | Last created mapping UUID | "Create Mapping — Shopify order.created" |
| `eventId` | Last ingested event UUID | "Send Event — Shopify order.created" |

---

## Step-by-Step Walkthrough

### Step 0 — Verify the service is running

Run **`0. Health & Metrics > Health Check`** (`GET /health`).

Expected response (200):

```json
{
  "status": "ok",
  "checks": {
    "database": { "status": "up" },
    "rabbitmq": { "status": "up" }
  }
}
```

If any check shows `"down"`, fix the dependency before continuing.

---

### Step 1 — Create an event mapping

Before you can ingest events, you need a mapping that tells the service how to transform the source payload into the canonical format.

Run **`1. Event Mappings > Create Mapping — Shopify order.created`** (`POST /api/v1/event-mappings`).

This creates a mapping for `sourceId: "shopify"` + `eventType: "order.created"` with these field extractions:

```
Source payload field  →  Canonical field
─────────────────────────────────────────
id                   →  orderId
customer.id          →  customerId
customer.email       →  email
total_price          →  total
currency             →  currency
line_items           →  items
```

Expected response (201 Created): the full mapping object with a generated UUID `id`.

The test script automatically saves the `id` into the `mappingId` collection variable.

#### Other mapping examples

- **SAP shipment.dispatched (critical)** — shows how to create a `priority: "critical"` mapping. Critical events are routed to a priority queue.
- **with Validation Schema** — shows how to attach a JSON Schema (`validationSchema`) that validates the raw payload before normalization.

---

### Step 2 — Test the mapping (dry run)

Before sending real events, verify your mapping works correctly.

Run **`1. Event Mappings > Test Mapping with Sample Payload`** (`POST /api/v1/event-mappings/:id/test`).

This sends a sample Shopify payload through the normalization engine and returns the transformed output **without** persisting or publishing anything.

Expected response (200): the normalized payload with extracted fields and a `metadata` block:

```json
{
  "orderId": "ORD-98765",
  "customerId": "CUST-555",
  "email": "jane.doe@example.com",
  "phone": "+1-555-0100",
  "total": 249.99,
  "currency": "USD",
  "items": [...],
  "metadata": {
    "eventType": "order.created",
    "timestamp": "2026-02-24T14:30:00Z",
    "priority": "normal",
    ...
  }
}
```

If the output is wrong, update the mapping (`PUT /api/v1/event-mappings/:id`) and test again.

---

### Step 3 — Send a real event via webhook

Now send an actual event through the ingestion pipeline.

Run **`2. Webhook Ingestion > Send Event — Shopify order.created`** (`POST /webhooks/events`).

What happens behind the scenes:

1. **Rate limit check** — is the global rate limit exceeded?
2. **DTO validation** — are all required fields present (`sourceId`, `cycleId`, `eventType`, `payload`)?
3. **Mapping lookup** — find the active mapping for `shopify` + `order.created`
4. **Deduplication** — has this `sourceEventId` been seen before?
5. **Normalization** — apply field mappings to transform the payload
6. **Persist** — save the event (raw + normalized) to PostgreSQL
7. **Publish** — send the normalized event to RabbitMQ

Expected response (202 Accepted):

```json
{
  "eventId": "550e8400-...",
  "correlationId": "req-...",
  "status": "published"
}
```

The test script saves `eventId` to the collection variable.

#### Testing deduplication

Run **`Send Event — Duplicate`** twice:
- First time: `202 Accepted` with `status: "published"`
- Second time: `200 OK` with `status: "duplicate"`

#### Testing error cases

- **Missing mapping**: Run `Send Event — Missing mapping` → `422` with error `EIS-014`
- **Invalid body**: Run `Send Event — Invalid body` → `400` with validation errors

---

### Step 4 — Query ingested events

After sending events, verify they were stored correctly.

Run **`3. Events > List Events (all)`** (`GET /events`) to see all events.

Run **`3. Events > Get Event by ID`** (`GET /events/:eventId`) to see the full event including `rawPayload` and `normalizedPayload`.

#### Available filters

| Parameter | Example | Description |
|---|---|---|
| `sourceId` | `shopify` | Filter by source system |
| `eventType` | `order.created` | Filter by event type |
| `status` | `received` | Filter by processing status |
| `from` | `2026-02-24T00:00:00Z` | Events created after this date |
| `to` | `2026-02-25T00:00:00Z` | Events created before this date |
| `page` | `1` | Page number (default: 1) |
| `limit` | `20` | Results per page (default: 50, max: 200) |

---

### Step 5 — Clean up (optional)

Run **`1. Event Mappings > Delete Mapping`** (`DELETE /api/v1/event-mappings/:id`) to soft-delete the mapping.

This sets `isActive = false`. The mapping remains in the database but won't match new events.

---

## Monitoring

### Prometheus Metrics

Run **`0. Health & Metrics > Prometheus Metrics`** (`GET /metrics`) to see counters and histograms:

| Metric | Description |
|---|---|
| `eis_events_received_total` | Total events received (by source) |
| `eis_events_normalized_total` | Successfully normalized events |
| `eis_events_duplicate_total` | Duplicate events detected |
| `eis_normalization_duration_seconds` | Normalization processing time |
| `eis_rate_limit_rejections_total` | Rate limit rejections |

---

## Full Workflow Summary

```
                          ┌──────────────────────┐
                          │  1. Create Mapping    │
                          │  POST /api/v1/        │
                          │   event-mappings      │
                          └──────────┬───────────┘
                                     │
                          ┌──────────▼───────────┐
                          │  2. Test Mapping      │
                          │  POST /api/v1/        │
                          │   event-mappings/     │
                          │   :id/test            │
                          └──────────┬───────────┘
                                     │
                          ┌──────────▼───────────┐
                          │  3. Send Event        │
                          │  POST /webhooks/      │
                          │   events              │
                          └──────────┬───────────┘
                                     │
                     ┌───────────────┼───────────────┐
                     │               │               │
              ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐
              │  Validate   │ │  Normalize  │ │  Publish    │
              │  + Dedup    │ │  (mapping)  │ │  (RabbitMQ) │
              └─────────────┘ └─────────────┘ └─────────────┘
                                     │
                          ┌──────────▼───────────┐
                          │  4. Query Events      │
                          │  GET /events          │
                          │  GET /events/:id      │
                          └──────────────────────┘
```

---

## Error Code Quick Reference

| Code | HTTP | Meaning |
|---|---|---|
| EIS-001 | 400 | Invalid request body |
| EIS-002 | 404 | Mapping not found (by ID) |
| EIS-004 | 200 | Duplicate event (already processed) |
| EIS-005 | 422 | Payload validation failed (JSON Schema) |
| EIS-009 | 409 | Mapping conflict (duplicate source+eventType) |
| EIS-010 | 400 | Invalid UUID format |
| EIS-014 | 422 | No active mapping for source+eventType |
| EIS-015 | 404 | Event not found |
| EIS-016 | 422 | Normalization failed |
| EIS-017 | 429 | Rate limit exceeded |
| EIS-018 | 500 | RabbitMQ publish failed |

---

## Tips

- **sourceEventId uniqueness**: The Postman requests use `{{$timestamp}}` in `sourceEventId` so each send is unique. Remove it if you want to test deduplication.
- **Priority**: Set `priority: "critical"` on a mapping to route events to the priority queue for faster processing.
- **Validation schemas**: Use `validationSchema` on mappings to reject malformed payloads before normalization.
- **Dot-path notation**: Field mappings support nested extraction — `"customer.id"` extracts `payload.customer.id`. Array index access works too: `"items.0.sku"`.
- **Auth headers**: The webhook endpoint supports `X-API-Key`, `Authorization: Bearer`, and `X-Signature` (HMAC). Auth is currently disabled in the controller, but the headers are included (disabled) in the collection for when it's enabled.
