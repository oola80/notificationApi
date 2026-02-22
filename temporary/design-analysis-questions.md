# Notification API — Design Analysis

**Date:** 2026-02-21
**Scope:** All microservices

---

## Question 1: Transactional Forecast & Maximum TPS

### What estimates exist today

The documentation provides **database growth projections** (in `02-detailed-microservices.md` Section 12 — Schema Overview), but does **not** state an explicit TPS target or benchmark figure anywhere in the design docs.

#### Documented Year 1 Growth Estimates

| Schema | Est. Size (Year 1) | Monthly Growth |
|---|---|---|
| `event_ingestion_service` | ~50 GB | ~5 GB/month |
| `notification_engine_service` | ~80 GB | ~8 GB/month |
| `channel_router_service` | ~60 GB | ~6 GB/month |
| `audit_service` | ~120 GB | ~12 GB/month |
| `email_ingest_service` | ~20 GB | ~2 GB/month |
| `bulk_upload_service` | ~5 GB | ~500 MB/month |
| `notification_gateway` | ~1 GB | ~100 MB/month |
| `template_service` | ~500 MB | Minimal |
| `admin_service` | ~100 MB | Minimal |
| **Total** | **~337 GB** | **~34 GB/month** |

### Reverse-engineering the implied TPS

The docs never state a TPS figure. However, we can work backwards from the storage growth and RabbitMQ configuration:

**From the `events` table growth (~5 GB/month):**

- Assuming an average event row of ~2-5 KB (raw + normalized JSONB payloads, metadata columns), ~5 GB/month translates to roughly **1M - 2.5M events/month**, or **~23-58 events/minute** sustained average (~0.4-1.0 events/second).
- This is a relatively modest throughput, consistent with an eCommerce operation processing order lifecycle notifications (order placed, shipped, delivered, etc.) rather than a high-frequency ad-tech or IoT platform.

**From the `notifications` table growth (~8 GB/month, ~6 GB/month for `notifications` specifically per doc 08):**

- The notification engine doc states `~6 GB/month, ~72 GB/year` for the `notifications` table, implying a multiplier of roughly 1.2-1.6x from events to notifications (one event may generate multiple notification rows — one per channel per recipient).

**From RabbitMQ consumer configuration (`03-system-architecture.md` Section 5.2):**

| Queue | Consumers | Prefetch |
|---|---|---|
| `q.engine.events.critical` | 4 | 10 |
| `q.engine.events.normal` | 2 | 10 |
| `q.deliver.email.critical` | 3 | 5 |
| `q.deliver.email.normal` | 2 | 5 |
| `q.deliver.sms.critical` | 2 | 5 |
| `q.deliver.sms.normal` | 1 | 5 |

- With 6 event consumers (4 critical + 2 normal) at prefetch=10, the system can have **60 events in-flight** simultaneously. Assuming ~50ms average processing time per event, this supports ~**1,200 events/second** peak for the Notification Engine alone on a single instance.
- The doc (`08-notification-engine-service.md` Section 15) mentions that throughput "roughly doubles with 2 instances", confirming horizontal scaling is the primary scaling lever.
- The `>1M notifications/day` figure appears in Section 15.3 as the threshold for considering the lightweight `suppression_log` table, implying the "standard" deployment targets below that (~12 notifications/second average).

### Assessment

**The current design does NOT define explicit TPS targets.** The growth estimates are based on assumed eCommerce operational volumes (likely based on current order/shipment volumes from existing source systems) but the specific transactional model (e.g., "X orders/day generating Y notifications across Z channels") is not documented.

### Recommendation

Add a **Capacity Planning** section to `03-system-architecture.md` that explicitly states:

1. **Baseline transactional model** — The expected daily/monthly event volumes and the assumptions behind them (e.g., "10,000 orders/day across all source systems, each generating an average of 3 events (placed, shipped, delivered), with 1.5 notifications per event across email and SMS").
2. **Peak burst profile** — Expected peak-to-average ratio (e.g., flash sales at 10x baseline).
3. **Provider rate limits as the true ceiling** — The system's maximum throughput is ultimately constrained by provider APIs:
   - SendGrid: typically 100 emails/second on a Pro plan
   - Twilio: ~30 SMS/second per number (higher with short codes)
   - FCM: ~500 push/second per project
4. **Target TPS at each tier** — Sustained and burst targets for the ingestion, engine, and delivery layers.

---

## Question 2: Sending Images to Emails, WhatsApp, etc.

### Current State: No Attachment/Media Support

After thorough review of all design documents, database schemas, and API specifications, the platform **does not currently support sending images, files, or media attachments** in any channel. The architecture is built entirely around **text-based templating** using Handlebars.

**What the Template Service currently supports (`02-detailed-microservices.md` Section 5):**
- Email: HTML body with Handlebars variables (images only via external `<img src="URL">` references)
- SMS: Plain text body (160 character limit)
- WhatsApp: Text message with optional tracking URLs
- Push: Title + body + metadata (256 char total)

**Why attachments are absent:**
- No binary payload support in the canonical event schema
- No file/media storage service in the microservices architecture
- Template rendering is pure string interpolation (Handlebars)
- The Channel Router (`02-detailed-microservices.md` Section 6) only sends text payloads to providers

### Recommended Approach: URL-Referenced Media (Hosted Externally)

Rather than building a full media storage service, the most practical approach for an eCommerce notification platform is **URL-referenced media** — the source systems already host product images and documents on their CDNs.

#### How It Would Work

**1. Extend the canonical event schema** to include media references:

```json
{
  "eventId": "...",
  "sourceId": "erp-system-1",
  "eventType": "order.shipped",
  "data": {
    "customerName": "Jane Doe",
    "orderNumber": "ORD-2026-00451",
    "items": [
      {
        "name": "Wireless Headphones",
        "imageUrl": "https://cdn.store.com/products/headphones-200x200.jpg",
        "quantity": 1
      }
    ],
    "invoiceUrl": "https://docs.store.com/invoices/INV-2026-00451.pdf"
  },
  "media": [
    {
      "type": "image",
      "url": "https://cdn.store.com/products/headphones-200x200.jpg",
      "alt": "Wireless Headphones",
      "context": "product-image"
    },
    {
      "type": "document",
      "url": "https://docs.store.com/invoices/INV-2026-00451.pdf",
      "filename": "invoice-ORD-2026-00451.pdf",
      "mimeType": "application/pdf",
      "context": "attachment"
    }
  ]
}
```

**2. Channel-specific rendering in templates:**

| Channel | Image Support | Attachment Support | Implementation |
|---|---|---|---|
| **Email** | Inline images via `<img>` tags with URLs | File attachments via SendGrid API `attachments[]` parameter | Template includes `{{#each media}}` for images; Channel Router attaches documents by downloading from URL and including as MIME multipart |
| **WhatsApp** | Native image messages via Twilio Media URL API | Document messages (PDF, XLSX) via Twilio Media URL | Channel Router sends WhatsApp media message type instead of text when `media` array is present |
| **SMS** | Not supported (text only) | Not supported | Ignore `media` array; optionally append a shortened URL to view online |
| **Push** | Thumbnail via `image` field in FCM payload | Not supported | Channel Router maps first image URL to FCM `notification.image` field |

**3. Template Service changes:**

```handlebars
{{!-- Email template with product images --}}
<table>
  {{#each items}}
  <tr>
    <td>{{#if imageUrl}}<img src="{{imageUrl}}" alt="{{name}}" width="80">{{/if}}</td>
    <td>{{name}} x{{quantity}}</td>
  </tr>
  {{/each}}
</table>

{{!-- Attachments rendered by Channel Router, not template --}}
```

**4. Channel Router changes** (the main modification):

- For **email (SendGrid)**: When the dispatch message includes a `media` array with `context: "attachment"`, the Channel Router downloads the file from the URL (with a size limit, e.g., 10 MB) and includes it in the SendGrid API call as a Base64-encoded attachment.
- For **WhatsApp (Twilio)**: Use Twilio's `MediaUrl` parameter to send image/document messages directly from the source URL (Twilio fetches the media — no download needed by our service).
- For **push (FCM)**: Map the first `type: "image"` media entry to the FCM `notification.image` field for rich notifications.

**5. Considerations:**

- **No internal media storage needed** — source systems own their CDNs; the notification platform references external URLs
- **URL validation** — the Channel Router should validate that media URLs are HTTPS and respond with expected content types before sending
- **Size limits** — enforce per-channel limits (email attachments: 10 MB total; WhatsApp media: 16 MB; push images: 1 MB)
- **Fallback** — if media download fails, send the notification without the attachment rather than failing the entire notification (log the failure for audit)

---

## Question 3: End-to-End Notification Tracking

### Assessment: Yes — The Current Design Supports End-to-End Tracking

The platform has a comprehensive tracing strategy already designed. Here is how it works across the full notification lifecycle:

### Correlation Strategy

Every notification is traceable through **three linked identifiers** that flow across all services:

| Identifier | Generated At | Purpose |
|---|---|---|
| `correlationId` (UUID) | Event Ingestion (at receipt) | Distributed trace ID — links all log entries and service interactions for a single business event |
| `eventId` (UUID) | Event Ingestion (at persistence) | Canonical event identifier — the "source of truth" for what triggered the notification |
| `notificationId` (UUID) | Notification Engine (at notification creation) | Individual notification identifier — tracks per-channel, per-recipient delivery |

### Cross-Service Trace Flow

```
Source System
    │
    ▼
┌─────────────────────────────┐
│   Event Ingestion Service    │  Generates: eventId, correlationId
│   events table               │  Stores: raw_payload, normalized_payload, status
│   Status: received → validated → normalized → published
└─────────────┬───────────────┘
              │ RabbitMQ (xch.events.normalized)
              │ Message carries: eventId, correlationId, data
              ▼
┌─────────────────────────────┐
│   Notification Engine        │  Generates: notificationId (one per channel × recipient)
│   notifications table        │  Stores: eventId, correlationId, channel, status, recipient
│   notification_status_log    │  Stores: every state transition with timestamps
│   Status: PENDING → PROCESSING → RENDERING → DELIVERING → SENT
└─────────────┬───────────────┘
              │ RabbitMQ (xch.notifications.deliver)
              │ Message carries: notificationId, correlationId, channel, rendered content
              ▼
┌─────────────────────────────┐
│   Channel Router Service     │  Tracks: delivery attempts per notification
│   delivery_attempts table    │  Stores: notificationId, channel, attempt_number,
│                              │          provider_response, status
│   Status per attempt: pending → sent / failed (with retry)
└─────────────┬───────────────┘
              │ RabbitMQ (xch.notifications.status)
              │ Provider webhooks (SendGrid, Twilio, FCM)
              ▼
┌─────────────────────────────┐
│   Audit Service              │  Immutable event store
│   audit_events table         │  Stores: notificationId, event_type, actor,
│                              │          metadata, payload_snapshot
│   delivery_receipts table    │  Stores: notificationId, channel, provider,
│                              │          provider_message_id, status (delivered,
│                              │          bounced, opened, clicked)
└─────────────────────────────┘
```

### What Each Service Tracks

**1. Event Ingestion Service** (`07-event-ingestion-service.md` Section 8)
- `events` table records: raw payload, normalized payload, processing status, timestamps
- Status lifecycle: `received` → `validated` → `normalized` → `published` (or `failed` / `duplicate`)
- Deduplication via `(source_id, source_event_id)` unique index

**2. Notification Engine Service** (`08-notification-engine-service.md` Section 12-13)
- `notifications` table: one row per channel per recipient, with full context (event_id, rule_id, template_id, correlation_id, cycle_id)
- `notification_status_log` table: **append-only** log of every state transition with metadata (error details, suppression reasons, latency measurements)
- State machine with 8 defined states: PENDING → PROCESSING → RENDERING → DELIVERING → SENT → DELIVERED / FAILED / SUPPRESSED
- Async status log writes via RabbitMQ so logging never blocks the notification pipeline

**3. Channel Router Service** (`02-detailed-microservices.md` Section 6)
- `delivery_attempts` table: records every delivery attempt with attempt number, provider response, error message, and timestamp
- Retry tracking per channel: Email (5 retries, 42.5 min), SMS (3 retries, 2.5 min), Push (4 retries, 12.5 min)

**4. Audit Service** (`02-detailed-microservices.md` Section 8)
- `audit_events` table: immutable event log with payload snapshots at each lifecycle step
- `delivery_receipts` table: provider-confirmed delivery status (delivered, bounced, opened, clicked) with provider_message_id for cross-referencing
- `notification_analytics` table: pre-aggregated rollups for dashboards

**5. Structured Logging** (`03-system-architecture.md` Section 11)
- All services emit JSON-formatted logs with `correlationId`, service name, timestamp, and log level
- Custom middleware ensures the `correlationId` propagates through all log entries

### End-to-End Query Example

To trace a notification from source to delivery:

```sql
-- 1. Find the source event
SELECT event_id, source_id, event_type, status, correlation_id, created_at
FROM event_ingestion_service.events
WHERE event_id = 'af47ac10b-58cc-4372-a567-0e02b2c3d479';

-- 2. Find all notifications generated from this event
SELECT notification_id, channel, status, recipient_email, priority, created_at
FROM notification_engine_service.notifications
WHERE event_id = 'af47ac10b-58cc-4372-a567-0e02b2c3d479';

-- 3. See the full lifecycle of a specific notification
SELECT from_status, to_status, channel, metadata, created_at
FROM notification_engine_service.notification_status_log
WHERE notification_id = '<notification_id>'
ORDER BY created_at;

-- 4. Check delivery attempts
SELECT channel, attempt_number, status, provider_response, error_message, attempted_at
FROM channel_router_service.delivery_attempts
WHERE notification_id = '<notification_id>'
ORDER BY attempt_number;

-- 5. Check provider-confirmed delivery receipts
SELECT channel, provider, status, provider_message_id, received_at
FROM audit_service.delivery_receipts
WHERE notification_id = '<notification_id>';

-- 6. Full audit trail
SELECT event_type, actor, metadata, created_at
FROM audit_service.audit_events
WHERE notification_id = '<notification_id>'
ORDER BY created_at;
```

### Gaps / Improvement Suggestions

While the tracking design is comprehensive, there are a few areas that could be strengthened:

| Gap | Impact | Suggested Change |
|---|---|---|
| **No unified trace query API** | Administrators must query multiple databases manually to trace a notification end-to-end | Add a `GET /api/v1/notifications/:id/trace` endpoint to the Admin Service or Audit Service that aggregates data from all services into a single timeline view |
| **No `correlationId` on `delivery_attempts`** | The Channel Router `delivery_attempts` table does not include `correlation_id`, requiring a join through `notifications` to correlate | Add `correlation_id UUID` column to `delivery_attempts` table |
| **No `cycle_id` on audit tables** | Business cycle grouping (`cycle_id`) is not propagated to the Audit Service tables, making it harder to trace all notifications for a specific business cycle | Add `cycle_id VARCHAR(255)` column to `audit_events` and `delivery_receipts` tables |
| **Provider webhook tracing** | When a provider (SendGrid/Twilio) sends a delivery status webhook, the mapping from `provider_message_id` back to `notification_id` relies on the Audit Service having stored it — if the initial send didn't record a provider ID, the webhook is orphaned | Ensure Channel Router always stores `provider_message_id` in `delivery_attempts` on successful send, and maintain a lookup index |

---

## Question 4: Table Purpose Descriptions in Database Design Sections

### Current State

The table descriptions in the Database Design sections vary in completeness:

| Document | Tables | Has Purpose Description? |
|---|---|---|
| `07-event-ingestion-service.md` (Section 8) | `events` | No — only column-level descriptions, no table-level purpose sentence |
| | `event_sources` | No |
| | `event_mappings` | No |
| `08-notification-engine-service.md` (Section 12) | `notification_rules` | **Yes** — "Stores notification rule definitions. This table is small (tens to low hundreds of rows) and accessed on every event for rule matching." |
| | `notifications` | **Yes** — "Core notification records. This is the dominant growth table..." |
| | `notification_status_log` | **Yes** — "Append-only log of all notification status transitions. This is the second-largest growth table..." |
| | `notification_recipients` | **Yes** — "Resolved recipients for group and custom recipient types..." |
| | `recipient_groups` | **Yes** — "Named groups of recipients used for bulk internal notifications." |
| | `recipient_group_members` | **Yes** — "Individual members within a recipient group." |
| | `customer_channel_preferences` | **Yes** — "Per-customer per-channel opt-in/opt-out preferences..." |
| | `critical_channel_overrides` | **Yes** — "Configurable rules that force specific channels for specific event types..." |
| `09-bulk-upload-service.md` (Section 9) | `uploads` | **Yes** — "The primary tracking table for file uploads. Each row represents one uploaded XLSX file and its aggregate processing status." |
| | `upload_rows` | **Yes** — "Per-row tracking for each data row in an uploaded XLSX file..." |

### Action Required

Only `07-event-ingestion-service.md` is missing table purpose descriptions. Documents 08 and 09 already include good descriptions. The following purpose lines should be added to **document 07, Section 8**:

#### `events` Table — Add before the column table:

> Immutable record of all ingested events. Each row stores the original source payload and the normalized canonical output, along with processing status and traceability metadata (`event_id`, `correlation_id`, `cycle_id`). This is the **dominant growth table** in the schema (~5 GB/month, ~50 GB/year), with a scheduled payload purge (`purge_event_payloads()`) that NULLs out large JSONB columns after 90 days while preserving event metadata indefinitely for audit and tracing.

#### `event_sources` Table — Add before the column table:

> Registry of authorized external source systems. Each row represents a registered integration point — either a RabbitMQ consumer or webhook endpoint — with its authentication credentials (hashed API keys and signing secrets), connection configuration, and optional per-source rate limiting. This is a low-volume reference table (~tens of rows) that is looked up on every incoming event to validate the source and apply rate limits.

#### `event_mappings` Table — Add before the column table:

> Admin-configured field mapping rules that define how source-specific event payloads are transformed into the flat canonical event format. Each mapping is keyed by `(source_id, event_type)` and specifies field extraction paths, transform functions (13 types including `direct`, `concatenate`, `template`, `dateFormat`, etc.), timestamp normalization, optional JSON Schema validation, and priority tier (`normal`/`critical`). This is a low-volume configuration table (~100-500 rows) that is accessed on every event during normalization — an optional eager cache with event-driven invalidation can be enabled for high-throughput deployments.

---

*Analysis complete. All four questions addressed based on thorough review of all design documentation (01-09), database schema scripts, and CLAUDE.md project context.*
